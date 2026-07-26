ALTER TABLE orders ADD COLUMN inventory_locked INTEGER NOT NULL DEFAULT 0 CHECK(inventory_locked IN (0,1));

UPDATE orders
SET inventory_locked=1
WHERE status NOT IN ('cancelled','completed')
  AND EXISTS (
    SELECT 1
    FROM order_items oi
    JOIN inventory i ON i.pet_id=oi.pet_id
    WHERE oi.order_id=orders.id AND i.locked_stock>0
  );

CREATE INDEX IF NOT EXISTS idx_orders_inventory_locked
  ON orders(inventory_locked,payment_status,status);
