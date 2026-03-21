-- ============================================================
--  VYAPARI — PRODUCTION DATABASE SETUP
--  setup_production.sql
--
--  Idempotent: safe to run multiple times.
--  Order: extensions → schema → functions → enterprise upgrades
--
--  Usage:
--    psql $DATABASE_URL -f database/setup_production.sql
--
--  On Render / Railway / Supabase:
--    Paste contents into the SQL console, or use the CLI above.
-- ============================================================

-- ── Extensions ────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ============================================================
-- TABLES
-- ============================================================

CREATE TABLE IF NOT EXISTS users (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name            VARCHAR(255) NOT NULL,
  email           VARCHAR(255) NOT NULL,
  phone           VARCHAR(20),
  password_hash   TEXT         NOT NULL,
  avatar_url      TEXT,
  is_active       BOOLEAN      NOT NULL DEFAULT TRUE,
  is_verified     BOOLEAN      NOT NULL DEFAULT FALSE,
  last_login_at   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT users_email_unique UNIQUE (email),
  CONSTRAINT users_email_format CHECK (email ~* '^[^@]+@[^@]+\.[^@]+$')
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token       TEXT        NOT NULL,
  device_info TEXT,
  ip_address  VARCHAR(45),
  expires_at  TIMESTAMPTZ NOT NULL,
  revoked     BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT refresh_tokens_token_unique UNIQUE (token)
);

CREATE TABLE IF NOT EXISTS businesses (
  id                    UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id              UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name                  VARCHAR(255) NOT NULL,
  legal_name            VARCHAR(255),
  business_type         VARCHAR(50)  NOT NULL DEFAULT 'proprietorship',
  gst_number            VARCHAR(20),
  pan_number            VARCHAR(20),
  cin_number            VARCHAR(30),
  tan_number            VARCHAR(20),
  address_line1         TEXT,
  address_line2         TEXT,
  city                  VARCHAR(100),
  state                 VARCHAR(100),
  state_code            VARCHAR(5),
  pincode               VARCHAR(10),
  country               VARCHAR(50)  NOT NULL DEFAULT 'India',
  phone                 VARCHAR(20),
  alternate_phone       VARCHAR(20),
  email                 VARCHAR(255),
  website               VARCHAR(255),
  logo_url              TEXT,
  financial_year_start  DATE,
  currency              VARCHAR(10)  NOT NULL DEFAULT 'INR',
  sale_invoice_prefix   VARCHAR(20)  NOT NULL DEFAULT 'INV',
  sale_invoice_sequence INTEGER      NOT NULL DEFAULT 1,
  purchase_prefix       VARCHAR(20)  NOT NULL DEFAULT 'PUR',
  purchase_sequence     INTEGER      NOT NULL DEFAULT 1,
  receipt_prefix        VARCHAR(20)  NOT NULL DEFAULT 'REC',
  receipt_sequence      INTEGER      NOT NULL DEFAULT 1,
  payment_prefix        VARCHAR(20)  NOT NULL DEFAULT 'PAY',
  payment_sequence      INTEGER      NOT NULL DEFAULT 1,
  voucher_prefix        VARCHAR(20)  NOT NULL DEFAULT 'JV',
  voucher_sequence      INTEGER      NOT NULL DEFAULT 1,
  is_gst_registered     BOOLEAN      NOT NULL DEFAULT TRUE,
  default_tax_type      VARCHAR(10)  NOT NULL DEFAULT 'GST',
  round_off_enabled     BOOLEAN      NOT NULL DEFAULT TRUE,
  is_active             BOOLEAN      NOT NULL DEFAULT TRUE,
  -- Enterprise columns
  lock_date             DATE,
  allow_negative_stock  BOOLEAN      NOT NULL DEFAULT FALSE,
  enable_fy_reset       BOOLEAN      NOT NULL DEFAULT TRUE,
  current_fy_start      DATE,
  default_payment_mode  VARCHAR(30)  DEFAULT 'cash',
  created_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT businesses_type_check CHECK (
    business_type IN ('proprietorship','partnership','llp','pvt_ltd','ltd','huf','trust','other')
  )
);

CREATE TABLE IF NOT EXISTS branches (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id     UUID         NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name            VARCHAR(255) NOT NULL,
  code            VARCHAR(20),
  gst_number      VARCHAR(20),
  address_line1   TEXT,
  address_line2   TEXT,
  city            VARCHAR(100),
  state           VARCHAR(100),
  state_code      VARCHAR(5),
  pincode         VARCHAR(10),
  phone           VARCHAR(20),
  email           VARCHAR(255),
  is_headquarters BOOLEAN      NOT NULL DEFAULT FALSE,
  is_active       BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT branches_code_unique UNIQUE (business_id, code)
);

CREATE TABLE IF NOT EXISTS user_roles (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id  UUID        NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  user_id      UUID        NOT NULL REFERENCES users(id)      ON DELETE CASCADE,
  role         VARCHAR(20) NOT NULL DEFAULT 'staff',
  invited_by   UUID        REFERENCES users(id),
  is_active    BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT user_roles_unique     UNIQUE (business_id, user_id),
  CONSTRAINT user_roles_role_check CHECK  (role IN ('owner','accountant','staff','viewer'))
);

