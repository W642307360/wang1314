-- 福宠商城商业化稳定迁移
-- 只新增表、字段、索引和兼容视图；不 DROP TABLE，不清空数据。

CREATE TABLE IF NOT EXISTS schema_migrations(
  id INTEGER PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  applied_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS admin_operation_logs(
  id INTEGER PRIMARY KEY,
  admin_id INTEGER REFERENCES admins(id),
  action TEXT NOT NULL,
  resource TEXT NOT NULL,
  resource_id TEXT,
  detail TEXT DEFAULT '{}',
  ip TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS payments(
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id),
  payment_no TEXT UNIQUE NOT NULL,
  channel TEXT DEFAULT 'mock',
  amount INTEGER NOT NULL,
  status TEXT DEFAULT 'pending',
  paid_at TEXT,
  raw_payload TEXT DEFAULT '{}',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS inventory(
  id INTEGER PRIMARY KEY,
  pet_id INTEGER NOT NULL REFERENCES pets(id),
  sku_id INTEGER REFERENCES pet_skus(id),
  total_stock INTEGER DEFAULT 1,
  locked_stock INTEGER DEFAULT 0,
  available_stock INTEGER DEFAULT 1,
  low_stock_threshold INTEGER DEFAULT 1,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(pet_id, sku_id)
);

CREATE TABLE IF NOT EXISTS sync_task_errors(
  id INTEGER PRIMARY KEY,
  task_id INTEGER REFERENCES feishu_sync_tasks(id),
  row_no INTEGER,
  payload TEXT DEFAULT '{}',
  error TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS api_rate_limits(
  id INTEGER PRIMARY KEY,
  key TEXT NOT NULL,
  bucket TEXT NOT NULL,
  count INTEGER DEFAULT 1,
  reset_at TEXT NOT NULL,
  UNIQUE(key, bucket)
);

ALTER TABLE pets ADD COLUMN thumbnail_url TEXT;
ALTER TABLE pets ADD COLUMN highres_url TEXT;
ALTER TABLE pets ADD COLUMN source TEXT DEFAULT 'local';
ALTER TABLE pets ADD COLUMN external_id TEXT;
ALTER TABLE pets ADD COLUMN detail_payload TEXT DEFAULT '{}';

ALTER TABLE pet_images ADD COLUMN thumbnail_url TEXT;
ALTER TABLE pet_images ADD COLUMN webp_url TEXT;
ALTER TABLE pet_images ADD COLUMN width INTEGER;
ALTER TABLE pet_images ADD COLUMN height INTEGER;

ALTER TABLE pet_videos ADD COLUMN status TEXT DEFAULT 'ready';
ALTER TABLE pet_videos ADD COLUMN transcode_log TEXT DEFAULT '[]';

ALTER TABLE orders ADD COLUMN paid_at TEXT;
ALTER TABLE orders ADD COLUMN refund_status TEXT DEFAULT 'none';

ALTER TABLE feishu_sync_tasks ADD COLUMN batch_size INTEGER DEFAULT 500;
ALTER TABLE feishu_sync_tasks ADD COLUMN processed INTEGER DEFAULT 0;
ALTER TABLE feishu_sync_tasks ADD COLUMN cursor TEXT;
ALTER TABLE feishu_sync_tasks ADD COLUMN retry_count INTEGER DEFAULT 0;
ALTER TABLE feishu_sync_tasks ADD COLUMN paused_at TEXT;

CREATE INDEX IF NOT EXISTS idx_pets_status_category_id ON pets(status, category_id, id);
CREATE INDEX IF NOT EXISTS idx_pets_breed_name ON pets(breed, name);
CREATE INDEX IF NOT EXISTS idx_pets_external ON pets(source, external_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_pets_source_external_unique ON pets(source, external_id);
CREATE INDEX IF NOT EXISTS idx_inventory_pet_sku ON inventory(pet_id, sku_id);
CREATE INDEX IF NOT EXISTS idx_payments_order_status ON payments(order_id, status);
CREATE INDEX IF NOT EXISTS idx_logs_resource ON admin_operation_logs(resource, resource_id, created_at);
CREATE INDEX IF NOT EXISTS idx_sync_errors_task ON sync_task_errors(task_id, row_no);
CREATE INDEX IF NOT EXISTS idx_favorites_user_pet ON favorites(user_id, pet_id);
CREATE INDEX IF NOT EXISTS idx_follows_user_seller ON follows(user_id, seller_name);
CREATE INDEX IF NOT EXISTS idx_footprints_user_time ON footprints(user_id, viewed_at);

INSERT OR IGNORE INTO inventory(pet_id, sku_id, total_stock, available_stock)
SELECT p.id, s.id, COALESCE(s.stock, 1), COALESCE(s.stock, 1)
FROM pets p
LEFT JOIN pet_skus s ON s.pet_id = p.id;

CREATE VIEW IF NOT EXISTS products AS SELECT * FROM pets;
CREATE VIEW IF NOT EXISTS pet_categories AS SELECT * FROM categories;
CREATE VIEW IF NOT EXISTS pet_sku AS SELECT * FROM pet_skus;
CREATE VIEW IF NOT EXISTS product_images AS SELECT * FROM pet_images;
CREATE VIEW IF NOT EXISTS product_videos AS SELECT * FROM pet_videos;
