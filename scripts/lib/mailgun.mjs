// Thin Mailgun client using the native fetch (Node 18+) — no npm dependency.
// Sends via the HTTP API with Basic auth `api:KEY` and a urlencoded body
// (fine for text/HTML messages without attachments).
//
// Env (from .env.local): MAILGUN_API_KEY, MAILGUN_DOMAIN, MAILGUN_FROM.

function cfg() {
  const key = process.env.MAILGUN_API_KEY;
  const domain = process.env.MAILGUN_DOMAIN;
  const from = process.env.MAILGUN_FROM || `noreply@${domain}`;
  if (!key || !domain) {
    throw new Error('MAILGUN_API_KEY and MAILGUN_DOMAIN must be set in .env.local');
  }
  // Mailgun US region by default; switch base to api.eu.mailgun.net for EU domains.
  const base = process.env.MAILGUN_BASE || 'https://api.mailgun.net';
  return { key, domain, from, base };
}

// Send one message. Pass `dryRun:true` to log instead of calling the API.
// `to` may be a string or an array; `bcc` likewise (used for broadcasts).
export async function sendEmail({ to, bcc, subject, html, text, from, dryRun = false }) {
  if (dryRun) {
    const rcpts = [].concat(to || []).concat(bcc || []);
    console.log(`  [dry-run] would send "${subject}" → ${rcpts.length} recipient(s): ${rcpts.slice(0, 5).join(', ')}${rcpts.length > 5 ? ' …' : ''}`);
    return { ok: true, dryRun: true };
  }

  const c = cfg();
  const params = new URLSearchParams();
  params.set('from', from || c.from);
  if (to) [].concat(to).forEach((a) => params.append('to', a));
  if (bcc) [].concat(bcc).forEach((a) => params.append('bcc', a));
  params.set('subject', subject || '');
  if (html) params.set('html', html);
  if (text) params.set('text', text);

  const auth = 'Basic ' + Buffer.from(`api:${c.key}`).toString('base64');
  const r = await fetch(`${c.base}/v3/${c.domain}/messages`, {
    method: 'POST',
    headers: { Authorization: auth, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
  const bodyText = await r.text();
  if (!r.ok) throw new Error(`Mailgun ${r.status}: ${bodyText}`);
  return { ok: true, response: bodyText };
}

// Send the same message to a large list, batched as BCC (Mailgun caps ~1000/call).
export async function broadcast({ recipients, subject, html, text, from, batchSize = 800, dryRun = false }) {
  const list = [...new Set((recipients || []).filter(Boolean))];
  const visibleTo = from || (dryRun ? undefined : cfg().from); // visible To = sender; real recipients in BCC
  let sent = 0;
  for (let i = 0; i < list.length; i += batchSize) {
    const batch = list.slice(i, i + batchSize);
    await sendEmail({ to: visibleTo, bcc: batch, subject, html, text, from, dryRun });
    sent += batch.length;
  }
  return { ok: true, sent };
}
