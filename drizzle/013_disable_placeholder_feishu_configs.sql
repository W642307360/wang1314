-- 保留早期演示/乱码配置，但从运营同步入口停用，避免误点写入错误字段。
UPDATE feishu_sync_configs
SET status='inactive'
WHERE document_url LIKE '%example.feishu%'
   OR field_mapping LIKE '%????%';
