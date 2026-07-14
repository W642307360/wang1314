import { DatabaseSync } from "node:sqlite";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync } from "node:fs";

const root = dirname(fileURLToPath(import.meta.url));
const stamp = new Date().toISOString().replaceAll(":", "").replaceAll(".", "-");
const source = process.env.DB_PATH || join(root, "data", "fuchong.db");
const destination = process.argv[2] || join(root, "backups", `fuchong-${stamp}.db`);
mkdirSync(dirname(destination), { recursive: true });
const db = new DatabaseSync(source);
db.exec(`VACUUM INTO '${destination.replaceAll("'", "''")}'`);
db.close();
console.log(destination);
