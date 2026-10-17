-- Email registration, verification, password reset and session revocation.
-- Idempotent: safe to run on a database that already has some of these.

ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;
-- Incremented on password change/reset: every older login token stops working
ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 0;
-- Language for emails: 'en' or 'bg'
ALTER TABLE users ADD COLUMN IF NOT EXISTS locale TEXT NOT NULL DEFAULT 'en';

-- One active account per email address (case-insensitive)
CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_unique
    ON users (lower(email))
    WHERE email IS NOT NULL AND deleted = FALSE;

-- Single-use links sent by email. Only a SHA-256 hash of the token is stored,
-- so a database leak doesn't expose usable links.
CREATE TABLE IF NOT EXISTS auth_tokens (
    id          BIGSERIAL PRIMARY KEY,
    userid      INTEGER     NOT NULL,
    purpose     TEXT        NOT NULL CHECK (purpose IN ('verify_email', 'reset_password')),
    token_hash  TEXT        NOT NULL UNIQUE,
    email       TEXT,
    expires_at  TIMESTAMPTZ NOT NULL,
    used_at     TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS auth_tokens_user_purpose ON auth_tokens (userid, purpose);
