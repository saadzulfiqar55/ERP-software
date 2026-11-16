# Albarka Restaurant & Retail — Hybrid POS & ERP

A modern full-stack **Next.js (App Router + TypeScript + Tailwind CSS)** Point of Sale (POS), Double-Entry Khata Ledger, Dynamic Sales Tax Calculator, and **Punjab Revenue Authority (PRA) e-IMS** fiscal billing system designed for hybrid **Desi Restaurant & Retail Counter** operations.

---

## Key Features

- **Hybrid POS Terminal (Restaurant + Retail)**
  - Supports **Dine-In** (Table & Waiter assignment + Kitchen Station KOT), **Takeaway**, **Delivery**, and **Retail Counter** (Barcode / SKU scanning).
  - Menu cards with customizable product images, portion/variant selectors (*Full 1 Kg, Half 500g, Gift Box, Plate*), and quick chef notes.
- **Dynamic Sales Tax Calculator & PRA e-IMS Integration**
  - Automatically recalculates Punjab Revenue Authority GST by payment method (**16% Cash GST** vs. **5% Bank Card / Digital GST**, or proportional **Split Bill**).
  - Supports **Tax-Exclusive**, **Tax-Inclusive**, and **Tax-Exempt** items.
  - Generates official **PRA Fiscal Invoice Numbers**, verification **QR codes**, **80mm Thermal Receipts**, **Kitchen Order Tickets (KOT)**, and monthly **PRA Return CSV exports**.
- **Double-Entry Khata & Ledger**
  - Track **Customer Credit Accounts (Receivables)**, **Supplier Payables** (*Meat, Poultry, Flour/Grocery vendors*), and **Daily Cash Drawer (Galla) Vouchers**.
- **HS256 JWT + OAuth 2.0 Ready Authentication & Single-Active-Session Lock**
  - Enforces **strictly one active logged-in profile at a time** via HTTP-Only signed `HS256` JWT cookies and a server-side session lock with full security audit logging.
- **Dual-Mode Database (Local JSON + MongoDB Ready)**
  - Works out-of-the-box with zero configuration using local persistence (`data/albarka-db.json`), and connects to **MongoDB / MongoDB Atlas** via the built-in Database Settings panel.

---

## Default Staff Profiles & PINs

| Role | Name | Default PIN | Access Level |
| :--- | :--- | :---: | :--- |
| **ADMIN** | Haji Tariq Mahmood | `1111` | Full access to POS, PRA API Settings, Tax Rates, Menu Photos/Pricing, Discounts, Khata & Z-Report |
| **MANAGER** | Usman Ali Cheema | `2222` | Access to POS, Discounts, Menu/Photos, Khata & Z-Report (PRA fiscal settings read-only) |
| **CASHIER** | Umar Farooq | `3333` | POS Terminal & Billing only |

---

## Getting Started

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Run the development server:**
   ```bash
   npm run dev
   ```

3. **Open in browser:**
   Navigate to `http://localhost:3000`.
