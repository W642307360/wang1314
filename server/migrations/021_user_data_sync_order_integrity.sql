-- Additive operational integrity: persistent carts, resumable sync payloads,
-- idempotent order creation and traceable server failures.
CREATE TABLE IF NOT EXISTS cart_items (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pet_id INTEGER NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK(quantity BETWEEN 1 AND 99),
  selected INTEGER NOT NULL DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, pet_id)
);

CREATE INDEX IF NOT EXISTS idx_cart_items_user_time
ON cart_items(user_id, updated_at DESC, id DESC);

ALTER TABLE orders ADD COLUMN client_request_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_user_request_unique
ON orders(user_id, client_request_id)
WHERE client_request_id IS NOT NULL AND client_request_id <> '';

CREATE TABLE IF NOT EXISTS feishu_sync_task_items (
  id INTEGER PRIMARY KEY,
  task_id INTEGER NOT NULL REFERENCES feishu_sync_tasks(id) ON DELETE CASCADE,
  row_no INTEGER NOT NULL,
  external_id TEXT,
  payload TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  error TEXT,
  processed_at TEXT,
  UNIQUE(task_id, row_no)
);

CREATE INDEX IF NOT EXISTS idx_feishu_task_items_status
ON feishu_sync_task_items(task_id, status, row_no);

CREATE TABLE IF NOT EXISTS api_error_logs (
  id INTEGER PRIMARY KEY,
  request_id TEXT NOT NULL UNIQUE,
  method TEXT NOT NULL,
  path TEXT NOT NULL,
  message TEXT NOT NULL,
  stack TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_api_error_logs_time
ON api_error_logs(created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_addresses_user_default
ON addresses(user_id, is_default DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_logistics_order_status
ON logistics(order_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_login_phone_time
ON user_login_logs(user_id, created_at DESC);
