'use strict';
const { query, withTransaction } = require('../config/db');
const { asyncHandler, AppError, ApiResponse } = require('../middleware/errorHandler');
const logger = require('../config/logger');

// ============================================================
// POST /api/businesses/:businessId/backup
// Exports a full logical backup of all business data as JSON
// ============================================================
const createBackup = asyncHandler(async (req, res) => {
  const bizId  = req.businessId;
  const userId = req.user.id;

  // Log backup attempt
  const logResult = await query(
    `INSERT INTO backup_log (business_id, initiated_by, backup_type, status, started_at)
     VALUES ($1, $2, 'full', 'running', NOW()) RETURNING id`,
    [bizId, userId]
  );
  const logId = logResult.rows[0].id;

  try {
    const [
      business, accounts, parties, items,
      invoices, invoiceItems, vouchers, ledgerEntries,
      payments, paymentAllocs, expenses,
    ] = await Promise.all([
      query('SELECT * FROM businesses     WHERE id=$1',          [bizId]),
      query('SELECT * FROM accounts       WHERE business_id=$1 ORDER BY code', [bizId]),
      query('SELECT * FROM parties        WHERE business_id=$1 ORDER BY name', [bizId]),
      query('SELECT * FROM items          WHERE business_id=$1 ORDER BY name', [bizId]),
      query('SELECT * FROM invoices       WHERE business_id=$1 ORDER BY invoice_date', [bizId]),
      query(`SELECT ii.* FROM invoice_items ii
             JOIN invoices i ON i.id = ii.invoice_id
             WHERE i.business_id=$1 ORDER BY ii.sort_order`, [bizId]),
      query('SELECT * FROM vouchers       WHERE business_id=$1 ORDER BY voucher_date', [bizId]),
      query('SELECT * FROM ledger_entries WHERE business_id=$1 ORDER BY entry_date', [bizId]),
      query('SELECT * FROM payments       WHERE business_id=$1 ORDER BY payment_date', [bizId]),
      query(`SELECT pa.* FROM payment_allocations pa
             JOIN payments p ON p.id = pa.payment_id
             WHERE p.business_id=$1`, [bizId]),
      query('SELECT * FROM expenses       WHERE business_id=$1 ORDER BY expense_date', [bizId]),
    ]);

    const rowCounts = {
      accounts:      accounts.rows.length,
      parties:       parties.rows.length,
      items:         items.rows.length,
      invoices:      invoices.rows.length,
      vouchers:      vouchers.rows.length,
      ledgerEntries: ledgerEntries.rows.length,
      payments:      payments.rows.length,
      expenses:      expenses.rows.length,
    };

    const backup = {
      version:     '1.0.0',
      exportedAt:  new Date().toISOString(),
      businessId:  bizId,
      exportedBy:  userId,
      business:    business.rows[0],
      accounts:    accounts.rows,
      parties:     parties.rows,
      items:       items.rows,
      invoices:    invoices.rows,
      invoiceItems: invoiceItems.rows,
      vouchers:    vouchers.rows,
      ledgerEntries: ledgerEntries.rows,
      payments:    payments.rows,
      paymentAllocations: paymentAllocs.rows,
      expenses:    expenses.rows,
    };

    const jsonStr  = JSON.stringify(backup);
    const sizeKb   = Math.round(Buffer.byteLength(jsonStr, 'utf8') / 1024);

    // Update log
    await query(
      `UPDATE backup_log SET status='completed', completed_at=NOW(),
         file_size_kb=$1, row_counts=$2 WHERE id=$3`,
      [sizeKb, JSON.stringify(rowCounts), logId]
    );

    logger.info('Backup created', { bizId, sizeKb, rowCounts });

    // Stream JSON as download
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition',
      `attachment; filename="vyapari-backup-${bizId}-${new Date().toISOString().split('T')[0]}.json"`);
    res.send(jsonStr);

  } catch (err) {
    await query(
      `UPDATE backup_log SET status='failed', completed_at=NOW(), error_message=$1 WHERE id=$2`,
      [err.message, logId]
    );
    throw err;
  }
});

// ============================================================
// GET /api/businesses/:businessId/backup/logs
// List past backup attempts
// ============================================================
const listBackups = asyncHandler(async (req, res) => {
  const result = await query(
    `SELECT id, backup_type, status, file_size_kb, row_counts,
            started_at, completed_at, error_message
     FROM backup_log WHERE business_id=$1
     ORDER BY created_at DESC LIMIT 20`,
    [req.businessId]
  );
  ApiResponse.success(res, { backups: result.rows });
});

