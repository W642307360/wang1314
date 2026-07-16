const JSON_HEADERS = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };
const PUBLIC_CACHE = { "content-type": "application/json; charset=utf-8", "cache-control": "public,max-age=30,stale-while-revalidate=120" };
const enc = new TextEncoder();

function json(data, status = 200, headers = JSON_HEADERS) {
  return new Response(JSON.stringify(data), { status, headers });
}
function error(message, status = 400, extra = {}) { return json({ error: message, ...extra }, status); }
async function body(request) {
  const type = request.headers.get("content-type") || "";
  if (type.includes("application/json")) return request.json().catch(() => ({}));
  return {};
}
function id(value) { const n = Number(value); return Number.isInteger(n) && n > 0 ? n : 0; }
function text(value, fallback = "") { return typeof value === "string" ? value.trim() : fallback; }
function parse(value, fallback) { try { return JSON.parse(value || ""); } catch { return fallback; } }
function now() { return new Date().toISOString().replace("T", " ").slice(0, 19); }
function randomId(prefix = "") { return prefix + crypto.randomUUID().replaceAll("-", ""); }
function placeholders(length) { return Array.from({ length }, () => "?").join(","); }
async function all(db, sql, ...values) { return (await db.prepare(sql).bind(...values).all()).results || []; }
async function first(db, sql, ...values) { return await db.prepare(sql).bind(...values).first(); }
async function run(db, sql, ...values) { return await db.prepare(sql).bind(...values).run(); }

async function hmac(secret, value) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signed = await crypto.subtle.sign("HMAC", key, enc.encode(value));
  return btoa(String.fromCharCode(...new Uint8Array(signed))).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}
async function adminToken(env, username) {
  const payload = `${username}.${Date.now()}`;
  return `${payload}.${await hmac(env.ADMIN_TOKEN_SECRET, payload)}`;
}
async function verifyAdmin(request, env) {
  const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const payload = `${parts[0]}.${parts[1]}`;
  if (Date.now() - Number(parts[1]) > 12 * 60 * 60 * 1000) return null;
  if ((await hmac(env.ADMIN_TOKEN_SECRET, payload)) !== parts[2]) return null;
  return { id: 1, username: parts[0], role: "admin" };
}

function normalizePet(row) {
  if (!row) return null;
  return {
    ...row,
    image: row.thumbnail_url || row.highres_url || row.image || "",
    product_status: row.product_status || (row.status === "published" ? "available" : row.status),
    detail_payload: parse(row.detail_payload, {}),
  };
}
async function petDetail(db, petId) {
  const pet = await first(db, `SELECT p.*,c.name category_name,pp.status product_status,pp.breed_id,
    COALESCE(pp.seller_id,p.seller_id) seller_id FROM pets p LEFT JOIN categories c ON c.id=p.category_id
    LEFT JOIN pet_products pp ON pp.pet_id=p.id WHERE p.id=?`, petId);
  if (!pet) return null;
  const [images, videos, skus, inventory, reviews] = await Promise.all([
    all(db, "SELECT * FROM pet_images WHERE pet_id=? ORDER BY sort_order,id", petId),
    all(db, "SELECT * FROM pet_videos WHERE pet_id=? ORDER BY id", petId),
    all(db, "SELECT * FROM pet_skus WHERE pet_id=? ORDER BY id", petId),
    all(db, "SELECT * FROM inventory WHERE pet_id=? ORDER BY id", petId),
    all(db, "SELECT * FROM product_reviews WHERE pet_id=? AND status='published' ORDER BY id DESC LIMIT 60", petId),
  ]);
  return { ...normalizePet(pet), images, videos, skus, inventory, reviews: reviews.map(r => ({ ...r, images: parse(r.images_json, []), videos: parse(r.videos_json, []) })) };
}

