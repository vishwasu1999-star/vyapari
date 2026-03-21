-- ============================================================
--  VYAPARI APP — COMPLETE POSTGRESQL SCHEMA
--  Version: 1.0.0
--  Run order: 001_schema.sql → 002_functions.sql → 003_seed.sql
-- ============================================================

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "pg_trgm";    -- trigram indexes for fast ILIKE search

-- ============================================================
-- 1. USERS
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

CREATE INDEX idx_users_email ON users (email);

-- ============================================================
-- 2. REFRESH TOKENS  (auth)
-- ============================================================
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

CREATE INDEX idx_refresh_tokens_user     ON refresh_tokens (user_id);
CREATE INDEX idx_refresh_tokens_token    ON refresh_tokens (token);
CREATE INDEX idx_refresh_tokens_expires  ON refresh_tokens (expires_at);

-- ============================================================
-- 3. BUSINESSES
-- ============================================================
CREATE TABLE IF NOT EXISTS businesses (
  id                    UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id              UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name                  VARCHAR(255) NOT NULL,
  legal_name            VARCHAR(255),
  business_type         VARCHAR(50)  NOT NULL DEFAULT 'proprietorship',
  -- Registration / Tax
  gst_number            VARCHAR(20),
  pan_number            VARCHAR(20),
  cin_number            VARCHAR(30),
  tan_number            VARCHAR(20),
  -- Address
  address_line1         TEXT,
  address_line2         TEXT,
  city                  VARCHAR(100),
  state                 VARCHAR(100),
  state_code            VARCHAR(5),
  pincode               VARCHAR(10),
  country               VARCHAR(50)  NOT NULL DEFAULT 'India',
  -- Contact
  phone                 VARCHAR(20),
  alternate_phone       VARCHAR(20),
  email                 VARCHAR(255),
  website               VARCHAR(255),
  -- Branding
  logo_url              TEXT,
  -- Financial config
  financial_year_start  DATE,
  currency              VARCHAR(10)  NOT NULL DEFAULT 'INR',
  -- Invoice numbering
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
  -- Settings
  is_gst_registered     BOOLEAN      NOT NULL DEFAULT TRUE,
  default_tax_type      VARCHAR(10)  NOT NULL DEFAULT 'GST',  -- GST | EXEMPT | COMPOSITION
  round_off_enabled     BOOLEAN      NOT NULL DEFAULT TRUE,
  is_active             BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  CONSTRAINT businesses_type_check CHECK (
    business_type IN ('proprietorship','partnership','llp','pvt_ltd','ltd','huf','trust','other')
  )
);

CREATE INDEX idx_businesses_owner  ON businesses (owner_id);
CREATE INDEX idx_businesses_gst    ON businesses (gst_number) WHERE gst_number IS NOT NULL;

-- ============================================================
-- 4. BRANCHES
-- ============================================================
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

CREATE INDEX idx_branches_business ON branches (business_id);

