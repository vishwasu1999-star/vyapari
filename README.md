# Vyapari — Business Accounting App

Full-stack Indian business accounting PWA with GST, double-entry accounting, invoicing, and reports.

---

## Stack

| Layer     | Tech                                    |
|-----------|-----------------------------------------|
| Frontend  | React 18, Vite, Tailwind CSS, Recharts  |
| Backend   | Node.js 18+, Express 4, JWT auth        |
| Database  | PostgreSQL 14+                          |
| Offline   | IndexedDB (idb), PWA (vite-plugin-pwa)  |

---

## Quick Start

### 1. Prerequisites

- Node.js 18+
- PostgreSQL 14+

### 2. Database

```bash
# Create database
psql -U postgres -c "CREATE DATABASE vyapari_db;"

# Run schema
psql -U postgres -d vyapari_db -f database/001_schema.sql
psql -U postgres -d vyapari_db -f database/002_functions.sql

# (Optional) Load demo data
psql -U postgres -d vyapari_db -f database/003_seed.sql
```

> **Note:** The seed file contains a demo user (`demo@vyapari.app`) with a placeholder bcrypt hash.
> After running the seed, update the hash:
>
> ```bash
> node -e "require('bcryptjs').hash('Password@123',12).then(h => console.log(h))"
> # Copy the output and run:
> psql -U postgres -d vyapari_db -c "UPDATE users SET password_hash='<paste hash>' WHERE email='demo@vyapari.app';"
> ```

### 3. Backend

```bash
cd backend
cp .env.example .env
# Edit .env — fill in DB_PASSWORD and generate new JWT secrets:
# node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

npm install
npm run dev        # development
npm start          # production
```

API runs on `http://localhost:5000`

### 4. Frontend

```bash
cd frontend
npm install
npm run dev        # development → http://localhost:3000
npm run build      # production build → dist/
npm run preview    # preview production build
```

---

## Project Structure

```
vyapari/
├── database/
│   ├── 001_schema.sql         # All 15 tables with FK + indexes
│   ├── 002_functions.sql      # Triggers + stored procedures
│   └── 003_seed.sql           # Demo data
│
├── backend/
│   ├── server.js              # Entry point
│   ├── app.js                 # Express setup + middleware
│   ├── config/
│   │   ├── db.js              # PostgreSQL pool
│   │   ├── logger.js          # Winston
│   │   └── constants.js       # Account codes, GST rates, states
│   ├── middleware/
│   │   ├── auth.js            # JWT verification + business guard
│   │   └── errorHandler.js    # Centralised error handling
│   ├── controllers/           # Request handlers (one per entity)
│   ├── routes/                # Express routers
│   ├── services/
│   │   ├── accountingEngine.js  # Double-entry voucher creation
│   │   ├── gstService.js        # CGST/SGST/IGST calculation
│   │   ├── invoiceService.js    # Invoice + accounting in one tx
│   │   └── reportService.js     # Trial Balance, P&L, Balance Sheet…
│   └── utils/
│       └── helpers.js         # numberToWords, pagination, dates
│
└── frontend/
    ├── index.html
    ├── vite.config.js         # PWA config
    ├── tailwind.config.js
    └── src/
        ├── main.jsx
        ├── App.jsx            # Router
        ├── context/
        │   └── AuthContext.jsx
        ├── services/
        │   ├── api.js         # All API calls + token refresh
        │   ├── offlineStore.js  # IndexedDB cache + queue
        │   └── syncEngine.js    # Background sync
        ├── hooks/
        │   └── useOnlineStatus.js
        ├── utils/
        │   ├── helpers.js     # fmtCurrency, fmtDate, GST calc
        │   └── constants.js   # States, GST rates, units
        ├── components/
        │   ├── UI/            # Button, Input, Modal, StatCard…
        │   ├── Layout/        # AppLayout, Sidebar, BottomNav
        │   └── Invoice/       # InvoiceForm, InvoiceDetail
        └── screens/
            ├── Auth/          # Login, Register, Onboarding
            ├── Dashboard/
            ├── Sales/
            ├── Purchases/
            ├── Parties/
            ├── Items/
            ├── Expenses/
            ├── Vouchers/
            ├── Reports/       # TrialBalance, P&L, BalanceSheet, DayBook, GST
            └── Settings/
```

---

## API Reference

### Auth
| Method | Path                    | Description         |
|--------|-------------------------|---------------------|
| POST   | /api/auth/register      | Create account      |
| POST   | /api/auth/login         | Login               |
| POST   | /api/auth/refresh       | Refresh token       |
| POST   | /api/auth/logout        | Logout              |
| GET    | /api/auth/me            | Current user        |
| PUT    | /api/auth/change-password | Change password   |

### Businesses
| Method | Path                          | Description     |
|--------|-------------------------------|-----------------|
| GET    | /api/businesses               | List businesses |
| POST   | /api/businesses               | Create business |
| GET    | /api/businesses/:id           | Get business    |
| PUT    | /api/businesses/:id           | Update business |

### Core Modules (all scoped to `:businessId`)
| Method | Path                              | Description           |
|--------|-----------------------------------|-----------------------|
| GET    | /parties                          | List parties          |
| POST   | /parties                          | Create party          |
| GET    | /items                            | List items            |
| POST   | /items                            | Create item           |
| GET    | /invoices?type=sale               | List invoices         |
| POST   | /invoices                         | Create invoice + voucher |
| GET    | /invoices/:id/pdf-data            | Invoice data for PDF  |
| POST   | /payments                         | Record payment        |
| POST   | /vouchers                         | Manual journal entry  |
| POST   | /expenses                         | Record expense        |

### Reports (all accept `?from=YYYY-MM-DD&to=YYYY-MM-DD`)
| Method | Path                              |
|--------|-----------------------------------|
| GET    | /reports/dashboard                |
| GET    | /reports/trial-balance            |
| GET    | /reports/profit-loss              |
| GET    | /reports/balance-sheet?asOf=      |
| GET    | /reports/day-book                 |
| GET    | /reports/gst                      |
| GET    | /reports/cash-book                |
| GET    | /reports/account-ledger/:accountId|

---

## Accounting Engine

Every financial transaction creates a balanced double-entry voucher:

```
Sale Invoice (₹11,800 incl. 18% GST):
  Dr  Accounts Receivable   11,800
  Cr  Sales Revenue          10,000
  Cr  CGST Output             900
  Cr  SGST Output             900
```

```
Receipt from Customer (₹11,800):
  Dr  Cash / Bank            11,800
  Cr  Accounts Receivable    11,800
```

The engine validates `SUM(debits) == SUM(credits)` before inserting. Any imbalance throws an error and rolls back the transaction.

---

## GST Logic

- **Same state** → CGST + SGST (each = gstRate / 2)
- **Different state** → IGST (= gstRate)
- Business state code vs. party state code determines the split automatically

---

## Offline Support

1. **IndexedDB** caches parties, items, and accounts on first load
2. **offlineStore** queues writes when offline
3. **syncEngine** runs every 30 seconds, sends batches to `/api/sync`
4. The PWA service worker caches static assets and API responses (via Workbox)

---

## Security

- Passwords hashed with bcrypt (cost factor 12)
- JWT access tokens expire in 15 minutes
- Refresh tokens rotate on each use and are stored in DB
- All refresh tokens revoked on password change
- Rate limiting on auth endpoints (10 req / 15 min)
- Helmet.js security headers
- Business-scoped middleware prevents cross-tenant access
- No hardcoded secrets — all from `.env`
