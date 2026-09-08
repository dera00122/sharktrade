const express = require("express");
const bcrypt = require("bcryptjs");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const db = require("../db");
const { requireAuth, requireAdmin } = require("../middleware/auth");
const { runRoiCycle } = require("../services/roiEngine");

const router = express.Router();
router.use(requireAuth, requireAdmin);

// Storage for testimonial avatars / backer logos uploaded from the admin panel
const CONTENT_DIR = path.join(__dirname, "..", "public", "uploads", "content");
fs.mkdirSync(CONTENT_DIR, { recursive: true });

const contentStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, CONTENT_DIR),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname) || ".jpg";
        cb(null, `content-${Date.now()}${ext}`);
    }
});
const uploadContentImage = multer({
    storage: contentStorage,
    limits: { fileSize: 3 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const ok = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/svg+xml"].includes(file.mimetype);
        cb(ok ? null : new Error("Only image files are allowed"), ok);
    }
});

function publicUser(u) {
    return {
        id: u.id,
        firstName: u.first_name,
        lastName: u.last_name,
        email: u.email,
        role: u.role,
        country: u.country,
        referralCode: u.referral_code,
        referredBy: u.referred_by,
        mainBalance: u.main_balance,
        profitBalance: u.profit_balance,
        kycStatus: u.kyc_status,
        frozen: !!u.frozen,
        avatarUrl: u.avatar_url || null,
        createdAt: u.created_at
    };
}

// ---------- DASHBOARD OVERVIEW ----------
router.get("/overview", (req, res) => {
    const totalUsers = db.prepare("SELECT COUNT(*) AS c FROM users WHERE role = 'user'").get().c;
    const totalDeposited = db.prepare("SELECT COALESCE(SUM(amount),0) AS t FROM transactions WHERE type='deposit' AND status='approved'").get().t;
    const totalWithdrawn = db.prepare("SELECT COALESCE(SUM(amount),0) AS t FROM transactions WHERE type='withdraw' AND status='approved'").get().t;
    const pendingDeposits = db.prepare("SELECT COUNT(*) AS c FROM transactions WHERE type='deposit' AND status='pending'").get().c;
    const pendingWithdrawals = db.prepare("SELECT COUNT(*) AS c FROM transactions WHERE type='withdraw' AND status='pending'").get().c;
    const pendingKyc = db.prepare("SELECT COUNT(*) AS c FROM users WHERE role='user' AND kyc_status='pending'").get().c;
    const activeInvestments = db.prepare("SELECT COUNT(*) AS c, COALESCE(SUM(amount),0) AS t FROM investments WHERE status='active'").get();

    res.json({
        totalUsers,
        totalDeposited,
        totalWithdrawn,
        pendingDeposits,
        pendingWithdrawals,
        pendingKyc,
        activeInvestmentsCount: activeInvestments.c,
        activeInvestmentsTotal: activeInvestments.t
    });
});

// ---------- USERS ----------
router.get("/users", (req, res) => {
    const { search } = req.query;
    let query = "SELECT * FROM users WHERE role = 'user'";
    const params = [];
    if (search) {
        query += " AND (email LIKE ? OR first_name LIKE ? OR last_name LIKE ?)";
        const term = `%${search}%`;
        params.push(term, term, term);
    }
    query += " ORDER BY created_at DESC";
    const users = db.prepare(query).all(...params);
    res.json({ users: users.map(publicUser) });
});

router.get("/users/:id", (req, res) => {
    const user = db.prepare("SELECT * FROM users WHERE id = ?").get(req.params.id);
    if (!user) return res.status(404).json({ error: "User not found" });
    const transactions = db.prepare("SELECT * FROM transactions WHERE user_id = ? ORDER BY created_at DESC").all(user.id);
    const investments = db.prepare("SELECT * FROM investments WHERE user_id = ? ORDER BY created_at DESC").all(user.id);
    res.json({ user: publicUser(user), transactions, investments });
});

// Adjust a user's balance manually (demo control panel — labeled clearly)
router.patch("/users/:id/balance", (req, res) => {
    const { mainBalance, profitBalance } = req.body;
    const user = db.prepare("SELECT * FROM users WHERE id = ?").get(req.params.id);
    if (!user) return res.status(404).json({ error: "User not found" });

    const newMain = mainBalance !== undefined ? parseFloat(mainBalance) : user.main_balance;
    const newProfit = profitBalance !== undefined ? parseFloat(profitBalance) : user.profit_balance;

    db.prepare("UPDATE users SET main_balance = ?, profit_balance = ? WHERE id = ?").run(newMain, newProfit, user.id);
    res.json({ message: "Balance updated" });
});

