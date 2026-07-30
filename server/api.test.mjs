import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const serverDir = dirname(fileURLToPath(import.meta.url));
const tempDir = mkdtempSync(join(tmpdir(), "fuchong-api-test-"));
const port = 31991;
const base = `http://127.0.0.1:${port}`;
const legalAcceptance = { accepted: true, version: "2026-07-26.2", documents: ["user", "transaction", "purchase", "after_sale", "privacy"] };
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
  const databaseStatus = await request("/api/admin/db/status", {
    headers: adminHeaders,
  });
  assert.equal(databaseStatus.response.status, 200);
  assert.equal(databaseStatus.payload.integrity[0].integrity_check, "ok");
  assert.equal(databaseStatus.payload.foreign_key_violations.length, 0);

  const profile = await request("/api/users/1", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ user_id: 1, nickname: "全链路测试用户", avatar: "https://example.com/avatar.webp" }),
  });
  assert.equal(profile.response.status, 200);
  assert.equal(profile.payload.nickname, "全链路测试用户");
  const bindPhone = await request("/api/users/1/bind-phone", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ user_id: 1, phone: "13700000000" }),
  });
  assert.equal(bindPhone.response.status, 200);
  const linkAuth = await request("/api/users/1/auth", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ user_id: 1, auth_type: "wechat", auth_value: "mock-wechat:test-user" }),
  });
  assert.equal(linkAuth.response.status, 200);

  const pet = await request("/api/admin/pets", {
    method: "POST",
    headers: adminHeaders,
    body: JSON.stringify({
      name: "全链路测试布偶猫",
      category_id: 1,
      breed: "布偶猫",
      gender: "母",
      birth_date: "2026-04-18",
      color: "海豹双色",
      body_type: "中型",
      fur_length: "中长毛",
      personality: "温顺亲人",
      health_status: "健康",
      vaccine_record: "基础免疫完成",
      price: 6800,
      stock: 1,
      status: "published",
    }),
  });
  assert.equal(pet.response.status, 201);
  assert.ok(pet.payload.id);
  const bulkOffline = await request("/api/admin/pets/bulk-status", {
    method: "PATCH",
    headers: adminHeaders,
    body: JSON.stringify({ ids: [pet.payload.id], status: "offline" }),
  });
  assert.equal(bulkOffline.response.status, 200);
  assert.equal(bulkOffline.payload.changed, 1);
  const bulkRepublish = await request("/api/admin/pets/bulk-status", {
    method: "PATCH",
    headers: adminHeaders,
    body: JSON.stringify({ ids: [pet.payload.id], status: "published" }),
  });
  assert.equal(bulkRepublish.response.status, 200);
  assert.equal(bulkRepublish.payload.changed, 1);
  const firstImage = await request(`/api/admin/pets/${pet.payload.id}/images`, {
    method: "POST",
    headers: adminHeaders,
    body: JSON.stringify({ url: "https://example.com/first.webp", type: "main", sort_order: 0 }),
  });
  assert.equal(firstImage.response.status, 201);
  const replacedImage = await request(`/api/admin/pets/${pet.payload.id}/images`, {
    method: "POST",
    headers: adminHeaders,
    body: JSON.stringify({ url: "https://example.com/latest.webp", replace_main: true }),
  });
  assert.equal(replacedImage.payload.replaced, true);
  const productMedia = await request(`/api/pets/${pet.payload.id}`);
  assert.equal(productMedia.payload.images[0].url, "https://example.com/latest.webp");
  const productEdit = await request(`/api/admin/pets/${pet.payload.id}`, {
    method: "PATCH",
    headers: adminHeaders,
    body: JSON.stringify({ color: "海豹双色", personality: "温顺亲人" }),
  });
  assert.equal(productEdit.response.status, 200);
  assert.equal(productEdit.payload.color, "海豹双色");
  const inventoryUpdate = await request(
    `/api/admin/pets/${pet.payload.id}/inventory`,
    {
      method: "PATCH",
      headers: adminHeaders,
      body: JSON.stringify({ total_stock: 2 }),
    },
  );
  assert.equal(inventoryUpdate.response.status, 200);
  assert.equal(inventoryUpdate.payload.available_stock, 2);
  const extraPets = [];
  for (const name of ["多收藏测试银渐层", "多收藏测试缅因猫"]) {
    const created = await request("/api/admin/pets", {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({ name, category_id: 1, breed: name.includes("银") ? "银渐层" : "缅因猫", price: 5200, stock: 1, status: "published" }),
    });
    assert.equal(created.response.status, 201);
    extraPets.push(created.payload.id);
  }
  for (const petId of [pet.payload.id, ...extraPets]) {
    const favorite = await request("/api/favorites", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ user_id: 1, pet_id: petId }),
    });
    assert.equal(favorite.response.status, 201);
  }
  const duplicateFavorite = await request("/api/favorites", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ user_id: 1, pet_id: pet.payload.id }),
  });
  assert.equal(duplicateFavorite.payload.count, 3);
  const favorites = await request("/api/favorites?user_id=1");
  assert.deepEqual(new Set(favorites.payload.map((item) => item.pet_id)), new Set([pet.payload.id, ...extraPets]));

  const bulkDeletePet = await request("/api/admin/pets", {
    method: "POST",
    headers: adminHeaders,
    body: JSON.stringify({
      name: "批量安全删除接口测试商品",
      category_id: 1,
      breed: "布偶猫",
      price: 1000,
      stock: 1,
      status: "offline",
    }),
  });
  assert.equal(bulkDeletePet.response.status, 201);
  const unauthorizedBulkDelete = await request("/api/admin/pets/bulk-purge", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ids: [bulkDeletePet.payload.id], dry_run: true }),
  });
  assert.equal(unauthorizedBulkDelete.response.status, 401);
  const bulkDeletePreview = await request("/api/admin/pets/bulk-purge", {
    method: "POST",
    headers: adminHeaders,
    body: JSON.stringify({ ids: [bulkDeletePet.payload.id], dry_run: true }),
  });
  assert.equal(bulkDeletePreview.response.status, 200);
  assert.equal(bulkDeletePreview.payload.purgeable, 1);
  assert.equal(
    (await request(`/api/admin/pets/${bulkDeletePet.payload.id}`, { headers: adminHeaders })).response.status,
    200,
  );
  const unconfirmedBulkDelete = await request("/api/admin/pets/bulk-purge", {
    method: "POST",
    headers: adminHeaders,
    body: JSON.stringify({ ids: [bulkDeletePet.payload.id] }),
  });
  assert.equal(unconfirmedBulkDelete.response.status, 400);
  const confirmedBulkDelete = await request("/api/admin/pets/bulk-purge", {
    method: "POST",
    headers: adminHeaders,
    body: JSON.stringify({
      ids: [bulkDeletePet.payload.id],
      confirmation: "PURGE_SELECTED_PRODUCTS",
    }),
  });
  assert.equal(confirmedBulkDelete.response.status, 200);
  assert.equal(confirmedBulkDelete.payload.purged, 1);
  const productsAfterBulkDelete = await request(
    `/api/admin/pets?with_meta=1&q=${encodeURIComponent("批量安全删除接口测试商品")}`,
    { headers: adminHeaders },
  );
  assert.equal(productsAfterBulkDelete.response.status, 200);
  assert.equal(
    productsAfterBulkDelete.payload.items.some((item) => item.id === bulkDeletePet.payload.id),
    false,
  );

  const cartAdd = await request("/api/cart", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ user_id: 1, pet_id: pet.payload.id, quantity: 1 }),
  });
  assert.equal(cartAdd.response.status, 201);
  const firstPhoneLogin = await request("/api/users/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ phone: "13700000000", login_type: "phone" }),
  });
  const repeatedPhoneLogin = await request("/api/users/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ phone: "13700000000", login_type: "phone" }),
  });
  assert.equal(firstPhoneLogin.payload.id, 1);
  assert.equal(repeatedPhoneLogin.payload.id, 1);
  assert.ok(repeatedPhoneLogin.payload.data_counts.favorites >= 1);
  assert.equal(repeatedPhoneLogin.payload.data_counts.cart, 1);
  const missingIdentity = await request("/api/favorites");
  assert.equal(missingIdentity.response.status, 400);
  const secondUser = await request("/api/users/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ phone: "13600000000", login_type: "phone" }),
  });
  assert.notEqual(secondUser.payload.id, repeatedPhoneLogin.payload.id);
  const secondUserFavorites = await request(`/api/favorites?user_id=${secondUser.payload.id}`);
  const secondUserOrders = await request(`/api/orders?user_id=${secondUser.payload.id}`);
  assert.deepEqual(secondUserFavorites.payload, []);
  assert.deepEqual(secondUserOrders.payload, []);
  const newcomerCoupons = await request(`/api/coupons?user_id=${secondUser.payload.id}`);
  const newcomerCoupon = newcomerCoupons.payload.find((item) => item.code === "NEW_USER_300");
  assert.equal(newcomerCoupon.amount, 300);
  assert.equal(newcomerCoupon.user_status, "available");
  const eligiblePet = await request("/api/admin/pets", {
    method: "POST",
    headers: adminHeaders,
    body: JSON.stringify({
      name: "新人保障边界测试宠物",
      category_id: 1,
      breed: "布偶猫",
      price: 3000,
      stock: 1,
      status: "published",
    }),
  });
  const eligibleQuote = await request(
    `/api/orders/quote?user_id=${secondUser.payload.id}&pet_id=${eligiblePet.payload.id}`,
  );
  assert.equal(eligibleQuote.response.status, 200);
  assert.equal(eligibleQuote.payload.discount_amount, 0);
  assert.equal(eligibleQuote.payload.pet_amount, 3000);
  assert.equal(eligibleQuote.payload.shipping_fee, 350);
  assert.equal(eligibleQuote.payload.guarantee_eligible, true);
  assert.match(eligibleQuote.payload.guarantee_policy, /品种纯正/);
  assert.equal(eligibleQuote.payload.insurance_offer.eligible_now, true);
  assert.ok(eligibleQuote.payload.insurance_offer.deadline);
  const unsignedOrder = await request("/api/orders", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      user_id: secondUser.payload.id,
      pet_id: eligiblePet.payload.id,
      client_request_id: "unsigned-order-must-fail",
      address: { name: "新人", phone: "13600000000", detail: "未签约测试地址" },
    }),
  });
  assert.equal(unsignedOrder.response.status, 428);
  const eligibleOrder = await request("/api/orders", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      user_id: secondUser.payload.id,
      pet_id: eligiblePet.payload.id,
      client_request_id: "eligible-newcomer-order",
      address: { name: "新人", phone: "13600000000", detail: "新人保障测试地址" },
      legal_acceptance: legalAcceptance,
    }),
  });
  assert.equal(eligibleOrder.response.status, 201);
  assert.equal(eligibleOrder.payload.total_amount, 3350);
  assert.equal(eligibleOrder.payload.guarantee_eligible, true);
  const cancelledEligibleOrder = await request(`/api/orders/${eligibleOrder.payload.id}/cancel`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ user_id: secondUser.payload.id }),
  });
  assert.equal(cancelledEligibleOrder.response.status, 200);
  const restoredQuote = await request(
    `/api/orders/quote?user_id=${secondUser.payload.id}&pet_id=${eligiblePet.payload.id}`,
  );
  assert.equal(restoredQuote.payload.discount_amount, 0);
  const stillAvailableCoupons = await request(`/api/coupons?user_id=${secondUser.payload.id}`);
  assert.equal(
    stillAvailableCoupons.payload.find((item) => item.code === "NEW_USER_300").user_status,
    "available",
  );
  const visitor = await request("/api/visitors/session", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: "api-test-guest-merge-token" }),
  });
  const guestCart = await request("/api/cart", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ user_id: visitor.payload.userId, pet_id: extraPets[0], quantity: 1 }),
  });
  assert.equal(guestCart.response.status, 201);
  const mergedLogin = await request("/api/users/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      phone: "13700000000",
      login_type: "phone",
      previous_user_id: visitor.payload.userId,
    }),
  });
  assert.equal(mergedLogin.payload.guest_data_merged, true);
  assert.equal(mergedLogin.payload.data_counts.cart, 2);
  const mergedGuestCart = await request(`/api/cart?user_id=${visitor.payload.userId}`);
  assert.equal(mergedGuestCart.response.status, 400);
  const restoredCart = await request("/api/cart?user_id=1");
  assert.equal(restoredCart.payload.some((item) => item.pet_id === pet.payload.id), true);

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
  const updatedAddress = await request(`/api/addresses/${address.payload.id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      user_id: 1,
      name: "测试用户",
      phone: "13800000000",
      province: "四川省 成都市",
      detail: "测试地址二号",
      is_default: true,
    }),
  });
  assert.equal(updatedAddress.response.status, 200);
  assert.equal(updatedAddress.payload.detail, "测试地址二号");

  const order = await request("/api/orders", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      user_id: 1,
      pet_id: pet.payload.id,
      client_request_id: "api-test-order-request-1",
      address: { name: "测试用户", phone: "13800000000", detail: "测试地址一号" },
      legal_acceptance: legalAcceptance,
    }),
  });
  assert.equal(order.response.status, 201);
  assert.equal(order.payload.discount_amount, 0);
  assert.equal(order.payload.pet_amount, 6800);
  assert.equal(order.payload.guarantee_eligible, false);
  assert.match(order.payload.order_no, /^FC\d{8}-\d{4}$/);
  const changedAfterOrder = await request(`/api/admin/pets/${pet.payload.id}`, {
    method: "PATCH",
    headers: adminHeaders,
    body: JSON.stringify({
      color: "订单后修改毛色",
      vaccine_record: "订单后修改免疫记录",
    }),
  });
  assert.equal(changedAfterOrder.response.status, 200);
  const immutableOrder = await request(`/api/admin/orders/${order.payload.id}`, {
    headers: adminHeaders,
  });
  assert.equal(immutableOrder.response.status, 200);
  const immutablePetSnapshot = JSON.parse(immutableOrder.payload.items[0].pet_snapshot);
  assert.equal(immutablePetSnapshot.color, "海豹双色");
  assert.equal(immutablePetSnapshot.vaccine_record, "基础免疫完成");
  assert.equal(immutablePetSnapshot.birth_date, "2026-04-18");
  assert.equal(immutablePetSnapshot.identity_profile.name, "待宠物主起名");
  const repeatedOrder = await request("/api/orders", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      user_id: 1,
      pet_id: pet.payload.id,
      client_request_id: "api-test-order-request-1",
      address: { name: "测试用户", phone: "13800000000", detail: "测试地址一号" },
      legal_acceptance: legalAcceptance,
    }),
  });
  assert.equal(repeatedOrder.response.status, 200);
  assert.equal(repeatedOrder.payload.id, order.payload.id);
  assert.equal(repeatedOrder.payload.idempotent, true);
  const inventoryBeforePayment = await request(`/api/admin/pets/${pet.payload.id}/inventory`, {
    headers: adminHeaders,
  });
  assert.equal(inventoryBeforePayment.payload[0].available_stock, 2);
  assert.equal(inventoryBeforePayment.payload[0].locked_stock, 0);
  const competingOrder = await request("/api/orders", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      user_id: 1,
      pet_id: pet.payload.id,
      client_request_id: "api-test-competing-unpaid-order",
      address: { name: "测试用户", phone: "13800000000", detail: "测试地址一号" },
      legal_acceptance: legalAcceptance,
    }),
  });
  assert.equal(competingOrder.response.status, 201);

  const unpaidShipping = await request(`/api/admin/orders/${order.payload.id}/logistics`, {
    method: "PUT",
    headers: adminHeaders,
    body: JSON.stringify({ company: "顺丰速运", tracking_no: "SFTEST", status: "shipped" }),
  });
  assert.equal(unpaidShipping.response.status, 409);
  const unpaidPacked = await request(`/api/admin/orders/${order.payload.id}/logistics`, {
    method: "PUT",
    headers: adminHeaders,
    body: JSON.stringify({ company: "顺丰速运", tracking_no: "SFTEST", status: "packed" }),
  });
  assert.equal(unpaidPacked.response.status, 409);

  const declared = await request(`/api/orders/${order.payload.id}/payment-declared`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ user_id: 1 }),
  });
  assert.equal(declared.response.status, 200);
  assert.equal(declared.payload.status, "pending_confirm");
  assert.equal(declared.payload.payment_status, "unpaid", "用户声明已支付不能伪造成真实到账");
  assert.equal(declared.payload.inventory_locked, 0, "管理员核实前不能锁库存");
  const declaredAgain = await request(`/api/orders/${order.payload.id}/payment-declared`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ user_id: 1 }),
  });
  assert.equal(declaredAgain.response.status, 200);
  assert.equal(declaredAgain.payload.idempotent, true);
  const inventoryAfterDeclaration = await request(`/api/admin/pets/${pet.payload.id}/inventory`, {
    headers: adminHeaders,
  });
  assert.equal(inventoryAfterDeclaration.payload[0].available_stock, 2);
  assert.equal(inventoryAfterDeclaration.payload[0].locked_stock, 0);

  const paid = await request(`/api/admin/orders/${order.payload.id}/payment`, {
    method: "POST",
    headers: adminHeaders,
    body: JSON.stringify({ method: "admin_manual", note: "管理员核实到账" }),
  });
  assert.equal(paid.response.status, 200);
  assert.equal(paid.payload.status, "pending_confirm");
  assert.equal(paid.payload.pet_insurance_eligible, 1, "发布24小时内由管理员确认到账应获赠保险");
  assert.ok(paid.payload.pet_insurance_confirmed_at);
  assert.deepEqual(paid.payload.sold_pet_ids, [pet.payload.id]);
  const paidAgain = await request(`/api/admin/orders/${order.payload.id}/payment`, {
    method: "POST",
    headers: adminHeaders,
    body: JSON.stringify({ method: "admin_manual", note: "重复核实到账" }),
  });
  assert.equal(paidAgain.response.status, 200);
  assert.equal(paidAgain.payload.idempotent, true);
  assert.deepEqual(paidAgain.payload.sold_pet_ids, [pet.payload.id]);
  const soldProduct = await request(`/api/pets/${pet.payload.id}`);
  assert.equal(soldProduct.response.status, 200);
  assert.equal(soldProduct.payload.status, "sold");
  assert.equal(soldProduct.payload.product_status, "sold");
  const soldProductInventory = await request(`/api/admin/pets/${pet.payload.id}/inventory`, {
    headers: adminHeaders,
  });
  assert.equal(soldProductInventory.payload[0].locked_stock, 1);
  assert.equal(soldProductInventory.payload[0].available_stock, 1);
  const competingPayment = await request(`/api/admin/orders/${competingOrder.payload.id}/payment`, {
    method: "POST",
    headers: adminHeaders,
    body: JSON.stringify({ method: "admin_manual", note: "竞争订单确认" }),
  });
  assert.equal(competingPayment.response.status, 409);
  const cancelCompetingOrder = await request(`/api/orders/${competingOrder.payload.id}/cancel`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ user_id: 1 }),
  });
  assert.equal(cancelCompetingOrder.response.status, 200);
  const inventoryAfterCompetingCancel = await request(`/api/admin/pets/${pet.payload.id}/inventory`, {
    headers: adminHeaders,
  });
  assert.equal(inventoryAfterCompetingCancel.payload[0].available_stock, 1);
  assert.equal(inventoryAfterCompetingCancel.payload[0].locked_stock, 1);

  const confirmedOrder = await request(`/api/admin/orders/${order.payload.id}/confirm`, {
    method: "POST",
    headers: adminHeaders,
  });
  assert.equal(confirmedOrder.response.status, 200);
  assert.equal(confirmedOrder.payload.status, "pending_ship");
  const repeatedConfirmations = await Promise.all(
    Array.from({ length: 3 }, () => request(`/api/admin/orders/${order.payload.id}/confirm`, {
      method: "POST",
      headers: adminHeaders,
    })),
  );
  assert.equal(repeatedConfirmations.every((item) => item.response.status === 200), true);
  assert.equal(repeatedConfirmations.every((item) => item.payload.idempotent === true), true);

  const packed = await request(`/api/admin/orders/${order.payload.id}/logistics`, {
    method: "PUT",
    headers: adminHeaders,
    body: JSON.stringify({
      company: "顺丰速运",
      tracking_no: "SFTEST",
      status: "packed",
      note: "发货前宠物实拍检验",
    }),
  });
  assert.equal(packed.response.status, 200);
  assert.equal(packed.payload.progress_percent, 25);
  assert.ok(packed.payload.event_id);
  const onePixelPng = await sharp({
    create: { width: 16, height: 16, channels: 3, background: "#c79b72" },
  }).png().toBuffer();
  const inspectionUpload = await request(
    `/api/admin/orders/${order.payload.id}/logistics-events/${packed.payload.event_id}/media`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${login.payload.token}`,
        "content-type": "image/png",
        "x-file-name": encodeURIComponent("发货实拍.png"),
      },
      body: onePixelPng,
    },
  );
  assert.equal(inspectionUpload.response.status, 202);
  let inspectionMedia = null;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const detail = await request(`/api/admin/orders/${order.payload.id}`, { headers: adminHeaders });
    inspectionMedia = detail.payload.logistics_events
      ?.find((event) => event.id === packed.payload.event_id)
      ?.media?.[0];
    if (inspectionMedia?.processing_status !== "processing") break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.equal(
    inspectionMedia?.processing_status,
    "ready",
    inspectionMedia?.processing_error || "实拍图片应处理成功",
  );
  assert.match(inspectionMedia?.display_url || "", /inspection-\d+-display\.webp$/);
  const userOrderListWithInspection = await request("/api/orders?user_id=1");
  const listedInspectionOrder = userOrderListWithInspection.payload.find(
    (item) => Number(item.id) === Number(order.payload.id),
  );
  assert.equal(Array.isArray(listedInspectionOrder.inspection_media), true);
  assert.equal(listedInspectionOrder.inspection_media.length, 1);
  assert.equal(listedInspectionOrder.inspection_media[0].processing_status, "ready");

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
  const repeatedShipping = await request(`/api/admin/orders/${order.payload.id}/logistics`, {
    method: "PUT",
    headers: adminHeaders,
    body: JSON.stringify({
      company: "顺丰速运",
      tracking_no: "SFTEST",
      status: "shipped",
      progress_percent: 50,
      note: "重复回调不重复写事件",
    }),
  });
  assert.equal(repeatedShipping.response.status, 200);
  const regressedShipping = await request(`/api/admin/orders/${order.payload.id}/logistics`, {
    method: "PUT",
    headers: adminHeaders,
    body: JSON.stringify({ company: "顺丰速运", tracking_no: "SFTEST", status: "packed" }),
  });
  assert.equal(regressedShipping.response.status, 409);

  const orders = await request("/api/orders?user_id=1");
  const saved = orders.payload.find((item) => item.id === order.payload.id);
  assert.equal(saved.payment_status, "paid");
  assert.equal(saved.logistics_percent, 50);
  const orderDetail = await request(
    `/api/orders/${order.payload.id}?user_id=1`,
  );
  assert.equal(orderDetail.response.status, 200);
  assert.equal(orderDetail.payload.logistics_events.length, 2);
  assert.equal(orderDetail.payload.logistics_events[0].media[0].processing_status, "ready");
  const userSummary = await request("/api/users/1/summary");
  assert.equal(userSummary.response.status, 200);
  assert.equal(userSummary.payload.orders.shipped, 1);
  assert.ok(orderDetail.payload.status_history.length >= 2);
  const review = await request(`/api/pets/${pet.payload.id}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      user_id: 1,
      rating: 5,
      content: "商品资料真实，购买和饲养指导都很清楚。",
      images: ["https://example.com/review.webp"],
    }),
  });
  assert.equal(review.response.status, 201);
  assert.equal(review.payload.verified, true);
  const likedReview = await request(`/api/reviews/${review.payload.id}/like`, {
    method: "POST",
  });
  assert.equal(likedReview.payload.likes, 1);
  const reviewedPet = await request(`/api/pets/${pet.payload.id}`);
  assert.equal(reviewedPet.payload.reviews.length, 1);
  const generatedReviews = await request("/api/admin/reviews/generate", {
    method: "POST",
    headers: adminHeaders,
    body: JSON.stringify({ pet_id: pet.payload.id, count: 42 }),
  });
  assert.equal(generatedReviews.response.status, 201);
  assert.equal(generatedReviews.payload.count, 25);
  const petWithGeneratedReviews = await request(`/api/pets/${pet.payload.id}`);
  assert.equal(petWithGeneratedReviews.payload.review_count, 25);
  assert.equal(petWithGeneratedReviews.payload.reviews.length, 25);
  assert.equal(petWithGeneratedReviews.payload.reviews.some((item) => item.source === "generated"), true);
  const afterSale = await request("/api/after-sales", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      user_id: 1,
      order_id: order.payload.id,
      type: "refund",
      reason: "自动化售后测试",
      amount: 6800,
    }),
  });
  assert.equal(afterSale.response.status, 201);
  const adminAfterSales = await request("/api/admin/after-sales", {
    headers: adminHeaders,
  });
  assert.equal(
    adminAfterSales.payload.some((item) => item.id === afterSale.payload.id),
    true,
  );

  const stats = await request("/api/admin/stats", { headers: adminHeaders });
  assert.equal(stats.response.status, 200);
  assert.equal(stats.payload.orders.paid, 1);
  assert.equal(stats.payload.trends.length, 7);
  assert.equal(stats.payload.trends.every((item) => "paid_orders" in item && "revenue" in item), true);
  const resolvedAfterSale = await request(
    `/api/admin/after-sales/${afterSale.payload.id}`,
    {
      method: "PATCH",
      headers: adminHeaders,
      body: JSON.stringify({ status: "completed", result: "自动化退款完成" }),
    },
  );
  assert.equal(resolvedAfterSale.response.status, 200);
  assert.equal(resolvedAfterSale.payload.order.payment_status, "refunded");
  assert.equal(resolvedAfterSale.payload.order.refund_status, "completed");
  const refundedDetail = await request(`/api/orders/${order.payload.id}?user_id=1`);
  assert.equal(refundedDetail.payload.after_sales[0].status, "completed");
  assert.equal(
    refundedDetail.payload.payments.some((item) => item.status === "refunded"),
    true,
  );
  const refundedInventory = await request(`/api/admin/pets/${pet.payload.id}/inventory`, {
    headers: adminHeaders,
  });
  assert.equal(refundedInventory.payload[0].locked_stock, 0);

  const oneClickPet = await request("/api/admin/pets", {
    method: "POST",
    headers: adminHeaders,
    body: JSON.stringify({
      name: "后台一键确认测试宠物",
      category_id: 1,
      breed: "金渐层",
      gender: "公",
      description: "飞书原文详情：性格亲人，基础免疫完成，适合家庭陪伴。",
      price: 5200,
      stock: 1,
      status: "published",
    }),
  });
  assert.equal(oneClickPet.response.status, 201);
  const oneClickOrder = await request("/api/orders", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      user_id: secondUser.payload.id,
      pet_id: oneClickPet.payload.id,
      client_request_id: "admin-one-click-confirm-order",
      address: { name: "一键确认用户", phone: "13600000000", detail: "测试地址三号" },
      legal_acceptance: legalAcceptance,
    }),
  });
  assert.equal(oneClickOrder.response.status, 201);
  const oneClickBeforeConfirm = await request(`/api/admin/orders/${oneClickOrder.payload.id}`, {
    headers: adminHeaders,
  });
  assert.equal(oneClickBeforeConfirm.payload.status, "pending_payment");
  const oneClickConfirmed = await request(`/api/admin/orders/${oneClickOrder.payload.id}/confirm`, {
    method: "POST",
    headers: adminHeaders,
  });
  assert.equal(oneClickConfirmed.response.status, 200);
  assert.equal(oneClickConfirmed.payload.payment_status, "paid");
  assert.equal(oneClickConfirmed.payload.status, "pending_ship");
  assert.ok(oneClickConfirmed.payload.payment_no);
  assert.deepEqual(oneClickConfirmed.payload.sold_pet_ids, [oneClickPet.payload.id]);
  const oneClickDetail = await request(`/api/admin/orders/${oneClickOrder.payload.id}`, {
    headers: adminHeaders,
  });
  const oneClickSnapshot = JSON.parse(oneClickDetail.payload.items[0].pet_snapshot);
  assert.match(oneClickSnapshot.description, /飞书原文详情/);
  const adminOrderListWithSnapshot = await request("/api/admin/orders", { headers: adminHeaders });
  const listedOneClickOrder = adminOrderListWithSnapshot.payload.find(
    (item) => Number(item.id) === Number(oneClickOrder.payload.id),
  );
  assert.match(JSON.parse(listedOneClickOrder.pet_snapshot).description, /飞书原文详情/);
  const oneClickUserDetail = await request(
    `/api/orders/${oneClickOrder.payload.id}?user_id=${secondUser.payload.id}`,
  );
  assert.equal(oneClickUserDetail.payload.payments.filter((payment) => payment.status === "paid").length, 1);
  const oneClickRepeat = await request(`/api/admin/orders/${oneClickOrder.payload.id}/confirm`, {
    method: "POST",
    headers: adminHeaders,
  });
  assert.equal(oneClickRepeat.response.status, 200);
  assert.equal(oneClickRepeat.payload.idempotent, true);
  const oneClickRepeatDetail = await request(
    `/api/orders/${oneClickOrder.payload.id}?user_id=${secondUser.payload.id}`,
  );
  assert.equal(oneClickRepeatDetail.payload.payments.filter((payment) => payment.status === "paid").length, 1);

  const feishuConfig = await request("/api/admin/feishu/configs", {
    method: "POST",
    headers: adminHeaders,
    body: JSON.stringify({
      name: "临时测试数据源",
      document_url: "https://example.feishu.cn/base/test",
      app_id: "cli_test",
      table_id: "tbl_test",
      field_mapping: { name: "宠物名称", breed: "品种" },
    }),
  });
  assert.equal(feishuConfig.response.status, 201);
  const sync = await request("/api/admin/feishu/sync", {
    method: "POST",
    headers: adminHeaders,
    body: JSON.stringify({
      config_id: feishuConfig.payload.id,
      batch_size: 100,
      total: 5000,
    }),
  });
  assert.equal(sync.response.status, 202);
  let syncTask;
  for (let i = 0; i < 240; i += 1) {
    const tasks = await request("/api/admin/feishu/tasks", { headers: adminHeaders });
    syncTask = tasks.payload.find((item) => item.id === sync.payload.taskId);
    if (["completed", "failed"].includes(syncTask?.status)) break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.equal(syncTask.status, "completed");
  assert.equal(syncTask.success, 5000);
  assert.equal(syncTask.failed, 0);
  assert.equal(syncTask.persisted_items, 5000);
  assert.equal(syncTask.persisted_success, 5000);
  assert.equal(syncTask.persisted_failed, 0);
  assert.equal(syncTask.identity_total, 5000);
  assert.equal(syncTask.identity_processed, 5000);
  assert.equal(syncTask.identity_success, 5000);
  assert.equal(syncTask.identity_failed, 0);
  assert.equal(syncTask.identity_skipped, 0);
  const profileDefaultsSync = await request("/api/admin/feishu/sync", {
    method: "POST",
    headers: adminHeaders,
    body: JSON.stringify({
      config_id: feishuConfig.payload.id,
      batch_size: 3,
      items: [
        { external_id: "profile-small", name: "体型识别小宠样本", breed: "测试犬", description: "活泼亲人，属于迷你小型犬体态", price: 1000, status: "published", source: "feishu" },
        { external_id: "profile-large", name: "体型识别大宠样本", breed: "测试犬", description: "骨架舒展，是大型犬体型", price: 1000, status: "published", source: "feishu" },
        { external_id: "profile-default", name: "体型默认中宠样本", breed: "测试犬", description: "性格温顺，没有填写体型文字", price: 1000, status: "published", source: "feishu" },
      ],
    }),
  });
  assert.equal(profileDefaultsSync.response.status, 202);
  let profileDefaultsTask;
  for (let i = 0; i < 80; i += 1) {
    const tasks = await request("/api/admin/feishu/tasks", { headers: adminHeaders });
    profileDefaultsTask = tasks.payload.find((item) => item.id === profileDefaultsSync.payload.taskId);
    if (["completed", "completed_with_warnings", "failed"].includes(profileDefaultsTask?.status)) break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.equal(profileDefaultsTask.status, "completed");
  const profileDefaults = await request("/api/admin/pets?q=体型", { headers: adminHeaders });
  const byProfileName = Object.fromEntries(profileDefaults.payload.map((item) => [item.name, item]));
  assert.equal(byProfileName["体型识别小宠样本"].body_type, "小型");
  assert.equal(byProfileName["体型识别大宠样本"].body_type, "大型");
  assert.equal(byProfileName["体型默认中宠样本"].body_type, "中型");
  assert.equal(byProfileName["体型默认中宠样本"].health_status, "健康");
  const originalIdentityDetail = await request(`/api/pets/${byProfileName["体型默认中宠样本"].id}`);
  assert.equal(originalIdentityDetail.response.status, 200);
  assert.equal(originalIdentityDetail.payload.identity_profile.gender, "待核验");
  assert.equal(originalIdentityDetail.payload.identity_profile.color, "自然综合色");
  assert.match(originalIdentityDetail.payload.identity_profile.identityNo, /^FC-D\d{6}-\d{2}$/);
  const originalIdentityNo = originalIdentityDetail.payload.identity_profile.identityNo;
  const originalChipNo = originalIdentityDetail.payload.identity_profile.chipNo;
  const identityResync = await request("/api/admin/feishu/sync", {
    method: "POST",
    headers: adminHeaders,
    body: JSON.stringify({
      config_id: feishuConfig.payload.id,
      batch_size: 1,
      items: [{
        external_id: "profile-default",
        name: "体型默认中宠样本（更新）",
        breed: "测试犬",
        description: "仍未填写体型文字",
        color: "暖棕色",
        price: 1000,
        status: "published",
        source: "feishu",
      }],
    }),
  });
  for (let i = 0; i < 80; i += 1) {
    const tasks = await request("/api/admin/feishu/tasks", { headers: adminHeaders });
    const task = tasks.payload.find((item) => item.id === identityResync.payload.taskId);
    if (["completed", "completed_with_warnings", "failed"].includes(task?.status)) break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  const updatedIdentityDetail = await request(`/api/pets/${byProfileName["体型默认中宠样本"].id}`);
  assert.equal(updatedIdentityDetail.payload.identity_profile.identityNo, originalIdentityNo);
  assert.equal(updatedIdentityDetail.payload.identity_profile.chipNo, originalChipNo);
  assert.equal(updatedIdentityDetail.payload.identity_profile.color, "暖棕色");
  const mediaSync = await request("/api/admin/feishu/sync", {
    method: "POST",
    headers: adminHeaders,
    body: JSON.stringify({
      config_id: feishuConfig.payload.id,
      batch_size: 100,
      items: [{
        external_id: "multi-media-1", name: "飞书多媒体测试宠物", breed: "布偶猫", category_id: 1,
        price: 6900, stock: 1,
        images: ["https://example.com/1.jpg", "https://example.com/2.jpg", "https://example.com/3.jpg", "https://example.com/4.jpg"],
        videos: ["https://example.com/1.mp4", "https://example.com/2.mp4"],
      }],
    }),
  });
  for (let i = 0; i < 40; i += 1) {
    const tasks = await request("/api/admin/feishu/tasks", { headers: adminHeaders });
    const task = tasks.payload.find((item) => item.id === mediaSync.payload.taskId);
    if (task?.status === "completed") break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  const syncedPets = await request("/api/admin/pets", { headers: adminHeaders });
  const syncedMediaPet = syncedPets.payload.find((item) => item.external_id === "multi-media-1");
  const syncedMediaDetail = await request(`/api/pets/${syncedMediaPet.id}`);
  assert.equal(syncedMediaDetail.payload.images.length, 4);
  assert.equal(syncedMediaDetail.payload.videos.length, 2);

  const sharedShowcaseSource = join(
    dirname(serverDir),
    "public",
    "assets",
    "catalog",
    "devon-rex.webp",
  );
  const showcaseSync = await request("/api/admin/feishu/sync", {
    method: "POST",
    headers: adminHeaders,
    body: JSON.stringify({
      config_id: feishuConfig.payload.id,
      batch_size: 100,
      items: Array.from({ length: 500 }, (_, index) => ({
        external_id: `showcase-stress-${index + 1}`,
        name: `白底轮廓压力测试 ${index + 1}`,
        breed: "德文卷毛猫",
        category_id: 1,
        price: 3900 + index,
        stock: 1,
        images: [sharedShowcaseSource],
      })),
    }),
  });
  assert.equal(showcaseSync.response.status, 202);
  let showcaseTask;
  for (let i = 0; i < 400; i += 1) {
    const tasks = await request("/api/admin/feishu/tasks", { headers: adminHeaders });
    showcaseTask = tasks.payload.find((item) => item.id === showcaseSync.payload.taskId);
    if (["completed", "completed_with_warnings", "failed"].includes(showcaseTask?.status)) break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.equal(showcaseTask.status, "completed");
  assert.equal(showcaseTask.processed, 500);
  assert.equal(showcaseTask.success, 500);
  assert.equal(showcaseTask.media_total, 500);
  assert.equal(showcaseTask.media_processed, 500);
  assert.equal(showcaseTask.media_success, 500);
  assert.equal(showcaseTask.media_failed, 0);
  assert.equal(showcaseTask.identity_total, 500);
  assert.equal(showcaseTask.identity_processed, 500);
  assert.equal(showcaseTask.identity_success, 500);
  assert.equal(showcaseTask.identity_failed, 0);

  const banner = await request("/api/admin/banners", {
    method: "POST",
    headers: adminHeaders,
    body: JSON.stringify({ title: "测试 Banner", image: "https://example.com/test.webp" }),
  });
  assert.equal(banner.response.status, 201);
  const bannerPatch = await request(`/api/admin/banners/${banner.payload.id}`, {
    method: "PATCH",
    headers: adminHeaders,
    body: JSON.stringify({ status: "inactive" }),
  });
  assert.equal(bannerPatch.response.status, 200);
  const bannerDelete = await request(`/api/admin/banners/${banner.payload.id}`, {
    method: "DELETE",
    headers: adminHeaders,
  });
  assert.equal(bannerDelete.response.status, 200);

  const coupon = await request("/api/admin/coupons", {
    method: "POST",
    headers: adminHeaders,
    body: JSON.stringify({
      title: "自动化满减券",
      amount: 100,
      threshold: 1000,
      expires_at: "2030-12-31",
    }),
  });
  assert.equal(coupon.response.status, 201);
  const issueCoupon = await request(
    `/api/admin/coupons/${coupon.payload.id}/issue`,
    {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({ user_id: 1 }),
    },
  );
  assert.equal(issueCoupon.response.status, 201);
  const userCoupons = await request("/api/coupons?user_id=1");
  assert.equal(
    userCoupons.payload.some((item) => item.id === coupon.payload.id),
    true,
  );
  const invalidUpload = await request("/api/admin/uploads", {
    method: "POST",
    headers: adminHeaders,
    body: JSON.stringify({ fileName: "dangerous.exe", data: "AA==" }),
  });
  assert.equal(invalidUpload.response.status, 400);

  const pagedProducts = await request(
    "/api/admin/pets?with_meta=1&page=2&pageSize=25&q=白底轮廓压力测试",
    { headers: adminHeaders },
  );
  assert.equal(pagedProducts.response.status, 200);
  assert.equal(Array.isArray(pagedProducts.payload.items), true);
  assert.ok(pagedProducts.payload.items.length <= 25);
  assert.ok(pagedProducts.payload.total > 0);
  assert.equal(pagedProducts.payload.page, 2);
  assert.equal(pagedProducts.payload.page_size, 25);

  const purgeCandidate = await request("/api/admin/pets", {
    method: "POST",
    headers: adminHeaders,
    body: JSON.stringify({
      name: "无业务引用安全删除测试",
      category_id: 1,
      breed: "测试品种",
      price: 1000,
      stock: 1,
      status: "offline",
    }),
  });
  assert.equal(purgeCandidate.response.status, 201);
  const purged = await request(
    `/api/admin/pets/${purgeCandidate.payload.id}?mode=purge`,
    { method: "DELETE", headers: adminHeaders },
  );
  assert.equal(purged.response.status, 200);
  assert.equal(purged.payload.purged, true);
  assert.equal(purged.payload.archived, false);

  const disableUser = await request("/api/admin/users/1", {
    method: "PATCH",
    headers: adminHeaders,
    body: JSON.stringify({ status: "disabled" }),
  });
  assert.equal(disableUser.response.status, 200);
  const disabledLogin = await request("/api/users/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ phone: "13700000000", login_type: "phone" }),
  });
  assert.equal(disabledLogin.response.status, 403);
  const enableUser = await request("/api/admin/users/1", {
    method: "PATCH",
    headers: adminHeaders,
    body: JSON.stringify({ status: "active" }),
  });
  assert.equal(enableUser.response.status, 200);

  const deletedAddress = await request(
    `/api/addresses/${address.payload.id}?user_id=1`,
    { method: "DELETE" },
  );
  assert.equal(deletedAddress.response.status, 200);
});
