# Migration 000 — Create schema_migrations table

CREATE TABLE IF NOT EXISTS schema_migrations (
  version VARCHAR(3) PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE schema_migrations IS 'Tracks which migration files have been applied';