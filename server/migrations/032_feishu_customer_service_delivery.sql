CREATE TABLE IF NOT EXISTS feishu_event_receipts (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'processing',
  error TEXT,
  received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  processed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_feishu_event_receipts_status_time
ON feishu_event_receipts(status, received_at);

CREATE INDEX IF NOT EXISTS idx_messages_session_sender_read
ON messages(session_id, sender, is_read, id);

CREATE INDEX IF NOT EXISTS idx_customer_service_pending_group_time
ON customer_service_sessions(status, group_key, updated_at);
