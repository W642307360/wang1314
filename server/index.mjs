import { createServer } from "node:http";
import { DatabaseSync } from "node:sqlite";
import {
  readFileSync,
  mkdirSync,
  existsSync,
  writeFileSync,
  unlinkSync,
  readdirSync,
  statSync,
} from "node:fs";
import { spawn } from "node:child_process";
import ffmpegPath from "ffmpeg-static";
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
  createHash,
} from "node:crypto";

const root = dirname(fileURLToPath(import.meta.url));
mkdirSync(join(root, "data"), { recursive: true });
mkdirSync(join(root, "uploads"), { recursive: true });
const compatibleMediaDir = join(root, "data", "compatible-media");
mkdirSync(compatibleMediaDir, { recursive: true });
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
const shanghaiDateKey = () =>
  new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10).replaceAll("-", "");
const nextOrderNumber = () => {
  const dateKey = shanghaiDateKey();
  const sequence = db
    .prepare(
      `INSERT INTO daily_order_sequences(sequence_date,last_value,updated_at)
       VALUES(?,1,CURRENT_TIMESTAMP)
       ON CONFLICT(sequence_date) DO UPDATE SET
         last_value=last_value+1,updated_at=CURRENT_TIMESTAMP
       RETURNING last_value`,
    )
    .get(dateKey);
  return `FC${dateKey}-${String(sequence.last_value).padStart(4, "0")}`;
};
const reviewNicknames = [
  "团子的新家", "小满日记", "林间慢生活", "阿梨和猫", "一颗软糖", "晚风饲养员",
  "阳台晒太阳", "认真养宠", "栗子妈妈", "小岛来信", "南南的家", "暖冬陪伴",
];
const reviewOpenings = [
  "到家后的状态比预期更稳定", "第一次线上了解宠物，整个过程很安心", "观察了一段时间再来评价",
  "资料与实际情况一致", "接回家当天精神和食欲都不错", "从咨询到接宠的沟通很细致",
];
const reviewDetails = [
  "性格亲人，适应新环境的速度很快", "毛色自然，眼睛清亮，日常互动很有回应",
  "健康档案、疫苗记录和喂养建议都交代得很清楚", "客服把换粮、应激和作息注意事项逐项说明了",
  "生活视频很真实，见到后和页面展示没有落差", "商家回访及时，遇到饲养问题也会认真回复",
  "家里原有宠物与它磨合顺利，现在已经会一起玩", "体型和年龄描述准确，精神状态也一直很好",
];
const reviewEndings = [
  "目前吃饭、睡觉都很规律。", "家人都很喜欢，会继续认真陪伴。", "这次体验值得肯定。",
  "希望它健康长大。", "已经成为家里很重要的新成员。", "后续有变化还会继续记录。",
];
const reviewMoments = [
  "刚到家时会先安静观察", "现在已经熟悉家里的声音", "吃饭和饮水都很规律", "每天会主动来门口迎接",
  "第一次体检过程很顺利", "换粮过渡没有明显不适", "晚上休息得很安稳", "很快学会了使用自己的用品",
  "对家里的新环境很好奇", "梳毛和清洁时也很配合", "最近互动比刚来时更多", "会自己寻找舒服的位置休息",
  "对家人说话的声音有回应", "玩耍之后能够安静下来", "外出检查时情绪比较稳定", "日常作息正在慢慢固定",
  "适应期比我们预想得更短", "对新玩具保持着好奇心", "最近食欲和精神都很稳定", "已经记住了家里的活动路线",
  "在熟悉的人身边会更放松", "洗护之后毛发状态很自然", "每天的变化都值得记录", "现在已经愿意主动亲近家人",
  "整体状态持续稳定",
];
const generatedReviewCount = (petId) => 10 + ((Number(petId) * 37) % 16);
const createGeneratedReviews = (petId, requestedCount) => {
  const pet = db.prepare("SELECT id,name,breed FROM pets WHERE id=?").get(Number(petId));
  if (!pet) return { created: 0, count: 0 };
  const desiredTotal = Math.min(25, Math.max(10, Number(requestedCount || generatedReviewCount(pet.id))));
  const realCount = Number(db
    .prepare("SELECT COUNT(*) AS count FROM product_reviews WHERE pet_id=? AND source<>'generated'")
    .get(pet.id).count);
  const desiredGenerated = Math.max(0, desiredTotal - realCount);
  let existing = Number(db
    .prepare("SELECT COUNT(*) AS count FROM product_reviews WHERE pet_id=? AND source='generated'")
    .get(pet.id).count);
  if (existing > desiredGenerated) {
    db.prepare(
      `DELETE FROM product_reviews WHERE pet_id=? AND source='generated' AND id NOT IN
       (SELECT id FROM product_reviews WHERE pet_id=? AND source='generated' ORDER BY id DESC LIMIT ?)`,
    ).run(pet.id, pet.id, desiredGenerated);
    existing = desiredGenerated;
  }
  const insert = db.prepare(
    `INSERT INTO product_reviews
      (pet_id,nickname,rating,content,images_json,videos_json,is_verified,likes,source,status,created_at)
     VALUES(?,?,?,?, '[]','[]',0,?,'generated','published',datetime('now',?))`,
  );
  let created = 0;
  for (let i = existing; i < desiredGenerated; i++) {
    const content = `${reviewOpenings[(pet.id + i) % reviewOpenings.length]}。${pet.name || pet.breed} ${reviewDetails[(pet.id * 3 + i) % reviewDetails.length]}，${reviewMoments[i % reviewMoments.length]}，${reviewEndings[(pet.id * 7 + i) % reviewEndings.length]}`;
    insert.run(
      pet.id,
      reviewNicknames[(pet.id + i * 5) % reviewNicknames.length],
      i % 11 === 0 ? 4 : 5,
      content,
      (pet.id * 13 + i * 7) % 86,
      `-${i + 2} days`,
    );
    created++;
  }
  return { created, count: realCount + desiredGenerated };
};
const petDetail = (id) => {
  const pet = db
    .prepare(
      `SELECT p.*,b.id AS breed_profile_id,b.intro AS breed_intro,b.origin AS breed_origin,b.alias AS breed_alias,b.evolution AS breed_evolution,
              b.growth_profile,b.standard_body,
              pp.id AS product_id,pp.status AS product_status,
              s.name AS seller_profile_name,s.city AS seller_city,s.address AS seller_address,
              s.rating AS seller_rating,s.sales AS seller_sales,s.review_count AS seller_review_count,
              s.specialty AS seller_specialty,s.offline_store AS seller_offline_store
       FROM pets p
       LEFT JOIN breeds b ON b.id=p.breed_id OR b.name=p.breed
       LEFT JOIN pet_products pp ON pp.pet_id=p.id
       LEFT JOIN sellers s ON s.id=p.seller_id
       WHERE p.id=?`,
    )
    .get(id);
  if (!pet) return null;
  return {
    ...pet,
    breed_id: pet.breed_id || pet.breed_profile_id || null,
    seller_id: pet.seller_id || null,
    seller_name: pet.seller_name || pet.seller_profile_name || null,
    seller_profile: pet.seller_id ? {
      id: pet.seller_id,
      name: pet.seller_profile_name || pet.seller_name,
      city: pet.seller_city,
      address: pet.seller_address,
      rating: pet.seller_rating,
      sales: pet.seller_sales,
      review_count: pet.seller_review_count,
      specialty: pet.seller_specialty,
      offline_store: pet.seller_offline_store,
    } : null,
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
      alias: pet.breed_alias,
      evolution: pet.breed_evolution,
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
    review_count: db
      .prepare("SELECT MIN(25,COUNT(*)) AS count FROM product_reviews WHERE pet_id=? AND status='published'")
      .get(id).count,
    reviews: rows(
      "SELECT * FROM product_reviews WHERE pet_id=? AND status='published' ORDER BY created_at DESC,id DESC LIMIT 25",
      id,
    ).map((review) => ({
      ...review,
      images: JSON.parse(review.images_json || "[]"),
      videos: JSON.parse(review.videos_json || "[]"),
    })),
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
      "UPDATE orders SET payment_status='paid',status='pending_confirm',paid_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?",
    ).run(order.id);
    db.prepare(
      "INSERT INTO order_status_history(order_id,from_status,to_status,operator_type,note) VALUES(?,?,'pending_confirm','payment','支付成功，等待平台处理')",
    ).run(order.id, order.status);
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
const persistSyncItems = (taskId, items) => {
  const insert = db.prepare(
    `INSERT OR REPLACE INTO feishu_sync_task_items(task_id,row_no,external_id,payload,status,error,processed_at)
     VALUES(?,?,?,?, 'pending',NULL,NULL)`,
  );
  db.exec("BEGIN");
  try {
    items.forEach((item, index) =>
      insert.run(taskId, index + 1, item.external_id || null, JSON.stringify(item)),
    );
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
};
const persistedSyncItems = (taskId) =>
  rows(
    "SELECT payload FROM feishu_sync_task_items WHERE task_id=? ORDER BY row_no",
    taskId,
  ).map((item) => JSON.parse(item.payload));
const userDataCounts = (userId) => ({
  favorites: db.prepare("SELECT COUNT(*) AS count FROM favorites WHERE user_id=?").get(userId).count,
  cart: db.prepare("SELECT COUNT(*) AS count FROM cart_items WHERE user_id=?").get(userId).count,
  orders: db.prepare("SELECT COUNT(*) AS count FROM orders WHERE user_id=?").get(userId).count,
  addresses: db.prepare("SELECT COUNT(*) AS count FROM addresses WHERE user_id=?").get(userId).count,
  messages: db.prepare("SELECT COUNT(*) AS count FROM messages WHERE user_id=?").get(userId).count,
});
const mergeGuestData = (previousUserId, targetUserId) => {
  const previous = db.prepare("SELECT id,status FROM users WHERE id=?").get(Number(previousUserId));
  if (!previous || previous.id === targetUserId || previous.status !== "guest") return false;
  db.exec("BEGIN");
  try {
    db.prepare("INSERT OR IGNORE INTO favorites(user_id,pet_id,created_at) SELECT ?,pet_id,created_at FROM favorites WHERE user_id=?").run(targetUserId, previous.id);
    db.prepare("INSERT OR IGNORE INTO follows(user_id,seller_name,created_at) SELECT ?,seller_name,created_at FROM follows WHERE user_id=?").run(targetUserId, previous.id);
    db.prepare("INSERT OR IGNORE INTO cart_items(user_id,pet_id,quantity,selected,created_at,updated_at) SELECT ?,pet_id,quantity,selected,created_at,updated_at FROM cart_items WHERE user_id=?").run(targetUserId, previous.id);
    for (const table of ["footprints", "addresses", "orders", "messages", "user_coupons", "customer_service_sessions", "seller_reports"])
      db.prepare(`UPDATE ${table} SET user_id=? WHERE user_id=?`).run(targetUserId, previous.id);
    db.prepare("UPDATE visitors SET user_id=? WHERE user_id=?").run(targetUserId, previous.id);
    db.prepare("UPDATE users SET status='merged',updated_at=CURRENT_TIMESTAMP WHERE id=?").run(previous.id);
    db.exec("COMMIT");
    return true;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
};
const feishuTokenCache = new Map();
const getFeishuAccess = async (config = {}) => {
  const appId = config.app_id || process.env.FEISHU_APP_ID;
  const appSecret = process.env.FEISHU_APP_SECRET;
  if (!appId || !appSecret)
    throw new Error("缺少 FEISHU_APP_ID 或 FEISHU_APP_SECRET 环境变量");
  const cached = feishuTokenCache.get(appId);
  if (cached && cached.expiresAt > Date.now()) return cached.token;
  const response = await fetch(
    "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
    },
  );
  const data = await response.json();
  if (!response.ok || data.code)
    throw new Error(data.msg || "获取飞书 tenant_access_token 失败");
  feishuTokenCache.set(appId, {
    token: data.tenant_access_token,
    expiresAt: Date.now() + Math.max(60, Number(data.expire || 7200) - 120) * 1000,
  });
  return data.tenant_access_token;
};
const compatibleVideoTasks = new Map();
const ensureCompatibleVideo = async (mediaUrl, accessToken) => {
  const key = createHash("sha256").update(mediaUrl).digest("hex");
  const target = join(compatibleMediaDir, `${key}.mp4`);
  if (existsSync(target) && statSync(target).size > 1024) return target;
  if (compatibleVideoTasks.has(key)) return compatibleVideoTasks.get(key);
  const task = (async () => {
    const source = join(compatibleMediaDir, `${key}.source.mp4`);
    const response = await fetch(mediaUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) throw new Error("飞书视频下载失败");
    writeFileSync(source, Buffer.from(await response.arrayBuffer()));
    await new Promise((resolve, reject) => {
      const process = spawn(
        ffmpegPath,
        [
          "-y", "-i", source,
          "-c:v", "libx264", "-preset", "veryfast", "-crf", "23",
          "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k",
          "-movflags", "+faststart", target,
        ],
        { windowsHide: true, stdio: "ignore" },
      );
      process.once("error", reject);
      process.once("exit", (code) =>
        code === 0 ? resolve() : reject(new Error(`视频兼容转换失败（${code}）`)),
      );
    });
    if (existsSync(source)) unlinkSync(source);
    return target;
  })().finally(() => compatibleVideoTasks.delete(key));
  compatibleVideoTasks.set(key, task);
  return task;
};
const serveRangeFile = (req, res, file, contentType) => {
  const size = statSync(file).size;
  const range = String(req.headers.range || "").match(/bytes=(\d*)-(\d*)/);
  if (!range) {
    res.writeHead(200, {
      "content-type": contentType,
      "content-length": size,
      "accept-ranges": "bytes",
      "cache-control": "public,max-age=31536000,immutable",
      "access-control-allow-origin": "*",
    });
    return res.end(readFileSync(file));
  }
  const start = Math.max(0, Number(range[1] || 0));
  const end = Math.min(size - 1, Number(range[2] || Math.min(size - 1, start + 1024 * 1024 - 1)));
  const data = readFileSync(file).subarray(start, end + 1);
  res.writeHead(206, {
    "content-type": contentType,
    "content-length": data.length,
    "content-range": `bytes ${start}-${end}/${size}`,
    "accept-ranges": "bytes",
    "cache-control": "public,max-age=31536000,immutable",
    "access-control-allow-origin": "*",
  });
  return res.end(data);
};
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
const feishuCategoryId = (value) => {
  const hall = Array.isArray(value) ? value[0] : value;
  const hallMap = {
    "猫猫馆": 1,
    "狗狗馆": 2,
    "鸟类馆": 3,
    "水族馆": 4,
    "奇宠馆": 5,
    "更多馆": 6,
  };
  return Number(hall) || hallMap[String(hall || "")] || 1;
};
const feishuProductStatus = (value) => {
  const status = String(Array.isArray(value) ? value[0] : value || "").trim();
  if (["published", "available", "在售", "上架", "销售中"].includes(status))
    return "published";
  if (["sold", "已售", "已售出"].includes(status)) return "sold";
  if (["offline", "下架", "已下架"].includes(status)) return "offline";
  return "draft";
};
const feishuMediaList = (record, fieldNames) => {
  const urls = [];
  for (const name of [...new Set(fieldNames.filter(Boolean))]) {
    const value = feishuValue(record.fields?.[name]);
    const items = Array.isArray(value) ? value : value ? [value] : [];
    for (const item of items) {
      for (const candidate of String(item).split(/[\n，,]/)) {
        const clean = candidate.trim();
        if (/^https?:\/\//.test(clean)) urls.push(clean);
      }
    }
  }
  return [...new Set(urls)];
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
  const accessToken = await getFeishuAccess({ ...config, app_id: appId });
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
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data = await response.json();
    if (!response.ok || data.code)
      throw new Error(data.msg || "读取飞书多维表格失败");
    records.push(...(data.data?.items || []));
    if (!data.data?.has_more) break;
    pageToken = data.data.page_token;
  }
  return records.map((record) => {
    const images = feishuMediaList(record, [
      mapping.images, "主图文件", "主图", "图片", "商品图片", "展示图片", "生活照片", "详情图片",
    ]).slice(0, 60);
    const videos = feishuMediaList(record, [
      mapping.videos, "视频文件", "视频", "商品视频", "生活视频", "详情视频",
    ]).slice(0, 12);
    return {
      name: field(record, "name", "宠物名称"),
      category_id: feishuCategoryId(
        field(record, "category_id", "场馆") ||
          field(record, "category_id", "分类ID"),
      ),
      breed: field(record, "breed", "品种"),
      gender: field(record, "gender", "性别"),
      age_months: Number(field(record, "age_months", "月龄") || 0) || null,
      color: field(record, "color", "毛色"),
      body_type: field(record, "body_type", "体型"),
      personality: field(record, "personality", "性格"),
      health_status: field(record, "health_status", "健康状态"),
      vaccine_record: field(record, "vaccine_record", "疫苗记录"),
      description: field(record, "description", "商品详情"),
      breed_origin: field(record, "breed_origin", "品种起源") || field(record, "breed_origin", "原产地"),
      breed_alias: field(record, "breed_alias", "品种别称"),
      breed_evolution: field(record, "breed_evolution", "品种演化"),
      price: Number(field(record, "price", "价格") || 0),
      seller_name: field(record, "seller_name", "商家名称"),
      status: feishuProductStatus(field(record, "status", "商品状态")),
      source: "feishu",
      external_id: record.record_id,
      stock: Number(field(record, "stock", "库存") || 1),
      images,
      videos,
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
       name=excluded.name,
       category_id=excluded.category_id,
       breed=excluded.breed,
       gender=COALESCE(excluded.gender,pets.gender),
       age_months=COALESCE(excluded.age_months,pets.age_months),
       color=COALESCE(excluded.color,pets.color),
       body_type=COALESCE(excluded.body_type,pets.body_type),
       personality=COALESCE(excluded.personality,pets.personality),
       health_status=COALESCE(excluded.health_status,pets.health_status),
       vaccine_record=COALESCE(excluded.vaccine_record,pets.vaccine_record),
       description=COALESCE(excluded.description,pets.description),
       price=excluded.price,
       seller_name=COALESCE(excluded.seller_name,pets.seller_name),
       status=CASE WHEN excluded.status='draft' AND pets.status='published' THEN pets.status ELSE excluded.status END,
       updated_at=CURRENT_TIMESTAMP`,
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
        const assignedSellerId = item.seller_id || (petId ? ((Number(petId) - 1) % 20) + 1 : null);
        const assignedSeller = assignedSellerId
          ? db.prepare("SELECT id,name FROM sellers WHERE id=? AND status='active'").get(assignedSellerId)
          : null;
        if (petId && assignedSeller)
          db.prepare(
            "UPDATE pets SET seller_id=?,seller_name=COALESCE(NULLIF(seller_name,''),?) WHERE id=?",
          ).run(assignedSeller.id, assignedSeller.name, petId);
        const breed = db
          .prepare("SELECT id FROM breeds WHERE name=?")
          .get(item.breed);
        let breedId = breed?.id;
        if (!breedId) {
          const createdBreed = db
            .prepare(
              "INSERT INTO breeds(name,category_id,intro,origin,growth_profile,standard_body,alias,evolution) VALUES(?,?,?,?,?,?,?,?)",
            )
            .run(
              item.breed,
              item.category_id || 1,
              `${item.breed}标准品种档案`,
              item.breed_origin || "中国及国际登记繁育体系",
              "待运营补充",
              item.body_type || "待运营补充",
              item.breed_alias || `${item.breed}标准品种`,
              item.breed_evolution || `${item.breed}经长期自然适应与规范繁育，逐步形成稳定品种特征。`,
            );
          breedId = createdBreed.lastInsertRowid;
        }
        if (breedId && (item.breed_origin || item.breed_alias || item.breed_evolution))
          db.prepare(
            "UPDATE breeds SET origin=COALESCE(?,origin),alias=COALESCE(?,alias),evolution=COALESCE(?,evolution) WHERE id=?",
          ).run(item.breed_origin || null, item.breed_alias || null, item.breed_evolution || null, breedId);
        if (petId)
          db.prepare("UPDATE pets SET breed_id=? WHERE id=?").run(breedId, petId);
        if (petId)
          db.prepare(
            "INSERT INTO pet_products(pet_id,breed_id,seller_id,product_name,status) VALUES(?,?,?,?,?) ON CONFLICT(pet_id) DO UPDATE SET breed_id=excluded.breed_id,product_name=excluded.product_name,status=excluded.status,updated_at=CURRENT_TIMESTAMP",
          ).run(
            petId,
            breedId,
            assignedSeller?.id || null,
            item.name,
            item.status === "published" ? "available" : "offline",
          );
        if (petId)
          db.prepare(
            "INSERT INTO inventory(pet_id,total_stock,available_stock) SELECT ?,?,? WHERE NOT EXISTS (SELECT 1 FROM inventory WHERE pet_id=? AND sku_id IS NULL)",
          ).run(petId, Number(item.stock || 1), Number(item.stock || 1), petId);
        if (petId)
          db.prepare(
            "UPDATE inventory SET total_stock=?,available_stock=MAX(0,?-locked_stock),updated_at=CURRENT_TIMESTAMP WHERE pet_id=? AND sku_id IS NULL",
          ).run(Number(item.stock || 1), Number(item.stock || 1), petId);
        for (const [imageIndex, imageUrl] of (item.images || []).entries()) {
          if (!petId || !imageUrl) continue;
          const existingImage = db
            .prepare("SELECT id FROM pet_images WHERE pet_id=? AND sort_order=? ORDER BY id LIMIT 1")
            .get(petId, imageIndex);
          if (existingImage)
            db.prepare("UPDATE pet_images SET url=?,type=? WHERE id=?").run(
              String(imageUrl),
              imageIndex === 0 ? "main" : "gallery",
              existingImage.id,
            );
          else
            db.prepare(
              "INSERT OR IGNORE INTO pet_images(pet_id,url,type,sort_order) VALUES(?,?,?,?)",
            ).run(petId, String(imageUrl), imageIndex === 0 ? "main" : "gallery", imageIndex);
        }
        const existingVideos = petId
          ? rows("SELECT id FROM pet_videos WHERE pet_id=? ORDER BY id", petId)
          : [];
        for (const [videoIndex, videoUrl] of (item.videos || []).entries()) {
          if (!petId || !videoUrl) continue;
          if (existingVideos[videoIndex])
            db.prepare("UPDATE pet_videos SET url=?,status='pending_transcode' WHERE id=?").run(
              String(videoUrl),
              existingVideos[videoIndex].id,
            );
          else
            db.prepare(
              "INSERT OR IGNORE INTO pet_videos(pet_id,url,status) VALUES(?,?,?)",
            ).run(petId, String(videoUrl), "pending_transcode");
        }
        db.prepare(
          "UPDATE feishu_sync_task_items SET status='success',error=NULL,processed_at=CURRENT_TIMESTAMP WHERE task_id=? AND row_no=?",
        ).run(taskId, start + i + 1);
        success++;
      } catch (e) {
        failed++;
        db.prepare(
          "UPDATE feishu_sync_task_items SET status='failed',error=?,processed_at=CURRENT_TIMESTAMP WHERE task_id=? AND row_no=?",
        ).run(e.message, taskId, start + i + 1);
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

const server = createServer(async (req, res) => {
  try {
    if (req.method === "OPTIONS") return json(res, 204, {});
    const url = new URL(req.url, "http://localhost");
    const path = url.pathname;
    const method = req.method;
    if (path === "/api/media/feishu" && method === "GET") {
      const rawUrl = url.searchParams.get("url");
      let mediaUrl;
      try {
        mediaUrl = new URL(rawUrl || "");
      } catch {
        return json(res, 400, { message: "媒体地址不合法" });
      }
      if (
        mediaUrl.protocol !== "https:" ||
        mediaUrl.hostname !== "open.feishu.cn" ||
        !mediaUrl.pathname.startsWith("/open-apis/drive/v1/medias/")
      )
        return json(res, 400, { message: "仅允许读取飞书媒体地址" });
      try {
        const config = db
          .prepare("SELECT * FROM feishu_sync_configs WHERE status='active' ORDER BY id DESC LIMIT 1")
          .get() || {};
        const accessToken = await getFeishuAccess(config);
        if (url.searchParams.get("format") === "h264") {
          const compatibleFile = await ensureCompatibleVideo(mediaUrl.toString(), accessToken);
          return serveRangeFile(req, res, compatibleFile, "video/mp4");
        }
        const upstream = await fetch(mediaUrl, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            ...(req.headers.range ? { Range: req.headers.range } : {}),
          },
        });
        if (!upstream.ok || !upstream.body)
          return json(res, upstream.status || 502, { message: "飞书媒体读取失败" });
        const headers = {
          "content-type": upstream.headers.get("content-type") || "application/octet-stream",
          "cache-control": "public,max-age=3600,stale-while-revalidate=86400",
          "access-control-allow-origin": "*",
          "accept-ranges": upstream.headers.get("accept-ranges") || "bytes",
        };
        const contentLength = upstream.headers.get("content-length");
        const contentRange = upstream.headers.get("content-range");
        if (contentLength) headers["content-length"] = contentLength;
        if (contentRange) headers["content-range"] = contentRange;
        res.writeHead(upstream.status, headers);
        for await (const chunk of upstream.body) res.write(chunk);
        return res.end();
      } catch (error) {
        return json(res, 502, {
          message: error instanceof Error ? error.message : "飞书媒体代理异常",
        });
      }
    }
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
      if (["phone", "mock_wechat", "wechat"].includes(String(d.login_type || "")) && !/^1\d{10}$/.test(String(d.phone || "")))
        return json(res, 400, { message: "登录需要有效的11位手机号" });
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
      user = db.prepare("SELECT * FROM users WHERE id=?").get(user.id);
      const guestDataMerged = mergeGuestData(d.previous_user_id, user.id);
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
        guest_data_merged: guestDataMerged,
        data_counts: userDataCounts(user.id),
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
        cart: count("SELECT COUNT(*) AS count FROM cart_items WHERE user_id=?", id),
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
      const baseSelect = `SELECT p.*,c.name AS category_name,pp.status AS product_status,
                                 (SELECT pi.url FROM pet_images pi WHERE pi.pet_id=p.id ORDER BY pi.sort_order,pi.id LIMIT 1) AS image,
                                 (SELECT COUNT(*) FROM pet_images pi WHERE pi.pet_id=p.id) AS image_count,
                                 (SELECT COUNT(*) FROM pet_videos pv WHERE pv.pet_id=p.id) AS video_count
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
    if (publicPet && method === "POST") {
      const petId = Number(publicPet[1]);
      const d = await body(req);
      const user = db.prepare("SELECT id,nickname,avatar FROM users WHERE id=?").get(Number(d.user_id));
      if (!user) return json(res, 400, { message: "请先登录后评价" });
      if (!db.prepare("SELECT id FROM pets WHERE id=?").get(petId))
        return json(res, 404, { message: "商品不存在" });
      const content = String(d.content || "").trim();
      const rating = Math.min(5, Math.max(1, Number(d.rating || 5)));
      if (content.length < 5) return json(res, 400, { message: "评价内容至少需要5个字" });
      const verified = !!db
        .prepare(
          `SELECT 1 FROM orders o JOIN order_items oi ON oi.order_id=o.id
           WHERE o.user_id=? AND oi.pet_id=? AND o.payment_status='paid' LIMIT 1`,
        )
        .get(user.id, petId);
      const created = db
        .prepare(
          `INSERT INTO product_reviews(pet_id,user_id,nickname,avatar,rating,content,images_json,videos_json,is_verified)
           VALUES(?,?,?,?,?,?,?,?,?)`,
        )
        .run(
          petId,
          user.id,
          user.nickname,
          user.avatar,
          rating,
          content,
          JSON.stringify(Array.isArray(d.images) ? d.images.slice(0, 9) : []),
          JSON.stringify(Array.isArray(d.videos) ? d.videos.slice(0, 3) : []),
          verified ? 1 : 0,
        );
      return json(res, 201, { id: created.lastInsertRowid, verified });
    }
    if (publicPet && method === "GET") {
      const pet = petDetail(Number(publicPet[1]));
      if (!pet)
        return json(res, 404, { message: "商品不存在或未上架" });
      return json(res, 200, pet);
    }
    const reviewLike = path.match(/^\/api\/reviews\/(\d+)\/like$/);
    if (reviewLike && method === "POST") {
      const result = db
        .prepare("UPDATE product_reviews SET likes=likes+1 WHERE id=?")
        .run(Number(reviewLike[1]));
      if (!result.changes) return json(res, 404, { message: "评价不存在" });
      return json(res, 200, db.prepare("SELECT id,likes FROM product_reviews WHERE id=?").get(Number(reviewLike[1])));
    }
    if (path === "/api/categories" && method === "GET")
      return json(
        res,
        200,
        rows(
          "SELECT * FROM categories WHERE status='active' ORDER BY sort_order,id",
        ),
      );
    const sellerReportRoute = path.match(/^\/api\/sellers\/(\d+)\/reports$/);
    if (sellerReportRoute && method === "POST") {
      const sellerId = Number(sellerReportRoute[1]);
      const seller = db.prepare("SELECT id FROM sellers WHERE id=? AND status='active'").get(sellerId);
      if (!seller) return json(res, 404, { message: "商家不存在或已暂停营业" });
      const d = await body(req);
      const content = String(d.content || "").trim();
      const category = String(d.category || "其他问题").trim();
      if (content.length < 5) return json(res, 400, { message: "请至少填写5个字的问题说明" });
      const userId = db.prepare("SELECT id FROM users WHERE id=?").get(Number(d.user_id))?.id || null;
      const petId = db.prepare("SELECT id FROM pets WHERE id=?").get(Number(d.pet_id))?.id || null;
      const created = db.prepare(
        `INSERT INTO seller_reports(seller_id,user_id,pet_id,category,content,contact_phone,status)
         VALUES(?,?,?,?,?,?,'pending')`,
      ).run(sellerId, userId, petId, category, content, String(d.contact_phone || "").trim() || null);
      return json(res, 201, { id: created.lastInsertRowid, status: "pending", message: "举报信息已提交，平台会尽快核实" });
    }
    const publicSeller = path.match(/^\/api\/sellers\/(\d+)$/);
    if (publicSeller && method === "GET") {
      const seller = db
        .prepare("SELECT * FROM sellers WHERE id=? AND status='active'")
        .get(Number(publicSeller[1]));
      if (!seller) return json(res, 404, { message: "商家不存在或已暂停营业" });
      return json(res, 200, {
        ...seller,
        review_total: db.prepare("SELECT COUNT(*) AS count FROM seller_reviews WHERE seller_id=?").get(seller.id).count,
        reviews: rows(
          "SELECT id,nickname,rating,content,tags,created_at FROM seller_reviews WHERE seller_id=? ORDER BY created_at DESC,id DESC LIMIT 30",
          seller.id,
        ),
        products: rows(
          `SELECT id,name,breed,price,status,
                  (SELECT url FROM pet_images WHERE pet_id=pets.id ORDER BY sort_order,id LIMIT 1) AS image
           FROM pets WHERE seller_id=? AND status='published' ORDER BY updated_at DESC LIMIT 12`,
          seller.id,
        ),
      });
    }
    if (path === "/api/admin/pets" && method === "GET")
      return json(
        res,
        200,
        rows(
          `SELECT p.*,
                  (SELECT pi.url FROM pet_images pi WHERE pi.pet_id=p.id ORDER BY pi.sort_order,pi.id LIMIT 1) AS image,
                  (SELECT COUNT(*) FROM pet_images pi WHERE pi.pet_id=p.id) AS image_count,
                  (SELECT COUNT(*) FROM pet_videos pv WHERE pv.pet_id=p.id) AS video_count
           FROM pets p ORDER BY p.id DESC LIMIT ? OFFSET ?`,
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
    if (path === "/api/admin/orders") {
      const paging = pageParams(url, { pageSize: 100, max: 200 });
      const orderStatus = String(url.searchParams.get("status") || "");
      const paymentStatus = String(url.searchParams.get("payment_status") || "");
      return json(
        res,
        200,
        rows(
          `SELECT o.*,u.nickname,u.phone,u.login_method,
                  CASE WHEN NULLIF(TRIM(u.phone),'') IS NULL THEN 0 ELSE 1 END AS phone_bound,
                  (SELECT COUNT(*) FROM visitors v WHERE v.user_id=o.user_id) AS visitor_sessions,
                  (SELECT COALESCE(SUM(v.visit_count),0) FROM visitors v WHERE v.user_id=o.user_id) AS visit_count
           FROM orders o JOIN users u ON u.id=o.user_id
           WHERE (?='' OR o.status=?) AND (?='' OR o.payment_status=?)
           ORDER BY o.id DESC LIMIT ? OFFSET ?`,
          orderStatus,
          orderStatus,
          paymentStatus,
          paymentStatus,
          paging.pageSize,
          paging.offset,
        ),
      );
    }
    if (path === "/api/admin/users") {
      const paging = pageParams(url, { pageSize: 100, max: 200 });
      return json(
        res,
        200,
        rows(
          "SELECT id,nickname,avatar,phone,status,login_method,last_login_at,created_at FROM users ORDER BY id DESC LIMIT ? OFFSET ?",
          paging.pageSize,
          paging.offset,
        ),
      );
    }
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
    if (path === "/api/admin/seller-reports")
      return json(res, 200, rows(
        `SELECT sr.*,s.name AS seller_name,u.nickname AS user_nickname,p.name AS pet_name
         FROM seller_reports sr
         JOIN sellers s ON s.id=sr.seller_id
         LEFT JOIN users u ON u.id=sr.user_id
         LEFT JOIN pets p ON p.id=sr.pet_id
         ORDER BY CASE sr.status WHEN 'pending' THEN 0 WHEN 'processing' THEN 1 ELSE 2 END,sr.id DESC`,
      ));
    const sellerReportAdmin = path.match(/^\/api\/admin\/seller-reports\/(\d+)$/);
    if (sellerReportAdmin && method === "PATCH") {
      const d = await body(req);
      const status = ["pending", "processing", "completed", "rejected"].includes(d.status) ? d.status : "processing";
      const result = db.prepare(
        "UPDATE seller_reports SET status=?,reply=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",
      ).run(status, String(d.reply || "").trim() || null, Number(sellerReportAdmin[1]));
      if (!result.changes) return json(res, 404, { message: "举报记录不存在" });
      logAdmin(admin, req, "resolve", "seller_reports", Number(sellerReportAdmin[1]), { status });
      return json(res, 200, { ok: true, status });
    }
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
      const logisticsOrderStatus = {
        pending: "pending_confirm",
        packed: "packed",
        shipped: "shipped",
        in_transit: "in_transit",
        delivering: "delivering",
        delivered: "completed",
      }[d.status];
      if (logisticsOrderStatus && logisticsOrderStatus !== order.status) {
        db.prepare(
          "UPDATE orders SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",
        ).run(logisticsOrderStatus, orderId);
        db.prepare(
          "INSERT INTO order_status_history(order_id,from_status,to_status,operator_type,operator_id,note) VALUES(?,?,?,?,?,?)",
        ).run(orderId, order.status, logisticsOrderStatus, "admin", admin.sub, d.note || "物流进度更新");
      }
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
      const clientRequestId = String(d.client_request_id || "").trim();
      if (clientRequestId) {
        const existingOrder = db
          .prepare("SELECT id,order_no,status,payment_status FROM orders WHERE user_id=? AND client_request_id=?")
          .get(userId, clientRequestId);
        if (existingOrder) return json(res, 200, { ...existingOrder, idempotent: true });
      }
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
      db.exec("BEGIN");
      try {
        const no = nextOrderNumber();
        const o = db
          .prepare(
            "INSERT INTO orders(order_no,user_id,total_amount,address_snapshot,client_request_id) VALUES(?,?,?,?,?)",
          )
          .run(no, userId, pet.price, JSON.stringify(address), clientRequestId || null);
        db.prepare(
          "INSERT INTO order_items(order_id,pet_id,pet_snapshot,price) VALUES(?,?,?,?)",
        ).run(o.lastInsertRowid, pet.id, JSON.stringify(pet), pet.price);
        db.prepare(
          "INSERT INTO order_status_history(order_id,from_status,to_status,operator_type,operator_id,note) VALUES(?,NULL,'pending_payment','user',?,'用户提交订单')",
        ).run(o.lastInsertRowid, userId);
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
        db.prepare(
          "INSERT INTO order_status_history(order_id,from_status,to_status,operator_type,operator_id,note) VALUES(?,?,'cancelled','user',?,'用户取消订单')",
        ).run(orderId, order.status, userId);
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
        status_history: rows(
          "SELECT from_status,to_status,operator_type,note,created_at FROM order_status_history WHERE order_id=? ORDER BY id",
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
    if (path === "/api/cart" && method === "GET") {
      const userId = Number(url.searchParams.get("user_id") || 0);
      if (!db.prepare("SELECT id FROM users WHERE id=?").get(userId))
        return json(res, 400, { message: "用户不存在，请重新登录" });
      return json(
        res,
        200,
        rows(
          `SELECT c.id AS cart_id,c.pet_id,c.quantity,c.selected,c.created_at AS added_at,
                  p.name,p.breed,p.gender,p.age_months,p.price,p.seller_name,p.status AS pet_status,
                  COALESCE(p.thumbnail_url,p.highres_url,
                    (SELECT COALESCE(pi.thumbnail_url,pi.webp_url,pi.url) FROM pet_images pi WHERE pi.pet_id=p.id ORDER BY pi.sort_order,pi.id LIMIT 1)
                  ) AS image
           FROM cart_items c JOIN pets p ON p.id=c.pet_id
           WHERE c.user_id=? ORDER BY c.updated_at DESC,c.id DESC`,
          userId,
        ),
      );
    }
    if (path === "/api/cart" && method === "POST") {
      const d = await body(req);
      const userId = Number(d.user_id || 0), petId = Number(d.pet_id || 0);
      if (!db.prepare("SELECT id FROM users WHERE id=?").get(userId))
        return json(res, 400, { message: "用户不存在，请重新登录" });
      if (!db.prepare("SELECT id FROM pets WHERE id=? AND status<>'deleted'").get(petId))
        return json(res, 404, { message: "商品不存在或已删除" });
      db.prepare(
        `INSERT INTO cart_items(user_id,pet_id,quantity,selected) VALUES(?,?,?,1)
         ON CONFLICT(user_id,pet_id) DO UPDATE SET quantity=MIN(99,cart_items.quantity+excluded.quantity),selected=1,updated_at=CURRENT_TIMESTAMP`,
      ).run(userId, petId, Math.max(1, Number(d.quantity || 1)));
      const cart = db.prepare("SELECT * FROM cart_items WHERE user_id=? AND pet_id=?").get(userId, petId);
      return json(res, 201, { ok: true, cart, count: userDataCounts(userId).cart });
    }
    if (path === "/api/cart/merge" && method === "POST") {
      const d = await body(req);
      const userId = Number(d.user_id || 0);
      if (!db.prepare("SELECT id FROM users WHERE id=?").get(userId))
        return json(res, 400, { message: "用户不存在，请重新登录" });
      const items = Array.isArray(d.items) ? d.items.slice(0, 200) : [];
      const insert = db.prepare(
        `INSERT INTO cart_items(user_id,pet_id,quantity,selected) SELECT ?,?,?,1
         WHERE EXISTS(SELECT 1 FROM pets WHERE id=? AND status<>'deleted')
         ON CONFLICT(user_id,pet_id) DO UPDATE SET quantity=MAX(cart_items.quantity,excluded.quantity),updated_at=CURRENT_TIMESTAMP`,
      );
      db.exec("BEGIN");
      try {
        for (const item of items) {
          const petId = Number(item.pet_id || 0);
          if (petId) insert.run(userId, petId, Math.max(1, Number(item.quantity || 1)), petId);
        }
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
      return json(res, 200, { ok: true, count: userDataCounts(userId).cart });
    }
    const cartItem = path.match(/^\/api\/cart\/(\d+)$/);
    if (cartItem && method === "DELETE") {
      const userId = Number(url.searchParams.get("user_id") || 0);
      const petId = Number(url.searchParams.get("pet_id") || 0);
      db.prepare("DELETE FROM cart_items WHERE user_id=? AND (id=? OR (? > 0 AND pet_id=?))").run(userId, Number(cartItem[1]), petId, petId);
      return json(res, 200, { ok: true, count: userDataCounts(userId).cart });
    }
    if (path === "/api/favorites" && method === "GET")
      return json(
        res,
        200,
        rows(
          `SELECT f.*,p.name,p.breed,p.price,p.gender,p.age_months,p.color,p.health_status,p.seller_name,
                  p.status AS pet_status,p.breed_id,p.seller_id,
                  CASE WHEN p.id IS NULL THEN 'missing' WHEN p.status='published' THEN COALESCE(pp.status,'available') WHEN p.status='sold' THEN 'sold' ELSE 'offline' END AS product_status,
                  COALESCE(p.thumbnail_url,p.highres_url,
                    (SELECT COALESCE(pi.thumbnail_url,pi.webp_url,pi.url) FROM pet_images pi WHERE pi.pet_id=p.id ORDER BY pi.sort_order,pi.id LIMIT 1)
                  ) AS image
           FROM favorites f
           LEFT JOIN pets p ON p.id=f.pet_id
           LEFT JOIN pet_products pp ON pp.pet_id=p.id
           WHERE f.user_id=?
           ORDER BY f.created_at DESC`,
          Number(url.searchParams.get("user_id") || 1),
        ),
      );
    if (path === "/api/favorites" && method === "POST") {
      const d = await body(req);
      const userId = Number(d.user_id || 0);
      const petId = Number(d.pet_id || 0);
      if (!db.prepare("SELECT id FROM users WHERE id=?").get(userId))
        return json(res, 400, { message: "用户不存在，请重新登录" });
      if (!db.prepare("SELECT id FROM pets WHERE id=?").get(petId))
        return json(res, 404, { message: "商品不存在，暂时不能收藏" });
      db.prepare(
        "INSERT OR IGNORE INTO favorites(user_id,pet_id) VALUES(?,?)",
      ).run(userId, petId);
      const favorite = db
        .prepare("SELECT * FROM favorites WHERE user_id=? AND pet_id=?")
        .get(userId, petId);
      const count = db
        .prepare("SELECT COUNT(*) AS count FROM favorites WHERE user_id=?")
        .get(userId).count;
      return json(res, 201, { ok: true, favorite, count });
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
      if (d.replace_main) {
        const primary = db
          .prepare(
            mediaRoute[2] === "images"
              ? "SELECT id FROM pet_images WHERE pet_id=? ORDER BY sort_order,id LIMIT 1"
              : "SELECT id FROM pet_videos WHERE pet_id=? ORDER BY id LIMIT 1",
          )
          .get(petId);
        if (primary) {
          db.prepare(`UPDATE ${mediaTable} SET url=? WHERE id=?`).run(d.url, primary.id);
          logAdmin(admin, req, "replace_media", mediaTable, primary.id, { pet_id: petId });
          return json(res, 200, { id: primary.id, replaced: true });
        }
      }
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
          .run(petId, d.url, d.type || "gallery", Number(d.sort_order || 0));
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
          `SELECT o.*,u.nickname,u.phone,u.login_method,
                  CASE WHEN NULLIF(TRIM(u.phone),'') IS NULL THEN 0 ELSE 1 END AS phone_bound,
                  (SELECT COUNT(*) FROM visitors v WHERE v.user_id=o.user_id) AS visitor_sessions,
                  (SELECT COALESCE(SUM(v.visit_count),0) FROM visitors v WHERE v.user_id=o.user_id) AS visit_count
           FROM orders o JOIN users u ON u.id=o.user_id WHERE o.id=?`,
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
              status_history: rows(
                "SELECT * FROM order_status_history WHERE order_id=? ORDER BY id",
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
        "packed",
        "shipped",
        "in_transit",
        "delivering",
        "pending_receive",
        "completed",
        "cancelled",
        "after_sale",
      ];
      if (d.status && !allowedStatuses.includes(d.status))
        return json(res, 400, { message: "订单状态不合法" });
      const transitions = {
        pending_payment: ["pending_confirm", "cancelled"],
        pending_confirm: ["pending_ship", "packed", "cancelled", "after_sale"],
        pending_ship: ["packed", "shipped", "cancelled", "after_sale"],
        packed: ["shipped", "cancelled", "after_sale"],
        shipped: ["in_transit", "delivering", "after_sale"],
        in_transit: ["delivering", "after_sale"],
        delivering: ["completed", "after_sale"],
        pending_receive: ["completed", "after_sale"],
        completed: ["after_sale"],
        cancelled: [],
        after_sale: ["completed", "cancelled"],
      };
      if (
        d.status &&
        d.status !== existing.status &&
        !transitions[existing.status]?.includes(d.status)
      )
        return json(res, 409, { message: `订单不能从 ${existing.status} 直接变更为 ${d.status}` });
      const nextPaymentStatus = d.payment_status || existing.payment_status;
      if (["pending_ship", "packed", "shipped", "in_transit", "delivering", "pending_receive", "completed"].includes(d.status) && nextPaymentStatus !== "paid")
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
        if (d.status && d.status !== existing.status)
          db.prepare(
            "INSERT INTO order_status_history(order_id,from_status,to_status,operator_type,operator_id,note) VALUES(?,?,?,?,?,?)",
          ).run(orderId, existing.status, d.status, "admin", admin.sub, d.note || "管理员更新订单状态");
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
    if (path === "/api/admin/reviews" && method === "GET") {
      const petId = Number(url.searchParams.get("pet_id") || 0);
      const { pageSize, offset } = pageParams(url, { pageSize: 50, max: 150 });
      const where = petId ? "WHERE r.pet_id=?" : "";
      const params = petId ? [petId, pageSize, offset] : [pageSize, offset];
      return json(
        res,
        200,
        rows(
          `SELECT r.*,p.name AS pet_name,p.breed FROM product_reviews r
           JOIN pets p ON p.id=r.pet_id ${where}
           ORDER BY r.id DESC LIMIT ? OFFSET ?`,
          ...params,
        ),
      );
    }
    if (path === "/api/admin/reviews/generate" && method === "POST") {
      const d = await body(req);
      const result = createGeneratedReviews(Number(d.pet_id), Number(d.count || 0));
      if (!result.count) return json(res, 404, { message: "商品不存在" });
      logAdmin(admin, req, "generate", "product_reviews", d.pet_id, result);
      return json(res, 201, result);
    }
    const adminReviewRoute = path.match(/^\/api\/admin\/reviews\/(\d+)$/);
    if (adminReviewRoute && method === "PATCH") {
      const d = await body(req);
      const status = d.status === "hidden" ? "hidden" : "published";
      db.prepare("UPDATE product_reviews SET status=? WHERE id=?").run(status, Number(adminReviewRoute[1]));
      logAdmin(admin, req, "moderate", "product_reviews", adminReviewRoute[1], { status });
      return json(res, 200, { ok: true, status });
    }
    if (adminReviewRoute && method === "DELETE") {
      db.prepare("DELETE FROM product_reviews WHERE id=? AND source='generated'").run(Number(adminReviewRoute[1]));
      logAdmin(admin, req, "delete", "product_reviews", adminReviewRoute[1]);
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
        rows("SELECT * FROM feishu_sync_configs ORDER BY id DESC").map((config) => ({
          ...config,
          secret_configured: Boolean(process.env.FEISHU_APP_SECRET),
          credential_storage: "environment",
        })),
      );
    if (path === "/api/admin/feishu/configs" && method === "POST") {
      const d = await body(req);
      if (!String(d.name || "").trim())
        return json(res, 400, { message: "请填写数据源名称" });
      if (!String(d.document_url || "").includes("/base/"))
        return json(res, 400, { message: "请填写正确的飞书多维表格链接" });
      if (!String(d.app_id || "").trim() || !String(d.table_id || "").trim())
        return json(res, 400, { message: "App ID 和 Table ID 不能为空" });
      const appToken =
        d.app_token || String(d.document_url).match(/\/base\/([^/?#]+)/)?.[1] || null;
      const tableId = d.table_id || "tblUaCqyE3xkk1Bj";
      const existing = db
        .prepare("SELECT id FROM feishu_sync_configs WHERE app_token=? AND table_id=? LIMIT 1")
        .get(appToken, tableId);
      if (existing) {
        db.prepare(
          `UPDATE feishu_sync_configs SET name=?,document_url=?,field_mapping=?,status=?,app_id=?,base_url=?
           WHERE id=?`,
        ).run(
          d.name,
          d.document_url,
          JSON.stringify(d.field_mapping || {}),
          d.status || "active",
          d.app_id,
          d.base_url || d.document_url,
          existing.id,
        );
        logAdmin(admin, req, "update", "feishu_sync_configs", existing.id, { table_id: tableId });
        return json(res, 200, { id: existing.id, updated: true });
      }
      const r = db.prepare(
        "INSERT INTO feishu_sync_configs(name,document_url,app_token,table_id,field_mapping,status,app_id,base_url) VALUES(?,?,?,?,?,?,?,?)",
      ).run(
        d.name,
        d.document_url,
        appToken,
        tableId,
        JSON.stringify(d.field_mapping || {}),
        d.status || "active",
        d.app_id,
        d.base_url || d.document_url,
      );
      logAdmin(admin, req, "create", "feishu_sync_configs", r.lastInsertRowid, { table_id: tableId });
      return json(res, 201, { id: r.lastInsertRowid, updated: false });
    }
    if (path === "/api/admin/feishu/test-connection" && method === "POST") {
      const d = await body(req);
      const config = db
        .prepare("SELECT * FROM feishu_sync_configs WHERE id=?")
        .get(Number(d.config_id));
      if (!config) return json(res, 404, { message: "飞书数据源不存在" });
      const appToken =
        config.app_token || String(config.document_url || "").match(/\/base\/([^/?#]+)/)?.[1];
      if (!appToken || !config.table_id)
        return json(res, 400, { message: "飞书 app_token 或数据表 ID 未配置" });
      try {
        const accessToken = await getFeishuAccess(config);
        const base = `https://open.feishu.cn/open-apis/bitable/v1/apps/${appToken}/tables/${config.table_id}`;
        const [fieldsResponse, recordsResponse] = await Promise.all([
          fetch(`${base}/fields?page_size=500`, { headers: { Authorization: `Bearer ${accessToken}` } }),
          fetch(`${base}/records?page_size=1`, { headers: { Authorization: `Bearer ${accessToken}` } }),
        ]);
        const [fieldsData, recordsData] = await Promise.all([fieldsResponse.json(), recordsResponse.json()]);
        if (!fieldsResponse.ok || fieldsData.code) throw new Error(fieldsData.msg || "读取字段失败");
        if (!recordsResponse.ok || recordsData.code) throw new Error(recordsData.msg || "读取记录失败");
        const fieldNames = (fieldsData.data?.items || []).map((item) => item.field_name).filter(Boolean);
        const savedCount = db.prepare("SELECT COUNT(*) AS count FROM feishu_sync_configs").get().count;
        const activeCount = db.prepare("SELECT COUNT(*) AS count FROM feishu_sync_configs WHERE status='active'").get().count;
        const result = {
          connected: true,
          config_id: config.id,
          saved_connections: savedCount,
          active_connections: activeCount,
          fields: fieldNames.length,
          field_names: fieldNames,
          records: Number(recordsData.data?.total || 0),
          secret_configured: Boolean(process.env.FEISHU_APP_SECRET),
          message: "连接成功，已读取数据表元信息；本次测试未写入商品数据库。",
        };
        logAdmin(admin, req, "test_connection", "feishu_sync_configs", config.id, result);
        return json(res, 200, result);
      } catch (error) {
        return json(res, 502, {
          connected: false,
          config_id: config.id,
          message: error instanceof Error ? error.message : "飞书连接测试失败",
        });
      }
    }
    if (path === "/api/admin/feishu/previews" && method === "GET")
      return json(
        res,
        200,
        rows(
          `SELECT id,config_id,status,stats_json,errors_json,created_at,confirmed_at,task_id
           FROM feishu_sync_previews ORDER BY id DESC LIMIT 30`,
        ).map((preview) => ({
          ...preview,
          stats: JSON.parse(preview.stats_json || "{}"),
          errors: JSON.parse(preview.errors_json || "[]"),
        })),
      );
    if (path === "/api/admin/feishu/preview" && method === "POST") {
      const d = await body(req);
      const config = db
        .prepare("SELECT * FROM feishu_sync_configs WHERE id=?")
        .get(Number(d.config_id));
      if (!config) return json(res, 404, { message: "飞书数据源不存在" });
      let items;
      try {
        items = await feishuItems(config);
      } catch (error) {
        return json(res, 502, {
          message: `飞书连接或读取失败：${error instanceof Error ? error.message : "未知错误"}`,
        });
      }
      const seen = new Set();
      const valid = [];
      const errors = [];
      let additions = 0;
      let updates = 0;
      let duplicates = 0;
      let imageCount = 0;
      let videoCount = 0;
      for (const [index, item] of items.entries()) {
        const missing = [!item.name && "商品名称", !item.breed && "品种", !item.price && "价格"]
          .filter(Boolean);
        if (missing.length) {
          errors.push({ row: index + 1, external_id: item.external_id, error: `缺少${missing.join("、")}` });
          continue;
        }
        if (seen.has(item.external_id)) {
          duplicates++;
          continue;
        }
        seen.add(item.external_id);
        imageCount += item.images?.length || 0;
        videoCount += item.videos?.length || 0;
        const existing = db
          .prepare("SELECT id FROM pets WHERE source='feishu' AND external_id=?")
          .get(item.external_id);
        if (existing) updates++;
        else additions++;
        valid.push(item);
      }
      const stats = {
        products: items.length,
        images: imageCount,
        videos: videoCount,
        additions,
        updates,
        duplicates,
        errors: errors.length,
        valid: valid.length,
      };
      const created = db
        .prepare(
          "INSERT INTO feishu_sync_previews(config_id,status,stats_json,items_json,errors_json) VALUES(?,'ready',?,?,?)",
        )
        .run(config.id, JSON.stringify(stats), JSON.stringify(valid), JSON.stringify(errors));
      logAdmin(admin, req, "preview", "feishu_sync_previews", created.lastInsertRowid, stats);
      return json(res, 201, {
        id: created.lastInsertRowid,
        status: "ready",
        stats,
        errors,
        sample: valid.slice(0, 20),
      });
    }
    const previewCommit = path.match(/^\/api\/admin\/feishu\/previews\/(\d+)\/commit$/);
    if (previewCommit && method === "POST") {
      const preview = db
        .prepare("SELECT * FROM feishu_sync_previews WHERE id=?")
        .get(Number(previewCommit[1]));
      if (!preview) return json(res, 404, { message: "同步预览不存在" });
      if (preview.status !== "ready")
        return json(res, 409, { message: "该预览已提交或不可用" });
      const d = await body(req);
      const previewItems = JSON.parse(preview.items_json || "[]");
      const publishAfterSync = Boolean(d.publish_after_sync);
      const items = publishAfterSync
        ? previewItems.map((item) => ({ ...item, status: "published" }))
        : previewItems;
      const created = db
        .prepare(
          "INSERT INTO feishu_sync_tasks(config_id,mode,status,total,batch_size) VALUES(?,?,'pending',?,?)",
        )
        .run(
          preview.config_id,
          "confirmed_preview",
          items.length,
          Math.min(500, Math.max(1, Number(d.batch_size || 100))),
        );
      const taskId = Number(created.lastInsertRowid);
      persistSyncItems(taskId, items);
      db.prepare(
        "UPDATE feishu_sync_previews SET status='confirmed',confirmed_at=CURRENT_TIMESTAMP,task_id=? WHERE id=?",
      ).run(taskId, preview.id);
      syncQueues.set(taskId, { items, paused: false });
      setTimeout(() => processSyncTask(taskId, items), 0);
      logAdmin(admin, req, "commit_preview", "feishu_sync_tasks", taskId, {
        preview_id: preview.id,
        total: items.length,
        publish_after_sync: publishAfterSync,
      });
      return json(res, 202, { taskId, total: items.length, status: "pending", publish_after_sync: publishAfterSync });
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
        persistSyncItems(taskId, initialItems);
        syncQueues.set(taskId, { items: initialItems, paused: false });
        setTimeout(() => processSyncTask(taskId, initialItems), 0);
      } else {
        setTimeout(async () => {
          try {
            const items = await feishuItems(config);
            db.prepare(
              "UPDATE feishu_sync_tasks SET total=?,status='running' WHERE id=?",
            ).run(items.length, taskId);
            persistSyncItems(taskId, items);
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
        rows(
          `SELECT t.*,
                  (SELECT COUNT(*) FROM feishu_sync_task_items i WHERE i.task_id=t.id) AS persisted_items,
                  (SELECT COUNT(*) FROM feishu_sync_task_items i WHERE i.task_id=t.id AND i.status='success') AS persisted_success,
                  (SELECT COUNT(*) FROM feishu_sync_task_items i WHERE i.task_id=t.id AND i.status='failed') AS persisted_failed
           FROM feishu_sync_tasks t ORDER BY t.id DESC`,
        ),
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
        const storedItems = persistedSyncItems(taskId);
        const items = syncQueues.get(taskId)?.items || storedItems;
        if (!items.length)
          return json(res, 409, { message: "同步任务缺少持久化数据，请重新创建同步预览" });
        syncQueues.set(taskId, { items, paused: false });
        if (action === "retry") {
          db.prepare("UPDATE feishu_sync_task_items SET status='pending',error=NULL,processed_at=NULL WHERE task_id=?").run(taskId);
          db.prepare(
            "UPDATE feishu_sync_tasks SET status='running',processed=0,success=0,failed=0,error=NULL,paused_at=NULL,retry_count=retry_count+1,finished_at=NULL WHERE id=?",
          ).run(taskId);
        } else
          db.prepare(
            "UPDATE feishu_sync_tasks SET status='running',paused_at=NULL,finished_at=NULL WHERE id=?",
          ).run(taskId);
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
    const requestId = randomBytes(8).toString("hex");
    try {
      db.prepare(
        "INSERT INTO api_error_logs(request_id,method,path,message,stack) VALUES(?,?,?,?,?)",
      ).run(requestId, req.method || "UNKNOWN", req.url || "/", e?.message || String(e), e?.stack || null);
    } catch {}
    json(res, 500, { message: "服务器处理失败，请稍后重试", request_id: requestId });
  }
});

for (const task of rows("SELECT id FROM feishu_sync_tasks WHERE status IN ('pending','running') ORDER BY id")) {
  const items = persistedSyncItems(task.id);
  if (!items.length) {
    db.prepare("UPDATE feishu_sync_tasks SET status='failed',error='服务重启后未找到持久化同步数据',finished_at=CURRENT_TIMESTAMP WHERE id=?").run(task.id);
    continue;
  }
  syncQueues.set(task.id, { items, paused: false });
  setTimeout(() => processSyncTask(task.id, items), 0);
}

server.listen(Number(process.env.PORT || 3001), () =>
  console.log("福宠 API: http://127.0.0.1:3001"),
);
