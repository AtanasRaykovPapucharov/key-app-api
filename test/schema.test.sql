-- Minimal copy of the production tables, reconstructed from the columns the
-- code uses. FOR TESTS ONLY — production already has these tables.
DROP TABLE IF EXISTS auth_tokens, schema_migrations, portfolio, users CASCADE;
CREATE TABLE users (
    userid   SERIAL PRIMARY KEY,
    uid      UUID UNIQUE NOT NULL,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    admin    BOOLEAN NOT NULL DEFAULT FALSE,
    avatar   TEXT,
    deleted  BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE TABLE portfolio (
    id            SERIAL PRIMARY KEY,
    user_id       INTEGER,
    uid           UUID,
    crypto        JSONB,
    fiat_curr     TEXT,
    fiat_amount   NUMERIC,
    stable_curr   TEXT,
    stable_amount NUMERIC,
    watch_list    JSONB
);
