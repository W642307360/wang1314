import { DatabaseSync } from "node:sqlite";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const db = new DatabaseSync(process.env.DB_PATH || join(root, "data", "fuchong.db"), { readOnly: true });
const scalar = (sql) => Number(Object.values(db.prepare(sql).get())[0]);
const report = {
  products: scalar("SELECT COUNT(*) FROM pets WHERE status<>'deleted'"),
  users: scalar("SELECT COUNT(*) FROM users"),
  orders: scalar("SELECT COUNT(*) FROM orders"),
  duplicate_product_names: scalar("SELECT COUNT(*) FROM (SELECT name FROM pets WHERE status<>'deleted' GROUP BY name HAVING COUNT(*)>1)"),
  products_without_reviews: scalar("SELECT COUNT(*) FROM pets p WHERE p.status<>'deleted' AND NOT EXISTS (SELECT 1 FROM product_reviews r WHERE r.pet_id=p.id AND r.status='published')"),
  orphan_reviews: scalar("SELECT COUNT(*) FROM product_reviews r WHERE NOT EXISTS (SELECT 1 FROM pets p WHERE p.id=r.pet_id)"),
  duplicate_phone_users: scalar("SELECT COUNT(*) FROM (SELECT phone FROM users WHERE phone IS NOT NULL AND TRIM(phone)<>'' GROUP BY phone HAVING COUNT(*)>1)"),
  orphan_favorites: scalar("SELECT COUNT(*) FROM favorites f WHERE NOT EXISTS(SELECT 1 FROM users u WHERE u.id=f.user_id) OR NOT EXISTS(SELECT 1 FROM pets p WHERE p.id=f.pet_id)"),
  orphan_cart_items: scalar("SELECT COUNT(*) FROM cart_items c WHERE NOT EXISTS(SELECT 1 FROM users u WHERE u.id=c.user_id) OR NOT EXISTS(SELECT 1 FROM pets p WHERE p.id=c.pet_id)"),
  orphan_orders: scalar("SELECT COUNT(*) FROM orders o WHERE NOT EXISTS(SELECT 1 FROM users u WHERE u.id=o.user_id)"),
  orphan_addresses: scalar("SELECT COUNT(*) FROM addresses a WHERE NOT EXISTS(SELECT 1 FROM users u WHERE u.id=a.user_id)"),
  orphan_user_auth: scalar("SELECT COUNT(*) FROM user_auth a WHERE NOT EXISTS(SELECT 1 FROM users u WHERE u.id=a.user_id)"),
  duplicate_user_auth: scalar("SELECT COUNT(*) FROM (SELECT auth_type,auth_value FROM user_auth GROUP BY auth_type,auth_value HAVING COUNT(DISTINCT user_id)>1)"),
  merged_users_with_owned_data: scalar("SELECT COUNT(*) FROM users u WHERE u.status='merged' AND (EXISTS(SELECT 1 FROM favorites x WHERE x.user_id=u.id) OR EXISTS(SELECT 1 FROM cart_items x WHERE x.user_id=u.id) OR EXISTS(SELECT 1 FROM orders x WHERE x.user_id=u.id) OR EXISTS(SELECT 1 FROM addresses x WHERE x.user_id=u.id) OR EXISTS(SELECT 1 FROM messages x WHERE x.user_id=u.id))"),
  users_with_multiple_default_addresses: scalar("SELECT COUNT(*) FROM (SELECT user_id FROM addresses WHERE is_default=1 GROUP BY user_id HAVING COUNT(*)>1)"),
  order_items_without_order: scalar("SELECT COUNT(*) FROM order_items oi WHERE NOT EXISTS(SELECT 1 FROM orders o WHERE o.id=oi.order_id)"),
  orders_without_items: scalar("SELECT COUNT(*) FROM orders o WHERE NOT EXISTS(SELECT 1 FROM order_items oi WHERE oi.order_id=o.id)"),
  order_amount_mismatches: scalar("SELECT COUNT(*) FROM orders o WHERE COALESCE((SELECT SUM(price*quantity) FROM order_items oi WHERE oi.order_id=o.id),0)<>o.total_amount"),
  logistics_without_order: scalar("SELECT COUNT(*) FROM logistics l WHERE NOT EXISTS(SELECT 1 FROM orders o WHERE o.id=l.order_id)"),
  payments_without_order: scalar("SELECT COUNT(*) FROM payments p WHERE NOT EXISTS(SELECT 1 FROM orders o WHERE o.id=p.order_id)"),
  after_sales_without_order_or_user: scalar("SELECT COUNT(*) FROM after_sales a WHERE NOT EXISTS(SELECT 1 FROM orders o WHERE o.id=a.order_id) OR NOT EXISTS(SELECT 1 FROM users u WHERE u.id=a.user_id)"),
  duplicate_open_after_sales: scalar("SELECT COUNT(*) FROM (SELECT order_id,user_id FROM after_sales WHERE status IN ('pending','processing') GROUP BY order_id,user_id HAVING COUNT(*)>1)"),
  message_session_owner_mismatches: scalar("SELECT COUNT(*) FROM messages m JOIN customer_service_sessions s ON s.id=m.session_id WHERE m.user_id<>s.user_id"),
  negative_inventory: scalar("SELECT COUNT(*) FROM inventory WHERE total_stock<0 OR available_stock<0 OR locked_stock<0"),
  overallocated_inventory: scalar("SELECT COUNT(*) FROM inventory WHERE available_stock+locked_stock>total_stock"),
  completed_sync_counter_mismatches: scalar("SELECT COUNT(*) FROM feishu_sync_tasks WHERE status='completed' AND (processed<>total OR success+failed<>processed)"),
  sync_item_counter_mismatches: scalar("SELECT COUNT(*) FROM feishu_sync_tasks t WHERE EXISTS(SELECT 1 FROM feishu_sync_task_items i WHERE i.task_id=t.id) AND (t.success<>(SELECT COUNT(*) FROM feishu_sync_task_items i WHERE i.task_id=t.id AND i.status='success') OR t.failed<>(SELECT COUNT(*) FROM feishu_sync_task_items i WHERE i.task_id=t.id AND i.status='failed'))"),
  foreign_key_violations: db.prepare("PRAGMA foreign_key_check").all().length,
  integrity_check: db.prepare("PRAGMA integrity_check").get().integrity_check,
  latest_migration: db.prepare("SELECT name,applied_at FROM schema_migrations ORDER BY id DESC LIMIT 1").get(),
};
db.close();
console.log(JSON.stringify(report, null, 2));
const informational = new Set(["products", "users", "orders", "latest_migration"]);
if (
  report.integrity_check !== "ok" ||
  Object.entries(report).some(
    ([key, value]) => !informational.has(key) && key !== "integrity_check" && typeof value === "number" && value > 0,
  )
)
  process.exitCode = 1;