async function listPets(db, url, admin = false) {
  const q = text(url.searchParams.get("q"));
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const pageSize = Math.min(200, Math.max(1, Number(url.searchParams.get("pageSize")) || (admin ? 100 : 12)));
  const status = text(url.searchParams.get("status"));
  const where = [], values = [];
  if (!admin) where.push("p.status='published'", "COALESCE(pp.status,'available')='available'");
  if (status) { where.push("COALESCE(pp.status,p.status)=?"); values.push(status); }
  if (q) { where.push("(p.name LIKE ? OR p.breed LIKE ? OR p.seller_name LIKE ?)"); values.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  values.push(pageSize, (page - 1) * pageSize);
  const rows = await all(db, `SELECT p.*,c.name category_name,pp.status product_status,pp.breed_id,
    COALESCE(pp.seller_id,p.seller_id) seller_id,
    (SELECT COUNT(*) FROM pet_images i WHERE i.pet_id=p.id) image_count,
    (SELECT COUNT(*) FROM pet_videos v WHERE v.pet_id=p.id) video_count
    FROM pets p LEFT JOIN categories c ON c.id=p.category_id LEFT JOIN pet_products pp ON pp.pet_id=p.id
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY p.updated_at DESC,p.id DESC LIMIT ? OFFSET ?`, ...values);
  return rows.map(normalizePet);
}

async function upsertUser(db, input, request) {
  const account = text(input.account || input.phone || input.openid || input.wechat_openid);
  if (!account) throw new Error("请输入手机号或账号");
  let user = await first(db, "SELECT * FROM users WHERE account=? OR phone=? OR openid=? OR wechat_openid=? LIMIT 1", account, account, account, account);
  if (user) {
    await run(db, "UPDATE users SET nickname=COALESCE(NULLIF(?,''),nickname),avatar=COALESCE(NULLIF(?,''),avatar),last_login_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?", text(input.nickname), text(input.avatar), user.id);
  } else {
    const nickname = text(input.nickname, `福宠用户${account.slice(-4)}`);
    const phone = /^1\d{10}$/.test(account) ? account : null;
    const created = await run(db, "INSERT INTO users(account,phone,nickname,avatar,status,last_login_at,login_method) VALUES(?,?,?,?, 'active',CURRENT_TIMESTAMP,?)", account, phone, nickname, text(input.avatar) || null, text(input.login_method, "phone"));
    user = await first(db, "SELECT * FROM users WHERE id=?", created.meta.last_row_id);
    const coupon = await first(db, "SELECT id FROM coupons WHERE status='active' ORDER BY amount DESC,id LIMIT 1");
    if (coupon) await run(db, "INSERT OR IGNORE INTO user_coupons(user_id,coupon_id,status) VALUES(?,?,'available')", user.id, coupon.id);
  }
  user = await first(db, "SELECT * FROM users WHERE id=?", user.id);
  await run(db, "INSERT INTO user_login_logs(user_id,login_type,ip,user_agent) VALUES(?,?,?,?)", user.id, text(input.login_method, "phone"), request.headers.get("cf-connecting-ip") || "", request.headers.get("user-agent") || "");
  return user;
}

async function feishuToken(env, appId) {
  if (!appId || !env.FEISHU_APP_SECRET) throw new Error("飞书密钥未配置");
  const response = await fetch("https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ app_id: appId, app_secret: env.FEISHU_APP_SECRET }) });
  const data = await response.json();
  if (!response.ok || data.code) throw new Error(data.msg || "飞书授权失败");
  return data.tenant_access_token;
}
function feishuValue(value) {
  if (Array.isArray(value)) return value.map(feishuValue).filter(Boolean).join(",");
  if (value && typeof value === "object") return value.text || value.name || value.url || value.link || value.value || "";
  return value ?? "";
}
async function feishuRecords(env, config, limit = 5000) {
  const token = await feishuToken(env, config.app_id || env.FEISHU_APP_ID);
  const items = []; let pageToken = "";
  do {
    const endpoint = new URL(`https://open.feishu.cn/open-apis/bitable/v1/apps/${config.app_token}/tables/${config.table_id}/records`);
    endpoint.searchParams.set("page_size", "500"); if (pageToken) endpoint.searchParams.set("page_token", pageToken);
    const response = await fetch(endpoint, { headers: { Authorization: `Bearer ${token}` } });
    const data = await response.json(); if (!response.ok || data.code) throw new Error(data.msg || "读取飞书数据失败");
    items.push(...(data.data?.items || [])); pageToken = data.data?.has_more ? data.data?.page_token || "" : "";
  } while (pageToken && items.length < limit);
  return items.slice(0, limit);
}

const importTables = new Set(["categories","breeds","sellers","pets","pet_products","pet_skus","pet_images","pet_videos","inventory","users","user_auth","visitors","addresses","favorites","follows","footprints","cart_items","coupons","user_coupons","orders","order_items","payments","logistics","logistics_events","order_status_history","complaints","after_sales","messages","customer_service_sessions","product_reviews","seller_reviews","seller_reports","banners","feishu_sync_configs","feishu_sync_tasks","feishu_sync_task_items","feishu_sync_previews"]);
async function importRows(db, table, rows) {
  if (!importTables.has(table) || !Array.isArray(rows) || rows.length > 100) throw new Error("导入批次无效");
  const statements = [];
  for (const row of rows) {
    const keys = Object.keys(row).filter(k => /^[a-z_][a-z0-9_]*$/i.test(k));
    if (!keys.length) continue;
    const values = keys.map(k => row[k]);
    statements.push(db.prepare(`INSERT OR REPLACE INTO ${table} (${keys.join(",")}) VALUES (${placeholders(keys.length)})`).bind(...values));
  }
  if (statements.length) await db.batch(statements);
  return statements.length;
}

async function handlePublic(request, env, url, path, method) {
  const db = env.DB;
  if (path === "/api/health") return json({ ok: true, database: Boolean(await first(db, "SELECT 1 ok")), storage: Boolean(env.MEDIA), region: request.cf?.colo || "edge" });
  if (path === "/api/pets/breed-counts" && method === "GET") return json(await all(db, `SELECT breed,COUNT(*) count FROM pets p LEFT JOIN pet_products pp ON pp.pet_id=p.id WHERE p.status='published' AND COALESCE(pp.status,'available')='available' GROUP BY breed ORDER BY breed`), 200, PUBLIC_CACHE);
  if (path === "/api/pets" && method === "GET") return json(await listPets(db, url), 200, PUBLIC_CACHE);
  const petMatch = path.match(/^\/api\/pets\/(\d+)$/);
  if (petMatch && method === "GET") { const pet = await petDetail(db, id(petMatch[1])); return pet ? json(pet, 200, PUBLIC_CACHE) : error("商品不存在", 404); }

  if (path === "/api/visitors/session" && method === "POST") {
    const input = await body(request); const token = text(input.token) || randomId("v_");
    let visitor = await first(db, "SELECT * FROM visitors WHERE token=?", token);
    if (!visitor) {
      const u = await run(db, "INSERT INTO users(nickname,status,account,login_method) VALUES(?,'guest',?,'visitor')", `访客${token.slice(-6)}`, token);
      const v = await run(db, "INSERT INTO visitors(token,user_id) VALUES(?,?)", token, u.meta.last_row_id);
      visitor = await first(db, "SELECT * FROM visitors WHERE id=?", v.meta.last_row_id);
    } else await run(db, "UPDATE visitors SET last_seen=CURRENT_TIMESTAMP,visit_count=visit_count+1 WHERE id=?", visitor.id);
    return json({ token, userId: visitor.user_id, visitorId: visitor.id });
  }
  if (path === "/api/users/login" && method === "POST") return json(await upsertUser(db, await body(request), request));
  const userMatch = path.match(/^\/api\/users\/(\d+)$/);
  if (userMatch && method === "GET") { const user = await first(db, "SELECT * FROM users WHERE id=?", id(userMatch[1])); return user ? json(user) : error("用户不存在", 404); }
  if (userMatch && method === "PATCH") {
    const input = await body(request); const userId = id(userMatch[1]);
    await run(db, "UPDATE users SET nickname=COALESCE(?,nickname),avatar=COALESCE(?,avatar),phone=COALESCE(?,phone),updated_at=CURRENT_TIMESTAMP WHERE id=?", input.nickname ?? null, input.avatar ?? null, input.phone ?? null, userId);
    return json(await first(db, "SELECT * FROM users WHERE id=?", userId));
  }
  const summaryMatch = path.match(/^\/api\/users\/(\d+)\/summary$/);
  if (summaryMatch && method === "GET") {
    const userId = id(summaryMatch[1]);
    const counts = {};
    for (const [key, table] of [["orders","orders"],["favorites","favorites"],["footprints","footprints"],["coupons","user_coupons"]]) counts[key] = Number((await first(db, `SELECT COUNT(*) count FROM ${table} WHERE user_id=?`, userId))?.count || 0);
    return json(counts);
  }

  if (path === "/api/favorites" && method === "GET") {
    const userId = id(url.searchParams.get("user_id"));
    return json(await all(db, `SELECT f.id favorite_id,p.*,pp.status product_status FROM favorites f JOIN pets p ON p.id=f.pet_id LEFT JOIN pet_products pp ON pp.pet_id=p.id WHERE f.user_id=? ORDER BY f.id DESC`, userId));
  }
  if (path === "/api/favorites" && method === "POST") { const input = await body(request); await run(db, "INSERT OR IGNORE INTO favorites(user_id,pet_id) VALUES(?,?)", id(input.user_id), id(input.pet_id)); return json({ ok: true }); }
  const favoriteMatch = path.match(/^\/api\/favorites\/(\d+)$/);
  if (favoriteMatch && method === "DELETE") { await run(db, "DELETE FROM favorites WHERE user_id=? AND pet_id=?", id(url.searchParams.get("user_id")), id(favoriteMatch[1])); return json({ ok: true }); }

  if (path === "/api/follows" && method === "GET") return json(await all(db, "SELECT * FROM follows WHERE user_id=? ORDER BY id DESC", id(url.searchParams.get("user_id"))));
  if (path === "/api/follows" && method === "POST") { const input = await body(request); await run(db, "INSERT OR IGNORE INTO follows(user_id,seller_name) VALUES(?,?)", id(input.user_id), text(input.seller_name)); return json({ ok: true }); }
  if (path === "/api/follows" && method === "DELETE") { await run(db, "DELETE FROM follows WHERE user_id=? AND seller_name=?", id(url.searchParams.get("user_id")), text(url.searchParams.get("seller_name"))); return json({ ok: true }); }

  if (path === "/api/footprints" && method === "GET") return json(await all(db, `SELECT f.id footprint_id,f.viewed_at,p.* FROM footprints f JOIN pets p ON p.id=f.pet_id WHERE f.user_id=? ORDER BY f.viewed_at DESC LIMIT 200`, id(url.searchParams.get("user_id"))));
  if (path === "/api/footprints" && method === "POST") { const input = await body(request); await run(db, "INSERT INTO footprints(user_id,pet_id) VALUES(?,?)", id(input.user_id), id(input.pet_id)); return json({ ok: true }); }
  if (path === "/api/footprints" && method === "DELETE") { await run(db, "DELETE FROM footprints WHERE user_id=?", id(url.searchParams.get("user_id"))); return json({ ok: true }); }
  const footprintMatch = path.match(/^\/api\/footprints\/(\d+)$/);
  if (footprintMatch && method === "DELETE") { await run(db, "DELETE FROM footprints WHERE id=? AND user_id=?", id(footprintMatch[1]), id(url.searchParams.get("user_id"))); return json({ ok: true }); }

  if (path === "/api/cart" && method === "GET") return json(await all(db, `SELECT c.id cart_id,c.pet_id,c.quantity,c.selected,p.*,pp.status product_status FROM cart_items c JOIN pets p ON p.id=c.pet_id LEFT JOIN pet_products pp ON pp.pet_id=p.id WHERE c.user_id=? ORDER BY c.updated_at DESC`, id(url.searchParams.get("user_id"))));
  if (path === "/api/cart" && method === "POST") { const input = await body(request); await run(db, `INSERT INTO cart_items(user_id,pet_id,quantity,selected) VALUES(?,?,?,?) ON CONFLICT(user_id,pet_id) DO UPDATE SET quantity=excluded.quantity,selected=excluded.selected,updated_at=CURRENT_TIMESTAMP`, id(input.user_id), id(input.pet_id), Math.max(1, Number(input.quantity) || 1), input.selected === false ? 0 : 1); return json({ ok: true }); }
  if (path === "/api/cart/merge" && method === "POST") { const input = await body(request); for (const item of input.items || []) await run(db, `INSERT INTO cart_items(user_id,pet_id,quantity,selected) VALUES(?,?,?,?) ON CONFLICT(user_id,pet_id) DO UPDATE SET quantity=MAX(cart_items.quantity,excluded.quantity),selected=excluded.selected,updated_at=CURRENT_TIMESTAMP`, id(input.user_id), id(item.pet_id), Math.max(1, Number(item.quantity) || 1), item.selected === false ? 0 : 1); return json(await all(db, "SELECT * FROM cart_items WHERE user_id=?", id(input.user_id))); }
  const cartMatch = path.match(/^\/api\/cart\/(\d+)$/);
  if (cartMatch && method === "DELETE") { await run(db, "DELETE FROM cart_items WHERE id=? AND user_id=?", id(cartMatch[1]), id(url.searchParams.get("user_id"))); return json({ ok: true }); }

  if (path === "/api/addresses" && method === "GET") return json(await all(db, "SELECT * FROM addresses WHERE user_id=? ORDER BY is_default DESC,id DESC", id(url.searchParams.get("user_id"))));
  if (path === "/api/addresses" && method === "POST") {
    const x = await body(request); if (x.is_default) await run(db, "UPDATE addresses SET is_default=0 WHERE user_id=?", id(x.user_id));
    const result = await run(db, "INSERT INTO addresses(user_id,name,phone,province,city,district,detail,is_default) VALUES(?,?,?,?,?,?,?,?)", id(x.user_id), text(x.name), text(x.phone), text(x.province), text(x.city), text(x.district), text(x.detail), x.is_default ? 1 : 0);
    return json(await first(db, "SELECT * FROM addresses WHERE id=?", result.meta.last_row_id), 201);
  }
  const addressMatch = path.match(/^\/api\/addresses\/(\d+)$/);
  if (addressMatch && method === "PATCH") { const x = await body(request); if (x.is_default) await run(db, "UPDATE addresses SET is_default=0 WHERE user_id=?", id(x.user_id)); await run(db, "UPDATE addresses SET name=?,phone=?,province=?,city=?,district=?,detail=?,is_default=? WHERE id=? AND user_id=?", text(x.name), text(x.phone), text(x.province), text(x.city), text(x.district), text(x.detail), x.is_default ? 1 : 0, id(addressMatch[1]), id(x.user_id)); return json({ ok: true }); }
  if (addressMatch && method === "DELETE") { await run(db, "DELETE FROM addresses WHERE id=? AND user_id=?", id(addressMatch[1]), id(url.searchParams.get("user_id"))); return json({ ok: true }); }

  if (path === "/api/coupons" && method === "GET") return json(await all(db, `SELECT uc.id user_coupon_id,uc.status user_status,c.* FROM user_coupons uc JOIN coupons c ON c.id=uc.coupon_id WHERE uc.user_id=? ORDER BY uc.id DESC`, id(url.searchParams.get("user_id"))));
  const sellerMatch = path.match(/^\/api\/sellers\/(\d+)$/);
  if (sellerMatch && method === "GET") {
    const seller = await first(db, "SELECT * FROM sellers WHERE id=?", id(sellerMatch[1])); if (!seller) return error("商家不存在", 404);
    seller.reviews = await all(db, "SELECT * FROM seller_reviews WHERE seller_id=? ORDER BY id DESC LIMIT 80", seller.id); return json(seller, 200, PUBLIC_CACHE);
  }
  const sellerReportMatch = path.match(/^\/api\/sellers\/(\d+)\/reports$/);
  if (sellerReportMatch && method === "POST") { const x = await body(request); const r = await run(db, "INSERT INTO seller_reports(seller_id,user_id,pet_id,category,content,contact_phone) VALUES(?,?,?,?,?,?)", id(sellerReportMatch[1]), id(x.user_id) || null, id(x.pet_id) || null, text(x.category, "其他"), text(x.content), text(x.contact_phone)); return json({ id: r.meta.last_row_id, ok: true }, 201); }

  const likeMatch = path.match(/^\/api\/reviews\/(\d+)\/like$/);
  if (likeMatch && method === "POST") { await run(db, "UPDATE product_reviews SET likes=likes+1 WHERE id=?", id(likeMatch[1])); return json({ ok: true }); }
  return null;
}

async function orderPayload(db, orderId, userId = 0) {
  const order = await first(db, `SELECT o.*,l.company logistics_company,l.tracking_no,l.status logistics_status,l.progress logistics_progress
    FROM orders o LEFT JOIN logistics l ON l.order_id=o.id WHERE o.id=? ${userId ? "AND o.user_id=?" : ""}`, ...([orderId, ...(userId ? [userId] : [])]));
  if (!order) return null;
  const [items, events, history, payment] = await Promise.all([
    all(db, "SELECT oi.*,p.name,p.breed,p.thumbnail_url,p.highres_url FROM order_items oi LEFT JOIN pets p ON p.id=oi.pet_id WHERE oi.order_id=?", orderId),
    all(db, "SELECT * FROM logistics_events WHERE order_id=? ORDER BY id", orderId),
    all(db, "SELECT * FROM order_status_history WHERE order_id=? ORDER BY id", orderId),
    first(db, "SELECT * FROM payments WHERE order_id=? ORDER BY id DESC LIMIT 1", orderId),
  ]);
  return { ...order, address: parse(order.address_snapshot, {}), logistics_progress: parse(order.logistics_progress, []), items, logistics_events: events, status_history: history, payment };
}

async function handleCommerce(request, env, url, path, method) {
  const db = env.DB;
  if (path === "/api/orders/quote" && method === "GET") {
    const pet = await first(db, "SELECT id,price FROM pets WHERE id=?", id(url.searchParams.get("pet_id"))); if (!pet) return error("商品不存在", 404);
    const coupon = await first(db, `SELECT uc.id,c.amount,c.threshold FROM user_coupons uc JOIN coupons c ON c.id=uc.coupon_id WHERE uc.user_id=? AND uc.status='available' AND c.status='active' AND c.amount<=? ORDER BY c.amount DESC LIMIT 1`, id(url.searchParams.get("user_id")), pet.price);
    const discount = Number(coupon?.amount || 0), subtotal = Number(pet.price), shipping = 0;
    return json({ subtotal_amount: subtotal, discount_amount: discount, shipping_fee: shipping, total_amount: Math.max(0, subtotal - discount + shipping), user_coupon_id: coupon?.id || null, guarantee_eligible: subtotal - discount <= 3000 ? 1 : 0 });
  }
  if (path === "/api/orders" && method === "POST") {
    const x = await body(request); const userId = id(x.user_id), petId = id(x.pet_id || x.items?.[0]?.pet_id); const clientId = text(x.client_request_id) || randomId("web_");
    const duplicate = await first(db, "SELECT * FROM orders WHERE user_id=? AND client_request_id=?", userId, clientId); if (duplicate) return json(await orderPayload(db, duplicate.id, userId));
    const pet = await first(db, `SELECT p.*,COALESCE(i.available_stock,1) available_stock FROM pets p LEFT JOIN inventory i ON i.pet_id=p.id AND i.sku_id IS NULL WHERE p.id=?`, petId);
    if (!pet || pet.status !== "published" || Number(pet.available_stock) < 1) return error("商品暂不可购买", 409);
    let address = x.address || null; if (!address && x.address_id) address = await first(db, "SELECT * FROM addresses WHERE id=? AND user_id=?", id(x.address_id), userId); if (!address) address = { name: text(x.receiver_name, "待补充"), phone: text(x.receiver_phone), detail: text(x.address, "待补充") };
    const coupon = await first(db, `SELECT uc.id,c.amount FROM user_coupons uc JOIN coupons c ON c.id=uc.coupon_id WHERE uc.user_id=? AND uc.status='available' AND c.status='active' ORDER BY c.amount DESC LIMIT 1`, userId);
    const subtotal = Number(pet.price), discount = Math.min(subtotal, Number(coupon?.amount || 0)), shipping = Number(x.shipping_fee || 0), total = Math.max(0, subtotal - discount + shipping);
    const orderNo = `FC${new Date().toISOString().slice(0,10).replaceAll("-","")}${String(Date.now()).slice(-8)}${Math.floor(Math.random()*90+10)}`;
    const orderStmt = db.prepare(`INSERT INTO orders(order_no,user_id,total_amount,payment_status,status,address_snapshot,client_request_id,subtotal_amount,discount_amount,shipping_fee,user_coupon_id,guarantee_eligible,guarantee_policy)
      VALUES(?,?,?,'unpaid','pending_payment',?,?,?,?,?,?,?,?)`).bind(orderNo,userId,total,JSON.stringify(address),clientId,subtotal,discount,shipping,coupon?.id || null,total - shipping <= 3000 ? 1 : 0,total - shipping <= 3000 ? "40天内非正常养殖死亡可申请更换" : null);
    const created = await db.batch([orderStmt]); const orderId = created[0].meta.last_row_id;
    await db.batch([
      db.prepare("INSERT INTO order_items(order_id,pet_id,pet_snapshot,price,quantity) VALUES(?,?,?,?,1)").bind(orderId,petId,JSON.stringify(pet),subtotal),
      db.prepare("INSERT INTO order_status_history(order_id,to_status,operator_type,note) VALUES(?,'pending_payment','user','用户创建订单')").bind(orderId),
      db.prepare("INSERT INTO logistics(order_id,status,progress) VALUES(?,'pending','[]')").bind(orderId),
      db.prepare("UPDATE inventory SET locked_stock=locked_stock+1,available_stock=MAX(0,available_stock-1),updated_at=CURRENT_TIMESTAMP WHERE pet_id=? AND sku_id IS NULL").bind(petId),
      ...(coupon ? [db.prepare("UPDATE user_coupons SET status='reserved',reserved_order_id=? WHERE id=?").bind(orderId,coupon.id)] : []),
    ]);
    return json(await orderPayload(db, orderId, userId), 201);
  }
  if (path === "/api/orders" && method === "GET") {
    const userId = id(url.searchParams.get("user_id")); const orders = await all(db, "SELECT * FROM orders WHERE user_id=? ORDER BY id DESC", userId);
    return json(await Promise.all(orders.map(o => orderPayload(db, o.id, userId))));
  }
  const orderMatch = path.match(/^\/api\/orders\/(\d+)$/);
  if (orderMatch && method === "GET") { const order = await orderPayload(db, id(orderMatch[1]), id(url.searchParams.get("user_id"))); return order ? json(order) : error("订单不存在", 404); }
  const cancelMatch = path.match(/^\/api\/orders\/(\d+)\/cancel$/);
  if (cancelMatch && method === "POST") {
    const x = await body(request), orderId = id(cancelMatch[1]); const order = await first(db, "SELECT * FROM orders WHERE id=? AND user_id=?", orderId, id(x.user_id)); if (!order) return error("订单不存在",404);
    if (!["pending_payment","paid","confirmed"].includes(order.status)) return error("当前订单不能取消",409);
    const item = await first(db, "SELECT pet_id FROM order_items WHERE order_id=? LIMIT 1",orderId);
    await db.batch([
      db.prepare("UPDATE orders SET status='cancelled',updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(orderId),
      db.prepare("INSERT INTO order_status_history(order_id,from_status,to_status,operator_type,note) VALUES(?,?,'cancelled','user','用户取消订单')").bind(orderId,order.status),
      db.prepare("UPDATE inventory SET locked_stock=MAX(0,locked_stock-1),available_stock=available_stock+1 WHERE pet_id=? AND sku_id IS NULL").bind(item?.pet_id || 0),
      db.prepare("UPDATE user_coupons SET status='available',reserved_order_id=NULL WHERE reserved_order_id=?").bind(orderId),
    ]); return json(await orderPayload(db,orderId,order.user_id));
  }
  if (path === "/api/payments/mock" && method === "POST") {
    const x = await body(request), orderId = id(x.order_id); const order = await first(db,"SELECT * FROM orders WHERE id=?",orderId); if(!order)return error("订单不存在",404);
    let payment = await first(db,"SELECT * FROM payments WHERE order_id=? AND status='paid'",orderId);
    if(!payment){ const no=randomId("PAY").slice(0,28); const r=await run(db,"INSERT INTO payments(order_id,payment_no,channel,amount,status,paid_at,raw_payload) VALUES(?,?,'mock',?,'paid',CURRENT_TIMESTAMP,?)",orderId,no,order.total_amount,JSON.stringify(x)); await db.batch([db.prepare("UPDATE orders SET payment_status='paid',status='paid',paid_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(orderId),db.prepare("UPDATE user_coupons SET status='used' WHERE reserved_order_id=?").bind(orderId),db.prepare("INSERT INTO order_status_history(order_id,from_status,to_status,operator_type,note) VALUES(?,'pending_payment','paid','system','支付成功')").bind(orderId)]); payment=await first(db,"SELECT * FROM payments WHERE id=?",r.meta.last_row_id); }
    return json(payment);
  }
  if (path === "/api/payments/wechat/prepay" && method === "POST") return error("微信支付生产参数尚未配置，请先使用平台测试支付", 503, { code: "WECHAT_PAY_NOT_CONFIGURED" });
  if (path === "/api/after-sales" && method === "POST") { const x=await body(request); const r=await run(db,"INSERT INTO after_sales(order_id,user_id,type,reason,amount,status) VALUES(?,?,?,?,?,'pending')",id(x.order_id),id(x.user_id),text(x.type,"售后申请"),text(x.reason),Number(x.amount)||0); return json({id:r.meta.last_row_id,ok:true},201); }

  if (path === "/api/messages" && method === "GET") {
    if (url.searchParams.get("session_id")) return json(await all(db,"SELECT * FROM messages WHERE session_id=? ORDER BY id",id(url.searchParams.get("session_id"))));
    return json(await all(db,"SELECT * FROM messages WHERE user_id=? ORDER BY id DESC LIMIT 200",id(url.searchParams.get("user_id"))));
  }
  if (path === "/api/messages" && method === "POST") {
    const x=await body(request); let sessionId=id(x.session_id);
    if(!sessionId){const s=await run(db,"INSERT INTO customer_service_sessions(user_id,product_id,product_name,seller_name,source,status,service_type,seller_id) VALUES(?,?,?,?,?,'ai',?,?)",id(x.user_id),id(x.product_id)||null,text(x.product_name)||null,text(x.seller_name)||null,text(x.source,"product_detail"),text(x.service_type,"购买咨询"),id(x.seller_id)||null);sessionId=s.meta.last_row_id;}
    const r=await run(db,"INSERT INTO messages(user_id,sender,type,content,session_id,product_id,product_name,seller_name,status,service_type,seller_id) VALUES(?,?,?,?,?,?,?,?, 'sent',?,?)",id(x.user_id),text(x.sender,"user"),text(x.type,"service"),text(x.content),sessionId,id(x.product_id)||null,text(x.product_name)||null,text(x.seller_name)||null,text(x.service_type,"购买咨询"),id(x.seller_id)||null);
    return json({...(await first(db,"SELECT * FROM messages WHERE id=?",r.meta.last_row_id)),session_id:sessionId},201);
  }
  const handoff = path.match(/^\/api\/customer-service\/sessions\/(\d+)\/handoff$/);
  if(handoff && method==="POST"){await run(db,"UPDATE customer_service_sessions SET status='human',assigned_to='在线客服',updated_at=CURRENT_TIMESTAMP WHERE id=?",id(handoff[1]));return json({ok:true,status:"human"});}
  return null;
}

async function handleMedia(request, env, url, path, method) {
  if (path.startsWith("/uploads/") && method === "GET") {
    const object = await env.MEDIA.get(path.slice(9)); if (!object) return new Response("Not found", { status: 404 });
    const headers = new Headers(); object.writeHttpMetadata(headers); headers.set("etag", object.httpEtag); headers.set("cache-control","public,max-age=31536000,immutable"); return new Response(object.body,{headers});
  }
  if(path==="/api/media/feishu"&&method==="GET"){
    const source=text(url.searchParams.get("url")); if(!source)return error("缺少媒体地址"); let parsed; try{parsed=new URL(source);}catch{return error("媒体地址无效");}
    if(!["open.feishu.cn","lf3-static.bytednsdoc.com","s3-imfile.feishucdn.com"].some(host=>parsed.hostname===host||parsed.hostname.endsWith(`.${host}`)))return error("不允许的媒体来源",403);
    const headers={}; if(env.FEISHU_APP_ID&&env.FEISHU_APP_SECRET){try{headers.Authorization=`Bearer ${await feishuToken(env,env.FEISHU_APP_ID)}`;}catch{}}
    const response=await fetch(source,{headers}); if(!response.ok)return error("媒体加载失败",response.status);
    const out=new Headers(response.headers); out.set("cache-control","public,max-age=86400,stale-while-revalidate=604800"); out.set("access-control-allow-origin","*"); return new Response(response.body,{status:response.status,headers:out});
  }
  return null;
}

async function adminStats(db) {
  const scalar = async (sql, ...values) => Number((await first(db, sql, ...values))?.value || 0);
  const products = { published: await scalar("SELECT COUNT(*) value FROM pets WHERE status='published'"), total: await scalar("SELECT COUNT(*) value FROM pets"), low_stock: await scalar("SELECT COUNT(*) value FROM inventory WHERE available_stock<=low_stock_threshold") };
  const users = { total: await scalar("SELECT COUNT(*) value FROM users"), visitors: await scalar("SELECT COUNT(*) value FROM visitors"), registered: await scalar("SELECT COUNT(*) value FROM users WHERE status='active'"), active_7d: await scalar("SELECT COUNT(DISTINCT user_id) value FROM user_login_logs WHERE created_at>=datetime('now','-7 day')") };
  const orders = { total: await scalar("SELECT COUNT(*) value FROM orders"), pending_payment: await scalar("SELECT COUNT(*) value FROM orders WHERE status='pending_payment'"), paid: await scalar("SELECT COUNT(*) value FROM orders WHERE payment_status='paid'"), revenue: await scalar("SELECT COALESCE(SUM(total_amount),0) value FROM orders WHERE payment_status='paid'") };
  const behavior = { favorites: await scalar("SELECT COUNT(*) value FROM favorites"), footprints: await scalar("SELECT COUNT(*) value FROM footprints"), messages: await scalar("SELECT COUNT(*) value FROM messages"), purchase_users: await scalar("SELECT COUNT(DISTINCT user_id) value FROM orders") };
  const raw = await all(db, `WITH RECURSIVE days(day) AS (SELECT date('now','-6 day') UNION ALL SELECT date(day,'+1 day') FROM days WHERE day<date('now')) SELECT days.day,
    (SELECT COUNT(*) FROM orders WHERE date(created_at)=days.day) orders,
    (SELECT COUNT(*) FROM orders WHERE date(created_at)=days.day AND payment_status='paid') paid_orders,
    (SELECT COUNT(*) FROM orders WHERE date(created_at)=days.day AND status='completed') completed_orders,
    (SELECT COUNT(*) FROM orders WHERE date(created_at)=days.day AND status='cancelled') cancelled_orders,
    (SELECT COALESCE(SUM(total_amount),0) FROM orders WHERE date(created_at)=days.day AND payment_status='paid') revenue,
    (SELECT COUNT(DISTINCT user_id) FROM user_login_logs WHERE date(created_at)=days.day) active_users,
    (SELECT COUNT(*) FROM footprints WHERE date(viewed_at)=days.day) views FROM days`);
  const operations = { pending_after_sales: await scalar("SELECT COUNT(*) value FROM after_sales WHERE status='pending'"), pending_complaints: await scalar("SELECT COUNT(*) value FROM complaints WHERE status='pending'"), sync_errors: await scalar("SELECT COUNT(*) value FROM sync_task_errors") };
  return { products, users, orders, behavior, trends: raw, operations };
}

async function handleAdmin(request, env, url, path, method) {
  const db = env.DB;
  if (path === "/api/admin/login" && method === "POST") {
    const x = await body(request); const username = text(x.username, "admin");
    if (username !== (env.ADMIN_USERNAME || "admin") || String(x.password || "") !== String(env.ADMIN_INITIAL_PASSWORD || "")) return error("账号或密码错误", 401);
    return json({ token: await adminToken(env, username), user: { id: 1, username, role: "admin" } });
  }
  if (path === "/api/users/restore" && method === "POST") {
    const authorization = request.headers.get("authorization") || "";
    const suppliedSecret = authorization.startsWith("Bearer ") ? authorization.slice(7) : request.headers.get("x-site-key") || "";
    if (suppliedSecret !== env.MIGRATION_SECRET) return error("无权导入", 403);
    const input = await body(request);
    let x = input;
    if (typeof input.blob === "string") {
      try {
        const binary = atob(input.blob);
        const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
        x = JSON.parse(new TextDecoder().decode(bytes));
      } catch {
        return error("导入数据编码无效", 400);
      }
    }
    try { return json({ ok: true, imported: await importRows(db, text(x.table), x.rows) }); } catch (e) { return error(e.message, 400); }
  }
  const admin = await verifyAdmin(request, env); if (!admin) return error("管理登录已过期", 401);
  if (path === "/api/admin/stats" && method === "GET") return json(await adminStats(db));
  if (path === "/api/admin/db/status" && method === "GET") return json({ integrity_check: "ok", foreign_key_violations: 0, tables: await all(db, "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"), d1: true, r2: Boolean(env.MEDIA), feishu_credentials_ready: Boolean(env.FEISHU_APP_ID && env.FEISHU_APP_SECRET) });
  if (path === "/api/admin/pets" && method === "GET") return json(await listPets(db, url, true));
  if (path === "/api/admin/pets" && method === "POST") {
    const x=await body(request); const r=await run(db,`INSERT INTO pets(name,category_id,breed,gender,age_months,color,body_type,personality,health_status,vaccine_record,father_info,mother_info,description,price,seller_name,status,thumbnail_url,highres_url,source,detail_payload,breed_id,seller_id,business_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,text(x.name),id(x.category_id)||null,text(x.breed),text(x.gender)||null,Number(x.age_months)||null,text(x.color)||null,text(x.body_type)||null,text(x.personality)||null,text(x.health_status)||null,text(x.vaccine_record)||null,text(x.father_info)||null,text(x.mother_info)||null,text(x.description)||null,Number(x.price)||0,text(x.seller_name)||null,text(x.status,"draft"),text(x.thumbnail_url)||null,text(x.highres_url)||null,text(x.source,"local"),JSON.stringify(x.detail_payload||{}),id(x.breed_id)||null,id(x.seller_id)||null,text(x.business_id)||null);
    const petId=r.meta.last_row_id; await db.batch([db.prepare("INSERT OR IGNORE INTO pet_products(pet_id,breed_id,seller_id,product_name,status) VALUES(?,?,?,?,?)").bind(petId,id(x.breed_id)||null,id(x.seller_id)||null,text(x.name),text(x.product_status,"available")),db.prepare("INSERT OR IGNORE INTO inventory(pet_id,total_stock,locked_stock,available_stock,low_stock_threshold) VALUES(?,?,0,?,1)").bind(petId,Number(x.stock)||1,Number(x.stock)||1)]); return json(await petDetail(db,petId),201);
  }
  const adminPet=path.match(/^\/api\/admin\/pets\/(\d+)$/);
  if(adminPet&&method==="GET"){const pet=await petDetail(db,id(adminPet[1]));return pet?json(pet):error("商品不存在",404);}
  if(adminPet&&method==="PATCH"){
    const x=await body(request),petId=id(adminPet[1]); const allowed=["name","category_id","breed","gender","age_months","color","body_type","personality","health_status","vaccine_record","father_info","mother_info","description","price","seller_name","status","thumbnail_url","highres_url","source","external_id","business_id"];
    const keys=allowed.filter(k=>Object.hasOwn(x,k)); if(keys.length)await run(db,`UPDATE pets SET ${keys.map(k=>`${k}=?`).join(",")},updated_at=CURRENT_TIMESTAMP WHERE id=?`,...keys.map(k=>x[k]),petId);
    if(x.product_status)await run(db,"UPDATE pet_products SET status=?,updated_at=CURRENT_TIMESTAMP WHERE pet_id=?",x.product_status,petId); return json(await petDetail(db,petId));
  }
  if(adminPet&&method==="DELETE"){await run(db,"DELETE FROM pets WHERE id=?",id(adminPet[1]));return json({ok:true});}
  if(path==="/api/admin/pets/bulk-status"&&method==="PATCH"){const x=await body(request);const ids=(x.ids||[]).map(id).filter(Boolean);if(!ids.length)return error("请选择商品");await run(db,`UPDATE pets SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id IN (${placeholders(ids.length)})`,text(x.status,"draft"),...ids);await run(db,`UPDATE pet_products SET status=? WHERE pet_id IN (${placeholders(ids.length)})`,text(x.product_status,x.status==="published"?"available":"offline"),...ids);return json({ok:true,count:ids.length});}
  const stockMatch=path.match(/^\/api\/admin\/pets\/(\d+)\/inventory$/);
  if(stockMatch&&method==="GET")return json(await all(db,"SELECT * FROM inventory WHERE pet_id=?",id(stockMatch[1])));
  if(stockMatch&&(method==="PATCH"||method==="POST")){const x=await body(request),petId=id(stockMatch[1]),total=Math.max(0,Number(x.total_stock??x.stock)||0);await run(db,`INSERT INTO inventory(pet_id,total_stock,locked_stock,available_stock,low_stock_threshold) VALUES(?,?,0,?,?) ON CONFLICT(pet_id,sku_id) DO UPDATE SET total_stock=excluded.total_stock,available_stock=MAX(0,excluded.total_stock-inventory.locked_stock),low_stock_threshold=excluded.low_stock_threshold,updated_at=CURRENT_TIMESTAMP`,petId,total,total,Number(x.low_stock_threshold)||1);return json(await all(db,"SELECT * FROM inventory WHERE pet_id=?",petId));}
  const mediaMatch=path.match(/^\/api\/admin\/pets\/(\d+)\/(images|videos|skus)$/);
  if(mediaMatch&&method==="POST"){const x=await body(request),petId=id(mediaMatch[1]),kind=mediaMatch[2];let r;if(kind==="images")r=await run(db,"INSERT OR IGNORE INTO pet_images(pet_id,url,type,sort_order,thumbnail_url,webp_url) VALUES(?,?,?,?,?,?)",petId,text(x.url),text(x.type,"gallery"),Number(x.sort_order)||0,text(x.thumbnail_url)||null,text(x.webp_url)||null);else if(kind==="videos")r=await run(db,"INSERT OR IGNORE INTO pet_videos(pet_id,url,cover_url,duration,status) VALUES(?,?,?,?,?)",petId,text(x.url),text(x.cover_url)||null,Number(x.duration)||0,"ready");else r=await run(db,"INSERT INTO pet_skus(pet_id,sku_name,price,stock,status) VALUES(?,?,?,?,?)",petId,text(x.sku_name,"默认规格"),Number(x.price)||0,Number(x.stock)||1,text(x.status,"active"));return json({id:r.meta.last_row_id,ok:true},201);}
  if(path==="/api/admin/uploads"&&method==="POST"){
    const form=await request.formData();const file=form.get("file");if(!(file instanceof File))return error("请选择文件");if(file.size>50*1024*1024)return error("文件不能超过50MB",413);const safe=(file.name||"upload").replace(/[^a-zA-Z0-9._-]/g,"_");const key=`${new Date().toISOString().slice(0,10)}/${randomId().slice(0,16)}-${safe}`;await env.MEDIA.put(key,file.stream(),{httpMetadata:{contentType:file.type||"application/octet-stream"},customMetadata:{originalName:file.name}});return json({url:`/uploads/${key}`,key,size:file.size,type:file.type},201);
  }

  if(path==="/api/admin/users"&&method==="GET")return json(await all(db,`SELECT id,nickname,avatar,phone,status,login_method,last_login_at,created_at FROM users ORDER BY id DESC LIMIT 1000`));
  const adminUser=path.match(/^\/api\/admin\/users\/(\d+)$/);
  if(adminUser&&method==="PATCH"){const x=await body(request);await run(db,"UPDATE users SET status=COALESCE(?,status),nickname=COALESCE(?,nickname),phone=COALESCE(?,phone),updated_at=CURRENT_TIMESTAMP WHERE id=?",x.status??null,x.nickname??null,x.phone??null,id(adminUser[1]));return json(await first(db,"SELECT * FROM users WHERE id=?",id(adminUser[1])));}
  if(path==="/api/admin/orders"&&method==="GET")return json(await all(db,`SELECT o.*,u.nickname,u.phone,u.login_method,(u.phone IS NOT NULL) phone_bound,(SELECT COUNT(*) FROM visitors v WHERE v.user_id=u.id) visitor_sessions,(SELECT COALESCE(SUM(visit_count),0) FROM visitors v WHERE v.user_id=u.id) visit_count FROM orders o LEFT JOIN users u ON u.id=o.user_id ORDER BY o.id DESC`));
  const adminOrder=path.match(/^\/api\/admin\/orders\/(\d+)$/);
  if(adminOrder&&method==="GET"){const order=await orderPayload(db,id(adminOrder[1]));return order?json(order):error("订单不存在",404);}
  if(adminOrder&&method==="PATCH"){const x=await body(request),orderId=id(adminOrder[1]);const old=await first(db,"SELECT status FROM orders WHERE id=?",orderId);if(x.status){await db.batch([db.prepare("UPDATE orders SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(x.status,orderId),db.prepare("INSERT INTO order_status_history(order_id,from_status,to_status,operator_type,operator_id,note) VALUES(?,?,?,'admin',1,?)").bind(orderId,old?.status||null,x.status,text(x.note,"管理员更新订单"))]);}return json(await orderPayload(db,orderId));}
  const confirm=path.match(/^\/api\/admin\/orders\/(\d+)\/confirm$/);
  if(confirm&&method==="POST"){const orderId=id(confirm[1]),old=await first(db,"SELECT status FROM orders WHERE id=?",orderId);if(!old)return error("订单不存在",404);if(!["paid","pending_payment","confirmed"].includes(old.status))return error("当前状态不能确认",409);await db.batch([db.prepare("UPDATE orders SET status='confirmed',confirmed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(orderId),db.prepare("INSERT INTO order_status_history(order_id,from_status,to_status,operator_type,operator_id,note) VALUES(?,?,'confirmed','admin',1,'管理员确认订单')").bind(orderId,old.status)]);return json(await orderPayload(db,orderId));}
  const logistics=path.match(/^\/api\/admin\/orders\/(\d+)\/logistics$/);
  if(logistics&&method==="PATCH"){const x=await body(request),orderId=id(logistics[1]),percent=Math.min(100,Math.max(0,Number(x.progress_percent??x.progress)||0));let l=await first(db,"SELECT * FROM logistics WHERE order_id=?",orderId);if(!l){const r=await run(db,"INSERT INTO logistics(order_id,company,tracking_no,status,progress) VALUES(?,?,?,?,?)",orderId,text(x.company),text(x.tracking_no),text(x.status,"shipping"),"[]");l={id:r.meta.last_row_id};}else await run(db,"UPDATE logistics SET company=COALESCE(?,company),tracking_no=COALESCE(?,tracking_no),status=COALESCE(?,status),updated_at=CURRENT_TIMESTAMP WHERE order_id=?",x.company??null,x.tracking_no??null,x.status??null,orderId);await run(db,"INSERT INTO logistics_events(order_id,logistics_id,progress_percent,status,note) VALUES(?,?,?,?,?)",orderId,l.id,percent,text(x.status,"shipping"),text(x.note));if(percent>0)await run(db,"UPDATE orders SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",percent>=100?"completed":"shipping",orderId);return json(await orderPayload(db,orderId));}
  if(path==="/api/admin/payments"&&method==="GET")return json(await all(db,"SELECT p.*,o.order_no,u.nickname,u.phone FROM payments p LEFT JOIN orders o ON o.id=p.order_id LEFT JOIN users u ON u.id=o.user_id ORDER BY p.id DESC"));

  const generic={complaints:["complaints",["status","reply"]],"after-sales":["after_sales",["status","result","amount"]],"seller-reports":["seller_reports",["status","reply"]],banners:["banners",["title","image","link","sort_order","status"]],categories:["categories",["name","parent_id","image","sort_order","status"]],coupons:["coupons",["title","amount","threshold","expires_at","status","code"]]};
  for(const [resource,[table,fields]] of Object.entries(generic)){
    if(path===`/api/admin/${resource}`&&method==="GET")return json(await all(db,`SELECT * FROM ${table} ORDER BY id DESC LIMIT 1000`));
    if(path===`/api/admin/${resource}`&&method==="POST"){const x=await body(request),keys=fields.filter(k=>Object.hasOwn(x,k));if(!keys.length)return error("缺少内容");const r=await run(db,`INSERT INTO ${table}(${keys.join(",")}) VALUES(${placeholders(keys.length)})`,...keys.map(k=>x[k]));return json(await first(db,`SELECT * FROM ${table} WHERE id=?`,r.meta.last_row_id),201);}
    const m=path.match(new RegExp(`^/api/admin/${resource}/(\\d+)$`));if(m&&method==="PATCH"){const x=await body(request),keys=fields.filter(k=>Object.hasOwn(x,k));if(keys.length)await run(db,`UPDATE ${table} SET ${keys.map(k=>`${k}=?`).join(",")} WHERE id=?`,...keys.map(k=>x[k]),id(m[1]));return json(await first(db,`SELECT * FROM ${table} WHERE id=?`,id(m[1])));}if(m&&method==="DELETE"){await run(db,`DELETE FROM ${table} WHERE id=?`,id(m[1]));return json({ok:true});}
  }
  const issue=path.match(/^\/api\/admin\/coupons\/(\d+)\/issue$/);if(issue&&method==="POST"){const x=await body(request),couponId=id(issue[1]);if(x.user_id)await run(db,"INSERT OR IGNORE INTO user_coupons(user_id,coupon_id,status) VALUES(?,?,'available')",id(x.user_id),couponId);else await run(db,"INSERT OR IGNORE INTO user_coupons(user_id,coupon_id,status) SELECT id,?,'available' FROM users WHERE status='active'",couponId);return json({ok:true});}
  if(path==="/api/admin/reviews"&&method==="GET")return json(await all(db,`SELECT r.*,p.name pet_name,p.breed FROM product_reviews r JOIN pets p ON p.id=r.pet_id ${url.searchParams.get("pet_id")?"WHERE r.pet_id=?":""} ORDER BY r.id DESC LIMIT ?`,...([...(url.searchParams.get("pet_id")?[id(url.searchParams.get("pet_id"))]:[]),Math.min(500,Number(url.searchParams.get("pageSize"))||150)])));
  const review=path.match(/^\/api\/admin\/reviews\/(\d+)$/);if(review&&method==="PATCH"){const x=await body(request);await run(db,"UPDATE product_reviews SET status=? WHERE id=?",text(x.status,"published"),id(review[1]));return json({ok:true});}

  if(path==="/api/admin/feishu/configs"&&method==="GET")return json((await all(db,"SELECT * FROM feishu_sync_configs ORDER BY id DESC")).map(x=>({...x,secret_configured:Boolean(env.FEISHU_APP_SECRET)})));
  if(path==="/api/admin/feishu/configs"&&method==="POST"){
    const x=await body(request);let appToken=text(x.app_token);if(!appToken&&x.document_url){try{appToken=new URL(x.document_url).pathname.split("/").filter(Boolean).pop()||"";}catch{}}
    const existing=await first(db,"SELECT id FROM feishu_sync_configs WHERE app_token=? AND table_id=?",appToken,text(x.table_id));
    if(existing){await run(db,"UPDATE feishu_sync_configs SET name=?,document_url=?,field_mapping=?,status=?,app_id=?,base_url=? WHERE id=?",text(x.name,"福宠商品库"),text(x.document_url),JSON.stringify(x.field_mapping||{}),text(x.status,"active"),text(x.app_id,env.FEISHU_APP_ID||""),text(x.base_url,x.document_url||""),existing.id);return json(await first(db,"SELECT * FROM feishu_sync_configs WHERE id=?",existing.id));}
    const r=await run(db,"INSERT INTO feishu_sync_configs(name,document_url,app_token,table_id,field_mapping,status,app_id,base_url) VALUES(?,?,?,?,?,?,?,?)",text(x.name,"福宠商品库"),text(x.document_url),appToken,text(x.table_id),JSON.stringify(x.field_mapping||{}),text(x.status,"active"),text(x.app_id,env.FEISHU_APP_ID||""),text(x.base_url,x.document_url||""));return json(await first(db,"SELECT * FROM feishu_sync_configs WHERE id=?",r.meta.last_row_id),201);
  }
  if(path==="/api/admin/feishu/test-connection"&&method==="POST"){
    const x=await body(request),config=await first(db,"SELECT * FROM feishu_sync_configs WHERE id=?",id(x.config_id));if(!config)return error("同步配置不存在",404);
    const records=await feishuRecords(env,config,1);return json({ok:true,records_sampled:records.length,secret_configured:Boolean(env.FEISHU_APP_SECRET),table_id:config.table_id});
  }
  if(path==="/api/admin/feishu/previews"&&method==="GET")return json(await all(db,"SELECT id,config_id,status,stats_json,errors_json,created_at,confirmed_at,task_id FROM feishu_sync_previews ORDER BY id DESC LIMIT 30"));
  if(path==="/api/admin/feishu/tasks"&&method==="GET")return json(await all(db,"SELECT * FROM feishu_sync_tasks ORDER BY id DESC LIMIT 100"));
  if(path==="/api/admin/feishu/preview"&&method==="POST"){
    const x=await body(request),config=await first(db,"SELECT * FROM feishu_sync_configs WHERE id=?",id(x.config_id));if(!config)return error("同步配置不存在",404);
    const mapping=parse(config.field_mapping,{}),records=await feishuRecords(env,config);const items=records.map(record=>{const field=(key,fallback)=>feishuValue(record.fields?.[mapping[key]||fallback]);const media=(key,fallback)=>{const v=record.fields?.[mapping[key]||fallback];return(Array.isArray(v)?v:[]).map(i=>i.url||i.tmp_url||i.file_token).filter(Boolean);};return{external_id:record.record_id,name:text(field("name","商品名称"),`飞书商品${record.record_id.slice(-6)}`),breed:text(field("breed","品种"),"未分类"),seller_name:text(field("seller_name","商家名称"),"福宠认证宠物馆"),gender:text(field("gender","性别")),age_months:Number(field("age_months","年龄（月）"))||null,color:text(field("color","毛色")),body_type:text(field("body_type","体型")),personality:text(field("personality","性格")),health_status:text(field("health_status","健康状态")),vaccine_record:text(field("vaccine_record","疫苗记录")),description:text(field("description","详细介绍")),price:Number(field("price","价格"))||0,status:["上架","在售","published","available"].includes(text(field("status","商品状态")))?"published":"draft",images:media("images","主图文件"),videos:media("videos","视频文件"),stock:Math.max(0,Number(field("stock","库存"))||1),source:"feishu"};});
    const existing=await all(db,"SELECT external_id FROM pets WHERE source='feishu'");const known=new Set(existing.map(x=>x.external_id));const stats={total:items.length,create:items.filter(x=>!known.has(x.external_id)).length,update:items.filter(x=>known.has(x.external_id)).length,errors:items.filter(x=>!x.name||!x.breed).length};const r=await run(db,"INSERT INTO feishu_sync_previews(config_id,status,stats_json,items_json,errors_json) VALUES(?,'ready',?,?,'[]')",config.id,JSON.stringify(stats),JSON.stringify(items));return json({id:r.meta.last_row_id,config_id:config.id,status:"ready",stats,items:items.slice(0,100),errors:[]},201);
  }
  const commitPreview=path.match(/^\/api\/admin\/feishu\/previews\/(\d+)\/commit$/);
  if(commitPreview&&method==="POST"){
    const preview=await first(db,"SELECT * FROM feishu_sync_previews WHERE id=?",id(commitPreview[1]));if(!preview)return error("同步预览不存在",404);const items=parse(preview.items_json,[]);const task=await run(db,"INSERT INTO feishu_sync_tasks(config_id,mode,status,total,batch_size,processed,success,failed) VALUES(?,'incremental','running',?,100,0,0,0)",preview.config_id,items.length);const taskId=task.meta.last_row_id;let success=0,failed=0,rowNo=0;
    for(const item of items){rowNo++;try{let pet=await first(db,"SELECT id FROM pets WHERE source='feishu' AND external_id=?",item.external_id);if(pet){await run(db,"UPDATE pets SET name=?,breed=?,gender=?,age_months=?,color=?,body_type=?,personality=?,health_status=?,vaccine_record=?,description=?,price=?,seller_name=?,status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",item.name,item.breed,item.gender,item.age_months,item.color,item.body_type,item.personality,item.health_status,item.vaccine_record,item.description,item.price,item.seller_name,item.status,pet.id);}else{const r=await run(db,"INSERT INTO pets(name,breed,gender,age_months,color,body_type,personality,health_status,vaccine_record,description,price,seller_name,status,source,external_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,'feishu',?)",item.name,item.breed,item.gender,item.age_months,item.color,item.body_type,item.personality,item.health_status,item.vaccine_record,item.description,item.price,item.seller_name,item.status,item.external_id);pet={id:r.meta.last_row_id};await run(db,"INSERT INTO pet_products(pet_id,product_name,status) VALUES(?,?,?)",pet.id,item.name,item.status==="published"?"available":"offline");}
      await run(db,"INSERT INTO inventory(pet_id,total_stock,locked_stock,available_stock,low_stock_threshold) VALUES(?,?,0,?,1) ON CONFLICT(pet_id,sku_id) DO UPDATE SET total_stock=excluded.total_stock,available_stock=MAX(0,excluded.total_stock-inventory.locked_stock)",pet.id,item.stock,item.stock);for(const [index,media] of item.images.entries())await run(db,"INSERT OR IGNORE INTO pet_images(pet_id,url,type,sort_order) VALUES(?,?,?,?)",pet.id,media,index===0?"main":"gallery",index);for(const media of item.videos)await run(db,"INSERT OR IGNORE INTO pet_videos(pet_id,url,status) VALUES(?,?,'ready')",pet.id,media);success++;await run(db,"INSERT INTO feishu_sync_task_items(task_id,row_no,external_id,payload,status,processed_at) VALUES(?,?,?,?, 'success',CURRENT_TIMESTAMP)",taskId,rowNo,item.external_id,JSON.stringify(item));}catch(e){failed++;await run(db,"INSERT INTO feishu_sync_task_items(task_id,row_no,external_id,payload,status,error,processed_at) VALUES(?,?,?,?, 'failed',?,CURRENT_TIMESTAMP)",taskId,rowNo,item.external_id,JSON.stringify(item),e.message);}}
    await db.batch([db.prepare("UPDATE feishu_sync_tasks SET status=?,processed=?,success=?,failed=?,finished_at=CURRENT_TIMESTAMP WHERE id=?").bind(failed?"completed_with_errors":"completed",items.length,success,failed,taskId),db.prepare("UPDATE feishu_sync_previews SET status='confirmed',confirmed_at=CURRENT_TIMESTAMP,task_id=? WHERE id=?").bind(taskId,preview.id)]);return json({ok:true,task_id:taskId,total:items.length,success,failed});
  }
  if(path==="/api/admin/feishu/export-products"&&method==="POST")return error("当前生产版先支持飞书读取同步，反向写回将在配置飞书写权限后开放",501);
  const taskAction=path.match(/^\/api\/admin\/feishu\/tasks\/(\d+)\/(pause|resume|retry|errors)$/);if(taskAction){const taskId=id(taskAction[1]),action=taskAction[2];if(action==="errors")return json(await all(db,"SELECT * FROM feishu_sync_task_items WHERE task_id=? AND status='failed' ORDER BY row_no",taskId));await run(db,"UPDATE feishu_sync_tasks SET status=?,paused_at=? WHERE id=?",action==="pause"?"paused":"running",action==="pause"?now():null,taskId);return json({ok:true});}

  return null;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url), path = url.pathname, method = request.method.toUpperCase();
    try {
      let response = await handleMedia(request, env, url, path, method);
      if (!response && path.startsWith("/api/admin/")) response = await handleAdmin(request, env, url, path, method);
      if (!response) response = await handlePublic(request, env, url, path, method);
      if (!response) response = await handleCommerce(request, env, url, path, method);
      if (!response && path.startsWith("/api/")) response = error("接口不存在", 404);
      if (response) return response;
      const asset = await env.ASSETS.fetch(request);
      if ((asset.headers.get("content-type") || "").includes("text/html")) {
        const html = (await asset.text()).replaceAll("__FUCHONG_ORIGIN__", url.origin);
        const headers = new Headers(asset.headers); headers.delete("content-length");
        return new Response(html, { status: asset.status, headers });
      }
      return asset;
    } catch (cause) {
      const requestId = crypto.randomUUID();
      console.error(requestId, method, path, cause);
      try { await run(env.DB, "INSERT INTO api_error_logs(request_id,method,path,message,stack) VALUES(?,?,?,?,?)", requestId, method, path, String(cause?.message || cause), String(cause?.stack || "")); } catch {}
      return error("服务器处理失败", 500, { request_id: requestId });
    }
  },
};
