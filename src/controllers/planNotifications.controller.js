/**
 * Plan Notifications Controller
 *
 * Purpose:
 * - Accepts a list of patients + a summary of plan changes.
 * - Generates a default SUBJECT (if none provided) and renders both HTML + plaintext
 *   emails from the given summary (HTML preferred; falls back to text).
 * - Sends emails in small batches via the shared mailer (Proton SMTP / Bridge / mock).
 * - Returns 200 on full success, 207 (Multi-Status) if some deliveries failed.
 *
 * Minimal input required (subject optional):
 * {
 *   // "subject": "Your medical plan has updates",        // optional; auto-generated if missing
 *   "summaryHtml": "<ul><li>PA added for CPT 12345</li></ul>",  // OR use "summaryText": "..."
 *   "patients": [
 *     { "email": "alice@example.com", "name": "Alice", "patientId": "p001" },
 *     { "email": "bob@example.com" }
 *   ]
 * }
 *
 * Security:
 *   Mount behind an authenticated route (e.g., requireAuth('hospital')):
 *   POST /api/v1/notifications/plan-changes/bulk
 */

import asyncHandler from '../utils/asyncHandler.js';
import { z } from 'zod';
import { sendMail } from '../services/mailer.service.js';

const PatientSchema = z.object({
  email: z.string().email(),
  name: z.string().optional(),
  patientId: z.string().optional(),
});

const BodySchema = z.object({
  subject: z.string().min(3).optional(),    // now optional
  summaryHtml: z.string().optional(),
  summaryText: z.string().optional(),
  patients: z.array(PatientSchema).min(1),
});

function renderHtml({ patientName, summaryHtml, summaryText }) {
  const safeSummary =
    summaryHtml ||
    `<pre style="white-space:pre-wrap;font-family:ui-monospace,Consolas,monospace">${(summaryText || '').replace(/</g,'&lt;')}</pre>`;

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8"/>
    <meta name="x-processed-by" content="PolicyPulse"/>
  </head>
  <body style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;line-height:1.5;color:#111">
    <h2 style="margin:0 0 12px">Medical plan updates</h2>
    <p>Hello${patientName ? ' ' + patientName : ''},</p>
    <p>We’re writing to let you know that your insurance plan has recent changes. Summary below:</p>
    <div style="border:1px solid #eee;border-radius:8px;padding:12px;margin:12px 0">
      ${safeSummary}
    </div>
    <p>If you have questions, please reply to this email.</p>
    <p style="color:#666;font-size:12px">— PolicyPulse</p>
  </body>
</html>`;
}

function renderText({ patientName, summaryText }) {
  return `Medical plan updates

Hello${patientName ? ' ' + patientName : ''},

We’re writing to let you know that your insurance plan has recent changes.

${summaryText || '[See HTML summary]'}

— PolicyPulse`;
}

export const sendPlanChangeEmails = asyncHandler(async (req, res) => {
  const parsed = BodySchema.parse(req.body);

  // Default subject if not provided
  const defaultSubject = `Your medical plan has updates — ${new Date().toISOString().slice(0,10)}`;
  const subject = parsed.subject ?? defaultSubject;

  // Ensure we have at least some summary content
  const baseSummaryHtml = parsed.summaryHtml;
  const baseSummaryText = parsed.summaryText || 'There are updates to your insurance plan. Please check your portal for details.';

  // Small batcher to avoid flooding the SMTP server
  const BATCH = 25;
  let sent = 0;
  const errors = [];

  for (let i = 0; i < parsed.patients.length; i += BATCH) {
    const chunk = parsed.patients.slice(i, i + BATCH);

    // Send in parallel within the batch
    const results = await Promise.allSettled(
      chunk.map((p) => {
        const html = renderHtml({
          patientName: p.name,
          summaryHtml: baseSummaryHtml,
          summaryText: baseSummaryText,
        });
        const text = renderText({
          patientName: p.name,
          summaryText: baseSummaryText,
        });

        return sendMail({
          to: p.email,
          subject,
          text,
          html,
          headers: {
            'X-PolicyPulse-PatientId': p.patientId || '',
            'X-PolicyPulse-Event': 'policy.updated',
          },
        });
      })
    );

    results.forEach((r, idx) => {
      if (r.status === 'fulfilled') {
        sent += 1;
      } else {
        errors.push({ email: chunk[idx].email, error: String(r.reason) });
      }
    });
  }

  const status = errors.length ? 207 : 200; // 207 Multi-Status on partial failures
  res.status(status).json({ sent, failed: errors });
});
