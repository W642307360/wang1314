import { DatabaseSync } from "node:sqlite";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const db = new DatabaseSync(process.env.DB_PATH || join(root, "data", "fuchong.db"), { readOnly: true });
const scalar = (sql) => Number(Object.values(db.prepare(sql).get())[0]);
const report = {
  products: scalar("SELECT COUNT(*) FROM pets WHERE status<>'deleted'"),
  duplicate_product_names: scalar("SELECT COUNT(*) FROM (SELECT name FROM pets WHERE status<>'deleted' GROUP BY name HAVING COUNT(*)>1)"),
  products_without_reviews: scalar("SELECT COUNT(*) FROM pets p WHERE p.status<>'deleted' AND NOT EXISTS (SELECT 1 FROM product_reviews r WHERE r.pet_id=p.id AND r.status='published')"),
  orphan_reviews: scalar("SELECT COUNT(*) FROM product_reviews r WHERE NOT EXISTS (SELECT 1 FROM pets p WHERE p.id=r.pet_id)"),
  duplicate_phone_users: scalar("SELECT COUNT(*) FROM (SELECT phone FROM users WHERE phone IS NOT NULL AND TRIM(phone)<>'' GROUP BY phone HAVING COUNT(*)>1)"),
  orphan_favorites: scalar("SELECT COUNT(*) FROM favorites f WHERE NOT EXISTS(SELECT 1 FROM users u WHERE u.id=f.user_id) OR NOT EXISTS(SELECT 1 FROM pets p WHERE p.id=f.pet_id)"),
  orphan_cart_items: scalar("SELECT COUNT(*) FROM cart_items c WHERE NOT EXISTS(SELECT 1 FROM users u WHERE u.id=c.user_id) OR NOT EXISTS(SELECT 1 FROM pets p WHERE p.id=c.pet_id)"),
  orphan_orders: scalar("SELECT COUNT(*) FROM orders o WHERE NOT EXISTS(SELECT 1 FROM users u WHERE u.id=o.user_id)"),
  order_items_without_order: scalar("SELECT COUNT(*) FROM order_items oi WHERE NOT EXISTS(SELECT 1 FROM orders o WHERE o.id=oi.order_id)"),
  logistics_without_order: scalar("SELECT COUNT(*) FROM logistics l WHERE NOT EXISTS(SELECT 1 FROM orders o WHERE o.id=l.order_id)"),
  foreign_key_violations: db.prepare("PRAGMA foreign_key_check").all().length,
  latest_migration: db.prepare("SELECT name,applied_at FROM schema_migrations ORDER BY id DESC LIMIT 1").get(),
};
db.close();
console.log(JSON.stringify(report, null, 2));
if (Object.entries(report).some(([key, value]) => key !== "products" && key !== "latest_migration" && typeof value === "number" && value > 0)) process.exitCode = 1;
