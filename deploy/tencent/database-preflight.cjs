const { DatabaseSync } = require("node:sqlite");
const database = new DatabaseSync("/app/server/data/fuchong.db");
console.log(`INTEGRITY=${database.prepare("PRAGMA integrity_check").get().integrity_check}`);
console.log(`FK=${database.prepare("PRAGMA foreign_key_check").all().length}`);
for (const table of ["users", "pets", "orders", "messages", "customer_service_sessions"]) {
  const count = database.prepare(`SELECT count(*) count FROM ${table}`).get().count;
  console.log(`${table.toUpperCase()}=${count}`);
}
console.log(`PUSH_TABLE=${database.prepare("SELECT count(*) count FROM service_agent_push_subscriptions").get().count}`);
console.log(`MIGRATION_038=${database.prepare("SELECT count(*) count FROM schema_migrations WHERE id=38").get().count}`);
