-- ============================================================
--  VYAPARI APP — DATABASE FUNCTIONS & TRIGGERS
--  002_functions.sql
-- ============================================================

-- ============================================================
-- TRIGGER: auto-update updated_at columns
-- ============================================================
CREATE OR REPLACE FUNCTION fn_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

CREATE TRIGGER trg_businesses_updated_at
  BEFORE UPDATE ON businesses
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

CREATE TRIGGER trg_branches_updated_at
  BEFORE UPDATE ON branches
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

CREATE TRIGGER trg_parties_updated_at
  BEFORE UPDATE ON parties
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

CREATE TRIGGER trg_items_updated_at
  BEFORE UPDATE ON items
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

CREATE TRIGGER trg_invoices_updated_at
  BEFORE UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- ============================================================
-- TRIGGER: validate voucher is balanced before insert/update
-- ============================================================
CREATE OR REPLACE FUNCTION fn_validate_voucher_balance()
RETURNS TRIGGER AS $$
DECLARE
  v_debit  NUMERIC(15,2);
  v_credit NUMERIC(15,2);
BEGIN
  SELECT
    COALESCE(SUM(debit), 0),
    COALESCE(SUM(credit), 0)
  INTO v_debit, v_credit
  FROM ledger_entries
  WHERE voucher_id = NEW.id;

  IF ABS(v_debit - v_credit) > 0.01 THEN
    RAISE EXCEPTION 'Voucher % is not balanced: Dr=% Cr=%', NEW.id, v_debit, v_credit;
  END IF;

  UPDATE vouchers
  SET total_debit = v_debit, total_credit = v_credit, is_balanced = TRUE
  WHERE id = NEW.id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- TRIGGER: auto-update invoice balance_due + status on payment
-- ============================================================
CREATE OR REPLACE FUNCTION fn_update_invoice_payment_status()
RETURNS TRIGGER AS $$
DECLARE
  v_invoice RECORD;
  v_paid    NUMERIC(15,2);
BEGIN
  -- Determine which invoice was affected
  IF (TG_OP = 'DELETE') THEN
    SELECT id, total_amount INTO v_invoice FROM invoices WHERE id = OLD.invoice_id;
  ELSE
    SELECT id, total_amount INTO v_invoice FROM invoices WHERE id = NEW.invoice_id;
  END IF;

  -- Recalculate total paid
  SELECT COALESCE(SUM(amount), 0) INTO v_paid
  FROM payment_allocations WHERE invoice_id = v_invoice.id;

  -- Update invoice
  UPDATE invoices
  SET
    amount_paid = v_paid,
    balance_due = GREATEST(0, total_amount - v_paid),
    status = CASE
      WHEN v_paid <= 0                       THEN 'unpaid'
      WHEN v_paid >= total_amount - 0.01     THEN 'paid'
      ELSE 'partial'
    END,
    updated_at = NOW()
  WHERE id = v_invoice.id;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_payment_alloc_after_insert
  AFTER INSERT ON payment_allocations
  FOR EACH ROW EXECUTE FUNCTION fn_update_invoice_payment_status();

CREATE TRIGGER trg_payment_alloc_after_delete
  AFTER DELETE ON payment_allocations
  FOR EACH ROW EXECUTE FUNCTION fn_update_invoice_payment_status();

CREATE TRIGGER trg_payment_alloc_after_update
  AFTER UPDATE OF amount ON payment_allocations
  FOR EACH ROW EXECUTE FUNCTION fn_update_invoice_payment_status();

