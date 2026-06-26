// Vercel Cron: build this week's newsletter from real data and broadcast it to
// the 'report' subscriber list via Mailgun. Scheduled in vercel.json
// (Saturday morning IST). Runs unattended — no manual review step.
//
// Auth: Vercel sends `Authorization: Bearer <CRON_SECRET>` when CRON_SECRET is
// set in the project env. We require it so the endpoint can't be triggered by
// random callers. Set CRON_SECRET in Vercel → Settings → Environment Variables.
//
// Required env: CRON_SECRET, MAILGUN_API_KEY, MAILGUN_DOMAIN, MAILGUN_FROM,
//   SHEET_READ_URL, SHEET_READ_TOKEN. Optional: OPENROUTER_API_KEY (LLM intro),
//   MAILGUN_TO (always receives a copy), SITE_URL.

import "dotenv/config";
import { buildNewsletter } from "../../scripts/lib/newsletter.mjs";
import { draftToEmail } from "../../scripts/lib/render.mjs";
import { getSubscribers } from "../../scripts/lib/subscribers.mjs";
import { broadcast } from "../../scripts/lib/mailgun.mjs";

function authorized(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // not configured → allow (but we warn in logs)
  return req.headers["authorization"] === `Bearer ${secret}`;
}

export default async function handler(req, res) {
  if (!process.env.CRON_SECRET) console.log("[cron/newsletter] WARNING: CRON_SECRET not set — endpoint is unprotected.");
  if (!authorized(req)) { res.status(401).json({ ok: false, error: "unauthorized" }); return; }

  try {
    const { markdown, subject, via, facts } = await buildNewsletter({});
    const { html, text } = draftToEmail(markdown);

    const subs = await getSubscribers({ kind: "report" });
    // Always include the owner so there's a record / a recipient even with 0 signups.
    const recipients = [...new Set([...subs.map((s) => s.email), process.env.MAILGUN_TO].filter(Boolean))];

    if (!recipients.length) {
      console.log(`[cron/newsletter] no recipients; subject="${subject}" via=${via}`);
      res.status(200).json({ ok: true, sent: 0, subject, via });
      return;
    }

    const { sent } = await broadcast({ recipients, subject, html, text });
    console.log(`[cron/newsletter] sent=${sent} subject="${subject}" via=${via} movers=${facts.movers.length} launches=${facts.launches.length}`);
    res.status(200).json({ ok: true, sent, subject, via });
  } catch (e) {
    console.error("[cron/newsletter] error:", e?.message || e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
