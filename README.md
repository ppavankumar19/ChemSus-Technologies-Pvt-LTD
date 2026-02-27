# ChemSus Technologies — Web Application

A full-stack web application for **ChemSus Technologies Pvt Ltd**, featuring a **product showcase**, **e-commerce shop**, **order & payment flow**, **user authentication via Supabase**, **user order tracking**, and a **secure admin dashboard**.

---

## Project Overview

* Public website for **products, shop, and company info**
* **User authentication** — Sign up / Log in with Email or Google OAuth (Supabase)
* **Order placement** — Buy Now and Cart flows
* **UPI payment receipt upload**
* **My Orders page** — Users can track their order history and delivery status
* **Admin dashboard** — Full control for a designated admin email:
  * Products page management
  * Shop items CRUD
  * Pack pricing management
  * Orders management with status updates
  * Payments and receipt verification
  * Site settings (brochure upload)

Built with **Node.js + Express + SQLite** — lightweight, fast, and easy to deploy.

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
| `/orders.html` | Order placement form |
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
* Orders — listing, filtering, deletion, and **order status updates** (Processing → Confirmed → Shipped → Delivered → Cancelled)
* Payments — view receipts, mark SUCCESS/FAILED, delete
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
* SQLite3 (auto-migrated)
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
│   └── db.js                   # SQLite schema, migrations, and seeding
├── public/
│   ├── admin/
│   │   └── admin.html          # Admin dashboard (Supabase-protected)
│   ├── assets/
│   │   ├── js/
│   │   │   └── supabase-client.js  # Supabase config + navbar auth state
│   │   ├── uploads/            # Uploaded images
│   │   └── receipts/           # Payment receipts
│   ├── products/               # Individual product detail pages
│   ├── index.html              # Home page
│   ├── login.html              # Supabase login/signup page
│   ├── user-orders.html        # User order history page
│   ├── shop.html, cart.html, buy.html, orders.html, payment2.html, ...
│   └── (other public pages)
├── db/
│   └── chemsus.sqlite          # SQLite database (auto-created)
├── .env                        # Environment variables
├── package.json
├── seed.js / seed-data.sql     # Database seeding scripts
└── README.md
```

---

## Environment Variables

Create a `.env` file in the project root (see `.env.example`):

```env
# Supabase (required)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-supabase-anon-key
ADMIN_EMAIL=admin@example.com

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

Supabase values come from **Supabase Dashboard → Settings → API**.  
The backend now exposes `/config.json` using these env vars so the public anon key never lives in git; `public/assets/js/supabase-client.js` fetches that endpoint at runtime.

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

Database auto-migrates on startup — new columns (`user_id`, `order_status`) are added automatically to existing databases.

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
| DELETE | `/api/admin/orders/:id` | Delete order |
| PATCH | `/api/admin/orders/:id/status` | Update order status |
| GET | `/api/admin/payments` | List payments |
| DELETE | `/api/admin/payments/:id` | Delete payment |
| POST | `/api/admin/payment-status` | Mark payment SUCCESS/FAILED |
| POST | `/api/admin/upload` | Upload file |
| POST | `/api/admin/brochure` | Save brochure URL |

### User APIs (require Supabase JWT)

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/user/orders` | Get logged-in user's order history |

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
3. Paste them into `public/assets/js/supabase-client.js`
4. Enable **Email** provider in Authentication → Providers
5. (Optional) Enable **Google** provider with your OAuth credentials
6. Add your site URL to Authentication → URL Configuration

### 3. Configure environment

```bash
# Create .env file
echo ADMIN_EMAIL=your-admin@email.com > .env
```

### 4. Start the server

```bash
# Development (auto-reload)
npm run dev

# Production
npm start
```

### 5. Open in browser

```
http://localhost:3000
```

---

## Authentication Flow

1. User visits any page → sidebar shows **"Log In / Sign Up"**
2. Clicks login → redirected to `/login.html`
3. Signs up or logs in with Email/Password or Google
4. **Admin email** → redirected to `/admin/admin.html` (dashboard)
5. **Any other email** → redirected to `/index.html` (homepage)
6. Navbar updates to show **"Logout (email)"** on all pages
7. Admin API calls include `Authorization: Bearer <supabase_jwt>` header

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
