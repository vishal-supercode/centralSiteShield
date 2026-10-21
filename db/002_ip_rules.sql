CREATE TABLE IF NOT EXISTS site_ip_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  ip INET NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('allow', 'block')),
  source TEXT NOT NULL CHECK (source IN ('manual', 'automatic')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (site_id, ip)
);

CREATE INDEX IF NOT EXISTS site_ip_rules_site_type_idx ON site_ip_rules(site_id, type);
