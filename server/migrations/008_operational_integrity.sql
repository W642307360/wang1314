-- Operational integrity hardening. This migration is additive and preserves all existing data.

CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_paid_order_unique
ON payments(order_id)
WHERE status = 'paid';

CREATE INDEX IF NOT EXISTS idx_orders_payment_status
ON orders(payment_status, status, created_at);

CREATE INDEX IF NOT EXISTS idx_order_items_order
ON order_items(order_id, pet_id);

CREATE TABLE IF NOT EXISTS logistics_events (
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  logistics_id INTEGER REFERENCES logistics(id) ON DELETE CASCADE,
  progress_percent INTEGER NOT NULL DEFAULT 0 CHECK(progress_percent BETWEEN 0 AND 100),
  status TEXT NOT NULL,
  note TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_logistics_events_order_time
ON logistics_events(order_id, created_at, id);
