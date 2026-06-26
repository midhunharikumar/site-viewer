// Vercel Cron: email price-alert subscribers whose locality has crossed their
// saved ₹/sqft threshold. Scheduled in vercel.json (Saturday morning IST).
//
// De-dupe across runs: serverless has no persistent disk, so we record each sent
// alert back into the Google Sheet as a row with kind 'alert-sent'
// (meta = { locality, threshold, price }) via the same Apps Script webhook the
// site uses, and read those rows back to skip already-notified combos.
//
// Required env: CRON_SECRET, MAILGUN_API_KEY, MAILGUN_DOMAIN, MAILGUN_FROM,
//   SHEET_READ_URL, SHEET_READ_TOKEN, SHEET_WEBHOOK_URL (to record sent state).
//   Optional: SITE_URL.

import "dotenv/config";
import { getSubscribers, recordEvent } from "../../scripts/lib/subscribers.mjs";
import { currentPrices } from "../../scripts/lib/prices.mjs";
import { sendEmail } from "../../scripts/lib/mailgun.mjs";
import { computeCrossings, renderAlertEmail, sentSetFromRows } from "../../scripts/lib/alerts.mjs";

function authorized(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  return req.headers["authorization"] === `Bearer ${secret}`;
}

export default async function handler(req, res) {
  if (!process.env.CRON_SECRET) console.log("[cron/alerts] WARNING: CRON_SECRET not set — endpoint is unprotected.");
  if (!authorized(req)) { res.status(401).json({ ok: false, error: "unauthorized" }); return; }
  if (!process.env.SHEET_WEBHOOK_URL) console.log("[cron/alerts] WARNING: SHEET_WEBHOOK_URL not set — cannot persist sent-state; alerts may repeat weekly.");

  try {
    const [subscribers, prices, sentRows] = await Promise.all([
      getSubscribers({ kind: "price-alert" }),
      currentPrices(),
      getSubscribers({ kind: "alert-sent", dedupe: false }),
    ]);
    const sentSet = sentSetFromRows(sentRows);
    const { toSend, skipped } = computeCrossings({ subscribers, prices, sentSet });

    let sent = 0;
    for (const t of toSend) {
      const { subject, html, text } = renderAlertEmail(t);
      await sendEmail({ to: t.email, subject, html, text });
      // Persist BEFORE counting so a mid-loop failure doesn't double-send next week.
      await recordEvent({ kind: "alert-sent", email: t.email, meta: { locality: t.locality, threshold: t.threshold, price: t.price } });
      sent++;
    }

    console.log(`[cron/alerts] sent=${sent} subs=${subscribers.length} skipped=${JSON.stringify(skipped)}`);
    res.status(200).json({ ok: true, sent, skipped });
  } catch (e) {
    console.error("[cron/alerts] error:", e?.message || e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
