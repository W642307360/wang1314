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
  latest_migration: db.prepare("SELECT name,applied_at FROM schema_migrations ORDER BY id DESC LIMIT 1").get(),
};
db.close();
console.log(JSON.stringify(report, null, 2));
if (report.duplicate_product_names || report.products_without_reviews || report.orphan_reviews) process.exitCode = 1;
