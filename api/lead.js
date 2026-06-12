// Vercel Serverless Function: receives a lead from the site and appends it to a
// Google Sheet via a Google Apps Script web-app webhook.
//
// Why a webhook (not the Sheets API)? No service-account / googleapis dependency,
// nothing to npm-install, and the webhook URL stays server-side in an env var.
//
// Setup (see SETUP-leads.md):
//   1. Create a Google Sheet, add an Apps Script doPost that appendRow()s.
//   2. Deploy it as a Web App (execute as you; access: Anyone). Copy the /exec URL.
//   3. In Vercel → Project → Settings → Environment Variables, add:
//        SHEET_WEBHOOK_URL = https://script.google.com/macros/s/XXXX/exec
//   4. Redeploy.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'method_not_allowed' });
    return;
  }
  const hook = process.env.SHEET_WEBHOOK_URL;
  if (!hook) {
    res.status(500).json({ ok: false, error: 'not_configured' });
    return;
  }
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const email = String(body.email || '').trim();
    if (!EMAIL_RE.test(email)) {
      res.status(400).json({ ok: false, error: 'invalid_email' });
      return;
    }
    const payload = {
      kind: String(body.kind || 'unknown').slice(0, 40),
      email,
      meta: body.meta || null,
      when: new Date().toISOString(),
      ref: req.headers['referer'] || '',
      ua: (req.headers['user-agent'] || '').slice(0, 300),
    };
    const r = await fetch(hook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!r.ok) throw new Error('sheet_webhook_' + r.status);
    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(502).json({ ok: false, error: String((e && e.message) || e) });
  }
}
