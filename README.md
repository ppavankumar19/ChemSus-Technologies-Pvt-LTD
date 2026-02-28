# ChemSus Technologies — Web Application

A full-stack web application for **ChemSus Technologies Pvt Ltd**, featuring a **product showcase**, **e-commerce shop**, **order & payment flow**, **user authentication via Supabase**, **user order tracking**, and a **secure admin dashboard**.

---

## Project Overview

* Public website for **products, shop, and company info**
* **User authentication** — Sign up / Log in with Email or Google OAuth (Supabase)
* **Order placement** — Buy Now and Cart flows with OTP email verification
* **UPI payment receipt upload**
* **My Orders page** — Users can track their order history, view item-level order details, delivery status, and send queries to the admin
* **Order messaging** — Users send queries per order; admin views and replies in the order detail modal
* **Admin dashboard** — Full control for a designated admin email:
  * Products page management
  * Shop items CRUD
  * Pack pricing management
  * Orders management — status updates, full order detail modal (customer info, shipping, items, customer queries), delete
  * Customers view — aggregated per-customer stats across all orders
  * Payments and receipt verification
  * Site settings (brochure upload)
  * Auto-resets order & payment ID sequences to 1 when all records are deleted

Built with **Node.js + Express + PostgreSQL** — production-ready and cloud-deployable.

---

## Features

### 🔐 Authentication (Supabase)

* **Email/Password** sign up and login
* **Google OAuth** login
* **Role-based access** — a specific admin email gets redirected to the admin dashboard; all other users go to the homepage
* **JWT-protected API** — admin routes require valid Supabase JWT with matching admin email
* **Auto-updating navbar** — shows "Log In / Sign Up" or "Logout (email)" based on auth state across all pages

### 🛍️ Public Website

| Page | Description |
|---|---|
| `/index.html` | Home page |
| `/about.html` | About ChemSus Technologies |
| `/products.html` | Product catalogue |
| `/shop.html` | Shop with pricing and Buy Now / Add to Cart |
| `/cart.html` | Shopping cart |
| `/buy.html` | Buy Now / Cart checkout |
| `/buynow.html` | Direct buy flow |
| `/orders.html` | Order placement form (OTP-verified) |
| `/payment2.html` | UPI payment + receipt upload |
| `/success.html` | Order success confirmation |
| `/login.html` | Supabase auth — Email/Password & Google OAuth |
| `/user-orders.html` | User's order history with status tracking |
| `/collaboration.html` | Collaboration info |
| `/recognitions.html` | Awards & recognitions |
| `/investors.html` | Investor information |
| `/contact.html` | Contact details |
| `/request-sample.html` | Sample request form |

### 🛠️ Admin Dashboard (`/admin/admin.html`)

* **Supabase session-based access** — no manual login form; redirects to login page if not the admin email
* Products page CRUD
* Shop items CRUD
* Pack pricing CRUD (per product)
* **Orders** — listing, search/filter, inline order status dropdown, full order detail modal (customer info, shipping, items, **customer query thread with admin reply**), delete. Deleting all orders resets ID to 1.
* **Customers** — aggregated view per customer derived from orders (name, email, phone, company, total orders, total spend, last order date) with one-click filter to their orders
* **Users** — list of all registered Supabase Auth accounts (email, sign-in provider, joined date, last sign-in); requires `SUPABASE_SERVICE_ROLE_KEY`
* **Payments** — view receipts, mark SUCCESS/FAILED, delete. Deleting all payments resets ID to 1.
* File uploads — images and PDFs
* Brochure URL management
* Fully mobile-responsive

---

## Tech Stack

### Frontend
* HTML5, CSS3 (custom, responsive), Vanilla JavaScript
* Google Fonts (Montserrat, Open Sans)
* Supabase JS Client (`@supabase/supabase-js` via CDN)

### Backend
* Node.js + Express.js
* **PostgreSQL** via `pg` (node-postgres)
* Multer (file uploads)
* Nodemailer (email OTP for order verification)

### Authentication
* Supabase Auth (Email/Password + Google OAuth)
* JWT token verification on admin and user routes

---

## Project Structure

```
ChemSus/
├── backend/
│   ├── server.js               # Express server + API routes + Supabase JWT middleware
│   └── db.js                   # PostgreSQL pool, schema init, run/get/all helpers
├── public/
│   ├── admin/
│   │   └── admin.html          # Admin dashboard (Supabase-protected)
│   ├── assets/
│   │   ├── js/
│   │   │   └── supabase-client.js  # Supabase config + navbar auth state
│   │   ├── uploads/            # Uploaded images (gitignored)
│   │   └── receipts/           # Payment receipts (gitignored)
│   ├── products/               # Individual product detail pages
│   ├── index.html              # Home page
│   ├── login.html              # Supabase login/signup page
│   ├── user-orders.html        # User order history page
│   ├── shop.html, cart.html, buy.html, orders.html, payment2.html, ...
│   └── (other public pages)
├── .env                        # Environment variables (gitignored)
├── .env.example                # Template for required env vars
├── package.json
├── seed.js                     # Database seeding (npm run seed / npm run reset)
└── README.md
```

