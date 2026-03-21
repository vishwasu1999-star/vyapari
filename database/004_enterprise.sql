-- ============================================================
--  VYAPARI — ENTERPRISE UPGRADE MIGRATION
--  004_enterprise.sql
--  Run after 001-003 have been applied.
--  Idempotent: uses IF NOT EXISTS / IF EXISTS guards.
-- ============================================================

-- ============================================================
-- 1. BUSINESS — add enterprise settings columns
-- ============================================================
ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS lock_date              DATE,        -- no edits allowed before this date
  ADD COLUMN IF NOT EXISTS allow_negative_stock   BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS enable_fy_reset        BOOLEAN NOT NULL DEFAULT TRUE,   -- reset sequences per FY
  ADD COLUMN IF NOT EXISTS current_fy_start       DATE,        -- e.g. 2024-04-01 (current FY)
  ADD COLUMN IF NOT EXISTS default_payment_mode   VARCHAR(30) DEFAULT 'cash';

-- ============================================================
-- 2. USER ROLES — RBAC
-- Roles: owner | accountant | staff | viewer
-- ============================================================
CREATE TABLE IF NOT EXISTS user_roles (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id  UUID        NOT NULL REFERENCES businesses(id)  ON DELETE CASCADE,
  user_id      UUID        NOT NULL REFERENCES users(id)       ON DELETE CASCADE,
  role         VARCHAR(20) NOT NULL DEFAULT 'staff',
  invited_by   UUID        REFERENCES users(id),
  is_active    BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT user_roles_unique         UNIQUE (business_id, user_id),
  CONSTRAINT user_roles_role_check     CHECK  (role IN ('owner','accountant','staff','viewer'))
);

