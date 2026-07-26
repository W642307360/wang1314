-- WeChat native mini-program support. Additive only: existing website tables and rows are untouched.
CREATE TABLE IF NOT EXISTS mini_user_sessions (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  refresh_token_hash TEXT NOT NULL UNIQUE,
  device_id TEXT,
  user_agent TEXT,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_mini_sessions_user_active
ON mini_user_sessions(user_id,expires_at,revoked_at);

CREATE TABLE IF NOT EXISTS home_content_blocks (
  id INTEGER PRIMARY KEY,
  block_key TEXT NOT NULL UNIQUE,
  title TEXT,
  payload_json TEXT NOT NULL DEFAULT '{}',
  sort_order INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive')),
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO home_content_blocks(block_key,title,payload_json,sort_order,status) VALUES
  ('welcome','福宠甄选','{"eyebrow":"FUCHONG SELECT","subtitle":"认真连接每一份陪伴"}',10,'active'),
  ('service','安心服务','{"items":["真实宠物档案","订单全程可追踪","在线客服持续接待"]}',20,'active');

CREATE TABLE IF NOT EXISTS media_uploads (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  original_name TEXT NOT NULL,
  stored_name TEXT NOT NULL UNIQUE,
  mime_type TEXT NOT NULL,
  byte_size INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  local_url TEXT NOT NULL,
  cdn_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','synced','failed')),
  error TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_media_uploads_user_time
ON media_uploads(user_id,created_at DESC,id DESC);
