ALTER TABLE feishu_sync_tasks ADD COLUMN media_total INTEGER DEFAULT 0;
ALTER TABLE feishu_sync_tasks ADD COLUMN media_processed INTEGER DEFAULT 0;
ALTER TABLE feishu_sync_tasks ADD COLUMN media_success INTEGER DEFAULT 0;
ALTER TABLE feishu_sync_tasks ADD COLUMN media_failed INTEGER DEFAULT 0;
ALTER TABLE feishu_sync_tasks ADD COLUMN media_status TEXT DEFAULT 'pending';

ALTER TABLE feishu_sync_task_items ADD COLUMN pet_id INTEGER REFERENCES pets(id) ON DELETE SET NULL;
ALTER TABLE feishu_sync_task_items ADD COLUMN showcase_status TEXT DEFAULT 'not_required';
ALTER TABLE feishu_sync_task_items ADD COLUMN showcase_error TEXT;
ALTER TABLE feishu_sync_task_items ADD COLUMN showcase_processed_at TEXT;

CREATE INDEX IF NOT EXISTS idx_feishu_task_items_showcase
ON feishu_sync_task_items(task_id,showcase_status,row_no);