-- ============================================================
-- TRIGGER: adjust item stock on invoice_items insert/delete
-- ============================================================
CREATE OR REPLACE FUNCTION fn_adjust_item_stock()
RETURNS TRIGGER AS $$
DECLARE
  v_invoice_type VARCHAR(20);
  v_delta        NUMERIC(15,3);
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT invoice_type INTO v_invoice_type FROM invoices WHERE id = NEW.invoice_id;
    -- Sale: stock goes down; Purchase: stock goes up
    v_delta := CASE WHEN v_invoice_type = 'sale' THEN -NEW.quantity ELSE NEW.quantity END;
    UPDATE items
    SET current_stock = current_stock + v_delta, updated_at = NOW()
    WHERE id = NEW.item_id AND track_inventory = TRUE;
    RETURN NEW;

  ELSIF TG_OP = 'DELETE' THEN
    SELECT invoice_type INTO v_invoice_type FROM invoices WHERE id = OLD.invoice_id;
    v_delta := CASE WHEN v_invoice_type = 'sale' THEN OLD.quantity ELSE -OLD.quantity END;
    UPDATE items
    SET current_stock = current_stock + v_delta, updated_at = NOW()
    WHERE id = OLD.item_id AND track_inventory = TRUE;
    RETURN OLD;
  END IF;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_invoice_items_stock_insert
  AFTER INSERT ON invoice_items
  FOR EACH ROW
  WHEN (NEW.item_id IS NOT NULL)
  EXECUTE FUNCTION fn_adjust_item_stock();

CREATE TRIGGER trg_invoice_items_stock_delete
  AFTER DELETE ON invoice_items
  FOR EACH ROW
  WHEN (OLD.item_id IS NOT NULL)
  EXECUTE FUNCTION fn_adjust_item_stock();

