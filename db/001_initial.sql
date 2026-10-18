CREATE TABLE IF NOT EXISTS sites (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  origin TEXT NOT NULL,
  api_key_hash TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS security_events (
  id UUID PRIMARY KEY,
  site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  occurred_at TIMESTAMPTZ NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('allow', 'monitor', 'limit', 'block')),
  score INTEGER NOT NULL,
  reasons JSONB NOT NULL,
  request JSONB NOT NULL,
  counters JSONB NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS security_events_site_time_idx ON security_events(site_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS security_events_decision_time_idx ON security_events(decision, occurred_at DESC);
