/**
 * Mailer Service (Proton Mail / Proton Bridge / Mock)
 *
 * What it does:
 * - Builds a single reusable Nodemailer transport based on `PROTON_MODE`:
 *   - `smtp`   → Proton SMTP Submission (Business + custom domain), STARTTLS:587
 *   - `bridge` → Proton Mail Bridge (local SMTP daemon, e.g., 127.0.0.1:1025)
 *   - `mock`   → JSON transport (prints the message as JSON; no email sent)
 * - Exposes `sendMail({...})` to send plan-change notifications or any other emails.
 *
 * Environment variables:
 *   PROTON_MODE=smtp|bridge|mock
 *   # SMTP (Proton Mail Business, custom domain; use SMTP token)
 *   PROTON_SMTP_HOST=smtp.protonmail.ch
 *   PROTON_SMTP_PORT=587
 *   PROTON_SMTP_USER=alerts@your-domain.tld
 *   PROTON_SMTP_TOKEN=<proton-smtp-token>
 *
 *   # Bridge (Proton Mail Bridge app must be running locally)
 *   BRIDGE_SMTP_HOST=127.0.0.1
 *   BRIDGE_SMTP_PORT=1025
 *   BRIDGE_SMTP_USER=<bridge-username>
 *   BRIDGE_SMTP_PASS=<bridge-password>
 *
 *   # Common
 *   MAIL_FROM="PolicyPulse Alerts" <no-reply@your-domain.tld>
 *   MAIL_REPLY_TO=support@your-domain.tld
 */

import nodemailer from 'nodemailer';

/**
 * Create and configure the Nodemailer transport according to PROTON_MODE.
 * - `smtp`   → STARTTLS on port 587 with SMTP token auth.
 * - `bridge` → Local SMTP (Bridge). TLS relaxed for local/self-signed certs.
 * - `mock`   → JSON transport (safe for dev/testing).
 *
 * @returns {import('nodemailer').Transporter}
 */
function makeTransport() {
  const mode = (process.env.PROTON_MODE || 'mock').toLowerCase();

  if (mode === 'smtp') {
    // Proton SMTP Submission (Business + custom domain)
    // STARTTLS on port 587
    return nodemailer.createTransport({
      host: process.env.PROTON_SMTP_HOST || 'smtp.protonmail.ch',
      port: Number(process.env.PROTON_SMTP_PORT || 587),
      secure: false,                // STARTTLS
      requireTLS: true,
      auth: {
        user: process.env.PROTON_SMTP_USER,
        pass: process.env.PROTON_SMTP_TOKEN, // the SMTP token you generated
      },
    });
  }

  if (mode === 'bridge') {
    // Proton Mail Bridge (local daemon)
    return nodemailer.createTransport({
      host: process.env.BRIDGE_SMTP_HOST || '127.0.0.1',
      port: Number(process.env.BRIDGE_SMTP_PORT || 1025),
      secure: false, // Bridge supports STARTTLS; keep false + allow local cert
      auth: {
        user: process.env.BRIDGE_SMTP_USER,
        pass: process.env.BRIDGE_SMTP_PASS,
      },
      tls: { rejectUnauthorized: false }, // local/self-signed certs
    });
  }

  // Safe default for dev/testing: prints JSON instead of sending
  return nodemailer.createTransport({ jsonTransport: true });
}

const transporter = makeTransport();

/**
 * Send a single email message using the configured transport.
 *
 * @param {Object} options
 * @param {string|string[]} options.to         - Recipient(s)
 * @param {string} options.subject             - Subject line
 * @param {string} [options.text]              - Plaintext body
 * @param {string} [options.html]              - HTML body
 * @param {Record<string,string>} [options.headers] - Extra headers (e.g., X-PolicyPulse-*)
 * @returns {Promise<import('nodemailer').SentMessageInfo>}
 */
export async function sendMail({ to, subject, text, html, headers }) {
  const from = process.env.MAIL_FROM || 'no-reply@example.com';
  const replyTo = process.env.MAIL_REPLY_TO;

  return transporter.sendMail({
    from,
    to,
    subject,
    text,
    html,
    headers,
    ...(replyTo ? { replyTo } : {}),
  });
}
