CREATE TABLE owner_credentials (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  version TEXT NOT NULL,
  password_hash TEXT NOT NULL
);

-- Old immutable deployments must not create sessions with a retired password.
-- The row lock also serializes in-flight sign-ins with password rotation.
CREATE FUNCTION check_session_credential() RETURNS TRIGGER AS $$
DECLARE active_version TEXT;
BEGIN
  SELECT version INTO active_version FROM owner_credentials WHERE id = 1 FOR SHARE;
  IF active_version IS NOT NULL AND NEW.credential_version <> active_version THEN
    RAISE EXCEPTION 'Credential has been retired';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER session_credential_guard BEFORE INSERT OR UPDATE ON sessions
FOR EACH ROW EXECUTE FUNCTION check_session_credential();
