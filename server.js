const express = require("express");
const cors = require("cors");
const path = require("path");
require("dotenv").config();

require("./db"); // initializes schema + seeds plans/admin on first run
const { runRoiCycle } = require("./services/roiEngine");

const authRoutes = require("./routes/auth");
const userRoutes = require("./routes/user");
const adminRoutes = require("./routes/admin");

const app = express();
const PORT = process.env.PORT || 3000;

// How often profit ticks in automatically (minutes). Each tick credits a
// proportional slice of the daily ROI, so a full day's rate accumulates
// gradually across the day instead of needing a manual admin trigger.
const ROI_INTERVAL_MINUTES = parseInt(process.env.ROI_INTERVAL_MINUTES || "30", 10);

app.use(cors());
app.use(express.json());

// API routes
app.use("/api/auth", authRoutes);
app.use("/api/user", userRoutes);
app.use("/api/admin", adminRoutes);

// Single-origin static frontend (matches the Kinbotos deployment pattern)
app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
    console.log(`SharkTrade Pro demo server running on http://localhost:${PORT}`);
    console.log(`Demo admin login -> admin@sharktrade.demo / Admin@2026`);
    console.log(`Auto profit ticks every ${ROI_INTERVAL_MINUTES} minute(s) for active investments.`);
});

// Automatic profit ticking — simulates passive daily ROI accrual without needing
// the admin to click "Run Daily ROI" manually. Purely a demo convenience; there's
// no real market data behind it.
setInterval(() => {
    try {
        const fraction = ROI_INTERVAL_MINUTES / 1440; // 1440 minutes in a day
        const credited = runRoiCycle(fraction);
        if (credited > 0) {
            console.log(`[auto-roi] Credited profit to ${credited} active investment(s).`);
        }
    } catch (err) {
        console.error("[auto-roi] Failed to run ROI cycle:", err.message);
    }
}, ROI_INTERVAL_MINUTES * 60 * 1000);
