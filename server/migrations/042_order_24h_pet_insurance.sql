ALTER TABLE orders ADD COLUMN pet_insurance_deadline TEXT;
ALTER TABLE orders ADD COLUMN pet_insurance_eligible INTEGER NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN pet_insurance_confirmed_at TEXT;
ALTER TABLE orders ADD COLUMN pet_insurance_policy TEXT;

CREATE INDEX IF NOT EXISTS idx_orders_pet_insurance
ON orders(pet_insurance_eligible, pet_insurance_deadline);
