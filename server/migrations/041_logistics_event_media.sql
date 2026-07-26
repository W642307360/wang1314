CREATE TABLE IF NOT EXISTS logistics_event_media (
  id INTEGER PRIMARY KEY,
  logistics_event_id INTEGER NOT NULL REFERENCES logistics_events(id) ON DELETE CASCADE,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  media_type TEXT NOT NULL CHECK(media_type IN ('image','video')),
  original_name TEXT,
  source_url TEXT,
  display_url TEXT,
  thumbnail_url TEXT,
  poster_url TEXT,
  mime_type TEXT,
  byte_size INTEGER NOT NULL DEFAULT 0,
  sha256 TEXT,
  duration_seconds REAL,
  processing_status TEXT NOT NULL DEFAULT 'processing'
    CHECK(processing_status IN ('processing','ready','failed')),
  processing_error TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by_admin_id INTEGER REFERENCES admins(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_logistics_event_media_event
ON logistics_event_media(logistics_event_id, sort_order, id);

CREATE INDEX IF NOT EXISTS idx_logistics_event_media_order
ON logistics_event_media(order_id, processing_status, id);
