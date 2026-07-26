CREATE TABLE IF NOT EXISTS service_agent_push_subscriptions (
  id INTEGER PRIMARY KEY,
  agent_id TEXT NOT NULL,
  agent_name TEXT,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth_key TEXT NOT NULL,
  user_agent TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','revoked','expired')),
  last_success_at TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_service_agent_push_status
ON service_agent_push_subscriptions(agent_id,status,updated_at DESC);
