import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, unlinkSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const serverDir = dirname(fileURLToPath(import.meta.url));
const projectDir = dirname(serverDir);
const tempDir = mkdtempSync(join(tmpdir(), "fuchong-merchant-test-"));
const port = 31992;
const base = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, [join(serverDir, "index.mjs")], {
  cwd: projectDir,
  env: {
    ...process.env,
    PORT: String(port),
    DB_PATH: join(tempDir, "test.db"),
    ADMIN_INITIAL_PASSWORD: "123456789",
    ADMIN_TOKEN_SECRET: "merchant-test-only-secret",
  },
  stdio: ["ignore", "pipe", "pipe"],
});

const request = async (path, options = {}) => {
  const response = await fetch(`${base}${path}`, options);
  return { response, payload: await response.json().catch(() => ({})) };
};
const jsonOptions = (method, body, token) => ({
  method,
  headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
  body: JSON.stringify(body),
});
const waitForHealth = async () => {
  for (let index = 0; index < 80; index += 1) {
    try { if ((await fetch(`${base}/api/health`)).ok) return; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("商家测试 API 未启动");
};

test("商家审核、同库商品、媒体白底与权限隔离", async (t) => {
  await waitForHealth();
  let uploadedUrl = "";
  t.after(async () => {
    child.kill();
    await Promise.race([
      new Promise((resolve) => child.once("exit", resolve)),
      new Promise((resolve) => setTimeout(resolve, 2000)),
    ]);
    if (uploadedUrl) {
      const storedUrl = /^https?:\/\//.test(uploadedUrl) ? new URL(uploadedUrl).pathname : uploadedUrl;
      const uploadedFile = join(serverDir, "uploads", storedUrl.slice("/uploads/".length));
      const showcaseFile = join(serverDir, "data", "showcase-image-cache", `${createHash("sha256").update(`v3:${storedUrl}`).digest("hex")}.webp`);
      if (existsSync(uploadedFile)) unlinkSync(uploadedFile);
      if (existsSync(showcaseFile)) unlinkSync(showcaseFile);
    }
    rmSync(tempDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });

  const health = await fetch(`${base}/api/health`);
  assert.equal(health.headers.get("x-content-type-options"), "nosniff");
  assert.equal(health.headers.get("x-frame-options"), "DENY");
  const blockedOrigin = await request("/api/health", { headers: { origin: "https://attacker.invalid" } });
  assert.equal(blockedOrigin.response.status, 403);
  const anonymousAdmin = await request("/api/admin/stats");
  assert.equal(anonymousAdmin.response.status, 401);

  const adminLogin = await request("/api/admin/login", jsonOptions("POST", { username: "admin", password: "123456789" }));
  assert.equal(adminLogin.response.status, 200);
  const adminToken = adminLogin.payload.token;
  const approveMerchant = async (suffix, phone) => {
    const application = await request("/api/merchant/applications", jsonOptions("POST", {
      shop_name: `商家测试店${suffix}`, applicant_name: `测试员${suffix}`, contact_phone: phone,
      city: "上海", business_description: "隔离测试商家资料",
    }));
    assert.equal(application.response.status, 201, JSON.stringify(application.payload));
    const approved = await request(`/api/admin/merchant-applications/${application.payload.id}`, jsonOptions("PATCH", {
      status: "approved", admin_reply: "测试审核通过", username: `merchant_test_${suffix}`, password: "MerchantPass998",
    }, adminToken));
    assert.equal(approved.response.status, 200);
    const login = await request("/api/merchant/login", jsonOptions("POST", { username: `merchant_test_${suffix}`, password: "MerchantPass998" }));
    assert.equal(login.response.status, 200);
    return login.payload.token;
  };
  const ownerToken = await approveMerchant("one", "13900001111");
  const otherToken = await approveMerchant("two", "13900002222");

  const created = await request("/api/merchant/products", jsonOptions("POST", {
    name: "商家同库白底测试布偶猫", category_id: 1, breed: "布偶猫", price: 2800,
    stock: 1, description: "商家与管理员共用商品库", status: "published",
  }, ownerToken));
  assert.equal(created.response.status, 201);
  assert.ok(created.payload.seller_id);
  const petId = created.payload.id;

  const imageFile = join(projectDir, "public", "assets", "catalog", "abyssinian-thumb.webp");
  const uploaded = await request("/api/merchant/uploads", jsonOptions("POST", {
    fileName: "merchant-test.webp", type: "image/webp", data: readFileSync(imageFile).toString("base64"),
  }, ownerToken));
  assert.equal(uploaded.response.status, 201);
  uploadedUrl = uploaded.payload.url;
  const disguisedUpload = await request("/api/merchant/uploads", jsonOptions("POST", {
    fileName: "not-an-image.webp", type: "image/webp", data: Buffer.from("not an image").toString("base64"),
  }, ownerToken));
  assert.equal(disguisedUpload.response.status, 400);
  const attached = await request(`/api/merchant/products/${petId}/images`, jsonOptions("POST", {
    url: uploaded.payload.url, type: "main", sort_order: 0,
  }, ownerToken));
  assert.equal(attached.response.status, 201);

  let showcaseStatus = "pending";
  for (let index = 0; index < 80 && showcaseStatus !== "success"; index += 1) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    const products = await request("/api/merchant/products", { headers: { authorization: `Bearer ${ownerToken}` } });
    showcaseStatus = products.payload.find((item) => item.id === petId)?.showcase_status;
  }
  assert.equal(showcaseStatus, "success");

  const publicProducts = await request(`/api/pets?q=${encodeURIComponent("布偶猫")}&page=1&pageSize=50`);
  const publicProduct = publicProducts.payload.find((item) => item.id === petId);
  assert.ok(publicProduct);
  assert.equal(publicProduct.category_name, "猫猫馆");
  assert.equal(publicProduct.showcase_image, `/api/media/product-showcase/${petId}`);
  const original = await fetch(`${base}${publicProduct.image}`);
  const showcase = await fetch(`${base}${publicProduct.showcase_image}`);
  assert.equal(original.status, 200);
  assert.match(original.headers.get("content-type") || "", /^image\//);
  assert.equal(showcase.status, 200);
  assert.equal(showcase.headers.get("content-type"), "image/webp");

  const addedFavorite = await request("/api/favorites", jsonOptions("POST", { user_id: 1, pet_id: petId }));
  assert.equal(addedFavorite.response.status, 201);
  const favorites = await request("/api/favorites?user_id=1");
  assert.equal(favorites.payload.find((item) => item.pet_id === petId)?.showcase_image, publicProduct.showcase_image);
  const addedCart = await request("/api/cart", jsonOptions("POST", { user_id: 1, pet_id: petId, quantity: 1 }));
  assert.equal(addedCart.response.status, 201);
  const cart = await request("/api/cart?user_id=1");
  assert.equal(cart.payload.find((item) => item.pet_id === petId)?.showcase_image, publicProduct.showcase_image);

  const otherEdit = await request(`/api/merchant/products/${petId}`, jsonOptions("PATCH", { price: 1 }, otherToken));
  assert.equal(otherEdit.response.status, 404);
  const merchantAdminAccess = await request("/api/admin/stats", { headers: { authorization: `Bearer ${ownerToken}` } });
  assert.equal(merchantAdminAccess.response.status, 401);

  const changedPassword = await request("/api/admin/change-password", jsonOptions("POST", {
    current_password: "123456789", new_password: "NewAdminPassword998",
  }, adminToken));
  assert.equal(changedPassword.response.status, 200);
  const expiredAdminToken = await request("/api/admin/stats", { headers: { authorization: `Bearer ${adminToken}` } });
  assert.equal(expiredAdminToken.response.status, 401);
  const renewedAdminToken = await request("/api/admin/stats", { headers: { authorization: `Bearer ${changedPassword.payload.token}` } });
  assert.equal(renewedAdminToken.response.status, 200);

  const loginAttempts = [];
  for (let index = 0; index < 8; index += 1)
    loginAttempts.push(await request("/api/admin/login", jsonOptions("POST", { username: "admin", password: "incorrect-password" })));
  assert.equal(loginAttempts.at(-1).response.status, 429);
  assert.ok(Number(loginAttempts.at(-1).response.headers.get("retry-after")) > 0);
});