router.patch("/users/:id/freeze", (req, res) => {
    const { frozen } = req.body;
    const user = db.prepare("SELECT * FROM users WHERE id = ?").get(req.params.id);
    if (!user) return res.status(404).json({ error: "User not found" });
    db.prepare("UPDATE users SET frozen = ? WHERE id = ?").run(frozen ? 1 : 0, user.id);
    res.json({ message: frozen ? "User frozen" : "User unfrozen" });
});

router.patch("/users/:id/kyc", (req, res) => {
    const { status } = req.body; // unverified | pending | verified
    if (!["unverified", "pending", "verified"].includes(status)) {
        return res.status(400).json({ error: "Invalid KYC status" });
    }
    const user = db.prepare("SELECT * FROM users WHERE id = ?").get(req.params.id);
    if (!user) return res.status(404).json({ error: "User not found" });
    db.prepare("UPDATE users SET kyc_status = ? WHERE id = ?").run(status, user.id);
    res.json({ message: "KYC status updated" });
});

// ---------- TRANSACTIONS ----------
router.get("/transactions", (req, res) => {
    const { type, status } = req.query;
    let query = `SELECT t.*, u.first_name, u.last_name, u.email
                 FROM transactions t JOIN users u ON u.id = t.user_id WHERE 1=1`;
    const params = [];
    if (type) { query += " AND t.type = ?"; params.push(type); }
    if (status) { query += " AND t.status = ?"; params.push(status); }
    query += " ORDER BY t.created_at DESC";
    const rows = db.prepare(query).all(...params);
    res.json({ transactions: rows });
});

// Approve/reject a deposit, withdrawal, or external payout
router.patch("/transactions/:id", (req, res) => {
    const { action } = req.body; // 'approve' | 'reject'
    const tx = db.prepare("SELECT * FROM transactions WHERE id = ?").get(req.params.id);
    if (!tx) return res.status(404).json({ error: "Transaction not found" });
    if (tx.status !== "pending") return res.status(400).json({ error: "Transaction already processed" });
    if (!["approve", "reject"].includes(action)) return res.status(400).json({ error: "Invalid action" });

    const newStatus = action === "approve" ? "approved" : "rejected";

    if (tx.type === "deposit") {
        if (action === "approve") {
            db.prepare("UPDATE users SET main_balance = main_balance + ? WHERE id = ?").run(tx.amount, tx.user_id);

            // If this user was referred, pay the referrer their 5% bonus on first approved deposit
            const referral = db.prepare("SELECT * FROM referrals WHERE referred_id = ? AND status = 'pending'").get(tx.user_id);
            if (referral) {
                const bonus = +(tx.amount * 0.05).toFixed(2);
                db.prepare("UPDATE referrals SET bonus_amount = ?, status = 'paid' WHERE id = ?").run(bonus, referral.id);
                db.prepare("UPDATE users SET profit_balance = profit_balance + ? WHERE id = ?").run(bonus, referral.referrer_id);
                db.prepare(
                    `INSERT INTO transactions (user_id, type, method, amount, status, note) VALUES (?, 'referral_bonus', 'Internal', ?, 'completed', ?)`
                ).run(referral.referrer_id, bonus, `Referral bonus for referred user #${tx.user_id}`);
            }
        }
    } else if (tx.type === "withdraw" || tx.type === "payout") {
        // Withdraw = profit-only cash out. Payout = external transfer from main or profit wallet.
        // Neither deducts funds at request time — only once the admin approves, so a rejected
        // request never has to be "refunded" and the user's balance is untouched until confirmed.
        if (action === "approve") {
            const wallet = tx.method === "Main Wallet" ? "main_balance" : "profit_balance";
            const user = db.prepare("SELECT * FROM users WHERE id = ?").get(tx.user_id);
            const available = wallet === "main_balance" ? user.main_balance : user.profit_balance;

            if (tx.amount > available) {
                return res.status(400).json({
                    error: `Cannot approve — user's ${wallet === "main_balance" ? "main" : "profit"} wallet balance ($${available.toFixed(2)}) is now lower than the requested amount ($${tx.amount.toFixed(2)}). Reject instead, or adjust their balance first.`
                });
            }

            db.prepare(`UPDATE users SET ${wallet} = ${wallet} - ? WHERE id = ?`).run(tx.amount, tx.user_id);
        }
        // On reject: nothing to undo, since funds were never deducted.
    }

    db.prepare("UPDATE transactions SET status = ?, updated_at = datetime('now') WHERE id = ?").run(newStatus, tx.id);
    res.json({ message: `Transaction ${newStatus}` });
});

