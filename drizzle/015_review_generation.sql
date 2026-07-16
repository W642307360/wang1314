ALTER TABLE product_reviews ADD COLUMN source TEXT NOT NULL DEFAULT 'user';
ALTER TABLE product_reviews ADD COLUMN status TEXT NOT NULL DEFAULT 'published';
CREATE INDEX IF NOT EXISTS idx_product_reviews_pet_status_time
ON product_reviews(pet_id, status, created_at DESC);
