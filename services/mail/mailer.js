/**
 * Sends email through SMTP (any provider: Gmail app password, Brevo,
 * Mailgun, SendGrid SMTP, Amazon SES, Resend SMTP…).
 *
 * Without SMTP_HOST:
 *   - development: the message (with its link) is printed to the console
 *   - production:  a warning at startup; sending reports { sent: false }
 *
 * Sending never throws into request handlers — failures are logged and
 * reported, so a mail outage can't break registration or login.
 */
const nodemailer = require("nodemailer");

const isProd = process.env.NODE_ENV === "production";
const FROM = process.env.MAIL_FROM || "Key App <no-reply@keyapp.local>";

let transport = null;
if (process.env.SMTP_HOST) {
    const port = Number(process.env.SMTP_PORT) || 587;
    transport = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port,
        secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === "true" : port === 465,
        auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    });
} else if (isProd) {
    console.warn("[mail] SMTP_HOST is not set — verification and password-reset emails will NOT be sent.");
}

/** Messages captured in tests (MAIL_CAPTURE=true). */
const outbox = [];

async function sendMail({ to, subject, text, html }) {
    if (process.env.MAIL_CAPTURE === "true") {
        outbox.push({ to, subject, text, html });
        return { sent: true, captured: true };
    }
    if (!transport) {
        if (!isProd) {
            console.log(`\n[mail:dev] To: ${to}\n[mail:dev] Subject: ${subject}\n${text}\n`);
            return { sent: true, logged: true };
        }
        return { sent: false, reason: "not_configured" };
    }
    try {
        await transport.sendMail({ from: FROM, to, subject, text, html });
        return { sent: true };
    } catch (err) {
        console.error("[mail] send failed:", err.message);
        return { sent: false, reason: "send_failed" };
    }
}

const isMailConfigured = () => Boolean(transport) || process.env.MAIL_CAPTURE === "true";

module.exports = { sendMail, isMailConfigured, outbox };
