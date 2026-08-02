ALTER TABLE feishu_sync_tasks ADD COLUMN started_at TEXT;
ALTER TABLE feishu_sync_tasks ADD COLUMN heartbeat_at TEXT;
ALTER TABLE feishu_sync_tasks ADD COLUMN last_checkpoint_at TEXT;

ALTER TABLE feishu_sync_task_items ADD COLUMN attempt_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE feishu_sync_task_items ADD COLUMN last_attempt_at TEXT;

CREATE INDEX IF NOT EXISTS idx_feishu_sync_items_pending
ON feishu_sync_task_items(task_id,status,row_no);

CREATE INDEX IF NOT EXISTS idx_feishu_sync_items_media_pending
ON feishu_sync_task_items(task_id,showcase_status,row_no);
