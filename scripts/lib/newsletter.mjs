// Build a weekly-newsletter draft from real repo data.
//
// Facts are computed deterministically (numbers are never hallucinated):
//   • price movers ← the DATA series in index.html (trailing-year % change)
//   • new launches ← data/projects.json (forward-looking statuses)
//   • market heat  ← data/overheat.json (verdict + indicator tally)
// The LLM (OpenRouter) writes ONLY the intro paragraph, constrained to the facts.
//
// Shared by scripts/make-newsletter.mjs (CLI) and api/cron/newsletter.mjs.

import { readFile, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadData } from './prices.mjs';
import { chat, hasLLM } from './openrouter.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

async function dataFile(name) {
  const candidates = [join(process.cwd(), 'data', name), join(HERE, '..', '..', 'data', name)];
  for (const p of candidates) { try { await access(p); return p; } catch { /* next */ } }
  return candidates[0];
}

export const fmt = (n) => '₹' + Number(n).toLocaleString('en-IN') + '/sqft';
const todayISO = () => new Date().toISOString().slice(0, 10);

// Trailing ~1-year % change from a locality's actual series.
function trailingYoY(loc) {
  const s = (loc.series || []).filter((p) => p && typeof p.price === 'number');
  if (s.length < 2) return null;
  const last = s[s.length - 1];
  const targetT = last.t - 1;
  let prev = s[0];
  for (const p of s) if (Math.abs(p.t - targetT) < Math.abs(prev.t - targetT)) prev = p;
  if (!prev.price) return null;
  return { pct: (last.price / prev.price - 1) * 100, now: last.price };
}

export async function computeFacts({ movers = 5, launches = 5 } = {}) {
  const DATA = await loadData();
  const projects = JSON.parse(await readFile(await dataFile('projects.json'), 'utf8'));
  const heat = JSON.parse(await readFile(await dataFile('overheat.json'), 'utf8'));

  const moverList = (DATA.localities || [])
    .map((l) => ({ name: l.name, zone: l.zone, drivers: l.drivers, ...(trailingYoY(l) || {}) }))
    .filter((m) => typeof m.pct === 'number')
    .sort((a, b) => b.pct - a.pct)
    .slice(0, movers)
    .map((m) => ({ name: m.name, zone: m.zone, now: m.now, yoyPct: +m.pct.toFixed(1), driver: (m.drivers || '').split(';')[0].trim() }));

  const fwd = new Set(['Pre-launch', 'Announced', 'Upcoming', 'Launched']);
  const launchList = (projects.projects || [])
    .filter((p) => fwd.has(p.status))
    .slice(-40).reverse()
    .slice(0, launches)
    .map((p) => ({ builder: p.builder, name: p.name, loc: p.loc, status: p.status, note: (p.note || '').split('.')[0].trim() }));

  const inds = heat.indicators || [];
  const tally = inds.reduce((o, i) => ((o[i.status] = (o[i.status] || 0) + 1), o), {});

  return {
    date: todayISO(),
    city: (DATA.meta?.city || 'Bengaluru').replace(/\s*\(.*\)\s*/, '').trim(),
    movers: moverList,
    launches: launchList,
    heat: { updated: heat.updated, mortgageRate: heat.mortgageRate, verdict: heat.verdict, tally, headline: inds.filter((i) => i.status === 'red').map((i) => i.name).slice(0, 3) },
    projectCount: projects.meta?.count || (projects.projects || []).length,
    localityCount: DATA.meta?.count || (DATA.localities || []).length,
  };
}

function fallbackIntro(f) {
  return `Here's your weekly read on ${f.city} real estate — the localities moving fastest, fresh launches from A-tier builders, and where the market sits on the heat scale.`;
}

// Render the full markdown deterministically given an intro paragraph.
export function renderMarkdown(f, intro) {
  const moverLines = f.movers.map((m) => `- **${m.name}** (${m.zone}) — ${fmt(m.now)}, +${m.yoyPct}% YoY${m.driver ? '. ' + m.driver : ''}`).join('\n');
  const launchLines = f.launches.map((l) => `- **${l.builder} — ${l.name}**, ${l.loc} _(${l.status})_${l.note ? '. ' + l.note : ''}`).join('\n');
  const t = f.heat.tally || {};
  const heatLine = `${f.heat.verdict} _(indicators: ${t.red || 0} red / ${t.amber || 0} amber / ${t.green || 0} green; typical home-loan rate ~${f.heat.mortgageRate}; updated ${f.heat.updated}.)_`;
  return `# This week in ${f.city} property

${intro}

## 📈 Price movers
${moverLines}

## 🏗️ New launches & construction
${launchLines}

## 🌡️ Market heat
${heatLine}

See the live panel: [flatmap.cloud/heat](https://flatmap.cloud/heat).

## 🔗 Worth a look
- [Compare localities](https://flatmap.cloud/compare)
- [Browse all ${f.projectCount} projects](https://flatmap.cloud/projects)

_That's it for this week. Reply with what you'd like to see next._
`;
}

async function llmIntro(f, model) {
  const sys = 'You write the opening for a weekly Bengaluru real-estate newsletter. '
    + 'Given pre-computed FACTS as JSON, write ONLY a 2-3 sentence intro paragraph (plain text, no heading, no bullets, no markdown links). '
    + 'Ground it strictly in the facts — the fastest-moving localities, the launch activity, and the market-heat verdict. '
    + 'Do not invent numbers; you may reference at most one or two figures verbatim from the facts. Tone: crisp, informed, not salesy.';
  const { text, model: used } = await chat({
    messages: [{ role: 'system', content: sys }, { role: 'user', content: 'FACTS:\n' + JSON.stringify(f, null, 2) }],
    model, temperature: 0.5, maxTokens: 400,
  });
  return { intro: text.trim().replace(/^#+\s.*$/gm, '').trim(), model: used };
}

// Full draft pipeline. Returns { markdown, facts, subject, via }.
export async function buildNewsletter({ movers, launches, noLlm = false, model } = {}) {
  const facts = await computeFacts({ movers, launches });
  let intro = fallbackIntro(facts), via;
  if (!noLlm && hasLLM()) {
    try {
      const { intro: text, model: used } = await llmIntro(facts, model);
      if (text.length > 40) { intro = text; via = `LLM intro (${used}) + auto-filled data`; }
      else via = 'deterministic intro (LLM output too short) + auto-filled data';
    } catch (e) {
      via = `deterministic intro (LLM failed: ${e.message}) + auto-filled data`;
    }
  } else {
    via = (noLlm ? 'deterministic intro (--no-llm)' : 'deterministic intro (no OPENROUTER_API_KEY)') + ' + auto-filled data';
  }
  return { markdown: renderMarkdown(facts, intro), facts, subject: `This week in ${facts.city} property`, via };
}
