# ChemSus Technologies – Web Application

A full-stack web application for **ChemSus Technologies Pvt Ltd**, including a **product showcase**, **shop**, **order & payment flow**, and a **secure admin dashboard** to manage products, orders, payments, and receipts.

---

## 🌐 Project Overview

This project provides:

* Public website for **products and shop**
* **Order placement** (Buy Now & Cart flow)
* **UPI payment receipt upload**
* **Admin dashboard** for full control:

  * Products page
  * Shop items
  * Orders management
  * Payments & receipt verification
  * Site settings (brochure upload)

The system is lightweight, fast, and built with **Node.js + SQLite**, making it easy to deploy and maintain.

---

## 🚀 Features

### Public Website

* Products listing (`products.html`)
* Shop with Buy Now & Add to Cart (`shop.html`)
* Order form (`orders.html`)
* Payment via UPI QR
* Receipt upload + rating (`payment.html`, `payment2.html`)
* Success page after payment (`success.html`)

### Admin Dashboard

* Secure admin login
* Products page CRUD
* Shop items CRUD
* Order listing with filters & delete
* Payments & receipts:

  * View uploaded receipts
  * Mark payments SUCCESS / FAILED
  * Delete payments
* Upload images & PDFs
* Manage brochure download link
* Fully **mobile-responsive**

---

## 🛠️ Tech Stack

### Frontend

* HTML5
* CSS3 (custom, responsive)
* Vanilla JavaScript
* Google Fonts (Montserrat, Open Sans)

### Backend

* Node.js
* Express.js
* SQLite3
* Multer (file uploads)

### Database

* SQLite (`chemsus.sqlite`)
* Auto-migrated (no manual DB setup)

---

## 📁 Project File Structure

```text
chemsus/
│
├── admin/
│   └── admin.html              # Admin dashboard UI
│
├── assets/
│   ├── logo.jpg
│   ├── payment-qr.png
│   ├── uploads/                # Uploaded images & PDFs
│   └── receipts/               # Uploaded payment receipts
│
├── products/
│   └── *.html                  # Individual product pages
│
├── db/
│   └── chemsus.sqlite          # SQLite database (DO NOT DELETE)
│
├── server/
│   ├── server.js               # Express server
│   └── db.js                   # SQLite schema & init
│
├── index.html                  # Home page
├── products.html               # Products listing page
├── shop.html                   # Shop page
├── orders.html                 # Order form
├── payment.html                # Payment page (cart flow)
├── payment2.html               # Payment page (buy now flow)
├── success.html                # Payment success page
│
├── package.json
├── package-lock.json
└── README.md
```

---

## 📄 Pages & Routes

### Public Pages

| Page             | Description           |
| ---------------- | --------------------- |
| `/index.html`    | Home                  |
| `/products.html` | Product listing       |
| `/shop.html`     | Shop page             |
| `/orders.html`   | Order form            |
| `/payment.html`  | Payment (cart orders) |
| `/payment2.html` | Payment (buy now)     |
| `/success.html`  | Order success         |

### Admin

| URL                 | Description     |
| ------------------- | --------------- |
| `/admin/admin.html` | Admin dashboard |

---

## 🔐 Admin Login

**Default credentials:**

```text
Username: admin
Password: chemsus123
```

> ⚠️ Change credentials in `server.js` before production.

---

## 🗄️ Database Tables

* `products_page` – Products page cards
* `shop_items` – Shop items
* `orders` – Customer orders
* `payments` – Payment & receipt records
* `site_settings` – Brochure & site settings

📌 Database is **persistent** – `chemsus.sqlite` is never deleted automatically.

---

## ⚙️ API Overview

### Admin APIs

* `POST /api/admin/login`
* `POST /api/admin/logout`
* `GET /api/admin/products-page`
* `GET /api/admin/shop-items`
* `GET /api/admin/orders`
* `GET /api/admin/payments`
* `DELETE /api/admin/orders/:id`
* `DELETE /api/admin/payments/:id`
* `POST /api/admin/payment-status`

### Public APIs

* `POST /api/orders`
* `POST /api/receipts`
* `GET /api/site/brochure`

---

## ▶️ How to Run the Project

### 1️⃣ Install dependencies

```bash
npm install
```

### 2️⃣ Start the server

```bash
node server/server.js
```

or (recommended for development):

```bash
npx nodemon server/server.js
```

### 3️⃣ Open in browser

```text
http://localhost:3000
```

---

## 📦 Git Workflow

### Stage all changes

```bash
git add .
```

### Commit

```bash
git commit -m "Implement ChemSus admin dashboard with full CRUD and order/payment management"
```

---

## 🧪 Tested Features

* ✔ Product CRUD
* ✔ Shop CRUD
* ✔ Order placement
* ✔ Receipt upload
* ✔ Payment verification
* ✔ Delete orders & payments
* ✔ Mobile responsiveness

---

## 🔒 Security Notes

* Admin authentication uses HTTP-only cookies
* File uploads are sanitised
* SQLite foreign keys enforced
* Receipt deletion removes DB entry (file can be optionally cleaned)

---

## 📌 Future Improvements (Optional)

* Role-based admin access
* Email notifications
* Payment gateway integration
* Pagination for orders & payments
* Cloud storage for receipts

---

## 🧾 License

© 2025 **ChemSus Technologies Pvt Ltd**
All rights reserved.

---