CREATE INDEX IF NOT EXISTS idx_user_roles_business ON user_roles (business_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_user     ON user_roles (user_id);

-- ============================================================
-- 3. FY INVOICE SEQUENCES — per financial-year numbering
--    Each (business, type, fy_year) combo has its own counter
-- ============================================================
CREATE TABLE IF NOT EXISTS fy_sequences (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id  UUID        NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  seq_type     VARCHAR(20) NOT NULL,   -- sale | purchase | receipt | payment | voucher
  fy_year      INTEGER     NOT NULL,   -- e.g. 2024 for FY 2024-25 (April 2024 – March 2025)
  prefix       VARCHAR(20) NOT NULL,
  last_seq     INTEGER     NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT fy_sequences_unique UNIQUE (business_id, seq_type, fy_year)
);

CREATE INDEX IF NOT EXISTS idx_fy_seq_business ON fy_sequences (business_id);

-- ============================================================
-- 4. OPENING BALANCES PER FINANCIAL YEAR
--    Stores carry-forward balances for each account at FY start
-- ============================================================
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

CREATE INDEX IF NOT EXISTS idx_fy_ob_business ON fy_opening_balances (business_id, fy_year);

-- ============================================================
-- 5. BACKUP LOG
-- ============================================================
CREATE TABLE IF NOT EXISTS backup_log (
  id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id   UUID          REFERENCES businesses(id) ON DELETE SET NULL,
  initiated_by  UUID          REFERENCES users(id)      ON DELETE SET NULL,
  backup_type   VARCHAR(20)   NOT NULL DEFAULT 'full',   -- full | incremental
  status        VARCHAR(20)   NOT NULL DEFAULT 'pending', -- pending | running | completed | failed
  file_path     TEXT,
  file_size_kb  INTEGER,
  row_counts    JSONB,
  error_message TEXT,
  started_at    TIMESTAMPTZ,
  completed_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_backup_log_business ON backup_log (business_id);

-- ============================================================
-- 6. STOCK MOVEMENTS — explicit ledger for inventory
-- ============================================================
CREATE TABLE IF NOT EXISTS stock_movements (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id     UUID          NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  item_id         UUID          NOT NULL REFERENCES items(id)      ON DELETE CASCADE,
  movement_type   VARCHAR(20)   NOT NULL, -- purchase | sale | adjustment | opening | return | write_off
  reference_type  VARCHAR(20),            -- invoice | manual | opening
  reference_id    UUID,
  quantity        NUMERIC(15,3) NOT NULL,  -- positive = in, negative = out
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

CREATE INDEX IF NOT EXISTS idx_stock_mv_item     ON stock_movements (item_id);
CREATE INDEX IF NOT EXISTS idx_stock_mv_business ON stock_movements (business_id);
CREATE INDEX IF NOT EXISTS idx_stock_mv_date     ON stock_movements (business_id, movement_date DESC);

-- ============================================================
-- 7. UPGRADE fn_adjust_item_stock — add negative stock guard
--    and record explicit stock movements
-- ============================================================
CREATE OR REPLACE FUNCTION fn_adjust_item_stock()
RETURNS TRIGGER AS $$
DECLARE
  v_invoice_type VARCHAR(20);
  v_delta        NUMERIC(15,3);
  v_current      NUMERIC(15,3);
  v_allow_neg    BOOLEAN;
  v_item_name    VARCHAR(255);
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT invoice_type INTO v_invoice_type FROM invoices WHERE id = NEW.invoice_id;
    v_delta := CASE WHEN v_invoice_type = 'sale' THEN -NEW.quantity ELSE NEW.quantity END;

    -- Fetch current stock and business setting
    SELECT i.current_stock, i.name, b.allow_negative_stock
    INTO   v_current, v_item_name, v_allow_neg
    FROM   items i
    JOIN   businesses b ON b.id = i.business_id
    WHERE  i.id = NEW.item_id AND i.track_inventory = TRUE;

    IF FOUND THEN
      -- Block sale if it would cause negative stock and business disallows it
      IF v_delta < 0 AND (v_current + v_delta) < 0 AND NOT v_allow_neg THEN
        RAISE EXCEPTION 'Insufficient stock for item "%". Available: %, Required: %',
          v_item_name, v_current, ABS(v_delta)
          USING ERRCODE = 'P0001';
      END IF;

      UPDATE items
      SET current_stock = current_stock + v_delta, updated_at = NOW()
      WHERE id = NEW.item_id AND track_inventory = TRUE;

      -- Record movement
      INSERT INTO stock_movements (
        business_id, item_id, movement_type, reference_type, reference_id,
        quantity, quantity_before, quantity_after, movement_date
      )
      SELECT
        b.id,
        NEW.item_id,
        CASE WHEN v_invoice_type = 'sale' THEN 'sale' ELSE 'purchase' END,
        'invoice',
        NEW.invoice_id,
        v_delta,
        v_current,
        v_current + v_delta,
        CURRENT_DATE
      FROM items i JOIN businesses b ON b.id = i.business_id WHERE i.id = NEW.item_id;
    END IF;
    RETURN NEW;

  ELSIF TG_OP = 'DELETE' THEN
    SELECT invoice_type INTO v_invoice_type FROM invoices WHERE id = OLD.invoice_id;
    -- Reverse: if original was sale (stock went down), reversal goes up, and vice versa
    v_delta := CASE WHEN v_invoice_type = 'sale' THEN OLD.quantity ELSE -OLD.quantity END;

    SELECT current_stock INTO v_current FROM items
    WHERE id = OLD.item_id AND track_inventory = TRUE;

    IF FOUND THEN
      UPDATE items
      SET current_stock = current_stock + v_delta, updated_at = NOW()
      WHERE id = OLD.item_id AND track_inventory = TRUE;

      INSERT INTO stock_movements (
        business_id, item_id, movement_type, reference_type, reference_id,
        quantity, quantity_before, quantity_after, movement_date
      )
      SELECT
        b.id,
        OLD.item_id,
        'return',
        'invoice',
        OLD.invoice_id,
        v_delta,
        v_current,
        v_current + v_delta,
        CURRENT_DATE
      FROM items i JOIN businesses b ON b.id = i.business_id WHERE i.id = OLD.item_id;
    END IF;
    RETURN OLD;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 8. FY-AWARE invoice number function
--    Uses fy_sequences table; falls back to businesses.sequence
-- ============================================================
CREATE OR REPLACE FUNCTION fn_next_invoice_number(
  p_business_id UUID,
  p_type        VARCHAR,
  p_fy_year     INTEGER DEFAULT NULL  -- pass NULL to use business global sequence
)
RETURNS VARCHAR AS $$
DECLARE
  v_prefix    VARCHAR(20);
  v_seq       INTEGER;
  v_fy        INTEGER;
  v_enable_fy BOOLEAN;
  v_number    VARCHAR(100);
BEGIN
  -- Determine FY year to use
  SELECT enable_fy_reset, EXTRACT(YEAR FROM COALESCE(current_fy_start,
         CASE WHEN EXTRACT(MONTH FROM CURRENT_DATE) >= 4
              THEN DATE_TRUNC('year', CURRENT_DATE)
              ELSE DATE_TRUNC('year', CURRENT_DATE) - INTERVAL '1 year' END))::INTEGER
  INTO   v_enable_fy, v_fy
  FROM   businesses WHERE id = p_business_id;

  v_fy := COALESCE(p_fy_year, v_fy);

  -- Resolve prefix from businesses table
  SELECT CASE p_type
    WHEN 'sale'     THEN sale_invoice_prefix
    WHEN 'purchase' THEN purchase_prefix
    WHEN 'receipt'  THEN receipt_prefix
    WHEN 'payment'  THEN payment_prefix
    ELSE                 voucher_prefix
  END
  INTO v_prefix
  FROM businesses WHERE id = p_business_id;

  IF v_enable_fy THEN
    -- Use per-FY sequence with row-level locking
    INSERT INTO fy_sequences (business_id, seq_type, fy_year, prefix, last_seq)
    VALUES (p_business_id, p_type, v_fy, v_prefix, 0)
    ON CONFLICT (business_id, seq_type, fy_year) DO NOTHING;

    UPDATE fy_sequences
    SET last_seq = last_seq + 1
    WHERE business_id = p_business_id
      AND seq_type    = p_type
      AND fy_year     = v_fy
    RETURNING last_seq, prefix INTO v_seq, v_prefix;

    -- Format: PREFIX/FY/00001  e.g. INV/24-25/00001
    v_number := v_prefix || '/' || v_fy || '-' ||
                LPAD(((v_fy + 1) % 100)::TEXT, 2, '0') || '/' ||
                LPAD(v_seq::TEXT, 5, '0');
  ELSE
    -- Use global sequence on businesses table (original behaviour)
    CASE p_type
      WHEN 'sale'     THEN
        UPDATE businesses SET sale_invoice_sequence = sale_invoice_sequence + 1
        WHERE id = p_business_id RETURNING sale_invoice_sequence, sale_invoice_prefix INTO v_seq, v_prefix;
      WHEN 'purchase' THEN
        UPDATE businesses SET purchase_sequence = purchase_sequence + 1
        WHERE id = p_business_id RETURNING purchase_sequence, purchase_prefix INTO v_seq, v_prefix;
      WHEN 'receipt'  THEN
        UPDATE businesses SET receipt_sequence = receipt_sequence + 1
        WHERE id = p_business_id RETURNING receipt_sequence, receipt_prefix INTO v_seq, v_prefix;
      WHEN 'payment'  THEN
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
-- 9. AUDIT LOCK CHECK FUNCTION
--    Called by application before any write
-- ============================================================
CREATE OR REPLACE FUNCTION fn_check_audit_lock(
  p_business_id UUID,
  p_date        DATE
)
RETURNS VOID AS $$
DECLARE
  v_lock_date DATE;
BEGIN
  SELECT lock_date INTO v_lock_date
  FROM businesses WHERE id = p_business_id;

  IF v_lock_date IS NOT NULL AND p_date <= v_lock_date THEN
    RAISE EXCEPTION 'Period is locked. Transactions on or before % are not allowed. Current lock date: %',
      p_date, v_lock_date
      USING ERRCODE = 'P0002';
  END IF;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 10. PERFORMANCE INDEXES
-- ============================================================

-- Composite index for invoice list queries (most common filter pattern)
CREATE INDEX IF NOT EXISTS idx_invoices_biz_type_date
  ON invoices (business_id, invoice_type, invoice_date DESC);

CREATE INDEX IF NOT EXISTS idx_invoices_biz_status
  ON invoices (business_id, invoice_type, status)
  WHERE status NOT IN ('cancelled', 'paid');

-- Ledger queries by account+date (critical for report performance)
CREATE INDEX IF NOT EXISTS idx_ledger_acct_date_biz
  ON ledger_entries (account_id, entry_date DESC, business_id);

-- Voucher date range scans
CREATE INDEX IF NOT EXISTS idx_vouchers_biz_date_posted
  ON vouchers (business_id, voucher_date DESC)
  WHERE is_posted = TRUE;

-- Party lookup by name (for autocomplete)
CREATE INDEX IF NOT EXISTS idx_parties_name_lower
  ON parties (business_id, lower(name));

-- Item lookup by name (for autocomplete)
CREATE INDEX IF NOT EXISTS idx_items_name_lower
  ON items (business_id, lower(name));

-- Invoice items coverage (for report aggregations)
CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice_cover
  ON invoice_items (invoice_id, taxable_amount, cgst_amount, sgst_amount, igst_amount);

-- Stock movements by item
CREATE INDEX IF NOT EXISTS idx_stock_mv_item_date
  ON stock_movements (item_id, movement_date DESC);

-- Payment allocations join performance
CREATE INDEX IF NOT EXISTS idx_payment_alloc_invoice
  ON payment_allocations (invoice_id, payment_id);

-- Trigger updated_at on user_roles
CREATE TRIGGER trg_user_roles_updated_at
  BEFORE UPDATE ON user_roles
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
