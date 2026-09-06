const db = require("../db");

/**
 * Credits profit to every active investment.
 * @param {number} fractionOfDay - portion of a full day's ROI to credit.
 *   1 = full day's ROI (used by the admin's manual "Run Daily ROI" button).
 *   e.g. 30/1440 = a 30-minute slice (used by the automatic interval), so that
 *   a full day's worth accumulates gradually rather than all at once.
 */
function runRoiCycle(fractionOfDay = 1) {
    const active = db.prepare("SELECT * FROM investments WHERE status = 'active'").all();
    let credited = 0;

    for (const inv of active) {
        const profit = +(inv.amount * (inv.daily_roi / 100) * fractionOfDay).toFixed(2);
        if (profit <= 0) continue;

        db.prepare("UPDATE users SET profit_balance = profit_balance + ? WHERE id = ?").run(profit, inv.user_id);
        db.prepare(
            "UPDATE investments SET total_profit = total_profit + ?, last_credit_date = datetime('now') WHERE id = ?"
        ).run(profit, inv.id);
        db.prepare(
            `INSERT INTO transactions (user_id, type, method, amount, status, note) VALUES (?, 'roi_credit', ?, ?, 'completed', ?)`
        ).run(inv.user_id, inv.plan_name, profit, `Investment profit credit for ${inv.plan_name}`);
        credited++;
    }

    return credited;
}

module.exports = { runRoiCycle };
