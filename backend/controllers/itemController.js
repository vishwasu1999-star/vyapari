'use strict';
const { query }         = require('../config/db');
const { asyncHandler, AppError } = require('../middleware/errorHandler');
const { getPagination, paginatedResponse, toFloat } = require('../utils/helpers');

// ============================================================
// GET /api/businesses/:businessId/items
// ============================================================
const listItems = asyncHandler(async (req, res) => {
  const bId = req.businessId;
  const { page, limit, offset } = getPagination(req);
  const { type, search, lowStock, sortBy = 'name', order = 'ASC' } = req.query;

  let where  = 'WHERE business_id = $1 AND is_active = TRUE';
  const params = [bId];
  let idx = 2;

  if (type) { where += ` AND item_type = $${idx++}`; params.push(type); }
  if (search) {
    where += ` AND (name ILIKE $${idx} OR sku ILIKE $${idx} OR hsn_sac_code ILIKE $${idx})`;
    params.push(`%${search}%`); idx++;
  }
  if (lowStock === 'true') {
    where += ' AND track_inventory = TRUE AND current_stock <= min_stock_alert AND min_stock_alert > 0';
  }

  const allowed = { name: 'name', sale_price: 'sale_price', current_stock: 'current_stock', created_at: 'created_at' };
  const sortCol = allowed[sortBy] || 'name';
  const sortDir = order.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

  const countResult = await query(`SELECT COUNT(*) FROM items ${where}`, params);
  const total = parseInt(countResult.rows[0].count);

  const result = await query(
    `SELECT id, name, sku, item_type, hsn_sac_code, unit,
            gst_rate, sale_price, purchase_price, mrp,
            track_inventory, current_stock, min_stock_alert, opening_stock,
            is_active, created_at
     FROM items ${where}
     ORDER BY ${sortCol} ${sortDir}
     LIMIT $${idx} OFFSET $${idx + 1}`,
    [...params, limit, offset]
  );

  res.json(paginatedResponse(result.rows, total, page, limit));
});

// ============================================================
// GET /api/businesses/:businessId/items/:id
// ============================================================
const getItem = asyncHandler(async (req, res) => {
  const result = await query(
    'SELECT * FROM items WHERE id=$1 AND business_id=$2',
    [req.params.id, req.businessId]
  );
  if (!result.rows.length) throw new AppError('Item not found', 404);
  res.json({ item: result.rows[0] });
});

// ============================================================
// POST /api/businesses/:businessId/items
// ============================================================
const createItem = asyncHandler(async (req, res) => {
  const bId = req.businessId;
  const {
    name, sku, description, itemType,
    hsnSacCode, unit, gstRate, cessRate, isTaxInclusive,
    salePrice, purchasePrice, mrp,
    trackInventory, openingStock, currentStock, minStockAlert, maxStock,
    category, barcode, imageUrl,
  } = req.body;

  if (!name?.trim()) throw new AppError('Item name is required', 400);
  if (!['goods', 'service'].includes(itemType || 'goods')) {
    throw new AppError("itemType must be 'goods' or 'service'", 400);
  }

  const stockQty   = trackInventory !== false ? toFloat(openingStock) : 0;
  const currStock  = toFloat(currentStock) || stockQty;

  const result = await query(
    `INSERT INTO items (
       business_id, name, sku, description, item_type,
       hsn_sac_code, unit, gst_rate, cess_rate, is_tax_inclusive,
       sale_price, purchase_price, mrp,
       track_inventory, opening_stock, current_stock, min_stock_alert, max_stock,
       category, barcode, image_url
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
     RETURNING *`,
    [
      bId, name.trim(), sku || null, description || null, itemType || 'goods',
      hsnSacCode || null, unit || 'PCS',
      toFloat(gstRate), toFloat(cessRate), isTaxInclusive === true,
      toFloat(salePrice), toFloat(purchasePrice), mrp ? toFloat(mrp) : null,
      trackInventory !== false, stockQty, currStock,
      toFloat(minStockAlert), maxStock ? toFloat(maxStock) : null,
      category || null, barcode || null, imageUrl || null,
    ]
  );

  res.status(201).json({ item: result.rows[0] });
});

// ============================================================
// PUT /api/businesses/:businessId/items/:id
// ============================================================
const updateItem = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const bId    = req.businessId;
  const {
    name, sku, description, itemType,
    hsnSacCode, unit, gstRate, cessRate, isTaxInclusive,
    salePrice, purchasePrice, mrp,
    trackInventory, minStockAlert, maxStock,
    category, barcode, imageUrl,
  } = req.body;

  const result = await query(
    `UPDATE items SET
       name=$1, sku=$2, description=$3, item_type=$4,
       hsn_sac_code=$5, unit=$6, gst_rate=$7, cess_rate=$8, is_tax_inclusive=$9,
       sale_price=$10, purchase_price=$11, mrp=$12,
       track_inventory=$13, min_stock_alert=$14, max_stock=$15,
       category=$16, barcode=$17, image_url=$18,
       updated_at=NOW()
     WHERE id=$19 AND business_id=$20
     RETURNING *`,
    [
      name?.trim(), sku || null, description || null, itemType || 'goods',
      hsnSacCode || null, unit || 'PCS',
      toFloat(gstRate), toFloat(cessRate), isTaxInclusive === true,
      toFloat(salePrice), toFloat(purchasePrice), mrp ? toFloat(mrp) : null,
      trackInventory !== false, toFloat(minStockAlert), maxStock ? toFloat(maxStock) : null,
      category || null, barcode || null, imageUrl || null,
      id, bId,
    ]
  );
  if (!result.rows.length) throw new AppError('Item not found', 404);
  res.json({ item: result.rows[0] });
});

// ============================================================
// DELETE /api/businesses/:businessId/items/:id
// ============================================================
const deleteItem = asyncHandler(async (req, res) => {
  const { id } = req.params;

  // Verify item belongs to this business first
  const itemCheck = await query(
    'SELECT id FROM items WHERE id=$1 AND business_id=$2 AND is_active=TRUE',
    [id, req.businessId]
  );
  if (!itemCheck.rows.length) throw new AppError('Item not found', 404);

  // Check if used in any invoice within this business
  const used = await query(
    `SELECT COUNT(*) FROM invoice_items ii
     JOIN invoices i ON i.id = ii.invoice_id
     WHERE ii.item_id=$1 AND i.business_id=$2`,
    [id, req.businessId]
  );
  if (parseInt(used.rows[0].count) > 0) {
    throw new AppError('Cannot delete item used in invoices', 400);
  }

  await query(
    'UPDATE items SET is_active=FALSE, updated_at=NOW() WHERE id=$1 AND business_id=$2',
    [id, req.businessId]
  );
  res.json({ message: 'Item deleted' });
});

// ============================================================
// PATCH /api/businesses/:businessId/items/:id/stock
// Manual stock adjustment
// ============================================================
const adjustStock = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { quantity, reason } = req.body;

  if (quantity === undefined) throw new AppError('quantity is required', 400);

  const result = await query(
    `UPDATE items
     SET current_stock = current_stock + $1, updated_at = NOW()
     WHERE id=$2 AND business_id=$3 AND track_inventory=TRUE
     RETURNING id, name, current_stock`,
    [toFloat(quantity), id, req.businessId]
  );
  if (!result.rows.length) throw new AppError('Item not found or inventory not tracked', 404);
  res.json({ item: result.rows[0], message: `Stock adjusted by ${quantity}` });
});

module.exports = { listItems, getItem, createItem, updateItem, deleteItem, adjustStock };
