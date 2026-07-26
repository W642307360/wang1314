const { DatabaseSync } = require("node:sqlite");
const db = new DatabaseSync("/app/server/data/fuchong.db", { readOnly: true });
const scalar = (sql) => db.prepare(sql).get().count;
console.log(`INTEGRITY=${db.prepare("PRAGMA integrity_check").get().integrity_check}`);
console.log(`FK=${db.prepare("PRAGMA foreign_key_check").all().length}`);
console.log(`UNPAID_ACTIVE=${scalar("SELECT COUNT(*) count FROM orders WHERE payment_status='unpaid' AND status IN ('pending_payment','pending_confirm')")}`);
console.log(`LOCKED_TOTAL=${db.prepare("SELECT COALESCE(SUM(locked_stock),0) total FROM inventory").get().total}`);
console.log(`NEGATIVE_STOCK=${scalar("SELECT COUNT(*) count FROM inventory WHERE available_stock<0 OR locked_stock<0")}`);
console.log(`OVERALLOCATED=${scalar("SELECT COUNT(*) count FROM inventory WHERE available_stock+locked_stock>total_stock")}`);
const hasInventoryFlag = db.prepare("SELECT COUNT(*) count FROM pragma_table_info('orders') WHERE name='inventory_locked'").get().count;
console.log(`INVENTORY_FLAG_COLUMN=${hasInventoryFlag}`);
if (hasInventoryFlag)
  console.log(`ORDERS_MARKED_LOCKED=${scalar("SELECT COUNT(*) count FROM orders WHERE inventory_locked=1")}`);
if (hasInventoryFlag) {
  console.log(`UNPAID_LOCKED=${scalar("SELECT COUNT(*) count FROM orders WHERE payment_status='unpaid' AND status IN ('pending_payment','pending_confirm') AND inventory_locked=1")}`);
  console.log(`UNPAID_NOT_LOCKED=${scalar("SELECT COUNT(*) count FROM orders WHERE payment_status='unpaid' AND status IN ('pending_payment','pending_confirm') AND inventory_locked=0")}`);
}
console.log(`MIGRATION_039=${scalar("SELECT COUNT(*) count FROM schema_migrations WHERE name='039_payment_time_inventory_lock.sql'")}`);
