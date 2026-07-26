ALTER TABLE customer_service_sessions ADD COLUMN human_last_activity_at TEXT;
ALTER TABLE customer_service_sessions ADD COLUMN auto_resume_at TEXT;

CREATE INDEX IF NOT EXISTS idx_customer_service_auto_resume
ON customer_service_sessions(status, auto_resume_at);