CREATE TABLE IF NOT EXISTS accounts (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id      UUID         NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  parent_id        UUID         REFERENCES accounts(id),
  code             VARCHAR(20)  NOT NULL,
  name             VARCHAR(255) NOT NULL,
  account_type     VARCHAR(20)  NOT NULL,
  account_subtype  VARCHAR(50),
  normal_balance   VARCHAR(5)   NOT NULL DEFAULT 'Dr',
  opening_balance  NUMERIC(15,2) NOT NULL DEFAULT 0,
  opening_balance_type VARCHAR(5) NOT NULL DEFAULT 'Dr',
  is_system        BOOLEAN      NOT NULL DEFAULT FALSE,
  is_active        BOOLEAN      NOT NULL DEFAULT TRUE,
  is_group         BOOLEAN      NOT NULL DEFAULT FALSE,
  bank_name        VARCHAR(100),
  account_number   VARCHAR(50),
  ifsc_code        VARCHAR(20),
  branch_name      VARCHAR(100),
  description      TEXT,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT accounts_code_unique   UNIQUE (business_id, code),
  CONSTRAINT accounts_type_check    CHECK (account_type IN ('Asset','Liability','Equity','Income','Expense')),
  CONSTRAINT accounts_balance_check CHECK (normal_balance IN ('Dr','Cr')),
  CONSTRAINT accounts_ob_type_check CHECK (opening_balance_type IN ('Dr','Cr'))
);

CREATE TABLE IF NOT EXISTS parties (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id      UUID         NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  account_id       UUID         REFERENCES accounts(id),
  name             VARCHAR(255) NOT NULL,
  display_name     VARCHAR(255),
  party_type       VARCHAR(20)  NOT NULL DEFAULT 'customer',
  gst_number       VARCHAR(20),
  pan_number       VARCHAR(20),
  phone            VARCHAR(20),
  alternate_phone  VARCHAR(20),
  email            VARCHAR(255),
  website          VARCHAR(255),
  address_line1    TEXT,
  address_line2    TEXT,
  city             VARCHAR(100),
  state            VARCHAR(100),
  state_code       VARCHAR(5),
  pincode          VARCHAR(10),
  country          VARCHAR(50)  DEFAULT 'India',
  opening_balance  NUMERIC(15,2) NOT NULL DEFAULT 0,
  opening_balance_type VARCHAR(5) NOT NULL DEFAULT 'Dr',
  credit_limit     NUMERIC(15,2) NOT NULL DEFAULT 0,
  credit_days      INTEGER      NOT NULL DEFAULT 0,
  notes            TEXT,
  tags             TEXT[],
  is_active        BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT parties_type_check   CHECK (party_type IN ('customer','supplier','both')),
  CONSTRAINT parties_ob_type_check CHECK (opening_balance_type IN ('Dr','Cr'))
);

CREATE TABLE IF NOT EXISTS items (
  id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id       UUID         NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  account_id        UUID         REFERENCES accounts(id),
  name              VARCHAR(255) NOT NULL,
  sku               VARCHAR(100),
  description       TEXT,
  item_type         VARCHAR(20)  NOT NULL DEFAULT 'goods',
  category          VARCHAR(100),
  hsn_sac_code      VARCHAR(20),
  gst_rate          NUMERIC(5,2) NOT NULL DEFAULT 0,
  cess_rate         NUMERIC(5,2) NOT NULL DEFAULT 0,
  is_tax_inclusive  BOOLEAN      NOT NULL DEFAULT FALSE,
  sale_price        NUMERIC(15,2) NOT NULL DEFAULT 0,
  purchase_price    NUMERIC(15,2) NOT NULL DEFAULT 0,
  mrp               NUMERIC(15,2),
  unit              VARCHAR(50)  NOT NULL DEFAULT 'PCS',
  track_inventory   BOOLEAN      NOT NULL DEFAULT TRUE,
  opening_stock     NUMERIC(15,3) NOT NULL DEFAULT 0,
  current_stock     NUMERIC(15,3) NOT NULL DEFAULT 0,
  min_stock_alert   NUMERIC(15,3) NOT NULL DEFAULT 0,
  max_stock         NUMERIC(15,3),
  image_url         TEXT,
  barcode           VARCHAR(100),
  is_active         BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT items_sku_unique  UNIQUE (business_id, sku),
  CONSTRAINT items_type_check  CHECK (item_type IN ('goods','service')),
  CONSTRAINT items_gst_check   CHECK (gst_rate  >= 0 AND gst_rate  <= 100),
  CONSTRAINT items_cess_check  CHECK (cess_rate >= 0 AND cess_rate <= 100)
);

