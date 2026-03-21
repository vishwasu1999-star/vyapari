'use strict';
/**
 * ============================================================
 *  PHASE 6 — GST MODULE
 *  India Goods & Services Tax calculation engine
 *
 *  Rules:
 *  - Same state (business state == party state) → CGST + SGST (each = gstRate/2)
 *  - Different state / Union Territory           → IGST (= gstRate)
 *  - Export / SEZ                                → IGST 0% (or LUT)
 *  - Reverse Charge Mechanism (RCM)              → buyer pays GST
 * ============================================================
 */

const { round2, toFloat } = require('../utils/helpers');

// ============================================================
// ITEM-LEVEL GST CALCULATION
// ============================================================
/**
 * Calculate GST for a single invoice line item.
 *
 * @param {object} params
 *   @param {number} rate           - unit rate (ex-tax if not inclusive)
 *   @param {number} qty            - quantity
 *   @param {number} discountPercent - 0–100
 *   @param {number} gstRate        - e.g. 18 for 18%
 *   @param {number} cessRate       - e.g. 0
 *   @param {boolean} isInterState  - determines IGST vs CGST+SGST
 *   @param {boolean} isTaxInclusive - if TRUE, rate already includes GST
 * @returns {object} full tax breakdown for the line
 */
const calculateItemTax = ({
  rate,
  qty,
  discountPercent = 0,
  gstRate         = 0,
  cessRate        = 0,
  isInterState    = false,
  isTaxInclusive  = false,
}) => {
  const r   = toFloat(rate);
  const q   = toFloat(qty);
  const dp  = toFloat(discountPercent);
  const gst = toFloat(gstRate);
  const cs  = toFloat(cessRate);

  // Gross before discount
  const grossAmount = round2(r * q);

  // Discount
  const discountAmount = round2(grossAmount * dp / 100);

  // Amount after discount (may include tax if inclusive)
  const afterDiscount = round2(grossAmount - discountAmount);

  // Taxable amount (always ex-GST)
  let taxableAmount;
  if (isTaxInclusive && gst > 0) {
    // Back-calculate: taxable = afterDiscount / (1 + gstRate/100)
    taxableAmount = round2(afterDiscount / (1 + gst / 100));
  } else {
    taxableAmount = afterDiscount;
  }

  // GST amounts
  const totalGstAmount = round2(taxableAmount * gst / 100);
  const cessAmount     = round2(taxableAmount * cs  / 100);

  let cgstRate = 0, cgstAmount = 0;
  let sgstRate = 0, sgstAmount = 0;
  let igstRate = 0, igstAmount = 0;

  if (isInterState) {
    igstRate   = gst;
    igstAmount = totalGstAmount;
  } else {
    cgstRate   = round2(gst / 2);
    sgstRate   = round2(gst / 2);
    // Calculate CGST first, then SGST = total - CGST to avoid rounding drift
    // This ensures cgstAmount + sgstAmount === totalGstAmount always
    cgstAmount = round2(taxableAmount * cgstRate / 100);
    sgstAmount = round2(totalGstAmount - cgstAmount);  // ensures exact sum
  }

  const lineTotal = round2(taxableAmount + totalGstAmount + cessAmount);

  return {
    grossAmount,
    discountPercent: dp,
    discountAmount,
    taxableAmount,
    gstRate:         gst,
    cgstRate,
    cgstAmount,
    sgstRate,
    sgstAmount,
    igstRate,
    igstAmount,
    cessRate:        cs,
    cessAmount,
    totalGstAmount:  round2(totalGstAmount + cessAmount),
    lineTotal,
  };
};

// ============================================================
// INVOICE-LEVEL TOTALS
// Aggregate line items into invoice summary
// ============================================================
/**
 * @param {Array}   items        - array of objects already processed by calculateItemTax
 * @param {number}  otherCharges - freight, packing etc. (not taxed)
 * @param {boolean} roundOff     - whether to round total to nearest rupee
 * @returns {object} invoice-level totals
 */
const calculateInvoiceTotals = (items, otherCharges = 0, roundOff = true) => {
  const subtotal       = round2(items.reduce((s, i) => s + i.grossAmount,    0));
  const totalDiscount  = round2(items.reduce((s, i) => s + i.discountAmount, 0));
  const taxableAmount  = round2(items.reduce((s, i) => s + i.taxableAmount,  0));
  const cgstAmount     = round2(items.reduce((s, i) => s + i.cgstAmount,     0));
  const sgstAmount     = round2(items.reduce((s, i) => s + i.sgstAmount,     0));
  const igstAmount     = round2(items.reduce((s, i) => s + i.igstAmount,     0));
  const cessAmount     = round2(items.reduce((s, i) => s + i.cessAmount,     0));
  const totalTax       = round2(cgstAmount + sgstAmount + igstAmount + cessAmount);
  const other          = round2(toFloat(otherCharges));

  const rawTotal  = round2(taxableAmount + totalTax + other);
  const rounded   = roundOff ? Math.round(rawTotal) : rawTotal;
  const roundDiff = round2(rounded - rawTotal);

  return {
    subtotal,
    totalDiscount,
    taxableAmount,
    cgstAmount,
    sgstAmount,
    igstAmount,
    cessAmount,
    totalTax,
    otherCharges: other,
    roundOff:     roundDiff,
    totalAmount:  rounded,
  };
};

