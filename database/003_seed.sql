-- ============================================================
--  VYAPARI APP — DEVELOPMENT SEED DATA
--  003_seed.sql
--  Run only in development. DO NOT run in production.
-- ============================================================

-- NOTE: password = "Password@123" (bcrypt hash)
-- Generate your own with: node -e "require('bcryptjs').hash('Password@123',12).then(console.log)"
-- Using a placeholder hash here — replace with actual bcrypt output at startup

DO $$
DECLARE
  v_user_id     UUID;
  v_biz_id      UUID;
  v_branch_id   UUID;
  v_party1_id   UUID;
  v_party2_id   UUID;
  v_party3_id   UUID;
  v_item1_id    UUID;
  v_item2_id    UUID;
  v_item3_id    UUID;
  v_item4_id    UUID;
BEGIN

-- ============================================================
-- DEMO USER
-- ============================================================
INSERT INTO users (id, name, email, password_hash, is_verified)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Rajesh Kumar',
  'demo@vyapari.app',
  '$2a$12$PLACEHOLDER_HASH_REPLACE_WITH_REAL_BCRYPT_OUTPUT',  -- Password@123
  TRUE
) ON CONFLICT (email) DO NOTHING
RETURNING id INTO v_user_id;

IF v_user_id IS NULL THEN
  SELECT id INTO v_user_id FROM users WHERE email = 'demo@vyapari.app';
END IF;

-- ============================================================
-- DEMO BUSINESS
-- ============================================================
INSERT INTO businesses (
  id, owner_id, name, legal_name, business_type,
  gst_number, pan_number,
  address_line1, city, state, state_code, pincode,
  phone, email,
  financial_year_start,
  sale_invoice_prefix, purchase_prefix,
  is_gst_registered
) VALUES (
  '00000000-0000-0000-0000-000000000002',
  v_user_id,
  'Shree Ram Traders',
  'Shree Ram Traders',
  'proprietorship',
  '27AABCU9603R1ZM',
  'AABCU9603R',
  '123, Main Market, Shivaji Nagar',
  'Pune', 'Maharashtra', '27', '411005',
  '9876543210', 'shreeramtraders@gmail.com',
  '2024-04-01',
  'SRT', 'PUR',
  TRUE
) ON CONFLICT DO NOTHING
RETURNING id INTO v_biz_id;

IF v_biz_id IS NULL THEN
  SELECT id INTO v_biz_id FROM businesses WHERE owner_id = v_user_id LIMIT 1;
END IF;

-- Seed chart of accounts
PERFORM fn_seed_chart_of_accounts(v_biz_id);

-- ============================================================
-- DEMO BRANCH (HQ)
-- ============================================================
INSERT INTO branches (
  id, business_id, name, code,
  gst_number, address_line1, city, state, state_code, pincode,
  is_headquarters
) VALUES (
  '00000000-0000-0000-0000-000000000003',
  v_biz_id,
  'Main Branch',
  'HQ',
  '27AABCU9603R1ZM',
  '123, Main Market, Shivaji Nagar',
  'Pune', 'Maharashtra', '27', '411005',
  TRUE
) ON CONFLICT DO NOTHING
RETURNING id INTO v_branch_id;

IF v_branch_id IS NULL THEN
  SELECT id INTO v_branch_id FROM branches WHERE business_id = v_biz_id LIMIT 1;
END IF;

-- ============================================================
-- PARTIES
-- ============================================================
INSERT INTO parties (id, business_id, name, party_type, gst_number, phone, email, city, state, state_code, credit_days)
VALUES (
  '00000000-0000-0000-0000-000000000010',
  v_biz_id, 'Anand Wholesale Pvt Ltd', 'customer',
  '27AAAAA1234A1Z5', '9811112222', 'anand@example.com',
  'Mumbai', 'Maharashtra', '27', 30
) ON CONFLICT DO NOTHING RETURNING id INTO v_party1_id;

INSERT INTO parties (id, business_id, name, party_type, gst_number, phone, email, city, state, state_code, credit_days)
VALUES (
  '00000000-0000-0000-0000-000000000011',
  v_biz_id, 'Bharat Kirana Store', 'customer',
  NULL, '9833334444', 'bharat@example.com',
  'Pune', 'Maharashtra', '27', 15
) ON CONFLICT DO NOTHING RETURNING id INTO v_party2_id;

INSERT INTO parties (id, business_id, name, party_type, gst_number, phone, email, city, state, state_code)
VALUES (
  '00000000-0000-0000-0000-000000000012',
  v_biz_id, 'Gujarat Distributors', 'supplier',
  '24BBBBB5678B2Z6', '9855556666', 'gujarat@example.com',
  'Ahmedabad', 'Gujarat', '24'
) ON CONFLICT DO NOTHING RETURNING id INTO v_party3_id;

-- ============================================================
-- ITEMS
-- ============================================================
INSERT INTO items (id, business_id, name, item_type, hsn_sac_code, unit, gst_rate, sale_price, purchase_price, opening_stock, current_stock, min_stock_alert)
VALUES (
  '00000000-0000-0000-0000-000000000020',
  v_biz_id, 'Basmati Rice (5kg)', 'goods',
  '1006', 'BAG', 5, 450.00, 380.00, 100, 100, 10
) ON CONFLICT DO NOTHING RETURNING id INTO v_item1_id;

INSERT INTO items (id, business_id, name, item_type, hsn_sac_code, unit, gst_rate, sale_price, purchase_price, opening_stock, current_stock, min_stock_alert)
VALUES (
  '00000000-0000-0000-0000-000000000021',
  v_biz_id, 'Toor Dal (1kg)', 'goods',
  '0713', 'KG', 5, 120.00, 95.00, 200, 200, 20
) ON CONFLICT DO NOTHING RETURNING id INTO v_item2_id;

INSERT INTO items (id, business_id, name, item_type, hsn_sac_code, unit, gst_rate, sale_price, purchase_price, opening_stock, current_stock, min_stock_alert)
VALUES (
  '00000000-0000-0000-0000-000000000022',
  v_biz_id, 'Sunflower Oil (1L)', 'goods',
  '1512', 'BTL', 5, 165.00, 140.00, 150, 150, 15
) ON CONFLICT DO NOTHING RETURNING id INTO v_item3_id;

INSERT INTO items (id, business_id, name, item_type, hsn_sac_code, unit, gst_rate, sale_price, purchase_price, track_inventory)
VALUES (
  '00000000-0000-0000-0000-000000000023',
  v_biz_id, 'Delivery Charges', 'service',
  '9965', 'PCS', 18, 100.00, 0.00, FALSE
) ON CONFLICT DO NOTHING RETURNING id INTO v_item4_id;

END $$;
