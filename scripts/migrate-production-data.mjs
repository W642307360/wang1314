import { DatabaseSync } from "node:sqlite";

const target = process.env.TARGET_URL?.replace(/\/$/, "");
const secret = process.env.MIGRATION_SECRET;
const dbPath = process.env.DB_PATH || "server/data/fuchong.db";
if (!target || !secret) throw new Error("TARGET_URL and MIGRATION_SECRET are required");

const db = new DatabaseSync(dbPath, { readOnly: true });
const tables = [
  "categories", "breeds", "sellers", "pets", "pet_products", "pet_skus",
  "pet_images", "pet_videos", "inventory", "users", "user_auth", "visitors",
  "addresses", "favorites", "follows", "footprints", "cart_items", "coupons",
  "user_coupons", "orders", "order_items", "payments", "logistics",
  "logistics_events", "order_status_history", "complaints", "after_sales",
  "customer_service_sessions", "messages", "product_reviews", "seller_reviews",
  "seller_reports", "banners", "feishu_sync_configs", "feishu_sync_tasks",
  "feishu_sync_task_items", "feishu_sync_previews",
];

let total = 0;
for (const table of tables) {
  const exists = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table);
  if (!exists) continue;
  const rows = db.prepare(`SELECT * FROM ${table} ORDER BY id`).all();
  for (let offset = 0; offset < rows.length; offset += 50) {
    const batch = rows.slice(offset, offset + 50);
    const encoded = Buffer.from(JSON.stringify({ table, rows: batch }), "utf8").toString("base64");
    const response = await fetch(`${target}/api/users/restore`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-site-key": secret },
      body: JSON.stringify({ blob: encoded }),
    });
    if (!response.ok) throw new Error(`${table} import failed: ${response.status} ${await response.text()}`);
    total += batch.length;
  }
  console.log(`${table}: ${rows.length}`);
}
console.log(`Imported ${total} rows.`);