-- ============================================================
-- FUNCTION: Seed default Chart of Accounts for a new business
-- Called from application layer when a business is created
-- ============================================================
CREATE OR REPLACE FUNCTION fn_seed_chart_of_accounts(p_business_id UUID)
RETURNS VOID AS $$
BEGIN
  -- ===== ASSETS =====
  INSERT INTO accounts (business_id, code, name, account_type, account_subtype, normal_balance, is_system, is_group)
  VALUES
    (p_business_id,'1000','Current Assets',    'Asset','Current Asset',  'Dr',TRUE,TRUE),
    (p_business_id,'1001','Cash in Hand',       'Asset','Current Asset',  'Dr',TRUE,FALSE),
    (p_business_id,'1002','Bank Account',       'Asset','Current Asset',  'Dr',TRUE,FALSE),
    (p_business_id,'1003','Petty Cash',         'Asset','Current Asset',  'Dr',FALSE,FALSE),
    (p_business_id,'1010','Accounts Receivable','Asset','Current Asset',  'Dr',TRUE,FALSE),
    (p_business_id,'1020','Stock / Inventory',  'Asset','Current Asset',  'Dr',TRUE,FALSE),
    (p_business_id,'1030','GST Input Credit',   'Asset','Current Asset',  'Dr',TRUE,FALSE),
    (p_business_id,'1031','CGST Input',         'Asset','Current Asset',  'Dr',TRUE,FALSE),
    (p_business_id,'1032','SGST Input',         'Asset','Current Asset',  'Dr',TRUE,FALSE),
    (p_business_id,'1033','IGST Input',         'Asset','Current Asset',  'Dr',TRUE,FALSE),
    (p_business_id,'1040','Prepaid Expenses',   'Asset','Current Asset',  'Dr',FALSE,FALSE),
    (p_business_id,'1050','Advance to Suppliers','Asset','Current Asset', 'Dr',FALSE,FALSE),
    (p_business_id,'1100','Fixed Assets',       'Asset','Fixed Asset',    'Dr',FALSE,TRUE),
    (p_business_id,'1101','Plant & Machinery',  'Asset','Fixed Asset',    'Dr',FALSE,FALSE),
    (p_business_id,'1102','Furniture & Fixtures','Asset','Fixed Asset',   'Dr',FALSE,FALSE),
    (p_business_id,'1103','Computer & Equipment','Asset','Fixed Asset',   'Dr',FALSE,FALSE),
    (p_business_id,'1104','Vehicles',           'Asset','Fixed Asset',    'Dr',FALSE,FALSE),
    (p_business_id,'1110','Accumulated Depreciation','Asset','Fixed Asset','Cr',FALSE,FALSE);

  -- ===== LIABILITIES =====
  INSERT INTO accounts (business_id, code, name, account_type, account_subtype, normal_balance, is_system, is_group)
  VALUES
    (p_business_id,'2000','Current Liabilities',     'Liability','Current Liability', 'Cr',TRUE,TRUE),
    (p_business_id,'2001','Accounts Payable',         'Liability','Current Liability', 'Cr',TRUE,FALSE),
    (p_business_id,'2010','GST Payable (Output)',     'Liability','Current Liability', 'Cr',TRUE,FALSE),
    (p_business_id,'2011','CGST Output',              'Liability','Current Liability', 'Cr',TRUE,FALSE),
    (p_business_id,'2012','SGST Output',              'Liability','Current Liability', 'Cr',TRUE,FALSE),
    (p_business_id,'2013','IGST Output',              'Liability','Current Liability', 'Cr',TRUE,FALSE),
    (p_business_id,'2014','GST Net Payable',          'Liability','Current Liability', 'Cr',TRUE,FALSE),
    (p_business_id,'2020','TDS Payable',              'Liability','Current Liability', 'Cr',FALSE,FALSE),
    (p_business_id,'2030','Salary Payable',           'Liability','Current Liability', 'Cr',FALSE,FALSE),
    (p_business_id,'2040','Advance from Customers',   'Liability','Current Liability', 'Cr',FALSE,FALSE),
    (p_business_id,'2050','Other Current Liabilities','Liability','Current Liability', 'Cr',FALSE,FALSE),
    (p_business_id,'2100','Long-term Liabilities',    'Liability','Long-term Liability','Cr',FALSE,TRUE),
    (p_business_id,'2101','Bank Loan',                'Liability','Long-term Liability','Cr',FALSE,FALSE),
    (p_business_id,'2102','Vehicle Loan',             'Liability','Long-term Liability','Cr',FALSE,FALSE);

  -- ===== EQUITY =====
  INSERT INTO accounts (business_id, code, name, account_type, account_subtype, normal_balance, is_system, is_group)
  VALUES
    (p_business_id,'3000','Equity',            'Equity','Capital',           'Cr',TRUE,TRUE),
    (p_business_id,'3001','Owner Capital',     'Equity','Capital',           'Cr',TRUE,FALSE),
    (p_business_id,'3002','Partner Capital',   'Equity','Capital',           'Cr',FALSE,FALSE),
    (p_business_id,'3003','Retained Earnings', 'Equity','Retained Earnings', 'Cr',TRUE,FALSE),
    (p_business_id,'3004','Drawings',          'Equity','Drawings',          'Dr',FALSE,FALSE),
    (p_business_id,'3005','Reserves & Surplus','Equity','Reserves',          'Cr',FALSE,FALSE);

  -- ===== INCOME =====
  INSERT INTO accounts (business_id, code, name, account_type, account_subtype, normal_balance, is_system, is_group)
  VALUES
    (p_business_id,'4000','Income',             'Income','Operating Income', 'Cr',TRUE,TRUE),
    (p_business_id,'4001','Sales Revenue',      'Income','Operating Income', 'Cr',TRUE,FALSE),
    (p_business_id,'4002','Service Revenue',    'Income','Operating Income', 'Cr',FALSE,FALSE),
    (p_business_id,'4003','Sales Returns',      'Income','Operating Income', 'Dr',FALSE,FALSE),
    (p_business_id,'4010','Other Income',       'Income','Other Income',     'Cr',FALSE,TRUE),
    (p_business_id,'4011','Interest Received',  'Income','Other Income',     'Cr',FALSE,FALSE),
    (p_business_id,'4012','Discount Received',  'Income','Other Income',     'Cr',FALSE,FALSE),
    (p_business_id,'4013','Commission Received','Income','Other Income',     'Cr',FALSE,FALSE);

  -- ===== EXPENSES =====
  INSERT INTO accounts (business_id, code, name, account_type, account_subtype, normal_balance, is_system, is_group)
  VALUES
    (p_business_id,'5000','Expenses',                 'Expense','Direct Expense',   'Dr',TRUE,TRUE),
    (p_business_id,'5001','Cost of Goods Sold',       'Expense','Direct Expense',   'Dr',TRUE,FALSE),
    (p_business_id,'5002','Purchase Returns',         'Expense','Direct Expense',   'Cr',FALSE,FALSE),
    (p_business_id,'5003','Freight Inward',           'Expense','Direct Expense',   'Dr',FALSE,FALSE),
    (p_business_id,'5010','Indirect Expenses',        'Expense','Indirect Expense', 'Dr',FALSE,TRUE),
    (p_business_id,'5011','Salaries & Wages',         'Expense','Indirect Expense', 'Dr',FALSE,FALSE),
    (p_business_id,'5012','Rent',                     'Expense','Indirect Expense', 'Dr',FALSE,FALSE),
    (p_business_id,'5013','Electricity & Utilities',  'Expense','Indirect Expense', 'Dr',FALSE,FALSE),
    (p_business_id,'5014','Transport & Delivery',     'Expense','Indirect Expense', 'Dr',FALSE,FALSE),
    (p_business_id,'5015','Telephone & Internet',     'Expense','Indirect Expense', 'Dr',FALSE,FALSE),
    (p_business_id,'5016','Office Supplies',          'Expense','Indirect Expense', 'Dr',FALSE,FALSE),
    (p_business_id,'5017','Printing & Stationery',    'Expense','Indirect Expense', 'Dr',FALSE,FALSE),
    (p_business_id,'5018','Advertisement & Marketing','Expense','Indirect Expense', 'Dr',FALSE,FALSE),
    (p_business_id,'5019','Repairs & Maintenance',    'Expense','Indirect Expense', 'Dr',FALSE,FALSE),
    (p_business_id,'5020','Insurance',                'Expense','Indirect Expense', 'Dr',FALSE,FALSE),
    (p_business_id,'5021','Professional Fees',        'Expense','Indirect Expense', 'Dr',FALSE,FALSE),
    (p_business_id,'5022','Bank Charges',             'Expense','Indirect Expense', 'Dr',FALSE,FALSE),
    (p_business_id,'5023','Discount Allowed',         'Expense','Indirect Expense', 'Dr',FALSE,FALSE),
    (p_business_id,'5024','Bad Debts',                'Expense','Indirect Expense', 'Dr',FALSE,FALSE),
    (p_business_id,'5030','Depreciation',             'Expense','Indirect Expense', 'Dr',FALSE,FALSE),
    (p_business_id,'5031','Interest on Loans',        'Expense','Finance Cost',     'Dr',FALSE,FALSE),
    (p_business_id,'5032','Miscellaneous Expenses',   'Expense','Indirect Expense', 'Dr',FALSE,FALSE),
    (p_business_id,'5033','Round Off',                'Expense','Indirect Expense', 'Dr',TRUE, FALSE);