CREATE TABLE IF NOT EXISTS invoices (
  id                    UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id           UUID          NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  branch_id             UUID          REFERENCES branches(id),
  invoice_type          VARCHAR(20)   NOT NULL DEFAULT 'sale',
  invoice_number        VARCHAR(100)  NOT NULL,
  reference_number      VARCHAR(100),
  party_id              UUID          REFERENCES parties(id),
  party_name            VARCHAR(255)  NOT NULL DEFAULT '',
  party_gst             VARCHAR(20),
  party_pan             VARCHAR(20),
  party_address         TEXT,
  party_city            VARCHAR(100),
  party_state           VARCHAR(100),
  party_state_code      VARCHAR(5),
  party_pincode         VARCHAR(10),
  party_phone           VARCHAR(20),
  party_email           VARCHAR(255),
  invoice_date          DATE          NOT NULL,
  due_date              DATE,
  supply_date           DATE,
  is_inter_state        BOOLEAN       NOT NULL DEFAULT FALSE,
  place_of_supply       VARCHAR(100),
  reverse_charge        BOOLEAN       NOT NULL DEFAULT FALSE,
  subtotal              NUMERIC(15,2) NOT NULL DEFAULT 0,
  total_discount        NUMERIC(15,2) NOT NULL DEFAULT 0,
  taxable_amount        NUMERIC(15,2) NOT NULL DEFAULT 0,
  cgst_amount           NUMERIC(15,2) NOT NULL DEFAULT 0,
  sgst_amount           NUMERIC(15,2) NOT NULL DEFAULT 0,
  igst_amount           NUMERIC(15,2) NOT NULL DEFAULT 0,
  cess_amount           NUMERIC(15,2) NOT NULL DEFAULT 0,
  total_tax             NUMERIC(15,2) NOT NULL DEFAULT 0,
  other_charges         NUMERIC(15,2) NOT NULL DEFAULT 0,
  round_off             NUMERIC(10,4) NOT NULL DEFAULT 0,
  total_amount          NUMERIC(15,2) NOT NULL DEFAULT 0,
  amount_paid           NUMERIC(15,2) NOT NULL DEFAULT 0,
  balance_due           NUMERIC(15,2) NOT NULL DEFAULT 0,
  status                VARCHAR(20)   NOT NULL DEFAULT 'unpaid',
  voucher_id            UUID,
  notes                 TEXT,
  terms_and_conditions  TEXT,
  created_by            UUID          REFERENCES users(id),
  updated_by            UUID          REFERENCES users(id),
  cancelled_by          UUID          REFERENCES users(id),
  cancelled_at          TIMESTAMPTZ,
  cancellation_reason   TEXT,
  created_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  CONSTRAINT invoices_number_unique UNIQUE (business_id, invoice_type, invoice_number),
  CONSTRAINT invoices_type_check    CHECK (invoice_type IN ('sale','purchase','credit_note','debit_note')),
  CONSTRAINT invoices_status_check  CHECK (status IN ('draft','unpaid','partial','paid','cancelled','overdue'))
);

CREATE TABLE IF NOT EXISTS invoice_items (
  id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id       UUID          NOT NULL REFERENCES invoices(id)  ON DELETE CASCADE,
  item_id          UUID          REFERENCES items(id),
  item_name        VARCHAR(255)  NOT NULL,
  description      TEXT,
  hsn_sac_code     VARCHAR(20),
  unit             VARCHAR(50)   NOT NULL DEFAULT 'PCS',
  quantity         NUMERIC(15,3) NOT NULL,
  rate             NUMERIC(15,2) NOT NULL,
  discount_percent NUMERIC(5,2)  NOT NULL DEFAULT 0,
  discount_amount  NUMERIC(15,2) NOT NULL DEFAULT 0,
  taxable_amount   NUMERIC(15,2) NOT NULL,
  gst_rate         NUMERIC(5,2)  NOT NULL DEFAULT 0,
  cgst_rate        NUMERIC(5,2)  NOT NULL DEFAULT 0,
  cgst_amount      NUMERIC(15,2) NOT NULL DEFAULT 0,
  sgst_rate        NUMERIC(5,2)  NOT NULL DEFAULT 0,
  sgst_amount      NUMERIC(15,2) NOT NULL DEFAULT 0,
  igst_rate        NUMERIC(5,2)  NOT NULL DEFAULT 0,
  igst_amount      NUMERIC(15,2) NOT NULL DEFAULT 0,
  cess_rate        NUMERIC(5,2)  NOT NULL DEFAULT 0,
  cess_amount      NUMERIC(15,2) NOT NULL DEFAULT 0,
  total            NUMERIC(15,2) NOT NULL,
  sort_order       INTEGER       NOT NULL DEFAULT 0,
  CONSTRAINT invoice_items_qty_positive  CHECK (quantity > 0),
  CONSTRAINT invoice_items_rate_positive CHECK (rate >= 0),
  CONSTRAINT invoice_items_disc_range    CHECK (discount_percent >= 0 AND discount_percent <= 100)
);

CREATE TABLE IF NOT EXISTS vouchers (
  id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id   UUID          NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  branch_id     UUID          REFERENCES branches(id),
  voucher_type  VARCHAR(20)   NOT NULL,
  voucher_number VARCHAR(100),
  invoice_id    UUID          REFERENCES invoices(id),
  payment_id    UUID,
  voucher_date  DATE          NOT NULL,
  narration     TEXT,
  reference     VARCHAR(255),
  total_debit   NUMERIC(15,2) NOT NULL DEFAULT 0,
  total_credit  NUMERIC(15,2) NOT NULL DEFAULT 0,
  is_balanced   BOOLEAN       NOT NULL DEFAULT FALSE,
  is_posted     BOOLEAN       NOT NULL DEFAULT TRUE,
  is_reversed   BOOLEAN       NOT NULL DEFAULT FALSE,
  reversed_by   UUID          REFERENCES vouchers(id),
  created_by    UUID          REFERENCES users(id),
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  CONSTRAINT vouchers_type_check CHECK (
    voucher_type IN ('Journal','Sales','Purchase','Receipt','Payment','Contra','CreditNote','DebitNote')
  )
);

