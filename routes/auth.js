const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const db = require("../db");
const { requireAuth, JWT_SECRET } = require("../middleware/auth");

const router = express.Router();

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

// POST /api/auth/register
router.post("/register", (req, res) => {
    const { firstName, lastName, email, password, country, referralCode } = req.body;

    if (!firstName || !lastName || !email || !password) {
        return res.status(400).json({ error: "Missing required fields" });
    }
    if (password.length < 8) {
        return res.status(400).json({ error: "Password must be at least 8 characters" });
    }

    const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email.toLowerCase());
    if (existing) {
        return res.status(409).json({ error: "An account with this email already exists" });
    }

    // Validate referral code if provided
    let referredBy = null;
    if (referralCode && referralCode.trim()) {
        const referrer = db.prepare("SELECT id, referral_code FROM users WHERE referral_code = ?").get(referralCode.trim());
        if (referrer) referredBy = referrer.referral_code;
    }

    const passwordHash = bcrypt.hashSync(password, 10);
    const myRefCode = crypto.randomBytes(5).toString("hex").toUpperCase();

    const info = db.prepare(
        `INSERT INTO users (first_name, last_name, email, password_hash, country, referral_code, referred_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(firstName, lastName, email.toLowerCase(), passwordHash, country || null, myRefCode, referredBy);

    // Log a pending referral record (bonus paid out by admin once the referred user makes their first deposit)
    if (referredBy) {
        const referrer = db.prepare("SELECT id FROM users WHERE referral_code = ?").get(referredBy);
        if (referrer) {
            db.prepare(
                `INSERT INTO referrals (referrer_id, referred_id, bonus_amount, status) VALUES (?, ?, 0, 'pending')`
            ).run(referrer.id, info.lastInsertRowid);
        }
    }

    const user = db.prepare("SELECT * FROM users WHERE id = ?").get(info.lastInsertRowid);
    const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: "7d" });

    res.status(201).json({ token, user: publicUser(user) });
});

// POST /api/auth/login
router.post("/login", (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ error: "Email and password required" });
    }

    const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email.toLowerCase());
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
        return res.status(401).json({ error: "Invalid email or password" });
    }
    if (user.frozen) {
        return res.status(403).json({ error: "This account has been frozen. Contact support." });
    }

    const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: "7d" });
    res.json({ token, user: publicUser(user) });
});

// GET /api/auth/me
router.get("/me", requireAuth, (req, res) => {
    const user = db.prepare("SELECT * FROM users WHERE id = ?").get(req.user.id);
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json({ user: publicUser(user) });
});

module.exports = router;
