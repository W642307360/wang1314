import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const serverDir = dirname(fileURLToPath(import.meta.url));
const tempDir = mkdtempSync(join(tmpdir(), "fuchong-mini-test-"));
const port = 31996;
const base = `http://127.0.0.1:${port}`;
const node = process.execPath;
const child = spawn(node, [join(serverDir, "index.mjs")], {
  cwd: dirname(serverDir),
  env: {
    ...process.env,
    PORT: String(port),
    DB_PATH: join(tempDir, "mini.db"),
    ADMIN_INITIAL_PASSWORD: "123456789",
    ADMIN_TOKEN_SECRET: "mini-admin-test-secret",
    MINI_TOKEN_SECRET: "mini-user-test-secret",
    MINI_API_ENABLED: "true",
  },
  stdio: ["ignore", "pipe", "pipe"],
});

const request = async (path, options = {}) => {
  const response = await fetch(`${base}${path}`, options);
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
};
const jsonHeaders = { "content-type": "application/json" };
const waitForHealth = async () => {
  for (let i = 0; i < 80; i += 1) {
    try { if ((await fetch(`${base}/api/health`)).ok) return; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("mini API did not start");
};

test("mini API is isolated, token-bound and shares the existing database", async (t) => {
  await waitForHealth();
  t.after(async () => {
    child.kill();
    await Promise.race([new Promise((resolve) => child.once("exit", resolve)), new Promise((resolve) => setTimeout(resolve, 2000))]);
    rmSync(tempDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });

  const legacyHealth = await request("/api/health");
  assert.deepEqual(legacyHealth.payload, { ok: true, database: true });
  const legacyCategories = await request("/api/categories");
  assert.equal(legacyCategories.response.status, 200);
  assert.ok(Array.isArray(legacyCategories.payload));

  const miniHealth = await request("/api/mini/v1/health");
  assert.equal(miniHealth.payload.ok, true);
  assert.equal(miniHealth.payload.data.payment_enabled, false);

  const adminLogin = await request("/api/admin/login", {
    method: "POST", headers: jsonHeaders, body: JSON.stringify({ username: "admin", password: "123456789" }),
  });
  const adminHeaders = { ...jsonHeaders, authorization: `Bearer ${adminLogin.payload.token}` };
  const pet = await request("/api/admin/pets", {
    method: "POST", headers: adminHeaders,
    body: JSON.stringify({ name: "小程序测试布偶猫", category_id: 1, breed: "布偶猫", price: 6800, stock: 2, status: "published" }),
  });
  assert.equal(pet.response.status, 201);

  const login = await request("/api/mini/v1/auth/login", {
    method: "POST", headers: jsonHeaders, body: JSON.stringify({ code: "test:alice", device_id: "ios-test" }),
  });
  assert.equal(login.response.status, 200);
  const access = login.payload.data.tokens.access_token;
  const refresh = login.payload.data.tokens.refresh_token;
  const authHeaders = { ...jsonHeaders, authorization: `Bearer ${access}` };
  assert.ok(access);
  assert.ok(refresh);

  const otherLogin = await request("/api/mini/v1/auth/login", {
    method: "POST", headers: jsonHeaders, body: JSON.stringify({ code: "test:bob" }),
  });
  assert.notEqual(otherLogin.payload.data.user.id, login.payload.data.user.id);

  const me = await request("/api/mini/v1/me?user_id=1", { headers: authHeaders });
  assert.equal(me.payload.data.id, login.payload.data.user.id);

  const pets = await request("/api/mini/v1/pets?q=布偶猫");
  assert.equal(pets.payload.ok, true);
  assert.ok(pets.payload.data.some((item) => item.id === pet.payload.id));

  const favorite = await request("/api/mini/v1/favorites", {
    method: "POST", headers: authHeaders, body: JSON.stringify({ user_id: otherLogin.payload.data.user.id, pet_id: pet.payload.id }),
  });
  assert.equal(favorite.response.status, 201);
  const favorites = await request("/api/mini/v1/favorites", { headers: authHeaders });
  assert.equal(favorites.payload.data.length, 1);
  const otherFavorites = await request("/api/mini/v1/favorites", { headers: { authorization: `Bearer ${otherLogin.payload.data.tokens.access_token}` } });
  assert.equal(otherFavorites.payload.data.length, 0);

  const address = await request("/api/mini/v1/addresses", {
    method: "POST", headers: authHeaders,
    body: JSON.stringify({ name: "测试用户", phone: "13800000001", province: "上海市", city: "上海市", district: "浦东新区", detail: "测试路1号", is_default: true }),
  });
  assert.equal(address.response.status, 201);

  const orderBody = {
    pet_id: pet.payload.id,
    address_id: address.payload.data.id,
    client_request_id: "mini-order-idempotency-1",
    legal_acceptance: { accepted: true, version: "2026-07-26.2", documents: ["user", "transaction", "purchase", "after_sale", "privacy"] },
  };
  const order = await request("/api/mini/v1/orders", { method: "POST", headers: authHeaders, body: JSON.stringify(orderBody) });
  assert.equal(order.response.status, 201);
  assert.equal(order.payload.data.payment_enabled, false);
  const repeated = await request("/api/mini/v1/orders", { method: "POST", headers: authHeaders, body: JSON.stringify(orderBody) });
  assert.equal(repeated.response.status, 200);
  assert.equal(repeated.payload.data.idempotent, true);

  const refreshed = await request("/api/mini/v1/auth/refresh", {
    method: "POST", headers: jsonHeaders, body: JSON.stringify({ refresh_token: refresh }),
  });
  assert.equal(refreshed.response.status, 200);
  const replay = await request("/api/mini/v1/auth/refresh", {
    method: "POST", headers: jsonHeaders, body: JSON.stringify({ refresh_token: refresh }),
  });
  assert.equal(replay.response.status, 401);
  const refreshedAuthHeaders = { ...jsonHeaders, authorization: `Bearer ${refreshed.payload.data.tokens.access_token}` };

  const serviceMessage = await request("/api/mini/v1/service/messages", {
    method: "POST", headers: refreshedAuthHeaders,
    body: JSON.stringify({ content: "我要退款投诉，宠物有点不舒服", service_type: "售后服务" }),
  });
  assert.equal(serviceMessage.response.status, 201);
  assert.equal(serviceMessage.payload.data.status, "ai", "敏感问题不能自动转专员");
  assert.ok(serviceMessage.payload.data.reply);

  const handoff = await request(`/api/mini/v1/service/sessions/${serviceMessage.payload.data.session_id}/handoff`, {
    method: "POST", headers: refreshedAuthHeaders,
    body: JSON.stringify({ reason: "用户点击专员入口" }),
  });
  assert.equal(handoff.response.status, 200);
  assert.equal(handoff.payload.data.status, "human_pending", "只有显式入口才进入专员队列");
});
