import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  managedUploadPath,
  purgeProduct,
} from "./product-purge.mjs";

const serverDir = dirname(fileURLToPath(import.meta.url));

const createDatabase = (path) => {
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA foreign_keys=ON;
    PRAGMA journal_mode=WAL;
    CREATE TABLE admins(id INTEGER PRIMARY KEY,username TEXT);
    CREATE TABLE pets(
      id INTEGER PRIMARY KEY,name TEXT NOT NULL,status TEXT DEFAULT 'draft',
      thumbnail_url TEXT,highres_url TEXT,detail_payload TEXT DEFAULT '{}',
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE pet_skus(
      id INTEGER PRIMARY KEY,pet_id INTEGER NOT NULL REFERENCES pets(id) ON DELETE CASCADE
    );
    CREATE TABLE pet_images(
      id INTEGER PRIMARY KEY,pet_id INTEGER NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
      url TEXT NOT NULL,thumbnail_url TEXT,webp_url TEXT
    );
    CREATE TABLE pet_videos(
      id INTEGER PRIMARY KEY,pet_id INTEGER NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
      url TEXT NOT NULL,cover_url TEXT,transcode_log TEXT DEFAULT '[]'
    );
    CREATE TABLE inventory(
      id INTEGER PRIMARY KEY,pet_id INTEGER NOT NULL REFERENCES pets(id)
    );
    CREATE TABLE favorites(
      id INTEGER PRIMARY KEY,pet_id INTEGER NOT NULL REFERENCES pets(id)
    );
    CREATE TABLE footprints(
      id INTEGER PRIMARY KEY,pet_id INTEGER NOT NULL REFERENCES pets(id)
    );
    CREATE TABLE pet_products(
      id INTEGER PRIMARY KEY,pet_id INTEGER NOT NULL UNIQUE REFERENCES pets(id),
      status TEXT DEFAULT 'offline',updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE product_reviews(
      id INTEGER PRIMARY KEY,pet_id INTEGER NOT NULL REFERENCES pets(id) ON DELETE CASCADE
    );
    CREATE TABLE orders(id INTEGER PRIMARY KEY,order_no TEXT);
    CREATE TABLE order_items(
      id INTEGER PRIMARY KEY,order_id INTEGER NOT NULL REFERENCES orders(id),
      pet_id INTEGER NOT NULL REFERENCES pets(id),pet_snapshot TEXT NOT NULL DEFAULT '{}'
    );
    CREATE TABLE admin_operation_logs(
      id INTEGER PRIMARY KEY,detail TEXT DEFAULT '{}'
    );
  `);
  db.exec(
    readFileSync(
      join(serverDir, "migrations", "045_product_purge_and_scale_indexes.sql"),
      "utf8",
    ),
  );
  db.prepare("INSERT INTO admins(id,username) VALUES(1,'admin')").run();
  return db;
};

test("商品硬删除仅回收无引用本地文件，共享媒体和外部媒体保持不变", () => {
  const temp = mkdtempSync(join(tmpdir(), "fuchong-purge-"));
  const uploads = join(temp, "uploads");
  mkdirSync(uploads, { recursive: true });
  const unique = join(uploads, "unique.webp");
  const shared = join(uploads, "shared.webp");
  writeFileSync(unique, Buffer.from("unique"));
  writeFileSync(shared, Buffer.from("shared"));
  const db = createDatabase(join(temp, "purge.db"));
  try {
    db.prepare(
      "INSERT INTO pets(id,name,status,thumbnail_url) VALUES(1,'待删除商品','offline','/uploads/unique.webp')",
    ).run();
    db.prepare(
      "INSERT INTO pets(id,name,status,thumbnail_url) VALUES(2,'共享媒体商品','published','/uploads/shared.webp')",
    ).run();
    db.prepare(
      "INSERT INTO pet_images(pet_id,url,thumbnail_url) VALUES(1,'/uploads/shared.webp','https://cdn.example.com/external.webp')",
    ).run();
    db.prepare(
      "INSERT INTO pet_images(pet_id,url) VALUES(2,'/uploads/shared.webp')",
    ).run();
    db.prepare("INSERT INTO inventory(pet_id) VALUES(1)").run();
    db.prepare("INSERT INTO favorites(pet_id) VALUES(1)").run();
    db.prepare("INSERT INTO footprints(pet_id) VALUES(1)").run();
    db.prepare("INSERT INTO pet_products(pet_id,status) VALUES(1,'offline')").run();

    const result = purgeProduct(db, 1, { requestedBy: 1, uploadsRoot: uploads });
    assert.equal(result.purged, true);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM pets WHERE id=1").get().n, 0);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM inventory WHERE pet_id=1").get().n, 0);
    assert.equal(existsSync(unique), false);
    assert.equal(existsSync(shared), true);
    assert.equal(result.media.deleted, 1);
    assert.equal(result.media.retained, 1);
    assert.equal(db.prepare("PRAGMA foreign_key_check").all().length, 0);
    assert.equal(db.prepare("PRAGMA integrity_check").get().integrity_check, "ok");
  } finally {
    db.close();
    rmSync(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  }
});

test("存在订单的商品自动归档，不删除商品、订单或媒体", () => {
  const temp = mkdtempSync(join(tmpdir(), "fuchong-purge-order-"));
  const uploads = join(temp, "uploads");
  mkdirSync(uploads, { recursive: true });
  const orderedMedia = join(uploads, "ordered.webp");
  writeFileSync(orderedMedia, Buffer.from("ordered"));
  const db = createDatabase(join(temp, "ordered.db"));
  try {
    db.prepare(
      "INSERT INTO pets(id,name,status,thumbnail_url) VALUES(10,'已有订单商品','published','/uploads/ordered.webp')",
    ).run();
    db.prepare("INSERT INTO pet_products(pet_id,status) VALUES(10,'available')").run();
    db.prepare("INSERT INTO orders(id,order_no) VALUES(1,'ORDER-1')").run();
    db.prepare(
      "INSERT INTO order_items(order_id,pet_id,pet_snapshot) VALUES(1,10,'{\"name\":\"已有订单商品\"}')",
    ).run();

    const result = purgeProduct(db, 10, { requestedBy: 1, uploadsRoot: uploads });
    assert.equal(result.purged, false);
    assert.equal(result.archived, true);
    assert.equal(db.prepare("SELECT status FROM pets WHERE id=10").get().status, "deleted");
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM order_items WHERE pet_id=10").get().n, 1);
    assert.equal(existsSync(orderedMedia), true);
    assert.ok(result.blockers.some((item) => item.table === "order_items"));
    assert.equal(db.prepare("PRAGMA foreign_key_check").all().length, 0);
  } finally {
    db.close();
    rmSync(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  }
});

test("受管路径拒绝目录穿越和上传根目录删除", () => {
  const root = join(tmpdir(), "fuchong-managed-root");
  assert.equal(managedUploadPath("/uploads/../data/database.db", root), null);
  assert.equal(managedUploadPath("/uploads/", root), null);
  assert.equal(managedUploadPath("https://example.com/not-uploads/a.webp", root), null);
  const valid = managedUploadPath("https://petinmyall.me/uploads/products/a.webp?x=1", root);
  assert.equal(valid.normalizedPath, "/uploads/products/a.webp");
  assert.ok(valid.absolutePath.startsWith(resolveForTest(root)));
});

const resolveForTest = (value) => join(value, "");