---

## Environment Variables

Create a `.env` file in the project root (see `.env.example`):

```env
# PostgreSQL — use individual params (safe for passwords with special characters)
DB_HOST=aws-0-xx-region.pooler.supabase.com
DB_PORT=6543
DB_USER=postgres.yourprojectref
DB_PASSWORD=YourPasswordHere
DB_NAME=postgres

# OR use a single connection string (simpler, but avoid special chars in password)
# DATABASE_URL=postgresql://postgres.ref:password@host:6543/postgres

# Supabase (required)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-supabase-anon-key
ADMIN_EMAIL=admin@example.com

# Required for the admin Users view (lists Supabase Auth accounts)
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key

# Optional — Email OTP for order verification
OTP_SMTP_HOST=smtp.your-provider.com
OTP_SMTP_PORT=587
OTP_SMTP_SECURE=false
OTP_SMTP_USER=your_smtp_user
OTP_SMTP_PASS=your_smtp_password
OTP_EMAIL_FROM=no-reply@yourdomain.com
OTP_HASH_SECRET=change_this_secret
OTP_TTL_MIN=10
OTP_RESEND_SEC=60
OTP_MAX_ATTEMPTS=5
OTP_TOKEN_TTL_MIN=30
```

**Where to get these values:**
* `DB_HOST` / `DB_PORT` / `DB_USER` — Supabase Dashboard → Project Settings → Database → Connection string → **Transaction pooler** tab
* `SUPABASE_URL` / `SUPABASE_ANON_KEY` — Supabase Dashboard → Settings → API
* `SUPABASE_SERVICE_ROLE_KEY` — Supabase Dashboard → Settings → API → **Service Role Key** (keep this secret — never expose to the browser)
* Use port **6543** (Supavisor transaction pooler), not 5432, for serverless/Node.js apps

---

## Database Tables

| Table | Purpose |
|---|---|
| `products_page` | Product catalogue cards |
| `shop_items` | Shop items with pricing |
| `pack_pricing` | Pack sizes and tiered pricing |
| `orders` | Customer orders (with `user_id` and `order_status`) |
| `order_items` | Order line items |
| `payments` | Payment records and receipts |
| `site_settings` | Brochure URL and site configuration |
| `email_otp_sessions` | Email OTP sessions for checkout verification |
| `order_messages` | Customer queries and admin replies per order |

All tables are created automatically on first startup via `initDb()` in `backend/db.js`.

---

## API Endpoints

### Admin APIs (require Supabase JWT with admin email)

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/admin/me` | Check admin session |
| GET | `/api/admin/products-page` | List products |
| POST | `/api/admin/products-page` | Create product |
| PUT | `/api/admin/products-page/:id` | Update product |
| DELETE | `/api/admin/products-page/:id` | Delete product |
| GET | `/api/admin/shop-items` | List shop items |
| POST | `/api/admin/shop-items` | Create shop item |
| PUT | `/api/admin/shop-items/:id` | Update shop item |
| DELETE | `/api/admin/shop-items/:id` | Delete shop item |
| GET | `/api/admin/pack-pricing/:shopItemId` | List pack prices |
| GET | `/api/admin/orders` | List all orders |
| PATCH | `/api/admin/orders/:id/status` | Update order delivery status |
| DELETE | `/api/admin/orders/:id` | Delete order |
| GET | `/api/admin/payments` | List payments |
| DELETE | `/api/admin/payments/:id` | Delete payment |
| POST | `/api/admin/payment-status` | Mark payment SUCCESS/FAILED |
| POST | `/api/admin/upload` | Upload file |
| POST | `/api/admin/brochure` | Save brochure URL |
| GET | `/api/admin/users` | List all Supabase Auth accounts (requires service role key) |

### User APIs (require Supabase JWT)

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/user/orders` | Get logged-in user's order history (with item-level details) |
| GET | `/api/user/orders/:id/messages` | Get query thread for a specific order |
| POST | `/api/user/orders/:id/message` | Send a query message for a specific order |

