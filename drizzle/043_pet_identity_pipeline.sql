CREATE TABLE IF NOT EXISTS pet_identity_profiles (
  pet_id INTEGER PRIMARY KEY REFERENCES pets(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  breed TEXT NOT NULL,
  gender TEXT NOT NULL DEFAULT '待核验',
  birth_date TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '自然综合色',
  identity_no TEXT NOT NULL UNIQUE,
  chip_no TEXT NOT NULL UNIQUE,
  issued_date TEXT NOT NULL,
  algorithm_version TEXT NOT NULL DEFAULT 'pet-identity-v1',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_pet_identity_number
ON pet_identity_profiles(identity_no);

ALTER TABLE feishu_sync_task_items ADD COLUMN identity_status TEXT DEFAULT 'pending';
ALTER TABLE feishu_sync_task_items ADD COLUMN identity_error TEXT;
ALTER TABLE feishu_sync_task_items ADD COLUMN identity_processed_at TEXT;

CREATE INDEX IF NOT EXISTS idx_feishu_task_items_identity
ON feishu_sync_task_items(task_id,identity_status,row_no);
