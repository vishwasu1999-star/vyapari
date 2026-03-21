'use strict';

// ============================================================
// PAGINATION
// ============================================================
const getPagination = (req) => {
  const page   = Math.max(1, parseInt(req.query.page  || '1'));
  const limit  = Math.min(100, Math.max(1, parseInt(req.query.limit || '20')));
  const offset = (page - 1) * limit;
  return { page, limit, offset };
};

const paginatedResponse = (data, total, page, limit) => ({
  data,
  pagination: {
    total,
    page,
    limit,
    pages:    Math.ceil(total / limit),
    hasNext:  page * limit < total,
    hasPrev:  page > 1,
  },
});

// ============================================================
// NUMBER TO INDIAN WORDS
// e.g. 12345.50 → "Rupees Twelve Thousand Three Hundred Forty Five and Fifty Paise Only"
// ============================================================
const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight',
  'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen',
  'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty',
  'Sixty', 'Seventy', 'Eighty', 'Ninety'];

const convertBelow1000 = (n) => {
  if (n === 0)   return '';
  if (n < 20)    return ONES[n];
  if (n < 100)   return TENS[Math.floor(n / 10)] + (n % 10 ? ' ' + ONES[n % 10] : '');
  return ONES[Math.floor(n / 100)] + ' Hundred'
    + (n % 100 ? ' ' + convertBelow1000(n % 100) : '');
};

const numberToWords = (num) => {
  if (typeof num !== 'number' || isNaN(num)) return '';
  if (num === 0) return 'Zero Rupees Only';

  const intPart = Math.floor(Math.abs(num));
  const paise   = Math.round((Math.abs(num) - intPart) * 100);

  const convert = (n) => {
    if (n === 0)          return '';
    if (n < 1000)         return convertBelow1000(n);
    if (n < 100000)       return convertBelow1000(Math.floor(n / 1000)) + ' Thousand' + (n % 1000 ? ' ' + convert(n % 1000) : '');
    if (n < 10000000)     return convertBelow1000(Math.floor(n / 100000)) + ' Lakh'   + (n % 100000 ? ' ' + convert(n % 100000) : '');
    return convertBelow1000(Math.floor(n / 10000000))   + ' Crore'  + (n % 10000000 ? ' ' + convert(n % 10000000) : '');
  };

  let words = 'Rupees ' + convert(intPart);
  if (paise > 0) words += ' and ' + convertBelow1000(paise) + ' Paise';
  words += ' Only';
  return words;
};

// ============================================================
// DATE HELPERS
// ============================================================
const toDateStr = (d) => {
  if (!d) return null;
  const date = d instanceof Date ? d : new Date(d);
  return date.toISOString().split('T')[0];
};

const getFinancialYear = (date = new Date()) => {
  const y = date.getFullYear();
  const m = date.getMonth() + 1;  // 1-12
  const startYear = m >= 4 ? y : y - 1;
  return {
    start: `${startYear}-04-01`,
    end:   `${startYear + 1}-03-31`,
  };
};

const getMonthRange = (year, month) => {
  const start = new Date(year, month - 1, 1);
  const end   = new Date(year, month, 0);
  return { start: toDateStr(start), end: toDateStr(end) };
};

// ============================================================
// SAFE NUMBER PARSING
// ============================================================
const toFloat = (val, fallback = 0) => {
  const n = parseFloat(val);
  return isNaN(n) ? fallback : Math.round(n * 1e10) / 1e10;
};

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

// ============================================================
// UUID VALIDATION
// ============================================================
const isUUID = (str) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);

module.exports = {
  getPagination,
  paginatedResponse,
  numberToWords,
  toDateStr,
  getFinancialYear,
  getMonthRange,
  toFloat,
  round2,
  isUUID,
};
