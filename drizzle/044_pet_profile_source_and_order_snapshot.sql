ALTER TABLE pets ADD COLUMN birth_date TEXT;
ALTER TABLE pets ADD COLUMN fur_length TEXT;

ALTER TABLE pet_identity_profiles ADD COLUMN body_type TEXT;
ALTER TABLE pet_identity_profiles ADD COLUMN fur_length TEXT;
ALTER TABLE pet_identity_profiles ADD COLUMN personality TEXT;
ALTER TABLE pet_identity_profiles ADD COLUMN health_status TEXT;
ALTER TABLE pet_identity_profiles ADD COLUMN vaccine_record TEXT;
ALTER TABLE pet_identity_profiles ADD COLUMN source_json TEXT NOT NULL DEFAULT '{}';
