'use strict';
const { query, withTransaction } = require('../config/db');
const { asyncHandler, AppError } = require('../middleware/errorHandler');

// GET /api/businesses
const listBusinesses = asyncHandler(async (req, res) => {
  // Return businesses the user owns OR is assigned to via user_roles
  const result = await query(
    `SELECT DISTINCT
       b.id, b.name, b.legal_name, b.gst_number, b.state, b.city,
       b.phone, b.email, b.logo_url, b.is_gst_registered, b.created_at,
       CASE WHEN b.owner_id = $1 THEN 'owner'
            ELSE ur.role END AS user_role
     FROM businesses b
     LEFT JOIN user_roles ur ON ur.business_id = b.id
       AND ur.user_id = $1 AND ur.is_active = TRUE
     WHERE b.is_active = TRUE
       AND (b.owner_id = $1 OR ur.id IS NOT NULL)
     ORDER BY b.created_at`,
    [req.user.id]
  );
  res.json({ businesses: result.rows });
});

// GET /api/businesses/:businessId
// Any user with access (owner or invited) can view business details
const getBusiness = asyncHandler(async (req, res) => {
  const result = await query(
    `SELECT b.*,
       CASE WHEN b.owner_id = $2 THEN 'owner'
            ELSE ur.role END AS user_role
     FROM businesses b
     LEFT JOIN user_roles ur ON ur.business_id = b.id
       AND ur.user_id = $2 AND ur.is_active = TRUE
     WHERE b.id = $1
       AND (b.owner_id = $2 OR ur.id IS NOT NULL)`,
    [req.params.businessId, req.user.id]
  );
  if (!result.rows.length) throw new AppError('Business not found', 404);
  res.json({ business: result.rows[0] });
});

// POST /api/businesses
const createBusiness = asyncHandler(async (req, res) => {
  const {
    name, legalName, businessType, gstNumber, panNumber,
    cinNumber, tanNumber, addressLine1, addressLine2,
    city, state, stateCode, pincode, phone, email, website,
    financialYearStart, saleInvoicePrefix, purchasePrefix,
    isGstRegistered,
  } = req.body;

  if (!name?.trim()) throw new AppError('Business name is required', 400);

  return withTransaction(async (client) => {
    const result = await client.query(
      `INSERT INTO businesses (
         owner_id, name, legal_name, business_type,
         gst_number, pan_number, cin_number, tan_number,
         address_line1, address_line2, city, state, state_code, pincode,
         phone, email, website,
         financial_year_start,
         sale_invoice_prefix, purchase_prefix,
         is_gst_registered
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
       RETURNING *`,
      [
        req.user.id, name.trim(), legalName || null, businessType || 'proprietorship',
        gstNumber?.toUpperCase() || null, panNumber?.toUpperCase() || null,
        cinNumber || null, tanNumber || null,
        addressLine1 || null, addressLine2 || null,
        city || null, state || null, stateCode || null, pincode || null,
        phone || null, email?.toLowerCase() || null, website || null,
        financialYearStart || null,
        saleInvoicePrefix || 'INV',
        purchasePrefix    || 'PUR',
        isGstRegistered !== false,
      ]
    );
    const business = result.rows[0];

    // Seed Chart of Accounts
    await client.query('SELECT fn_seed_chart_of_accounts($1)', [business.id]);

    // Create default HQ branch
    await client.query(
      `INSERT INTO branches (business_id, name, code, gst_number, address_line1,
         city, state, state_code, pincode, is_headquarters)
       VALUES ($1,'Main Branch','HQ',$2,$3,$4,$5,$6,$7,TRUE)`,
      [business.id, gstNumber || null, addressLine1 || null,
       city || null, state || null, stateCode || null, pincode || null]
    );

    res.status(201).json({ business });
  });
});

// PUT /api/businesses/:businessId
const updateBusiness = asyncHandler(async (req, res) => {
  const {
    name, legalName, businessType, gstNumber, panNumber,
    addressLine1, addressLine2, city, state, stateCode, pincode,
    phone, email, website, saleInvoicePrefix, purchasePrefix,
    isGstRegistered,
  } = req.body;

  const result = await query(
    `UPDATE businesses SET
       name=$1, legal_name=$2, business_type=$3,
       gst_number=$4, pan_number=$5,
       address_line1=$6, address_line2=$7, city=$8, state=$9, state_code=$10, pincode=$11,
       phone=$12, email=$13, website=$14,
       sale_invoice_prefix=$15, purchase_prefix=$16,
       is_gst_registered=$17, updated_at=NOW()
     WHERE id=$18 AND owner_id=$19 RETURNING *`,
    [
      name?.trim(), legalName || null, businessType || 'proprietorship',
      gstNumber?.toUpperCase() || null, panNumber?.toUpperCase() || null,
      addressLine1 || null, addressLine2 || null, city || null,
      state || null, stateCode || null, pincode || null,
      phone || null, email?.toLowerCase() || null, website || null,
      saleInvoicePrefix || 'INV', purchasePrefix || 'PUR',
      isGstRegistered !== false,
      req.params.businessId, req.user.id,
    ]
  );
  if (!result.rows.length) throw new AppError('Business not found', 404);
  res.json({ business: result.rows[0] });
});

module.exports = { listBusinesses, getBusiness, createBusiness, updateBusiness };
