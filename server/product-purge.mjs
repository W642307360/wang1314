import { existsSync, lstatSync, unlinkSync } from "node:fs";
import { resolve, sep } from "node:path";

const PURGEABLE_REFERENCES = new Set([
  "favorites",
  "footprints",
  "inventory",
  "pet_products",
  "product_reviews",
]);

const INTERNAL_REFERENCE_TABLES = new Set([
  "admin_operation_logs",
  "media_deletion_queue",
  "product_deletion_jobs",
  "schema_migrations",
  "sqlite_sequence",
]);

const quoteIdentifier = (value) => `"${String(value).replaceAll('"', '""')}"`;

const databaseTables = (db) =>
  db.prepare(
    `SELECT name FROM sqlite_schema
     WHERE type='table' AND name NOT LIKE 'sqlite_%'
     ORDER BY name`,
  ).all().map((row) => String(row.name));

const tableColumns = (db, table) =>
  db.prepare(`PRAGMA table_info(${quoteIdentifier(table)})`).all();

const petForeignKeyReferences = (db, petId) => {
  const references = [];
  for (const table of databaseTables(db)) {
    if (table === "pets") continue;
    const foreignKeys = db.prepare(`PRAGMA foreign_key_list(${quoteIdentifier(table)})`).all();
    const petKeys = foreignKeys.filter((key) => key.table === "pets" && key.to === "id");
    for (const key of petKeys) {
      const count = Number(
        db.prepare(
          `SELECT COUNT(*) AS count FROM ${quoteIdentifier(table)}
           WHERE ${quoteIdentifier(key.from)}=?`,
        ).get(petId)?.count || 0,
      );
      if (!count) continue;
      references.push({
        table,
        column: String(key.from),
        count,
        onDelete: String(key.on_delete || "NO ACTION").toUpperCase(),
      });
    }
  }
  return references;
};

