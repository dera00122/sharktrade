const db = require("../db");

/**
 * Credits profit to every active investment.
 *
 * Default (automatic interval): credits each investment based on its own real elapsed time
 * since its last credit — accurate regardless of how often this runs.
 *
 * Manual mode ({ forceHours }): credits exactly that many hours' worth right now, ignoring
 * real elapsed time — used by the admin's "Simulate Hours" button so a demo doesn't have to
 * wait in real time to show growth. last_credit_date still advances, so it doesn't
 * double-credit on the next automatic tick.
 *
 * Either way, when an investment reaches its lock period (completes_at), it's credited one
 * final time for any remaining hours, flipped to 'completed', and its principal is returned
 * to the user's Main Wallet.
 */
function runRoiCycle({ forceHours } = {}) {
    const active = db.prepare("SELECT * FROM investments WHERE status = 'active'").all();
    let credited = 0;
    const now = new Date();

    for (const inv of active) {
        const lastCredit = inv.last_credit_date
            ? new Date(inv.last_credit_date.replace(" ", "T") + "Z")
            : new Date(inv.created_at.replace(" ", "T") + "Z");
        const hourlyRate = inv.hourly_roi || (inv.daily_roi / 24); // fallback for older investments predating hourly_roi
        const completesAt = inv.completes_at ? new Date(inv.completes_at.replace(" ", "T") + "Z") : null;

        let elapsedHours;
        if (forceHours) {
            elapsedHours = forceHours;
        } else {
            elapsedHours = (now - lastCredit) / (1000 * 60 * 60);
        }

        // If crediting this many hours would run past the lock period, cap it there and
        // mark the investment for completion instead.
        let isCompleting = false;
        if (completesAt) {
            const hoursUntilComplete = (completesAt - lastCredit) / (1000 * 60 * 60);
            if (elapsedHours >= hoursUntilComplete) {
                elapsedHours = Math.max(hoursUntilComplete, 0);
                isCompleting = true;
            }
        }

        if (elapsedHours > 0) {
            const profit = +(inv.amount * (hourlyRate / 100) * elapsedHours).toFixed(2);
            if (profit > 0) {
                db.prepare("UPDATE users SET profit_balance = profit_balance + ? WHERE id = ?").run(profit, inv.user_id);
                db.prepare(
                    "UPDATE investments SET total_profit = total_profit + ?, last_credit_date = datetime('now') WHERE id = ?"
                ).run(profit, inv.id);
                db.prepare(
                    `INSERT INTO transactions (user_id, type, method, amount, status, note) VALUES (?, 'roi_credit', ?, ?, 'completed', ?)`
                ).run(inv.user_id, inv.plan_name, profit, `Investment profit credit for ${inv.plan_name}`);
                credited++;
            }
        }

        if (isCompleting) completeInvestment(inv);
    }

    return credited;
}

// Marks an investment completed and returns its principal to the user's Main Wallet —
// the lock-in period is over, so the money (plus everything it earned) is available again.
function completeInvestment(inv) {
    db.prepare("UPDATE investments SET status = 'completed' WHERE id = ?").run(inv.id);
    db.prepare("UPDATE users SET main_balance = main_balance + ? WHERE id = ?").run(inv.amount, inv.user_id);
    db.prepare(
        `INSERT INTO transactions (user_id, type, method, amount, status, note) VALUES (?, 'investment', ?, ?, 'completed', ?)`
    ).run(inv.user_id, inv.plan_name, inv.amount, `Lock-in period complete — principal returned for ${inv.plan_name}`);
}

module.exports = { runRoiCycle };
