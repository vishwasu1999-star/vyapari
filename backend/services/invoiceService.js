'use strict';
const { withTransaction }     = require('../config/db');
const { createSaleVoucher, createPurchaseVoucher } = require('./accountingEngine');
const { calculateItemTax, calculateInvoiceTotals, determineInterState } = require('./gstService');
const { toFloat, round2 }     = require('../utils/helpers');
const logger                  = require('../config/logger');

// ============================================================
// Get or create a party's personal ledger account
// ============================================================
const ensurePartyAccount = async (client, businessId, party) => {
  if (party.account_id) return party.account_id;

  const isSupplier  = party.party_type === 'supplier';
  const accountType = isSupplier ? 'Liability' : 'Asset';
  const subType     = isSupplier ? 'Current Liability' : 'Current Asset';
  const normalBal   = isSupplier ? 'Cr' : 'Dr';

  const result = await client.query(
    `INSERT INTO accounts
       (business_id, name, account_type, account_subtype, normal_balance,
        opening_balance, opening_balance_type, is_system)
     VALUES ($1,$2,$3,$4,$5,$6,$7,FALSE)
     RETURNING id`,
    [
      businessId, party.name, accountType, subType, normalBal,
      toFloat(party.opening_balance), party.opening_balance_type || 'Dr',
    ]
  );
  const accountId = result.rows[0].id;
  await client.query('UPDATE parties SET account_id=$1 WHERE id=$2', [accountId, party.id]);
  return accountId;
};

// ============================================================
// Pre-check stock availability for all sale items
// Called inside the transaction BEFORE inserting invoice_items
// (The trigger also checks, but we want a cleaner error message
//  that names all failing items at once)
// ============================================================
const validateStockAvailability = async (client, businessId, items, isSale) => {
  if (!isSale) return; // purchases only increase stock

  // Check if business allows negative stock
  const bizResult = await client.query(
    'SELECT allow_negative_stock FROM businesses WHERE id=$1',
    [businessId]
  );
  if (bizResult.rows[0]?.allow_negative_stock) return; // allowed, skip check

  const insufficientItems = [];

  for (const item of items) {
    if (!item.item_id) continue;

    const stockResult = await client.query(
      'SELECT name, current_stock, track_inventory, unit FROM items WHERE id=$1',
      [item.item_id]
    );
    if (!stockResult.rows.length) continue;
    const stock = stockResult.rows[0];
    if (!stock.track_inventory) continue;

    const available = parseFloat(stock.current_stock);
    const required  = parseFloat(item.quantity);

    if (available < required) {
      insufficientItems.push({
        name:      stock.name,
        available,
        required,
        unit:      stock.unit,
      });
    }
  }

  if (insufficientItems.length > 0) {
    const details = insufficientItems
      .map(i => `${i.name}: need ${i.required} ${i.unit}, have ${i.available}`)
      .join('; ');
    const err = new Error(`Insufficient stock: ${details}`);
    err.code   = 'P0001'; // matches PG trigger error code for unified handling
    throw err;
  }
};