// ============================================================
// POST /api/businesses/:businessId/restore  (OWNER ONLY)
// Restore from a JSON backup — DESTRUCTIVE, owner only
// ============================================================
const restoreBackup = asyncHandler(async (req, res) => {
  if (req.userRole !== 'owner') {
    throw new AppError('Only business owner can restore from backup', 403, 'FORBIDDEN');
  }

  const backup = req.body;

  // Validate backup shape
  if (!backup?.version || !backup?.businessId || !backup?.business) {
    throw new AppError('Invalid backup file format', 400, 'INVALID_BACKUP');
  }
  if (backup.businessId !== req.businessId) {
    throw new AppError('Backup businessId does not match current business', 400, 'BACKUP_MISMATCH');
  }

  logger.warn('Restore requested', { bizId: req.businessId, by: req.user.id });

  await withTransaction(async (client) => {
    const bId = req.businessId;

    // Delete all existing data (in reverse FK order)
    await client.query('DELETE FROM ledger_entries WHERE business_id=$1', [bId]);
    await client.query('DELETE FROM vouchers WHERE business_id=$1', [bId]);
    await client.query('DELETE FROM payment_allocations WHERE payment_id IN (SELECT id FROM payments WHERE business_id=$1)', [bId]);
    await client.query('DELETE FROM payments WHERE business_id=$1', [bId]);
    await client.query('DELETE FROM invoice_items WHERE invoice_id IN (SELECT id FROM invoices WHERE business_id=$1)', [bId]);
    await client.query('DELETE FROM invoices WHERE business_id=$1', [bId]);
    await client.query('DELETE FROM expenses WHERE business_id=$1', [bId]);
    await client.query('DELETE FROM stock_movements WHERE business_id=$1', [bId]);
    await client.query('DELETE FROM items WHERE business_id=$1', [bId]);
    await client.query('DELETE FROM parties WHERE business_id=$1', [bId]);
    await client.query('DELETE FROM accounts WHERE business_id=$1', [bId]);
    await client.query('DELETE FROM fy_sequences WHERE business_id=$1', [bId]);

    // Restore accounts
    for (const row of (backup.accounts || [])) {
      await client.query(
        `INSERT INTO accounts (id,business_id,parent_id,code,name,account_type,account_subtype,
           normal_balance,opening_balance,opening_balance_type,is_system,is_active,is_group,
           bank_name,account_number,ifsc_code,description)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
         ON CONFLICT (id) DO NOTHING`,
        [row.id,bId,row.parent_id,row.code,row.name,row.account_type,row.account_subtype,
         row.normal_balance,row.opening_balance,row.opening_balance_type,row.is_system,
         row.is_active,row.is_group,row.bank_name,row.account_number,row.ifsc_code,row.description]
      );
    }

    // Restore parties
    for (const row of (backup.parties || [])) {
      await client.query(
        `INSERT INTO parties (id,business_id,account_id,name,party_type,gst_number,pan_number,
           phone,email,address_line1,city,state,state_code,pincode,opening_balance,
           opening_balance_type,credit_limit,credit_days,notes,is_active)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
         ON CONFLICT (id) DO NOTHING`,
        [row.id,bId,row.account_id,row.name,row.party_type,row.gst_number,row.pan_number,
         row.phone,row.email,row.address_line1,row.city,row.state,row.state_code,row.pincode,
         row.opening_balance,row.opening_balance_type,row.credit_limit,row.credit_days,
         row.notes,row.is_active]
      );
    }

    // Restore items
    for (const row of (backup.items || [])) {
      await client.query(
        `INSERT INTO items (id,business_id,name,sku,item_type,hsn_sac_code,unit,gst_rate,cess_rate,
           sale_price,purchase_price,mrp,track_inventory,opening_stock,current_stock,
           min_stock_alert,is_active)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
         ON CONFLICT (id) DO NOTHING`,
        [row.id,bId,row.name,row.sku,row.item_type,row.hsn_sac_code,row.unit,row.gst_rate,
         row.cess_rate,row.sale_price,row.purchase_price,row.mrp,row.track_inventory,
         row.opening_stock,row.current_stock,row.min_stock_alert,row.is_active]
      );
    }

    // Restore invoices (disable triggers temporarily is not safe; re-insert directly)
    for (const row of (backup.invoices || [])) {
      await client.query(
        `INSERT INTO invoices (id,business_id,invoice_type,invoice_number,party_id,party_name,
           party_gst,party_address,party_city,party_state,party_state_code,
           invoice_date,due_date,is_inter_state,place_of_supply,
           subtotal,total_discount,taxable_amount,cgst_amount,sgst_amount,igst_amount,
           cess_amount,total_tax,other_charges,round_off,total_amount,
           amount_paid,balance_due,status,notes,voucher_id,created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32)
         ON CONFLICT (id) DO NOTHING`,
        [row.id,bId,row.invoice_type,row.invoice_number,row.party_id,row.party_name,
         row.party_gst,row.party_address,row.party_city,row.party_state,row.party_state_code,
         row.invoice_date,row.due_date,row.is_inter_state,row.place_of_supply,
         row.subtotal,row.total_discount,row.taxable_amount,row.cgst_amount,row.sgst_amount,
         row.igst_amount,row.cess_amount,row.total_tax,row.other_charges,row.round_off,
         row.total_amount,row.amount_paid,row.balance_due,row.status,row.notes,
         row.voucher_id,row.created_by]
      );
    }

    // Restore invoice_items (skip stock trigger effects by setting current_stock from backup)
    for (const row of (backup.invoiceItems || [])) {
      await client.query(
        `INSERT INTO invoice_items (id,invoice_id,item_id,item_name,hsn_sac_code,unit,
           quantity,rate,discount_percent,discount_amount,taxable_amount,
           gst_rate,cgst_rate,cgst_amount,sgst_rate,sgst_amount,igst_rate,igst_amount,
           cess_rate,cess_amount,total,sort_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
         ON CONFLICT (id) DO NOTHING`,
        [row.id,row.invoice_id,row.item_id,row.item_name,row.hsn_sac_code,row.unit,
         row.quantity,row.rate,row.discount_percent,row.discount_amount,row.taxable_amount,
         row.gst_rate,row.cgst_rate,row.cgst_amount,row.sgst_rate,row.sgst_amount,
         row.igst_rate,row.igst_amount,row.cess_rate,row.cess_amount,row.total,row.sort_order]
      );
    }

    // Restore vouchers
    for (const row of (backup.vouchers || [])) {
      await client.query(
        `INSERT INTO vouchers (id,business_id,voucher_type,voucher_number,voucher_date,
           narration,reference,total_debit,total_credit,is_balanced,is_posted,
           invoice_id,created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         ON CONFLICT (id) DO NOTHING`,
        [row.id,bId,row.voucher_type,row.voucher_number,row.voucher_date,
         row.narration,row.reference,row.total_debit,row.total_credit,row.is_balanced,
         row.is_posted,row.invoice_id,row.created_by]
      );
    }

    // Restore ledger entries
    for (const row of (backup.ledgerEntries || [])) {
      await client.query(
        `INSERT INTO ledger_entries (id,voucher_id,business_id,account_id,account_name,
           account_type,debit,credit,narration,party_id,invoice_id,sort_order,entry_date)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         ON CONFLICT (id) DO NOTHING`,
        [row.id,row.voucher_id,bId,row.account_id,row.account_name,row.account_type,
         row.debit,row.credit,row.narration,row.party_id,row.invoice_id,
         row.sort_order,row.entry_date]
      );
    }

    // Restore payments
    for (const row of (backup.payments || [])) {
      await client.query(
        `INSERT INTO payments (id,business_id,payment_type,payment_number,payment_date,
           party_id,party_name,amount,payment_mode,narration,status,voucher_id,created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         ON CONFLICT (id) DO NOTHING`,
        [row.id,bId,row.payment_type,row.payment_number,row.payment_date,
         row.party_id,row.party_name,row.amount,row.payment_mode,row.narration,
         row.status,row.voucher_id,row.created_by]
      );
    }

    // Restore payment allocations
    for (const row of (backup.paymentAllocations || [])) {
      await client.query(
        `INSERT INTO payment_allocations (id,payment_id,invoice_id,amount)
         VALUES ($1,$2,$3,$4) ON CONFLICT (id) DO NOTHING`,
        [row.id, row.payment_id, row.invoice_id, row.amount]
      );
    }

    // Restore expenses
    for (const row of (backup.expenses || [])) {
      await client.query(
        `INSERT INTO expenses (id,business_id,expense_date,category,description,
           amount,gst_amount,total_amount,payment_mode,voucher_id,created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         ON CONFLICT (id) DO NOTHING`,
        [row.id,bId,row.expense_date,row.category,row.description,
         row.amount,row.gst_amount,row.total_amount,row.payment_mode,
         row.voucher_id,row.created_by]
      );
    }

    await query(
      `INSERT INTO backup_log (business_id, initiated_by, backup_type, status, started_at, completed_at, row_counts)
       VALUES ($1,$2,'restore','completed',NOW(),NOW(),$3)`,
      [bId, userId, JSON.stringify({ restored: true, from: backup.exportedAt })]
    );
  });

  logger.info('Restore completed', { bizId: req.businessId, by: req.user.id });
  ApiResponse.success(res, { message: 'Restore completed successfully' });
});

module.exports = { createBackup, listBackups, restoreBackup };
