import { format, parseISO, isValid } from 'date-fns';

// ============================================================
// CURRENCY FORMATTING
// ============================================================
export const fmtCurrency = (amount, decimals = 2) => {
  const n = parseFloat(amount) || 0;
  return new Intl.NumberFormat('en-IN', {
    style:                 'currency',
    currency:              'INR',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(n);
};

export const fmtNumber = (n, dec = 2) =>
  new Intl.NumberFormat('en-IN', { minimumFractionDigits: dec, maximumFractionDigits: dec }).format(parseFloat(n) || 0);

// ============================================================
// DATE FORMATTING
// ============================================================
export const fmtDate = (d, fmt = 'dd MMM yyyy') => {
  if (!d) return '—';
  try {
    const date = typeof d === 'string' ? parseISO(d) : d;
    return isValid(date) ? format(date, fmt) : '—';
  } catch { return '—'; }
};

export const todayISO = () => format(new Date(), 'yyyy-MM-dd');

export const fyDates = () => {
  const now   = new Date();
  const year  = now.getFullYear();
  const month = now.getMonth() + 1;
  const start = month >= 4 ? year : year - 1;
  return { from: `${start}-04-01`, to: `${start + 1}-03-31` };
};

// ============================================================
// STATUS BADGES
// ============================================================
export const statusBadge = (status) => {
  const map = {
    paid:      { class: 'badge-green',  label: 'Paid' },
    partial:   { class: 'badge-amber',  label: 'Partial' },
    unpaid:    { class: 'badge-red',    label: 'Unpaid' },
    overdue:   { class: 'badge-red',    label: 'Overdue' },
    cancelled: { class: 'badge-slate',  label: 'Cancelled' },
    draft:     { class: 'badge-slate',  label: 'Draft' },
    cleared:   { class: 'badge-green',  label: 'Cleared' },
    bounced:   { class: 'badge-red',    label: 'Bounced' },
  };
  return map[status] || { class: 'badge-slate', label: status };
};

// ============================================================
// GST CALCULATION (mirrors backend)
// ============================================================
export const calcItemTax = ({ rate, qty, discountPercent = 0, gstRate = 0, isInterState = false }) => {
  const gross    = parseFloat((rate * qty).toFixed(2));
  const discount = parseFloat((gross * discountPercent / 100).toFixed(2));
  const taxable  = parseFloat((gross - discount).toFixed(2));
  const gstAmt   = parseFloat((taxable * gstRate / 100).toFixed(2));

  let cgstRate = 0, cgstAmount = 0, sgstRate = 0, sgstAmount = 0, igstRate = 0, igstAmount = 0;

  if (isInterState) {
    igstRate = gstRate; igstAmount = gstAmt;
  } else {
    cgstRate = gstRate / 2; sgstRate = gstRate / 2;
    cgstAmount = parseFloat((taxable * cgstRate / 100).toFixed(2));
    sgstAmount = parseFloat((gstAmt - cgstAmount).toFixed(2)); // ensures cgst+sgst === totalGST exactly
  }

  return {
    gross, discount, taxable,
    gstRate, cgstRate, cgstAmount, sgstRate, sgstAmount, igstRate, igstAmount,
    lineTotal: parseFloat((taxable + gstAmt).toFixed(2)),
  };
};

export const calcInvoiceTotals = (items) => {
  const subtotal      = items.reduce((s, i) => s + (i.gross    || 0), 0);
  const totalDiscount = items.reduce((s, i) => s + (i.discount || 0), 0);
  const taxableAmount = items.reduce((s, i) => s + (i.taxable  || 0), 0);
  const cgstAmount    = items.reduce((s, i) => s + (i.cgstAmount || 0), 0);
  const sgstAmount    = items.reduce((s, i) => s + (i.sgstAmount || 0), 0);
  const igstAmount    = items.reduce((s, i) => s + (i.igstAmount || 0), 0);
  const totalTax      = cgstAmount + sgstAmount + igstAmount;
  const raw           = taxableAmount + totalTax;
  const totalAmount   = Math.round(raw);
  const roundOff      = parseFloat((totalAmount - raw).toFixed(2));

  return { subtotal, totalDiscount, taxableAmount, cgstAmount, sgstAmount, igstAmount, totalTax, roundOff, totalAmount };
};

// ============================================================
// MISC
// ============================================================
export const truncate = (str, n = 30) => str?.length > n ? str.slice(0, n) + '…' : str;

export const classNames = (...classes) => classes.filter(Boolean).join(' ');