const stringsFromValue = (value, output) => {
  if (typeof value === "string") {
    if (value.includes("/uploads/")) output.add(value);
    const trimmed = value.trim();
    if (
      (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
      (trimmed.startsWith("[") && trimmed.endsWith("]"))
    ) {
      try {
        stringsFromValue(JSON.parse(trimmed), output);
      } catch {}
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) stringsFromValue(item, output);
    return;
  }
  if (value && typeof value === "object")
    for (const item of Object.values(value)) stringsFromValue(item, output);
};

const selectIfTableExists = (db, table, sql, ...args) => {
  const exists = db.prepare(
    "SELECT 1 FROM sqlite_schema WHERE type='table' AND name=?",
  ).get(table);
  return exists ? db.prepare(sql).all(...args) : [];
};

export const collectProductMedia = (db, petId) => {
  const candidates = new Set();
  const pet = db.prepare(
    `SELECT thumbnail_url,highres_url,detail_payload
     FROM pets WHERE id=?`,
  ).get(petId);
  stringsFromValue(pet, candidates);
  for (const row of selectIfTableExists(
    db,
    "pet_images",
    "SELECT url,thumbnail_url,webp_url FROM pet_images WHERE pet_id=?",
    petId,
  )) stringsFromValue(row, candidates);
  for (const row of selectIfTableExists(
    db,
    "pet_videos",
    "SELECT url,cover_url,transcode_log FROM pet_videos WHERE pet_id=?",
    petId,
  )) stringsFromValue(row, candidates);
  return [...candidates];
};

const analyzeProductPurge = (db, petId, uploadsRoot) => {
  const id = Number(petId);
  if (!Number.isInteger(id) || id <= 0)
    throw Object.assign(new Error("商品ID不合法"), { statusCode: 400 });
  const pet = db.prepare("SELECT * FROM pets WHERE id=?").get(id);
  if (!pet)
    throw Object.assign(new Error("商品不存在"), { statusCode: 404 });
  const references = petForeignKeyReferences(db, id);
  const blockers = references.filter(
    (reference) =>
      !["CASCADE", "SET NULL"].includes(reference.onDelete) &&
      !PURGEABLE_REFERENCES.has(reference.table),
  );
  const media = collectProductMedia(db, id);
  const managedFiles = new Map();
  for (const sourceUrl of media) {
    const managed = managedUploadPath(sourceUrl, uploadsRoot);
    if (!managed || managedFiles.has(managed.normalizedPath)) continue;
    let bytes = 0;
    let exists = false;
    try {
      if (existsSync(managed.absolutePath)) {
        const stat = lstatSync(managed.absolutePath);
        if (stat.isFile() && !stat.isSymbolicLink()) {
          exists = true;
          bytes = Number(stat.size || 0);
        }
      }
    } catch {}
    managedFiles.set(managed.normalizedPath, {
      path: managed.normalizedPath,
      exists,
      bytes,
    });
  }
  return {
    id,
    pet,
    references,
    blockers,
    media,
    managedFiles: [...managedFiles.values()],
  };
};

export const inspectProductPurge = (db, petId, { uploadsRoot } = {}) => {
  const analysis = analyzeProductPurge(db, petId, uploadsRoot);
  return {
    id: analysis.id,
    name: String(analysis.pet.name || `商品 ${analysis.id}`),
    action: analysis.blockers.length ? "archive" : "purge",
    blockers: analysis.blockers,
    media_candidates: analysis.media.length,
    local_files: analysis.managedFiles.filter((item) => item.exists).length,
    local_bytes: analysis.managedFiles.reduce(
      (total, item) => total + (item.exists ? item.bytes : 0),
      0,
    ),
  };
};

export const managedUploadPath = (value, uploadsRoot) => {
  const raw = String(value || "").trim();
  if (!raw) return null;
  let pathname = raw;
  try {
    if (/^https?:\/\//i.test(raw)) pathname = new URL(raw).pathname;
  } catch {
    return null;
  }
  const marker = "/uploads/";
  const markerIndex = pathname.indexOf(marker);
  if (markerIndex < 0) return null;
  pathname = pathname.slice(markerIndex).split(/[?#]/, 1)[0];
  let relative;
  try {
    relative = decodeURIComponent(pathname.slice(marker.length));
  } catch {
    return null;
  }
  if (!relative || relative.includes("\0")) return null;
  const root = resolve(uploadsRoot);
  const absolute = resolve(root, relative.replaceAll("/", sep));
  if (absolute === root || !absolute.startsWith(`${root}${sep}`)) return null;
  return {
    normalizedPath: `${marker}${relative.replaceAll("\\", "/")}`,
    absolutePath: absolute,
  };
};

const mediaStillReferenced = (db, normalizedPath) => {
  for (const table of databaseTables(db)) {
    if (INTERNAL_REFERENCE_TABLES.has(table)) continue;
    for (const column of tableColumns(db, table)) {
      const type = String(column.type || "").toUpperCase();
      if (!type.includes("TEXT") && type !== "") continue;
      const found = db.prepare(
        `SELECT 1 FROM ${quoteIdentifier(table)}
         WHERE instr(COALESCE(${quoteIdentifier(column.name)},''),?)>0 LIMIT 1`,
      ).get(normalizedPath);
      if (found) return { table, column: String(column.name) };
    }
  }
  return null;
};

export const drainMediaDeletionQueue = (db, uploadsRoot, { limit = 200 } = {}) => {
  const pending = db.prepare(
    `SELECT * FROM media_deletion_queue
     WHERE status='pending' ORDER BY id LIMIT ?`,
  ).all(Math.max(1, Math.min(1000, Number(limit) || 200)));
  const result = { processed: 0, deleted: 0, retained: 0, failed: 0 };
  for (const item of pending) {
    result.processed++;
    const managed = managedUploadPath(item.normalized_path || item.source_url, uploadsRoot);
    if (!managed) {
      db.prepare(
        `UPDATE media_deletion_queue
         SET status='retained',reason='不是受管本地上传文件',attempts=attempts+1,
             processed_at=CURRENT_TIMESTAMP WHERE id=?`,
      ).run(item.id);
      result.retained++;
      continue;
    }
    const reference = mediaStillReferenced(db, managed.normalizedPath);
    if (reference) {
      db.prepare(
        `UPDATE media_deletion_queue
         SET status='retained',reason=?,attempts=attempts+1,
             processed_at=CURRENT_TIMESTAMP WHERE id=?`,
      ).run(`仍被 ${reference.table}.${reference.column} 引用`, item.id);
      result.retained++;
      continue;
    }
    try {
      if (existsSync(managed.absolutePath)) {
        const stat = lstatSync(managed.absolutePath);
        if (!stat.isFile() || stat.isSymbolicLink())
          throw new Error("目标不是普通文件");
        unlinkSync(managed.absolutePath);
      }
      db.prepare(
        `UPDATE media_deletion_queue
         SET status='deleted',reason=?,attempts=attempts+1,
             processed_at=CURRENT_TIMESTAMP WHERE id=?`,
      ).run(existsSync(managed.absolutePath) ? "删除失败" : "本地文件已回收或原本不存在", item.id);
      result.deleted++;
    } catch (error) {
      db.prepare(
        `UPDATE media_deletion_queue
         SET status='failed',reason=?,attempts=attempts+1,
             processed_at=CURRENT_TIMESTAMP WHERE id=?`,
      ).run(String(error?.message || error).slice(0, 500), item.id);
      result.failed++;
    }
  }
  return result;
};

const updateDeletionJobTotals = (db, jobId, status = "completed", error = null) => {
  const totals = db.prepare(
    `SELECT
       SUM(CASE WHEN status='deleted' THEN 1 ELSE 0 END) AS deleted,
       SUM(CASE WHEN status='retained' THEN 1 ELSE 0 END) AS retained,
       SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) AS failed
     FROM media_deletion_queue WHERE job_id=?`,
  ).get(jobId);
  db.prepare(
    `UPDATE product_deletion_jobs
     SET status=?,media_deleted=?,media_retained=?,error=?,finished_at=CURRENT_TIMESTAMP
     WHERE id=?`,
  ).run(
    totals?.failed ? "failed" : status,
    Number(totals?.deleted || 0),
    Number(totals?.retained || 0),
    totals?.failed ? error || `${totals.failed} 个本地文件回收失败` : error,
    jobId,
  );
};

export const purgeProduct = (db, petId, {
  requestedBy = null,
  uploadsRoot,
} = {}) => {
  const analysis = analyzeProductPurge(db, petId, uploadsRoot);
  const { id, pet, references, blockers, media } = analysis;
  if (blockers.length) {
    db.exec("BEGIN IMMEDIATE");
    try {
      db.prepare(
        "UPDATE pets SET status='deleted',updated_at=CURRENT_TIMESTAMP WHERE id=?",
      ).run(id);
      if (db.prepare("SELECT 1 FROM sqlite_schema WHERE type='table' AND name='pet_products'").get())
        db.prepare(
          "UPDATE pet_products SET status='offline',updated_at=CURRENT_TIMESTAMP WHERE pet_id=?",
        ).run(id);
      const created = db.prepare(
        `INSERT INTO product_deletion_jobs(
           pet_id,pet_name,requested_by,mode,status,blocked_references,finished_at
         ) VALUES(?,?,?,'archive','archived',?,CURRENT_TIMESTAMP)`,
      ).run(id, pet.name, requestedBy, JSON.stringify(blockers));
      db.exec("COMMIT");
      return {
        ok: true,
        purged: false,
        archived: true,
        job_id: Number(created.lastInsertRowid),
        blockers,
        message: "商品存在订单或其他业务记录，已安全下架归档；历史数据和媒体未删除。",
      };
    } catch (error) {
      try { db.exec("ROLLBACK"); } catch {}
      throw error;
    }
  }

  let jobId;
  db.exec("BEGIN IMMEDIATE");
  try {
    const created = db.prepare(
      `INSERT INTO product_deletion_jobs(
         pet_id,pet_name,requested_by,mode,status,media_candidates
       ) VALUES(?,?,?,'purge','pending',?)`,
    ).run(id, pet.name, requestedBy, media.length);
    jobId = Number(created.lastInsertRowid);
    for (const reference of references) {
      if (
        ["CASCADE", "SET NULL"].includes(reference.onDelete) ||
        !PURGEABLE_REFERENCES.has(reference.table)
      ) continue;
      db.prepare(
        `DELETE FROM ${quoteIdentifier(reference.table)}
         WHERE ${quoteIdentifier(reference.column)}=?`,
      ).run(id);
    }
    db.prepare("DELETE FROM pets WHERE id=?").run(id);
    for (const sourceUrl of media) {
      const managed = managedUploadPath(sourceUrl, uploadsRoot);
      if (!managed) continue;
      db.prepare(
        `INSERT OR IGNORE INTO media_deletion_queue(
           job_id,normalized_path,source_url
         ) VALUES(?,?,?)`,
      ).run(jobId, managed.normalizedPath, sourceUrl);
    }
    db.exec("COMMIT");
  } catch (error) {
    try { db.exec("ROLLBACK"); } catch {}
    throw error;
  }

  const mediaResult = drainMediaDeletionQueue(db, uploadsRoot, { limit: 1000 });
  updateDeletionJobTotals(db, jobId, "completed");
  return {
    ok: true,
    purged: true,
    archived: false,
    job_id: jobId,
    media: mediaResult,
    message: "商品数据库记录和无引用本地媒体已安全删除。",
  };
};