// ---------- INVESTMENT PLANS (CRUD) ----------
router.get("/plans", (req, res) => {
    const plans = db.prepare("SELECT * FROM investment_plans ORDER BY min_amount ASC").all();
    res.json({ plans });
});

router.post("/plans", (req, res) => {
    const { name, minAmount, maxAmount, dailyRoi, withdrawalType, feePercent, lockDays } = req.body;
    if (!name || !minAmount || !dailyRoi) {
        return res.status(400).json({ error: "name, minAmount, and dailyRoi are required" });
    }
    const info = db.prepare(
        `INSERT INTO investment_plans (name, min_amount, max_amount, daily_roi, withdrawal_type, fee_percent, lock_days, active)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1)`
    ).run(name, minAmount, maxAmount || null, dailyRoi, withdrawalType || "daily", feePercent || 0, lockDays || 0);
    res.status(201).json({ message: "Plan created", planId: info.lastInsertRowid });
});

router.patch("/plans/:id", (req, res) => {
    const plan = db.prepare("SELECT * FROM investment_plans WHERE id = ?").get(req.params.id);
    if (!plan) return res.status(404).json({ error: "Plan not found" });
    const { name, minAmount, maxAmount, dailyRoi, withdrawalType, feePercent, lockDays, active } = req.body;

    db.prepare(
        `UPDATE investment_plans SET name=?, min_amount=?, max_amount=?, daily_roi=?, withdrawal_type=?, fee_percent=?, lock_days=?, active=? WHERE id=?`
    ).run(
        name ?? plan.name,
        minAmount ?? plan.min_amount,
        maxAmount !== undefined ? maxAmount : plan.max_amount,
        dailyRoi ?? plan.daily_roi,
        withdrawalType ?? plan.withdrawal_type,
        feePercent !== undefined ? feePercent : plan.fee_percent,
        lockDays !== undefined ? lockDays : plan.lock_days,
        active !== undefined ? (active ? 1 : 0) : plan.active,
        plan.id
    );
    res.json({ message: "Plan updated" });
});

router.delete("/plans/:id", (req, res) => {
    db.prepare("UPDATE investment_plans SET active = 0 WHERE id = ?").run(req.params.id);
    res.json({ message: "Plan deactivated" });
});

// ---------- INVESTMENTS ----------
router.get("/investments", (req, res) => {
    const rows = db.prepare(
        `SELECT i.*, u.first_name, u.last_name, u.email
         FROM investments i JOIN users u ON u.id = i.user_id ORDER BY i.created_at DESC`
    ).all();
    res.json({ investments: rows });
});

// PATCH /api/admin/investments/:id/profit { totalProfit }
// Manually sets an investment's total profit. The difference from the old value is applied
// to the user's Profit Wallet too, so the dashboard, withdrawals, etc. all stay consistent.
router.patch("/investments/:id/profit", (req, res) => {
    const investment = db.prepare("SELECT * FROM investments WHERE id = ?").get(req.params.id);
    if (!investment) return res.status(404).json({ error: "Investment not found" });

    const newTotalProfit = parseFloat(req.body.totalProfit);
    if (isNaN(newTotalProfit) || newTotalProfit < 0) {
        return res.status(400).json({ error: "totalProfit must be a valid non-negative number" });
    }

    const delta = +(newTotalProfit - investment.total_profit).toFixed(2);

    db.prepare("UPDATE investments SET total_profit = ? WHERE id = ?").run(newTotalProfit, investment.id);
    db.prepare("UPDATE users SET profit_balance = profit_balance + ? WHERE id = ?").run(delta, investment.user_id);

    if (delta !== 0) {
        db.prepare(
            `INSERT INTO transactions (user_id, type, method, amount, status, note) VALUES (?, 'roi_credit', ?, ?, 'completed', ?)`
        ).run(investment.user_id, investment.plan_name, Math.abs(delta), `Manual profit adjustment for ${investment.plan_name} (admin edit)`);
    }

    res.json({ message: "Investment profit updated", newTotalProfit, delta });
});

// Simulate a daily ROI credit run across all active investments (manual full-day trigger).
// Automatic partial credits also run every 30 minutes via the interval in server.js.
router.post("/investments/run-daily-roi", (req, res) => {
    const credited = runRoiCycle(1);
    res.json({ message: `Daily ROI simulated for ${credited} active investment(s)` });
});

