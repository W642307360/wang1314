CREATE INDEX IF NOT EXISTS idx_visitors_user
ON visitors(user_id, last_seen);

CREATE INDEX IF NOT EXISTS idx_after_sales_user_status
ON after_sales(user_id, status, created_at);

CREATE INDEX IF NOT EXISTS idx_after_sales_order_status
ON after_sales(order_id, status, created_at);

CREATE INDEX IF NOT EXISTS idx_feishu_sync_tasks_status_time
ON feishu_sync_tasks(status, created_at);

CREATE INDEX IF NOT EXISTS idx_feishu_sync_tasks_config_time
ON feishu_sync_tasks(config_id, created_at);

CREATE INDEX IF NOT EXISTS idx_user_login_logs_user_time
ON user_login_logs(user_id, created_at);
