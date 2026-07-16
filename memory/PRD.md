# Family Financial Tracker — PRD

## Problem statement
Build a Family Wealth Management Platform (NOT expense tracker) for Indonesian families. Highest entity is Family Workspace. Feels like Monarch Money + Copilot + YNAB + Apple Wallet.

## Users & Personas
- **Owner**: creates family, invites members, full control
- **Editor / Viewer / Child**: (Phase 2 - RBAC detail)

## Core requirements (static)
- Family workspace is top-level entity
- Per-entity privacy: PRIVATE (owner-only) vs SHARED (all family)
- IDR currency, format "Rp 1.500.000"
- Budget cycle: 25th → 24th
- Bilingual (ID + EN)

## Phase 1 — Implemented (2026-07-16)
- ✅ JWT auth (register/login/me) with bcrypt + Bearer tokens (localStorage)
- ✅ Family workspace auto-created on first register + default categories seeded
- ✅ Accounts CRUD (bank/e-wallet/cash/credit_card) with brand-tinted colors, PRIVATE/SHARED visibility
- ✅ Transactions (income/expense/transfer) with auto-balance updates + delete-with-reverse
- ✅ Premium dashboard: Net Worth (Playfair Display), 25→24 cycle stats, Recent Transactions
- ✅ Bilingual UI (ID default + EN toggle)
- ✅ Dark luxury theme (obsidian + gold #C5A880), Manrope + Playfair Display

## Phase 2 — Backlog (P0 → P2)
- **P0**: Member invitation via email, deeper RBAC (Editor/Viewer/Child), Budget module (25→24 with 80/95/100 warnings), Reminders/Bills (Pay flow → create transaction)
- **P1**: Assets (House/Vehicle/Gold with valuation history), Investments (Gold/TD/Mutual Fund), Loans (with schedule), Saving Goals
- **P2**: Reports (Cash Flow, Income Statement, Net Worth History), Financial Calendar, Insights engine, Audit Trail, Settings (theme, backup)

## Architecture
- Backend: FastAPI + Motor (async MongoDB), JWT (PyJWT), bcrypt. Routes under `/api/*`.
- Frontend: React 19 + Tailwind + shadcn/ui + Radix + lucide-react + framer-motion + sonner.
- DB: MongoDB. Collections: users, families, accounts, transactions, categories.

## Design language
- Archetype: Luxury dark theme. Background `#0A0A0A`, surface `#141414`, gold accent `#C5A880`, income `#10B981`, expense `#F43F5E`. No purple gradients. Fonts: Playfair Display (headings/metrics) + Manrope (body, `tabular-nums` for amounts).