// ---------- REFERRALS ----------
router.get("/referrals", (req, res) => {
    const rows = db.prepare(
        `SELECT r.*, ru.first_name AS referrer_first, ru.last_name AS referrer_last, ru.email AS referrer_email,
                du.first_name AS referred_first, du.last_name AS referred_last, du.email AS referred_email
         FROM referrals r
         JOIN users ru ON ru.id = r.referrer_id
         JOIN users du ON du.id = r.referred_id
         ORDER BY r.created_at DESC`
    ).all();
    res.json({ referrals: rows });
});

// ---------- PAYMENT METHODS (deposit account details shown to users) ----------
router.get("/payment-methods", (req, res) => {
    const methods = db.prepare("SELECT * FROM payment_methods ORDER BY id ASC").all();
    res.json({ methods });
});

router.post("/payment-methods", (req, res) => {
    const { name, accountDetails } = req.body;
    if (!name || !accountDetails) return res.status(400).json({ error: "name and accountDetails are required" });
    const info = db.prepare(
        "INSERT INTO payment_methods (name, account_details, active) VALUES (?, ?, 1)"
    ).run(name, accountDetails);
    res.status(201).json({ message: "Payment method added", methodId: info.lastInsertRowid });
});

router.patch("/payment-methods/:id", (req, res) => {
    const method = db.prepare("SELECT * FROM payment_methods WHERE id = ?").get(req.params.id);
    if (!method) return res.status(404).json({ error: "Payment method not found" });
    const { name, accountDetails, active } = req.body;
    db.prepare("UPDATE payment_methods SET name=?, account_details=?, active=? WHERE id=?").run(
        name ?? method.name,
        accountDetails ?? method.account_details,
        active !== undefined ? (active ? 1 : 0) : method.active,
        method.id
    );
    res.json({ message: "Payment method updated" });
});

router.delete("/payment-methods/:id", (req, res) => {
    db.prepare("UPDATE payment_methods SET active = 0 WHERE id = ?").run(req.params.id);
    res.json({ message: "Payment method deactivated" });
});

// ---------- SUPPORT CHAT ----------
// GET /api/admin/chat/conversations — one row per user who has messaged, with unread count
router.get("/chat/conversations", (req, res) => {
    const rows = db.prepare(`
        SELECT
            u.id AS user_id, u.first_name, u.last_name, u.email,
            (SELECT message FROM chat_messages WHERE user_id = u.id ORDER BY created_at DESC LIMIT 1) AS last_message,
            (SELECT created_at FROM chat_messages WHERE user_id = u.id ORDER BY created_at DESC LIMIT 1) AS last_message_at,
            (SELECT COUNT(*) FROM chat_messages WHERE user_id = u.id AND sender = 'user' AND read_by_admin = 0) AS unread_count
        FROM users u
        WHERE u.id IN (SELECT DISTINCT user_id FROM chat_messages)
        ORDER BY last_message_at DESC
    `).all();
    res.json({ conversations: rows });
});

// GET /api/admin/chat/:userId — full thread with a user, marks their messages as read
router.get("/chat/:userId", (req, res) => {
    const messages = db.prepare(
        "SELECT * FROM chat_messages WHERE user_id = ? ORDER BY created_at ASC"
    ).all(req.params.userId);

    db.prepare("UPDATE chat_messages SET read_by_admin = 1 WHERE user_id = ? AND sender = 'user'").run(req.params.userId);

    res.json({ messages });
});

