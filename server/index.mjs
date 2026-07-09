import { createServer } from "node:http";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, mkdirSync, existsSync, writeFileSync } from "node:fs";
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
const SECRET = process.env.JWT_SECRET || "dev-only-change-in-production";
const hash = (password, salt) => scryptSync(password, salt, 64).toString("hex");
const initialAdminPassword = process.env.ADMIN_INITIAL_PASSWORD || "123123123";
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
const petDetail = (id) => {
  const pet = db.prepare("SELECT * FROM pets WHERE id=?").get(id);
  if (!pet) return null;
  return {
    ...pet,
    skus: rows("SELECT * FROM pet_skus WHERE pet_id=?", id),
    images: rows(
      "SELECT * FROM pet_images WHERE pet_id=? ORDER BY sort_order",
      id,
    ),
    videos: rows("SELECT * FROM pet_videos WHERE pet_id=?", id),
  };
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
    if(path==="/api/visitors/session"&&method==="POST"){const d=await body(req),token=String(d.token||randomBytes(18).toString("hex"));let visitor=db.prepare("SELECT * FROM visitors WHERE token=?").get(token);if(visitor){db.prepare("UPDATE visitors SET last_seen=CURRENT_TIMESTAMP,visit_count=visit_count+1 WHERE id=?").run(visitor.id)}else{const u=db.prepare("INSERT INTO users(openid,nickname,status) VALUES(?,?,?)").run(`guest:${token}`,"访客用户","guest");const v=db.prepare("INSERT INTO visitors(token,user_id) VALUES(?,?)").run(token,u.lastInsertRowid);visitor={id:v.lastInsertRowid,token,user_id:u.lastInsertRowid}}return json(res,200,{token,userId:visitor.user_id,visitorId:visitor.id})}
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
    if (path === "/api/pets" && method === "GET") {
      const q = `%${url.searchParams.get("q") || ""}%`,
        status = url.searchParams.get("status") || "published";
      return json(
        res,
        200,
        rows(
          "SELECT * FROM pets WHERE status=? AND (name LIKE ? OR breed LIKE ? OR description LIKE ?) ORDER BY id DESC LIMIT 100",
          status,
          q,
          q,
          q,
        ),
      );
    }
    if (path === "/api/admin/pets" && method === "GET")
      return json(res, 200, rows("SELECT * FROM pets ORDER BY id DESC"));
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
          d.gender??null,
          d.age_months??null,
          d.color??null,
          d.body_type??null,
          d.personality??null,
          d.health_status??null,
          d.vaccine_record??null,
          d.father_info??null,
          d.mother_info??null,
          d.description??null,
          d.price,
          d.seller_name??null,
          d.status || "draft",
        );
      return json(res, 201, petDetail(r.lastInsertRowid));
    }
    const petMatch = path.match(/^\/api\/admin\/pets\/(\d+)$/);
    if (petMatch && method === "GET")
      return json(res, 200, petDetail(Number(petMatch[1])));
    if (petMatch && method === "DELETE") {
      db.prepare("DELETE FROM pets WHERE id=?").run(Number(petMatch[1]));
      return json(res, 200, { ok: true });
    }
    if (petMatch && method === "PATCH") {
      const d = await body(req),
        allowed = ["name", "breed", "price", "status", "stock", "description"],
        sets = allowed.filter((k) => d[k] !== undefined);
      if (sets.length)
        db.prepare(
          `UPDATE pets SET ${sets.map((k) => `${k}=?`).join(",")},updated_at=CURRENT_TIMESTAMP WHERE id=?`,
        ).run(...sets.map((k) => d[k]), Number(petMatch[1]));
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
          "SELECT id,nickname,avatar,phone,status,created_at FROM users ORDER BY id DESC",
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
        db.exec("COMMIT");
        return json(res, 201, { id: o.lastInsertRowid, order_no: no });
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    }
    if(path==="/api/orders"&&method==="GET"){const userId=Number(url.searchParams.get("user_id")||1);return json(res,200,rows("SELECT o.*,oi.pet_snapshot,oi.price FROM orders o LEFT JOIN order_items oi ON oi.order_id=o.id WHERE o.user_id=? ORDER BY o.id DESC",userId))}
    if (path === "/api/messages" && method === "GET")
      return json(
        res,
        200,
        rows(
          "SELECT * FROM messages WHERE user_id=? ORDER BY id",
          Number(url.searchParams.get("user_id") || 1),
        ),
      );
    if (path === "/api/messages" && method === "POST") {
      const d = await body(req);
      const r = db
        .prepare("INSERT INTO messages(user_id,sender,content) VALUES(?,?,?)")
        .run(d.user_id || 1, d.sender || "user", d.content);
      db.prepare(
        "INSERT INTO messages(user_id,sender,content) VALUES(?,?,?)",
      ).run(
        d.user_id || 1,
        "service",
        "您好，专属客服已收到消息，将尽快为您处理。",
      );
      return json(res, 201, { id: r.lastInsertRowid });
    }
    if (path === "/api/favorites" && method === "GET")
      return json(
        res,
        200,
        rows(
          "SELECT f.*,p.name,p.breed,p.price FROM favorites f JOIN pets p ON p.id=f.pet_id WHERE f.user_id=?",
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
          d.province,
          d.city,
          d.district,
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
    const skuRoute=path.match(/^\/api\/admin\/pets\/(\d+)\/skus$/);
    if(skuRoute&&method==="GET")return json(res,200,rows("SELECT * FROM pet_skus WHERE pet_id=?",Number(skuRoute[1])));
    if(skuRoute&&method==="POST"){const d=await body(req);const r=db.prepare("INSERT INTO pet_skus(pet_id,sku_name,price,stock,status) VALUES(?,?,?,?,?)").run(Number(skuRoute[1]),d.sku_name,d.price,d.stock,d.status||"active");return json(res,201,{id:r.lastInsertRowid})}
    const skuItem=path.match(/^\/api\/admin\/skus\/(\d+)$/);
    if(skuItem&&method==="PATCH"){const d=await body(req);db.prepare("UPDATE pet_skus SET sku_name=?,price=?,stock=?,status=? WHERE id=?").run(d.sku_name,d.price,d.stock,d.status,Number(skuItem[1]));return json(res,200,{ok:true})}
    if(skuItem&&method==="DELETE"){db.prepare("DELETE FROM pet_skus WHERE id=?").run(Number(skuItem[1]));return json(res,200,{ok:true})}
    const mediaRoute=path.match(/^\/api\/admin\/pets\/(\d+)\/(images|videos)$/);
    if(mediaRoute&&method==="POST"){const d=await body(req),petId=Number(mediaRoute[1]);if(mediaRoute[2]==="images"){const r=db.prepare("INSERT INTO pet_images(pet_id,url,type,sort_order) VALUES(?,?,?,?)").run(petId,d.url,d.type||"gallery",d.sort_order||0);return json(res,201,{id:r.lastInsertRowid})}const r=db.prepare("INSERT INTO pet_videos(pet_id,url,cover_url,duration) VALUES(?,?,?,?)").run(petId,d.url,d.cover_url,d.duration||0);return json(res,201,{id:r.lastInsertRowid})}
    const orderRoute=path.match(/^\/api\/admin\/orders\/(\d+)$/);
    if(orderRoute&&method==="GET"){const order=db.prepare("SELECT o.*,u.nickname,u.phone FROM orders o JOIN users u ON u.id=o.user_id WHERE o.id=?").get(Number(orderRoute[1]));return json(res,order?200:404,order?{...order,items:rows("SELECT * FROM order_items WHERE order_id=?",Number(orderRoute[1])),logistics:db.prepare("SELECT * FROM logistics WHERE order_id=?").get(Number(orderRoute[1]))}:{message:"订单不存在"})}
    if(orderRoute&&method==="PATCH"){const d=await body(req);db.prepare("UPDATE orders SET status=COALESCE(?,status),payment_status=COALESCE(?,payment_status),updated_at=CURRENT_TIMESTAMP WHERE id=?").run(d.status,d.payment_status,Number(orderRoute[1]));return json(res,200,{ok:true})}
    const userRoute=path.match(/^\/api\/admin\/users\/(\d+)$/);
    if(userRoute&&method==="GET"){const id=Number(userRoute[1]),user=db.prepare("SELECT id,nickname,avatar,phone,status,created_at FROM users WHERE id=?").get(id);return json(res,user?200:404,user?{...user,orders:rows("SELECT * FROM orders WHERE user_id=?",id),favorites:rows("SELECT * FROM favorites WHERE user_id=?",id),footprints:rows("SELECT * FROM footprints WHERE user_id=?",id),addresses:rows("SELECT * FROM addresses WHERE user_id=?",id)}:{message:"用户不存在"})}
    for(const resource of ["banners","categories"]){if(path===`/api/admin/${resource}`&&method==="GET")return json(res,200,rows(`SELECT * FROM ${resource} ORDER BY id DESC`));if(path===`/api/admin/${resource}`&&method==="POST"){const d=await body(req);if(resource==="banners"){const r=db.prepare("INSERT INTO banners(title,image,link,sort_order,status) VALUES(?,?,?,?,?)").run(d.title??null,d.image,d.link??null,d.sort_order||0,d.status||"active");return json(res,201,{id:r.lastInsertRowid})}const r=db.prepare("INSERT INTO categories(name,parent_id,image,sort_order,status) VALUES(?,?,?,?,?)").run(d.name,d.parent_id||null,d.image??null,d.sort_order||0,d.status||"active");return json(res,201,{id:r.lastInsertRowid})}}
    if(path==="/api/admin/feishu/configs"&&method==="GET")return json(res,200,rows("SELECT * FROM feishu_sync_configs ORDER BY id DESC"));
    if(path==="/api/admin/feishu/configs"&&method==="POST"){const d=await body(req);const r=db.prepare("INSERT INTO feishu_sync_configs(name,document_url,app_token,table_id,field_mapping,status) VALUES(?,?,?,?,?,?)").run(d.name,d.document_url,d.app_token??null,d.table_id??null,JSON.stringify(d.field_mapping||{}),d.status||"active");return json(res,201,{id:r.lastInsertRowid})}
    if(path==="/api/admin/feishu/sync"&&method==="POST"){const d=await body(req);const r=db.prepare("INSERT INTO feishu_sync_tasks(config_id,mode,status) VALUES(?,?,?)").run(d.config_id,d.mode||"incremental","pending");return json(res,202,{taskId:r.lastInsertRowid,status:"pending",message:"同步任务已进入队列"})}
    if(path==="/api/admin/feishu/tasks"&&method==="GET")return json(res,200,rows("SELECT * FROM feishu_sync_tasks ORDER BY id DESC"));
    return json(res, 404, { message: "接口不存在" });
  } catch (e) {
    console.error(e);
    json(res, 500, { message: "服务器内部错误" });
  }
}).listen(Number(process.env.PORT || 3001), () =>
  console.log("福宠 API: http://127.0.0.1:3001"),
);
