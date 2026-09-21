// emailService.js — shared email sending via Resend, used across auth, registration, and
// admin transaction approval. Falls back to logging the content to the console when
// RESEND_API_KEY isn't set, so the app still works fully in a demo environment without one.

async function sendEmail({ to, subject, html }) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
        console.log(`[email] RESEND_API_KEY not set — would have sent "${subject}" to ${to}`);
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
            to: [to],
            subject,
            html
        })
    });

    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Resend API error: ${errText}`);
    }
    return { simulated: false };
}

async function sendPasswordResetEmail(toEmail, code) {
    return sendEmail({
        to: toEmail,
        subject: "Your SharkTrade Pro password reset code",
        html: `<p>Your password reset code is:</p><h2 style="letter-spacing:4px;">${code}</h2><p>This code expires in 15 minutes. If you didn't request this, you can ignore this email.</p>`
    });
}

async function sendWelcomeEmail(user) {
    return sendEmail({
        to: user.email,
        subject: "Welcome to SharkTrade Pro — your account details",
        html: `
            <div style="font-family: sans-serif; max-width: 480px;">
                <h2 style="color:#c8a86a;">Welcome to SharkTrade Pro, ${user.firstName}!</h2>
                <p>Your demo account has been created successfully. Here's a summary of your account:</p>
                <table style="width:100%; border-collapse:collapse; margin:16px 0;">
                    <tr><td style="padding:6px 0; color:#666;">Name</td><td style="padding:6px 0;"><strong>${user.firstName} ${user.lastName}</strong></td></tr>
                    <tr><td style="padding:6px 0; color:#666;">Email</td><td style="padding:6px 0;"><strong>${user.email}</strong></td></tr>
                    <tr><td style="padding:6px 0; color:#666;">Referral Code</td><td style="padding:6px 0;"><strong>${user.referralCode}</strong></td></tr>
                </table>
                <p style="color:#888; font-size:0.85rem;">This is a demo platform — no real funds or payments are processed. Keep this email for your records.</p>
            </div>
        `
    });
}

async function sendWithdrawalApprovedEmail(user, tx) {
    return sendEmail({
        to: user.email,
        subject: "Your withdrawal has been approved",
        html: `
            <div style="font-family: sans-serif; max-width: 480px;">
                <h2 style="color:#00a352;">Withdrawal Approved</h2>
                <p>Hi ${user.firstName}, your withdrawal request has been approved.</p>
                <table style="width:100%; border-collapse:collapse; margin:16px 0;">
                    <tr><td style="padding:6px 0; color:#666;">Amount</td><td style="padding:6px 0;"><strong>$${Number(tx.amount).toFixed(2)}</strong></td></tr>
                    <tr><td style="padding:6px 0; color:#666;">Destination</td><td style="padding:6px 0; word-break:break-all;"><strong>${tx.destination || "—"}</strong></td></tr>
                    <tr><td style="padding:6px 0; color:#666;">Transaction ID</td><td style="padding:6px 0;"><strong>#${tx.id}</strong></td></tr>
                </table>
                <p style="color:#888; font-size:0.85rem;">This is a demo platform — no real funds are transferred.</p>
            </div>
        `
    });
}

module.exports = { sendEmail, sendPasswordResetEmail, sendWelcomeEmail, sendWithdrawalApprovedEmail };
