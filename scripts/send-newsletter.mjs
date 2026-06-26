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

const SITE = process.env.SITE_URL || 'https://flatmap.cloud';

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

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Deliberately tiny markdown: headings, bold/italic, links, lists, paragraphs.
function mdToHtml(md) {
  const inline = (t) => esc(t)
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/\*([^*]+)\*/g, '<i>$1</i>')
    .replace(/_([^_]+)_/g, '<i>$1</i>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
  const out = [];
  let list = null;
  const flush = () => { if (list) { out.push(`<${list.tag}>${list.items.join('')}</${list.tag}>`); list = null; } };
  for (const raw of md.split('\n')) {
    const line = raw.trimEnd();
    let m;
    if ((m = line.match(/^(#{1,4})\s+(.*)$/))) { flush(); out.push(`<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`); }
    else if ((m = line.match(/^[-*]\s+(.*)$/))) { if (!list || list.tag !== 'ul') { flush(); list = { tag: 'ul', items: [] }; } list.items.push(`<li>${inline(m[1])}</li>`); }
    else if ((m = line.match(/^\d+\.\s+(.*)$/))) { if (!list || list.tag !== 'ol') { flush(); list = { tag: 'ol', items: [] }; } list.items.push(`<li>${inline(m[1])}</li>`); }
    else if (line === '') { flush(); }
    else { flush(); out.push(`<p>${inline(line)}</p>`); }
  }
  flush();
  return out.join('\n');
}

function wrap(bodyHtml) {
  return `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:600px;margin:0 auto;color:#111;line-height:1.55;font-size:15px">
${bodyHtml}
<hr style="border:none;border-top:1px solid #eee;margin:28px 0 12px">
<p style="font-size:11px;color:#888">You're receiving this because you signed up for the Bengaluru property report at
<a href="${SITE}" style="color:#888">flatmap.cloud</a>. Reply with "unsubscribe" to stop.</p>
</div>`;
}

function htmlToText(html) {
  return html
    .replace(/<\/(p|div|h[1-4]|li)>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
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
