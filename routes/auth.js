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
        phone: u.phone,
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

const STRONG_PASSWORD = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;

// POST /api/auth/register
router.post("/register", (req, res) => {
    const { firstName, lastName, email, phone, password, country, referralCode } = req.body;

    if (!firstName || !lastName || !email || !password) {
        return res.status(400).json({ error: "Missing required fields" });
    }
    if (!STRONG_PASSWORD.test(password)) {
        return res.status(400).json({ error: "Password must be at least 8 characters and include an uppercase letter, a lowercase letter, a number, and a special character" });
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
        `INSERT INTO users (first_name, last_name, email, phone, password_hash, country, referral_code, referred_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(firstName, lastName, email.toLowerCase(), phone || null, passwordHash, country || null, myRefCode, referredBy);

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

// ---------- PASSWORD RECOVERY ----------

async function sendResetEmail(toEmail, code) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
        console.log(`[password-reset] RESEND_API_KEY not set — reset code for ${toEmail}: ${code}`);
        return { simulated: true };
    }

    const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            from: process.env.RESEND_FROM_EMAIL || "SharkTrade Pro <onboarding@resend.dev>",
            to: [toEmail],
            subject: "Your SharkTrade Pro password reset code",
            html: `<p>Your password reset code is:</p><h2 style="letter-spacing:4px;">${code}</h2><p>This code expires in 15 minutes. If you didn't request this, you can ignore this email.</p>`
        })
    });

    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Resend API error: ${errText}`);
    }
    return { simulated: false };
}

// POST /api/auth/forgot-password { email }
router.post("/forgot-password", async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "Email is required" });

    const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email.toLowerCase());

    // Always respond the same way whether or not the account exists, so this endpoint
    // can't be used to check which emails are registered.
    if (!user) {
        return res.json({ message: "If an account exists for that email, a reset code has been sent." });
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit code
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString().slice(0, 19).replace("T", " ");

    db.prepare(
        "INSERT INTO password_resets (user_id, code, expires_at) VALUES (?, ?, ?)"
    ).run(user.id, code, expiresAt);

    try {
        const result = await sendResetEmail(user.email, code);
        res.json({
            message: "If an account exists for that email, a reset code has been sent.",
            // Only included when no real email service is configured, so the demo remains usable end-to-end.
            simulatedCode: result.simulated ? code : undefined
        });
    } catch (err) {
        console.error("Failed to send reset email:", err.message);
        res.status(500).json({ error: "Failed to send reset email. Please try again shortly." });
    }
});

// POST /api/auth/reset-password { email, code, newPassword }
router.post("/reset-password", (req, res) => {
    const { email, code, newPassword } = req.body;
    if (!email || !code || !newPassword) {
        return res.status(400).json({ error: "Email, code, and new password are required" });
    }
    if (!STRONG_PASSWORD.test(newPassword)) {
        return res.status(400).json({ error: "Password must be at least 8 characters and include an uppercase letter, a lowercase letter, a number, and a special character" });
    }

    const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email.toLowerCase());
    if (!user) return res.status(400).json({ error: "Invalid or expired code" });

    const reset = db.prepare(
        "SELECT * FROM password_resets WHERE user_id = ? AND code = ? AND used = 0 ORDER BY created_at DESC LIMIT 1"
    ).get(user.id, code);

    if (!reset) return res.status(400).json({ error: "Invalid or expired code" });
    if (new Date(reset.expires_at + "Z") < new Date()) {
        return res.status(400).json({ error: "This code has expired. Please request a new one." });
    }

    const passwordHash = bcrypt.hashSync(newPassword, 10);
    db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(passwordHash, user.id);
    db.prepare("UPDATE password_resets SET used = 1 WHERE id = ?").run(reset.id);

    res.json({ message: "Password updated. You can now log in with your new password." });
});

module.exports = router;
