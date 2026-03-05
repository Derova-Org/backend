CREATE TABLE IF NOT EXISTS accounts (
  username_hash TEXT PRIMARY KEY,
  public_key_hex TEXT NOT NULL,
  account_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS server_secrets (
  id INTEGER PRIMARY KEY DEFAULT 1,
  oprf_seed TEXT NOT NULL,
  org_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT server_secrets_singleton CHECK (id = 1)
);
