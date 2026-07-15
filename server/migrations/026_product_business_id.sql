-- Keep the Feishu record id and the merchant-facing product identity separate.
ALTER TABLE pets ADD COLUMN business_id TEXT;

UPDATE pets
SET business_id=substr(name,-6)
WHERE source='feishu'
  AND external_id LIKE 'rec%'
  AND substr(name,-6) GLOB '[0-9][0-9][0-9][0-9][0-9][0-9]';

CREATE UNIQUE INDEX IF NOT EXISTS idx_pets_business_id_unique
ON pets(business_id)
WHERE business_id IS NOT NULL AND business_id<>'';
