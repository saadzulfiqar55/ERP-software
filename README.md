# Albarka ERP & POS — Material Design 3 (Material You)

A full-stack **Next.js (App Router) + TypeScript + MongoDB** Enterprise Resource Planning (ERP), Point of Sale (POS), Invoicing, Double-Entry Khata Accounting, and **Punjab Revenue Authority (PRA) e-IMS** system built with **Google Material Design 3 (Material You)**.

---

## 1. Material 3 Design Tokens (`src/app/globals.css`)

All surfaces, tonal containers, outlines, and semantic states are driven by CSS variables mapped into the Tailwind v4 `@theme` layer—no hard-coded hex colors appear inside components:

| Token | CSS Variable | Utility Class (`bg-*` / `text-*` / `border-*`) | Role |
| :--- | :--- | :--- | :--- |
| **Primary** | `--md-primary` (`#36618E`) | `bg-md-primary` / `text-md-on-primary` | Filled CTA buttons, active focus borders, brand tile |
| **Primary Container** | `--md-primary-container` (`#D1E4FF`) | `bg-md-primary-container` / `text-md-on-primary-container` | Extended FAB (`Create`), icon tiles, `Sent` status chips |
| **Secondary Container** | `--md-secondary-container` (`#D7E3F7`) | `bg-md-secondary-container` / `text-md-on-secondary-container` | Active navigation pill, selected `FilterChip` & `SegmentedButton` |
| **Tertiary** | `--md-tertiary` (`#6B5778`) | `bg-md-tertiary` | User initials avatars |
| **Surface** | `--md-surface` (`#F8F9FF`) | `bg-md-surface` / `text-md-on-surface` | App canvas |
| **Surface Container Low** | `--md-surface-container-low` (`#F2F3FA`) | `bg-md-surface-container-low` | Navigation drawer (`264px`), tonal summary cards |
| **Surface Container Lowest** | `--md-surface-container-lowest` (`#FFFFFF`) | `bg-md-surface-container-lowest` | Outlined cards (`16px` radius + `1px` `--md-outline-variant` border) |
| **Semantic Containers** | `--md-success-container`, `--md-warning-container`, `--md-error-container` | `bg-md-success-container`, `bg-md-warning-container`, `bg-md-error-container` | `StatusChip` & KPI summary tiles (`Paid`, `Pending`, `Overdue`) |

*(Dark theme variables are pre-configured under `[data-theme="dark"]` in `src/app/globals.css`.)*

---

## 2. Reusable Material 3 Component Library (`src/components/ui/m3.tsx`)

- **`Button`**: Variants `filled`, `tonal`, `outlined`, `text`, `icon` (pill-shaped `rounded-full`).
- **`ExtendedFab`**: `16px` radius (`rounded-2xl`), `primary-container` fill, soft shadow.
- **`NavItem`**: `56px` tall pill with icon, label, optional count badge, and `aria-current="page"`.
- **`SearchBar`**: `56px` tall pill in `surface-container-high` with `Ctrl K` hint chip that triggers the `CommandPalette` dialog.
- **`Card` & `StatCard`**: `16px` radius flat cards (`outlined` or `tonal`) and KPI cards with `40px` tonal icon tiles and `32/40` `tabular-nums` values.
- **`StatusChip` & `FilterChip`**: `8px` radius chips; `FilterChip` displays a check icon when selected.
- **`SegmentedButton`**: Pill group with check icon on the active segment.
- **`OutlinedTextField`**: Material 3 notched top-border floating label (`4px` radius), `2px` primary focus border, helper/error text, and support for `select`, `date`, and `multiline`.
- **`Switch`**: Material 3 `52×32px` track where the thumb grows from `16px` to `24px` and displays a check icon when `checked` (`role="switch"` + `aria-checked`).
- **`ProgressBar`**: `6px` rounded bar colored automatically by stock ratio (`<15%` error, `<35%` warning, else primary).

---

## 3. How to Add a New Page Using the Shell & Components

1. Register the navigation entry and required `ERPPermission` in `src/lib/nav.ts` (`ERP_NAVIGATION_ITEMS`).
2. Create your view component under `src/components/<module>/` using `PageHeader`, `Card`, `StatCard`, `FilterChip`, `OutlinedTextField`, and `Button` from `@/components/ui/m3`.
3. Add a route file under `src/app/<module>/page.tsx` rendering `<AlbarkaMaterial3ERP defaultNav="<module>" />`.

---

## 4. Running Locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000` (or `/dashboard`, `/invoices`, `/invoices/new`). Default PINs: **Admin** (`1111`), **Manager** (`2222`), **Cashier** (`3333`).
