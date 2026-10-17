-- Auto-trading rules (used by services/app/autoTrading.js and its
-- every-minute job). Only created when missing: an existing table is left
-- exactly as it is.
CREATE TABLE IF NOT EXISTS public.auto_trading_rules (
    id                  SERIAL PRIMARY KEY,
    uid                 UUID        NOT NULL,
    crypto_id           TEXT        NOT NULL,
    enabled             BOOLEAN     NOT NULL DEFAULT TRUE,
    sell_enabled        BOOLEAN     NOT NULL DEFAULT FALSE,
    take_profit_percent NUMERIC,
    sell_amount_type    TEXT        NOT NULL DEFAULT 'percent',
    sell_amount_value   NUMERIC,
    buy_enabled         BOOLEAN     NOT NULL DEFAULT FALSE,
    buy_drop_percent    NUMERIC,
    buy_amount_usdc     NUMERIC,
    reference_price     NUMERIC,
    indicator_type      TEXT,
    indicator_params    JSONB,
    last_triggered_at   TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS auto_trading_rules_uid_idx ON public.auto_trading_rules (uid);