CREATE TABLE IF NOT EXISTS ledger_entries (
  id             UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  voucher_id     UUID          NOT NULL REFERENCES vouchers(id) ON DELETE CASCADE,
  business_id    UUID          NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  account_id     UUID          NOT NULL REFERENCES accounts(id),
  account_code   VARCHAR(20),
  account_name   VARCHAR(255),
  account_type   VARCHAR(20),
  debit          NUMERIC(15,2) NOT NULL DEFAULT 0,
  credit         NUMERIC(15,2) NOT NULL DEFAULT 0,
  running_balance NUMERIC(15,2),
  narration      TEXT,
  party_id       UUID          REFERENCES parties(id),
  invoice_id     UUID          REFERENCES invoices(id),
  sort_order     INTEGER       NOT NULL DEFAULT 0,
  entry_date     DATE          NOT NULL,
  CONSTRAINT ledger_entries_debit_check  CHECK (debit  >= 0),
  CONSTRAINT ledger_entries_credit_check CHECK (credit >= 0),
  CONSTRAINT ledger_entries_nonzero      CHECK (debit > 0 OR credit > 0),
  CONSTRAINT ledger_entries_not_both     CHECK (NOT (debit > 0 AND credit > 0))
);

CREATE TABLE IF NOT EXISTS payments (
  id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id      UUID          NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  branch_id        UUID          REFERENCES branches(id),
  payment_type     VARCHAR(20)   NOT NULL,
  payment_number   VARCHAR(100),
  party_id         UUID          REFERENCES parties(id),
  party_name       VARCHAR(255),
  payment_date     DATE          NOT NULL,
  amount           NUMERIC(15,2) NOT NULL,
  payment_mode     VARCHAR(30)   NOT NULL DEFAULT 'cash',
  bank_account_id  UUID          REFERENCES accounts(id),
  cheque_number    VARCHAR(50),
  cheque_date      DATE,
  transaction_id   VARCHAR(100),
  voucher_id       UUID          REFERENCES vouchers(id),
  narration        TEXT,
  reference        VARCHAR(255),
  status           VARCHAR(20)   NOT NULL DEFAULT 'cleared',
  created_by       UUID          REFERENCES users(id),
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  CONSTRAINT payments_type_check   CHECK (payment_type  IN ('receipt','payment')),
  CONSTRAINT payments_mode_check   CHECK (payment_mode  IN ('cash','bank','upi','cheque','neft','rtgs','card','other')),
  CONSTRAINT payments_status_check CHECK (status        IN ('cleared','bounced','cancelled')),
  CONSTRAINT payments_amount_check CHECK (amount > 0)
);

ALTER TABLE vouchers
  ADD COLUMN IF NOT EXISTS payment_id_fk UUID REFERENCES payments(id);

CREATE TABLE IF NOT EXISTS payment_allocations (
  id           UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id   UUID          NOT NULL REFERENCES payments(id)  ON DELETE CASCADE,
  invoice_id   UUID          NOT NULL REFERENCES invoices(id)  ON DELETE CASCADE,
  amount       NUMERIC(15,2) NOT NULL,
  created_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  CONSTRAINT payment_alloc_unique UNIQUE (payment_id, invoice_id),
  CONSTRAINT payment_alloc_amount CHECK (amount > 0)
);

