#!/usr/bin/env node
// Offline weekly-newsletter send. Broadcasts a manually-written draft to the
// 'report' subscriber list via Mailgun (recipients in BCC).
//
// Dry-run by default — pass --send to actually deliver.
//
//   npm run newsletter -- --draft newsletter/2026-06-26.md --subject "This week in Bengaluru property"
//   npm run newsletter -- --draft newsletter/TEMPLATE.md --subject "Test" --to you@email.com   # send only to yourself
//   npm run newsletter -- --draft draft.html --subject "..." --send
//   npm run newsletter -- --csv leads.csv --draft draft.md --subject "..."
//
// .md drafts get a tiny built-in markdown→HTML pass; .html drafts are sent as-is.

import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config(); // fall back to .env if present
import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { getSubscribers } from './lib/subscribers.mjs';
import { sendEmail, broadcast } from './lib/mailgun.mjs';
import { mdToHtml, wrap, htmlToText } from './lib/render.mjs';

function parseArgs(argv) {
  const a = { send: false, csv: null, draft: null, subject: null, to: null, limit: Infinity };
  for (let i = 2; i < argv.length; i++) {
    const v = argv[i];
    if (v === '--send') a.send = true;
    else if (v === '--dry-run') a.send = false;
    else if (v === '--csv') a.csv = argv[++i];
    else if (v === '--draft') a.draft = argv[++i];
    else if (v === '--subject') a.subject = argv[++i];
    else if (v === '--to') a.to = argv[++i];
    else if (v === '--limit') a.limit = parseInt(argv[++i], 10) || Infinity;
  }
  return a;
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args.draft) { console.error('✖ --draft <file.md|.html> is required'); process.exit(1); }
  if (!args.subject) { console.error('✖ --subject "..." is required'); process.exit(1); }

  const rawDraft = await readFile(args.draft, 'utf8');
  const body = extname(args.draft).toLowerCase() === '.md' ? mdToHtml(rawDraft) : rawDraft;
  const html = wrap(body);
  const text = htmlToText(html);

  const mode = args.send ? 'SEND' : 'DRY-RUN';
  console.log(`Newsletter · ${mode} · subject="${args.subject}" · draft=${args.draft}`);

  // --to overrides the list (handy for sending a test to yourself first).
  let recipients;
  if (args.to) {
    recipients = [args.to];
    console.log(`Override recipient: ${args.to}`);
  } else {
    const subs = await getSubscribers({ kind: 'report', csv: args.csv });
    recipients = subs.map((s) => s.email).slice(0, args.limit);
    console.log(`${recipients.length} 'report' subscriber(s)${args.csv ? ' (csv)' : ' (Sheet)'}`);
  }

  if (!recipients.length) { console.log('No recipients — nothing to do.'); return; }

  console.log('\n--- preview (text) ---\n' + text.slice(0, 600) + (text.length > 600 ? '\n…' : '') + '\n----------------------\n');

  if (args.to) {
    await sendEmail({ to: args.to, subject: args.subject, html, text, dryRun: !args.send });
  } else {
    await broadcast({ recipients, subject: args.subject, html, text, dryRun: !args.send });
  }

  console.log(args.send ? `\n✅ Sent to ${recipients.length} recipient(s).`
                        : `\nDry-run complete — ${recipients.length} would receive it. Re-run with --send to deliver.`);
}

main().catch((e) => { console.error('✖', e.message); process.exit(1); });
