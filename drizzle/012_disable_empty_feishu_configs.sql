-- 保留历史配置，仅停用没有文档链接或名称的误操作记录。
UPDATE feishu_sync_configs
SET status='inactive'
WHERE TRIM(COALESCE(name,''))='' OR TRIM(COALESCE(document_url,''))='';
