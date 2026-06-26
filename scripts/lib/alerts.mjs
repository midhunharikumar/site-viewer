// Price-alert core: compute which subscribers' localities have crossed their
// saved ₹/sqft threshold, and render the alert email. Shared by the CLI
// (scripts/send-price-alerts.mjs) and the cron (api/cron/alerts.mjs); each
// supplies its own "already-sent" set + persistence backend.

const SITE = () => process.env.SITE_URL || 'https://flatmap.cloud';
const slugify = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
export const fmt = (n) => '₹' + Number(n).toLocaleString('en-IN') + '/sqft';

// Stable de-dupe key for an (email, locality, threshold) alert.
export const alertKey = (email, locality, threshold) => `${String(email).toLowerCase()}|${locality}|${threshold}`;

// Build the set of already-notified keys from 'alert-sent' log rows
// (each row meta = { locality, threshold, price }).
export function sentSetFromRows(rows) {
  const set = new Set();
  for (const r of rows) {
    const m = r.meta || {};
    if (m.locality && m.threshold != null) set.add(alertKey(r.email, m.locality, Number(m.threshold)));
  }
  return set;
}

// subscribers: [{email, meta:{locality, threshold}}], prices: {name: ₹}, sentSet: Set<key>.
// Returns { toSend:[{email,locality,threshold,price,key}], skipped:{...} }.
export function computeCrossings({ subscribers, prices, sentSet = new Set() }) {
  const toSend = [];
  const skipped = { badMeta: 0, noPrice: 0, notCrossed: 0, alreadySent: 0 };
  for (const s of subscribers) {
    const locality = s.meta && s.meta.locality;
    const threshold = s.meta && Number(s.meta.threshold);
    if (!locality || !threshold) { skipped.badMeta++; continue; }
    const price = prices[locality];
    if (price == null) { skipped.noPrice++; continue; }
    if (price < threshold) { skipped.notCrossed++; continue; }
    const key = alertKey(s.email, locality, threshold);
    if (sentSet.has(key)) { skipped.alreadySent++; continue; }
    toSend.push({ email: s.email, locality, threshold, price, key });
  }
  return { toSend, skipped };
}

export function renderAlertEmail({ locality, threshold, price }) {
  const url = `${SITE()}/l/${slugify(locality)}`;
  const subject = `🔔 ${locality} hit ${fmt(threshold)}`;
  const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;color:#111">
  <h2 style="margin:0 0 8px">🔔 ${locality} crossed your price alert</h2>
  <p style="font-size:15px;line-height:1.5;color:#333">You asked to hear when <b>${locality}</b> reached <b>${fmt(threshold)}</b>.
  The current modeled price is <b>${fmt(price)}</b>.</p>
  <p><a href="${url}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;font-size:14px">See the full ${locality} trend →</a></p>
  <p style="font-size:11px;color:#888;margin-top:24px">You set this alert on flatmap.cloud. Reply to stop alerts for this locality.</p>
</div>`;
  const text = `${locality} crossed your alert.\nYour threshold: ${fmt(threshold)}\nCurrent modeled price: ${fmt(price)}\nDetails: ${url}\n\nYou set this alert on flatmap.cloud.`;
  return { subject, html, text };
}
