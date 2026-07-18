-- Merchant operators are intentionally separate from `sellers`.
-- `sellers` remains the randomly assigned public profile shown on product details.
CREATE TABLE IF NOT EXISTS merchant_applications(
  id INTEGER PRIMARY KEY,
  application_no TEXT NOT NULL UNIQUE,
  shop_name TEXT NOT NULL,
  applicant_name TEXT NOT NULL,
  contact_phone TEXT NOT NULL,
  city TEXT,
  business_description TEXT,
  qualification_urls TEXT NOT NULL DEFAULT '[]',
  requested_username TEXT NOT NULL COLLATE NOCASE UNIQUE,
  password_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  admin_reply TEXT,
  reviewed_by INTEGER REFERENCES admins(id),
  reviewed_at TEXT,
  merchant_account_id INTEGER,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS merchant_accounts(
  id INTEGER PRIMARY KEY,
  application_id INTEGER UNIQUE REFERENCES merchant_applications(id),
  username TEXT NOT NULL COLLATE NOCASE UNIQUE,
  password_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  shop_name TEXT NOT NULL,
  applicant_name TEXT NOT NULL,
  contact_phone TEXT NOT NULL,
  city TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  last_login_at TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE pets ADD COLUMN merchant_account_id INTEGER REFERENCES merchant_accounts(id);
ALTER TABLE pet_products ADD COLUMN showcase_status TEXT NOT NULL DEFAULT 'not_required';
ALTER TABLE pet_products ADD COLUMN showcase_error TEXT;
ALTER TABLE pet_products ADD COLUMN showcase_updated_at TEXT;

CREATE INDEX IF NOT EXISTS idx_merchant_applications_status_time
  ON merchant_applications(status,created_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS idx_merchant_accounts_status
  ON merchant_accounts(status,id);
CREATE INDEX IF NOT EXISTS idx_pets_merchant_status
  ON pets(merchant_account_id,status,updated_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS idx_order_items_pet_order
  ON order_items(pet_id,order_id);

