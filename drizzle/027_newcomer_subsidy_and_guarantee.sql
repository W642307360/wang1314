-- Server-authoritative newcomer subsidy and per-order replacement eligibility.
ALTER TABLE coupons ADD COLUMN code TEXT;
ALTER TABLE user_coupons ADD COLUMN reserved_order_id INTEGER REFERENCES orders(id);

ALTER TABLE orders ADD COLUMN subtotal_amount INTEGER;
ALTER TABLE orders ADD COLUMN discount_amount INTEGER NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN shipping_fee INTEGER NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN user_coupon_id INTEGER REFERENCES user_coupons(id);
ALTER TABLE orders ADD COLUMN guarantee_eligible INTEGER NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN guarantee_policy TEXT;

UPDATE orders SET subtotal_amount=total_amount WHERE subtotal_amount IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_coupons_code_unique
ON coupons(code) WHERE code IS NOT NULL AND code<>'';

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_coupons_user_coupon_unique
ON user_coupons(user_id,coupon_id);

CREATE INDEX IF NOT EXISTS idx_user_coupons_available
ON user_coupons(user_id,status,coupon_id);

INSERT INTO coupons(title,amount,threshold,expires_at,status,code)
SELECT '新人专享 · 平台补贴300元',300,0,NULL,'active','NEW_USER_300'
WHERE NOT EXISTS (SELECT 1 FROM coupons WHERE code='NEW_USER_300');

INSERT OR IGNORE INTO user_coupons(user_id,coupon_id,status)
SELECT u.id,c.id,'available'
FROM users u
JOIN coupons c ON c.code='NEW_USER_300'
WHERE u.status='active'
  AND NOT EXISTS (
    SELECT 1 FROM orders o
    WHERE o.user_id=u.id AND o.payment_status='paid'
  );