// POST /api/admin/chat/:userId { message }
router.post("/chat/:userId", (req, res) => {
    const { message } = req.body;
    if (!message || !message.trim()) return res.status(400).json({ error: "Message cannot be empty" });

    const user = db.prepare("SELECT id FROM users WHERE id = ?").get(req.params.userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    const info = db.prepare(
        "INSERT INTO chat_messages (user_id, sender, message, read_by_admin, read_by_user) VALUES (?, 'admin', ?, 1, 0)"
    ).run(user.id, message.trim());

    res.status(201).json({ message: "Sent", messageId: info.lastInsertRowid });
});

// ---------- TESTIMONIALS ----------
router.get("/testimonials", (req, res) => {
    const testimonials = db.prepare("SELECT * FROM testimonials ORDER BY sort_order ASC, id ASC").all();
    res.json({ testimonials });
});

router.post("/testimonials", (req, res) => {
    const { name, roleLabel, quote, rating, avatarUrl } = req.body;
    if (!name || !quote) return res.status(400).json({ error: "name and quote are required" });
    const maxOrder = db.prepare("SELECT COALESCE(MAX(sort_order), 0) AS m FROM testimonials").get().m;
    const info = db.prepare(
        "INSERT INTO testimonials (name, role_label, quote, rating, avatar_url, active, sort_order) VALUES (?, ?, ?, ?, ?, 1, ?)"
    ).run(name, roleLabel || null, quote, rating || 5, avatarUrl || null, maxOrder + 1);
    res.status(201).json({ message: "Testimonial added", testimonialId: info.lastInsertRowid });
});

router.patch("/testimonials/:id", (req, res) => {
    const t = db.prepare("SELECT * FROM testimonials WHERE id = ?").get(req.params.id);
    if (!t) return res.status(404).json({ error: "Testimonial not found" });
    const { name, roleLabel, quote, rating, avatarUrl, active } = req.body;
    db.prepare(
        "UPDATE testimonials SET name=?, role_label=?, quote=?, rating=?, avatar_url=?, active=? WHERE id=?"
    ).run(
        name ?? t.name,
        roleLabel !== undefined ? roleLabel : t.role_label,
        quote ?? t.quote,
        rating ?? t.rating,
        avatarUrl !== undefined ? avatarUrl : t.avatar_url,
        active !== undefined ? (active ? 1 : 0) : t.active,
        t.id
    );
    res.json({ message: "Testimonial updated" });
});

router.delete("/testimonials/:id", (req, res) => {
    db.prepare("DELETE FROM testimonials WHERE id = ?").run(req.params.id);
    res.json({ message: "Testimonial deleted" });
});

// ---------- BACKERS ----------
router.get("/backers", (req, res) => {
    const backers = db.prepare("SELECT * FROM backers ORDER BY sort_order ASC, id ASC").all();
    res.json({ backers });
});

router.post("/backers", (req, res) => {
    const { name, logoUrl } = req.body;
    if (!name) return res.status(400).json({ error: "name is required" });
    const maxOrder = db.prepare("SELECT COALESCE(MAX(sort_order), 0) AS m FROM backers").get().m;
    const info = db.prepare(
        "INSERT INTO backers (name, logo_url, active, sort_order) VALUES (?, ?, 1, ?)"
    ).run(name, logoUrl || null, maxOrder + 1);
    res.status(201).json({ message: "Backer added", backerId: info.lastInsertRowid });
});

router.patch("/backers/:id", (req, res) => {
    const b = db.prepare("SELECT * FROM backers WHERE id = ?").get(req.params.id);
    if (!b) return res.status(404).json({ error: "Backer not found" });
    const { name, logoUrl, active } = req.body;
    db.prepare("UPDATE backers SET name=?, logo_url=?, active=? WHERE id=?").run(
        name ?? b.name,
        logoUrl !== undefined ? logoUrl : b.logo_url,
        active !== undefined ? (active ? 1 : 0) : b.active,
        b.id
    );
    res.json({ message: "Backer updated" });
});

router.delete("/backers/:id", (req, res) => {
    db.prepare("DELETE FROM backers WHERE id = ?").run(req.params.id);
    res.json({ message: "Backer deleted" });
});

// ---------- IMAGE UPLOADS (testimonial avatars, backer logos) ----------
router.post("/upload-image", (req, res) => {
    uploadContentImage.single("image")(req, res, (err) => {
        if (err) return res.status(400).json({ error: err.message });
        if (!req.file) return res.status(400).json({ error: "No file uploaded" });
        res.json({ url: `/uploads/content/${req.file.filename}` });
    });
});

// ---------- ADMIN ACCOUNT MANAGEMENT ----------
router.post("/create-admin", (req, res) => {
    const { firstName, lastName, email, password } = req.body;
    if (!firstName || !lastName || !email || !password) {
        return res.status(400).json({ error: "Missing required fields" });
    }
    const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email.toLowerCase());
    if (existing) return res.status(409).json({ error: "Email already in use" });

    const crypto = require("crypto");
    const passwordHash = bcrypt.hashSync(password, 10);
    const refCode = crypto.randomBytes(5).toString("hex").toUpperCase();

    db.prepare(
        `INSERT INTO users (first_name, last_name, email, password_hash, role, referral_code, kyc_status)
         VALUES (?, ?, ?, ?, 'admin', ?, 'verified')`
    ).run(firstName, lastName, email.toLowerCase(), passwordHash, refCode);

    res.status(201).json({ message: "Admin account created" });
});

module.exports = router;
