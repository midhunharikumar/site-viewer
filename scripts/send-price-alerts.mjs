#!/usr/bin/env node
// Offline price-alert send. Compares each 'price-alert' subscriber's saved
// ₹/sqft threshold against the locality's current modeled price (price2026 from
// index.html) and emails those whose locality has crossed the threshold.
// Core logic is shared with the cron in scripts/lib/alerts.mjs.
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
// NOTE: the Vercel cron uses the Google Sheet (kind 'alert-sent') for the same
// purpose, so manual runs and the cron each keep their own state.

import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { getSubscribers } from './lib/subscribers.mjs';
import { currentPrices } from './lib/prices.mjs';
import { sendEmail } from './lib/mailgun.mjs';
import { computeCrossings, renderAlertEmail, fmt } from './lib/alerts.mjs';

const STATE_FILE = join(dirname(fileURLToPath(import.meta.url)), '.alert-state.json');

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

async function loadState() {
  try { return JSON.parse(await readFile(STATE_FILE, 'utf8')); } catch { return {}; }
}

async function main() {
  const args = parseArgs(process.argv);
  console.log(`Price alerts · ${args.send ? 'SEND' : 'DRY-RUN'}${args.csv ? ' · csv=' + args.csv : ' · source=Sheet'}`);

  const [subscribers, prices, state] = await Promise.all([
    getSubscribers({ kind: 'price-alert', csv: args.csv }),
    currentPrices(),
    loadState(),
  ]);
  console.log(`Loaded ${subscribers.length} price-alert subscriber(s), ${Object.keys(prices).length} localities priced.\n`);

  const sentSet = new Set(Object.keys(state));
  const { toSend, skipped } = computeCrossings({ subscribers, prices, sentSet });
  console.log(`Crossed & new: ${toSend.length}`);
  console.log(`Skipped → already-sent:${skipped.alreadySent} not-crossed:${skipped.notCrossed} no-price:${skipped.noPrice} bad-meta:${skipped.badMeta}\n`);

  const batch = toSend.slice(0, args.limit);
  for (const t of batch) {
    const { subject, html, text } = renderAlertEmail(t);
    console.log(`  • ${t.email} — ${t.locality}: ${fmt(t.price)} ≥ ${fmt(t.threshold)}`);
    await sendEmail({ to: t.email, subject, html, text, dryRun: !args.send });
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
