-- 库存完整性修复迁移
-- 目的：修复压测/重复同步产生的重复库存技术记录。
-- 策略：先审计备份重复行，再保留每组最早一条主记录，最后加表达式唯一索引。

CREATE TABLE IF NOT EXISTS inventory_deduplicate_logs(
  id INTEGER PRIMARY KEY,
  inventory_id INTEGER,
  pet_id INTEGER,
  sku_id INTEGER,
  total_stock INTEGER,
  locked_stock INTEGER,
  available_stock INTEGER,
  reason TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO inventory_deduplicate_logs(
  inventory_id, pet_id, sku_id, total_stock, locked_stock, available_stock, reason
)
SELECT id, pet_id, sku_id, total_stock, locked_stock, available_stock, 'duplicate_inventory_before_unique_index'
FROM inventory
WHERE id NOT IN (
  SELECT MIN(id)
  FROM inventory
  GROUP BY pet_id, COALESCE(sku_id, 0)
);

DELETE FROM inventory
WHERE id NOT IN (
  SELECT MIN(id)
  FROM inventory
  GROUP BY pet_id, COALESCE(sku_id, 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_pet_sku_unique
ON inventory(pet_id, COALESCE(sku_id, 0));
