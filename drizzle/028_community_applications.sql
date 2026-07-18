CREATE TABLE IF NOT EXISTS community_applications (
  id INTEGER PRIMARY KEY,
  application_no TEXT NOT NULL UNIQUE,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  application_type TEXT NOT NULL CHECK(application_type IN ('breed','adoption','charity')),
  subject TEXT NOT NULL,
  applicant_name TEXT NOT NULL,
  contact TEXT NOT NULL,
  city TEXT,
  details TEXT NOT NULL,
  availability TEXT,
  experience TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','processing','approved','rejected','completed')),
  admin_reply TEXT,
  assigned_admin_id INTEGER REFERENCES admins(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_community_applications_status
  ON community_applications(status, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_community_applications_type
  ON community_applications(application_type, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_community_applications_user
  ON community_applications(user_id, created_at DESC, id DESC);
