CREATE TABLE products (
  id TEXT PRIMARY KEY,
  document TEXT NOT NULL CHECK (jsonb_typeof(document::jsonb) = 'object'),
  status TEXT NOT NULL CHECK (status IN ('active', 'draft')),
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);
CREATE INDEX products_status ON products(status);
CREATE TABLE settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  document TEXT NOT NULL CHECK (jsonb_typeof(document::jsonb) = 'object'),
  version INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  credential_version TEXT NOT NULL,
  expires_at BIGINT NOT NULL
);
CREATE INDEX sessions_expiry ON sessions(expires_at);
CREATE TABLE login_attempts (
  key TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL,
  expires_at BIGINT NOT NULL
);
CREATE INDEX login_attempts_expiry ON login_attempts(expires_at);
