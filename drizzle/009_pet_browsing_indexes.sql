-- Additive indexes for the public paginated browsing path.
CREATE INDEX IF NOT EXISTS idx_pets_status_id
ON pets(status, id DESC);

CREATE INDEX IF NOT EXISTS idx_pets_status_breed_id
ON pets(status, breed, id DESC);

CREATE INDEX IF NOT EXISTS idx_pets_status_category_id
ON pets(status, category_id, id DESC);

