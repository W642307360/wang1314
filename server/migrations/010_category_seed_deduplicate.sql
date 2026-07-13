-- 保留历史分类数据，仅停用重复的六个场馆种子记录。
-- 每个场馆保留最早的一条记录，避免服务重启继续产生重复入口。
UPDATE categories
SET status='inactive'
WHERE name IN ('猫猫馆','狗狗馆','鸟类馆','水族馆','奇宠馆','更多馆')
  AND id NOT IN (
    SELECT MIN(id)
    FROM categories
    WHERE name IN ('猫猫馆','狗狗馆','鸟类馆','水族馆','奇宠馆','更多馆')
    GROUP BY name
  );

CREATE INDEX IF NOT EXISTS idx_categories_name_status
ON categories(name,status,id);
