const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const db = require("../db");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

// ---------- AVATAR UPLOAD ----------
const AVATAR_DIR = path.join(__dirname, "..", "public", "uploads", "avatars");
fs.mkdirSync(AVATAR_DIR, { recursive: true });

const avatarStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, AVATAR_DIR),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname) || ".jpg";
        cb(null, `user-${req.user.id}-${Date.now()}${ext}`);
    }
});
const uploadAvatar = multer({
    storage: avatarStorage,
    limits: { fileSize: 3 * 1024 * 1024 }, // 3MB
    fileFilter: (req, file, cb) => {
        const ok = ["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.mimetype);
        cb(ok ? null : new Error("Only image files are allowed"), ok);
    }
});

// POST /api/user/avatar  (multipart/form-data, field name "avatar")
router.post("/avatar", (req, res) => {
    uploadAvatar.single("avatar")(req, res, (err) => {
        if (err) return res.status(400).json({ error: err.message });
        if (!req.file) return res.status(400).json({ error: "No file uploaded" });

        const avatarUrl = `/uploads/avatars/${req.file.filename}`;
        db.prepare("UPDATE users SET avatar_url = ? WHERE id = ?").run(avatarUrl, req.user.id);
        res.json({ message: "Avatar updated", avatarUrl });
    });
});

function getUser(id) {
    return db.prepare("SELECT * FROM users WHERE id = ?").get(id);
}

// ---------- KYC ----------
// POST /api/user/kyc-submit — flips status to pending and notifies admin via the chat inbox
router.post("/kyc-submit", (req, res) => {
    const user = getUser(req.user.id);
    if (!user) return res.status(404).json({ error: "User not found" });

    if (user.kyc_status === "verified") {
        return res.status(400).json({ error: "Your account is already verified" });
    }

    db.prepare("UPDATE users SET kyc_status = 'pending' WHERE id = ?").run(user.id);

    // Drop a system-style message into this user's support chat thread so it shows up
    // as unread in the admin's Support Chat inbox — reusing the existing notification surface.
    db.prepare(
        `INSERT INTO chat_messages (user_id, sender, message, read_by_admin, read_by_user)
         VALUES (?, 'user', ?, 0, 1)`
    ).run(user.id, `📋 KYC verification requested by ${user.first_name} ${user.last_name}. Please review and update their status in Users.`);

    res.json({ message: "KYC request submitted. An admin will review your verification shortly." });
});

// ---------- DASHBOARD SUMMARY ----------
router.get("/summary", (req, res) => {
    const user = getUser(req.user.id);
    const activeInvestments = db.prepare(
        "SELECT COUNT(*) AS c, COALESCE(SUM(amount),0) AS total FROM investments WHERE user_id = ? AND status = 'active'"
    ).get(user.id);
    const pendingDeposits = db.prepare(
        "SELECT COUNT(*) AS c FROM transactions WHERE user_id = ? AND type = 'deposit' AND status = 'pending'"
    ).get(user.id);
    const unreadChat = db.prepare(
        "SELECT COUNT(*) AS c FROM chat_messages WHERE user_id = ? AND sender = 'admin' AND read_by_user = 0"
    ).get(user.id);

    res.json({
        mainBalance: user.main_balance,
        profitBalance: user.profit_balance,
        totalBalance: user.main_balance + user.profit_balance,
        activeInvestmentsCount: activeInvestments.c,
        activeInvestmentsTotal: activeInvestments.total,
        pendingDeposits: pendingDeposits.c,
        kycStatus: user.kyc_status,
        avatarUrl: user.avatar_url || null,
        unreadChatCount: unreadChat.c
    });
});

// ---------- DEPOSITS ----------
// POST /api/user/deposits { method, amount }
router.post("/deposits", (req, res) => {
    const { method, amount } = req.body;
    const amt = parseFloat(amount);
    if (!method || !amt || amt <= 0) {
        return res.status(400).json({ error: "Valid method and amount required" });
    }
    const fee = +(amt * 0.01).toFixed(2);

    const info = db.prepare(
        `INSERT INTO transactions (user_id, type, method, amount, fee, status, note)
         VALUES (?, 'deposit', ?, ?, ?, 'pending', 'Awaiting admin approval')`
    ).run(req.user.id, method, amt, fee);

    res.status(201).json({ message: "Deposit request submitted. Awaiting admin approval.", transactionId: info.lastInsertRowid });
});

// ---------- DEPOSIT PAYMENT METHODS (account details to send funds to) ----------
router.get("/payment-methods", (req, res) => {
    const methods = db.prepare("SELECT id, name, account_details FROM payment_methods WHERE active = 1").all();
    res.json({ methods });
});

// ---------- WITHDRAWALS (Profit Wallet only — investment earnings cash-out) ----------
// POST /api/user/withdrawals { amount, destination }
// Funds are NOT deducted here. They stay in the profit wallet until an admin approves,
// so a pending or rejected request never touches the user's balance.
router.post("/withdrawals", (req, res) => {
    const { amount, destination } = req.body;
    const amt = parseFloat(amount);

    if (!amt || amt <= 0 || !destination) {
        return res.status(400).json({ error: "Valid amount and destination address required" });
    }

    const user = getUser(req.user.id);
    if (amt > user.profit_balance) {
        return res.status(400).json({ error: "Insufficient profit wallet balance" });
    }

    const info = db.prepare(
        `INSERT INTO transactions (user_id, type, method, amount, status, destination, note)
         VALUES (?, 'withdraw', 'Profit Wallet', ?, 'pending', ?, ?)`
    ).run(user.id, amt, destination, "Awaiting admin approval");

    res.status(201).json({ message: "Withdrawal request submitted. Awaiting admin approval — nothing is deducted until then.", transactionId: info.lastInsertRowid });
});

// ---------- PAYOUT / EXTERNAL TRANSFER (Main or Profit wallet -> bank or external wallet) ----------
// POST /api/user/payouts { source: 'main'|'profit', amount, destinationType: 'bank'|'crypto', details: {...} }
// Also admin-approved. Not deducted until approved.
router.post("/payouts", (req, res) => {
    const { source, amount, destinationType, details } = req.body;
    const amt = parseFloat(amount);

    if (!amt || amt <= 0 || !["main", "profit"].includes(source) || !["bank", "crypto"].includes(destinationType) || !details) {
        return res.status(400).json({ error: "Valid source, amount, destination type, and details are required" });
    }

    const user = getUser(req.user.id);
    const available = source === "profit" ? user.profit_balance : user.main_balance;
    if (amt > available) {
        return res.status(400).json({ error: `Insufficient ${source} wallet balance` });
    }

    const destinationPayload = JSON.stringify({ type: destinationType, ...details });

    const info = db.prepare(
        `INSERT INTO transactions (user_id, type, method, amount, status, destination, note)
         VALUES (?, 'payout', ?, ?, 'pending', ?, ?)`
    ).run(user.id, source === "profit" ? "Profit Wallet" : "Main Wallet", amt, destinationPayload, "Awaiting admin approval");

    res.status(201).json({ message: "Transfer request submitted. Awaiting admin approval — nothing is deducted until then.", transactionId: info.lastInsertRowid });
});

// ---------- INTERNAL TRANSFER (profit <-> main, instant, no admin approval needed) ----------
// POST /api/user/transfer { from: 'main'|'profit', to: 'main'|'profit', amount }
router.post("/transfer", (req, res) => {
    const { from, to, amount } = req.body;
    const amt = parseFloat(amount);
    if (!amt || amt <= 0 || from === to || !["main", "profit"].includes(from) || !["main", "profit"].includes(to)) {
        return res.status(400).json({ error: "Invalid transfer parameters" });
    }

    const user = getUser(req.user.id);
    const fromCol = from === "profit" ? "profit_balance" : "main_balance";
    const toCol = to === "profit" ? "profit_balance" : "main_balance";
    const available = from === "profit" ? user.profit_balance : user.main_balance;

    if (amt > available) {
        return res.status(400).json({ error: "Insufficient balance in source wallet" });
    }

    db.prepare(`UPDATE users SET ${fromCol} = ${fromCol} - ? WHERE id = ?`).run(amt, user.id);
    db.prepare(`UPDATE users SET ${toCol} = ${toCol} + ? WHERE id = ?`).run(amt, user.id);

    db.prepare(
        `INSERT INTO transactions (user_id, type, method, amount, status, note)
         VALUES (?, 'transfer', 'Internal', ?, 'completed', ?)`
    ).run(user.id, amt, `${from} -> ${to}`);

    res.json({ message: "Transfer completed" });
});

// GET /api/user/transactions?type=deposit|withdraw|transfer&status=pending|approved|rejected|completed
router.get("/transactions", (req, res) => {
    const { type, status } = req.query;
    let query = "SELECT * FROM transactions WHERE user_id = ?";
    const params = [req.user.id];
    if (type) { query += " AND type = ?"; params.push(type); }
    if (status) { query += " AND status = ?"; params.push(status); }
    query += " ORDER BY created_at DESC";
    const rows = db.prepare(query).all(...params);
    res.json({ transactions: rows });
});

// ---------- INVESTMENT PLANS ----------
router.get("/plans", (req, res) => {
    const plans = db.prepare("SELECT * FROM investment_plans WHERE active = 1").all();
    res.json({ plans });
});

// POST /api/user/invest { planId, amount }
router.post("/invest", (req, res) => {
    const { planId, amount } = req.body;
    const amt = parseFloat(amount);
    const plan = db.prepare("SELECT * FROM investment_plans WHERE id = ? AND active = 1").get(planId);

    if (!plan) return res.status(404).json({ error: "Investment plan not found" });
    if (!amt || amt < plan.min_amount || (plan.max_amount && amt > plan.max_amount)) {
        return res.status(400).json({ error: `Amount must be between ${plan.min_amount} and ${plan.max_amount || "no limit"}` });
    }

    const user = getUser(req.user.id);
    if (amt > user.main_balance) {
        return res.status(400).json({ error: "Insufficient main wallet balance" });
    }

    db.prepare("UPDATE users SET main_balance = main_balance - ? WHERE id = ?").run(amt, user.id);

    const info = db.prepare(
        `INSERT INTO investments (user_id, plan_id, plan_name, amount, daily_roi, status, last_credit_date)
         VALUES (?, ?, ?, ?, ?, 'active', datetime('now'))`
    ).run(user.id, plan.id, plan.name, amt, plan.daily_roi);

    db.prepare(
        `INSERT INTO transactions (user_id, type, method, amount, status, note)
         VALUES (?, 'investment', ?, ?, 'completed', ?)`
    ).run(user.id, plan.name, amt, `Invested into ${plan.name}`);

    res.status(201).json({ message: "Investment created", investmentId: info.lastInsertRowid });
});

// GET /api/user/investments
router.get("/investments", (req, res) => {
    const rows = db.prepare("SELECT * FROM investments WHERE user_id = ? ORDER BY created_at DESC").all(req.user.id);
    res.json({ investments: rows });
});

// ---------- REFERRALS ----------
router.get("/referrals", (req, res) => {
    const user = getUser(req.user.id);
    const referrals = db.prepare(
        `SELECT r.*, u.first_name, u.last_name, u.email
         FROM referrals r JOIN users u ON u.id = r.referred_id
         WHERE r.referrer_id = ? ORDER BY r.created_at DESC`
    ).all(user.id);

    const totalEarned = referrals.reduce((sum, r) => sum + (r.status === "paid" ? r.bonus_amount : 0), 0);

    res.json({
        referralCode: user.referral_code,
        totalEarned,
        totalReferrals: referrals.length,
        referrals
    });
});

// ---------- SUPPORT CHAT (in-house, replaces Tawk.to) ----------
// GET /api/user/chat — full thread for the logged-in user, marks admin replies as read
router.get("/chat", (req, res) => {
    const messages = db.prepare(
        "SELECT * FROM chat_messages WHERE user_id = ? ORDER BY created_at ASC"
    ).all(req.user.id);

    db.prepare("UPDATE chat_messages SET read_by_user = 1 WHERE user_id = ? AND sender = 'admin'").run(req.user.id);

    res.json({ messages });
});

// POST /api/user/chat { message }
router.post("/chat", (req, res) => {
    const { message } = req.body;
    if (!message || !message.trim()) return res.status(400).json({ error: "Message cannot be empty" });

    const info = db.prepare(
        "INSERT INTO chat_messages (user_id, sender, message, read_by_admin, read_by_user) VALUES (?, 'user', ?, 0, 1)"
    ).run(req.user.id, message.trim());

    res.status(201).json({ message: "Sent", messageId: info.lastInsertRowid });
});

module.exports = router;