-- ============================================================
-- 5. CHART OF ACCOUNTS
-- ============================================================
CREATE TABLE IF NOT EXISTS accounts (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id      UUID         NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  parent_id        UUID         REFERENCES accounts(id),
  code             VARCHAR(20)  NOT NULL,
  name             VARCHAR(255) NOT NULL,
  -- Classification
  account_type     VARCHAR(20)  NOT NULL, -- Asset | Liability | Equity | Income | Expense
  account_subtype  VARCHAR(50),           -- Current Asset | Fixed Asset | Current Liability …
  -- Balance
  normal_balance   VARCHAR(5)   NOT NULL DEFAULT 'Dr', -- Dr | Cr
  opening_balance  NUMERIC(15,2) NOT NULL DEFAULT 0,
  opening_balance_type VARCHAR(5) NOT NULL DEFAULT 'Dr',
  -- Flags
  is_system        BOOLEAN      NOT NULL DEFAULT FALSE,  -- system accounts cannot be deleted
  is_active        BOOLEAN      NOT NULL DEFAULT TRUE,
  is_group         BOOLEAN      NOT NULL DEFAULT FALSE,  -- group/ledger distinction
  -- Bank details (for bank accounts)
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

CREATE INDEX idx_accounts_business ON accounts (business_id);
CREATE INDEX idx_accounts_type     ON accounts (business_id, account_type);
CREATE INDEX idx_accounts_parent   ON accounts (parent_id) WHERE parent_id IS NOT NULL;

-- ============================================================
-- 6. PARTIES  (Customers & Suppliers)
-- ============================================================
CREATE TABLE IF NOT EXISTS parties (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id      UUID         NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  account_id       UUID         REFERENCES accounts(id),  -- linked ledger account
  -- Identity
  name             VARCHAR(255) NOT NULL,
  display_name     VARCHAR(255),
  party_type       VARCHAR(20)  NOT NULL DEFAULT 'customer', -- customer | supplier | both
  -- Registration
  gst_number       VARCHAR(20),
  pan_number       VARCHAR(20),
  -- Address
  address_line1    TEXT,
  address_line2    TEXT,
  city             VARCHAR(100),
  state            VARCHAR(100),
  state_code       VARCHAR(5),
  pincode          VARCHAR(10),
  country          VARCHAR(50)  DEFAULT 'India',
  -- Contact
  phone            VARCHAR(20),
  alternate_phone  VARCHAR(20),
  email            VARCHAR(255),
  website          VARCHAR(255),
  -- Financial
  opening_balance  NUMERIC(15,2) NOT NULL DEFAULT 0,
  opening_balance_type VARCHAR(5) NOT NULL DEFAULT 'Dr',
  credit_limit     NUMERIC(15,2) NOT NULL DEFAULT 0,
  credit_days      INTEGER      NOT NULL DEFAULT 0,
  -- Metadata
  notes            TEXT,
  tags             TEXT[],
  is_active        BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  CONSTRAINT parties_type_check CHECK (party_type IN ('customer','supplier','both')),
  CONSTRAINT parties_ob_type_check CHECK (opening_balance_type IN ('Dr','Cr'))
);

CREATE INDEX idx_parties_business  ON parties (business_id);
CREATE INDEX idx_parties_type      ON parties (business_id, party_type);
CREATE INDEX idx_parties_gst       ON parties (gst_number) WHERE gst_number IS NOT NULL;
CREATE INDEX idx_parties_name_trgm ON parties USING gin (name gin_trgm_ops);

-- ============================================================
-- 7. ITEMS  (Products & Services)
-- ============================================================
CREATE TABLE IF NOT EXISTS items (
  id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id       UUID         NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  account_id        UUID         REFERENCES accounts(id),
  -- Identity
  name              VARCHAR(255) NOT NULL,
  sku               VARCHAR(100),
  description       TEXT,
  -- Classification
  item_type         VARCHAR(20)  NOT NULL DEFAULT 'goods', -- goods | service
  category          VARCHAR(100),
  -- Tax
  hsn_sac_code      VARCHAR(20),
  gst_rate          NUMERIC(5,2) NOT NULL DEFAULT 0,
  cess_rate         NUMERIC(5,2) NOT NULL DEFAULT 0,
  is_tax_inclusive  BOOLEAN      NOT NULL DEFAULT FALSE,
  -- Pricing
  sale_price        NUMERIC(15,2) NOT NULL DEFAULT 0,
  purchase_price    NUMERIC(15,2) NOT NULL DEFAULT 0,
  mrp               NUMERIC(15,2),
  unit              VARCHAR(50)  NOT NULL DEFAULT 'PCS',
  -- Inventory
  track_inventory   BOOLEAN      NOT NULL DEFAULT TRUE,
  opening_stock     NUMERIC(15,3) NOT NULL DEFAULT 0,
  current_stock     NUMERIC(15,3) NOT NULL DEFAULT 0,
  min_stock_alert   NUMERIC(15,3) NOT NULL DEFAULT 0,
  max_stock         NUMERIC(15,3),
  -- Images & metadata
  image_url         TEXT,
  barcode           VARCHAR(100),
  is_active         BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  CONSTRAINT items_sku_unique  UNIQUE (business_id, sku),
  CONSTRAINT items_type_check  CHECK (item_type IN ('goods','service')),
  CONSTRAINT items_gst_check   CHECK (gst_rate  >= 0 AND gst_rate  <= 100),
  CONSTRAINT items_cess_check  CHECK (cess_rate >= 0 AND cess_rate <= 100),
  CONSTRAINT items_stock_check CHECK (current_stock >= 0 OR NOT track_inventory)
);

CREATE INDEX idx_items_business      ON items (business_id);
CREATE INDEX idx_items_type          ON items (business_id, item_type);
CREATE INDEX idx_items_hsn           ON items (hsn_sac_code) WHERE hsn_sac_code IS NOT NULL;
CREATE INDEX idx_items_low_stock     ON items (business_id) WHERE track_inventory = TRUE;
CREATE INDEX idx_items_name_trgm     ON items USING gin (name gin_trgm_ops);

-- ============================================================
-- 8. INVOICES
-- ============================================================
CREATE TABLE IF NOT EXISTS invoices (
  id                    UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id           UUID          NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  branch_id             UUID          REFERENCES branches(id),
  -- Type & Number
  invoice_type          VARCHAR(20)   NOT NULL DEFAULT 'sale', -- sale | purchase | credit_note | debit_note
  invoice_number        VARCHAR(100)  NOT NULL,
  reference_number      VARCHAR(100),                           -- PO / supplier invoice number
  -- Party snapshot (denormalized for historical accuracy)
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
  -- Dates
  invoice_date          DATE          NOT NULL,
  due_date              DATE,
  supply_date           DATE,
  -- GST
  is_inter_state        BOOLEAN       NOT NULL DEFAULT FALSE,
  place_of_supply       VARCHAR(100),
  reverse_charge        BOOLEAN       NOT NULL DEFAULT FALSE,
  -- Amounts
  subtotal              NUMERIC(15,2) NOT NULL DEFAULT 0,   -- sum of (rate × qty) before discount
  total_discount        NUMERIC(15,2) NOT NULL DEFAULT 0,
  taxable_amount        NUMERIC(15,2) NOT NULL DEFAULT 0,   -- after discount, before tax
  cgst_amount           NUMERIC(15,2) NOT NULL DEFAULT 0,
  sgst_amount           NUMERIC(15,2) NOT NULL DEFAULT 0,
  igst_amount           NUMERIC(15,2) NOT NULL DEFAULT 0,
  cess_amount           NUMERIC(15,2) NOT NULL DEFAULT 0,
  total_tax             NUMERIC(15,2) NOT NULL DEFAULT 0,
  other_charges         NUMERIC(15,2) NOT NULL DEFAULT 0,
  round_off             NUMERIC(10,4) NOT NULL DEFAULT 0,
  total_amount          NUMERIC(15,2) NOT NULL DEFAULT 0,
  -- Payment tracking
  amount_paid           NUMERIC(15,2) NOT NULL DEFAULT 0,
  balance_due           NUMERIC(15,2) NOT NULL DEFAULT 0,
  status                VARCHAR(20)   NOT NULL DEFAULT 'unpaid', -- draft | unpaid | partial | paid | cancelled | overdue
  -- Linked voucher (accounting)
  voucher_id            UUID,
  -- Notes
  notes                 TEXT,
  terms_and_conditions  TEXT,
  -- Audit
  created_by            UUID          REFERENCES users(id),
  updated_by            UUID          REFERENCES users(id),
  cancelled_by          UUID          REFERENCES users(id),
  cancelled_at          TIMESTAMPTZ,
  cancellation_reason   TEXT,
  created_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  CONSTRAINT invoices_number_unique   UNIQUE (business_id, invoice_type, invoice_number),
  CONSTRAINT invoices_type_check      CHECK (invoice_type IN ('sale','purchase','credit_note','debit_note')),
  CONSTRAINT invoices_status_check    CHECK (status IN ('draft','unpaid','partial','paid','cancelled','overdue')),
  CONSTRAINT invoices_amounts_check   CHECK (
    subtotal       >= 0 AND taxable_amount >= 0 AND
    cgst_amount    >= 0 AND sgst_amount    >= 0 AND
    igst_amount    >= 0 AND total_amount   >= 0
  )
);

CREATE INDEX idx_invoices_business    ON invoices (business_id);
CREATE INDEX idx_invoices_party       ON invoices (party_id) WHERE party_id IS NOT NULL;
CREATE INDEX idx_invoices_date        ON invoices (business_id, invoice_date DESC);
CREATE INDEX idx_invoices_status      ON invoices (business_id, status);
CREATE INDEX idx_invoices_type_date   ON invoices (business_id, invoice_type, invoice_date DESC);
CREATE INDEX idx_invoices_due_date    ON invoices (business_id, due_date) WHERE due_date IS NOT NULL;
CREATE INDEX idx_invoices_number_trgm ON invoices USING gin (invoice_number gin_trgm_ops);

-- ============================================================
-- 9. INVOICE ITEMS
-- ============================================================
CREATE TABLE IF NOT EXISTS invoice_items (
  id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id       UUID          NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  item_id          UUID          REFERENCES items(id),
  -- Item snapshot (denormalized)
  item_name        VARCHAR(255)  NOT NULL,
  description      TEXT,
  hsn_sac_code     VARCHAR(20),
  unit             VARCHAR(50)   NOT NULL DEFAULT 'PCS',
  -- Quantity & Rate
  quantity         NUMERIC(15,3) NOT NULL,
  rate             NUMERIC(15,2) NOT NULL,
  -- Discount
  discount_percent NUMERIC(5,2)  NOT NULL DEFAULT 0,
  discount_amount  NUMERIC(15,2) NOT NULL DEFAULT 0,
  -- Amounts
  taxable_amount   NUMERIC(15,2) NOT NULL,
  -- GST breakdown
  gst_rate         NUMERIC(5,2)  NOT NULL DEFAULT 0,
  cgst_rate        NUMERIC(5,2)  NOT NULL DEFAULT 0,
  cgst_amount      NUMERIC(15,2) NOT NULL DEFAULT 0,
  sgst_rate        NUMERIC(5,2)  NOT NULL DEFAULT 0,
  sgst_amount      NUMERIC(15,2) NOT NULL DEFAULT 0,
  igst_rate        NUMERIC(5,2)  NOT NULL DEFAULT 0,
  igst_amount      NUMERIC(15,2) NOT NULL DEFAULT 0,
  cess_rate        NUMERIC(5,2)  NOT NULL DEFAULT 0,
  cess_amount      NUMERIC(15,2) NOT NULL DEFAULT 0,
  -- Line total
  total            NUMERIC(15,2) NOT NULL,
  sort_order       INTEGER       NOT NULL DEFAULT 0,

  CONSTRAINT invoice_items_qty_positive  CHECK (quantity > 0),
  CONSTRAINT invoice_items_rate_positive CHECK (rate >= 0),
  CONSTRAINT invoice_items_disc_range    CHECK (discount_percent >= 0 AND discount_percent <= 100)
);

CREATE INDEX idx_invoice_items_invoice ON invoice_items (invoice_id);
CREATE INDEX idx_invoice_items_item    ON invoice_items (item_id) WHERE item_id IS NOT NULL;

-- ============================================================
-- 10. VOUCHERS  (Accounting Journal)
-- ============================================================
CREATE TABLE IF NOT EXISTS vouchers (
  id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id   UUID          NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  branch_id     UUID          REFERENCES branches(id),
  -- Type & Number
  voucher_type  VARCHAR(20)   NOT NULL,  -- Journal | Sales | Purchase | Receipt | Payment | Contra | CreditNote | DebitNote
  voucher_number VARCHAR(100),
  -- Link to source document
  invoice_id    UUID          REFERENCES invoices(id),
  payment_id    UUID,                     -- FK set after payments table created
  -- Details
  voucher_date  DATE          NOT NULL,
  narration     TEXT,
  reference     VARCHAR(255),
  -- Totals (must be equal — double-entry)
  total_debit   NUMERIC(15,2) NOT NULL DEFAULT 0,
  total_credit  NUMERIC(15,2) NOT NULL DEFAULT 0,
  is_balanced   BOOLEAN       NOT NULL DEFAULT FALSE,
  -- Status
  is_posted     BOOLEAN       NOT NULL DEFAULT TRUE,
  is_reversed   BOOLEAN       NOT NULL DEFAULT FALSE,
  reversed_by   UUID          REFERENCES vouchers(id),
  -- Audit
  created_by    UUID          REFERENCES users(id),
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  CONSTRAINT vouchers_type_check CHECK (
    voucher_type IN ('Journal','Sales','Purchase','Receipt','Payment','Contra','CreditNote','DebitNote')
  )
);

CREATE INDEX idx_vouchers_business  ON vouchers (business_id);
CREATE INDEX idx_vouchers_date      ON vouchers (business_id, voucher_date DESC);
CREATE INDEX idx_vouchers_type      ON vouchers (business_id, voucher_type);
CREATE INDEX idx_vouchers_invoice   ON vouchers (invoice_id) WHERE invoice_id IS NOT NULL;

-- ============================================================
-- 11. LEDGER ENTRIES  (Individual debit/credit lines)
-- ============================================================
CREATE TABLE IF NOT EXISTS ledger_entries (
  id             UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  voucher_id     UUID          NOT NULL REFERENCES vouchers(id) ON DELETE CASCADE,
  business_id    UUID          NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  account_id     UUID          NOT NULL REFERENCES accounts(id),
  -- Denormalized for performance
  account_code   VARCHAR(20),
  account_name   VARCHAR(255),
  account_type   VARCHAR(20),
  -- Amounts
  debit          NUMERIC(15,2) NOT NULL DEFAULT 0,
  credit         NUMERIC(15,2) NOT NULL DEFAULT 0,
  -- Running balance (computed on insert by trigger)
  running_balance NUMERIC(15,2),
  -- Reference
  narration      TEXT,
  party_id       UUID          REFERENCES parties(id),
  invoice_id     UUID          REFERENCES invoices(id),
  -- Sorting
  sort_order     INTEGER       NOT NULL DEFAULT 0,
  entry_date     DATE          NOT NULL,

  CONSTRAINT ledger_entries_debit_check  CHECK (debit  >= 0),
  CONSTRAINT ledger_entries_credit_check CHECK (credit >= 0),
  CONSTRAINT ledger_entries_nonzero      CHECK (debit > 0 OR credit > 0),
  CONSTRAINT ledger_entries_not_both     CHECK (NOT (debit > 0 AND credit > 0))
);

CREATE INDEX idx_ledger_voucher   ON ledger_entries (voucher_id);
CREATE INDEX idx_ledger_account   ON ledger_entries (account_id);
CREATE INDEX idx_ledger_business  ON ledger_entries (business_id);
CREATE INDEX idx_ledger_date      ON ledger_entries (business_id, entry_date DESC);
CREATE INDEX idx_ledger_party     ON ledger_entries (party_id) WHERE party_id IS NOT NULL;
CREATE INDEX idx_ledger_invoice   ON ledger_entries (invoice_id) WHERE invoice_id IS NOT NULL;
CREATE INDEX idx_ledger_acct_date ON ledger_entries (account_id, entry_date DESC);

-- ============================================================
-- 12. PAYMENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS payments (
  id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id      UUID          NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  branch_id        UUID          REFERENCES branches(id),
  -- Type & Number
  payment_type     VARCHAR(20)   NOT NULL,  -- receipt | payment
  payment_number   VARCHAR(100),
  -- Party
  party_id         UUID          REFERENCES parties(id),
  party_name       VARCHAR(255),
  -- Date & Amount
  payment_date     DATE          NOT NULL,
  amount           NUMERIC(15,2) NOT NULL,
  -- Payment mode
  payment_mode     VARCHAR(30)   NOT NULL DEFAULT 'cash', -- cash | bank | upi | cheque | neft | rtgs | card | other
  bank_account_id  UUID          REFERENCES accounts(id),
  cheque_number    VARCHAR(50),
  cheque_date      DATE,
  transaction_id   VARCHAR(100),  -- UTR / UPI txn ID
  -- Accounting
  voucher_id       UUID          REFERENCES vouchers(id),
  -- Details
  narration        TEXT,
  reference        VARCHAR(255),
  status           VARCHAR(20)   NOT NULL DEFAULT 'cleared', -- cleared | bounced | cancelled
  -- Audit
  created_by       UUID          REFERENCES users(id),
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  CONSTRAINT payments_type_check   CHECK (payment_type  IN ('receipt','payment')),
  CONSTRAINT payments_mode_check   CHECK (payment_mode  IN ('cash','bank','upi','cheque','neft','rtgs','card','other')),
  CONSTRAINT payments_status_check CHECK (status        IN ('cleared','bounced','cancelled')),
  CONSTRAINT payments_amount_check CHECK (amount > 0)
);

CREATE INDEX idx_payments_business ON payments (business_id);
CREATE INDEX idx_payments_party    ON payments (party_id) WHERE party_id IS NOT NULL;
CREATE INDEX idx_payments_date     ON payments (business_id, payment_date DESC);
CREATE INDEX idx_payments_voucher  ON payments (voucher_id) WHERE voucher_id IS NOT NULL;

-- Back-fill FK on vouchers → payments (now that payments table exists)
ALTER TABLE vouchers
  ADD CONSTRAINT fk_vouchers_payment
  FOREIGN KEY (payment_id) REFERENCES payments(id);

-- Payment ↔ Invoice allocation table
CREATE TABLE IF NOT EXISTS payment_allocations (
  id           UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id   UUID          NOT NULL REFERENCES payments(id)  ON DELETE CASCADE,
  invoice_id   UUID          NOT NULL REFERENCES invoices(id)  ON DELETE CASCADE,
  amount       NUMERIC(15,2) NOT NULL,
  created_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  CONSTRAINT payment_alloc_unique UNIQUE (payment_id, invoice_id),
  CONSTRAINT payment_alloc_amount CHECK (amount > 0)
);

CREATE INDEX idx_payment_alloc_payment ON payment_allocations (payment_id);
CREATE INDEX idx_payment_alloc_invoice ON payment_allocations (invoice_id);

-- ============================================================
-- 13. EXPENSES
-- ============================================================
CREATE TABLE IF NOT EXISTS expenses (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id     UUID          NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  branch_id       UUID          REFERENCES branches(id),
  -- Classification
  expense_date    DATE          NOT NULL,
  category        VARCHAR(100)  NOT NULL DEFAULT 'General',
  description     TEXT          NOT NULL,
  -- Amounts
  amount          NUMERIC(15,2) NOT NULL,
  gst_amount      NUMERIC(15,2) NOT NULL DEFAULT 0,
  total_amount    NUMERIC(15,2) NOT NULL,
  -- Accounting
  expense_account_id  UUID      REFERENCES accounts(id),
  pay_account_id      UUID      REFERENCES accounts(id),   -- cash or bank account
  voucher_id          UUID      REFERENCES vouchers(id),
  -- Payment
  payment_mode    VARCHAR(30)   NOT NULL DEFAULT 'cash',
  reference       VARCHAR(255),
  receipt_url     TEXT,
  -- Audit
  created_by      UUID          REFERENCES users(id),
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  CONSTRAINT expenses_amount_check CHECK (amount > 0)
);

CREATE INDEX idx_expenses_business ON expenses (business_id);
CREATE INDEX idx_expenses_date     ON expenses (business_id, expense_date DESC);
CREATE INDEX idx_expenses_category ON expenses (business_id, category);

-- ============================================================
-- 14. AUDIT LOGS
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_logs (
  id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id   UUID          REFERENCES businesses(id) ON DELETE SET NULL,
  user_id       UUID          REFERENCES users(id) ON DELETE SET NULL,
  -- What happened
  action        VARCHAR(50)   NOT NULL,   -- CREATE | UPDATE | DELETE | LOGIN | LOGOUT | CANCEL | PRINT | EXPORT
  entity        VARCHAR(50)   NOT NULL,   -- invoice | payment | voucher | party | item | user | business …
  entity_id     UUID,
  -- Diff / snapshot
  old_values    JSONB,
  new_values    JSONB,
  changed_fields TEXT[],
  -- Context
  ip_address    VARCHAR(45),
  user_agent    TEXT,
  notes         TEXT,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_business  ON audit_logs (business_id);
CREATE INDEX idx_audit_user      ON audit_logs (user_id);
CREATE INDEX idx_audit_entity    ON audit_logs (entity, entity_id);
CREATE INDEX idx_audit_action    ON audit_logs (action);
CREATE INDEX idx_audit_date      ON audit_logs (created_at DESC);

-- ============================================================
-- 15. SYNC QUEUE  (offline → online sync)
-- ============================================================
CREATE TABLE IF NOT EXISTS sync_queue (
  id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id   UUID          NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  client_id     VARCHAR(100)  NOT NULL,   -- device/browser ID
  entity        VARCHAR(50)   NOT NULL,
  operation     VARCHAR(10)   NOT NULL,   -- create | update | delete
  entity_id     UUID,
  local_id      VARCHAR(100),             -- client-generated temp ID
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

CREATE INDEX idx_sync_business  ON sync_queue (business_id);
CREATE INDEX idx_sync_unsynced  ON sync_queue (business_id, synced) WHERE synced = FALSE;
CREATE INDEX idx_sync_client    ON sync_queue (client_id);
