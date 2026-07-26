CREATE TABLE page (
  id UUID PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  parent_id UUID NULL REFERENCES page(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX page_parent_id_idx ON page (parent_id);
CREATE INDEX page_updated_at_idx ON page (updated_at DESC);
