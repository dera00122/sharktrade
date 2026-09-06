const express = require("express");
const db = require("../db");

const router = express.Router();

// GET /api/public/testimonials
router.get("/testimonials", (req, res) => {
    const testimonials = db.prepare(
        "SELECT id, name, role_label, quote, avatar_url, rating FROM testimonials WHERE active = 1 ORDER BY sort_order ASC, id ASC"
    ).all();
    res.json({ testimonials });
});

// GET /api/public/backers
router.get("/backers", (req, res) => {
    const backers = db.prepare(
        "SELECT id, name, logo_url FROM backers WHERE active = 1 ORDER BY sort_order ASC, id ASC"
    ).all();
    res.json({ backers });
});

module.exports = router;
