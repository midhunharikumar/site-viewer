// Read subscribers back from the Google Sheet.
//
// Two sources:
//   1. SHEET_READ_URL + SHEET_READ_TOKEN  → the Apps Script doGet JSON endpoint.
//   2. --csv <file>                       → a manual "Download as CSV" export.
//
// Sheet columns: timestamp | kind | email | meta(JSON) | referer | user_agent
// Returns: [{ when, kind, email, meta }] filtered by kind, deduped by email.

import { readFile } from 'node:fs/promises';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/; // matches api/lead.js

// Minimal RFC-4180-ish CSV parser (handles quoted fields, embedded commas/quotes/newlines).
function parseCsv(text) {
  const rows = [];
  let row = [], field = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false;
      } else field += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (ch === '\r') { /* skip */ }
    else field += ch;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function parseMeta(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'object') return v;
  try { return JSON.parse(v); } catch { return null; }
}

function normalize(rows, { dedupe = true } = {}) {
  // rows: array of {when,kind,email,meta} objects already
  const seen = new Set();
  const out = [];
  for (const r of rows) {
    const email = String(r.email || '').trim().toLowerCase();
    if (!EMAIL_RE.test(email)) continue;
    if (dedupe) {
      if (seen.has(email + '|' + r.kind)) continue;
      seen.add(email + '|' + r.kind);
    }
    out.push({ when: r.when || '', kind: String(r.kind || '').trim(), email, meta: parseMeta(r.meta) });
  }
  return out;
}

async function fromCsv(path) {
  const text = await readFile(path, 'utf8');
  const rows = parseCsv(text).filter((r) => r.length > 1);
  if (!rows.length) return [];
  // Detect & drop a header row if present.
  const first = rows[0].map((c) => c.toLowerCase());
  const hasHeader = first.includes('email') || first.includes('kind');
  const body = hasHeader ? rows.slice(1) : rows;
  return body.map((r) => ({ when: r[0], kind: r[1], email: r[2], meta: r[3] }));
}

async function fromSheet() {
  const url = process.env.SHEET_READ_URL;
  const token = process.env.SHEET_READ_TOKEN;
  if (!url) throw new Error('SHEET_READ_URL not set (and no --csv given). See SETUP-email.md.');
  const full = url + (url.includes('?') ? '&' : '?') + 'token=' + encodeURIComponent(token || '');
  const r = await fetch(full, { redirect: 'follow' });
  if (!r.ok) throw new Error(`Sheet read failed: HTTP ${r.status}`);
  const data = await r.json();
  if (!data || data.ok === false) throw new Error('Sheet read rejected (check READ_TOKEN).');
  return (data.rows || []).map((r) => ({ when: r.when, kind: r.kind, email: r.email, meta: r.meta }));
}

// kind: 'price-alert' | 'report' | 'request-area' | undefined (all). csv: optional path.
// dedupe: collapse to one row per email+kind (default true). Pass false to keep every
// row — needed for log-style kinds like 'alert-sent' where one email has many rows.
export async function getSubscribers({ kind, csv, dedupe = true } = {}) {
  const raw = csv ? await fromCsv(csv) : await fromSheet();
  const all = normalize(raw, { dedupe });
  return kind ? all.filter((s) => s.kind === kind) : all;
}

// Append a row to the Sheet via the same Apps Script webhook the site uses
// (api/lead.js → SHEET_WEBHOOK_URL). Used to persist 'alert-sent' state so the
// serverless cron can dedupe without a local file. No-op if the URL isn't set.
export async function recordEvent({ kind, email, meta }) {
  const hook = process.env.SHEET_WEBHOOK_URL;
  if (!hook) return { ok: false, error: 'no_webhook' };
  const r = await fetch(hook, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind, email, meta, when: new Date().toISOString(), ref: 'cron', ua: 'cron' }),
  });
  if (!r.ok) throw new Error('record_event_' + r.status);
  return { ok: true };
}
