# SharkTrade Pro — Demo Build

A portfolio/demo version of the SharkTrade Pro investor dashboard, with a real
Node/Express + SQLite backend behind the deposit, withdrawal, transfer,
investment, and referral flows, plus a full admin panel.

**This is a demo only.** No real payments are processed anywhere — deposits,
withdrawals, and daily ROI credits are all simulated ledger entries in a local
SQLite database. There is no crypto wallet integration, no payment gateway,
and no real money ever moves. Treat this as a UI/UX + full-stack showcase,
not a product to launch with live funds.

## What's new in this update

- **Profile photo upload** now actually persists (was a bug — saved to `localStorage` only, never sent to the backend). Uploads go through `POST /api/user/avatar`, stored on disk under `public/uploads/avatars/`, and shown on the dashboard.
- **Withdrawals no longer deduct funds until an admin approves them.** Previously funds were held immediately and refunded on rejection — now nothing touches the balance until approval, for both Withdraw and the new Transfer flow.
- **Withdraw** is now Profit-Wallet-only (cashing out investment earnings), with a review step before confirming.
- **New "Transfer" flow** (`external-transfer.html`) — send funds from either Main or Profit wallet to a bank account or external crypto wallet, with a full multi-step review before submitting. Also admin-approved.
- **"Wallet Exch."** now holds the original instant Main ↔ Profit internal swap (previously under "Transfer").
- **Deposit page** shows real payment account details (crypto address / bank info) pulled from the backend, manageable from a new **Payment Methods** tab in the admin panel.
- **Investment plans can be reactivated**, not just deactivated (admin panel).
- **Profit auto-ticks every 30 minutes** on the server (configurable via `ROI_INTERVAL_MINUTES` env var) — no need to manually click "Run Daily ROI" for numbers to move. The dashboard also polls every 60 seconds so Profit Wallet / Total Earned reflect it live.
- **Admin can generate their own referral link** too (shown in the Overview tab) — referral bonuses land in the admin's Profit Wallet the same way as any user.
- **Live chat placeholder** (`public/tawk.js`) — wired for Tawk.to. Add your own Property ID + Widget ID in that file once you've created a free Tawk.to account, and the chat bubble appears automatically across the site.
- **Real phone mockup** on the homepage hero (pure CSS, no external image) — replaces what was an empty `<img>` tag.

## What's new in this update (v3)

- **Fixed mobile layout bug** on Deposit and Support Ticket pages — they were missing the viewport meta tag, causing desktop-width rendering on phones. Also fixed on `blog.html` link target, `referral.html`, and `walletexchange.html`.
- **Replaced Tawk.to with an in-house live chat** (`public/chat-widget.js`) — no external account needed. Floating chat bubble appears on every page once a user is logged in; admins reply from a new **Support Chat** tab in the admin panel. Polls every 5 seconds both ways.
- **Dedicated admin login** (`admin-login.html`) — separate page, not linked anywhere in the public nav (bookmark it). Requires email + password like normal, but only admin accounts can get through; the regular `login.html` now rejects admin accounts and points them here instead.
- **Redesigned hero phone mockup** — now two overlapping, tilted phones (pure CSS, no external images): one showing a live support chat thread, the other a trading chart with candles and buy/sell buttons — styled after the two-phone "premium interface" look.

## Admin login

Regular users sign in at `/login.html`. Admins sign in separately at `/admin-login.html` — this page isn't linked from the site's navigation, so bookmark it. The seeded demo admin account works here:
- **Email:** `admin@sharktrade.demo`
- **Password:** `Admin@2026`

## Deploying to cPanel

This should work fine on cPanel via **Setup Node.js App** (Passenger), as long as your host's Node.js selector offers **Node 22.5 or newer** — this project uses Node's built-in `node:sqlite` module, which doesn't exist before that version. Check your host's available Node versions before deploying; if only older versions are offered, let me know and I can swap the database layer to something more universally supported (e.g. `better-sqlite3`).

## Setup

```bash
npm install
npm start
```

Server runs at `http://localhost:3000` and serves both the API and the
frontend from the same origin.

On first run, the SQLite database (`sharktrade.db`) is created automatically
and seeded with:
- 3 investment plans (Minimum / Maximum / Premium Tier)
- 1 demo admin account:
  - **Email:** `admin@sharktrade.demo`
  - **Password:** `Admin@2026`

Change or remove this seeded admin account before sharing the project
publicly — it's meant as a convenience for local testing only.

## What's wired up

**User side** (`login.html`, `register.html`, `dashboard.html`, `inv.html`,
`withdraw.html`, `transfer.html`, `investment.html`, `deposit-log.html`,
`invest-log.html`, `referral.html`):
- Real signup/login with JWT, referral-code capture (`register.html?ref=CODE`)
- Deposit requests (go to `pending`, admin must approve)
- Withdrawal requests (funds are held immediately, refunded automatically if
  an admin rejects)
- Internal transfers between Main and Profit wallets (instant, no approval
  needed)
- Investing into a plan (deducts from Main wallet)
- Deposit/investment history pulled from the database
- Referral link + 5% bonus auto-paid to the referrer when their referred
  user's first deposit is approved

**Admin side** (`admin.html` — log in with the admin account, you're
redirected here automatically instead of the regular dashboard):
- Overview stats (total users, total deposited/withdrawn, pending counts)
- User management: edit balances, freeze/unfreeze accounts, set KYC status
- Approve/reject pending deposits and withdrawals
- Investment plan CRUD (create/deactivate plans)
- View all investments across all users
- View referral payout history
- "Run Daily ROI Credit" button — since there's no real cron job in a demo
  environment, this lets you manually trigger one simulated day of profit
  distribution across all active investments, for demoing the profit-credit
  flow live

**Not wired up** (left as static/cosmetic, since they weren't part of the
core transaction flow):
- `settings.html` — profile/KYC upload UI is still just visual
- `walletexchange.html` — the USD→BTC rate converter is illustrative only

## Project structure

```
server.js              Express entry point
db.js                   SQLite schema + seed data (node:sqlite, no native build step)
middleware/auth.js       JWT verification + admin role guard
routes/auth.js           register / login / me
routes/user.js            deposits, withdrawals, transfers, investments, referrals
routes/admin.js            users, transactions, plans, investments, referrals (admin-only)
public/                  frontend (static, served by Express)
public/api.js             shared fetch helper used by every page
public/admin.html         admin panel (new)
```

## Notes

- Built with Node's built-in `node:sqlite` (Node 22.5+) instead of
  `better-sqlite3`, to avoid native compilation issues — same reasoning as
  the Kinbotos backend.
- JWT secret defaults to a placeholder in `middleware/auth.js` — set a real
  `JWT_SECRET` env var (or `.env` file) before deploying anywhere public.
- Deploys the same way as your other single-origin builds: push to a host
  like Railway, set `PORT` if needed, `npm install && npm start`.