// ============================================================
// DETERMINE INTER-STATE
// ============================================================
/**
 * Returns true if supply is inter-state (→ IGST applies)
 * @param {string} businessStateCode  - 2-digit GST state code of business
 * @param {string} partyStateCode     - 2-digit GST state code of party
 * @param {string} [placeOfSupply]    - override if manually set
 */
const determineInterState = (businessStateCode, partyStateCode, placeOfSupply) => {
  const pos = placeOfSupply || partyStateCode || '';
  if (!businessStateCode || !pos) return false;
  return businessStateCode.trim() !== pos.trim();
};

// ============================================================
// GST RATE BREAKDOWN  (for invoice summary / HSN summary)
// ============================================================
/**
 * Groups invoice line items by GST rate for GSTR-1 reporting
 * @param {Array} items - invoice items with tax fields
 * @returns {Array} grouped summary
 */
const buildGSTRateSummary = (items) => {
  const groups = {};

  for (const item of items) {
    const key = `${item.gstRate || 0}_${item.igstAmount > 0 ? 'inter' : 'intra'}`;
    if (!groups[key]) {
      groups[key] = {
        gstRate:      item.gstRate || 0,
        isInterState: (item.igstAmount || 0) > 0,
        taxableAmount: 0,
        cgstAmount:    0,
        sgstAmount:    0,
        igstAmount:    0,
        cessAmount:    0,
      };
    }
    groups[key].taxableAmount = round2(groups[key].taxableAmount + toFloat(item.taxableAmount));
    groups[key].cgstAmount    = round2(groups[key].cgstAmount    + toFloat(item.cgstAmount));
    groups[key].sgstAmount    = round2(groups[key].sgstAmount    + toFloat(item.sgstAmount));
    groups[key].igstAmount    = round2(groups[key].igstAmount    + toFloat(item.igstAmount));
    groups[key].cessAmount    = round2(groups[key].cessAmount    + toFloat(item.cessAmount));
  }

  return Object.values(groups).sort((a, b) => a.gstRate - b.gstRate);
};

// ============================================================
// HSN SUMMARY  (for GSTR-1 Table 12 / e-invoice)
// ============================================================
const buildHSNSummary = (items) => {
  const groups = {};
  for (const item of items) {
    const code = item.hsnSacCode || item.hsn_sac_code || 'MISC';
    if (!groups[code]) {
      groups[code] = { hsnSacCode: code, description: item.itemName || item.item_name || '', qty: 0, unit: item.unit || 'PCS', taxableAmount: 0, igst: 0, cgst: 0, sgst: 0, cess: 0 };
    }
    groups[code].qty          += toFloat(item.quantity);
    groups[code].taxableAmount = round2(groups[code].taxableAmount + toFloat(item.taxableAmount || item.taxable_amount));
    groups[code].cgst          = round2(groups[code].cgst  + toFloat(item.cgstAmount || item.cgst_amount));
    groups[code].sgst          = round2(groups[code].sgst  + toFloat(item.sgstAmount || item.sgst_amount));
    groups[code].igst          = round2(groups[code].igst  + toFloat(item.igstAmount || item.igst_amount));
    groups[code].cess          = round2(groups[code].cess  + toFloat(item.cessAmount || item.cess_amount));
  }
  return Object.values(groups);
};

// ============================================================
// VALIDATE GST NUMBER FORMAT (India)
// Format: 2-digit state code + 10-char PAN + 1 entity + Z + 1 checksum
// Example: 27AABCU9603R1ZM
// ============================================================
const validateGSTNumber = (gstin) => {
  if (!gstin) return { valid: false, error: 'GST number is empty' };
  const cleaned = gstin.trim().toUpperCase();
  const regex   = /^[0-3][0-9][A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
  if (!regex.test(cleaned)) {
    return { valid: false, error: 'Invalid GST number format' };
  }
  // Extract state code
  const stateCode = cleaned.substring(0, 2);
  return { valid: true, stateCode, pan: cleaned.substring(2, 12), cleaned };
};

module.exports = {
  calculateItemTax,
  calculateInvoiceTotals,
  determineInterState,
  buildGSTRateSummary,
  buildHSNSummary,
  validateGSTNumber,
};