### Admin Message APIs (require Supabase JWT with admin email)

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/admin/orders/:id/messages` | View all messages for an order |
| POST | `/api/admin/orders/:id/reply` | Send an admin reply to a customer query |

### Public APIs

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/otp/email/send` | Send OTP to email |
| POST | `/api/otp/email/verify` | Verify OTP |
| POST | `/api/orders` | Place an order |
| POST | `/api/receipts` | Upload payment receipt |
| GET | `/api/site/brochure` | Get brochure URL |
| GET | `/api/shop-items` | List active shop items |
| GET | `/api/pack-pricing/:shopItemId` | Get pack pricing |

---

## How to Run

### 1. Install dependencies

```bash
npm install
```

### 2. Set up Supabase

1. Create a project at [supabase.com](https://supabase.com)
2. Copy your **Project URL** and **anon key** from Settings → API
3. Enable **Email** provider in Authentication → Providers
4. (Optional) Enable **Google** provider with your OAuth credentials
5. Add your site URL to Authentication → URL Configuration
6. Get your **Transaction pooler** connection details from Project Settings → Database

### 3. Configure environment

```bash
cp .env.example .env
# Fill in DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, SUPABASE_URL, SUPABASE_ANON_KEY, ADMIN_EMAIL
```

### 4. Seed the database

```bash
# Populate with initial product and shop data
npm run seed

# To wipe and re-seed from scratch
npm run reset
```

### 5. Start the server

```bash
# Development (auto-reload)
npm run dev

# Production
npm start
```

### 6. Open in browser

```
http://localhost:3000
```

---

## Authentication Flow

1. User visits any page → navbar shows **"Log In / Sign Up"**
2. Clicks login → redirected to `/login.html`
3. Signs up or logs in with Email/Password or Google
4. **Admin email** → redirected to `/admin/admin.html` (dashboard)
5. **Any other email** → redirected to `/index.html` (homepage)
6. Navbar updates to show **"Logout (email)"** on all pages
7. Admin API calls include `Authorization: Bearer <supabase_jwt>` header

---

## Deployment

### Live URL

**[https://chemsus-technologies-pvt-ltd.onrender.com](https://chemsus-technologies-pvt-ltd.onrender.com)**

---

### Deployed on Render.com

The application is hosted on **Render.com** as a Web Service connected to this GitHub repository.

#### How it was deployed

1. **Pushed code to GitHub**
   - Repository: `ChemSus-Technologies-Pvt-LTD` (public)
   - Branch: `main`

2. **Created a Web Service on Render.com**
   - Connected the GitHub repository URL
   - **Runtime**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`

3. **Set Environment Variables** in Render dashboard:

   | Variable | Description |
   |---|---|
   | `NODE_ENV` | `production` |
   | `SUPABASE_URL` | Supabase project URL |
   | `SUPABASE_ANON_KEY` | Supabase anon/public key |
   | `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (for admin Users view) |
   | `ADMIN_EMAIL` | Email that gets admin dashboard access |
   | `DB_HOST` | Supabase transaction pooler host |
   | `DB_PORT` | `6543` (Supabase transaction pooler) |
   | `DB_USER` | `postgres.yourprojectref` |
   | `DB_PASSWORD` | Supabase database password |
   | `DB_NAME` | `postgres` |
   | `OTP_HASH_SECRET` | Random secret string for OTP hashing |
   | `OTP_SMTP_HOST` | SMTP host for OTP emails (optional) |
   | `OTP_SMTP_PORT` | SMTP port (default `587`) |
   | `OTP_SMTP_USER` | SMTP username |
   | `OTP_SMTP_PASS` | SMTP password |
   | `OTP_EMAIL_FROM` | From address for OTP emails |

4. **Clicked "Create Web Service"** → Render pulled the code, ran `npm install`, and started the server

5. **Seeded the database** via Render Shell:
   ```bash
   npm run seed
   ```

6. **Configured Supabase Auth redirect URLs**
   - Supabase Dashboard → Authentication → URL Configuration
   - Site URL: `https://chemsus-technologies-pvt-ltd.onrender.com`
   - Redirect URLs: `https://chemsus-technologies-pvt-ltd.onrender.com/login.html`

---

### Notes

* Works out of the box on **Railway, Render, Heroku**, or any Node.js host
* `DATABASE_URL` is auto-set by most platforms — the app detects it automatically
* For Supabase-hosted PostgreSQL, use the **Transaction pooler** URL (port 6543)
* Uploaded files go to `public/assets/uploads/` and `public/assets/receipts/` — use a **persistent disk** or swap to S3/Supabase Storage to preserve files across deploys

---

## Security

* Admin access controlled by **Supabase JWT + email verification**
* Admin API routes validate JWT token and check email matches `ADMIN_EMAIL`
* User-facing protected routes (`/api/user/orders`) require valid JWT
* File uploads are type-validated
* Static files served only from `public/`

---

## License

© 2025 **ChemSus Technologies Pvt Ltd**. All rights reserved.