END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- FUNCTION: Get account balance up to a given date
-- ============================================================
CREATE OR REPLACE FUNCTION fn_account_balance(
  p_account_id  UUID,
  p_business_id UUID,
  p_as_of_date  DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (
  debit_total   NUMERIC(15,2),
  credit_total  NUMERIC(15,2),
  net_balance   NUMERIC(15,2),
  balance_side  VARCHAR(5)
) AS $$
DECLARE
  v_ob           NUMERIC(15,2);
  v_ob_type      VARCHAR(5);
  v_period_dr    NUMERIC(15,2);
  v_period_cr    NUMERIC(15,2);
  v_ob_dr        NUMERIC(15,2) := 0;
  v_ob_cr        NUMERIC(15,2) := 0;
  v_net          NUMERIC(15,2);
BEGIN
  -- Get opening balance
  SELECT opening_balance, opening_balance_type
  INTO   v_ob, v_ob_type
  FROM   accounts
  WHERE  id = p_account_id;

  IF v_ob_type = 'Dr' THEN v_ob_dr := COALESCE(v_ob, 0);
  ELSE                      v_ob_cr := COALESCE(v_ob, 0); END IF;

  -- Sum period entries
  SELECT
    COALESCE(SUM(le.debit), 0),
    COALESCE(SUM(le.credit), 0)
  INTO v_period_dr, v_period_cr
  FROM ledger_entries le
  JOIN vouchers v ON v.id = le.voucher_id
  WHERE le.account_id   = p_account_id
    AND le.business_id  = p_business_id
    AND le.entry_date  <= p_as_of_date
    AND v.is_posted     = TRUE;

  debit_total  := v_ob_dr + v_period_dr;
  credit_total := v_ob_cr + v_period_cr;
  net_balance  := debit_total - credit_total;
  balance_side := CASE WHEN net_balance >= 0 THEN 'Dr' ELSE 'Cr' END;

  RETURN NEXT;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- FUNCTION: Generate invoice number with prefix + sequence
-- Called inside transaction by application layer
-- ============================================================
CREATE OR REPLACE FUNCTION fn_next_invoice_number(
  p_business_id UUID,
  p_type        VARCHAR  -- 'sale' | 'purchase' | 'receipt' | 'payment' | 'voucher'
)
RETURNS VARCHAR AS $$
DECLARE
  v_prefix   VARCHAR(20);
  v_sequence INTEGER;
  v_number   VARCHAR(100);
BEGIN
  IF p_type = 'sale' THEN
    SELECT sale_invoice_prefix, sale_invoice_sequence INTO v_prefix, v_sequence
    FROM businesses WHERE id = p_business_id FOR UPDATE;
    UPDATE businesses SET sale_invoice_sequence = sale_invoice_sequence + 1 WHERE id = p_business_id;

  ELSIF p_type = 'purchase' THEN
    SELECT purchase_prefix, purchase_sequence INTO v_prefix, v_sequence
    FROM businesses WHERE id = p_business_id FOR UPDATE;
    UPDATE businesses SET purchase_sequence = purchase_sequence + 1 WHERE id = p_business_id;

  ELSIF p_type = 'receipt' THEN
    SELECT receipt_prefix, receipt_sequence INTO v_prefix, v_sequence
    FROM businesses WHERE id = p_business_id FOR UPDATE;
    UPDATE businesses SET receipt_sequence = receipt_sequence + 1 WHERE id = p_business_id;

  ELSIF p_type = 'payment' THEN
    SELECT payment_prefix, payment_sequence INTO v_prefix, v_sequence
    FROM businesses WHERE id = p_business_id FOR UPDATE;
    UPDATE businesses SET payment_sequence = payment_sequence + 1 WHERE id = p_business_id;

  ELSE  -- voucher
    SELECT voucher_prefix, voucher_sequence INTO v_prefix, v_sequence
    FROM businesses WHERE id = p_business_id FOR UPDATE;
    UPDATE businesses SET voucher_sequence = voucher_sequence + 1 WHERE id = p_business_id;
  END IF;

  v_number := v_prefix || '-' || LPAD(v_sequence::TEXT, 5, '0');
  RETURN v_number;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- FUNCTION: Audit log helper (called from app layer)
-- ============================================================
CREATE OR REPLACE FUNCTION fn_audit_log(
  p_business_id UUID,
  p_user_id     UUID,
  p_action      VARCHAR,
  p_entity      VARCHAR,
  p_entity_id   UUID,
  p_old_values  JSONB DEFAULT NULL,
  p_new_values  JSONB DEFAULT NULL,
  p_ip_address  VARCHAR DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
  INSERT INTO audit_logs (
    business_id, user_id, action, entity, entity_id,
    old_values, new_values, ip_address
  ) VALUES (
    p_business_id, p_user_id, p_action, p_entity, p_entity_id,
    p_old_values, p_new_values, p_ip_address
  );
END;
$$ LANGUAGE plpgsql;
