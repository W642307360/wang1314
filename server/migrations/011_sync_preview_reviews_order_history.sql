-- 飞书预览确认、真实评价与订单状态历史。仅增量新增，不修改或清空已有数据。

CREATE TABLE IF NOT EXISTS feishu_sync_previews (
  id INTEGER PRIMARY KEY,
  config_id INTEGER NOT NULL REFERENCES feishu_sync_configs(id),
  status TEXT NOT NULL DEFAULT 'ready',
  stats_json TEXT NOT NULL DEFAULT '{}',
  items_json TEXT NOT NULL DEFAULT '[]',
  errors_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  confirmed_at TEXT,
  task_id INTEGER REFERENCES feishu_sync_tasks(id)
);

CREATE INDEX IF NOT EXISTS idx_feishu_previews_config_time
ON feishu_sync_previews(config_id, created_at);

CREATE TABLE IF NOT EXISTS product_reviews (
  id INTEGER PRIMARY KEY,
  pet_id INTEGER NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id),
  nickname TEXT NOT NULL,
  avatar TEXT,
  rating INTEGER NOT NULL DEFAULT 5 CHECK(rating BETWEEN 1 AND 5),
  content TEXT NOT NULL,
  images_json TEXT NOT NULL DEFAULT '[]',
  videos_json TEXT NOT NULL DEFAULT '[]',
  is_verified INTEGER NOT NULL DEFAULT 0,
  likes INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_product_reviews_pet_time
ON product_reviews(pet_id, created_at);

CREATE TABLE IF NOT EXISTS order_status_history (
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status TEXT NOT NULL,
  operator_type TEXT NOT NULL DEFAULT 'system',
  operator_id INTEGER,
  note TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_order_status_history_order_time
ON order_status_history(order_id, created_at, id);
