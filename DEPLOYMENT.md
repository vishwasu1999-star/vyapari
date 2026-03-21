# Vyapari — Production Deployment Guide

## Architecture

```
Users
  │
  ├─► Vercel / Netlify  (frontend PWA — static files)
  │         │
  │         └─► VITE_API_URL ──► Render / Railway  (Node.js API)
  │                                       │
  │                                       └─► Render PostgreSQL / Supabase
```

---

## Prerequisites

- Node.js 18+ installed locally
- Git repository (GitHub / GitLab)
- Accounts on: Render.com + Vercel.com (both free tiers work)

---

## STEP 1 — Generate Secrets (run locally, save output)

```bash
node -e "console.log('JWT_SECRET='+require('crypto').randomBytes(64).toString('hex'))"
node -e "console.log('JWT_REFRESH_SECRET='+require('crypto').randomBytes(64).toString('hex'))"
```

Save both values. You will paste them into Render's environment variables.

---

## STEP 2 — Deploy Database on Render

1. Go to **dashboard.render.com** → **New** → **PostgreSQL**
2. Settings:
   - Name: `vyapari-db`
   - Database: `vyapari_db`
   - User: `vyapari`
   - Region: closest to your users
   - Plan: **Free** (or Starter $7/mo for production)
3. Click **Create Database**
4. Copy the **External Database URL** (starts with `postgresql://`)

### Run the setup script against Render's database:

```bash
cd /path/to/vyapari

# Install pg driver if needed
npm install pg --prefix backend

# Run schema + functions setup
DATABASE_URL="postgresql://vyapari:PASSWORD@HOST/vyapari_db" \
  node backend/scripts/dbSetup.js

# Seed demo data (creates demo@vyapari.app / Password@123)
DATABASE_URL="postgresql://vyapari:PASSWORD@HOST/vyapari_db" \
  node backend/scripts/dbSeed.js
```

Expected output:
```
🗄️   Running database setup...
✅  Database setup complete.

🌱  Seeding database...
   ✅  Password hashed
   ✅  Demo user: demo@vyapari.app / Password@123
   ✅  Demo business: Shree Ram Traders
   ✅  Chart of Accounts seeded (48 accounts including Round Off)
   ✅  3 demo parties seeded
   ✅  4 demo items seeded
🎉  Seed complete!
```

---

## STEP 3 — Deploy Backend on Render

### Option A — Blueprint (automatic, recommended)

The `render.yaml` file at the project root defines everything.

1. Push your code to GitHub
2. Go to **dashboard.render.com** → **New** → **Blueprint**
3. Connect your GitHub repo
4. Render reads `render.yaml` and creates the web service + database

### Option B — Manual

1. Go to **dashboard.render.com** → **New** → **Web Service**
2. Connect your GitHub repo
3. Settings:
   - **Name**: `vyapari-api`
   - **Root Directory**: `backend`
   - **Runtime**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Plan**: Free

4. Add Environment Variables (Settings → Environment):

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `PORT` | `5000` |
| `DATABASE_URL` | *(paste from Step 2)* |
| `JWT_SECRET` | *(paste from Step 1)* |
| `JWT_REFRESH_SECRET` | *(paste from Step 1)* |
| `JWT_EXPIRES_IN` | `15m` |
| `JWT_REFRESH_EXPIRES_IN` | `7d` |
| `CORS_ORIGINS` | *(set after Step 4 — your Vercel URL)* |
| `LOG_LEVEL` | `info` |
| `RATE_LIMIT_MAX_REQUESTS` | `200` |

5. Click **Create Web Service**

6. Wait for deployment. Verify at:
   ```
   https://vyapari-api.onrender.com/health
   ```
   Should return: `{"status":"ok","db":"connected"}`

---

## STEP 4 — Deploy Frontend on Vercel

1. Go to **vercel.com** → **Add New Project**
2. Import your GitHub repo
3. Settings:
   - **Root Directory**: `frontend`
   - **Framework Preset**: Vite
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`

4. Add Environment Variables:

| Variable | Value |
|---|---|
| `VITE_API_URL` | `https://vyapari-api.onrender.com/api` |

5. Click **Deploy**

6. Vercel gives you a URL like: `https://vyapari-abc123.vercel.app`

### Optional: Add custom domain
- Vercel Dashboard → Project → Settings → Domains → Add domain

---

## STEP 5 — Connect Frontend to Backend (CORS)

After you have your Vercel URL, go back to Render:

1. Render Dashboard → `vyapari-api` → Environment
2. Update `CORS_ORIGINS`:
   ```
   https://vyapari.vercel.app
   ```
   (Replace with your actual Vercel URL, no trailing slash)
3. Render auto-redeploys

---

## STEP 6 — Alternative: Railway

If you prefer Railway over Render:

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login
railway login

# Create project
railway new vyapari

