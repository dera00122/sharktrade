// db.js — SQLite setup using Node's built-in node:sqlite (Node 22.5+)
// Avoids native compilation issues (e.g. on Windows) that better-sqlite3 can run into.
const { DatabaseSync } = require("node:sqlite");
const path = require("path");
const crypto = require("crypto");

const DB_PATH = path.join(__dirname, "sharktrade.db");
const db = new DatabaseSync(DB_PATH);

db.exec(`
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',       -- 'user' | 'admin'
    country TEXT,
    referral_code TEXT UNIQUE NOT NULL,
    referred_by TEXT,                        -- referral_code of the referrer, nullable
    main_balance REAL NOT NULL DEFAULT 0,
    profit_balance REAL NOT NULL DEFAULT 0,
    kyc_status TEXT NOT NULL DEFAULT 'unverified', -- unverified | pending | verified
    frozen INTEGER NOT NULL DEFAULT 0,        -- 0 = active, 1 = frozen
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS investment_plans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    min_amount REAL NOT NULL,
    max_amount REAL,                          -- null = no cap
    daily_roi REAL NOT NULL,                  -- percent, e.g. 1.5
    withdrawal_type TEXT NOT NULL DEFAULT 'daily', -- 'daily' | '48hr'
    active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS investments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    plan_id INTEGER NOT NULL,
    plan_name TEXT NOT NULL,
    amount REAL NOT NULL,
    daily_roi REAL NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',    -- active | completed
    total_profit REAL NOT NULL DEFAULT 0,
    last_credit_date TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (plan_id) REFERENCES investment_plans(id)
);

CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    type TEXT NOT NULL,                       -- deposit | withdraw | transfer | investment | roi_credit | referral_bonus
    method TEXT,                              -- USDT (TRC20) | Bitcoin | Ethereum | Bank | Internal
    amount REAL NOT NULL,
    fee REAL NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending',   -- pending | approved | rejected | completed
    destination TEXT,                         -- wallet address / bank details for withdrawals
    note TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS referrals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    referrer_id INTEGER NOT NULL,
    referred_id INTEGER NOT NULL,
    bonus_amount REAL NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending',   -- pending | paid
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (referrer_id) REFERENCES users(id),
    FOREIGN KEY (referred_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS payment_methods (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,                       -- e.g. "USDT (TRC20)", "Bank Transfer (NGN)"
    account_details TEXT NOT NULL,            -- wallet address, or bank name/acct number/acct name
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS chat_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,                 -- which user's conversation this belongs to
    sender TEXT NOT NULL,                     -- 'user' | 'admin'
    message TEXT NOT NULL,
    read_by_admin INTEGER NOT NULL DEFAULT 0, -- unread badge for admin's conversation list
    read_by_user INTEGER NOT NULL DEFAULT 0,  -- unread badge for the user's chat bubble
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
);
`);

// ---- Lightweight migrations for columns added after initial release ----
// Safe to run every startup: only ALTERs if the column is missing, so an
// existing sharktrade.db from an earlier version of this project upgrades
// cleanly without needing to be deleted.
function ensureColumn(table, column, definition) {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all();
    const exists = cols.some((c) => c.name === column);
    if (!exists) {
        db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
        console.log(`Migrated: added ${table}.${column}`);
    }
}
ensureColumn("users", "avatar_url", "TEXT");
ensureColumn("investment_plans", "fee_percent", "REAL DEFAULT 0");
ensureColumn("investment_plans", "lock_days", "INTEGER DEFAULT 0");


// Seed default investment plans if empty
const planCount = db.prepare("SELECT COUNT(*) AS c FROM investment_plans").get().c;
if (planCount === 0) {
    const insertPlan = db.prepare(
        "INSERT INTO investment_plans (name, min_amount, max_amount, daily_roi, withdrawal_type, fee_percent, lock_days, active) VALUES (?, ?, ?, ?, ?, ?, ?, 1)"
    );
    insertPlan.run("Minimum Tier", 1000, 40000, 1.5, "48hr", 1.0, 7);
    insertPlan.run("Maximum Tier", 40000, 80000, 2.5, "daily", 1.0, 14);
    insertPlan.run("Premium Tier", 100000, null, 4.0, "daily", 0.5, 30);
}

// Seed default payment methods (deposit destination details shown to users) if empty
const methodCount = db.prepare("SELECT COUNT(*) AS c FROM payment_methods").get().c;
if (methodCount === 0) {
    const insertMethod = db.prepare(
        "INSERT INTO payment_methods (name, account_details, active) VALUES (?, ?, 1)"
    );
    insertMethod.run("USDT (TRC20)", "TXn9k2FZmvQ8pR3sYc7bL1dWjHq5NxAeUz — send USDT only via the Tron (TRC20) network.");
    insertMethod.run("Bitcoin (BTC)", "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh — BTC network only, allow 1-3 confirmations.");
    insertMethod.run("Bank Transfer (NGN)", "Zenith Bank · SharkTrade Pro Demo Ltd · Acct No: 1234567890 · Use your registered email as narration.");
}

// Seed a demo admin account if no admin exists yet
const adminCount = db.prepare("SELECT COUNT(*) AS c FROM users WHERE role = 'admin'").get().c;
if (adminCount === 0) {
    const bcrypt = require("bcryptjs");
    const passwordHash = bcrypt.hashSync("Admin@2026", 10);
    const refCode = crypto.randomBytes(5).toString("hex").toUpperCase();
    db.prepare(
        `INSERT INTO users (first_name, last_name, email, password_hash, role, country, referral_code, main_balance, profit_balance, kyc_status)
         VALUES (?, ?, ?, ?, 'admin', ?, ?, 0, 0, 'verified')`
    ).run("Demo", "Admin", "admin@sharktrade.demo", passwordHash, "Nigeria", refCode);
    console.log("Seeded demo admin -> email: admin@sharktrade.demo | password: Admin@2026");
}

module.exports = db;
