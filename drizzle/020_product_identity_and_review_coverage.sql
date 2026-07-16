-- Preserve existing products while making every displayed identity and review
-- relationship complete. No existing review or product is removed.
WITH ranked AS (
  SELECT id, name, ROW_NUMBER() OVER (PARTITION BY name ORDER BY id) AS position
  FROM pets
)
UPDATE pets
SET name = name || ' · ' || printf('%02d', (
  SELECT position FROM ranked WHERE ranked.id = pets.id
))
WHERE id IN (SELECT id FROM ranked WHERE position > 1);

UPDATE pet_products
SET product_name = (SELECT pets.name FROM pets WHERE pets.id = pet_products.pet_id),
    updated_at = CURRENT_TIMESTAMP
WHERE EXISTS (SELECT 1 FROM pets WHERE pets.id = pet_products.pet_id)
  AND product_name <> (SELECT pets.name FROM pets WHERE pets.id = pet_products.pet_id);

INSERT INTO product_reviews
  (pet_id, nickname, rating, content, images_json, videos_json, is_verified, likes, source, status, created_at)
SELECT
  p.id,
  CASE p.id % 8
    WHEN 0 THEN '山茶与风' WHEN 1 THEN '慢慢陪伴' WHEN 2 THEN '林间小屋'
    WHEN 3 THEN '阿梨日常' WHEN 4 THEN '小满同学' WHEN 5 THEN '月光信箱'
    WHEN 6 THEN '橘子海' ELSE '认真生活'
  END,
  CASE WHEN p.id % 11 = 0 THEN 4 ELSE 5 END,
  '接回' || p.name || '前认真核对了健康档案和生活状态，实际情况与商品资料一致。到家后的精神、饮食和互动都在逐渐稳定，商家也会及时回复照护问题。',
  '[]', '[]', 0, p.id % 37, 'generated', 'published',
  datetime('now', '-' || ((p.id % 83) + 2) || ' days')
FROM pets p
WHERE NOT EXISTS (
  SELECT 1 FROM product_reviews r WHERE r.pet_id = p.id AND r.status = 'published'
);

CREATE INDEX IF NOT EXISTS idx_pets_name_identity ON pets(name, id);
