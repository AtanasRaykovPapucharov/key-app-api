/**
 * Email delivery through SMTP (any provider: Gmail app password, Brevo,
 * Mailgun, SendGrid, Amazon SES, Resend…).
 *
 * Email is ENABLED only when SMTP_HOST is set (and MAIL_ENABLED isn't "false").
 * While disabled, nothing is sent or printed: registration and login work
 * without email, and the client hides verification / password-reset features
 * (it reads GET /api/config).
 *
 * Sending never throws into request handlers — failures are logged and
 * reported, so a mail outage can't break registration or login.
 */
const nodemailer = require("nodemailer");

const FROM = process.env.MAIL_FROM || "Key App <no-reply@keyapp.local>";
const CAPTURE = process.env.MAIL_CAPTURE === "true"; // tests only

let transport = null;
if (process.env.SMTP_HOST && process.env.MAIL_ENABLED !== "false") {
    const port = Number(process.env.SMTP_PORT) || 587;
    transport = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port,
        secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === "true" : port === 465,
        auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    });
}

const isMailEnabled = () => CAPTURE || Boolean(transport);

console.log(
    isMailEnabled()
        ? "[mail] email enabled"
        : "[mail] email disabled (no SMTP_HOST) — accounts work without email; verification and password reset are off",
);

/** Messages captured in tests (MAIL_CAPTURE=true). */
const outbox = [];

async function sendMail({ to, subject, text, html }) {
    if (CAPTURE) {
        outbox.push({ to, subject, text, html });
        return { sent: true, captured: true };
    }
    if (!transport) return { sent: false, reason: "disabled" };
    try {
        await transport.sendMail({ from: FROM, to, subject, text, html });
        return { sent: true };
    } catch (err) {
        console.error("[mail] send failed:", err.message);
        return { sent: false, reason: "send_failed" };
    }
}

module.exports = { sendMail, isMailEnabled, isMailConfigured: isMailEnabled, outbox };
