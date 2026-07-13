import { createServer } from "node:http";
import { DatabaseSync } from "node:sqlite";
import {
  readFileSync,
  mkdirSync,
  existsSync,
  writeFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  randomBytes,
  scryptSync,
  timingSafeEqual,
  createHmac,
  sign as rsaSign,
  verify as rsaVerify,
  createDecipheriv,
} from "node:crypto";

const root = dirname(fileURLToPath(import.meta.url));
mkdirSync(join(root, "data"), { recursive: true });
mkdirSync(join(root, "uploads"), { recursive: true });
const dbPath = process.env.DB_PATH || join(root, "data", "fuchong.db");
const backupDir = join(root, "backups");
mkdirSync(backupDir, { recursive: true });
const shouldBackup = existsSync(dbPath) && statSync(dbPath).size > 0;
const db = new DatabaseSync(dbPath);
db.exec(
  "PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA busy_timeout=5000;",
);
if (shouldBackup) {
  const day = new Date().toISOString().slice(0, 10);
  const dailyBackup = join(backupDir, `fuchong-${day}.db`);
  if (!existsSync(dailyBackup))
    db.exec(`VACUUM INTO '${dailyBackup.replaceAll("'", "''")}'`);
}
db.exec(readFileSync(join(root, "schema.sql"), "utf8"));
const migrate = () => {
  const dir = join(root, "migrations");
  if (!existsSync(dir)) return;
  db.exec(
    "CREATE TABLE IF NOT EXISTS schema_migrations(id INTEGER PRIMARY KEY,name TEXT UNIQUE NOT NULL,applied_at TEXT DEFAULT CURRENT_TIMESTAMP)",
  );
  for (const file of readdirSync(dir)
    .filter((x) => x.endsWith(".sql"))
    .sort()) {
    if (db.prepare("SELECT id FROM schema_migrations WHERE name=?").get(file))
      continue;
    db.exec("BEGIN");
    try {
      db.exec(readFileSync(join(dir, file), "utf8"));
      db.prepare("INSERT INTO schema_migrations(name) VALUES(?)").run(file);
      db.exec("COMMIT");
      console.log(`数据库迁移完成: ${file}`);
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
  }
};
migrate();
const SECRET =
  process.env.ADMIN_TOKEN_SECRET ||
  process.env.JWT_SECRET ||
  "dev-only-change-in-production";
const hash = (password, salt) => scryptSync(password, salt, 64).toString("hex");
const initialAdminPassword = process.env.ADMIN_INITIAL_PASSWORD || "123456789";
const existingAdmin = db
  .prepare("SELECT * FROM admins WHERE username=?")
  .get("admin");
if (!existingAdmin) {
  const salt = randomBytes(16).toString("hex");
  db.prepare(
    "INSERT INTO admins(username,password_hash,salt) VALUES(?,?,?)",
  ).run("admin", hash(initialAdminPassword, salt), salt);
}
if (!db.prepare("SELECT id FROM users LIMIT 1").get())
  db.prepare("INSERT INTO users(nickname,phone) VALUES(?,?)").run(
    "福宠用户",
    "13800000000",
  );
for (const name of ["猫猫馆", "狗狗馆", "鸟类馆", "水族馆", "奇宠馆", "更多馆"])
  if (!db.prepare("SELECT id FROM categories WHERE name=? LIMIT 1").get(name))
    db.prepare("INSERT INTO categories(name,sort_order,status) VALUES(?,0,'active')").run(name);
const b64 = (x) => Buffer.from(JSON.stringify(x)).toString("base64url");
const sign = (x) => createHmac("sha256", SECRET).update(x).digest("base64url");
const tokenFor = (admin) => {
  const body = b64({
    sub: admin.id,
    username: admin.username,
    role: admin.role,
    exp: Date.now() + 86400000,
  });
  return `${body}.${sign(body)}`;
};
const auth = (req) => {
  const t = req.headers.authorization?.replace("Bearer ", "");
  if (!t) return null;
  const [b, s] = t.split(".");
  if (!b || !s) return null;
  const expected = Buffer.from(sign(b));
  const actual = Buffer.from(s);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual))
    return null;
  try {
    const p = JSON.parse(Buffer.from(b, "base64url"));
    return p.exp > Date.now() ? p : null;
  } catch {
    return null;
  }
};
const json = (res, status, data) => {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "content-type,authorization",
    "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
  });
  res.end(JSON.stringify(data));
};
const rawBody = async (req) => {
  let raw = "";
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > 25 * 1024 * 1024) throw new Error("请求内容过大");
    raw += c;
  }
  return raw;
};
const body = async (req) => {
  const raw = await rawBody(req);
  return raw ? JSON.parse(raw) : {};
};
const rows = (sql, ...args) => db.prepare(sql).all(...args);
const pageParams = (url, defaults = { pageSize: 12, max: 100 }) => {
  const page = Math.max(1, Number(url.searchParams.get("page") || 1));
  const pageSize = Math.min(
    defaults.max,
    Math.max(1, Number(url.searchParams.get("pageSize") || defaults.pageSize)),
  );
  return { page, pageSize, offset: (page - 1) * pageSize };
};
const petDetail = (id) => {
  const pet = db
    .prepare(
      `SELECT p.*,b.id AS breed_profile_id,b.intro AS breed_intro,b.origin AS breed_origin,
              b.growth_profile,b.standard_body,
              pp.id AS product_id,pp.status AS product_status
       FROM pets p
       LEFT JOIN breeds b ON b.id=p.breed_id OR b.name=p.breed
       LEFT JOIN pet_products pp ON pp.pet_id=p.id
       WHERE p.id=?`,
    )
    .get(id);
  if (!pet) return null;
  return {
    ...pet,
    breed_id: pet.breed_id || pet.breed_profile_id || null,
    seller_id: pet.seller_id || null,
    product_status:
      pet.status === "published"
        ? pet.product_status || "available"
        : pet.status === "sold"
          ? "sold"
          : "offline",
    breed_profile: {
      id: pet.breed_id || pet.breed_profile_id || null,
      name: pet.breed,
      intro: pet.breed_intro,
      origin: pet.breed_origin,
      growth_profile: pet.growth_profile,
      standard_body: pet.standard_body,
    },
    skus: rows("SELECT * FROM pet_skus WHERE pet_id=?", id),
    images: rows(
      "SELECT * FROM pet_images WHERE pet_id=? ORDER BY sort_order",
      id,
    ),
    videos: rows("SELECT * FROM pet_videos WHERE pet_id=?", id),
    inventory: rows("SELECT * FROM inventory WHERE pet_id=?", id),
  };
};
const aiReply = (text, pet) => {
  const q = String(text || "");
  if (q.includes("价格") || q.includes("多少钱"))
    return pet
      ? `${pet.name}当前展示价为 ¥${pet.price}，下单后会进入平台担保流程。`
      : "您可以在商品详情页查看实时价格，也可以发给我具体宠物名称。";
  if (q.includes("健康") || q.includes("疫苗"))
    return pet
      ? `${pet.name}健康状态：${pet.health_status || "健康"}；疫苗记录：${pet.vaccine_record || "待商家补充"}。`
      : "平台商品会展示健康状态、疫苗记录和售后保障。";
  if (q.includes("品种"))
    return pet
      ? `这只宠物品种是${pet.breed}，详情页包含品种特征、成长记录和起源资料。`
      : "您可以从场馆进入具体品种页，我会根据商品资料回答。";
  if (q.includes("人工"))
    return "我已经为您准备转人工入口，点击“转人工客服”后后台会进入人工队列。";
  return pet
    ? `关于 ${pet.name}（${pet.breed}），我可以帮您查询价格、健康、疫苗、库存和购买流程。`
    : "您好，我是福宠 AI 客服，可以咨询商品、订单、物流、售后，也可以转人工。";
};
const logAdmin = (admin, req, action, resource, resourceId, detail = {}) => {
  if (!admin || !admin.sub) return;
  db.prepare(
    "INSERT INTO admin_operation_logs(admin_id,action,resource,resource_id,detail,ip) VALUES(?,?,?,?,?,?)",
  ).run(
    admin.sub,
    action,
    resource,
    String(resourceId ?? ""),
    JSON.stringify(detail),
    req.socket.remoteAddress || "",
  );
};
const wechatConfig = () => {
  const config = {
    appId: process.env.WECHAT_PAY_APP_ID,
    mchId: process.env.WECHAT_PAY_MCH_ID,
    serialNo: process.env.WECHAT_PAY_SERIAL_NO,
    privateKeyPath: process.env.WECHAT_PAY_PRIVATE_KEY_PATH,
    platformPublicKeyPath: process.env.WECHAT_PAY_PLATFORM_PUBLIC_KEY_PATH,
    apiV3Key: process.env.WECHAT_PAY_API_V3_KEY,
    notifyUrl: process.env.WECHAT_PAY_NOTIFY_URL,
  };
  const prepayRequired = [
    "appId",
    "mchId",
    "serialNo",
    "privateKeyPath",
    "notifyUrl",
  ];
  const notifyRequired = ["platformPublicKeyPath", "apiV3Key"];
  const prepayMissing = prepayRequired.filter((key) => !config[key]);
  const notifyMissing = notifyRequired.filter((key) => !config[key]);
  return {
    ...config,
    prepayMissing,
    notifyMissing,
    prepayReady: prepayMissing.length === 0,
    notifyReady: notifyMissing.length === 0,
  };
};
const wechatAuthorization = (method, requestPath, payload, config) => {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const nonce = randomBytes(16).toString("hex");
  const message = `${method}\n${requestPath}\n${timestamp}\n${nonce}\n${payload}\n`;
  const signature = rsaSign(
    "RSA-SHA256",
    Buffer.from(message),
    readFileSync(config.privateKeyPath, "utf8"),
  ).toString("base64");
  return {
    timestamp,
    nonce,
    value: `WECHATPAY2-SHA256-RSA2048 mchid="${config.mchId}",nonce_str="${nonce}",signature="${signature}",timestamp="${timestamp}",serial_no="${config.serialNo}"`,
  };
};
const wechatClientPayment = (prepayId, config) => {
  const timeStamp = String(Math.floor(Date.now() / 1000));
  const nonceStr = randomBytes(16).toString("hex");
  const packageValue = `prepay_id=${prepayId}`;
  const message = `${config.appId}\n${timeStamp}\n${nonceStr}\n${packageValue}\n`;
  return {
    timeStamp,
    nonceStr,
    package: packageValue,
    signType: "RSA",
    paySign: rsaSign(
      "RSA-SHA256",
      Buffer.from(message),
      readFileSync(config.privateKeyPath, "utf8"),
    ).toString("base64"),
  };
};
const decryptWechatResource = (resource, apiV3Key) => {
  const encrypted = Buffer.from(resource.ciphertext, "base64");
  const authTag = encrypted.subarray(encrypted.length - 16);
  const ciphertext = encrypted.subarray(0, encrypted.length - 16);
  const decipher = createDecipheriv(
    "aes-256-gcm",
    Buffer.from(apiV3Key, "utf8"),
    Buffer.from(resource.nonce, "utf8"),
  );
  decipher.setAAD(Buffer.from(resource.associated_data || "", "utf8"));
  decipher.setAuthTag(authTag);
  return JSON.parse(
    Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString(
      "utf8",
    ),
  );
};
const markOrderPaid = (order, payment) => {
  const existing = db
    .prepare(
      "SELECT * FROM payments WHERE order_id=? AND status='paid' ORDER BY id DESC LIMIT 1",
    )
    .get(order.id);
  if (existing) return { payment: existing, idempotent: true };
  if (Number(payment.amount) !== Number(order.total_amount))
    throw new Error("支付金额与订单金额不一致");
  db.exec("BEGIN");
  try {
    const inserted = db
      .prepare(
        "INSERT INTO payments(order_id,payment_no,channel,amount,status,paid_at,raw_payload) VALUES(?,?,?,?,?,?,?)",
      )
      .run(
        order.id,
        payment.paymentNo,
        payment.channel,
        payment.amount,
        "paid",
        payment.paidAt || new Date().toISOString(),
        JSON.stringify(payment.raw || {}),
      );
    db.prepare(
      "UPDATE orders SET payment_status='paid',status='pending_ship',paid_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?",
    ).run(order.id);
    db.exec("COMMIT");
    return {
      payment: db
        .prepare("SELECT * FROM payments WHERE id=?")
        .get(inserted.lastInsertRowid),
      idempotent: false,
    };
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
};
const syncQueues = new Map();
const generateSyncItems = (total = 500) =>
  Array.from({ length: total }, (_, i) => ({
    name: `同步宠物 ${i + 1}`,
    category_id: (i % 6) + 1,
    breed: ["布偶猫", "金毛", "虎皮鹦鹉", "锦鲤", "垂耳兔", "公益领养"][i % 6],
    gender: i % 2 ? "男" : "女",
    age_months: (i % 12) + 1,
    color: ["海豹双色", "金色", "蓝白", "锦色"][i % 4],
    body_type: ["小型", "中型", "大型"][i % 3],
    personality: "亲人稳定",
    health_status: "健康",
    vaccine_record: "同步档案待复核",
    description: "外部商品库同步数据",
    price: 2999 + (i % 50) * 100,
    seller_name: "福宠同步商家",
    status: "published",
    source: "feishu",
    external_id: `mock-${i + 1}`,
    stock: 1,
  }));
const feishuValue = (value) => {
  if (value == null) return null;
  if (typeof value === "string" || typeof value === "number") return value;
  if (Array.isArray(value))
    return value
      .map((item) =>
        typeof item === "object"
          ? item.url || item.tmp_url || item.text || item.name || ""
          : item,
      )
      .filter(Boolean);
  if (typeof value === "object")
    return value.url || value.tmp_url || value.text || value.name || null;
  return String(value);
};
const feishuItems = async (config) => {
  const appId = config.app_id || process.env.FEISHU_APP_ID;
  const appSecret = process.env.FEISHU_APP_SECRET;
  const missingCredentials = [
    !appId ? "FEISHU_APP_ID" : null,
    !appSecret ? "FEISHU_APP_SECRET" : null,
  ].filter(Boolean);
  if (missingCredentials.length)
    throw new Error(`缺少 ${missingCredentials.join("、")} 环境变量`);
  const appToken =
    config.app_token ||
    String(config.document_url || "").match(/\/base\/([^/?#]+)/)?.[1];
  const tableId = config.table_id;
  if (!appToken || !tableId) throw new Error("飞书 app_token 或 table_id 未配置");
  const authResponse = await fetch(
    "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
    },
  );
  const authData = await authResponse.json();
  if (!authResponse.ok || authData.code)
    throw new Error(authData.msg || "获取飞书 tenant_access_token 失败");
  const mapping = JSON.parse(config.field_mapping || "{}");
  const field = (record, key, fallback) =>
    feishuValue(record.fields?.[mapping[key] || fallback]);
  const records = [];
  let pageToken = "";
  for (let page = 0; page < 200; page++) {
    const endpoint = new URL(
      `https://open.feishu.cn/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/records`,
    );
    endpoint.searchParams.set("page_size", "500");
    if (pageToken) endpoint.searchParams.set("page_token", pageToken);
    const response = await fetch(endpoint, {
      headers: { Authorization: `Bearer ${authData.tenant_access_token}` },
    });
    const data = await response.json();
    if (!response.ok || data.code)
      throw new Error(data.msg || "读取飞书多维表格失败");
    records.push(...(data.data?.items || []));
    if (!data.data?.has_more) break;
    pageToken = data.data.page_token;
  }
  return records.map((record) => {
    const images = field(record, "images", "图片");
    const videos = field(record, "videos", "视频");
    return {
      name: field(record, "name", "宠物名称"),
      category_id: Number(field(record, "category_id", "分类ID") || 1),
      breed: field(record, "breed", "品种"),
      gender: field(record, "gender", "性别"),
      age_months: Number(field(record, "age_months", "月龄") || 0) || null,
      color: field(record, "color", "毛色"),
      body_type: field(record, "body_type", "体型"),
      personality: field(record, "personality", "性格"),
      health_status: field(record, "health_status", "健康状态"),
      vaccine_record: field(record, "vaccine_record", "疫苗记录"),
      description: field(record, "description", "商品详情"),
      price: Number(field(record, "price", "价格") || 0),
      seller_name: field(record, "seller_name", "商家名称"),
      status: field(record, "status", "商品状态") || "draft",
      source: "feishu",
      external_id: record.record_id,
      stock: Number(field(record, "stock", "库存") || 1),
      images: Array.isArray(images) ? images : images ? [images] : [],
      videos: Array.isArray(videos) ? videos : videos ? [videos] : [],
    };
  });
};
const processSyncTask = (taskId, items) => {
  const state = syncQueues.get(taskId);
  if (!state || state.paused) return;
  const task = db
    .prepare("SELECT * FROM feishu_sync_tasks WHERE id=?")
    .get(taskId);
  if (!task || ["completed", "paused"].includes(task.status)) return;
  const batchSize = Number(task.batch_size || 500);
  const start = Number(task.processed || 0);
  const batch = items.slice(start, start + batchSize);
  if (!batch.length) {
    db.prepare(
      "UPDATE feishu_sync_tasks SET status='completed',finished_at=CURRENT_TIMESTAMP WHERE id=?",
    ).run(taskId);
    syncQueues.delete(taskId);
    return;
  }
  db.exec("BEGIN");
  let success = 0;
  let failed = 0;
  try {
    const insertPet = db.prepare(
      `INSERT INTO pets(name,category_id,breed,gender,age_months,color,body_type,personality,health_status,vaccine_record,description,price,seller_name,status,source,external_id)
       VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(source,external_id) DO UPDATE SET
       name=excluded.name,category_id=excluded.category_id,breed=excluded.breed,price=excluded.price,status=excluded.status,updated_at=CURRENT_TIMESTAMP`,
    );
    for (const [i, item] of batch.entries()) {
      try {
        if (!item.name || !item.breed || !item.price)
          throw new Error("缺少名称、品种或价格");
        insertPet.run(
          item.name,
          item.category_id || 1,
          item.breed,
          item.gender ?? null,
          item.age_months ?? null,
          item.color ?? null,
          item.body_type ?? null,
          item.personality ?? null,
          item.health_status ?? null,
          item.vaccine_record ?? null,
          item.description ?? null,
          item.price,
          item.seller_name ?? null,
          item.status || "draft",
          item.source || "feishu",
          item.external_id || `task-${taskId}-${start + i + 1}`,
        );
        const petId = db
          .prepare("SELECT id FROM pets WHERE source=? AND external_id=?")
          .get(
            item.source || "feishu",
            item.external_id || `task-${taskId}-${start + i + 1}`,
          )?.id;
        const breed = db
          .prepare("SELECT id FROM breeds WHERE name=?")
          .get(item.breed);
        let breedId = breed?.id;
        if (!breedId) {
          const createdBreed = db
            .prepare(
              "INSERT INTO breeds(name,category_id,intro,origin,growth_profile,standard_body) VALUES(?,?,?,?,?,?)",
            )
            .run(
              item.breed,
              item.category_id || 1,
              `${item.breed}标准品种档案`,
              "待运营补充",
              "待运营补充",
              item.body_type || "待运营补充",
            );
          breedId = createdBreed.lastInsertRowid;
        }
        if (petId)
          db.prepare("UPDATE pets SET breed_id=? WHERE id=?").run(breedId, petId);
        if (petId)
          db.prepare(
            "INSERT INTO pet_products(pet_id,breed_id,seller_id,product_name,status) VALUES(?,?,?,?,?) ON CONFLICT(pet_id) DO UPDATE SET breed_id=excluded.breed_id,product_name=excluded.product_name,status=excluded.status,updated_at=CURRENT_TIMESTAMP",
          ).run(
            petId,
            breedId,
            item.seller_id || null,
            item.name,
            item.status === "published" ? "available" : "offline",
          );
        if (petId)
          db.prepare(
            "INSERT INTO inventory(pet_id,total_stock,available_stock) SELECT ?,?,? WHERE NOT EXISTS (SELECT 1 FROM inventory WHERE pet_id=? AND sku_id IS NULL)",
          ).run(petId, Number(item.stock || 1), Number(item.stock || 1), petId);
        if (petId)
          db.prepare(
            "UPDATE inventory SET total_stock=?,available_stock=MAX(available_stock,?),updated_at=CURRENT_TIMESTAMP WHERE pet_id=? AND sku_id IS NULL",
          ).run(Number(item.stock || 1), Number(item.stock || 1), petId);
        for (const [imageIndex, imageUrl] of (item.images || []).entries())
          if (petId && imageUrl)
            db.prepare(
              "INSERT OR IGNORE INTO pet_images(pet_id,url,type,sort_order) VALUES(?,?,?,?)",
            ).run(petId, String(imageUrl), "gallery", imageIndex);
        for (const videoUrl of item.videos || [])
          if (petId && videoUrl)
            db.prepare(
              "INSERT OR IGNORE INTO pet_videos(pet_id,url,status) VALUES(?,?,?)",
            ).run(petId, String(videoUrl), "pending_transcode");
        success++;
      } catch (e) {
        failed++;
        db.prepare(
          "INSERT INTO sync_task_errors(task_id,row_no,payload,error) VALUES(?,?,?,?)",
        ).run(taskId, start + i + 1, JSON.stringify(item), e.message);
      }
    }
    db.prepare(
      "UPDATE feishu_sync_tasks SET status='running',processed=processed+?,success=success+?,failed=failed+? WHERE id=?",
    ).run(batch.length, success, failed, taskId);
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    db.prepare(
      "UPDATE feishu_sync_tasks SET status='failed',error=?,retry_count=retry_count+1,finished_at=CURRENT_TIMESTAMP WHERE id=?",
    ).run(e.message, taskId);
    syncQueues.delete(taskId);
    return;
  }
  setTimeout(() => processSyncTask(taskId, items), 0);
};

createServer(async (req, res) => {
  try {
    if (req.method === "OPTIONS") return json(res, 204, {});
    const url = new URL(req.url, "http://localhost");
    const path = url.pathname;
    const method = req.method;
    if (path.startsWith("/uploads/") && method === "GET") {
      const file = join(root, "uploads", path.slice(9));
      if (!existsSync(file)) return json(res, 404, { message: "文件不存在" });
      const contentTypes = {
        ".mp4": "video/mp4",
        ".png": "image/png",
        ".webp": "image/webp",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
      };
      res.writeHead(200, {
        "content-type":
          contentTypes[extname(file).toLowerCase()] || "application/octet-stream",
        "access-control-allow-origin": "*",
        "cache-control": "public,max-age=31536000,immutable",
      });
      return res.end(readFileSync(file));
    }
    if (path === "/api/health")
      return json(res, 200, { ok: true, database: true });
    if (path === "/api/visitors/session" && method === "POST") {
      const d = await body(req),
        token = String(d.token || randomBytes(18).toString("hex"));
      let visitor = db
        .prepare("SELECT * FROM visitors WHERE token=?")
        .get(token);
      if (visitor) {
        db.prepare(
          "UPDATE visitors SET last_seen=CURRENT_TIMESTAMP,visit_count=visit_count+1 WHERE id=?",
        ).run(visitor.id);
      } else {
        const u = db
          .prepare("INSERT INTO users(openid,nickname,status) VALUES(?,?,?)")
          .run(`guest:${token}`, "访客用户", "guest");
        const v = db
          .prepare("INSERT INTO visitors(token,user_id) VALUES(?,?)")
          .run(token, u.lastInsertRowid);
        visitor = { id: v.lastInsertRowid, token, user_id: u.lastInsertRowid };
      }
      return json(res, 200, {
        token,
        userId: visitor.user_id,
        visitorId: visitor.id,
      });
    }
    if (path === "/api/users/login" && method === "POST") {
      const d = await body(req);
      const account =
        d.account ||
        d.phone ||
        d.openid ||
        `mock:${randomBytes(8).toString("hex")}`;
      let user = db
        .prepare(
          "SELECT * FROM users WHERE account=? OR phone=? OR openid=? OR wechat_openid=? LIMIT 1",
        )
        .get(account, d.phone || "", d.openid || "", d.openid || "");
      if (user) {
        if (user.status === "disabled")
          return json(res, 403, { message: "账号已停用，请联系客服" });
        db.prepare(
          "UPDATE users SET account=COALESCE(?,account),phone=COALESCE(?,phone),openid=COALESCE(?,openid),wechat_openid=COALESCE(?,wechat_openid),unionid=COALESCE(?,unionid),nickname=COALESCE(?,nickname),avatar=COALESCE(?,avatar),login_method=COALESCE(?,login_method),last_login_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?",
        ).run(
          account,
          d.phone || null,
          d.openid || null,
          d.openid || null,
          d.unionid || null,
          d.nickname || null,
          d.avatar || null,
          d.login_type || "mock_wechat",
          user.id,
        );
      } else {
        const r = db
          .prepare(
            "INSERT INTO users(account,openid,wechat_openid,unionid,nickname,avatar,phone,status,login_method,last_login_at) VALUES(?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)",
          )
          .run(
            account,
            d.openid || null,
            d.openid || null,
            d.unionid || null,
            d.nickname || "福宠新朋友",
            d.avatar || null,
            d.phone || null,
            "active",
            d.login_type || "mock_wechat",
          );
        user = db
          .prepare("SELECT * FROM users WHERE id=?")
          .get(r.lastInsertRowid);
      }
      db.prepare(
        "INSERT INTO user_login_logs(user_id,login_type,ip,user_agent) VALUES(?,?,?,?)",
      ).run(
        user.id,
        d.login_type || "mock_wechat",
        req.socket.remoteAddress || "",
        req.headers["user-agent"] || "",
      );
      db.prepare(
        "INSERT OR IGNORE INTO user_auth(user_id,auth_type,auth_value) VALUES(?,?,?)",
      ).run(
        user.id,
        d.login_type === "phone" ? "phone" : "wechat",
        d.phone || d.openid || account,
      );
      return json(res, 200, {
        id: user.id,
        nickname: d.nickname || user.nickname,
        avatar: d.avatar || user.avatar,
        phone: d.phone || user.phone || "",
        login_method: d.login_type || user.login_method || "mock_wechat",
      });
    }
    const bindPhoneRoute = path.match(/^\/api\/users\/(\d+)\/bind-phone$/);
    if (bindPhoneRoute && method === "PATCH") {
      const d = await body(req);
      const id = Number(bindPhoneRoute[1]);
      if (Number(d.user_id) !== id)
        return json(res, 403, { message: "无权修改该用户" });
      const phone = String(d.phone || "").trim();
      if (!/^1\d{10}$/.test(phone))
        return json(res, 400, { message: "请填写正确的11位手机号" });
      const duplicate = db
        .prepare("SELECT id FROM users WHERE phone=? AND id<>?")
        .get(phone, id);
      if (duplicate) return json(res, 409, { message: "该手机号已绑定其他账号" });
      db.prepare(
        "UPDATE users SET phone=?,login_method=COALESCE(login_method,'wechat'),updated_at=CURRENT_TIMESTAMP WHERE id=?",
      ).run(phone, id);
      db.prepare(
        "INSERT OR REPLACE INTO user_auth(user_id,auth_type,auth_value) VALUES(?,?,?)",
      ).run(id, "phone", phone);
      return json(res, 200, { ok: true, phone });
    }
    const userAuthRoute = path.match(/^\/api\/users\/(\d+)\/auth$/);
    if (userAuthRoute && method === "POST") {
      const d = await body(req);
      const id = Number(userAuthRoute[1]);
      if (Number(d.user_id) !== id)
        return json(res, 403, { message: "无权修改该用户" });
      if (!['wechat', 'phone'].includes(d.auth_type) || !String(d.auth_value || "").trim())
        return json(res, 400, { message: "关联登录参数不完整" });
      const conflict = db
        .prepare(
          "SELECT user_id FROM user_auth WHERE auth_type=? AND auth_value=? AND user_id<>?",
        )
        .get(d.auth_type, d.auth_value, id);
      if (conflict) return json(res, 409, { message: "该登录方式已关联其他账号" });
      db.prepare(
        "INSERT OR REPLACE INTO user_auth(user_id,auth_type,auth_value) VALUES(?,?,?)",
      ).run(id, d.auth_type, String(d.auth_value).trim());
      db.prepare(
        "UPDATE users SET login_method=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",
      ).run(d.auth_type, id);
      return json(res, 200, { ok: true, login_method: d.auth_type });
    }
    const userSummaryRoute = path.match(/^\/api\/users\/(\d+)\/summary$/);
    if (userSummaryRoute && method === "GET") {
      const id = Number(userSummaryRoute[1]);
      if (!db.prepare("SELECT id FROM users WHERE id=?").get(id))
        return json(res, 404, { message: "用户不存在" });
      const count = (sql, ...args) => db.prepare(sql).get(...args).count;
      return json(res, 200, {
        favorites: count("SELECT COUNT(*) AS count FROM favorites WHERE user_id=?", id),
        footprints: count("SELECT COUNT(*) AS count FROM footprints WHERE user_id=?", id),
        coupons: count(
          "SELECT COUNT(*) AS count FROM user_coupons WHERE user_id=? AND status='available'",
          id,
        ),
        orders: Object.fromEntries(
          rows(
            "SELECT status,COUNT(*) AS count FROM orders WHERE user_id=? GROUP BY status",
            id,
          ).map((item) => [item.status, item.count]),
        ),
        spending: db
          .prepare(
            "SELECT COUNT(*) AS order_count,COALESCE(SUM(total_amount),0) AS amount FROM orders WHERE user_id=? AND payment_status='paid'",
          )
          .get(id),
      });
    }
    const publicUserRoute = path.match(/^\/api\/users\/(\d+)$/);
    if (publicUserRoute && method === "GET") {
      const user = db
        .prepare(
          "SELECT id,nickname,avatar,phone,status,login_method,last_login_at,created_at FROM users WHERE id=?",
        )
        .get(Number(publicUserRoute[1]));
      return json(res, user ? 200 : 404, user || { message: "用户不存在" });
    }
    if (publicUserRoute && method === "PATCH") {
      const d = await body(req);
      const id = Number(publicUserRoute[1]);
      if (Number(d.user_id) !== id)
        return json(res, 403, { message: "无权修改该用户" });
      const user = db.prepare("SELECT * FROM users WHERE id=?").get(id);
      if (!user) return json(res, 404, { message: "用户不存在" });
      const nickname = String(d.nickname ?? user.nickname).trim();
      if (!nickname) return json(res, 400, { message: "昵称不能为空" });
      db.prepare(
        "UPDATE users SET nickname=?,avatar=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",
      ).run(nickname, d.avatar ?? user.avatar, id);
      return json(
        res,
        200,
        db
          .prepare(
            "SELECT id,nickname,avatar,phone,status,login_method,last_login_at,created_at FROM users WHERE id=?",
          )
          .get(id),
      );
    }
    if (path === "/api/admin/login" && method === "POST") {
      const d = await body(req),
        a = db.prepare("SELECT * FROM admins WHERE username=?").get(d.username);
      if (!a || hash(d.password, a.salt) !== a.password_hash)
        return json(res, 401, { message: "账号或密码错误" });
      return json(res, 200, {
        token: tokenFor(a),
        admin: { id: a.id, username: a.username, role: a.role },
      });
    }
    const admin = path.startsWith("/api/admin/") ? auth(req) : true;
    if (!admin) return json(res, 401, { message: "请先登录" });
    if (path === "/api/admin/db/status" && method === "GET") {
      const tables = rows(
        "SELECT name FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' ORDER BY name",
      );
      return json(res, 200, {
        tables: tables.map((x) => {
          try {
            return {
              name: x.name,
              count: db.prepare(`SELECT COUNT(*) AS count FROM ${x.name}`).get()
                .count,
            };
          } catch {
            return { name: x.name, count: null };
          }
        }),
        migrations: rows("SELECT * FROM schema_migrations ORDER BY id"),
        integrity: db.prepare("PRAGMA integrity_check").all(),
        foreign_key_violations: db.prepare("PRAGMA foreign_key_check").all(),
        backups: existsSync(backupDir)
          ? readdirSync(backupDir).filter((name) => name.endsWith(".db"))
          : [],
        database_path: dbPath,
      });
    }
    if (path === "/api/admin/stats" && method === "GET") {
      const scalar = (sql, ...args) => db.prepare(sql).get(...args).value;
      return json(res, 200, {
        products: {
          published: scalar(
            "SELECT COUNT(*) AS value FROM pets WHERE status='published'",
          ),
          total: scalar("SELECT COUNT(*) AS value FROM pets"),
          low_stock: scalar(
            "SELECT COUNT(*) AS value FROM inventory WHERE available_stock<=low_stock_threshold",
          ),
        },
        users: {
          total: scalar("SELECT COUNT(*) AS value FROM users"),
          visitors: scalar("SELECT COUNT(*) AS value FROM visitors"),
          registered: scalar(
            "SELECT COUNT(*) AS value FROM users WHERE status<>'guest'",
          ),
          active_7d: scalar(
            "SELECT COUNT(DISTINCT user_id) AS value FROM user_login_logs WHERE datetime(created_at)>=datetime('now','-7 day')",
          ),
        },
        orders: {
          total: scalar("SELECT COUNT(*) AS value FROM orders"),
          pending_payment: scalar(
            "SELECT COUNT(*) AS value FROM orders WHERE payment_status='unpaid'",
          ),
          paid: scalar(
            "SELECT COUNT(*) AS value FROM orders WHERE payment_status='paid'",
          ),
          revenue: scalar(
            "SELECT COALESCE(SUM(total_amount),0) AS value FROM orders WHERE payment_status='paid'",
          ),
        },
        behavior: {
          favorites: scalar("SELECT COUNT(*) AS value FROM favorites"),
          footprints: scalar("SELECT COUNT(*) AS value FROM footprints"),
          messages: scalar("SELECT COUNT(*) AS value FROM messages"),
          purchase_users: scalar(
            "SELECT COUNT(DISTINCT user_id) AS value FROM orders",
          ),
        },
        trends: rows(
          `WITH RECURSIVE days(day) AS (
             SELECT date('now','-6 day') UNION ALL
             SELECT date(day,'+1 day') FROM days WHERE day<date('now')
           )
           SELECT day,
             (SELECT COUNT(*) FROM orders WHERE date(created_at)=day) AS orders,
             (SELECT COUNT(DISTINCT user_id) FROM user_login_logs WHERE date(created_at)=day) AS active_users,
             (SELECT COUNT(*) FROM footprints WHERE date(viewed_at)=day) AS views
           FROM days ORDER BY day`,
        ),
        operations: {
          pending_after_sales: scalar(
            "SELECT COUNT(*) AS value FROM after_sales WHERE status<>'completed'",
          ),
          pending_complaints: scalar(
            "SELECT COUNT(*) AS value FROM complaints WHERE status<>'completed'",
          ),
          sync_errors: scalar("SELECT COUNT(*) AS value FROM sync_task_errors"),
        },
      });
    }
    if (path === "/api/admin/payments" && method === "GET")
      return json(
        res,
        200,
        rows(
          `SELECT p.*,o.order_no,u.nickname,u.phone
           FROM payments p
           JOIN orders o ON o.id=p.order_id
           JOIN users u ON u.id=o.user_id
           ORDER BY p.id DESC LIMIT 200`,
        ),
      );
    if (path === "/api/pets" && method === "GET") {
      const search = String(url.searchParams.get("q") || "").trim();
      const q = `%${search}%`;
      const status = url.searchParams.get("status") || "published";
      const { pageSize, offset } = pageParams(url, { pageSize: 12, max: 50 });
      const baseSelect = `SELECT p.*,c.name AS category_name,pp.status AS product_status
                          FROM pets p
                          LEFT JOIN categories c ON c.id=p.category_id
                          LEFT JOIN pet_products pp ON pp.pet_id=p.id`;
      if (!search)
        return json(
          res,
          200,
          rows(
            `${baseSelect} WHERE p.status=? ORDER BY p.id DESC LIMIT ? OFFSET ?`,
            status,
            pageSize,
            offset,
          ),
        );
      const exactBreed = db
        .prepare("SELECT 1 FROM pets WHERE status=? AND breed=? LIMIT 1")
        .get(status, search);
      if (exactBreed)
        return json(
          res,
          200,
          rows(
            `${baseSelect} WHERE p.status=? AND p.breed=? ORDER BY p.id DESC LIMIT ? OFFSET ?`,
            status,
            search,
            pageSize,
            offset,
          ),
        );
      const exactCategory = db
        .prepare("SELECT id FROM categories WHERE name=? LIMIT 1")
        .get(search);
      if (exactCategory)
        return json(
          res,
          200,
          rows(
            `${baseSelect} WHERE p.status=? AND p.category_id=? ORDER BY p.id DESC LIMIT ? OFFSET ?`,
            status,
            exactCategory.id,
            pageSize,
            offset,
          ),
        );
      return json(
        res,
        200,
        rows(
          `${baseSelect}
           WHERE p.status=?
             AND (p.name LIKE ? OR p.breed LIKE ? OR p.description LIKE ? OR c.name LIKE ?)
           ORDER BY p.id DESC
           LIMIT ? OFFSET ?`,
          status,
          q,
          q,
          q,
          q,
          pageSize,
          offset,
        ),
      );
    }
    const publicPet = path.match(/^\/api\/pets\/(\d+)$/);
    if (publicPet && method === "GET") {
      const pet = petDetail(Number(publicPet[1]));
      if (!pet)
        return json(res, 404, { message: "商品不存在或未上架" });
      return json(res, 200, pet);
    }
    if (path === "/api/categories" && method === "GET")
      return json(
        res,
        200,
        rows(
          "SELECT * FROM categories WHERE status='active' ORDER BY sort_order,id",
        ),
      );
    if (path === "/api/admin/pets" && method === "GET")
      return json(
        res,
        200,
        rows(
          "SELECT * FROM pets ORDER BY id DESC LIMIT ? OFFSET ?",
          pageParams(url, { pageSize: 50, max: 500 }).pageSize,
          pageParams(url, { pageSize: 50, max: 500 }).offset,
        ),
      );
    if (path === "/api/admin/pets" && method === "POST") {
      const d = await body(req);
      const r = db
        .prepare(
          `INSERT INTO pets(name,category_id,breed,gender,age_months,color,body_type,personality,health_status,vaccine_record,father_info,mother_info,description,price,seller_name,status) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        )
        .run(
          d.name,
          d.category_id,
          d.breed,
          d.gender ?? null,
          d.age_months ?? null,
          d.color ?? null,
          d.body_type ?? null,
          d.personality ?? null,
          d.health_status ?? null,
          d.vaccine_record ?? null,
          d.father_info ?? null,
          d.mother_info ?? null,
          d.description ?? null,
          d.price,
          d.seller_name ?? null,
          d.status || "draft",
        );
      db.prepare(
        "INSERT OR IGNORE INTO inventory(pet_id,total_stock,available_stock) VALUES(?,?,?)",
      ).run(r.lastInsertRowid, Number(d.stock || 1), Number(d.stock || 1));
      logAdmin(admin, req, "create", "pets", r.lastInsertRowid, {
        name: d.name,
        breed: d.breed,
      });
      return json(res, 201, petDetail(r.lastInsertRowid));
    }
    const petMatch = path.match(/^\/api\/admin\/pets\/(\d+)$/);
    if (petMatch && method === "GET")
      return json(res, 200, petDetail(Number(petMatch[1])));
    if (petMatch && method === "DELETE") {
      db.prepare(
        "UPDATE pets SET status='deleted',updated_at=CURRENT_TIMESTAMP WHERE id=?",
      ).run(Number(petMatch[1]));
      logAdmin(admin, req, "soft_delete", "pets", Number(petMatch[1]));
      return json(res, 200, { ok: true });
    }
    if (petMatch && method === "PATCH") {
      const d = await body(req),
        allowed = [
          "name",
          "category_id",
          "breed",
          "gender",
          "age_months",
          "color",
          "body_type",
          "personality",
          "health_status",
          "vaccine_record",
          "father_info",
          "mother_info",
          "description",
          "price",
          "seller_name",
          "status",
        ],
        sets = allowed.filter((k) => d[k] !== undefined);
      if (sets.length)
        db.prepare(
          `UPDATE pets SET ${sets.map((k) => `${k}=?`).join(",")},updated_at=CURRENT_TIMESTAMP WHERE id=?`,
        ).run(...sets.map((k) => d[k]), Number(petMatch[1]));
      if (d.status !== undefined) {
        db.prepare(
          "UPDATE pet_products SET status=?,updated_at=CURRENT_TIMESTAMP WHERE pet_id=?",
        ).run(
          d.status === "published"
            ? "available"
            : d.status === "sold"
              ? "sold"
              : "offline",
          Number(petMatch[1]),
        );
      }
      logAdmin(admin, req, "update", "pets", Number(petMatch[1]), d);
      return json(res, 200, petDetail(Number(petMatch[1])));
    }
    const inventoryRoute = path.match(/^\/api\/admin\/pets\/(\d+)\/inventory$/);
    if (inventoryRoute && method === "GET")
      return json(
        res,
        200,
        rows(
          "SELECT * FROM inventory WHERE pet_id=? ORDER BY sku_id IS NOT NULL,id",
          Number(inventoryRoute[1]),
        ),
      );
    if (inventoryRoute && method === "PATCH") {
      const d = await body(req);
      const petId = Number(inventoryRoute[1]);
      const total = Math.max(0, Number(d.total_stock || 0));
      const current = db
        .prepare("SELECT id,locked_stock FROM inventory WHERE pet_id=? AND sku_id IS NULL ORDER BY id LIMIT 1")
        .get(petId);
      const locked = Math.max(
        0,
        Number(d.locked_stock == null ? current?.locked_stock || 0 : d.locked_stock),
      );
      if (locked > total)
        return json(res, 400, { message: "总库存不能小于已锁定库存" });
      if (current)
        db.prepare(
          "UPDATE inventory SET total_stock=?,locked_stock=?,available_stock=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",
        ).run(total, locked, total - locked, current.id);
      else
        db.prepare(
          "INSERT INTO inventory(pet_id,total_stock,locked_stock,available_stock) VALUES(?,?,?,?)",
        ).run(petId, total, locked, total - locked);
      logAdmin(admin, req, "update", "inventory", petId, { total, locked });
      return json(res, 200, { ok: true, total_stock: total, available_stock: total - locked });
    }
    if (path === "/api/admin/orders")
      return json(
        res,
        200,
        rows(
          "SELECT o.*,u.nickname,u.phone FROM orders o JOIN users u ON u.id=o.user_id ORDER BY o.id DESC",
        ),
      );
    if (path === "/api/admin/users")
      return json(
        res,
        200,
        rows(
          "SELECT id,nickname,avatar,phone,status,login_method,last_login_at,created_at FROM users ORDER BY id DESC",
        ),
      );
    if (path === "/api/admin/uploads" && method === "POST") {
      const d = await body(req);
      const cleanName = String(d.fileName || "file").replace(
        /[^a-zA-Z0-9._-]/g,
        "_",
      );
      const extension = extname(cleanName).toLowerCase();
      const allowed = new Set([".jpg", ".jpeg", ".png", ".webp", ".mp4"]);
      if (!allowed.has(extension))
        return json(res, 400, { message: "仅支持 JPG、PNG、WebP 图片或 MP4 视频" });
      const buffer = Buffer.from(String(d.data || ""), "base64");
      if (!buffer.length || buffer.length > 10 * 1024 * 1024)
        return json(res, 400, { message: "文件不能为空且不能超过 10MB" });
      const safe = `${Date.now()}-${randomBytes(4).toString("hex")}-${cleanName}`;
      const target = join(root, "uploads", safe);
      writeFileSync(target, buffer);
      return json(res, 201, {
        url: `${process.env.PUBLIC_API_BASE || `http://${req.headers.host || "127.0.0.1:3001"}`}/uploads/${safe}`,
        type: d.type || "file",
      });
    }
    if (path === "/api/admin/complaints")
      return json(res, 200, rows("SELECT * FROM complaints ORDER BY id DESC"));
    const complaint = path.match(/^\/api\/admin\/complaints\/(\d+)$/);
    if (complaint && method === "PATCH") {
      const d = await body(req);
      db.prepare("UPDATE complaints SET reply=?,status=? WHERE id=?").run(
        d.reply,
        d.status,
        Number(complaint[1]),
      );
      return json(res, 200, { ok: true });
    }
    if (path === "/api/admin/after-sales")
      return json(res, 200, rows("SELECT * FROM after_sales ORDER BY id DESC"));
    const afterSale = path.match(/^\/api\/admin\/after-sales\/(\d+)$/);
    if (afterSale && method === "PATCH") {
      const d = await body(req);
      const id = Number(afterSale[1]);
      const current = db
        .prepare("SELECT * FROM after_sales WHERE id=?")
        .get(id);
      if (!current) return json(res, 404, { message: "售后申请不存在" });
      const status = d.status || current.status;
      if (!["pending", "processing", "rejected", "completed"].includes(status))
        return json(res, 400, { message: "售后状态不合法" });
      db.exec("BEGIN");
      try {
        db.prepare("UPDATE after_sales SET result=?,status=? WHERE id=?").run(
          d.result ?? current.result,
          status,
          id,
        );
        if (status === "processing")
          db.prepare(
            "UPDATE orders SET status='after_sale',refund_status='processing',updated_at=CURRENT_TIMESTAMP WHERE id=?",
          ).run(current.order_id);
        if (status === "rejected")
          db.prepare(
            "UPDATE orders SET status='pending_receive',refund_status='rejected',updated_at=CURRENT_TIMESTAMP WHERE id=?",
          ).run(current.order_id);
        if (status === "completed") {
          db.prepare(
            "UPDATE orders SET status='cancelled',payment_status='refunded',refund_status='completed',updated_at=CURRENT_TIMESTAMP WHERE id=?",
          ).run(current.order_id);
          const refundNo = `REF${current.order_id}${id}`;
          db.prepare(
            `INSERT OR IGNORE INTO payments(order_id,payment_no,channel,amount,status,paid_at,raw_payload)
             VALUES(?,?,?,?,?,?,?)`,
          ).run(
            current.order_id,
            refundNo,
            "admin_refund",
            -Math.abs(Number(current.amount || 0)),
            "refunded",
            new Date().toISOString(),
            JSON.stringify({ after_sale_id: id, result: d.result || "" }),
          );
          const shipping = db
            .prepare("SELECT status FROM logistics WHERE order_id=?")
            .get(current.order_id);
          for (const item of rows(
            "SELECT pet_id,quantity FROM order_items WHERE order_id=?",
            current.order_id,
          )) {
            const canRestock = !shipping || ["pending", "packed"].includes(shipping.status);
            db.prepare(
              `UPDATE inventory
               SET available_stock=available_stock+?,
                   locked_stock=MAX(locked_stock-?,0),
                   updated_at=CURRENT_TIMESTAMP
               WHERE id=(SELECT id FROM inventory WHERE pet_id=? ORDER BY sku_id IS NULL,id LIMIT 1)`,
            ).run(canRestock ? item.quantity || 1 : 0, item.quantity || 1, item.pet_id);
          }
        }
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
      logAdmin(admin, req, "resolve", "after_sales", id, {
        status,
        order_id: current.order_id,
      });
      return json(res, 200, {
        ok: true,
        status,
        order: db.prepare("SELECT * FROM orders WHERE id=?").get(current.order_id),
      });
    }
    const logistics = path.match(/^\/api\/admin\/orders\/(\d+)\/logistics$/);
    if (logistics && method === "PUT") {
      const d = await body(req),
        orderId = Number(logistics[1]),
        order = db.prepare("SELECT * FROM orders WHERE id=?").get(orderId);
      if (!order) return json(res, 404, { message: "订单不存在" });
      if (d.status === "shipped" && order.payment_status !== "paid")
        return json(res, 409, { message: "订单尚未付款，不能发货" });
      const statusProgress = {
          pending: 0,
          packed: 25,
          shipped: 50,
          delivering: 75,
          delivered: 100,
        },
        progressPercent = Math.min(
          100,
          Math.max(
            0,
            Number(d.progress_percent ?? statusProgress[d.status] ?? 0),
          ),
        ),
        progress = Array.isArray(d.progress)
          ? d.progress
          : [
              {
                time: new Date().toISOString(),
                text: d.note || d.status || "物流状态已更新",
                percent: progressPercent,
              },
            ];
      db.prepare(
        `INSERT INTO logistics(order_id,company,tracking_no,status,progress) VALUES(?,?,?,?,?) ON CONFLICT(order_id) DO UPDATE SET company=excluded.company,tracking_no=excluded.tracking_no,status=excluded.status,progress=excluded.progress,updated_at=CURRENT_TIMESTAMP`,
      ).run(
        orderId,
        d.company,
        d.tracking_no,
        d.status || "pending",
        JSON.stringify(progress),
      );
      const logisticsRow = db
        .prepare("SELECT * FROM logistics WHERE order_id=?")
        .get(orderId);
      db.prepare(
        "INSERT INTO logistics_events(order_id,logistics_id,progress_percent,status,note) VALUES(?,?,?,?,?)",
      ).run(
        orderId,
        logisticsRow.id,
        progressPercent,
        d.status || "pending",
        d.note || progress.at(-1)?.text || "物流状态已更新",
      );
      if (d.status === "shipped" || d.status === "delivering")
        db.prepare(
          "UPDATE orders SET status='pending_receive',updated_at=CURRENT_TIMESTAMP WHERE id=?",
        ).run(orderId);
      if (d.status === "delivered")
        db.exec(`
          UPDATE orders SET status='completed',updated_at=CURRENT_TIMESTAMP WHERE id=${orderId};
          UPDATE inventory
          SET locked_stock=MAX(
                locked_stock-COALESCE((SELECT SUM(oi.quantity) FROM order_items oi WHERE oi.order_id=${orderId} AND oi.pet_id=inventory.pet_id),0),
                0
              ),
              updated_at=CURRENT_TIMESTAMP
          WHERE pet_id IN (SELECT pet_id FROM order_items WHERE order_id=${orderId});
        `);
      logAdmin(admin, req, "update", "logistics", logisticsRow.id, {
        order_id: orderId,
        status: d.status || "pending",
        progress_percent: progressPercent,
      });
      return json(res, 200, {
        ok: true,
        logistics: logisticsRow,
        progress_percent: progressPercent,
      });
    }
    if (path === "/api/orders" && method === "POST") {
      const d = await body(req),
        pet = petDetail(d.pet_id);
      if (!pet) return json(res, 404, { message: "商品不存在" });
      const userId = Number(d.user_id || 0);
      const user = db.prepare("SELECT id FROM users WHERE id=?").get(userId);
      if (!user) return json(res, 400, { message: "用户不存在，请先登录" });
      const address = d.address;
      if (!address?.name || !address?.phone || !address?.detail)
        return json(res, 400, { message: "请选择完整的收货地址" });
      const stock = db
        .prepare(
          "SELECT COALESCE(SUM(available_stock),0) AS available FROM inventory WHERE pet_id=?",
        )
        .get(pet.id);
      if (stock && stock.available <= 0)
        return json(res, 409, { message: "库存不足" });
      const no = `FC${Date.now()}`;
      db.exec("BEGIN");
      try {
        const o = db
          .prepare(
            "INSERT INTO orders(order_no,user_id,total_amount,address_snapshot) VALUES(?,?,?,?)",
          )
          .run(no, userId, pet.price, JSON.stringify(address));
        db.prepare(
          "INSERT INTO order_items(order_id,pet_id,pet_snapshot,price) VALUES(?,?,?,?)",
        ).run(o.lastInsertRowid, pet.id, JSON.stringify(pet), pet.price);
        db.prepare(
          "UPDATE inventory SET available_stock=MAX(available_stock-1,0),locked_stock=locked_stock+1,updated_at=CURRENT_TIMESTAMP WHERE id=(SELECT id FROM inventory WHERE pet_id=? ORDER BY sku_id IS NULL,id LIMIT 1)",
        ).run(pet.id);
        db.exec("COMMIT");
        return json(res, 201, { id: o.lastInsertRowid, order_no: no });
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    }
    if (path === "/api/payments/wechat/prepay" && method === "POST") {
      const d = await body(req);
      const config = wechatConfig();
      if (!config.prepayReady)
        return json(res, 503, {
          message: "微信支付商户配置尚未完成",
          missing: config.prepayMissing,
        });
      const order = db
        .prepare(
          `SELECT o.*,COALESCE(NULLIF(u.openid,''),NULLIF(u.wechat_openid,'')) AS openid
           FROM orders o JOIN users u ON u.id=o.user_id WHERE o.id=?`,
        )
        .get(Number(d.order_id));
      if (!order) return json(res, 404, { message: "订单不存在" });
      if (d.user_id && Number(d.user_id) !== Number(order.user_id))
        return json(res, 403, { message: "无权支付该订单" });
      if (order.payment_status === "paid")
        return json(res, 409, { message: "订单已付款" });
      if (order.status !== "pending_payment")
        return json(res, 409, { message: "当前订单状态不能付款" });
      const openid = d.openid || order.openid;
      if (!openid) return json(res, 400, { message: "当前用户尚未关联微信账号" });
      const requestPath = "/v3/pay/transactions/jsapi";
      const requestPayload = JSON.stringify({
        appid: config.appId,
        mchid: config.mchId,
        description: `福宠平台订单 ${order.order_no}`,
        out_trade_no: order.order_no,
        notify_url: config.notifyUrl,
        amount: { total: Math.round(Number(order.total_amount) * 100), currency: "CNY" },
        payer: { openid },
      });
      const authorization = wechatAuthorization(
        "POST",
        requestPath,
        requestPayload,
        config,
      );
      const payResponse = await fetch(`https://api.mch.weixin.qq.com${requestPath}`, {
        method: "POST",
        headers: {
          authorization: authorization.value,
          accept: "application/json",
          "content-type": "application/json",
          "user-agent": "fuchong-platform/1.0",
        },
        body: requestPayload,
      });
      const payResult = await payResponse.json().catch(() => ({}));
      if (!payResponse.ok || !payResult.prepay_id)
        return json(res, 502, {
          message: "微信预支付下单失败",
          detail: payResult.message || payResult.code || "微信支付接口异常",
        });
      const paymentNo = `WXPENDING${Date.now()}`;
      db.prepare(
        "INSERT INTO payments(order_id,payment_no,channel,amount,status,raw_payload) VALUES(?,?,?,?,?,?)",
      ).run(
        order.id,
        paymentNo,
        "wechat_jsapi",
        order.total_amount,
        "pending",
        JSON.stringify({ prepay_id: payResult.prepay_id, out_trade_no: order.order_no }),
      );
      return json(res, 201, {
        order_id: order.id,
        order_no: order.order_no,
        ...wechatClientPayment(payResult.prepay_id, config),
      });
    }
    if (path === "/api/payments/wechat/notify" && method === "POST") {
      const config = wechatConfig();
      if (!config.notifyReady)
        return json(res, 503, { code: "FAIL", message: "微信支付回调配置不完整" });
      const timestamp = req.headers["wechatpay-timestamp"];
      const nonce = req.headers["wechatpay-nonce"];
      const signature = req.headers["wechatpay-signature"];
      if (!timestamp || !nonce || !signature)
        return json(res, 400, { code: "FAIL", message: "缺少微信支付签名头" });
      const raw = await rawBody(req);
      const signedMessage = `${timestamp}\n${nonce}\n${raw}\n`;
      const verified = rsaVerify(
        "RSA-SHA256",
        Buffer.from(signedMessage),
        readFileSync(config.platformPublicKeyPath, "utf8"),
        Buffer.from(String(signature), "base64"),
      );
      if (!verified)
        return json(res, 401, { code: "FAIL", message: "微信支付签名验证失败" });
      const notification = JSON.parse(raw || "{}");
      const trade = decryptWechatResource(notification.resource, config.apiV3Key);
      if (trade.trade_state === "SUCCESS") {
        const order = db
          .prepare("SELECT * FROM orders WHERE order_no=?")
          .get(trade.out_trade_no);
        if (!order)
          return json(res, 404, { code: "FAIL", message: "订单不存在" });
        markOrderPaid(order, {
          paymentNo: trade.transaction_id,
          channel: "wechat_jsapi",
          amount: Number(trade.amount?.total) / 100,
          paidAt: trade.success_time,
          raw: trade,
        });
      }
      return json(res, 200, { code: "SUCCESS", message: "成功" });
    }
    if (path === "/api/payments/mock" && method === "POST") {
      const d = await body(req);
      const order = db
        .prepare("SELECT * FROM orders WHERE id=?")
        .get(Number(d.order_id));
      if (!order) return json(res, 404, { message: "订单不存在" });
      const existingPayment = db
        .prepare(
          "SELECT * FROM payments WHERE order_id=? AND status='paid' ORDER BY id DESC LIMIT 1",
        )
        .get(order.id);
      if (existingPayment)
        return json(res, 200, {
          id: existingPayment.id,
          payment_no: existingPayment.payment_no,
          idempotent: true,
        });
      if (order.payment_status === "paid")
        return json(res, 409, { message: "订单已付款，但支付流水缺失，请管理员核对" });
      if (!["pending_payment", "pending_confirm"].includes(order.status))
        return json(res, 409, { message: "当前订单状态不能支付" });
      const paymentNo = `PAY${Date.now()}`;
      const result = markOrderPaid(order, {
        paymentNo,
        channel: d.channel || "mock",
        amount: order.total_amount,
        raw: d,
      });
      return json(res, 201, {
        id: result.payment.id,
        payment_no: result.payment.payment_no,
        idempotent: result.idempotent,
      });
    }
    const userCancelRoute = path.match(/^\/api\/orders\/(\d+)\/cancel$/);
    if (userCancelRoute && method === "PATCH") {
      const d = await body(req);
      const orderId = Number(userCancelRoute[1]);
      const userId = Number(d.user_id || 0);
      const order = db
        .prepare("SELECT * FROM orders WHERE id=? AND user_id=?")
        .get(orderId, userId);
      if (!order) return json(res, 404, { message: "订单不存在" });
      if (order.payment_status === "paid")
        return json(res, 409, { message: "已付款订单请申请售后退款" });
      if (!['pending_payment', 'pending_confirm'].includes(order.status))
        return json(res, 409, { message: "当前订单不能取消" });
      db.exec("BEGIN");
      try {
        const items = rows("SELECT pet_id,quantity FROM order_items WHERE order_id=?", orderId);
        for (const item of items)
          db.prepare(
            `UPDATE inventory
             SET available_stock=available_stock+?,locked_stock=MAX(locked_stock-?,0),updated_at=CURRENT_TIMESTAMP
             WHERE id=(SELECT id FROM inventory WHERE pet_id=? ORDER BY sku_id IS NULL,id LIMIT 1)`,
          ).run(item.quantity || 1, item.quantity || 1, item.pet_id);
        db.prepare(
          "UPDATE orders SET status='cancelled',updated_at=CURRENT_TIMESTAMP WHERE id=?",
        ).run(orderId);
        db.exec("COMMIT");
        return json(res, 200, { ok: true, status: "cancelled" });
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    }
    const userOrderRoute = path.match(/^\/api\/orders\/(\d+)$/);
    if (userOrderRoute && method === "GET") {
      const userId = Number(url.searchParams.get("user_id") || 0);
      const order = db
        .prepare(
          `SELECT o.*,l.company AS logistics_company,l.tracking_no,l.status AS logistics_status,l.progress AS logistics_progress
           FROM orders o LEFT JOIN logistics l ON l.order_id=o.id
           WHERE o.id=? AND o.user_id=?`,
        )
        .get(Number(userOrderRoute[1]), userId);
      if (!order) return json(res, 404, { message: "订单不存在" });
      return json(res, 200, {
        ...order,
        items: rows("SELECT * FROM order_items WHERE order_id=?", order.id),
        payments: rows(
          "SELECT id,payment_no,channel,amount,status,paid_at,created_at FROM payments WHERE order_id=? ORDER BY id DESC",
          order.id,
        ),
        logistics_events: rows(
          "SELECT progress_percent,status,note,created_at FROM logistics_events WHERE order_id=? ORDER BY id",
          order.id,
        ),
        after_sales: rows(
          "SELECT id,type,reason,amount,result,status,created_at FROM after_sales WHERE order_id=? AND user_id=? ORDER BY id DESC",
          order.id,
          userId,
        ),
      });
    }
    if (path === "/api/orders" && method === "GET") {
      const userId = Number(url.searchParams.get("user_id") || 1);
      return json(
        res,
        200,
        rows(
          `SELECT o.*,oi.pet_id,oi.pet_snapshot,oi.price,
                  l.company AS logistics_company,l.tracking_no,l.status AS logistics_status,l.progress AS logistics_progress,
                  COALESCE((SELECT progress_percent FROM logistics_events le WHERE le.order_id=o.id ORDER BY le.id DESC LIMIT 1),0) AS logistics_percent
           FROM orders o
           LEFT JOIN order_items oi ON oi.order_id=o.id
           LEFT JOIN logistics l ON l.order_id=o.id
           WHERE o.user_id=? ORDER BY o.id DESC`,
          userId,
        ),
      );
    }
    if (path === "/api/after-sales" && method === "POST") {
      const d = await body(req);
      const order = db
        .prepare("SELECT * FROM orders WHERE id=? AND user_id=?")
        .get(Number(d.order_id), Number(d.user_id));
      if (!order) return json(res, 404, { message: "订单不存在" });
      if (order.payment_status !== "paid")
        return json(res, 409, { message: "未付款订单无需申请售后" });
      const existing = db
        .prepare(
          "SELECT id FROM after_sales WHERE order_id=? AND user_id=? AND status IN ('pending','processing') LIMIT 1",
        )
        .get(order.id, order.user_id);
      if (existing)
        return json(res, 409, { message: "该订单已有处理中售后申请" });
      const reason = String(d.reason || "").trim();
      if (!reason) return json(res, 400, { message: "请填写售后原因" });
      const result = db
        .prepare(
          "INSERT INTO after_sales(order_id,user_id,type,reason,amount,status) VALUES(?,?,?,?,?,?)",
        )
        .run(
          order.id,
          order.user_id,
          d.type || "refund",
          reason,
          Math.min(Number(d.amount || order.total_amount), order.total_amount),
          "pending",
        );
      db.prepare(
        "UPDATE orders SET status='after_sale',refund_status='pending',updated_at=CURRENT_TIMESTAMP WHERE id=?",
      ).run(order.id);
      return json(res, 201, { id: result.lastInsertRowid, status: "pending" });
    }
    if (path === "/api/complaints" && method === "POST") {
      const d = await body(req);
      const order = d.order_id
        ? db
            .prepare("SELECT id FROM orders WHERE id=? AND user_id=?")
            .get(Number(d.order_id), Number(d.user_id))
        : null;
      if (d.order_id && !order)
        return json(res, 404, { message: "关联订单不存在" });
      if (!String(d.title || "").trim() || !String(d.content || "").trim())
        return json(res, 400, { message: "请填写投诉标题和内容" });
      const result = db
        .prepare(
          "INSERT INTO complaints(user_id,order_id,title,content,status) VALUES(?,?,?,?,?)",
        )
        .run(
          Number(d.user_id),
          d.order_id || null,
          String(d.title).trim(),
          String(d.content).trim(),
          "pending",
        );
      return json(res, 201, { id: result.lastInsertRowid, status: "pending" });
    }
    if (path === "/api/messages" && method === "GET") {
      const sessionId = url.searchParams.get("session_id");
      return json(
        res,
        200,
        sessionId
          ? rows(
              "SELECT * FROM messages WHERE session_id=? ORDER BY id",
              Number(sessionId),
            )
          : rows(
              "SELECT * FROM messages WHERE user_id=? ORDER BY id",
              Number(url.searchParams.get("user_id") || 1),
            ),
      );
    }
    if (path === "/api/messages" && method === "POST") {
      const d = await body(req);
      const userId = Number(d.user_id || 1);
      const pet = d.product_id ? petDetail(Number(d.product_id)) : null;
      let sessionId = Number(d.session_id || 0);
      if (!sessionId) {
        const existing = db
          .prepare(
            "SELECT * FROM customer_service_sessions WHERE user_id=? AND COALESCE(product_id,0)=COALESCE(?,0) AND status IN ('ai','human_pending','human') ORDER BY id DESC LIMIT 1",
          )
          .get(userId, d.product_id || null);
        if (existing) sessionId = existing.id;
        else {
          const s = db
            .prepare(
              "INSERT INTO customer_service_sessions(user_id,product_id,product_name,seller_name,source,status,service_type,seller_id) VALUES(?,?,?,?,?,?,?,?)",
            )
            .run(
              userId,
              d.product_id || null,
              d.product_name || pet?.name || null,
              d.seller_name || pet?.seller_name || "福宠认证宠物馆",
              d.source || "message_center",
              "ai",
              d.service_type || "购买咨询",
              d.seller_id || pet?.seller_id || null,
            );
          sessionId = s.lastInsertRowid;
        }
      }
      const r = db
        .prepare(
          "INSERT INTO messages(user_id,sender,type,content,session_id,product_id,product_name,seller_name,status,service_type,seller_id) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
        )
        .run(
          userId,
          d.sender || "user",
          d.type || "service",
          d.content,
          sessionId,
          d.product_id || null,
          d.product_name || pet?.name || null,
          d.seller_name || pet?.seller_name || "福宠认证宠物馆",
          "sent",
          d.service_type || "购买咨询",
          d.seller_id || pet?.seller_id || null,
        );
      const reply = aiReply(d.content, pet);
      db.prepare(
        "INSERT INTO messages(user_id,sender,type,content,session_id,product_id,product_name,seller_name,status,service_type,seller_id) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
      ).run(
        userId,
        "service",
        "service",
        reply,
        sessionId,
        d.product_id || null,
        d.product_name || pet?.name || null,
        d.seller_name || pet?.seller_name || "福宠认证宠物馆",
        "sent",
        d.service_type || "购买咨询",
        d.seller_id || pet?.seller_id || null,
      );
      db.prepare(
        "UPDATE customer_service_sessions SET updated_at=CURRENT_TIMESTAMP WHERE id=?",
      ).run(sessionId);
      return json(res, 201, {
        id: r.lastInsertRowid,
        session_id: sessionId,
        reply,
      });
    }
    const serviceSession = path.match(
      /^\/api\/customer-service\/sessions\/(\d+)\/handoff$/,
    );
    if (serviceSession && method === "POST") {
      db.prepare(
        "UPDATE customer_service_sessions SET status='human_pending',updated_at=CURRENT_TIMESTAMP WHERE id=?",
      ).run(Number(serviceSession[1]));
      return json(res, 200, { ok: true, status: "human_pending" });
    }
    if (path === "/api/admin/customer-service/sessions" && method === "GET")
      return json(
        res,
        200,
        rows(
          `SELECT s.*,u.nickname,u.phone
           FROM customer_service_sessions s
           JOIN users u ON u.id=s.user_id
           ORDER BY s.updated_at DESC LIMIT 200`,
        ),
      );
    if (path === "/api/favorites" && method === "GET")
      return json(
        res,
        200,
        rows(
          `SELECT f.*,p.name,p.breed,p.price,p.gender,p.age_months,p.color,p.health_status,p.seller_name,
                  p.status AS pet_status,p.breed_id,p.seller_id,
                  CASE WHEN p.id IS NULL THEN 'missing' WHEN p.status='published' THEN COALESCE(pp.status,'available') WHEN p.status='sold' THEN 'sold' ELSE 'offline' END AS product_status,
                  COALESCE(p.thumbnail_url,p.highres_url,pi.thumbnail_url,pi.url) AS image
           FROM favorites f
           LEFT JOIN pets p ON p.id=f.pet_id
           LEFT JOIN pet_products pp ON pp.pet_id=p.id
           LEFT JOIN pet_images pi ON pi.pet_id=p.id
           WHERE f.user_id=?
           GROUP BY f.id
           ORDER BY f.created_at DESC`,
          Number(url.searchParams.get("user_id") || 1),
        ),
      );
    if (path === "/api/favorites" && method === "POST") {
      const d = await body(req);
      db.prepare(
        "INSERT OR IGNORE INTO favorites(user_id,pet_id) VALUES(?,?)",
      ).run(d.user_id || 1, d.pet_id);
      return json(res, 201, { ok: true });
    }
    const favorite = path.match(/^\/api\/favorites\/(\d+)$/);
    if (favorite && method === "DELETE") {
      db.prepare("DELETE FROM favorites WHERE user_id=? AND pet_id=?").run(
        Number(url.searchParams.get("user_id") || 1),
        Number(favorite[1]),
      );
      return json(res, 200, { ok: true });
    }
    if (path === "/api/follows" && method === "GET")
      return json(
        res,
        200,
        rows(
          "SELECT * FROM follows WHERE user_id=?",
          Number(url.searchParams.get("user_id") || 1),
        ),
      );
    if (path === "/api/follows" && method === "POST") {
      const d = await body(req);
      db.prepare(
        "INSERT OR IGNORE INTO follows(user_id,seller_name) VALUES(?,?)",
      ).run(d.user_id || 1, d.seller_name);
      return json(res, 201, { ok: true });
    }
    if (path === "/api/follows" && method === "DELETE") {
      const userId = Number(url.searchParams.get("user_id") || 1),
        seller = url.searchParams.get("seller_name") || "";
      db.prepare("DELETE FROM follows WHERE user_id=? AND seller_name=?").run(
        userId,
        seller,
      );
      return json(res, 200, { ok: true });
    }
    if (path === "/api/footprints" && method === "GET")
      return json(
        res,
        200,
        rows(
          "SELECT f.*,p.name,p.breed,p.price FROM footprints f JOIN pets p ON p.id=f.pet_id WHERE f.user_id=? ORDER BY viewed_at DESC",
          Number(url.searchParams.get("user_id") || 1),
        ),
      );
    if (path === "/api/footprints" && method === "POST") {
      const d = await body(req);
      db.prepare("INSERT INTO footprints(user_id,pet_id) VALUES(?,?)").run(
        d.user_id || 1,
        d.pet_id,
      );
      return json(res, 201, { ok: true });
    }
    const footprintItem = path.match(/^\/api\/footprints\/(\d+)$/);
    if (footprintItem && method === "DELETE") {
      db.prepare("DELETE FROM footprints WHERE id=? AND user_id=?").run(
        Number(footprintItem[1]),
        Number(url.searchParams.get("user_id") || 1),
      );
      return json(res, 200, { ok: true });
    }
    if (path === "/api/footprints" && method === "DELETE") {
      db.prepare("DELETE FROM footprints WHERE user_id=?").run(
        Number(url.searchParams.get("user_id") || 1),
      );
      return json(res, 200, { ok: true });
    }
    if (path === "/api/addresses" && method === "GET")
      return json(
        res,
        200,
        rows(
          "SELECT * FROM addresses WHERE user_id=?",
          Number(url.searchParams.get("user_id") || 1),
        ),
      );
    if (path === "/api/addresses" && method === "POST") {
      const d = await body(req);
      const userId = Number(d.user_id || 1);
      if (!db.prepare("SELECT id FROM users WHERE id=?").get(userId))
        return json(res, 400, { message: "用户不存在，请重新登录" });
      if (!String(d.name || "").trim())
        return json(res, 400, { message: "请填写收货人" });
      if (!/^1\d{10}$/.test(String(d.phone || "")))
        return json(res, 400, { message: "请填写正确的11位手机号" });
      if (!String(d.detail || "").trim())
        return json(res, 400, { message: "请填写详细地址" });
      db.exec("BEGIN");
      try {
        if (d.is_default)
          db.prepare("UPDATE addresses SET is_default=0 WHERE user_id=?").run(
            userId,
          );
        const r = db
          .prepare(
            "INSERT INTO addresses(user_id,name,phone,province,city,district,detail,is_default) VALUES(?,?,?,?,?,?,?,?)",
          )
          .run(
            userId,
            d.name,
            d.phone,
            d.province ?? null,
            d.city ?? null,
            d.district ?? null,
            d.detail,
            d.is_default ? 1 : 0,
          );
        db.exec("COMMIT");
        return json(res, 201, { id: r.lastInsertRowid });
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    }
    const addressItem = path.match(/^\/api\/addresses\/(\d+)$/);
    if (addressItem && method === "PATCH") {
      const d = await body(req);
      const id = Number(addressItem[1]);
      const userId = Number(d.user_id || 0);
      const current = db
        .prepare("SELECT * FROM addresses WHERE id=? AND user_id=?")
        .get(id, userId);
      if (!current) return json(res, 404, { message: "地址不存在" });
      const name = String(d.name ?? current.name).trim();
      const phone = String(d.phone ?? current.phone).trim();
      const detail = String(d.detail ?? current.detail).trim();
      if (!name || !detail || !/^1\d{10}$/.test(phone))
        return json(res, 400, { message: "请完整填写收货人、手机号和详细地址" });
      db.exec("BEGIN");
      try {
        if (d.is_default)
          db.prepare("UPDATE addresses SET is_default=0 WHERE user_id=?").run(userId);
        db.prepare(
          `UPDATE addresses SET name=?,phone=?,province=?,city=?,district=?,detail=?,is_default=?
           WHERE id=? AND user_id=?`,
        ).run(
          name,
          phone,
          d.province ?? current.province,
          d.city ?? current.city,
          d.district ?? current.district,
          detail,
          d.is_default == null ? current.is_default : d.is_default ? 1 : 0,
          id,
          userId,
        );
        db.exec("COMMIT");
        return json(res, 200, db.prepare("SELECT * FROM addresses WHERE id=?").get(id));
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    }
    if (addressItem && method === "DELETE") {
      const userId = Number(url.searchParams.get("user_id") || 0);
      const result = db
        .prepare("DELETE FROM addresses WHERE id=? AND user_id=?")
        .run(Number(addressItem[1]), userId);
      if (!result.changes) return json(res, 404, { message: "地址不存在" });
      return json(res, 200, { ok: true });
    }
    if (path === "/api/coupons" && method === "GET") {
      const userId = Number(url.searchParams.get("user_id") || 0);
      return json(
        res,
        200,
        userId
          ? rows(
              `SELECT c.*,uc.status AS user_status
               FROM user_coupons uc JOIN coupons c ON c.id=uc.coupon_id
               WHERE uc.user_id=? ORDER BY c.id DESC`,
              userId,
            )
          : rows("SELECT * FROM coupons WHERE status=?", "active"),
      );
    }
    const skuRoute = path.match(/^\/api\/admin\/pets\/(\d+)\/skus$/);
    if (skuRoute && method === "GET")
      return json(
        res,
        200,
        rows("SELECT * FROM pet_skus WHERE pet_id=?", Number(skuRoute[1])),
      );
    if (skuRoute && method === "POST") {
      const d = await body(req);
      const r = db
        .prepare(
          "INSERT INTO pet_skus(pet_id,sku_name,price,stock,status) VALUES(?,?,?,?,?)",
        )
        .run(
          Number(skuRoute[1]),
          d.sku_name,
          d.price,
          d.stock,
          d.status || "active",
        );
      db.prepare(
        "INSERT OR REPLACE INTO inventory(pet_id,sku_id,total_stock,available_stock,updated_at) VALUES(?,?,?,?,CURRENT_TIMESTAMP)",
      ).run(
        Number(skuRoute[1]),
        r.lastInsertRowid,
        Number(d.stock || 0),
        Number(d.stock || 0),
      );
      logAdmin(admin, req, "create", "pet_skus", r.lastInsertRowid, d);
      return json(res, 201, { id: r.lastInsertRowid });
    }
    const skuItem = path.match(/^\/api\/admin\/skus\/(\d+)$/);
    if (skuItem && method === "PATCH") {
      const d = await body(req);
      db.prepare(
        "UPDATE pet_skus SET sku_name=?,price=?,stock=?,status=? WHERE id=?",
      ).run(d.sku_name, d.price, d.stock, d.status, Number(skuItem[1]));
      db.prepare(
        "UPDATE inventory SET total_stock=?,available_stock=?,updated_at=CURRENT_TIMESTAMP WHERE sku_id=?",
      ).run(Number(d.stock || 0), Number(d.stock || 0), Number(skuItem[1]));
      logAdmin(admin, req, "update", "pet_skus", Number(skuItem[1]), d);
      return json(res, 200, { ok: true });
    }
    if (skuItem && method === "DELETE") {
      db.prepare("DELETE FROM pet_skus WHERE id=?").run(Number(skuItem[1]));
      logAdmin(admin, req, "delete", "pet_skus", Number(skuItem[1]));
      return json(res, 200, { ok: true });
    }
    const mediaRoute = path.match(
      /^\/api\/admin\/pets\/(\d+)\/(images|videos)$/,
    );
    if (mediaRoute && method === "POST") {
      const d = await body(req),
        petId = Number(mediaRoute[1]);
      if (!db.prepare("SELECT id FROM pets WHERE id=?").get(petId))
        return json(res, 404, { message: "宠物不存在，不能关联媒体" });
      if (!d.url) return json(res, 400, { message: "媒体地址不能为空" });
      const mediaTable = mediaRoute[2] === "images" ? "pet_images" : "pet_videos";
      const existingMedia = db
        .prepare(`SELECT id FROM ${mediaTable} WHERE pet_id=? AND url=? LIMIT 1`)
        .get(petId, d.url);
      if (existingMedia)
        return json(res, 200, { id: existingMedia.id, deduplicated: true });
      if (mediaRoute[2] === "images") {
        const r = db
          .prepare(
            "INSERT INTO pet_images(pet_id,url,type,sort_order) VALUES(?,?,?,?)",
          )
          .run(petId, d.url, d.type || "gallery", d.sort_order || 0);
        return json(res, 201, { id: r.lastInsertRowid });
      }
      const r = db
        .prepare(
          "INSERT INTO pet_videos(pet_id,url,cover_url,duration) VALUES(?,?,?,?)",
        )
        .run(petId, d.url, d.cover_url, d.duration || 0);
      return json(res, 201, { id: r.lastInsertRowid });
    }
    const orderRoute = path.match(/^\/api\/admin\/orders\/(\d+)$/);
    if (orderRoute && method === "GET") {
      const order = db
        .prepare(
          "SELECT o.*,u.nickname,u.phone FROM orders o JOIN users u ON u.id=o.user_id WHERE o.id=?",
        )
        .get(Number(orderRoute[1]));
      return json(
        res,
        order ? 200 : 404,
        order
          ? {
              ...order,
              items: rows(
                "SELECT * FROM order_items WHERE order_id=?",
                Number(orderRoute[1]),
              ),
              logistics: db
                .prepare("SELECT * FROM logistics WHERE order_id=?")
                .get(Number(orderRoute[1])),
              logistics_events: rows(
                "SELECT * FROM logistics_events WHERE order_id=? ORDER BY id",
                Number(orderRoute[1]),
              ),
            }
          : { message: "订单不存在" },
      );
    }
    if (orderRoute && method === "PATCH") {
      const d = await body(req);
      const orderId = Number(orderRoute[1]);
      const existing = db.prepare("SELECT * FROM orders WHERE id=?").get(orderId);
      if (!existing) return json(res, 404, { message: "订单不存在" });
      const allowedStatuses = [
        "pending_payment",
        "pending_confirm",
        "pending_ship",
        "pending_receive",
        "completed",
        "cancelled",
        "after_sale",
      ];
      if (d.status && !allowedStatuses.includes(d.status))
        return json(res, 400, { message: "订单状态不合法" });
      const nextPaymentStatus = d.payment_status || existing.payment_status;
      if (["pending_ship", "pending_receive", "completed"].includes(d.status) && nextPaymentStatus !== "paid")
        return json(res, 409, { message: "未付款订单不能进入发货或完成状态" });
      if (existing.payment_status === "paid" && d.payment_status === "unpaid")
        return json(res, 409, { message: "已付款订单不能改回未付款" });
      db.exec("BEGIN");
      try {
        if (d.payment_status === "paid" && existing.payment_status !== "paid") {
          const paymentNo = `MANUAL${Date.now()}`;
          db.prepare(
            "INSERT INTO payments(order_id,payment_no,channel,amount,status,paid_at,raw_payload) VALUES(?,?,?,?,?,?,?)",
          ).run(
            orderId,
            paymentNo,
            "admin_manual",
            existing.total_amount,
            "paid",
            new Date().toISOString(),
            JSON.stringify({ operator: admin.username, source: "admin_order" }),
          );
        }
      db.prepare(
          "UPDATE orders SET status=COALESCE(?,status),payment_status=COALESCE(?,payment_status),paid_at=CASE WHEN ?='paid' THEN COALESCE(paid_at,CURRENT_TIMESTAMP) ELSE paid_at END,updated_at=CURRENT_TIMESTAMP WHERE id=?",
        ).run(d.status, d.payment_status, d.payment_status, orderId);
        db.exec("COMMIT");
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
      logAdmin(admin, req, "update", "orders", orderId, d);
      return json(res, 200, { ok: true });
    }
    const userRoute = path.match(/^\/api\/admin\/users\/(\d+)$/);
    if (userRoute && method === "GET") {
      const id = Number(userRoute[1]),
        user = db
          .prepare(
            "SELECT id,nickname,avatar,phone,status,login_method,last_login_at,created_at FROM users WHERE id=?",
          )
          .get(id);
      return json(
        res,
        user ? 200 : 404,
        user
          ? {
              ...user,
              orders: rows("SELECT * FROM orders WHERE user_id=?", id),
              favorites: rows("SELECT * FROM favorites WHERE user_id=?", id),
              auth: rows("SELECT * FROM user_auth WHERE user_id=?", id),
              footprints: rows("SELECT * FROM footprints WHERE user_id=?", id),
              addresses: rows("SELECT * FROM addresses WHERE user_id=?", id),
              loginLogs: rows(
                "SELECT * FROM user_login_logs WHERE user_id=? ORDER BY id DESC LIMIT 20",
                id,
              ),
              serviceSessions: rows(
                "SELECT * FROM customer_service_sessions WHERE user_id=? ORDER BY updated_at DESC LIMIT 20",
                id,
              ),
            }
          : { message: "用户不存在" },
      );
    }
    if (userRoute && method === "PATCH") {
      const d = await body(req);
      if (!['active', 'disabled', 'guest'].includes(d.status))
        return json(res, 400, { message: "用户状态不合法" });
      db.prepare(
        "UPDATE users SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",
      ).run(d.status, Number(userRoute[1]));
      logAdmin(admin, req, "update_status", "users", userRoute[1], d);
      return json(res, 200, { ok: true, status: d.status });
    }
    for (const resource of ["banners", "categories"]) {
      if (path === `/api/admin/${resource}` && method === "GET")
        return json(
          res,
          200,
          resource === "categories"
            ? rows(
                `SELECT * FROM categories
                 WHERE name NOT IN ('猫猫馆','狗狗馆','鸟类馆','水族馆','奇宠馆','更多馆')
                    OR id IN (
                      SELECT MIN(id) FROM categories
                      WHERE name IN ('猫猫馆','狗狗馆','鸟类馆','水族馆','奇宠馆','更多馆')
                      GROUP BY name
                    )
                 ORDER BY id DESC`,
              )
            : rows(`SELECT * FROM ${resource} ORDER BY id DESC`),
        );
      if (path === `/api/admin/${resource}` && method === "POST") {
        const d = await body(req);
        if (resource === "banners") {
          const r = db
            .prepare(
              "INSERT INTO banners(title,image,link,sort_order,status) VALUES(?,?,?,?,?)",
            )
            .run(
              d.title ?? null,
              d.image,
              d.link ?? null,
              d.sort_order || 0,
              d.status || "active",
            );
          return json(res, 201, { id: r.lastInsertRowid });
        }
        const r = db
          .prepare(
            "INSERT INTO categories(name,parent_id,image,sort_order,status) VALUES(?,?,?,?,?)",
          )
          .run(
            d.name,
            d.parent_id || null,
            d.image ?? null,
            d.sort_order || 0,
            d.status || "active",
          );
        return json(res, 201, { id: r.lastInsertRowid });
      }
    }
    const contentItem = path.match(/^\/api\/admin\/(banners|categories)\/(\d+)$/);
    if (contentItem && method === "PATCH") {
      const [, resource, rawId] = contentItem;
      const d = await body(req);
      const allowed =
        resource === "banners"
          ? ["title", "image", "link", "sort_order", "status"]
          : ["name", "parent_id", "image", "sort_order", "status"];
      const entries = Object.entries(d).filter(([key]) => allowed.includes(key));
      if (!entries.length) return json(res, 400, { message: "没有可更新字段" });
      db.prepare(
        `UPDATE ${resource} SET ${entries.map(([key]) => `${key}=?`).join(",")} WHERE id=?`,
      ).run(...entries.map(([, value]) => value), Number(rawId));
      logAdmin(admin, req, "update", resource, rawId, d);
      return json(res, 200, { ok: true });
    }
    if (contentItem && method === "DELETE") {
      const [, resource, rawId] = contentItem;
      if (resource === "categories") {
        const used = db
          .prepare("SELECT COUNT(*) AS count FROM pets WHERE category_id=?")
          .get(Number(rawId));
        if (used.count)
          db.prepare("UPDATE categories SET status='inactive' WHERE id=?").run(
            Number(rawId),
          );
        else db.prepare("DELETE FROM categories WHERE id=?").run(Number(rawId));
      } else db.prepare("DELETE FROM banners WHERE id=?").run(Number(rawId));
      logAdmin(admin, req, "delete", resource, rawId);
      return json(res, 200, { ok: true });
    }
    if (path === "/api/admin/coupons" && method === "GET")
      return json(
        res,
        200,
        rows(
          `SELECT c.*,
                  (SELECT COUNT(*) FROM user_coupons uc WHERE uc.coupon_id=c.id) AS issued_count,
                  (SELECT COUNT(*) FROM user_coupons uc WHERE uc.coupon_id=c.id AND uc.status='used') AS used_count
           FROM coupons c ORDER BY c.id DESC`,
        ),
      );
    if (path === "/api/admin/coupons" && method === "POST") {
      const d = await body(req);
      if (!String(d.title || "").trim() || Number(d.amount) <= 0)
        return json(res, 400, { message: "请填写优惠券名称和有效面额" });
      const result = db
        .prepare(
          "INSERT INTO coupons(title,amount,threshold,expires_at,status) VALUES(?,?,?,?,?)",
        )
        .run(
          String(d.title).trim(),
          Number(d.amount),
          Math.max(0, Number(d.threshold || 0)),
          d.expires_at || null,
          d.status || "active",
        );
      logAdmin(admin, req, "create", "coupons", result.lastInsertRowid, d);
      return json(res, 201, { id: result.lastInsertRowid });
    }
    const couponRoute = path.match(/^\/api\/admin\/coupons\/(\d+)$/);
    if (couponRoute && method === "PATCH") {
      const d = await body(req);
      const allowed = ["title", "amount", "threshold", "expires_at", "status"];
      const entries = Object.entries(d).filter(([key]) => allowed.includes(key));
      if (!entries.length) return json(res, 400, { message: "没有可更新字段" });
      db.prepare(
        `UPDATE coupons SET ${entries.map(([key]) => `${key}=?`).join(",")} WHERE id=?`,
      ).run(...entries.map(([, value]) => value), Number(couponRoute[1]));
      logAdmin(admin, req, "update", "coupons", couponRoute[1], d);
      return json(res, 200, { ok: true });
    }
    const issueCouponRoute = path.match(/^\/api\/admin\/coupons\/(\d+)\/issue$/);
    if (issueCouponRoute && method === "POST") {
      const d = await body(req);
      const couponId = Number(issueCouponRoute[1]);
      const coupon = db
        .prepare("SELECT id FROM coupons WHERE id=? AND status='active'")
        .get(couponId);
      const user = db.prepare("SELECT id FROM users WHERE id=?").get(Number(d.user_id));
      if (!coupon || !user)
        return json(res, 404, { message: "优惠券或用户不存在/不可用" });
      const existing = db
        .prepare("SELECT id FROM user_coupons WHERE user_id=? AND coupon_id=?")
        .get(user.id, coupon.id);
      if (existing)
        return json(res, 200, { id: existing.id, duplicated: true });
      const result = db
        .prepare("INSERT INTO user_coupons(user_id,coupon_id,status) VALUES(?,?,?)")
        .run(user.id, coupon.id, "available");
      logAdmin(admin, req, "issue", "coupons", couponId, { user_id: user.id });
      return json(res, 201, { id: result.lastInsertRowid, duplicated: false });
    }
    if (path === "/api/admin/feishu/configs" && method === "GET")
      return json(
        res,
        200,
        rows("SELECT * FROM feishu_sync_configs ORDER BY id DESC"),
      );
    if (path === "/api/admin/feishu/configs" && method === "POST") {
      const d = await body(req);
      const r = db
        .prepare(
          "INSERT INTO feishu_sync_configs(name,document_url,app_token,table_id,field_mapping,status,app_id,base_url) VALUES(?,?,?,?,?,?,?,?)",
        )
        .run(
          d.name,
          d.document_url,
          d.app_token ?? null,
          d.table_id ?? "tblUaCqyE3xkk1Bj",
          JSON.stringify(d.field_mapping || {}),
          d.status || "active",
          d.app_id ?? "cli_a902ca6a2cb85cc0",
          d.base_url ?? d.document_url ?? null,
        );
      return json(res, 201, { id: r.lastInsertRowid });
    }
    if (path === "/api/admin/feishu/sync" && method === "POST") {
      const d = await body(req);
      const config = db
        .prepare("SELECT * FROM feishu_sync_configs WHERE id=?")
        .get(Number(d.config_id));
      if (!config) return json(res, 404, { message: "飞书数据源不存在" });
      const suppliedItems = Array.isArray(d.items) ? d.items : null;
      const mockItems =
        !suppliedItems && !d.read_remote
          ? generateSyncItems(Number(d.total || 500))
          : null;
      const initialItems = suppliedItems || mockItems;
      const r = db
        .prepare(
          "INSERT INTO feishu_sync_tasks(config_id,mode,status,total,batch_size) VALUES(?,?,?,?,?)",
        )
        .run(
          d.config_id,
          d.mode || "incremental",
          "pending",
          initialItems?.length || 0,
          Math.min(500, Math.max(1, Number(d.batch_size || 500))),
        );
      const taskId = Number(r.lastInsertRowid);
      if (initialItems) {
        syncQueues.set(taskId, { items: initialItems, paused: false });
        setTimeout(() => processSyncTask(taskId, initialItems), 0);
      } else {
        setTimeout(async () => {
          try {
            const items = await feishuItems(config);
            db.prepare(
              "UPDATE feishu_sync_tasks SET total=?,status='running' WHERE id=?",
            ).run(items.length, taskId);
            syncQueues.set(taskId, { items, paused: false });
            processSyncTask(taskId, items);
          } catch (e) {
            db.prepare(
              "UPDATE feishu_sync_tasks SET status='failed',error=?,finished_at=CURRENT_TIMESTAMP WHERE id=?",
            ).run(e.message, taskId);
          }
        }, 0);
      }
      logAdmin(
        admin,
        req,
        "start_sync",
        "feishu_sync_tasks",
        taskId,
        {
          total: initialItems?.length || 0,
          source: initialItems ? "payload_or_test" : "feishu_api",
        },
      );
      return json(res, 202, {
        taskId,
        status: "pending",
        message: "同步任务已进入队列",
      });
    }
    if (path === "/api/admin/feishu/tasks" && method === "GET")
      return json(
        res,
        200,
        rows("SELECT * FROM feishu_sync_tasks ORDER BY id DESC"),
      );
    const syncAction = path.match(
      /^\/api\/admin\/feishu\/tasks\/(\d+)\/(pause|resume|retry|errors)$/,
    );
    if (syncAction && method === "GET" && syncAction[2] === "errors")
      return json(
        res,
        200,
        rows(
          "SELECT * FROM sync_task_errors WHERE task_id=? ORDER BY id DESC",
          Number(syncAction[1]),
        ),
      );
    if (syncAction && method === "POST") {
      const taskId = Number(syncAction[1]);
      const action = syncAction[2];
      if (action === "pause") {
        const state = syncQueues.get(taskId);
        if (state) state.paused = true;
        db.prepare(
          "UPDATE feishu_sync_tasks SET status='paused',paused_at=CURRENT_TIMESTAMP WHERE id=?",
        ).run(taskId);
      }
      if (action === "resume" || action === "retry") {
        const task = db
          .prepare("SELECT * FROM feishu_sync_tasks WHERE id=?")
          .get(taskId);
        const items =
          syncQueues.get(taskId)?.items ||
          generateSyncItems(task?.total || 500);
        syncQueues.set(taskId, { items, paused: false });
        db.prepare(
          "UPDATE feishu_sync_tasks SET status='running',paused_at=NULL,retry_count=retry_count+? WHERE id=?",
        ).run(action === "retry" ? 1 : 0, taskId);
        setTimeout(() => processSyncTask(taskId, items), 0);
      }
      logAdmin(admin, req, action, "feishu_sync_tasks", taskId);
      return json(res, 200, { ok: true, action });
    }
    if (path === "/api/admin/logs" && method === "GET")
      return json(
        res,
        200,
        rows("SELECT * FROM admin_operation_logs ORDER BY id DESC LIMIT 200"),
      );
    return json(res, 404, { message: "接口不存在" });
  } catch (e) {
    console.error(e);
    json(res, 500, { message: "服务器内部错误" });
  }
}).listen(Number(process.env.PORT || 3001), () =>
  console.log("福宠 API: http://127.0.0.1:3001"),
);
