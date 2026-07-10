import { createServer } from "node:http";
import { DatabaseSync } from "node:sqlite";
import {
  readFileSync,
  mkdirSync,
  existsSync,
  writeFileSync,
  readdirSync,
} from "node:fs";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  randomBytes,
  scryptSync,
  timingSafeEqual,
  createHmac,
} from "node:crypto";

const root = dirname(fileURLToPath(import.meta.url));
mkdirSync(join(root, "data"), { recursive: true });
mkdirSync(join(root, "uploads"), { recursive: true });
const db = new DatabaseSync(
  process.env.DB_PATH || join(root, "data", "fuchong.db"),
);
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
const SECRET = process.env.JWT_SECRET || "dev-only-change-in-production";
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
} else if (
  hash(initialAdminPassword, existingAdmin.salt) !== existingAdmin.password_hash
) {
  const salt = randomBytes(16).toString("hex");
  db.prepare("UPDATE admins SET password_hash=?,salt=? WHERE username=?").run(
    hash(initialAdminPassword, salt),
    salt,
    "admin",
  );
}
if (!db.prepare("SELECT id FROM users LIMIT 1").get())
  db.prepare("INSERT INTO users(nickname,phone) VALUES(?,?)").run(
    "福宠用户",
    "13800000000",
  );
