-- Persist explicit administrator order confirmation separately from payment.
ALTER TABLE orders ADD COLUMN confirmed_at TEXT;

CREATE INDEX IF NOT EXISTS idx_orders_confirmation_queue
ON orders(status, payment_status, confirmed_at, id);
