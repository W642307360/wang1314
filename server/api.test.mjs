import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const serverDir = dirname(fileURLToPath(import.meta.url));
const tempDir = mkdtempSync(join(tmpdir(), "fuchong-api-test-"));
const port = 31991;
const base = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, [join(serverDir, "index.mjs")], {
  cwd: dirname(serverDir),
  env: {
    ...process.env,
    PORT: String(port),
    DB_PATH: join(tempDir, "test.db"),
    ADMIN_INITIAL_PASSWORD: "123456789",
    ADMIN_TOKEN_SECRET: "test-only-secret",
  },
  stdio: ["ignore", "pipe", "pipe"],
});

const waitForHealth = async () => {
  for (let i = 0; i < 60; i += 1) {
    try {
      const response = await fetch(`${base}/api/health`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("测试 API 未能启动");
};

const request = async (path, options = {}) => {
  const response = await fetch(`${base}${path}`, options);
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
};

test("用户、商品、订单、支付、物流全链路", async (t) => {
  await waitForHealth();
  t.after(async () => {
    child.kill();
    await Promise.race([
      new Promise((resolve) => child.once("exit", resolve)),
      new Promise((resolve) => setTimeout(resolve, 2000)),
    ]);
    rmSync(tempDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });

  const login = await request("/api/admin/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "123456789" }),
  });
  assert.equal(login.response.status, 200);
  assert.ok(login.payload.token);
  const adminHeaders = {
    authorization: `Bearer ${login.payload.token}`,
    "content-type": "application/json",
  };

  const malformed = await request("/api/admin/stats", {
    headers: { authorization: "Bearer malformed.token" },
  });
  assert.equal(malformed.response.status, 401);

  const pet = await request("/api/admin/pets", {
    method: "POST",
    headers: adminHeaders,
    body: JSON.stringify({
      name: "全链路测试布偶猫",
      category_id: 1,
      breed: "布偶猫",
      price: 6800,
      stock: 1,
      status: "published",
    }),
  });
  assert.equal(pet.response.status, 201);
  assert.ok(pet.payload.id);

  const address = await request("/api/addresses", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      user_id: 1,
      name: "测试用户",
      phone: "13800000000",
      detail: "测试地址一号",
      is_default: true,
    }),
  });
  assert.equal(address.response.status, 201);

  const order = await request("/api/orders", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      user_id: 1,
      pet_id: pet.payload.id,
      address: { name: "测试用户", phone: "13800000000", detail: "测试地址一号" },
    }),
  });
  assert.equal(order.response.status, 201);

  const unpaidShipping = await request(`/api/admin/orders/${order.payload.id}/logistics`, {
    method: "PUT",
    headers: adminHeaders,
    body: JSON.stringify({ company: "顺丰速运", tracking_no: "SFTEST", status: "shipped" }),
  });
  assert.equal(unpaidShipping.response.status, 409);

  const paid = await request("/api/payments/mock", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ order_id: order.payload.id, channel: "test" }),
  });
  assert.equal(paid.response.status, 201);
  const paidAgain = await request("/api/payments/mock", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ order_id: order.payload.id, channel: "test" }),
  });
  assert.equal(paidAgain.response.status, 200);
  assert.equal(paidAgain.payload.idempotent, true);

  const shipped = await request(`/api/admin/orders/${order.payload.id}/logistics`, {
    method: "PUT",
    headers: adminHeaders,
    body: JSON.stringify({
      company: "顺丰速运",
      tracking_no: "SFTEST",
      status: "shipped",
      progress_percent: 50,
      note: "运输中",
    }),
  });
  assert.equal(shipped.response.status, 200);
  assert.equal(shipped.payload.progress_percent, 50);

  const orders = await request("/api/orders?user_id=1");
  const saved = orders.payload.find((item) => item.id === order.payload.id);
  assert.equal(saved.payment_status, "paid");
  assert.equal(saved.logistics_percent, 50);

  const stats = await request("/api/admin/stats", { headers: adminHeaders });
  assert.equal(stats.response.status, 200);
  assert.equal(stats.payload.orders.paid, 1);
});
