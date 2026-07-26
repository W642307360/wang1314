CREATE TABLE IF NOT EXISTS agreement_acceptances(
  id INTEGER PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  order_id INTEGER REFERENCES orders(id),
  subject_type TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  document_key TEXT NOT NULL,
  document_version TEXT NOT NULL,
  acceptance_method TEXT NOT NULL DEFAULT 'explicit_checkbox',
  user_agent TEXT,
  accepted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(subject_type,subject_id,document_key,document_version)
);

CREATE INDEX IF NOT EXISTS idx_agreement_acceptances_user_time
  ON agreement_acceptances(user_id,accepted_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS idx_agreement_acceptances_order
  ON agreement_acceptances(order_id,document_key);
CREATE INDEX IF NOT EXISTS idx_agreement_acceptances_subject
  ON agreement_acceptances(subject_type,subject_id,accepted_at DESC);
