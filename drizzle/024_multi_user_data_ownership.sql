CREATE UNIQUE INDEX IF NOT EXISTS idx_addresses_one_default_per_user
ON addresses(user_id)
WHERE is_default=1;

CREATE UNIQUE INDEX IF NOT EXISTS idx_after_sales_one_open_per_order
ON after_sales(order_id,user_id)
WHERE status IN ('pending','processing');

CREATE INDEX IF NOT EXISTS idx_customer_service_user_status
ON customer_service_sessions(user_id,status,updated_at);

CREATE INDEX IF NOT EXISTS idx_product_reviews_user_time
ON product_reviews(user_id,created_at);

CREATE INDEX IF NOT EXISTS idx_seller_reviews_user_time
ON seller_reviews(user_id,created_at);
