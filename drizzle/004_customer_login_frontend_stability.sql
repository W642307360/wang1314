-- P0 稳定性迁移：客服闭环、登录同步、消息商品关联、飞书真实配置字段。
-- 只做增量新增，不删除已有数据。

ALTER TABLE users ADD COLUMN account TEXT;
ALTER TABLE users ADD COLUMN wechat_openid TEXT;
ALTER TABLE users ADD COLUMN last_login_at TEXT;

ALTER TABLE messages ADD COLUMN session_id INTEGER;
ALTER TABLE messages ADD COLUMN product_id INTEGER;
ALTER TABLE messages ADD COLUMN product_name TEXT;
ALTER TABLE messages ADD COLUMN seller_name TEXT;
ALTER TABLE messages ADD COLUMN status TEXT DEFAULT 'sent';

ALTER TABLE feishu_sync_configs ADD COLUMN app_id TEXT;
ALTER TABLE feishu_sync_configs ADD COLUMN base_url TEXT;

CREATE TABLE IF NOT EXISTS user_login_logs(
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  login_type TEXT DEFAULT 'mock_wechat',
  ip TEXT,
  user_agent TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS customer_service_sessions(
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  product_id INTEGER REFERENCES pets(id),
  product_name TEXT,
  seller_name TEXT,
  source TEXT DEFAULT 'product_detail',
  status TEXT DEFAULT 'ai',
  assigned_to TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_product ON messages(product_id, created_at);
CREATE INDEX IF NOT EXISTS idx_service_sessions_user ON customer_service_sessions(user_id, status, updated_at);
CREATE INDEX IF NOT EXISTS idx_user_login_logs_user ON user_login_logs(user_id, created_at);

UPDATE feishu_sync_configs
SET
  app_id = COALESCE(app_id, 'cli_a902ca6a2cb85cc0'),
  base_url = COALESCE(base_url, 'https://zcnvgd19036s.feishu.cn/base/QFkrbUg4haKAMysYjOicjzcTnvh?from=from_copylink'),
  table_id = COALESCE(table_id, 'tblUaCqyE3xkk1Bj')
WHERE id = 1 OR document_url LIKE '%feishu.cn%';