CREATE TABLE IF NOT EXISTS expenses (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id     UUID          NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  branch_id       UUID          REFERENCES branches(id),
  expense_date    DATE          NOT NULL,
  category        VARCHAR(100)  NOT NULL DEFAULT 'General',
  description     TEXT          NOT NULL,
  amount          NUMERIC(15,2) NOT NULL,
  gst_amount      NUMERIC(15,2) NOT NULL DEFAULT 0,
  total_amount    NUMERIC(15,2) NOT NULL,
  expense_account_id UUID       REFERENCES accounts(id),
  pay_account_id  UUID          REFERENCES accounts(id),
  voucher_id      UUID          REFERENCES vouchers(id),
  payment_mode    VARCHAR(30)   NOT NULL DEFAULT 'cash',
  reference       VARCHAR(255),
  receipt_url     TEXT,
  created_by      UUID          REFERENCES users(id),
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  CONSTRAINT expenses_amount_check CHECK (amount > 0)
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id   UUID          REFERENCES businesses(id) ON DELETE SET NULL,
  user_id       UUID          REFERENCES users(id)      ON DELETE SET NULL,
  action        VARCHAR(50)   NOT NULL,
  entity        VARCHAR(50)   NOT NULL,
  entity_id     UUID,
  old_values    JSONB,
  new_values    JSONB,
  changed_fields TEXT[],
  ip_address    VARCHAR(45),
  user_agent    TEXT,
  notes         TEXT,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sync_queue (
  id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id   UUID          NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  client_id     VARCHAR(100)  NOT NULL,
  entity        VARCHAR(50)   NOT NULL,
  operation     VARCHAR(10)   NOT NULL,
  entity_id     UUID,
  local_id      VARCHAR(100),
  payload       JSONB         NOT NULL,
  conflict      BOOLEAN       NOT NULL DEFAULT FALSE,
  conflict_data JSONB,
  synced        BOOLEAN       NOT NULL DEFAULT FALSE,
  synced_at     TIMESTAMPTZ,
  error_message TEXT,
  retry_count   INTEGER       NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  CONSTRAINT sync_queue_op_check CHECK (operation IN ('create','update','delete'))
);

CREATE TABLE IF NOT EXISTS fy_sequences (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id  UUID        NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  seq_type     VARCHAR(20) NOT NULL,
  fy_year      INTEGER     NOT NULL,
  prefix       VARCHAR(20) NOT NULL,
  last_seq     INTEGER     NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fy_sequences_unique UNIQUE (business_id, seq_type, fy_year)
);

CREATE TABLE IF NOT EXISTS fy_opening_balances (
  id           UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id  UUID          NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  account_id   UUID          NOT NULL REFERENCES accounts(id)   ON DELETE CASCADE,
  fy_year      INTEGER       NOT NULL,
  opening_dr   NUMERIC(15,2) NOT NULL DEFAULT 0,
  opening_cr   NUMERIC(15,2) NOT NULL DEFAULT 0,
  is_finalized BOOLEAN       NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  CONSTRAINT fy_ob_unique UNIQUE (business_id, account_id, fy_year)
);

CREATE TABLE IF NOT EXISTS backup_log (
  id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id   UUID          REFERENCES businesses(id) ON DELETE SET NULL,
  initiated_by  UUID          REFERENCES users(id)      ON DELETE SET NULL,
  backup_type   VARCHAR(20)   NOT NULL DEFAULT 'full',
  status        VARCHAR(20)   NOT NULL DEFAULT 'pending',
  file_path     TEXT,
  file_size_kb  INTEGER,
  row_counts    JSONB,
  error_message TEXT,
  started_at    TIMESTAMPTZ,
  completed_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS stock_movements (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id     UUID          NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  item_id         UUID          NOT NULL REFERENCES items(id)      ON DELETE CASCADE,
  movement_type   VARCHAR(20)   NOT NULL,
  reference_type  VARCHAR(20),
  reference_id    UUID,
  quantity        NUMERIC(15,3) NOT NULL,
  quantity_before NUMERIC(15,3) NOT NULL DEFAULT 0,
  quantity_after  NUMERIC(15,3) NOT NULL DEFAULT 0,
  unit_cost       NUMERIC(15,2),
  narration       TEXT,
  movement_date   DATE          NOT NULL,
  created_by      UUID          REFERENCES users(id),
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  CONSTRAINT stock_mv_type_check CHECK (
    movement_type IN ('purchase','sale','adjustment','opening','return','write_off')
  )
);

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_users_email             ON users (email);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user     ON refresh_tokens (user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token    ON refresh_tokens (token);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires  ON refresh_tokens (expires_at);
CREATE INDEX IF NOT EXISTS idx_businesses_owner        ON businesses (owner_id);
CREATE INDEX IF NOT EXISTS idx_branches_business       ON branches (business_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_business     ON user_roles (business_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_user         ON user_roles (user_id);
CREATE INDEX IF NOT EXISTS idx_accounts_business       ON accounts (business_id);
CREATE INDEX IF NOT EXISTS idx_accounts_type           ON accounts (business_id, account_type);
CREATE INDEX IF NOT EXISTS idx_parties_business        ON parties (business_id);
CREATE INDEX IF NOT EXISTS idx_parties_type            ON parties (business_id, party_type);
CREATE INDEX IF NOT EXISTS idx_parties_name_trgm       ON parties USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_parties_name_lower      ON parties (business_id, lower(name));
CREATE INDEX IF NOT EXISTS idx_items_business          ON items (business_id);
CREATE INDEX IF NOT EXISTS idx_items_name_trgm         ON items USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_items_name_lower        ON items (business_id, lower(name));
CREATE INDEX IF NOT EXISTS idx_invoices_business       ON invoices (business_id);
CREATE INDEX IF NOT EXISTS idx_invoices_party          ON invoices (party_id) WHERE party_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_biz_type_date  ON invoices (business_id, invoice_type, invoice_date DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_biz_status     ON invoices (business_id, invoice_type, status) WHERE status NOT IN ('cancelled','paid');
CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice   ON invoice_items (invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_items_cover     ON invoice_items (invoice_id, taxable_amount, cgst_amount, sgst_amount, igst_amount);
CREATE INDEX IF NOT EXISTS idx_vouchers_business       ON vouchers (business_id);
CREATE INDEX IF NOT EXISTS idx_vouchers_biz_date       ON vouchers (business_id, voucher_date DESC) WHERE is_posted = TRUE;
CREATE INDEX IF NOT EXISTS idx_ledger_voucher          ON ledger_entries (voucher_id);
CREATE INDEX IF NOT EXISTS idx_ledger_account          ON ledger_entries (account_id);
CREATE INDEX IF NOT EXISTS idx_ledger_business         ON ledger_entries (business_id);
CREATE INDEX IF NOT EXISTS idx_ledger_acct_date_biz    ON ledger_entries (account_id, entry_date DESC, business_id);
CREATE INDEX IF NOT EXISTS idx_payments_business       ON payments (business_id);
CREATE INDEX IF NOT EXISTS idx_payments_date           ON payments (business_id, payment_date DESC);
CREATE INDEX IF NOT EXISTS idx_payment_alloc_invoice   ON payment_allocations (invoice_id, payment_id);
CREATE INDEX IF NOT EXISTS idx_expenses_business       ON expenses (business_id);
CREATE INDEX IF NOT EXISTS idx_expenses_date           ON expenses (business_id, expense_date DESC);
CREATE INDEX IF NOT EXISTS idx_audit_business          ON audit_logs (business_id);
CREATE INDEX IF NOT EXISTS idx_audit_date              ON audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fy_seq_business         ON fy_sequences (business_id);
CREATE INDEX IF NOT EXISTS idx_stock_mv_item_date      ON stock_movements (item_id, movement_date DESC);

-- ============================================================
-- TRIGGERS: updated_at
-- ============================================================

CREATE OR REPLACE FUNCTION fn_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  CREATE TRIGGER trg_users_updated_at         BEFORE UPDATE ON users         FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TRIGGER trg_businesses_updated_at    BEFORE UPDATE ON businesses    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TRIGGER trg_branches_updated_at      BEFORE UPDATE ON branches      FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TRIGGER trg_parties_updated_at       BEFORE UPDATE ON parties       FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TRIGGER trg_items_updated_at         BEFORE UPDATE ON items         FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TRIGGER trg_invoices_updated_at      BEFORE UPDATE ON invoices      FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TRIGGER trg_user_roles_updated_at    BEFORE UPDATE ON user_roles    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- TRIGGER: payment allocation → update invoice status
-- ============================================================

CREATE OR REPLACE FUNCTION fn_update_invoice_payment_status()
RETURNS TRIGGER AS $$
DECLARE
  v_invoice_id UUID;
  v_total      NUMERIC(15,2);
  v_paid       NUMERIC(15,2);
BEGIN
  v_invoice_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.invoice_id ELSE NEW.invoice_id END;
  SELECT total_amount INTO v_total FROM invoices WHERE id = v_invoice_id;
  SELECT COALESCE(SUM(amount), 0) INTO v_paid FROM payment_allocations WHERE invoice_id = v_invoice_id;
  UPDATE invoices SET
    amount_paid = v_paid,
    balance_due = GREATEST(0, v_total - v_paid),
    status = CASE
      WHEN v_paid <= 0                  THEN 'unpaid'
      WHEN v_paid >= v_total - 0.01     THEN 'paid'
      ELSE 'partial' END,
    updated_at = NOW()
  WHERE id = v_invoice_id;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  CREATE TRIGGER trg_payment_alloc_insert AFTER INSERT ON payment_allocations FOR EACH ROW EXECUTE FUNCTION fn_update_invoice_payment_status();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TRIGGER trg_payment_alloc_delete AFTER DELETE ON payment_allocations FOR EACH ROW EXECUTE FUNCTION fn_update_invoice_payment_status();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TRIGGER trg_payment_alloc_update AFTER UPDATE OF amount ON payment_allocations FOR EACH ROW EXECUTE FUNCTION fn_update_invoice_payment_status();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- TRIGGER: stock adjustment on invoice_items (with negative-stock guard)
-- ============================================================

CREATE OR REPLACE FUNCTION fn_adjust_item_stock()
RETURNS TRIGGER AS $$
DECLARE
  v_invoice_type   VARCHAR(20);
  v_delta          NUMERIC(15,3);
  v_current        NUMERIC(15,3);
  v_allow_neg      BOOLEAN;
  v_item_name      VARCHAR(255);
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT invoice_type INTO v_invoice_type FROM invoices WHERE id = NEW.invoice_id;
    v_delta := CASE WHEN v_invoice_type = 'sale' THEN -NEW.quantity ELSE NEW.quantity END;

    SELECT i.current_stock, i.name, b.allow_negative_stock
    INTO   v_current, v_item_name, v_allow_neg
    FROM   items i JOIN businesses b ON b.id = i.business_id
    WHERE  i.id = NEW.item_id AND i.track_inventory = TRUE;

    IF FOUND THEN
      IF v_delta < 0 AND (v_current + v_delta) < 0 AND NOT v_allow_neg THEN
        RAISE EXCEPTION 'Insufficient stock for item "%". Available: %, Required: %',
          v_item_name, v_current, ABS(v_delta) USING ERRCODE = 'P0001';
      END IF;
      UPDATE items SET current_stock = current_stock + v_delta, updated_at = NOW()
      WHERE id = NEW.item_id AND track_inventory = TRUE;
    END IF;
    RETURN NEW;

  ELSIF TG_OP = 'DELETE' THEN
    SELECT invoice_type INTO v_invoice_type FROM invoices WHERE id = OLD.invoice_id;
    v_delta := CASE WHEN v_invoice_type = 'sale' THEN OLD.quantity ELSE -OLD.quantity END;
    UPDATE items SET current_stock = current_stock + v_delta, updated_at = NOW()
    WHERE id = OLD.item_id AND track_inventory = TRUE;
    RETURN OLD;
  END IF;
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  CREATE TRIGGER trg_invoice_items_stock_insert AFTER INSERT ON invoice_items FOR EACH ROW WHEN (NEW.item_id IS NOT NULL) EXECUTE FUNCTION fn_adjust_item_stock();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TRIGGER trg_invoice_items_stock_delete AFTER DELETE ON invoice_items FOR EACH ROW WHEN (OLD.item_id IS NOT NULL) EXECUTE FUNCTION fn_adjust_item_stock();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- FUNCTION: Chart of Accounts seed (called on business create)
-- ============================================================

CREATE OR REPLACE FUNCTION fn_seed_chart_of_accounts(p_business_id UUID)
RETURNS VOID AS $$
BEGIN
  INSERT INTO accounts (business_id, code, name, account_type, account_subtype, normal_balance, is_system, is_group)
  VALUES
    (p_business_id,'1000','Current Assets',         'Asset','Current Asset',     'Dr',TRUE, TRUE),
    (p_business_id,'1001','Cash in Hand',            'Asset','Current Asset',     'Dr',TRUE, FALSE),
    (p_business_id,'1002','Bank Account',            'Asset','Current Asset',     'Dr',TRUE, FALSE),
    (p_business_id,'1003','Petty Cash',              'Asset','Current Asset',     'Dr',FALSE,FALSE),
    (p_business_id,'1010','Accounts Receivable',     'Asset','Current Asset',     'Dr',TRUE, FALSE),
    (p_business_id,'1020','Stock / Inventory',       'Asset','Current Asset',     'Dr',TRUE, FALSE),
    (p_business_id,'1030','GST Input Credit',        'Asset','Current Asset',     'Dr',TRUE, FALSE),
    (p_business_id,'1031','CGST Input',              'Asset','Current Asset',     'Dr',TRUE, FALSE),
    (p_business_id,'1032','SGST Input',              'Asset','Current Asset',     'Dr',TRUE, FALSE),
    (p_business_id,'1033','IGST Input',              'Asset','Current Asset',     'Dr',TRUE, FALSE),
    (p_business_id,'1040','Prepaid Expenses',        'Asset','Current Asset',     'Dr',FALSE,FALSE),
    (p_business_id,'1100','Fixed Assets',            'Asset','Fixed Asset',       'Dr',FALSE,TRUE),
    (p_business_id,'1101','Plant & Machinery',       'Asset','Fixed Asset',       'Dr',FALSE,FALSE),
    (p_business_id,'1102','Furniture & Fixtures',    'Asset','Fixed Asset',       'Dr',FALSE,FALSE),
    (p_business_id,'1103','Computer & Equipment',    'Asset','Fixed Asset',       'Dr',FALSE,FALSE),
    (p_business_id,'2000','Current Liabilities',     'Liability','Current Liability','Cr',TRUE, TRUE),
    (p_business_id,'2001','Accounts Payable',        'Liability','Current Liability','Cr',TRUE, FALSE),
    (p_business_id,'2010','GST Payable (Output)',    'Liability','Current Liability','Cr',TRUE, FALSE),
    (p_business_id,'2011','CGST Output',             'Liability','Current Liability','Cr',TRUE, FALSE),
    (p_business_id,'2012','SGST Output',             'Liability','Current Liability','Cr',TRUE, FALSE),
    (p_business_id,'2013','IGST Output',             'Liability','Current Liability','Cr',TRUE, FALSE),
    (p_business_id,'2014','GST Net Payable',         'Liability','Current Liability','Cr',TRUE, FALSE),
    (p_business_id,'2020','TDS Payable',             'Liability','Current Liability','Cr',FALSE,FALSE),
    (p_business_id,'2030','Salary Payable',          'Liability','Current Liability','Cr',FALSE,FALSE),
    (p_business_id,'2100','Long-term Liabilities',   'Liability','Long-term Liability','Cr',FALSE,TRUE),
    (p_business_id,'2101','Bank Loan',               'Liability','Long-term Liability','Cr',FALSE,FALSE),
    (p_business_id,'3000','Equity',                  'Equity','Capital',          'Cr',TRUE, TRUE),
    (p_business_id,'3001','Owner Capital',           'Equity','Capital',          'Cr',TRUE, FALSE),
    (p_business_id,'3003','Retained Earnings',       'Equity','Retained Earnings','Cr',TRUE, FALSE),
    (p_business_id,'3004','Drawings',                'Equity','Drawings',         'Dr',FALSE,FALSE),
    (p_business_id,'4000','Income',                  'Income','Operating Income', 'Cr',TRUE, TRUE),
    (p_business_id,'4001','Sales Revenue',           'Income','Operating Income', 'Cr',TRUE, FALSE),
    (p_business_id,'4002','Service Revenue',         'Income','Operating Income', 'Cr',FALSE,FALSE),
    (p_business_id,'4010','Other Income',            'Income','Other Income',     'Cr',FALSE,TRUE),
    (p_business_id,'4011','Interest Received',       'Income','Other Income',     'Cr',FALSE,FALSE),
    (p_business_id,'5000','Expenses',                'Expense','Direct Expense',  'Dr',TRUE, TRUE),
    (p_business_id,'5001','Cost of Goods Sold',      'Expense','Direct Expense',  'Dr',TRUE, FALSE),
    (p_business_id,'5002','Purchase Returns',        'Expense','Direct Expense',  'Cr',FALSE,FALSE),
    (p_business_id,'5010','Indirect Expenses',       'Expense','Indirect Expense','Dr',FALSE,TRUE),
    (p_business_id,'5011','Salaries & Wages',        'Expense','Indirect Expense','Dr',FALSE,FALSE),
    (p_business_id,'5012','Rent',                    'Expense','Indirect Expense','Dr',FALSE,FALSE),
    (p_business_id,'5013','Electricity & Utilities', 'Expense','Indirect Expense','Dr',FALSE,FALSE),
    (p_business_id,'5014','Transport & Delivery',    'Expense','Indirect Expense','Dr',FALSE,FALSE),
    (p_business_id,'5015','Telephone & Internet',    'Expense','Indirect Expense','Dr',FALSE,FALSE),
    (p_business_id,'5016','Office Supplies',         'Expense','Indirect Expense','Dr',FALSE,FALSE),
    (p_business_id,'5017','Advertisement',           'Expense','Indirect Expense','Dr',FALSE,FALSE),
    (p_business_id,'5018','Repairs & Maintenance',   'Expense','Indirect Expense','Dr',FALSE,FALSE),
    (p_business_id,'5019','Insurance',               'Expense','Indirect Expense','Dr',FALSE,FALSE),
    (p_business_id,'5020','Professional Fees',       'Expense','Indirect Expense','Dr',FALSE,FALSE),
    (p_business_id,'5021','Bank Charges',            'Expense','Indirect Expense','Dr',FALSE,FALSE),
    (p_business_id,'5022','Discount Allowed',        'Expense','Indirect Expense','Dr',FALSE,FALSE),
    (p_business_id,'5030','Depreciation',            'Expense','Indirect Expense','Dr',FALSE,FALSE),
    (p_business_id,'5031','Interest on Loans',       'Expense','Finance Cost',    'Dr',FALSE,FALSE),
    (p_business_id,'5032','Miscellaneous Expenses',  'Expense','Indirect Expense','Dr',FALSE,FALSE),
    (p_business_id,'5033','Round Off',               'Expense','Indirect Expense','Dr',TRUE, FALSE)
  ON CONFLICT (business_id, code) DO NOTHING;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- FUNCTION: FY-aware invoice/voucher number generation
-- ============================================================

CREATE OR REPLACE FUNCTION fn_next_invoice_number(
  p_business_id UUID,
  p_type        VARCHAR,
  p_fy_year     INTEGER DEFAULT NULL
)
RETURNS VARCHAR AS $$
DECLARE
  v_prefix    VARCHAR(20);
  v_seq       INTEGER;
  v_fy        INTEGER;
  v_enable_fy BOOLEAN;
  v_number    VARCHAR(100);
BEGIN
  SELECT enable_fy_reset,
         EXTRACT(YEAR FROM COALESCE(current_fy_start,
           CASE WHEN EXTRACT(MONTH FROM CURRENT_DATE) >= 4
                THEN DATE_TRUNC('year', CURRENT_DATE)
                ELSE DATE_TRUNC('year', CURRENT_DATE) - INTERVAL '1 year' END))::INTEGER
  INTO   v_enable_fy, v_fy
  FROM   businesses WHERE id = p_business_id;

  v_fy := COALESCE(p_fy_year, v_fy);

  SELECT CASE p_type
    WHEN 'sale'     THEN sale_invoice_prefix
    WHEN 'purchase' THEN purchase_prefix
    WHEN 'receipt'  THEN receipt_prefix
    WHEN 'payment'  THEN payment_prefix
    ELSE                 voucher_prefix
  END INTO v_prefix FROM businesses WHERE id = p_business_id;

  IF v_enable_fy THEN
    INSERT INTO fy_sequences (business_id, seq_type, fy_year, prefix, last_seq)
    VALUES (p_business_id, p_type, v_fy, v_prefix, 0)
    ON CONFLICT (business_id, seq_type, fy_year) DO NOTHING;

    UPDATE fy_sequences
    SET last_seq = last_seq + 1
    WHERE business_id = p_business_id AND seq_type = p_type AND fy_year = v_fy
    RETURNING last_seq, prefix INTO v_seq, v_prefix;

    v_number := v_prefix || '/' || v_fy || '-' ||
                LPAD(((v_fy + 1) % 100)::TEXT, 2, '0') || '/' ||
                LPAD(v_seq::TEXT, 5, '0');
  ELSE
    CASE p_type
      WHEN 'sale' THEN
        UPDATE businesses SET sale_invoice_sequence = sale_invoice_sequence + 1
        WHERE id = p_business_id RETURNING sale_invoice_sequence, sale_invoice_prefix INTO v_seq, v_prefix;
      WHEN 'purchase' THEN
        UPDATE businesses SET purchase_sequence = purchase_sequence + 1
        WHERE id = p_business_id RETURNING purchase_sequence, purchase_prefix INTO v_seq, v_prefix;
      WHEN 'receipt' THEN
        UPDATE businesses SET receipt_sequence = receipt_sequence + 1
        WHERE id = p_business_id RETURNING receipt_sequence, receipt_prefix INTO v_seq, v_prefix;
      WHEN 'payment' THEN
        UPDATE businesses SET payment_sequence = payment_sequence + 1
        WHERE id = p_business_id RETURNING payment_sequence, payment_prefix INTO v_seq, v_prefix;
      ELSE
        UPDATE businesses SET voucher_sequence = voucher_sequence + 1
        WHERE id = p_business_id RETURNING voucher_sequence, voucher_prefix INTO v_seq, v_prefix;
    END CASE;
    v_number := v_prefix || '-' || LPAD(v_seq::TEXT, 5, '0');
  END IF;
  RETURN v_number;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- Done. Run backend/scripts/dbSeed.js to add demo data.
-- ============================================================
