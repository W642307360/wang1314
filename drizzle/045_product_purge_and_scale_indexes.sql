CREATE TABLE IF NOT EXISTS product_deletion_jobs (
  id INTEGER PRIMARY KEY,
  pet_id INTEGER NOT NULL,
  pet_name TEXT,
  requested_by INTEGER REFERENCES admins(id) ON DELETE SET NULL,
  mode TEXT NOT NULL DEFAULT 'purge' CHECK(mode IN ('purge','archive')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','completed','archived','failed')),
  blocked_references TEXT NOT NULL DEFAULT '[]',
  media_candidates INTEGER NOT NULL DEFAULT 0,
  media_deleted INTEGER NOT NULL DEFAULT 0,
  media_retained INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at TEXT
);

CREATE TABLE IF NOT EXISTS media_deletion_queue (
  id INTEGER PRIMARY KEY,
  job_id INTEGER NOT NULL REFERENCES product_deletion_jobs(id) ON DELETE CASCADE,
  normalized_path TEXT NOT NULL,
  source_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','deleted','retained','failed')),
  reason TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  processed_at TEXT,
  UNIQUE(job_id, normalized_path)
);

CREATE INDEX IF NOT EXISTS idx_product_deletion_jobs_pet_time
ON product_deletion_jobs(pet_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_media_deletion_queue_status
ON media_deletion_queue(status, id);

CREATE INDEX IF NOT EXISTS idx_pets_admin_updated
ON pets(updated_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_pets_status_updated
ON pets(status, updated_at DESC, id DESC);
