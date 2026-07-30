import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import {
  mkdtempSync,
  mkdirSync,
  readdirSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PRODUCT_COUNT = 10_000;
const BATCH_SIZE = 500;

test("一万商品图文视频元数据、分页、批处理和删除保持稳定", () => {
  const temp = mkdtempSync(join(tmpdir(), "fuchong-scale-"));
  const uploads = join(temp, "uploads");
  mkdirSync(uploads, { recursive: true });
  const dbPath = join(temp, "scale.db");
  const db = new DatabaseSync(dbPath);
  try {
    db.exec(`
      PRAGMA foreign_keys=ON;
      PRAGMA journal_mode=WAL;
      PRAGMA synchronous=NORMAL;
      PRAGMA busy_timeout=5000;
      CREATE TABLE pets(
        id INTEGER PRIMARY KEY,name TEXT NOT NULL,breed TEXT NOT NULL,
        description TEXT,price INTEGER NOT NULL,status TEXT NOT NULL,
        source TEXT NOT NULL,external_id TEXT NOT NULL UNIQUE,
        detail_payload TEXT NOT NULL DEFAULT '{}',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE pet_images(
        id INTEGER PRIMARY KEY,pet_id INTEGER NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
        url TEXT NOT NULL,thumbnail_url TEXT,webp_url TEXT,sort_order INTEGER DEFAULT 0,
        UNIQUE(pet_id,url)
      );
      CREATE TABLE pet_videos(
        id INTEGER PRIMARY KEY,pet_id INTEGER NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
        url TEXT NOT NULL,cover_url TEXT,duration INTEGER DEFAULT 0,
        UNIQUE(pet_id,url)
      );
      CREATE TABLE inventory(
        id INTEGER PRIMARY KEY,pet_id INTEGER NOT NULL REFERENCES pets(id),
        total_stock INTEGER DEFAULT 1,available_stock INTEGER DEFAULT 1
      );
      CREATE INDEX idx_pets_status_updated ON pets(status,updated_at DESC,id DESC);
      CREATE INDEX idx_pets_source_external ON pets(source,external_id);
      CREATE INDEX idx_images_pet_sort ON pet_images(pet_id,sort_order,id);
      CREATE INDEX idx_videos_pet ON pet_videos(pet_id,id);
    `);
    const insertPet = db.prepare(
      `INSERT INTO pets(
         name,breed,description,price,status,source,external_id,detail_payload
       ) VALUES(?,?,?,?,?,'scale-test',?,?)`,
    );
    const insertImage = db.prepare(
      "INSERT INTO pet_images(pet_id,url,thumbnail_url,webp_url,sort_order) VALUES(?,?,?,?,?)",
    );
    const insertVideo = db.prepare(
      "INSERT INTO pet_videos(pet_id,url,cover_url,duration) VALUES(?,?,?,?)",
    );
    const insertInventory = db.prepare(
      "INSERT INTO inventory(pet_id,total_stock,available_stock) VALUES(?,1,1)",
    );

    const startedAt = performance.now();
    for (let batchStart = 0; batchStart < PRODUCT_COUNT; batchStart += BATCH_SIZE) {
      db.exec("BEGIN IMMEDIATE");
      try {
        for (let offset = 0; offset < BATCH_SIZE; offset++) {
          const index = batchStart + offset + 1;
          const pet = insertPet.run(
            `容量测试宠物${index}`,
            index % 2 ? "测试猫" : "测试犬",
            `第${index}条商品详情，仅用于隔离数据库代码压力测试。`,
            1000 + (index % 2000),
            index % 7 ? "published" : "offline",
            `scale-${index}`,
            JSON.stringify({
              color: index % 3 ? "综合色" : "浅色",
              body_type: ["小型", "中型", "大型"][index % 3],
            }),
          );
          const petId = Number(pet.lastInsertRowid);
          insertImage.run(
            petId,
            `/virtual-media/products/${petId}/main.webp`,
            `/virtual-media/products/${petId}/thumb.webp`,
            `https://media.example.test/products/${petId}/main.webp`,
            0,
          );
          insertVideo.run(
            petId,
            `/virtual-media/products/${petId}/intro.mp4`,
            `/virtual-media/products/${petId}/poster.webp`,
            30,
          );
          insertInventory.run(petId);
        }
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    }
    const insertedMs = performance.now() - startedAt;

    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM pets").get().n, PRODUCT_COUNT);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM pet_images").get().n, PRODUCT_COUNT);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM pet_videos").get().n, PRODUCT_COUNT);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM inventory").get().n, PRODUCT_COUNT);

    const page = db.prepare(
      `SELECT p.id,p.name,p.breed,p.price,p.status,
              (SELECT thumbnail_url FROM pet_images WHERE pet_id=p.id ORDER BY sort_order,id LIMIT 1) AS image
       FROM pets p WHERE p.status=? ORDER BY p.updated_at DESC,p.id DESC LIMIT ? OFFSET ?`,
    );
    for (const pageNumber of [0, 1, 20, 50, 90]) {
      const rows = page.all("published", 100, pageNumber * 100);
      assert.ok(rows.length <= 100);
      assert.ok(Buffer.byteLength(JSON.stringify(rows)) < 100_000);
    }

    const update = db.prepare(
      "UPDATE pets SET price=price+1,updated_at=CURRENT_TIMESTAMP WHERE source=? AND external_id=?",
    );
    for (let batchStart = 0; batchStart < PRODUCT_COUNT; batchStart += BATCH_SIZE) {
      db.exec("BEGIN IMMEDIATE");
      try {
        for (let offset = 0; offset < BATCH_SIZE; offset++) {
          const index = batchStart + offset + 1;
          assert.equal(update.run("scale-test", `scale-${index}`).changes, 1);
        }
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
      assert.equal(
        db.prepare("SELECT COUNT(*) AS n FROM pets WHERE status='published'").get().n,
        8572,
      );
    }

    db.exec("BEGIN IMMEDIATE");
    try {
      db.prepare("DELETE FROM inventory WHERE pet_id IN (SELECT id FROM pets WHERE id<=500)").run();
      db.prepare("DELETE FROM pets WHERE id<=500").run();
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM pets").get().n, 9500);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM pet_images").get().n, 9500);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM pet_videos").get().n, 9500);
    assert.equal(db.prepare("PRAGMA foreign_key_check").all().length, 0);
    assert.equal(db.prepare("PRAGMA integrity_check").get().integrity_check, "ok");
    db.exec("PRAGMA wal_checkpoint(TRUNCATE)");

    assert.equal(readdirSync(uploads).length, 0, "压力测试不应生成真实图片或视频");
    assert.ok(statSync(dbPath).size < 64 * 1024 * 1024);
    assert.ok(insertedMs < 30_000, `一万商品元数据写入耗时异常：${insertedMs.toFixed(0)}ms`);
  } finally {
    db.close();
    rmSync(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  }
});
