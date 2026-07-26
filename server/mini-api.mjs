import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { extname, join } from "node:path";
import { writeFileSync } from "node:fs";

const ACCESS_TTL_MS = 2 * 60 * 60 * 1000;
const REFRESH_TTL_DAYS = 30;
const LEGAL_DOCUMENTS = ["user", "transaction", "purchase", "after_sale", "privacy"];

const parseJson = (value, fallback) => {
  try { return JSON.parse(value); } catch { return fallback; }
};

export function createMiniApi({
  db,
  root,
  json,
  adminAuth,
  getPetDetail,
  getOrderQuote,
  nextOrderNumber,
  legalVersion,
  validLegalAcceptance,
  feishuService,
  customerServiceState,
}) {
  const enabled = () => process.env.NODE_ENV !== "production" || process.env.MINI_API_ENABLED === "true";
  const secret = () => process.env.MINI_TOKEN_SECRET || process.env.ADMIN_TOKEN_SECRET || "dev-mini-secret";
  const apiBase = () => String(process.env.PUBLIC_API_BASE || "https://petinmyall.me").replace(/\/$/, "");
  const cdnBase = () => String(process.env.MEDIA_CDN_BASE || "https://media.petinmyall.me").replace(/\/$/, "");
  const requestId = () => randomBytes(8).toString("hex");
  const ok = (res, status, data, meta = {}) => json(res, status, {
    ok: true,
    data,
    meta: { request_id: requestId(), version: "mini-v1", ...meta },
  });
  const fail = (res, status, code, message, details) => json(res, status, {
    ok: false,
    error: { code, message, ...(details ? { details } : {}) },
    request_id: requestId(),
  });
  const readBuffer = async (req, limit = 1024 * 1024) => {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > limit) throw Object.assign(new Error("请求内容过大"), { statusCode: 413 });
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  };
  const readJson = async (req) => {
    const buffer = await readBuffer(req);
    if (!buffer.length) return {};
    try { return JSON.parse(buffer.toString("utf8")); }
    catch { throw Object.assign(new Error("JSON 格式不正确"), { statusCode: 400 }); }
  };
  const b64 = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const signature = (value) => createHmac("sha256", secret()).update(value).digest("base64url");
  const accessTokenFor = (user, sessionId) => {
    const payload = b64({ sub: user.id, sid: sessionId, scope: "mini_user", exp: Date.now() + ACCESS_TTL_MS });
    return `${payload}.${signature(payload)}`;
  };
  const tokenPayload = (req) => {
    const raw = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    const [payload, supplied] = raw.split(".");
    if (!payload || !supplied) return null;
    const expected = Buffer.from(signature(payload));
    const actual = Buffer.from(supplied);
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
    const decoded = parseJson(Buffer.from(payload, "base64url").toString("utf8"), null);
    if (!decoded || decoded.scope !== "mini_user" || Number(decoded.exp) <= Date.now()) return null;
    const session = db.prepare(
      "SELECT id,user_id FROM mini_user_sessions WHERE id=? AND user_id=? AND revoked_at IS NULL AND datetime(expires_at)>datetime('now')",
    ).get(Number(decoded.sid), Number(decoded.sub));
    return session ? decoded : null;
  };
  const requireUser = (req, res) => {
    const token = tokenPayload(req);
    if (!token) { fail(res, 401, "MINI_AUTH_REQUIRED", "请先登录后继续"); return null; }
    const user = db.prepare("SELECT * FROM users WHERE id=?").get(Number(token.sub));
    if (!user || user.status !== "active") { fail(res, 403, "MINI_USER_DISABLED", "账号当前不可用，请联系客服"); return null; }
    return user;
  };
  const publicUrl = (value) => {
    const raw = String(value || "").trim();
    if (!raw) return "";
    if (/^https?:\/\//i.test(raw)) return raw.replace("https://petinmyall.me/uploads/", `${cdnBase()}/uploads/`);
    return `${apiBase()}${raw.startsWith("/") ? "" : "/"}${raw}`;
  };
  const productImage = (row) => publicUrl(row.showcase_image || row.image || row.thumbnail_url || row.highres_url);
  const serviceSessionFor = (userId) => {
    return customerServiceState.primaryForUser(userId);
  };
  const logisticsEventsFor = (orderId) => {
    const events = db.prepare(
      "SELECT * FROM logistics_events WHERE order_id=? ORDER BY id",
    ).all(orderId);
    const media = db.prepare(
      `SELECT id,media_type,display_url,thumbnail_url,poster_url,mime_type,
              byte_size,duration_seconds,processing_status,processing_error,
              sort_order,created_at,updated_at
       FROM logistics_event_media WHERE logistics_event_id=? ORDER BY sort_order,id`,
    );
    return events.map((event) => ({
      ...event,
      media: media.all(event.id).map((item) => ({
        ...item,
        display_url: publicUrl(item.display_url),
        thumbnail_url: publicUrl(item.thumbnail_url),
        poster_url: publicUrl(item.poster_url),
      })),
    }));
  };
  const listPets = ({ search = "", categoryId = 0, page = 1, pageSize = 20 } = {}) => {
    const query = `%${String(search).trim()}%`;
    const size = Math.min(50, Math.max(1, Number(pageSize) || 20));
    const offset = (Math.max(1, Number(page) || 1) - 1) * size;
    const filters = ["p.status='published'", "COALESCE(pp.status,'available')='available'"];
    const args = [];
    if (search) { filters.push("(p.name LIKE ? OR p.breed LIKE ? OR p.description LIKE ?)"); args.push(query, query, query); }
    if (categoryId) { filters.push("p.category_id=?"); args.push(Number(categoryId)); }
    const records = db.prepare(
      `SELECT p.id,p.name,p.breed,p.gender,p.age_months,p.price,p.health_status,p.seller_name,p.category_id,
              CASE WHEN p.source IN ('feishu','merchant') THEN '/api/media/product-showcase/'||p.id END AS showcase_image,
              COALESCE(p.thumbnail_url,p.highres_url,(SELECT COALESCE(pi.thumbnail_url,pi.webp_url,pi.url) FROM pet_images pi WHERE pi.pet_id=p.id ORDER BY pi.sort_order,pi.id LIMIT 1)) AS image
       FROM pets p LEFT JOIN pet_products pp ON pp.pet_id=p.id
       WHERE ${filters.join(" AND ")} ORDER BY p.id DESC LIMIT ? OFFSET ?`,
    ).all(...args, size, offset);
    return records.map((item) => ({ ...item, image: productImage(item) }));
  };
  const sessionTokens = (user, req, deviceId = "") => {
    const refreshToken = randomBytes(36).toString("base64url");
    const refreshHash = createHash("sha256").update(refreshToken).digest("hex");
    const created = db.prepare(
      `INSERT INTO mini_user_sessions(user_id,refresh_token_hash,device_id,user_agent,expires_at)
       VALUES(?,?,?,?,datetime('now',?))`,
    ).run(user.id, refreshHash, String(deviceId).slice(0, 120) || null, String(req.headers["user-agent"] || "").slice(0, 500), `+${REFRESH_TTL_DAYS} days`);
    return { access_token: accessTokenFor(user, Number(created.lastInsertRowid)), refresh_token: refreshToken, expires_in: ACCESS_TTL_MS / 1000 };
  };
  const wechatCodeToIdentity = async (code) => {
    if (process.env.NODE_ENV !== "production" && String(code).startsWith("test:"))
      return { openid: `mini:${String(code).slice(5) || "user"}`, unionid: null };
    const appid = process.env.WECHAT_MINI_APP_ID;
    const appsecret = process.env.WECHAT_MINI_APP_SECRET;
    if (!appid || !appsecret) throw Object.assign(new Error("微信登录尚未配置"), { statusCode: 503, code: "MINI_WECHAT_NOT_CONFIGURED" });
    const endpoint = new URL("https://api.weixin.qq.com/sns/jscode2session");
    endpoint.searchParams.set("appid", appid);
    endpoint.searchParams.set("secret", appsecret);
    endpoint.searchParams.set("js_code", String(code));
    endpoint.searchParams.set("grant_type", "authorization_code");
    const response = await fetch(endpoint, { signal: AbortSignal.timeout(8000) });
    const payload = await response.json();
    if (!response.ok || !payload.openid || payload.errcode)
      throw Object.assign(new Error("微信登录凭证无效，请重新进入小程序"), { statusCode: 401, code: "MINI_WECHAT_CODE_INVALID" });
    return { openid: String(payload.openid), unionid: payload.unionid ? String(payload.unionid) : null };
  };
  const classification = (text) => {
    const content = String(text || "");
    const groups = [
      ["after_sale", "售后服务", ["退款", "退货", "换货", "投诉", "售后"]],
      ["pet_health", "宠物健康咨询", ["生病", "呕吐", "腹泻", "疫苗", "健康", "不舒服"]],
      ["logistics", "物流帮助", ["物流", "快递", "发货", "配送", "托运", "什么时候到"]],
      ["order", "订单咨询", ["订单", "付款", "支付", "取消订单"]],
      ["purchase", "购买咨询", ["价格", "多少钱", "购买", "推荐", "品种", "有货", "还在"]],
    ];
    for (const [key, label, words] of groups) if (words.some((word) => content.includes(word))) return { key, label };
    return { key: "official", label: "官方客服" };
  };
  const knowledgeReply = (groupKey, content, pet) => {
    const knowledge = db.prepare(
      "SELECT * FROM customer_service_knowledge WHERE enabled=1 AND group_key IN (?, 'official') ORDER BY priority DESC,id",
    ).all(groupKey);
    for (const item of knowledge) {
      const words = String(item.keywords || "").split(/[,，、|]/).map((x) => x.trim()).filter(Boolean);
      if (words.some((word) => String(content).includes(word)))
        return String(item.answer).replaceAll("{petName}", pet?.name || "这只宠物");
    }
    return pet
      ? `收到啦，您问的是${pet.name || pet.breed}。您可以把最关心的价格、健康、配送或饲养问题直接告诉我，我帮您逐项说明～`
      : "收到啦，您可以把想咨询的商品、订单、售后、健康或物流问题直接告诉我，我来帮您处理～";
  };
  const parseMultipartFile = async (req) => {
    const contentType = String(req.headers["content-type"] || "");
    const boundary = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i)?.slice(1).find(Boolean);
    if (!boundary) throw Object.assign(new Error("上传格式不正确"), { statusCode: 400 });
    const input = await readBuffer(req, 10 * 1024 * 1024);
    const separator = Buffer.from(`--${boundary}`);
    let start = input.indexOf(separator);
    while (start >= 0) {
      const headerStart = start + separator.length + 2;
      const headerEnd = input.indexOf(Buffer.from("\r\n\r\n"), headerStart);
      if (headerEnd < 0) break;
      const headers = input.subarray(headerStart, headerEnd).toString("utf8");
      const next = input.indexOf(separator, headerEnd + 4);
      if (next < 0) break;
      if (/name="file"/i.test(headers)) {
        const fileName = headers.match(/filename="([^"]*)"/i)?.[1] || "upload";
        const mime = headers.match(/content-type:\s*([^\r\n]+)/i)?.[1]?.trim() || "application/octet-stream";
        return { fileName, mime, buffer: input.subarray(headerEnd + 4, Math.max(headerEnd + 4, next - 2)) };
      }
      start = next;
    }
    throw Object.assign(new Error("没有找到上传文件"), { statusCode: 400 });
  };
  const validateImage = ({ fileName, mime, buffer }) => {
    const extension = extname(fileName).toLowerCase();
    const allowed = new Map([[".jpg", "image/jpeg"], [".jpeg", "image/jpeg"], [".png", "image/png"], [".webp", "image/webp"]]);
    if (!allowed.has(extension) || !String(mime).startsWith("image/")) throw Object.assign(new Error("仅支持 JPG、PNG 和 WebP 图片"), { statusCode: 400 });
    if (!buffer.length || buffer.length > 8 * 1024 * 1024) throw Object.assign(new Error("图片不能为空且不能超过 8MB"), { statusCode: 400 });
    const valid = extension === ".png"
      ? buffer.subarray(0, 8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]))
      : extension === ".webp"
        ? buffer.subarray(0,4).toString("ascii") === "RIFF" && buffer.subarray(8,12).toString("ascii") === "WEBP"
        : buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    if (!valid) throw Object.assign(new Error("图片内容与扩展名不匹配"), { statusCode: 400 });
    return { extension, mime: allowed.get(extension) };
  };

  const handleAdminContent = async (req, res, path, method) => {
    if (!path.startsWith("/api/admin/home-content")) return false;
    const admin = adminAuth(req);
    if (!admin) { json(res, 401, { message: "未登录或登录已过期" }); return true; }
    if (path === "/api/admin/home-content" && method === "GET") {
      json(res, 200, db.prepare("SELECT * FROM home_content_blocks ORDER BY sort_order,id").all().map((row) => ({ ...row, payload: parseJson(row.payload_json, {}) })));
      return true;
    }
    if (path === "/api/admin/home-content" && method === "POST") {
      const data = await readJson(req);
      const key = String(data.block_key || "").trim();
      if (!/^[a-z0-9_-]{2,60}$/i.test(key)) { json(res, 400, { message: "内容标识不正确" }); return true; }
      db.prepare(
        `INSERT INTO home_content_blocks(block_key,title,payload_json,sort_order,status)
         VALUES(?,?,?,?,?) ON CONFLICT(block_key) DO UPDATE SET title=excluded.title,payload_json=excluded.payload_json,
         sort_order=excluded.sort_order,status=excluded.status,version=home_content_blocks.version+1,updated_at=CURRENT_TIMESTAMP`,
      ).run(key, String(data.title || "").slice(0, 100), JSON.stringify(data.payload || {}), Number(data.sort_order || 0), data.status === "inactive" ? "inactive" : "active");
      json(res, 200, { ok: true, block_key: key });
      return true;
    }
    return false;
  };

  const handle = async (req, res, url, path, method) => {
    if (await handleAdminContent(req, res, path, method)) return true;
    if (!path.startsWith("/api/mini/v1/")) return false;
    if (!enabled()) { fail(res, 503, "MINI_API_DISABLED", "小程序服务正在维护"); return true; }
    if (path === "/api/mini/v1/health" && method === "GET") { ok(res, 200, { database: true, mini_api: true, payment_enabled: false }); return true; }
    if (path === "/api/mini/v1/bootstrap" && method === "GET") {
      const categories = db.prepare("SELECT id,name,image,sort_order FROM categories WHERE status='active' ORDER BY sort_order,id").all().map((x) => ({ ...x, image: publicUrl(x.image) }));
      const banners = db.prepare("SELECT id,title,image,link,sort_order FROM banners WHERE status='active' ORDER BY sort_order,id").all().map((x) => ({ ...x, image: publicUrl(x.image) }));
      const blocks = db.prepare("SELECT block_key,title,payload_json,version FROM home_content_blocks WHERE status='active' ORDER BY sort_order,id").all().map((x) => ({ key: x.block_key, title: x.title, version: x.version, payload: parseJson(x.payload_json, {}) }));
      ok(res, 200, { brand: { name: "福宠", subtitle: "认真连接每一份陪伴" }, categories, banners, blocks, featured: listPets({ pageSize: 8 }), capabilities: { payment: false, customer_service: true, upload: true } });
      return true;
    }
    if (path === "/api/mini/v1/auth/login" && method === "POST") {
      const data = await readJson(req);
      if (!String(data.code || "").trim()) { fail(res, 400, "MINI_LOGIN_CODE_REQUIRED", "缺少微信登录凭证"); return true; }
      const identity = await wechatCodeToIdentity(data.code);
      let link = db.prepare("SELECT user_id FROM user_auth WHERE auth_type='wechat_mini' AND auth_value=?").get(identity.openid);
      let user;
      db.exec("BEGIN");
      try {
        if (!link) {
          const created = db.prepare(
            "INSERT INTO users(openid,wechat_openid,unionid,nickname,status,login_method,last_login_at) VALUES(?,?,?,?, 'active','wechat_mini',CURRENT_TIMESTAMP)",
          ).run(`mini:${identity.openid}`, identity.openid, identity.unionid, "福宠新朋友");
          db.prepare("INSERT INTO user_auth(user_id,auth_type,auth_value) VALUES(?,'wechat_mini',?)").run(created.lastInsertRowid, identity.openid);
          link = { user_id: Number(created.lastInsertRowid) };
        }
        user = db.prepare("SELECT * FROM users WHERE id=?").get(link.user_id);
        if (!user || user.status !== "active") throw Object.assign(new Error("账号当前不可用"), { statusCode: 403, code: "MINI_USER_DISABLED" });
        db.prepare("UPDATE users SET unionid=COALESCE(unionid,?),last_login_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(identity.unionid, user.id);
        db.prepare("INSERT INTO user_login_logs(user_id,login_type,ip,user_agent) VALUES(?,'wechat_mini',?,?)").run(user.id, String(req.socket.remoteAddress || ""), String(req.headers["user-agent"] || ""));
        db.exec("COMMIT");
      } catch (error) { db.exec("ROLLBACK"); throw error; }
      ok(res, 200, { user: { id: user.id, nickname: user.nickname, avatar: publicUrl(user.avatar), status: user.status }, tokens: sessionTokens(user, req, data.device_id) });
      return true;
    }
    if (path === "/api/mini/v1/auth/refresh" && method === "POST") {
      const data = await readJson(req);
      const refreshHash = createHash("sha256").update(String(data.refresh_token || "")).digest("hex");
      const session = db.prepare("SELECT * FROM mini_user_sessions WHERE refresh_token_hash=? AND revoked_at IS NULL AND datetime(expires_at)>datetime('now')").get(refreshHash);
      if (!session) { fail(res, 401, "MINI_REFRESH_INVALID", "登录已过期，请重新登录"); return true; }
      const user = db.prepare("SELECT * FROM users WHERE id=? AND status='active'").get(session.user_id);
      if (!user) { fail(res, 403, "MINI_USER_DISABLED", "账号当前不可用"); return true; }
      db.prepare("UPDATE mini_user_sessions SET revoked_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(session.id);
      ok(res, 200, { tokens: sessionTokens(user, req, data.device_id || session.device_id) });
      return true;
    }
    if (path === "/api/mini/v1/auth/logout" && method === "POST") {
      const token = tokenPayload(req);
      if (token) db.prepare("UPDATE mini_user_sessions SET revoked_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(Number(token.sid));
      ok(res, 200, { logged_out: true }); return true;
    }
    if (path === "/api/mini/v1/categories" && method === "GET") {
      ok(res, 200, db.prepare("SELECT id,name,parent_id,image,sort_order FROM categories WHERE status='active' ORDER BY sort_order,id").all().map((x) => ({ ...x, image: publicUrl(x.image) }))); return true;
    }
    if (path === "/api/mini/v1/pets" && method === "GET") {
      ok(res, 200, listPets({ search: url.searchParams.get("q") || "", categoryId: url.searchParams.get("category_id"), page: url.searchParams.get("page"), pageSize: url.searchParams.get("page_size") }), { page: Math.max(1, Number(url.searchParams.get("page") || 1)) }); return true;
    }
    const petRoute = path.match(/^\/api\/mini\/v1\/pets\/(\d+)$/);
    if (petRoute && method === "GET") {
      const pet = getPetDetail(Number(petRoute[1]));
      if (!pet) { fail(res, 404, "MINI_PET_NOT_FOUND", "商品不存在或已下架"); return true; }
      const normalize = (value) => Array.isArray(value) ? value.map((x) => typeof x === "string" ? publicUrl(x) : ({ ...x, url: publicUrl(x.url), thumbnail_url: publicUrl(x.thumbnail_url), webp_url: publicUrl(x.webp_url), cover_url: publicUrl(x.cover_url) })) : value;
      ok(res, 200, { ...pet, image: productImage(pet), thumbnail_url: publicUrl(pet.thumbnail_url), highres_url: publicUrl(pet.highres_url), images: normalize(pet.images), videos: normalize(pet.videos) }); return true;
    }
    const user = requireUser(req, res);
    if (!user) return true;
    if (path === "/api/mini/v1/me" && method === "GET") {
      const counts = db.prepare(`SELECT
        (SELECT COUNT(*) FROM favorites WHERE user_id=?) favorites,
        (SELECT COUNT(*) FROM cart_items WHERE user_id=?) cart,
        (SELECT COUNT(*) FROM footprints WHERE user_id=?) footprints,
        (SELECT COUNT(*) FROM orders WHERE user_id=?) orders`).get(user.id,user.id,user.id,user.id);
      ok(res, 200, { id: user.id, nickname: user.nickname, avatar: publicUrl(user.avatar), phone: user.phone || "", status: user.status, counts }); return true;
    }
    if (path === "/api/mini/v1/me" && method === "PATCH") {
      const data = await readJson(req);
      const nickname = String(data.nickname || user.nickname || "福宠用户").trim().slice(0, 30);
      const avatar = String(data.avatar || user.avatar || "").trim().slice(0, 1000) || null;
      db.prepare("UPDATE users SET nickname=?,avatar=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(nickname, avatar, user.id);
      ok(res, 200, { id: user.id, nickname, avatar: publicUrl(avatar) }); return true;
    }
    if (path === "/api/mini/v1/favorites" && method === "GET") {
      const items = db.prepare(`SELECT f.pet_id,f.created_at,p.name,p.breed,p.price,p.thumbnail_url,p.highres_url,
        (SELECT COALESCE(pi.thumbnail_url,pi.webp_url,pi.url) FROM pet_images pi WHERE pi.pet_id=p.id ORDER BY pi.sort_order,pi.id LIMIT 1) image
        FROM favorites f JOIN pets p ON p.id=f.pet_id WHERE f.user_id=? ORDER BY f.id DESC`).all(user.id).map((x) => ({ ...x, image: productImage(x) }));
      ok(res, 200, items); return true;
    }
    if (path === "/api/mini/v1/favorites" && method === "POST") {
      const data = await readJson(req); const petId = Number(data.pet_id);
      if (!getPetDetail(petId)) { fail(res, 404, "MINI_PET_NOT_FOUND", "商品不存在或已下架"); return true; }
      db.prepare("INSERT OR IGNORE INTO favorites(user_id,pet_id) VALUES(?,?)").run(user.id, petId); ok(res, 201, { pet_id: petId, favorite: true }); return true;
    }
    const favoriteRoute = path.match(/^\/api\/mini\/v1\/favorites\/(\d+)$/);
    if (favoriteRoute && method === "DELETE") { db.prepare("DELETE FROM favorites WHERE user_id=? AND pet_id=?").run(user.id, Number(favoriteRoute[1])); ok(res, 200, { pet_id: Number(favoriteRoute[1]), favorite: false }); return true; }
    if (path === "/api/mini/v1/footprints" && method === "GET") {
      const items = db.prepare(`SELECT f.id,f.pet_id,f.viewed_at,p.name,p.breed,p.price,p.thumbnail_url,p.highres_url,
        (SELECT COALESCE(pi.thumbnail_url,pi.webp_url,pi.url) FROM pet_images pi WHERE pi.pet_id=p.id ORDER BY pi.sort_order,pi.id LIMIT 1) image
        FROM footprints f JOIN pets p ON p.id=f.pet_id WHERE f.user_id=? ORDER BY f.viewed_at DESC LIMIT 100`).all(user.id).map((x) => ({ ...x, image: productImage(x) })); ok(res, 200, items); return true;
    }
    if (path === "/api/mini/v1/footprints" && method === "POST") { const data = await readJson(req); const petId = Number(data.pet_id); if (getPetDetail(petId)) db.prepare("INSERT INTO footprints(user_id,pet_id) VALUES(?,?)").run(user.id, petId); ok(res, 201, { pet_id: petId }); return true; }
    if (path === "/api/mini/v1/cart" && method === "GET") {
      const items = db.prepare(`SELECT c.id,c.pet_id,c.quantity,c.selected,p.name,p.breed,p.price,p.thumbnail_url,p.highres_url,
        (SELECT COALESCE(pi.thumbnail_url,pi.webp_url,pi.url) FROM pet_images pi WHERE pi.pet_id=p.id ORDER BY pi.sort_order,pi.id LIMIT 1) image
        FROM cart_items c JOIN pets p ON p.id=c.pet_id WHERE c.user_id=? ORDER BY c.updated_at DESC`).all(user.id).map((x) => ({ ...x, image: productImage(x) })); ok(res, 200, items); return true;
    }
    if (path === "/api/mini/v1/cart" && method === "POST") { const data = await readJson(req); const petId = Number(data.pet_id); if (!getPetDetail(petId)) { fail(res,404,"MINI_PET_NOT_FOUND","商品不存在或已下架"); return true; } db.prepare(`INSERT INTO cart_items(user_id,pet_id,quantity,selected) VALUES(?,?,?,1) ON CONFLICT(user_id,pet_id) DO UPDATE SET quantity=MIN(99,cart_items.quantity+excluded.quantity),updated_at=CURRENT_TIMESTAMP`).run(user.id,petId,Math.min(99,Math.max(1,Number(data.quantity||1)))); ok(res,201,{pet_id:petId}); return true; }
    const cartRoute = path.match(/^\/api\/mini\/v1\/cart\/(\d+)$/);
    if (cartRoute && method === "PATCH") { const data=await readJson(req); db.prepare("UPDATE cart_items SET quantity=?,selected=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=?").run(Math.min(99,Math.max(1,Number(data.quantity||1))),data.selected===false?0:1,Number(cartRoute[1]),user.id); ok(res,200,{id:Number(cartRoute[1])}); return true; }
    if (cartRoute && method === "DELETE") { db.prepare("DELETE FROM cart_items WHERE id=? AND user_id=?").run(Number(cartRoute[1]),user.id); ok(res,200,{deleted:true}); return true; }
    if (path === "/api/mini/v1/addresses" && method === "GET") { ok(res,200,db.prepare("SELECT * FROM addresses WHERE user_id=? ORDER BY is_default DESC,id DESC").all(user.id)); return true; }
    if (path === "/api/mini/v1/addresses" && method === "POST") { const d=await readJson(req); if(!d.name||!/^1\d{10}$/.test(String(d.phone||""))||!d.detail){fail(res,400,"MINI_ADDRESS_INVALID","请填写完整收货信息");return true;} db.exec("BEGIN"); try { if(d.is_default) db.prepare("UPDATE addresses SET is_default=0 WHERE user_id=?").run(user.id); const row=db.prepare("INSERT INTO addresses(user_id,name,phone,province,city,district,detail,is_default) VALUES(?,?,?,?,?,?,?,?)").run(user.id,String(d.name).slice(0,30),String(d.phone),String(d.province||""),String(d.city||""),String(d.district||""),String(d.detail).slice(0,300),d.is_default?1:0); db.exec("COMMIT"); ok(res,201,{id:Number(row.lastInsertRowid)}); } catch(e){db.exec("ROLLBACK");throw e;} return true; }
    const addressRoute=path.match(/^\/api\/mini\/v1\/addresses\/(\d+)$/);
    if(addressRoute&&method==="PATCH"){const d=await readJson(req);const current=db.prepare("SELECT * FROM addresses WHERE id=? AND user_id=?").get(Number(addressRoute[1]),user.id);if(!current){fail(res,404,"MINI_ADDRESS_NOT_FOUND","地址不存在");return true;}if(d.is_default)db.prepare("UPDATE addresses SET is_default=0 WHERE user_id=?").run(user.id);db.prepare("UPDATE addresses SET name=?,phone=?,province=?,city=?,district=?,detail=?,is_default=? WHERE id=? AND user_id=?").run(d.name||current.name,d.phone||current.phone,d.province??current.province,d.city??current.city,d.district??current.district,d.detail||current.detail,d.is_default===undefined?current.is_default:(d.is_default?1:0),current.id,user.id);ok(res,200,{id:current.id});return true;}
    if(addressRoute&&method==="DELETE"){db.prepare("DELETE FROM addresses WHERE id=? AND user_id=?").run(Number(addressRoute[1]),user.id);ok(res,200,{deleted:true});return true;}
    if(path==="/api/mini/v1/orders/quote"&&method==="GET"){const pet=getPetDetail(Number(url.searchParams.get("pet_id")));if(!pet){fail(res,404,"MINI_PET_NOT_FOUND","商品不存在或已下架");return true;}ok(res,200,getOrderQuote(user.id,pet));return true;}
    if(path==="/api/mini/v1/orders"&&method==="POST"){
      const d=await readJson(req); const pet=getPetDetail(Number(d.pet_id)); if(!pet){fail(res,404,"MINI_PET_NOT_FOUND","商品不存在或已下架");return true;}
      if(!validLegalAcceptance(d.legal_acceptance,LEGAL_DOCUMENTS)){fail(res,428,"MINI_LEGAL_ACCEPTANCE_REQUIRED","请先阅读并勾选交易协议",{required_version:legalVersion});return true;}
      const requestKey=String(d.client_request_id||"").trim().slice(0,120); if(!requestKey){fail(res,400,"MINI_REQUEST_ID_REQUIRED","缺少订单幂等标识");return true;}
      const existing=db.prepare("SELECT * FROM orders WHERE user_id=? AND client_request_id=?").get(user.id,requestKey);if(existing){ok(res,200,{...existing,idempotent:true});return true;}
      const address=d.address_id?db.prepare("SELECT * FROM addresses WHERE id=? AND user_id=?").get(Number(d.address_id),user.id):d.address;
      if(!address?.name||!address?.phone||!address?.detail){fail(res,400,"MINI_ADDRESS_REQUIRED","请选择完整收货地址");return true;}
      const stock=db.prepare("SELECT COALESCE(SUM(available_stock),0) available FROM inventory WHERE pet_id=?").get(pet.id);if(Number(stock?.available||0)<=0){fail(res,409,"MINI_OUT_OF_STOCK","库存不足");return true;}
      const quote=getOrderQuote(user.id,pet);db.exec("BEGIN");try{const no=nextOrderNumber();const created=db.prepare(`INSERT INTO orders(order_no,user_id,total_amount,address_snapshot,client_request_id,subtotal_amount,discount_amount,shipping_fee,guarantee_eligible,guarantee_policy,pet_insurance_deadline,pet_insurance_policy) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).run(no,user.id,quote.total_amount,JSON.stringify(address),requestKey,quote.list_price,quote.discount_amount,quote.shipping_fee,quote.guarantee_eligible?1:0,quote.guarantee_policy,quote.insurance_offer?.deadline||null,quote.insurance_offer?.policy||null);db.prepare("INSERT INTO order_items(order_id,pet_id,pet_snapshot,price) VALUES(?,?,?,?)").run(created.lastInsertRowid,pet.id,JSON.stringify({...pet,insurance_offer:quote.insurance_offer}),quote.pet_amount);db.prepare("INSERT INTO order_status_history(order_id,from_status,to_status,operator_type,operator_id,note) VALUES(?,NULL,'pending_payment','user',?,'微信小程序提交订单')").run(created.lastInsertRowid,user.id);const accept=db.prepare("INSERT INTO agreement_acceptances(user_id,order_id,subject_type,subject_id,document_key,document_version,acceptance_method,user_agent) VALUES(?,?,'order',?,?,?,?,?)");for(const key of LEGAL_DOCUMENTS)accept.run(user.id,created.lastInsertRowid,String(created.lastInsertRowid),key,legalVersion,"explicit_checkbox",String(req.headers["user-agent"]||"").slice(0,500)||null);db.exec("COMMIT");ok(res,201,{id:Number(created.lastInsertRowid),order_no:no,status:"pending_payment",payment_enabled:false,...quote});}catch(e){db.exec("ROLLBACK");throw e;}return true;
    }
    if(path==="/api/mini/v1/orders"&&method==="GET"){const items=db.prepare("SELECT * FROM orders WHERE user_id=? ORDER BY id DESC LIMIT 100").all(user.id).map((o)=>({...o,address:parseJson(o.address_snapshot,{}),items:db.prepare("SELECT * FROM order_items WHERE order_id=? ORDER BY id").all(o.id).map((i)=>({...i,pet:parseJson(i.pet_snapshot,{})}))}));ok(res,200,items);return true;}
    const orderRoute=path.match(/^\/api\/mini\/v1\/orders\/(\d+)$/);if(orderRoute&&method==="GET"){const order=db.prepare("SELECT * FROM orders WHERE id=? AND user_id=?").get(Number(orderRoute[1]),user.id);if(!order){fail(res,404,"MINI_ORDER_NOT_FOUND","订单不存在");return true;}ok(res,200,{...order,address:parseJson(order.address_snapshot,{}),items:db.prepare("SELECT * FROM order_items WHERE order_id=?").all(order.id).map((i)=>({...i,pet:parseJson(i.pet_snapshot,{})})),logistics:db.prepare("SELECT * FROM logistics WHERE order_id=?").get(order.id)||null,logistics_events:logisticsEventsFor(order.id)});return true;}
    if(path==="/api/mini/v1/service/sessions"&&method==="GET"){const session=serviceSessionFor(user.id);ok(res,200,session?[{...session,latest_message:db.prepare("SELECT content FROM messages WHERE session_id=? ORDER BY id DESC LIMIT 1").get(session.id)?.content||null,unread_count:db.prepare("SELECT COUNT(id) count FROM messages WHERE session_id=? AND sender IN ('service','agent') AND is_read=0").get(session.id).count}]:[]);return true;}
    const serviceMessages=path.match(/^\/api\/mini\/v1\/service\/sessions\/(\d+)\/messages$/);if(serviceMessages&&method==="GET"){const session=db.prepare("SELECT id FROM customer_service_sessions WHERE id=? AND user_id=?").get(Number(serviceMessages[1]),user.id);if(!session){fail(res,404,"MINI_SESSION_NOT_FOUND","会话不存在");return true;}ok(res,200,db.prepare("SELECT * FROM messages WHERE session_id=? AND user_id=? ORDER BY id").all(session.id,user.id));return true;}
    if(path==="/api/mini/v1/service/messages"&&method==="POST"){
      const d=await readJson(req);
      const content=String(d.content||"").trim().slice(0,2000);
      if(!content){fail(res,400,"MINI_MESSAGE_EMPTY","请输入咨询内容");return true;}
      const pet=d.product_id?getPetDetail(Number(d.product_id)):null;
      const requested=d.session_id?db.prepare("SELECT * FROM customer_service_sessions WHERE id=? AND user_id=?").get(Number(d.session_id),user.id):null;
      if(d.session_id&&!requested){fail(res,404,"MINI_SESSION_NOT_FOUND","会话不存在");return true;}
      let session=serviceSessionFor(user.id);
      const group=classification(content);
      if(!session){
        db.exec("BEGIN IMMEDIATE");
        try{
          session=db.prepare("SELECT * FROM customer_service_sessions WHERE user_id=? ORDER BY updated_at DESC,id DESC LIMIT 1").get(user.id);
          if(!session){
            const created=db.prepare("INSERT INTO customer_service_sessions(user_id,product_id,product_name,seller_name,source,status,service_type,seller_id,group_key,classification_confidence,last_customer_message_at) VALUES(?,?,?,?,?,'ai',?,?,?,?,CURRENT_TIMESTAMP)").run(user.id,d.product_id||null,d.product_name||pet?.name||null,d.seller_name||pet?.seller_name||"福宠认证商家","wechat_mini",group.label,d.seller_id||pet?.seller_id||null,group.key,0.8);
            const id=Number(created.lastInsertRowid);
            db.prepare("UPDATE customer_service_sessions SET customer_code=? WHERE id=?").run(`CS${String(id).padStart(6,"0")}`,id);
            session=db.prepare("SELECT * FROM customer_service_sessions WHERE id=?").get(id);
          }
          db.exec("COMMIT");
        }catch(error){db.exec("ROLLBACK");throw error;}
      }
      db.prepare("INSERT INTO messages(user_id,sender,type,content,session_id,product_id,product_name,seller_name,status,service_type,seller_id,channel) VALUES(?,'user','service',?,?,?,?,?,'sent',?,?,'wechat_mini')").run(user.id,content,session.id,d.product_id||null,d.product_name||pet?.name||null,d.seller_name||pet?.seller_name||"福宠认证商家",session.service_type,d.seller_id||pet?.seller_id||null);
      db.prepare("UPDATE customer_service_sessions SET last_customer_message_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(session.id);
      let reply=null;
      let delivery={delivered:false,reason:"not_required"};
      await new Promise((resolve)=>setTimeout(resolve,1000+Math.floor(Math.random()*1000)));
      session=customerServiceState.ensureFresh(session.id);
      if(["human","human_pending"].includes(session.status)){
        delivery=await feishuService.notify(session,content,session.handoff_reason||"微信小程序专员会话").catch((e)=>({delivered:false,reason:e.message||"delivery_failed"}));
      }else{
        reply=knowledgeReply(session.group_key||group.key,content,pet);
        db.prepare("INSERT INTO messages(user_id,sender,type,content,session_id,status,service_type,channel) VALUES(?,'service','service',?,?,'sent',?,'wechat_mini')").run(user.id,reply,session.id,session.service_type);
      }
      ok(res,201,{session_id:session.id,customer_code:session.customer_code,status:session.status,reply,feishu:delivery});return true;
    }
    const serviceHandoff=path.match(/^\/api\/mini\/v1\/service\/sessions\/(\d+)\/handoff$/);
    if(serviceHandoff&&method==="POST"){
      const d=await readJson(req);
      const session=db.prepare("SELECT * FROM customer_service_sessions WHERE id=? AND user_id=?").get(Number(serviceHandoff[1]),user.id);
      if(!session){fail(res,404,"MINI_SESSION_NOT_FOUND","会话不存在");return true;}
      const reason=String(d.reason||"用户主动申请福宠用户宠物专员").slice(0,500);
      if(!["human_pending","human"].includes(session.status)){
        customerServiceState.requestHandoff(session.id,reason,{actor:"customer",channel:"wechat_mini"});
      }
      const current=db.prepare("SELECT * FROM customer_service_sessions WHERE id=?").get(session.id);
      const delivery=await feishuService.notify(current,String(d.preview||"用户主动申请福宠用户宠物专员").slice(0,1000),reason).catch((e)=>({delivered:false,reason:e.message||"delivery_failed"}));
      ok(res,200,{session_id:current.id,status:current.status,feishu:delivery});return true;
    }
    const serviceRead=path.match(/^\/api\/mini\/v1\/service\/sessions\/(\d+)\/read$/);if(serviceRead&&method==="POST"){const changed=db.prepare("UPDATE messages SET is_read=1 WHERE session_id=? AND user_id=? AND sender IN ('service','agent')").run(Number(serviceRead[1]),user.id).changes;ok(res,200,{changed:Number(changed)});return true;}
    if(path==="/api/mini/v1/uploads"&&method==="POST"){const upload=await parseMultipartFile(req);const verified=validateImage(upload);const clean=String(upload.fileName||"image").replace(/[^a-zA-Z0-9._-]/g,"_").slice(-120);const stored=`mini-${Date.now()}-${randomBytes(5).toString("hex")}${verified.extension}`;writeFileSync(join(root,"uploads",stored),upload.buffer);const localUrl=`${apiBase()}/uploads/${stored}`;const cdnUrl=`${cdnBase()}/uploads/${stored}`;const created=db.prepare("INSERT INTO media_uploads(user_id,original_name,stored_name,mime_type,byte_size,sha256,local_url,cdn_url,status) VALUES(?,?,?,?,?,?,?,?, 'pending')").run(user.id,clean,stored,verified.mime,upload.buffer.length,createHash("sha256").update(upload.buffer).digest("hex"),localUrl,cdnUrl);ok(res,201,{id:Number(created.lastInsertRowid),url:localUrl,cdn_url:cdnUrl,status:"pending"});return true;}
    const uploadRoute=path.match(/^\/api\/mini\/v1\/uploads\/(\d+)$/);if(uploadRoute&&method==="GET"){const media=db.prepare("SELECT * FROM media_uploads WHERE id=? AND user_id=?").get(Number(uploadRoute[1]),user.id);if(!media){fail(res,404,"MINI_UPLOAD_NOT_FOUND","上传记录不存在");return true;}if(media.status==="pending"&&media.cdn_url){try{const response=await fetch(media.cdn_url,{method:"HEAD",signal:AbortSignal.timeout(3000)});if(response.ok){db.prepare("UPDATE media_uploads SET status='synced',updated_at=CURRENT_TIMESTAMP WHERE id=?").run(media.id);media.status="synced";}}catch{}}ok(res,200,media);return true;}
    fail(res,404,"MINI_ROUTE_NOT_FOUND","接口不存在");return true;
  };
  return { handle };
}
