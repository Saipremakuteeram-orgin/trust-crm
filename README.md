<div align="center">

<img src="logo.jpg" alt="Trust CRM Logo" width="120" style="border-radius: 24px; box-shadow: 0 20px 60px rgba(245,158,11,0.3);" />

# Trust CRM

### *The intelligent financial management system built for trusts, temples, and charitable organizations.*

[![Deployed on Vercel](https://img.shields.io/badge/Frontend-Vercel-000?style=for-the-badge&logo=vercel)](https://vercel.com)
[![Deployed on Render](https://img.shields.io/badge/Backend-Render-46E3B7?style=for-the-badge&logo=render)](https://render.com)
[![Powered by Supabase](https://img.shields.io/badge/Database-Supabase-3FCF8E?style=for-the-badge&logo=supabase)](https://supabase.com)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react)](https://react.dev)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-v4-06B6D4?style=for-the-badge&logo=tailwindcss)](https://tailwindcss.com)

<br />

[Features](#-features) · [Architecture](#-architecture) · [Role System](#-role-based-access-control) · [Quick Start](#-quick-start) · [Security](#-security) · [License](#-license)

</div>

---

> **License & Ownership**
>
> This software is **private and proprietary**. All source code, design, architecture, and intellectual property are owned by the Trust. No part of this codebase may be copied, modified, distributed, or used without explicit written permission. The license and source code remain exclusively with the Trust.

---

## The Problem Most CRMs Fail to Solve

Most CRMs are designed for **sales teams**. They track leads, pipelines, and conversions. But religious trusts, temples, and charitable organizations don't have "leads" — they have **donations and expenses flowing through two separate worlds: cash and digital.**

<table>
<tr>
<td width="50%" valign="top">

#### How Other CRMs Fail

- **Split systems** — Cash tracked in notebooks, digital in bank apps. No unified view.
- **No notification loop** — Donor gives money, nobody gets notified. Transparency dies.
- **Monthly reports** — Manually compiled in Excel. Late, error-prone, forgotten.
- **Role confusion** — Everyone has admin access or nobody does. No middle ground.
- **Overwhelming UI** — Built for enterprise sales. A volunteer shouldn't need training.
- **No audit trail** — "Who recorded this? When? Why is the balance off?" Nobody knows.
- **Cash-digital blind spot** — Can't answer: "How much cash do we have right now vs. digital?"

</td>
<td width="50%" valign="top">

#### How Trust CRM Solves It

- **Unified ledger** — Every transaction tagged as cash or digital, one source of truth.
- **Instant notifications** — Email + Telegram sent the moment a transaction is recorded.
- **Automated monthly reports** — Cron job sends summaries on the 1st of every month.
- **3-tier role system** — Admin, Accountant, Viewer. Each sees exactly what they should.
- **Clean, minimal UI** — Built for volunteers and trustees, not sales teams.
- **Created-by tracking** — Every record has an author. Every change is attributable.
- **Live cash vs digital balance** — Dashboard shows both at a glance, always current.

</td>
</tr>
</table>

---

## Features

<table>
<tr>
<td width="50%" valign="top">

### Core Financial Tracking

<br />

> **Unified Transaction Ledger**

Every donation (credit) and every expense (debit) is recorded in a single table. Each transaction is tagged with its payment mode — **cash** or **digital** — and optionally a digital sub-method (UPI, bank transfer, card, cheque).

Running balances are calculated separately:
- **Cash in Hand** — physical cash position
- **Digital Balance** — bank/UPI position

This means you can always answer: *"How much money do we actually have?"*

<br />

> **Opening Balance Configuration**

Administrators can set the opening balance for both cash and digital accounts. All calculations flow from this baseline. The dashboard shows the complete flow:

```
Opening Balance → + Cash In → - Cash Out = Cash in Hand
```

<br />

> **Contact Management**

Admins and Accountants can **create, edit, and manage contacts** — the people who receive notifications. Each contact has:

- Name, email, phone, Telegram chat ID
- Toggle for monthly report subscription
- Enable/disable status

Viewers can **see** the contact list but cannot add, edit, or delete contacts. This ensures that only authorized personnel can modify who receives financial alerts.

```
Admin:       Create ✅  Edit ✅  Delete ✅
Accountant:  Create ✅  Edit ✅  Delete ❌
Viewer:      View ✅    Edit ❌  Delete ❌
```

</td>
<td width="50%" valign="top">

### Smart Notifications

<br />

> **Instant Transaction Alerts**

When any transaction is recorded, the creator selects one or more **Contacts** to notify. The system immediately sends:

- **Email** via Gmail SMTP
- **Telegram message** via Bot API

Each notification contains: type, amount, mode, party, date, and description. Delivery status (`sent`, `partial`, `failed`) is stored on the transaction record.

<br />

> **Automated Monthly Reports**

On the **1st of every month at 08:00 IST**, a cron job aggregates the previous month's data:

| Metric | Description |
|--------|-------------|
| Total Credit | All income received |
| Total Debit | All expenses paid |
| Net Balance | Credit minus Debit |
| Cash In/Out | Cash-specific flow |
| Digital In/Out | Digital-specific flow |
| Transaction Count | Volume of activity |

This summary is emailed + messaged to every Contact subscribed to monthly reports. Admins can also **manually trigger** the report via API for testing.

</td>
</tr>
</table>

---

## Role-Based Access Control

Trust CRM implements a strict **three-tier permission system** enforced at **both** the backend API and frontend UI levels.

<table>
<tr>
<td width="33%" valign="top" align="center">

### Admin

<img src="https://img.shields.io/badge/-Full_Access-f59e0b?style=for-the-badge" />

<br />

| Action | Access |
|--------|--------|
| View Dashboard | ✅ |
| View Transactions | ✅ |
| Create/Edit Transactions | ✅ |
| Delete Transactions | ✅ |
| View Contacts | ✅ |
| Create/Edit Contacts | ✅ |
| Delete Contacts | ✅ |
| Manage Users | ✅ |
| Manage Categories | ✅ |
| Edit Opening Balance | ✅ |
| Send Monthly Reports | ✅ |

</td>
<td width="33%" valign="top" align="center">

### Accountant

<img src="https://img.shields.io/badge/-Create_Edit-10b981?style=for-the-badge" />

<br />

| Action | Access |
|--------|--------|
| View Dashboard | ✅ |
| View Transactions | ✅ |
| Create/Edit Transactions | ✅ |
| Delete Transactions | ❌ |
| View Contacts | ✅ |
| Create/Edit Contacts | ✅ |
| Delete Contacts | ❌ |
| Manage Users | ❌ |
| Manage Categories | ❌ |
| Edit Opening Balance | ❌ |
| Send Monthly Reports | ✅ |

</td>
<td width="33%" valign="top" align="center">

### Viewer

<img src="https://img.shields.io/badge/-Read_Only-6366f1?style=for-the-badge" />

<br />

| Action | Access |
|--------|--------|
| View Dashboard | ✅ |
| View Transactions | ✅ |
| Create/Edit Transactions | ❌ |
| Delete Transactions | ❌ |
| View Contacts | ✅ |
| Create/Edit Contacts | ❌ |
| Delete Contacts | ❌ |
| Manage Users | ❌ |
| Manage Categories | ❌ |
| Edit Opening Balance | ❌ |
| Send Monthly Reports | ❌ |

</td>
</tr>
</table>

### How Enforcement Works

```
Frontend:  Button visibility + route guards (AdminProtected)
    ↓
Backend:   requireAuth → requireRole(['admin', 'accountant'])
    ↓
Database:  Supabase RLS policies on every table
```

**Three layers of protection.** Even if someone bypasses the frontend, the backend rejects unauthorized API calls. Even if someone gets a service token, RLS policies enforce row-level access.

---

## Architecture

<div align="center">

```
┌─────────────────────────────────────────────────────────────────────┐
│                          FRONTEND (Vercel)                          │
│                                                                     │
│   React 19 + Vite + Tailwind CSS v4 + Framer Motion + Recharts     │
│                                                                     │
│   ┌──────────┐  ┌──────────────┐  ┌──────────┐  ┌──────────────┐  │
│   │  Login   │  │   Dashboard  │  │   Txns   │  │   Contacts   │  │
│   │  (Glass) │  │  (Analytics) │  │  (CRUD)  │  │   (CRUD)     │  │
│   └──────────┘  └──────────────┘  └──────────┘  └──────────────┘  │
│   ┌──────────┐  ┌──────────────┐  ┌──────────────────────────┐    │
│   │  Users   │  │    Nav       │  │    Toast Notifications    │    │
│   │  (Admin) │  │  (Sidebar)   │  │    (Real-time feedback)   │    │
│   └──────────┘  └──────────────┘  └──────────────────────────┘    │
│                                                                     │
└───────────────────────────┬─────────────────────────────────────────┘
                            │ REST API (JWT Bearer Token)
                            ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        BACKEND (Render)                             │
│                                                                     │
│   Node.js + Express + Supabase Admin SDK                           │
│                                                                     │
│   ┌─────────────────────────────────────────────────────────────┐  │
│   │                    Middleware Pipeline                       │  │
│   │  CORS → JSON Parser → requireAuth → requireRole([...roles]) │  │
│   └─────────────────────────────────────────────────────────────┘  │
│                                                                     │
│   ┌────────────┐ ┌───────────┐ ┌──────────┐ ┌─────────────────┐  │
│   │Transactions│ │ Contacts  │ │ Dashboard│ │   Analytics     │  │
│   │   CRUD     │ │   CRUD    │ │ Summary  │ │  (Python/Pandas)│  │
│   └────────────┘ └───────────┘ └──────────┘ └─────────────────┘  │
│   ┌────────────┐ ┌───────────┐ ┌──────────┐ ┌─────────────────┐  │
│   │   Users    │ │Categories │ │ Reports  │ │   Notify        │  │
│   │ Management │ │  Admin    │ │  Cron    │ │ Email + Telegram │  │
│   └────────────┘ └───────────┘ └──────────┘ └─────────────────┘  │
│                                                                     │
└───────────────────────────┬─────────────────────────────────────────┘
                            │ Service Role Key
                            ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    DATABASE (Supabase / Postgres)                    │
│                                                                     │
│   Tables:                                                           │
│   ├── profiles          (id, full_name, email, role)                │
│   ├── transactions      (type, mode, amount, category, party...)   │
│   ├── contacts          (name, email, telegram, phone, subscribe)  │
│   ├── categories        (id, name, type)                            │
│   └── settings          (key, value — opening balances)             │
│                                                                     │
│   Views:                                                            │
│   ├── v_cash_summary    (opening, in, out, balance)                 │
│   └── v_digital_summary (in, out, balance)                          │
│                                                                     │
│   Auth: Supabase Auth (JWT tokens, bcrypt, session management)      │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

</div>

---

## Tech Stack

<table>
<tr>
<td align="center" width="14%">
<img src="https://cdn.worldvectorlogo.com/logos/react-2.svg" width="40" /><br />
<b>React 19</b><br />
<i>Frontend UI</i>
</td>
<td align="center" width="14%">
<img src="https://cdn.worldvectorlogo.com/logos/vitejs.svg" width="40" /><br />
<b>Vite</b><br />
<i>Build tool</i>
</td>
<td align="center" width="14%">
<img src="https://cdn.worldvectorlogo.com/logos/tailwindcss-2.svg" width="40" /><br />
<b>Tailwind v4</b><br />
<i>Styling</i>
</td>
<td align="center" width="14%">
<img src="https://cdn.worldvectorlogo.com/logos/framer-motion.svg" width="40" /><br />
<b>Framer Motion</b><br />
<i>Animations</i>
</td>
<td align="center" width="14%">
<img src="https://cdn.worldvectorlogo.com/logos/recharts.svg" width="40" /><br />
<b>Recharts</b><br />
<i>Charts</i>
</td>
<td align="center" width="14%">
<img src="https://cdn.worldvectorlogo.com/logos/nodejs-icon.svg" width="40" /><br />
<b>Node.js</b><br />
<i>Backend</i>
</td>
<td align="center" width="14%">
<img src="https://cdn.worldvectorlogo.com/logos/supabase-icon.svg" width="40" /><br />
<b>Supabase</b><br />
<i>Database + Auth</i>
</td>
</tr>
</table>

---

## Quick Start

### Prerequisites

- Node.js 18+
- Python 3.10+ (for analytics module)
- Supabase project (free tier works)
- Gmail App Password (for email notifications)
- Telegram Bot Token (for Telegram notifications)

### 1. Clone the repository

```bash
git clone https://github.com/Saipremakuteeram-orgin/trust-crm.git
cd trust-crm
```

### 2. Set up the database

Run the SQL in your Supabase SQL Editor:

```sql
-- Profiles table (extends Supabase Auth)
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text,
  role text check (role in ('admin', 'accountant', 'viewer')) default 'viewer',
  created_at timestamptz default now()
);

-- Contacts table
create table contacts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text,
  telegram_chat_id text,
  phone text,
  subscribe_monthly_report boolean default false,
  enabled boolean default true,
  created_at timestamptz default now()
);

-- Categories table
create table categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text check (type in ('credit', 'debit', 'both')) default 'both'
);

-- Transactions table
create table transactions (
  id uuid primary key default gen_random_uuid(),
  type text check (type in ('credit', 'debit')) not null,
  mode text check (mode in ('cash', 'digital')) not null,
  digital_method text,
  amount numeric not null check (amount > 0),
  category_id uuid references categories(id),
  party_name text,
  contact_id uuid references contacts(id),
  description text,
  txn_date date default current_date,
  created_by uuid references profiles(id),
  notification_status text default 'pending',
  notify_contact_ids uuid[] default '{}',
  created_at timestamptz default now()
);

-- Settings table (opening balances)
create table settings (
  key text primary key,
  value text not null,
  updated_at timestamptz default now()
);

-- Cash summary view
create or replace view v_cash_summary as
select
  coalesce((select value::numeric from settings where key = 'cash_opening_balance'), 0) as opening_balance,
  coalesce(sum(case when type = 'credit' and mode = 'cash' then amount else 0 end), 0) as cash_in,
  coalesce(sum(case when type = 'debit' and mode = 'cash' then amount else 0 end), 0) as cash_out,
  coalesce((select value::numeric from settings where key = 'cash_opening_balance'), 0)
    + coalesce(sum(case when type = 'credit' and mode = 'cash' then amount else 0 end), 0)
    - coalesce(sum(case when type = 'debit' and mode = 'cash' then amount else 0 end), 0) as cash_in_hand
from transactions;

-- Digital summary view
create or replace view v_digital_summary as
select
  coalesce((select value::numeric from settings where key = 'digital_opening_balance'), 0) as opening_balance,
  coalesce(sum(case when type = 'credit' and mode = 'digital' then amount else 0 end), 0) as digital_in,
  coalesce(sum(case when type = 'debit' and mode = 'digital' then amount else 0 end), 0) as digital_out,
  coalesce((select value::numeric from settings where key = 'digital_opening_balance'), 0)
    + coalesce(sum(case when type = 'credit' and mode = 'digital' then amount else 0 end), 0)
    - coalesce(sum(case when type = 'debit' and mode = 'digital' then amount else 0 end), 0) as digital_balance
from transactions;

-- RLS policies (enable per table as needed)
alter table profiles enable row level security;
alter table transactions enable row level security;
alter table contacts enable row level security;
alter table categories enable row level security;
```

### 3. Configure environment variables

```bash
# Backend
cd backend
cp .env.example .env

# Frontend
cd frontend
cp .env.example .env
```

Fill in your `.env` files with your own credentials:

**Backend `.env`:**

| Variable | Where to get it |
|----------|----------------|
| `SUPABASE_URL` | Supabase Dashboard → Settings → API → Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Dashboard → Settings → API → service_role key |
| `SMTP_USER` | Your Gmail address |
| `SMTP_PASS` | Gmail → Security → App Passwords (16-char code) |
| `TELEGRAM_BOT_TOKEN` | Telegram → @BotFather → /newbot |

**Frontend `.env`:**

| Variable | Where to get it |
|----------|----------------|
| `VITE_SUPABASE_URL` | Same as `SUPABASE_URL` above |
| `VITE_SUPABASE_ANON_KEY` | Supabase Dashboard → Settings → API → anon/public key |
| `VITE_API_URL` | `http://localhost:8888/api` (dev) or your Render URL (prod) |

> **Warning:** Never commit `.env` files to git. They are excluded via `.gitignore`.

### 4. Install and run

```bash
# Backend
cd backend
npm install
npm run dev          # Runs on port 8888

# Frontend (new terminal)
cd frontend
npm install
npm run dev          # Runs on port 3000

# Python analytics (if needed)
cd backend
pip install -r requirements.txt
```

### 5. Create your admin user

Go to **Supabase Dashboard → Authentication → Users → Add User**, then insert a profile:

```sql
insert into profiles (id, full_name, email, role)
values ('<auth-user-uuid>', 'Your Name', 'you@example.com', 'admin');
```

> **Note:** There is no signup page. Users are created via Supabase Dashboard. This is intentional — trusts don't need open registration.

---

## Dashboard Analytics

The dashboard provides a complete financial overview:

| Section | What It Shows |
|---------|---------------|
| **Stat Cards** | Cash in Hand, Digital Balance, Total Income, Total Expenses |
| **Cash Flow** | Opening balance → Cash in → Cash out → Current balance |
| **Digital Flow** | Digital in → Digital out → Current balance |
| **Monthly Trend** | Area chart: Income vs Expenses over time |
| **Weekly Activity** | Bar chart: Last 7 days of transactions |
| **Category Breakdown** | Pie chart: Where money goes |
| **Payment Mode Split** | Horizontal bar: Cash vs Digital comparison |
| **Top Parties** | Bar: Highest volume contacts |
| **Daily Averages** | Average daily income and expense |
| **Financial Overview** | Radar chart: Multi-dimensional snapshot |

Analytics are powered by a **Python module** using Pandas for aggregation, called from the Node.js backend.

---

## Project Structure

```
trust-crm/
├── backend/
│   ├── src/
│   │   ├── server.js              # Express entry point
│   │   ├── config/
│   │   │   └── supabaseAdmin.js   # Supabase service-role client
│   │   ├── middlewares/
│   │   │   └── auth.js            # requireAuth + requireRole
│   │   ├── routes/
│   │   │   ├── transactions.js    # CRUD with field-level whitelist
│   │   │   ├── contacts.js        # Contact management
│   │   │   ├── dashboard.js       # Summary + opening balance
│   │   │   ├── categories.js      # Category management
│   │   │   ├── users.js           # User management (admin)
│   │   │   └── analytics.js       # Python analytics bridge
│   │   ├── services/
│   │   │   └── notify.js          # Email + Telegram notifications
│   │   └── cron/
│   │       └── monthlyReport.js   # Automated monthly reports
│   ├── analytics/
│   │   └── analytics.py           # Pandas analytics engine
│   ├── requirements.txt           # Python dependencies
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── main.jsx               # Entry with ToastProvider
│   │   ├── App.jsx                # Routes + Protected + AdminProtected
│   │   ├── lib/
│   │   │   ├── api.js             # Axios instance with JWT interceptor
│   │   │   ├── supabase.js        # Supabase client
│   │   │   └── AuthContext.jsx    # Auth state + profile
│   │   ├── components/
│   │   │   ├── Nav.jsx            # Sidebar navigation
│   │   │   ├── AppLayout.jsx      # Layout wrapper
│   │   │   └── Toast.jsx          # Toast notification system
│   │   ├── pages/
│   │   │   ├── Login.jsx          # Glass morphism login
│   │   │   ├── Dashboard.jsx      # Analytics + charts
│   │   │   ├── Transactions.jsx   # Ledger with edit/search
│   │   │   ├── Contacts.jsx       # Contact management
│   │   │   └── Users.jsx          # User management (admin)
│   │   └── index.css              # Custom animations + theme
│   ├── public/
│   │   └── logo.jpg               # Trust logo
│   ├── vercel.json                # SPA rewrite rules
│   └── package.json
├── render.yaml                    # Render deployment config
├── .gitignore                     # Excludes .env*, node_modules, dist
└── README.md
```

---

## Security

### What Is Protected

| Layer | Mechanism |
|-------|-----------|
| **Authentication** | Supabase Auth with JWT tokens. No passwords stored in our DB. |
| **Authorization** | `requireAuth` middleware verifies tokens. `requireRole` checks permissions. |
| **API Protection** | Service-role key never exposed to frontend. All API calls go through Express. |
| **Field Whitelisting** | Transaction PATCH only allows safe fields. No mass-assignment attacks. |
| **Route Guards** | Frontend `AdminProtected` wrapper blocks non-admins from sensitive pages. |
| **RLS** | Supabase Row Level Security as the final database-level safety net. |
| **Secrets Management** | All credentials stored in `.env` files, excluded from git via `.gitignore`. |

### What Is Excluded from Git

```
.env              # All environment files
.env.*            # All variants (.env.local, .env.production, etc.)
!.env.example     # Only templates are tracked
node_modules/     # Dependencies
dist/             # Build output
*.log             # Log files
```

### Files That Are Tracked (Safe)

| File | Contains |
|------|----------|
| `backend/.env.example` | Placeholder templates only — no real credentials |
| `frontend/.env.example` | Placeholder templates only — no real credentials |
| `render.yaml` | Env var declarations (names only, no values) |
| All source code | Reads from `process.env` at runtime — no hardcoded secrets |

### Security Checklist

- [x] No API keys in source code
- [x] No passwords in source code
- [x] No tokens in source code
- [x] `.gitignore` excludes all `.env*` variants
- [x] Only `.env.example` templates are tracked
- [x] Service-role key only exists in backend runtime
- [x] Frontend only uses anon/public key
- [x] Transaction PATCH uses field whitelist (no mass-assignment)
- [x] Admin routes protected by `requireRole('admin')`
- [x] Users cannot modify their own role
- [x] Users cannot delete themselves

---

## Deployment

### Frontend → Vercel

```bash
cd frontend
vercel --prod
```

Set environment variable in Vercel Dashboard:
- `VITE_API_URL` = `https://your-backend.onrender.com/api`

### Backend → Render

Push to GitHub. Render auto-deploys from `main` branch.

Set these environment variables in Render Dashboard (never in code):

| Variable | Source |
|----------|--------|
| `SUPABASE_URL` | Supabase Dashboard → Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Dashboard → Settings → API |
| `SMTP_USER` | Your Gmail address |
| `SMTP_PASS` | Gmail App Password |
| `TELEGRAM_BOT_TOKEN` | @BotFather |

---

## How Trust CRM Compares

<table>
<tr>
<th>Feature</th>
<th>Trust CRM</th>
<th>Salesforce / HubSpot</th>
<th>Spreadsheets</th>
<th>Generic CRM</th>
</tr>
<tr>
<td><b>Built for trusts/charities</b></td>
<td>✅ Purpose-built</td>
<td>❌ Built for sales</td>
<td>⚠️ Manual</td>
<td>❌ Generic</td>
</tr>
<tr>
<td><b>Cash + Digital tracking</b></td>
<td>✅ Dual ledger</td>
<td>❌ Single pipeline</td>
<td>⚠️ Separate sheets</td>
<td>⚠️ Usually one mode</td>
</tr>
<tr>
<td><b>Contact management</b></td>
<td>✅ Create/Edit per role</td>
<td>⚠️ Complex setup</td>
<td>❌ Manual list</td>
<td>⚠️ Basic</td>
</tr>
<tr>
<td><b>Instant notifications</b></td>
<td>✅ Email + Telegram</td>
<td>❌ Extra setup needed</td>
<td>❌ None</td>
<td>⚠️ Email only</td>
</tr>
<tr>
<td><b>Auto monthly reports</b></td>
<td>✅ Built-in cron</td>
<td>⚠️ Requires addon</td>
<td>❌ Manual Excel</td>
<td>⚠️ Paid feature</td>
</tr>
<tr>
<td><b>Role-based access</b></td>
<td>✅ 3-tier enforced</td>
<td>✅ Complex setup</td>
<td>❌ None</td>
<td>⚠️ Basic</td>
</tr>
<tr>
<td><b>Free tier viable</b></td>
<td>✅ Fully free</td>
<td>❌ Expensive</td>
<td>✅ Free</td>
<td>⚠️ Freemium</td>
</tr>
<tr>
<td><b>Self-hosted option</b></td>
<td>✅ Full control</td>
<td>❌ Cloud only</td>
<td>✅ Local files</td>
<td>⚠️ Varies</td>
</tr>
<tr>
<td><b>Analytics dashboard</b></td>
<td>✅ 10+ chart types</td>
<td>✅ Advanced</td>
<td>⚠️ Manual charts</td>
<td>⚠️ Basic</td>
</tr>
<tr>
<td><b>Security posture</b></td>
<td>✅ 6-layer enforced</td>
<td>✅ Enterprise grade</td>
<td>❌ None</td>
<td>⚠️ Basic</td>
</tr>
<tr>
<td><b>Learning curve</b></td>
<td>✅ Minimal</td>
<td>❌ Weeks to learn</td>
<td>✅ None</td>
<td>⚠️ Moderate</td>
</tr>
<tr>
<td><b>Mobile-friendly</b></td>
<td>✅ Responsive</td>
<td>✅ App available</td>
<td>❌ Desktop only</td>
<td>⚠️ Varies</td>
</tr>
</table>

---

## License

<div align="center">

**All rights reserved.**

This software, including all source code, design patterns, architecture, and documentation, is the exclusive property of the Trust. Unauthorized copying, modification, distribution, or use of this software, in whole or in part, is strictly prohibited.

The license and source code remain exclusively with the Trust.

<br />

**Made with intention. Built for transparency.**

</div>
