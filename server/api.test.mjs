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
  assert.equal(eligibleQuote.payload.shipping_fee, 0);
  assert.equal(eligibleQuote.payload.guarantee_eligible, true);
  assert.match(eligibleQuote.payload.guarantee_policy, /40日/);
  const eligibleOrder = await request("/api/orders", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      user_id: secondUser.payload.id,
      pet_id: eligiblePet.payload.id,
      client_request_id: "eligible-newcomer-order",
      address: { name: "新人", phone: "13600000000", detail: "新人保障测试地址" },
    }),
  });
  assert.equal(eligibleOrder.response.status, 201);
  assert.equal(eligibleOrder.payload.total_amount, 3000);
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
    }),
  });
  assert.equal(order.response.status, 201);
  assert.equal(order.payload.discount_amount, 0);
  assert.equal(order.payload.pet_amount, 6800);
  assert.equal(order.payload.guarantee_eligible, false);
  assert.match(order.payload.order_no, /^FC\d{8}-\d{4}$/);
  const repeatedOrder = await request("/api/orders", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      user_id: 1,
      pet_id: pet.payload.id,
      client_request_id: "api-test-order-request-1",
      address: { name: "测试用户", phone: "13800000000", detail: "测试地址一号" },
    }),
  });
  assert.equal(repeatedOrder.response.status, 200);
  assert.equal(repeatedOrder.payload.id, order.payload.id);
  assert.equal(repeatedOrder.payload.idempotent, true);

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
  assert.equal(orderDetail.payload.logistics_events.length, 1);
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