for (const name of ["猫猫馆", "狗狗馆", "鸟类馆", "水族馆", "奇宠馆", "更多馆"])
  db.prepare(
    "INSERT OR IGNORE INTO categories(id,name,sort_order) VALUES((SELECT COALESCE(MAX(id),0)+1 FROM categories),?,0)",
  ).run(name);
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
  if (!b || !timingSafeEqual(Buffer.from(sign(b)), Buffer.from(s || "")))
    return null;
  const p = JSON.parse(Buffer.from(b, "base64url"));
  return p.exp > Date.now() ? p : null;
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
const body = async (req) => {
  let raw = "";
  for await (const c of req) raw += c;
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
        if (petId)
          db.prepare(
            "INSERT INTO inventory(pet_id,total_stock,available_stock) SELECT ?,?,? WHERE NOT EXISTS (SELECT 1 FROM inventory WHERE pet_id=? AND sku_id IS NULL)",
          ).run(petId, Number(item.stock || 1), Number(item.stock || 1), petId);
        if (petId)
          db.prepare(
            "UPDATE inventory SET total_stock=?,available_stock=MAX(available_stock,?),updated_at=CURRENT_TIMESTAMP WHERE pet_id=? AND sku_id IS NULL",
          ).run(Number(item.stock || 1), Number(item.stock || 1), petId);
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
      res.writeHead(200, {
        "content-type": extname(file) === ".mp4" ? "video/mp4" : "image/jpeg",
        "access-control-allow-origin": "*",
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
      });
    }
    if (path === "/api/pets" && method === "GET") {
      const q = `%${url.searchParams.get("q") || ""}%`,
        status = url.searchParams.get("status") || "published";
      const { pageSize, offset } = pageParams(url, { pageSize: 12, max: 50 });
      return json(
        res,
        200,
        rows(
          `SELECT p.*,c.name AS category_name,pp.status AS product_status
           FROM pets p
           LEFT JOIN categories c ON c.id=p.category_id
           LEFT JOIN pet_products pp ON pp.pet_id=p.id
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
      const d = await body(req),
        safe = `${Date.now()}-${String(d.fileName || "file").replace(/[^a-zA-Z0-9._-]/g, "_")}`,
        target = join(root, "uploads", safe);
      writeFileSync(target, Buffer.from(d.data || "", "base64"));
      return json(res, 201, {
        url: `http://127.0.0.1:3001/uploads/${safe}`,
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
      db.prepare("UPDATE after_sales SET result=?,status=? WHERE id=?").run(
        d.result,
        d.status,
        Number(afterSale[1]),
      );
      return json(res, 200, { ok: true });
    }
    const logistics = path.match(/^\/api\/admin\/orders\/(\d+)\/logistics$/);
    if (logistics && method === "PUT") {
      const d = await body(req);
      db.prepare(
        `INSERT INTO logistics(order_id,company,tracking_no,status,progress) VALUES(?,?,?,?,?) ON CONFLICT(order_id) DO UPDATE SET company=excluded.company,tracking_no=excluded.tracking_no,status=excluded.status,progress=excluded.progress,updated_at=CURRENT_TIMESTAMP`,
      ).run(
        Number(logistics[1]),
        d.company,
        d.tracking_no,
        d.status,
        JSON.stringify(d.progress || []),
      );
      return json(res, 200, { ok: true });
    }
    if (path === "/api/orders" && method === "POST") {
      const d = await body(req),
        pet = petDetail(d.pet_id);
      if (!pet) return json(res, 404, { message: "商品不存在" });
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
          .run(no, d.user_id || 1, pet.price, JSON.stringify(d.address));
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
    if (path === "/api/payments/mock" && method === "POST") {
      const d = await body(req);
      const order = db
        .prepare("SELECT * FROM orders WHERE id=?")
        .get(Number(d.order_id));
      if (!order) return json(res, 404, { message: "订单不存在" });
      const paymentNo = `PAY${Date.now()}`;
      db.exec("BEGIN");
      try {
        const r = db
          .prepare(
            "INSERT INTO payments(order_id,payment_no,channel,amount,status,paid_at,raw_payload) VALUES(?,?,?,?,?,?,?)",
          )
          .run(
            order.id,
            paymentNo,
            d.channel || "mock",
            order.total_amount,
            "paid",
            new Date().toISOString(),
            JSON.stringify(d),
          );
        db.prepare(
          "UPDATE orders SET payment_status='paid',status='pending_ship',paid_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?",
        ).run(order.id);
        db.exec("COMMIT");
        return json(res, 201, { id: r.lastInsertRowid, payment_no: paymentNo });
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    }
    if (path === "/api/orders" && method === "GET") {
      const userId = Number(url.searchParams.get("user_id") || 1);
      return json(
        res,
        200,
        rows(
          "SELECT o.*,oi.pet_snapshot,oi.price FROM orders o LEFT JOIN order_items oi ON oi.order_id=o.id WHERE o.user_id=? ORDER BY o.id DESC",
          userId,
        ),
      );
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
      const r = db
        .prepare(
          "INSERT INTO addresses(user_id,name,phone,province,city,district,detail,is_default) VALUES(?,?,?,?,?,?,?,?)",
        )
        .run(
          d.user_id || 1,
          d.name,
          d.phone,
          d.province ?? null,
          d.city ?? null,
          d.district ?? null,
          d.detail,
          d.is_default ? 1 : 0,
        );
      return json(res, 201, { id: r.lastInsertRowid });
    }
    if (path === "/api/coupons" && method === "GET")
      return json(
        res,
        200,
        rows("SELECT * FROM coupons WHERE status=?", "active"),
      );
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
            }
          : { message: "订单不存在" },
      );
    }
    if (orderRoute && method === "PATCH") {
      const d = await body(req);
      db.prepare(
        "UPDATE orders SET status=COALESCE(?,status),payment_status=COALESCE(?,payment_status),updated_at=CURRENT_TIMESTAMP WHERE id=?",
      ).run(d.status, d.payment_status, Number(orderRoute[1]));
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
    for (const resource of ["banners", "categories"]) {
      if (path === `/api/admin/${resource}` && method === "GET")
        return json(
          res,
          200,
          rows(`SELECT * FROM ${resource} ORDER BY id DESC`),
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
      const items = Array.isArray(d.items)
        ? d.items
        : generateSyncItems(Number(d.total || 500));
      const r = db
        .prepare(
          "INSERT INTO feishu_sync_tasks(config_id,mode,status,total,batch_size) VALUES(?,?,?,?,?)",
        )
        .run(
          d.config_id,
          d.mode || "incremental",
          "pending",
          items.length,
          Math.min(500, Math.max(1, Number(d.batch_size || 500))),
        );
      syncQueues.set(r.lastInsertRowid, { items, paused: false });
      setTimeout(() => processSyncTask(r.lastInsertRowid, items), 0);
      logAdmin(
        admin,
        req,
        "start_sync",
        "feishu_sync_tasks",
        r.lastInsertRowid,
        {
          total: items.length,
        },
      );
      return json(res, 202, {
        taskId: r.lastInsertRowid,
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