// ============================================================
// createInvoice — full pipeline in a single transaction
// ============================================================
const createInvoice = async (userId, businessId, data) => {
  return withTransaction(async (client) => {

    // ── 1. Fetch business config (with row lock to prevent sequence race) ──
    const bizRes = await client.query(
      `SELECT state_code, gst_number, is_gst_registered, round_off_enabled,
              sale_invoice_prefix, sale_invoice_sequence,
              purchase_prefix, purchase_sequence,
              allow_negative_stock, enable_fy_reset, current_fy_start
       FROM businesses WHERE id=$1 FOR UPDATE`,
      [businessId]
    );
    if (!bizRes.rows.length) throw new Error('Business not found');
    const biz = bizRes.rows[0];

    const isSale = data.invoiceType === 'sale';

    // ── 2. Fetch party ────────────────────────────────────────
    let party = null;
    if (data.partyId) {
      const partyRes = await client.query(
        'SELECT * FROM parties WHERE id=$1 AND business_id=$2 AND is_active=TRUE',
        [data.partyId, businessId]
      );
      if (!partyRes.rows.length) throw new Error(`Party ${data.partyId} not found or inactive`);
      party = partyRes.rows[0];
    }

    // ── 3. Determine inter-state ──────────────────────────────
    const partyStateCode = party?.state_code || data.partyStateCode || '';
    const isInterState   = data.isInterState !== undefined
      ? !!data.isInterState
      : determineInterState(biz.state_code, partyStateCode);

    // ── 4. Process line items with GST ────────────────────────
    if (!data.items?.length) throw new Error('Invoice must have at least one item');

    const processedItems = data.items.map((item, idx) => {
      const tax = calculateItemTax({
        rate:            toFloat(item.rate),
        qty:             toFloat(item.quantity),
        discountPercent: toFloat(item.discountPercent),
        gstRate:         toFloat(item.gstRate),
        cessRate:        toFloat(item.cessRate),
        isInterState,
        isTaxInclusive:  !!item.isTaxInclusive,
      });

      return {
        item_id:          item.itemId      || null,
        item_name:        (item.itemName   || item.name || '').trim(),
        description:      item.description || null,
        hsn_sac_code:     item.hsnSacCode  || null,
        unit:             item.unit        || 'PCS',
        quantity:         toFloat(item.quantity),
        rate:             toFloat(item.rate),
        discount_percent: tax.discountPercent,
        discount_amount:  tax.discountAmount,
        taxable_amount:   tax.taxableAmount,
        gst_rate:         tax.gstRate,
        cgst_rate:        tax.cgstRate,
        cgst_amount:      tax.cgstAmount,
        sgst_rate:        tax.sgstRate,
        sgst_amount:      tax.sgstAmount,
        igst_rate:        tax.igstRate,
        igst_amount:      tax.igstAmount,
        cess_rate:        tax.cessRate,
        cess_amount:      tax.cessAmount,
        total:            tax.lineTotal,
        sort_order:       idx,
      };
    });

    // ── 5. Stock availability check (before any DB writes) ────
    await validateStockAvailability(client, businessId, processedItems, isSale);

    // ── 6. Calculate invoice totals ───────────────────────────
    const totals = calculateInvoiceTotals(
      processedItems,
      toFloat(data.otherCharges),
      biz.round_off_enabled
    );

    // ── 7. Generate FY-aware invoice number ───────────────────
    const numResult = await client.query(
      'SELECT fn_next_invoice_number($1,$2) AS number',
      [businessId, isSale ? 'sale' : 'purchase']
    );
    const invoiceNumber = data.invoiceNumber || numResult.rows[0].number;

    // ── 8. Check for duplicate invoice number ─────────────────
    const dupCheck = await client.query(
      'SELECT id FROM invoices WHERE business_id=$1 AND invoice_type=$2 AND invoice_number=$3',
      [businessId, data.invoiceType || 'sale', invoiceNumber]
    );
    if (dupCheck.rows.length) {
      throw new Error(`Invoice number ${invoiceNumber} already exists`);
    }

    // ── 9. Insert invoice header ──────────────────────────────
    const invRes = await client.query(
      `INSERT INTO invoices (
         business_id, branch_id,
         invoice_type, invoice_number, reference_number,
         party_id, party_name, party_gst, party_pan,
         party_address, party_city, party_state, party_state_code, party_pincode,
         party_phone, party_email,
         invoice_date, due_date, supply_date,
         is_inter_state, place_of_supply, reverse_charge,
         subtotal, total_discount, taxable_amount,
         cgst_amount, sgst_amount, igst_amount, cess_amount, total_tax,
         other_charges, round_off, total_amount, balance_due,
         status, notes, terms_and_conditions, created_by
       ) VALUES (
         $1,$2,$3,$4,$5,
         $6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,
         $17,$18,$19,$20,$21,$22,
         $23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,
         $35,$36,$37,$38
       ) RETURNING *`,
      [
        businessId, data.branchId || null,
        data.invoiceType || 'sale', invoiceNumber, data.referenceNumber || null,
        party?.id || null,
        party?.name             || data.partyName   || '',
        party?.gst_number       || data.partyGst    || null,
        party?.pan_number       || data.partyPan    || null,
        party?.address_line1    || data.partyAddress || null,
        party?.city             || data.partyCity   || null,
        party?.state            || data.partyState  || null,
        partyStateCode          || null,
        party?.pincode          || null,
        party?.phone            || null,
        party?.email            || null,
        data.invoiceDate,
        data.dueDate    || null,
        data.supplyDate || null,
        isInterState,
        data.placeOfSupply || party?.state || null,
        !!data.reverseCharge,
        totals.subtotal,
        totals.totalDiscount,
        totals.taxableAmount,
        totals.cgstAmount,
        totals.sgstAmount,
        totals.igstAmount,
        totals.cessAmount,
        totals.totalTax,
        totals.otherCharges,
        totals.roundOff,
        totals.totalAmount,
        totals.totalAmount, // balance_due = total at creation
        data.status || 'unpaid',
        data.notes  || null,
        data.terms  || null,
        userId,
      ]
    );
    const invoice = invRes.rows[0];

    // ── 10. Insert line items ─────────────────────────────────
    for (const item of processedItems) {
      await client.query(
        `INSERT INTO invoice_items (
           invoice_id, item_id, item_name, description, hsn_sac_code,
           unit, quantity, rate,
           discount_percent, discount_amount, taxable_amount,
           gst_rate, cgst_rate, cgst_amount, sgst_rate, sgst_amount,
           igst_rate, igst_amount, cess_rate, cess_amount, total, sort_order
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)`,
        [
          invoice.id,
          item.item_id, item.item_name, item.description, item.hsn_sac_code,
          item.unit, item.quantity, item.rate,
          item.discount_percent, item.discount_amount, item.taxable_amount,
          item.gst_rate, item.cgst_rate, item.cgst_amount,
          item.sgst_rate, item.sgst_amount, item.igst_rate, item.igst_amount,
          item.cess_rate, item.cess_amount, item.total, item.sort_order,
        ]
      );
      // Note: stock is adjusted by DB trigger fn_adjust_item_stock
    }

    // ── 11. Create accounting voucher ─────────────────────────
    let partyAccountId = null;
    if (party) {
      partyAccountId = await ensurePartyAccount(client, businessId, party);
    }

    const voucherId = isSale
      ? await createSaleVoucher(client, businessId, userId, invoice, partyAccountId)
      : await createPurchaseVoucher(client, businessId, userId, invoice, partyAccountId);

    // ── 12. Link voucher to invoice ───────────────────────────
    await client.query(
      'UPDATE invoices SET voucher_id=$1 WHERE id=$2',
      [voucherId, invoice.id]
    );

    // ── 13. Audit log ─────────────────────────────────────────
    await client.query(
      `INSERT INTO audit_logs (business_id, user_id, action, entity, entity_id, new_values)
       VALUES ($1,$2,'CREATE','invoice',$3,$4)`,
      [
        businessId, userId, invoice.id,
        JSON.stringify({ invoiceNumber, total: totals.totalAmount, type: data.invoiceType }),
      ]
    );

    logger.info('Invoice created', {
      id:     invoice.id,
      number: invoiceNumber,
      total:  totals.totalAmount,
      type:   data.invoiceType,
    });

    return { ...invoice, items: processedItems, voucher_id: voucherId, totals };
  });
};

module.exports = { createInvoice, ensurePartyAccount };
