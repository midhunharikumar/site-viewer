#!/usr/bin/env node
// Offline price-alert send. Compares each 'price-alert' subscriber's saved
// ₹/sqft threshold against the locality's current modeled price (price2026 from
// index.html) and emails those whose locality has crossed the threshold.
//
// Dry-run by default — pass --send to actually email via Mailgun.
//
//   npm run alerts                       # dry-run from the Sheet
//   npm run alerts -- --csv leads.csv    # dry-run from a CSV export
//   npm run alerts -- --send             # really send
//   npm run alerts -- --limit 5          # cap recipients (testing)
//
// Re-send guard: scripts/.alert-state.json records the (email|locality|threshold)
// combos already notified, so reruns don't spam. Delete it to reset.

import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config(); // fall back to .env if present
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { getSubscribers } from './lib/subscribers.mjs';
import { currentPrices } from './lib/prices.mjs';
import { sendEmail } from './lib/mailgun.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const STATE_FILE = join(HERE, '.alert-state.json');
const SITE = process.env.SITE_URL || 'https://flatmap.cloud';

function parseArgs(argv) {
  const a = { send: false, csv: null, limit: Infinity };
  for (let i = 2; i < argv.length; i++) {
    const v = argv[i];
    if (v === '--send') a.send = true;
    else if (v === '--dry-run') a.send = false;
    else if (v === '--csv') a.csv = argv[++i];
    else if (v === '--limit') a.limit = parseInt(argv[++i], 10) || Infinity;
  }
  return a;
}

const slugify = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const fmt = (n) => '₹' + Number(n).toLocaleString('en-IN') + '/sqft';

async function loadState() {
  try { return JSON.parse(await readFile(STATE_FILE, 'utf8')); } catch { return {}; }
}

function emailBody({ locality, threshold, price }) {
  const url = `${SITE}/l/${slugify(locality)}`;
  const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;color:#111">
  <h2 style="margin:0 0 8px">🔔 ${locality} crossed your price alert</h2>
  <p style="font-size:15px;line-height:1.5;color:#333">You asked to hear when <b>${locality}</b> reached <b>${fmt(threshold)}</b>.
  The current modeled price is <b>${fmt(price)}</b>.</p>
  <p><a href="${url}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;font-size:14px">See the full ${locality} trend →</a></p>
  <p style="font-size:11px;color:#888;margin-top:24px">You set this alert on flatmap.cloud. Reply to stop alerts for this locality.</p>
</div>`;
  const text = `${locality} crossed your alert.\nYour threshold: ${fmt(threshold)}\nCurrent modeled price: ${fmt(price)}\nDetails: ${url}\n\nYou set this alert on flatmap.cloud.`;
  return { html, text };
}

async function main() {
  const args = parseArgs(process.argv);
  const mode = args.send ? 'SEND' : 'DRY-RUN';
  console.log(`Price alerts · ${mode}${args.csv ? ' · csv=' + args.csv : ' · source=Sheet'}`);

  const [subs, prices, state] = await Promise.all([
    getSubscribers({ kind: 'price-alert', csv: args.csv }),
    currentPrices(),
    loadState(),
  ]);
  console.log(`Loaded ${subs.length} price-alert subscriber(s), ${Object.keys(prices).length} localities priced.\n`);

  const toSend = [];
  const skipped = { noLocality: 0, noPrice: 0, notCrossed: 0, alreadySent: 0 };

  for (const s of subs) {
    const locality = s.meta && s.meta.locality;
    const threshold = s.meta && Number(s.meta.threshold);
    if (!locality || !threshold) { skipped.noLocality++; continue; }
    const price = prices[locality];
    if (price == null) { skipped.noPrice++; continue; }
    if (price < threshold) { skipped.notCrossed++; continue; }
    const key = `${s.email}|${locality}|${threshold}`;
    if (state[key]) { skipped.alreadySent++; continue; }
    toSend.push({ ...s, locality, threshold, price, key });
  }

  console.log(`Crossed & new: ${toSend.length}`);
  console.log(`Skipped → already-sent:${skipped.alreadySent} not-crossed:${skipped.notCrossed} no-price:${skipped.noPrice} bad-meta:${skipped.noLocality}\n`);

  const batch = toSend.slice(0, args.limit);
  for (const t of batch) {
    const { html, text } = emailBody(t);
    console.log(`  • ${t.email} — ${t.locality}: ${fmt(t.price)} ≥ ${fmt(t.threshold)}`);
    await sendEmail({ to: t.email, subject: `🔔 ${t.locality} hit ${fmt(t.threshold)}`, html, text, dryRun: !args.send });
    if (args.send) state[t.key] = { when: new Date().toISOString(), price: t.price };
  }

  if (args.send) {
    await writeFile(STATE_FILE, JSON.stringify(state, null, 2));
    console.log(`\n✅ Sent ${batch.length} alert(s). State saved to ${STATE_FILE}`);
  } else {
    console.log(`\nDry-run complete — ${batch.length} would be sent. Re-run with --send to deliver.`);
  }
}

main().catch((e) => { console.error('✖', e.message); process.exit(1); });
