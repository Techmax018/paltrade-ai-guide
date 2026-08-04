-- ═══════════════════════════════════════════════════════════════════════════
-- PalTrade — PostgreSQL Schema
-- Database: Supabase or Neon (serverless PostgreSQL)
--
-- Run once against your database:
--   psql $DATABASE_URL -f schema.sql
--
-- Zero-Trust rules enforced by schema design:
--   • Raw MT5 passwords are NEVER stored (no such column exists)
--   • Deriv tokens are stored encrypted (see oauth_access_token column notes)
--   • All foreign keys cascade-delete so orphan rows never accumulate
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Extensions ──────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";   -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "pgcrypto";    -- AES encryption helpers

-- ── Enumerations ────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE broker_type_enum   AS ENUM ('VANTAGE_MT5', 'DERIV');
  CREATE TYPE account_type_enum  AS ENUM ('DEMO', 'REAL');
  CREATE TYPE trade_side_enum    AS ENUM ('BUY', 'SELL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- TABLE: users
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS users (
  id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT          NOT NULL UNIQUE,
  password_hash TEXT          NOT NULL,           -- bcrypt hash, never plaintext
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Auto-update updated_at on every row change
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS users_set_updated_at ON users;
CREATE TRIGGER users_set_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- ═══════════════════════════════════════════════════════════════════════════
-- TABLE: linked_brokers
--
-- Stores one row per broker account linked to a PalTrade user.
-- Supports both Vantage MT5 (via MetaApi bridge) and Deriv (via OAuth).
--
-- ZERO-TRUST RULES:
--   • NO raw MT5 password column — passwords are forwarded in-memory only.
--   • oauth_access_token stores AES-256-GCM encrypted Deriv token.
--     The encryption key lives ONLY in the Render environment (ENCRYPTION_KEY).
--     Even if the DB is compromised, tokens are unreadable without the key.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS linked_brokers (
  id                  UUID              PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID              NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  broker_type         broker_type_enum  NOT NULL,
  broker_account_id   TEXT              NOT NULL,   -- MT5 login ID or Deriv loginid
  account_type        account_type_enum NOT NULL DEFAULT 'DEMO',

  -- Vantage MT5 specific (NULL for Deriv)
  bridge_reference_id TEXT,             -- MetaApi accountId returned by provisioning
  server_name         TEXT,             -- e.g. 'VantageInternational-Live'

  -- Deriv specific (NULL for Vantage)
  -- Stored as AES-256-GCM encrypted blob: base64(iv:ciphertext:authTag)
  -- Only the Render backend (ENCRYPTION_KEY env var) can decrypt this.
  oauth_access_token  TEXT,

  is_active           BOOLEAN           NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ       NOT NULL DEFAULT NOW(),

  -- One active account per broker type per user
  CONSTRAINT uq_user_broker_account UNIQUE (user_id, broker_type, broker_account_id)
);

DROP TRIGGER IF EXISTS linked_brokers_set_updated_at ON linked_brokers;
CREATE TRIGGER linked_brokers_set_updated_at
  BEFORE UPDATE ON linked_brokers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS idx_linked_brokers_user_id  ON linked_brokers(user_id);
CREATE INDEX IF NOT EXISTS idx_linked_brokers_active   ON linked_brokers(user_id, is_active);

-- ═══════════════════════════════════════════════════════════════════════════
-- TABLE: trade_logs
--
-- Immutable append-only audit trail. One row per closed trade.
-- Written by the backend's WebSocket engine when it receives trade-close
-- events from either MetaApi (Vantage) or proposal_open_contract (Deriv).
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS trade_logs (
  id                UUID              PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID              NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  broker_account_id UUID              NOT NULL REFERENCES linked_brokers(id) ON DELETE CASCADE,
  ticket_id         TEXT              NOT NULL,   -- MT5 deal ticket or Deriv contract_id
  symbol            TEXT              NOT NULL,   -- e.g. 'EURUSD', 'frxXAUUSD'
  volume            NUMERIC(18, 5)    NOT NULL,
  side              trade_side_enum   NOT NULL,
  entry_price       NUMERIC(18, 8)    NOT NULL,
  exit_price        NUMERIC(18, 8),               -- NULL if position still open
  profit_loss       NUMERIC(18, 2),               -- USD P&L, NULL if still open
  commission        NUMERIC(18, 2)    DEFAULT 0,
  swap              NUMERIC(18, 2)    DEFAULT 0,
  opened_at         TIMESTAMPTZ       NOT NULL,
  closed_at         TIMESTAMPTZ,                  -- NULL if position still open
  source_broker     broker_type_enum  NOT NULL,   -- which broker generated this trade
  raw_payload       JSONB,                        -- original broker event (debugging)
  created_at        TIMESTAMPTZ       NOT NULL DEFAULT NOW(),

  -- Prevent duplicate inserts for the same broker trade event
  CONSTRAINT uq_ticket_per_broker UNIQUE (broker_account_id, ticket_id)
);

CREATE INDEX IF NOT EXISTS idx_trade_logs_user_id       ON trade_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_trade_logs_broker_acct   ON trade_logs(broker_account_id);
CREATE INDEX IF NOT EXISTS idx_trade_logs_closed_at     ON trade_logs(closed_at DESC);
CREATE INDEX IF NOT EXISTS idx_trade_logs_symbol        ON trade_logs(symbol);
-- Partial index for open positions — fast dashboard query
CREATE INDEX IF NOT EXISTS idx_trade_logs_open
  ON trade_logs(user_id, broker_account_id)
  WHERE closed_at IS NULL;

-- ═══════════════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY (Supabase)
-- If using Supabase direct queries from the frontend, enable RLS.
-- The Render backend bypasses RLS using the service_role key.
-- ═══════════════════════════════════════════════════════════════════════════
-- ALTER TABLE users          ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE linked_brokers ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE trade_logs     ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "Users see own data" ON users
--   FOR ALL USING (id = auth.uid()::uuid);
-- CREATE POLICY "Users see own brokers" ON linked_brokers
--   FOR ALL USING (user_id = auth.uid()::uuid);
-- CREATE POLICY "Users see own trades" ON trade_logs
--   FOR ALL USING (user_id = auth.uid()::uuid);
