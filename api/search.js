// Vercel Serverless Function: project semantic-search proxy for OpenRouter.
//
// Why a proxy? The OpenRouter API key MUST stay server-side. Putting it in
// app.js would expose it to anyone who views source. This function is the
// only thing that ever sees process.env.OPENROUTER_API_KEY.
//
// Setup:
//   1. Get an OpenRouter API key (https://openrouter.ai/keys).
//   2. In Vercel -> Project -> Settings -> Environment Variables, add:
//        OPENROUTER_API_KEY = sk-or-v1-...
//      Optional:
//        OPENROUTER_MODEL   = anthropic/claude-haiku-4.5  (default below)
//        OPENROUTER_REFERER = https://your-domain.example
//        OPENROUTER_TITLE   = Bangalore Site
//   3. Redeploy.
//
// Protocol:
//   POST /api/search
//   body: { query: "near metro, under 1.5cr, 3BHK" }
//   200: { matches: ["Project Name", ...], reason?: "...short rationale..." }
//   4xx/5xx: { error: "..." }
//
// Notes on key safety:
// - Key is read from process.env only; never echoed in responses.
// - We rate-limit by IP (best-effort, in-memory) and cap query length.
// - We send the FULL project list from server-side disk (data/projects.json),
//   not from the client, so a malicious caller can't make us spend tokens on
//   their own arbitrary payloads.

import fs from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_MODEL = 'anthropic/claude-haiku-4.5';
const MAX_QUERY_LEN = 240;
const MAX_MATCHES   = 40;
const RL_WINDOW_MS  = 60_000;   // 60s
const RL_MAX        = 20;       // 20 requests / IP / minute
const LLM_TIMEOUT_MS = 12_000;

// in-memory rate-limit bucket (resets per cold start; good enough for abuse damping)
const rl = new Map(); // ip -> [timestamps]

let projectsCache = null;
let projectsCacheAt = 0;
const PROJECTS_TTL = 5 * 60 * 1000; // 5 min

async function loadProjects() {
  if (projectsCache && (Date.now() - projectsCacheAt) < PROJECTS_TTL) return projectsCache;
  // Resolve relative to project root (Vercel deploys keep the file at /data/projects.json)
  const p = path.join(process.cwd(), 'data', 'projects.json');
  const raw = await fs.readFile(p, 'utf8');
  const parsed = JSON.parse(raw);
  projectsCache = parsed.projects.map((pr, i) => ({
    i,
    name: pr.name,
    builder: pr.builder,
    loc: pr.loc,
    type: pr.type,
    status: pr.status,
    price: pr.price,
    note: pr.note,
  }));
  projectsCacheAt = Date.now();
  return projectsCache;
}

function clientIp(req) {
  return (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown')
    .toString().split(',')[0].trim();
}

function rateLimited(ip) {
  const now = Date.now();
  const arr = (rl.get(ip) || []).filter(t => now - t < RL_WINDOW_MS);
  arr.push(now);
  rl.set(ip, arr);
  return arr.length > RL_MAX;
}

function buildPrompt(projects, query) {
  // We give the model a compact catalog. Each line is index|name|builder|loc|type|status|price|note(trim).
  // The model returns ONLY indexes — cheap output, easy to validate.
  const lines = projects.map(p =>
    [p.i, p.name, p.builder, p.loc, p.type, p.status, p.price, (p.note || '').slice(0, 180)]
      .map(x => String(x ?? '').replace(/\|/g, '/'))
      .join('|')
  ).join('\n');

  const sys =
    'You are a real-estate search filter for a Bangalore property map. ' +
    'Given a user query and a catalog (one project per line: index|name|builder|locality|type|status|price|note), ' +
    'return ONLY the indexes of projects that meaningfully match the intent of the query. ' +
    'Be generous on synonyms (e.g. "near airport" = Devanahalli/Yelahanka/Bagalur/Hennur/Jakkur/Shettigere; ' +
    '"IT corridor" = Whitefield/Sarjapur/ORR/Bellandur/Marathahalli/E-City; ' +
    '"affordable" = under ~1.2Cr or 1/2 BHK; "ready to move" / "under construction" = match status; ' +
    '"luxury" = 3+Cr or premium/ultra-luxury wording in note; ' +
    '"plots" / "villas" / "apartments" = match type). ' +
    'If the query is vague, return at most 25 best guesses. If nothing matches, return an empty array. ' +
    'Respond as STRICT JSON with shape: {"matches":[<integer indexes>],"reason":"<one short sentence>"}.';

  const user = `Query: ${query}\n\nCatalog (${projects.length} rows):\n${lines}`;

  return { sys, user };
}

async function callOpenRouter({ sys, user, model, referer, title }) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), LLM_TIMEOUT_MS);
  try {
    const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        // Optional but recommended by OpenRouter for attribution
        ...(referer ? { 'HTTP-Referer': referer } : {}),
        ...(title   ? { 'X-Title': title }      : {}),
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: sys },
          { role: 'user',   content: user },
        ],
        temperature: 0,
        max_tokens: 600,
        response_format: { type: 'json_object' },
      }),
    });
    if (!r.ok) {
      // Do NOT leak the upstream error body — could contain the request shape with key context.
      const code = r.status;
      throw new Error(`upstream_${code}`);
    }
    return await r.json();
  } finally {
    clearTimeout(timer);
  }
}

function parseLlmResponse(json, validCount) {
  const text = json?.choices?.[0]?.message?.content || '';
  let parsed;
  try { parsed = JSON.parse(text); }
  catch { return { matches: [], reason: '' }; }
  const matches = Array.isArray(parsed.matches) ? parsed.matches : [];
  const cleaned = [];
  const seen = new Set();
  for (const v of matches) {
    const n = typeof v === 'number' ? v : parseInt(v, 10);
    if (Number.isInteger(n) && n >= 0 && n < validCount && !seen.has(n)) {
      seen.add(n);
      cleaned.push(n);
      if (cleaned.length >= MAX_MATCHES) break;
    }
  }
  return { matches: cleaned, reason: String(parsed.reason || '').slice(0, 200) };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }
  if (!process.env.OPENROUTER_API_KEY) {
    res.status(503).json({ error: 'not_configured' });
    return;
  }

  const ip = clientIp(req);
  if (rateLimited(ip)) {
    res.status(429).json({ error: 'rate_limited' });
    return;
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const query = String(body.query || '').trim().slice(0, MAX_QUERY_LEN);
    if (query.length < 2) {
      res.status(400).json({ error: 'query_too_short' });
      return;
    }

    const projects = await loadProjects();
    const { sys, user } = buildPrompt(projects, query);
    const model = process.env.OPENROUTER_MODEL || DEFAULT_MODEL;
    const referer = process.env.OPENROUTER_REFERER || '';
    const title   = process.env.OPENROUTER_TITLE   || 'Bangalore Site';

    const json = await callOpenRouter({ sys, user, model, referer, title });
    const { matches, reason } = parseLlmResponse(json, projects.length);

    // Translate indexes -> names so the client doesn't depend on array order
    const names = matches.map(i => projects[i]?.name).filter(Boolean);

    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ matches: names, reason });
  } catch (e) {
    const msg = (e && e.message) || 'error';
    // Map known failure modes to safe codes
    if (msg === 'upstream_429') return res.status(429).json({ error: 'upstream_rate_limited' });
    if (msg.startsWith('upstream_'))  return res.status(502).json({ error: msg });
    if (e?.name === 'AbortError')     return res.status(504).json({ error: 'timeout' });
    res.status(500).json({ error: 'internal_error' });
  }
}