# Add PostgreSQL plugin
railway add postgresql

# Deploy backend
cd backend
railway up

# Get DATABASE_URL
railway variables get DATABASE_URL
```

Set same environment variables as Render (Step 3).

---

## STEP 7 — Alternative Frontend: Netlify

```bash
# Install Netlify CLI
npm install -g netlify-cli

cd frontend
npm run build

netlify deploy --prod --dir=dist
```

Or connect GitHub repo at **app.netlify.com** → **New site from Git**.
The `netlify.toml` file handles SPA routing automatically.

---

## Environment Variables — Quick Reference

### Backend (Render)

```
NODE_ENV=production
PORT=5000
DATABASE_URL=postgresql://user:pass@host:5432/dbname
JWT_SECRET=<64-char-hex>
JWT_REFRESH_SECRET=<different-64-char-hex>
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d
CORS_ORIGINS=https://your-frontend.vercel.app
LOG_LEVEL=info
RATE_LIMIT_MAX_REQUESTS=200
AUTH_RATE_LIMIT_MAX=10
```

### Frontend (Vercel)

```
VITE_API_URL=https://vyapari-api.onrender.com/api
```

---

## Local Development

```bash
# 1. Clone repo
git clone https://github.com/yourname/vyapari.git
cd vyapari

# 2. Backend setup
cd backend
cp .env.example .env
# Edit .env — set DB_PASSWORD and JWT secrets
npm install
npm run db:setup    # creates tables
npm run db:seed     # creates demo data
npm run dev         # starts on port 5000

# 3. Frontend setup (new terminal)
cd frontend
cp .env.example .env.local
# VITE_API_URL can be left empty — Vite proxies /api to :5000
npm install
npm run dev         # starts on port 3000

# Open: http://localhost:3000
# Login: demo@vyapari.app / Password@123
```

---

## Post-Deploy Verification Checklist

Run these checks after deployment:

### 1. Health Check
```bash
curl https://vyapari-api.onrender.com/health
# Expected: {"status":"ok","db":"connected","version":"1.0.0"}
```

### 2. Auth Check
```bash
curl -X POST https://vyapari-api.onrender.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"demo@vyapari.app","password":"Password@123"}'
# Expected: {"user":{...},"accessToken":"eyJ...","refreshToken":"eyJ..."}
```

### 3. Frontend loads
- Open `https://your-app.vercel.app`
- Should show login screen with Vyapari branding
- No console errors about missing API URL

### 4. Login works
- Email: `demo@vyapari.app`
- Password: `Password@123`
- Should land on Dashboard

### 5. Create an invoice
- Go to Sales → New Invoice
- Add party: Anand Wholesale
- Add item: Basmati Rice, qty 2
- Verify GST splits correctly (CGST + SGST for same state)
- Save → invoice number generated (SRT/24-25/00001)

### 6. Reports load
- Go to Reports → Trial Balance → Run
- Debit total must equal Credit total
- Go to Reports → GST Report → Run
- Verify CGST + SGST amounts match invoice

### 7. PWA install
- Open on mobile Chrome
- Tap "Add to Home Screen"
- App opens in standalone mode (no browser chrome)

---

## Monitoring & Logs

### Render logs
```
Render Dashboard → vyapari-api → Logs
```

### Common errors and fixes

| Error | Fix |
|---|---|
| `Missing required environment variables` | Add all vars in Render dashboard |
| `PostgreSQL connection failed` | Check DATABASE_URL is set correctly |
| `CORS: origin not in allowlist` | Update CORS_ORIGINS with exact frontend URL |
| `JWT_SECRET contains a placeholder` | Generate real secrets (Step 1) |
| 404 on page refresh | Verify vercel.json rewrites are deployed |
| Icons missing on install | Check `/icons/icon-192.png` returns 200 |

---

## Upgrading from Free to Production

| Service | Free | Starter | Notes |
|---|---|---|---|
| Render Web | 512MB, spins down | $7/mo, always on | Free tier sleeps after 15min inactivity |
| Render DB | 1GB, 90 days | $7/mo | Free DB expires after 90 days |
| Vercel | 100GB bandwidth | $20/mo | Free is sufficient for most use |
| Supabase | 500MB, 50k rows | $25/mo | Alternative to Render DB |

**For real business use:** Upgrade Render DB to Starter ($7/mo) to prevent expiry.

---

## Security Notes

1. **JWT secrets must be 64+ characters** — generated in Step 1, never committed to git
2. **DATABASE_URL is never logged** — Winston config omits sensitive env vars
3. **CORS is production-locked** — only your exact Vercel domain is allowed
4. **Rate limiting is active** — 200 req/15min globally, 10 req/15min for auth
5. **Helmet.js** sets security headers on every response
6. **bcrypt cost factor 12** — passwords are computationally expensive to crack
7. **Refresh token rotation** — each refresh issues a new token and revokes the old one
