// Extract current locality prices from index.html.
//
// The price model lives as a JS object literal `var DATA = { ... }` in index.html
// (unquoted keys + trailing commas → not valid JSON), so we brace-match the literal
// and evaluate it in a sandboxed Function. The content is first-party/trusted.
//
// Returns: { meta, localities, priceByName } where priceByName maps name → price2026.

import { readFile, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
// Resolve index.html for both the CLI (cwd=repo root) and the Vercel runtime
// (functions run with cwd=project root; the file is included via vercel.json).
const CANDIDATES = [
  join(process.cwd(), 'index.html'),
  join(HERE, '..', '..', 'index.html'),
];
async function resolveIndexHtml() {
  for (const p of CANDIDATES) {
    try { await access(p); return p; } catch { /* next */ }
  }
  return CANDIDATES[0];
}

// Find the object literal starting after `var DATA =` and return its text by
// brace-matching while ignoring braces inside string literals.
function extractObjectLiteral(src, marker = 'var DATA') {
  const m = src.indexOf(marker);
  if (m < 0) throw new Error(`marker "${marker}" not found in index.html`);
  const start = src.indexOf('{', m);
  if (start < 0) throw new Error('opening brace not found after marker');
  let depth = 0, inStr = false, quote = '';
  for (let i = start; i < src.length; i++) {
    const ch = src[i];
    if (inStr) {
      if (ch === '\\') { i++; continue; }
      if (ch === quote) inStr = false;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { inStr = true; quote = ch; continue; }
    if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth === 0) return src.slice(start, i + 1); }
  }
  throw new Error('unbalanced braces extracting DATA');
}

export async function loadData() {
  const src = await readFile(await resolveIndexHtml(), 'utf8');
  const literal = extractObjectLiteral(src);
  // eslint-disable-next-line no-new-func
  const DATA = Function('"use strict"; return (' + literal + ');')();
  return DATA;
}

// { localityName: currentPrice } using price2026 (latest actual quarter).
export async function currentPrices() {
  const DATA = await loadData();
  const out = {};
  for (const l of DATA.localities || []) {
    if (l && l.name) out[l.name] = l.price2026;
  }
  return out;
}
