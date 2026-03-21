'use strict';

// ============================================================
// SYSTEM ACCOUNT CODES
// These codes match the seeded Chart of Accounts exactly.
// ============================================================
const ACCOUNT_CODES = {
  CASH:              '1001',
  BANK:              '1002',
  PETTY_CASH:        '1003',
  ACCOUNTS_RECEIVABLE: '1010',
  STOCK:             '1020',
  GST_INPUT:         '1030',
  CGST_INPUT:        '1031',
  SGST_INPUT:        '1032',
  IGST_INPUT:        '1033',
  ACCOUNTS_PAYABLE:  '2001',
  GST_OUTPUT:        '2010',
  CGST_OUTPUT:       '2011',
  SGST_OUTPUT:       '2012',
  IGST_OUTPUT:       '2013',
  GST_NET_PAYABLE:   '2014',
  OWNER_CAPITAL:     '3001',
  RETAINED_EARNINGS: '3003',
  SALES_REVENUE:     '4001',
  SERVICE_REVENUE:   '4002',
  OTHER_INCOME:      '4010',
  COGS:              '5001',
  PURCHASE_RETURNS:  '5002',
  FREIGHT_INWARD:    '5003',
  SALARIES:          '5011',
  RENT:              '5012',
  UTILITIES:         '5013',
  TRANSPORT:         '5014',
  MISC_EXPENSE:      '5032',
  ROUND_OFF:         '5033',  // Round off account for voucher balancing
};

const VOUCHER_TYPES = {
  JOURNAL:     'Journal',
  SALES:       'Sales',
  PURCHASE:    'Purchase',
  RECEIPT:     'Receipt',
  PAYMENT:     'Payment',
  CONTRA:      'Contra',
  CREDIT_NOTE: 'CreditNote',
  DEBIT_NOTE:  'DebitNote',
};

const INVOICE_TYPES = {
  SALE:        'sale',
  PURCHASE:    'purchase',
  CREDIT_NOTE: 'credit_note',
  DEBIT_NOTE:  'debit_note',
};

const INVOICE_STATUS = {
  DRAFT:     'draft',
  UNPAID:    'unpaid',
  PARTIAL:   'partial',
  PAID:      'paid',
  CANCELLED: 'cancelled',
  OVERDUE:   'overdue',
};

const PAYMENT_MODES = ['cash', 'bank', 'upi', 'cheque', 'neft', 'rtgs', 'card', 'other'];

const GST_RATES = [0, 0.1, 0.25, 1, 1.5, 3, 5, 6, 7.5, 12, 18, 28];

// All Indian states with GST state codes
const INDIAN_STATES = [
  { code: '01', name: 'Jammu & Kashmir'        },
  { code: '02', name: 'Himachal Pradesh'        },
  { code: '03', name: 'Punjab'                  },
  { code: '04', name: 'Chandigarh'              },
  { code: '05', name: 'Uttarakhand'             },
  { code: '06', name: 'Haryana'                 },
  { code: '07', name: 'Delhi'                   },
  { code: '08', name: 'Rajasthan'               },
  { code: '09', name: 'Uttar Pradesh'           },
  { code: '10', name: 'Bihar'                   },
  { code: '11', name: 'Sikkim'                  },
  { code: '12', name: 'Arunachal Pradesh'       },
  { code: '13', name: 'Nagaland'                },
  { code: '14', name: 'Manipur'                 },
  { code: '15', name: 'Mizoram'                 },
  { code: '16', name: 'Tripura'                 },
  { code: '17', name: 'Meghalaya'               },
  { code: '18', name: 'Assam'                   },
  { code: '19', name: 'West Bengal'             },
  { code: '20', name: 'Jharkhand'               },
  { code: '21', name: 'Odisha'                  },
  { code: '22', name: 'Chhattisgarh'            },
  { code: '23', name: 'Madhya Pradesh'          },
  { code: '24', name: 'Gujarat'                 },
  { code: '25', name: 'Daman & Diu'             },
  { code: '26', name: 'Dadra & Nagar Haveli'    },
  { code: '27', name: 'Maharashtra'             },
  { code: '28', name: 'Andhra Pradesh (old)'    },
  { code: '29', name: 'Karnataka'               },
  { code: '30', name: 'Goa'                     },
  { code: '31', name: 'Lakshadweep'             },
  { code: '32', name: 'Kerala'                  },
  { code: '33', name: 'Tamil Nadu'              },
  { code: '34', name: 'Puducherry'              },
  { code: '35', name: 'Andaman & Nicobar'       },
  { code: '36', name: 'Telangana'               },
  { code: '37', name: 'Andhra Pradesh'          },
  { code: '38', name: 'Ladakh'                  },
  { code: '97', name: 'Other Territory'         },
  { code: '99', name: 'Centre Jurisdiction'     },
];

module.exports = {
  ACCOUNT_CODES,
  VOUCHER_TYPES,
  INVOICE_TYPES,
  INVOICE_STATUS,
  PAYMENT_MODES,
  GST_RATES,
  INDIAN_STATES,
};
