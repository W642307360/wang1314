-- P0 incremental integrity migration: keep existing data, add compatible links.
ALTER TABLE users ADD COLUMN unionid TEXT;
ALTER TABLE users ADD COLUMN login_method TEXT DEFAULT 'visitor';

ALTER TABLE messages ADD COLUMN service_type TEXT DEFAULT '购买咨询';
ALTER TABLE messages ADD COLUMN seller_id INTEGER;

ALTER TABLE customer_service_sessions ADD COLUMN service_type TEXT DEFAULT '购买咨询';
ALTER TABLE customer_service_sessions ADD COLUMN seller_id INTEGER;

ALTER TABLE pets ADD COLUMN breed_id INTEGER;
ALTER TABLE pets ADD COLUMN seller_id INTEGER;

CREATE TABLE IF NOT EXISTS user_auth (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  auth_type TEXT NOT NULL,
  auth_value TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(auth_type, auth_value)
);

CREATE TABLE IF NOT EXISTS breeds (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  category_id INTEGER REFERENCES categories(id),
  intro TEXT,
  origin TEXT,
  growth_profile TEXT,
  standard_body TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS pet_products (
  id INTEGER PRIMARY KEY,
  pet_id INTEGER NOT NULL UNIQUE REFERENCES pets(id),
  breed_id INTEGER REFERENCES breeds(id),
  seller_id INTEGER,
  product_name TEXT NOT NULL,
  status TEXT DEFAULT 'available',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO breeds(name, category_id, intro, origin, growth_profile, standard_body)
SELECT breed, MIN(category_id),
       breed || '标准品种档案，包含性格、健康、饲养建议与平台保障。',
       '品种起源资料由平台档案库持续补充。',
       '1个月、2个月、3个月、6个月、1岁、2岁、3岁成长阶段记录。',
       COALESCE(MAX(body_type), '标准体型')
FROM pets
WHERE breed IS NOT NULL AND TRIM(breed) <> ''
GROUP BY breed;

UPDATE pets
SET breed_id = (SELECT id FROM breeds WHERE breeds.name = pets.breed)
WHERE breed_id IS NULL;

INSERT OR IGNORE INTO pet_products(pet_id, breed_id, seller_id, product_name, status)
SELECT id, breed_id, seller_id, name,
       CASE
         WHEN status='published' THEN 'available'
         WHEN status='sold' THEN 'sold'
         WHEN status IN ('offline','deleted','draft') THEN 'offline'
         ELSE status
       END
FROM pets;

INSERT OR IGNORE INTO user_auth(user_id, auth_type, auth_value)
SELECT id, 'wechat', COALESCE(openid, wechat_openid, account)
FROM users
WHERE COALESCE(openid, wechat_openid, account) IS NOT NULL;

INSERT OR IGNORE INTO user_auth(user_id, auth_type, auth_value)
SELECT id, 'phone', phone
FROM users
WHERE phone IS NOT NULL AND phone <> '';

CREATE INDEX IF NOT EXISTS idx_favorites_pet_id ON favorites(pet_id);
CREATE INDEX IF NOT EXISTS idx_pets_breed_id_status ON pets(breed_id, status);
CREATE INDEX IF NOT EXISTS idx_user_auth_user_type ON user_auth(user_id, auth_type);
CREATE INDEX IF NOT EXISTS idx_messages_service_context ON messages(user_id, product_id, service_type, created_at);
