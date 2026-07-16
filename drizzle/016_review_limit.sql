DELETE FROM product_reviews
WHERE source='generated'
  AND id IN (
    SELECT id FROM (
      SELECT r.id,
             ROW_NUMBER() OVER (PARTITION BY r.pet_id ORDER BY r.id DESC) AS generated_rank,
             (SELECT COUNT(*) FROM product_reviews real
              WHERE real.pet_id=r.pet_id AND real.source<>'generated') AS real_count
      FROM product_reviews r
      WHERE r.source='generated'
    ) ranked
    WHERE generated_rank > MAX(0,25-real_count)
  );
