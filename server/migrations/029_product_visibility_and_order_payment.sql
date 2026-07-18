-- Product availability is a commerce status; `published` belongs to the pet record.
UPDATE pet_products
SET status = CASE
  WHEN pet_id IN (SELECT id FROM pets WHERE status='published') THEN 'available'
  WHEN pet_id IN (SELECT id FROM pets WHERE status='sold') THEN 'sold'
  ELSE 'offline'
END,
updated_at = CURRENT_TIMESTAMP
WHERE status NOT IN ('available','offline','sold','reserved');

INSERT OR IGNORE INTO pet_products(pet_id,breed_id,seller_id,product_name,status)
SELECT id,breed_id,seller_id,name,
       CASE WHEN status='published' THEN 'available' WHEN status='sold' THEN 'sold' ELSE 'offline' END
FROM pets
WHERE status<>'deleted';

CREATE INDEX IF NOT EXISTS idx_pet_products_visibility
  ON pet_products(status,pet_id);
CREATE INDEX IF NOT EXISTS idx_pets_admin_search
  ON pets(status,breed,name,seller_name,updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_payment_status_updated
  ON orders(payment_status,status,updated_at DESC,id DESC);
