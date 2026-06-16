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

import fs from "node:fs/promises";
import path from "node:path";
import "dotenv/config";

const DEFAULT_MODEL = "google/gemini-3.1-flash-lite";
const MAX_QUERY_LEN = 240;
const MAX_MATCHES = 40;
const RL_WINDOW_MS = 60_000; // 60s
const RL_MAX = 20; // 20 requests / IP / minute
const LLM_TIMEOUT_MS = 20_000; // per upstream call (gpt-5-mini reasoning can be slow)
const AGENT_WALL_MS = 50_000;  // total wall-clock budget for one request
const AGENT_MAX_ITER = 5;      // max LLM round-trips per request
const AGENT_MAX_TOOLS = 20;    // hard cap on tool calls per request
const OSRM_BASE = "https://router.project-osrm.org";

// --- known Bangalore landmarks (lowercase keys; values are [lat, lng]) ---
// The agent can fetch these via the landmark_coords tool. Add freely.
const LANDMARKS = {
  airport: [13.1986, 77.7066],
  "kempegowda airport": [13.1986, 77.7066],
  "bangalore airport": [13.1986, 77.7066],
  kia: [13.1986, 77.7066],
  bial: [13.1986, 77.7066],

  "manyata tech park": [13.0480, 77.6217],
  manyata: [13.0480, 77.6217],
  itpl: [12.9858, 77.7370],
  "whitefield itpl": [12.9858, 77.7370],
  "embassy tech village": [12.9302, 77.6916],
  "rmz ecoworld": [12.9251, 77.6855],
  "salarpuria knowledge city": [12.9230, 77.6840],
  "ecospace": [12.9263, 77.6886],
  "global village tech park": [12.9242, 77.5118],

  "mg road": [12.9756, 77.6063],
  "m.g. road": [12.9756, 77.6063],
  cbd: [12.9756, 77.6063],
  brigade: [12.9728, 77.6069],
  "brigade road": [12.9728, 77.6069],
  "majestic": [12.9774, 77.5712],
  "kempegowda bus station": [12.9774, 77.5712],
  "city railway station": [12.9777, 77.5685],

  "electronic city": [12.8451, 77.6602],
  "e-city": [12.8451, 77.6602],
  ecity: [12.8451, 77.6602],

  "outer ring road": [12.9351, 77.6826],
  orr: [12.9351, 77.6826],
  "sarjapur road": [12.9069, 77.6985],
  "sarjapur main road": [12.9069, 77.6985],
  "bannerghatta road": [12.8900, 77.5970],
  "kanakapura road": [12.8800, 77.5400],
  "hosur road": [12.8800, 77.6500],
  "old madras road": [13.0220, 77.7080],
  "old airport road": [12.9450, 77.6720],
  "mysore road": [12.9425, 77.5093],
  "tumkur road": [13.0608, 77.4825],

  // localities (centroids)
  whitefield: [12.9698, 77.7500],
  sarjapur: [12.8589, 77.7858],
  devanahalli: [13.2484, 77.7117],
  yelahanka: [13.1007, 77.5963],
  hebbal: [13.0357, 77.5970],
  "hsr layout": [12.9082, 77.6476],
  "jp nagar": [12.9082, 77.5855],
  banashankari: [12.9250, 77.5470],
  koramangala: [12.9352, 77.6245],
  indiranagar: [12.9719, 77.6412],
  jayanagar: [12.9290, 77.5830],
  malleshwaram: [13.0035, 77.5709],
  rajajinagar: [12.9899, 77.5512],
  marathahalli: [12.9560, 77.7010],
  bellandur: [12.9258, 77.6764],
  hennur: [13.0560, 77.6444],
  bommanahalli: [12.8920, 77.6190],

  "cubbon park": [12.9762, 77.5928],
  lalbagh: [12.9507, 77.5848],
  "forum mall": [12.9343, 77.6101],
};

function findLandmark(raw) {
  const k = String(raw || "").toLowerCase().trim();
  if (!k) return null;
  if (LANDMARKS[k]) return { name: k, lat: LANDMARKS[k][0], lng: LANDMARKS[k][1] };
  // loose fuzzy contains
  for (const [key, [lat, lng]] of Object.entries(LANDMARKS)) {
    if (k.includes(key) || key.includes(k)) return { name: key, lat, lng };
  }
  return null;
}

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

let metroStationsCache = null;
async function loadMetroStations() {
  if (metroStationsCache) return metroStationsCache;
  const p = path.join(process.cwd(), "data", "metro.json");
  const raw = await fs.readFile(p, "utf8");
  const parsed = JSON.parse(raw);
  const out = [];
  for (const line of parsed.lines || []) {
    for (const s of line.stations || []) {
      out.push({ n: s.n, lat: s.lat, lng: s.lng, line: line.name, st: s.st });
    }
  }
  metroStationsCache = out;
  return out;
}

// OSRM public demo: 'driving' or 'foot' (walking) profiles. Returns { minutes, km } or { error }.
async function osrmRoute(fromLat, fromLng, toLat, toLng, profile) {
  const prof = profile === "walking" ? "foot" : "driving";
  // OSRM: /route/v1/{profile}/{lng,lat;lng,lat}
  const url = `${OSRM_BASE}/route/v1/${prof}/${fromLng},${fromLat};${toLng},${toLat}?overview=false&alternatives=false`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 6000);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    if (!r.ok) return { error: "osrm_" + r.status };
    const j = await r.json();
    const route = j?.routes?.[0];
    if (!route) return { error: "no_route" };
    return {
      minutes: Math.round(route.duration / 60),
      km: +(route.distance / 1000).toFixed(1),
      profile: prof,
    };
  } catch (e) {
    return { error: e?.name === "AbortError" ? "osrm_timeout" : "osrm_error" };
  } finally {
    clearTimeout(t);
  }
}

// --- tool schema sent to the LLM ---
const TOOLS = [
  {
    type: "function",
    function: {
      name: "landmark_coords",
      description:
        "Look up lat/lng of a known Bangalore landmark (airport, ITPL, Manyata, MG Road, Majestic, Electronic City, ORR, Forum Mall, locality names, etc). Returns { name, lat, lng } or { error: 'not_found' }.",
      parameters: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description:
              "Landmark name. Examples: 'airport', 'manyata tech park', 'itpl', 'mg road', 'electronic city', 'whitefield', 'cubbon park'.",
          },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "haversine_km",
      description:
        "Straight-line distance in km between two coordinates. Fast, no network. Good first-pass filter before calling route_minutes.",
      parameters: {
        type: "object",
        properties: {
          lat1: { type: "number" },
          lng1: { type: "number" },
          lat2: { type: "number" },
          lng2: { type: "number" },
        },
        required: ["lat1", "lng1", "lat2", "lng2"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "route_minutes",
      description:
        "Real-road driving or walking time in minutes between two coordinates via OSRM. Slow (~300ms-1s) — only use when straight-line distance is ambiguous or the user explicitly asked about driving/walking time.",
      parameters: {
        type: "object",
        properties: {
          from_lat: { type: "number" },
          from_lng: { type: "number" },
          to_lat: { type: "number" },
          to_lng: { type: "number" },
          profile: { type: "string", enum: ["driving", "walking"] },
        },
        required: ["from_lat", "from_lng", "to_lat", "to_lng", "profile"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "nearest_metro",
      description:
        "Find the nearest metro station to a coordinate. Returns { name, line, status, km } where status is 'op' (operational), 'uc' (under construction) or 'pp' (planned).",
      parameters: {
        type: "object",
        properties: {
          lat: { type: "number" },
          lng: { type: "number" },
        },
        required: ["lat", "lng"],
      },
    },
  },
];

async function executeTool(name, args) {
  try {
    if (name === "landmark_coords") {
      const f = findLandmark(args?.name);
      return f || { error: "not_found" };
    }
    if (name === "haversine_km") {
      const { lat1, lng1, lat2, lng2 } = args || {};
      if ([lat1, lng1, lat2, lng2].some((v) => typeof v !== "number"))
        return { error: "bad_args" };
      return { km: +haversineKm(lat1, lng1, lat2, lng2).toFixed(2) };
    }
    if (name === "route_minutes") {
      const { from_lat, from_lng, to_lat, to_lng, profile } = args || {};
      if ([from_lat, from_lng, to_lat, to_lng].some((v) => typeof v !== "number"))
        return { error: "bad_args" };
      return await osrmRoute(from_lat, from_lng, to_lat, to_lng, profile || "driving");
    }
    if (name === "nearest_metro") {
      const { lat, lng } = args || {};
      if (typeof lat !== "number" || typeof lng !== "number")
        return { error: "bad_args" };
      const stations = await loadMetroStations();
      let best = null;
      for (const s of stations) {
        const km = haversineKm(lat, lng, s.lat, s.lng);
        if (!best || km < best.km)
          best = { name: s.n, line: s.line, status: s.st, km: +km.toFixed(2) };
      }
      return best || { error: "no_metro" };
    }
    return { error: "unknown_tool" };
  } catch (e) {
    return { error: "tool_error: " + String(e?.message || e).slice(0, 120) };
  }
}

// in-memory rate-limit bucket (resets per cold start; good enough for abuse damping)
const rl = new Map(); // ip -> [timestamps]

let projectsCache = null;
let projectsCacheAt = 0;
const PROJECTS_TTL = 5 * 60 * 1000; // 5 min

console.log("OPENROUTER_API_KEY set?", !!process.env.OPENROUTER_API_KEY);

async function loadProjects() {
  if (projectsCache && Date.now() - projectsCacheAt < PROJECTS_TTL)
    return projectsCache;
  const p = path.join(process.cwd(), "data", "projects.json");
  const raw = await fs.readFile(p, "utf8");
  const parsed = JSON.parse(raw);
  projectsCache = parsed.projects.map((pr, i) => ({
    i,
    name: pr.name,
    builder: pr.builder,
    loc: pr.loc,
    lat: pr.lat,
    lng: pr.lng,
    type: pr.type,
    status: pr.status,
    price: pr.price,
    note: pr.note,
  }));
  projectsCacheAt = Date.now();
  return projectsCache;
}

function clientIp(req) {
  return (
    req.headers["x-forwarded-for"] ||
    req.socket?.remoteAddress ||
    "unknown"
  )
    .toString()
    .split(",")[0]
    .trim();
}

function rateLimited(ip) {
  const now = Date.now();
  const arr = (rl.get(ip) || []).filter((t) => now - t < RL_WINDOW_MS);
  arr.push(now);
  rl.set(ip, arr);
  return arr.length > RL_MAX;
}

function buildPrompt(projects, query) {
  // Catalog row format: index|name|builder|locality|lat|lng|type|status|price|note(<=160 chars).
  // The model gets coords inline so it can pass them to distance tools without lookups.
  const lines = projects
    .map((p) =>
      [
        p.i,
        p.name,
        p.builder,
        p.loc,
        p.lat,
        p.lng,
        p.type,
        p.status,
        p.price,
        (p.note || "").slice(0, 160),
      ]
        .map((x) => String(x ?? "").replace(/\|/g, "/"))
        .join("|"),
    )
    .join("\n");

  const sys =
    "You are a real-estate search filter for a Bangalore property map. " +
    "Given a user query and a catalog (one project per line: index|name|builder|locality|lat|lng|type|status|price|note), " +
    "select the project indexes that match the user's intent. " +
    "\n\nYou have tools available for distance/time queries:" +
    "\n- landmark_coords(name): look up a landmark's lat/lng (airport, ITPL, MG Road, etc.)" +
    "\n- haversine_km(lat1,lng1,lat2,lng2): cheap straight-line distance" +
    "\n- route_minutes(from,to,profile): real driving or walking minutes via OSRM (slower; only when needed)" +
    "\n- nearest_metro(lat,lng): nearest metro station + km" +
    "\n\nWhen to use tools (BE FRUGAL — strict budget of 20 tool calls TOTAL across the whole conversation):" +
    "\n- For text-only queries ('luxury whitefield', 'sobha plots', 'plots near metro station'), DO NOT call tools. Use the lat/lng + locality fields in the catalog to reason directly. The catalog already lists status, type, locality and coordinates." +
    "\n- Only call route_minutes when the user explicitly asks 'X minutes drive/walk'. Even then: call haversine_km on no more than 15 candidates first to short-list to ~6, then route_minutes on those 6 only." +
    "\n- Use landmark_coords at most once per landmark mentioned." +
    "\n- Use nearest_metro at most 6 times per query. For 'near metro station', you can usually short-list using haversine_km from a small set of major stations rather than nearest_metro on every project." +
    "\n\nSynonym hints (helpful when no tool needed): " +
    "'near airport' = Devanahalli/Yelahanka/Bagalur/Hennur/Jakkur/Shettigere; " +
    "'IT corridor' = Whitefield/Sarjapur/ORR/Bellandur/Marathahalli/E-City; " +
    "'affordable' = under ~1.2 Cr or 1/2 BHK; " +
    "'luxury' = 3+ Cr or premium/ultra-luxury wording; " +
    "'ready to move' / 'under construction' = match the status field. " +
    "\n\nWhen done, respond with STRICT JSON ONLY (no prose, no code fences): " +
    '{"matches":[<integer indexes>],"reason":"<one sentence on what you matched and why>"} ' +
    "If nothing matches, return an empty matches array. Cap matches at 40.";

  const user = `Query: ${query}\n\nCatalog (${projects.length} rows):\n${lines}`;

  return { sys, user };
}

// Single OpenRouter chat-completion call. Pass `tools: TOOLS` to allow tool calls;
// pass `forceJson: true` on the final turn to demand JSON-only output.
async function openRouterTurn({ messages, model, referer, title, withTools, forceJson }) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), LLM_TIMEOUT_MS);
  const body = {
    model,
    messages,
    temperature: 0,
    max_tokens: forceJson ? 2000 : 4000,
    // Pin OpenRouter to the exact model we asked for. Without this it can
    // silently fall back to whatever provider it likes (Mercury, etc.),
    // which breaks tool calling + strict-JSON contracts.
    provider: {
      allow_fallbacks: false,
    },
  };
  if (withTools) {
    body.tools = TOOLS;
    body.tool_choice = "auto";
    // Note: parallel_tool_calls is OpenAI-specific. Leaving it off keeps the
    // request portable across providers (Anthropic, Google, etc.).
  }
  if (forceJson) body.response_format = { type: "json_object" };
  console.log(
    `[openrouter] sending model=${model} withTools=${!!withTools} forceJson=${!!forceJson} msgs=${messages.length}`
  );
  try {
    const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        ...(referer ? { "HTTP-Referer": referer } : {}),
        ...(title ? { "X-Title": title } : {}),
      },
      body: JSON.stringify(body),
    });
    if (!r.ok) {
      // Pull the error body for visibility (not echoed to client).
      const errText = await r.text().catch(() => "");
      console.log(`[openrouter] upstream_${r.status}: ${errText.slice(0, 300)}`);
      throw new Error(`upstream_${r.status}`);
    }
    const j = await r.json();
    console.log(
      `[openrouter] returned model=${j?.model} finish=${j?.choices?.[0]?.finish_reason} tool_calls=${j?.choices?.[0]?.message?.tool_calls?.length || 0}`
    );
    return j;
  } finally {
    clearTimeout(timer);
  }
}

// Run the agent: call the LLM with tools, execute any tool_calls, loop until
// it returns a final assistant message with no tool_calls (or we hit a cap).
// Returns { content, trace } where content is the final JSON string and trace
// is a short list of tool invocations for debugging.
async function runAgent({ sys, user, model, referer, title }) {
  const startedAt = Date.now();
  const trace = [];
  const messages = [
    { role: "system", content: sys },
    { role: "user", content: user },
  ];
  let totalToolCalls = 0;

  for (let iter = 0; iter < AGENT_MAX_ITER; iter++) {
    const elapsed = Date.now() - startedAt;
    if (elapsed > AGENT_WALL_MS) {
      trace.push({ note: "wall_clock_exceeded", elapsed });
      break;
    }
    // On the last iteration, force JSON-only output (no more tool round-trips).
    const isFinal = iter === AGENT_MAX_ITER - 1 || totalToolCalls >= AGENT_MAX_TOOLS;
    const j = await openRouterTurn({
      messages,
      model,
      referer,
      title,
      withTools: !isFinal,
      forceJson: isFinal,
    });
    const choice = j?.choices?.[0];
    const msg = choice?.message;
    if (!msg) {
      trace.push({ iter, note: "no_message", finish: choice?.finish_reason });
      break;
    }
    // Push the assistant message verbatim (must include tool_calls for the next turn to be valid).
    messages.push(msg);

    const toolCalls = Array.isArray(msg.tool_calls) ? msg.tool_calls : [];
    if (toolCalls.length === 0) {
      // Final assistant message
      trace.push({ iter, finish: choice.finish_reason, tools: 0 });
      return { content: msg.content || "", trace };
    }

    // Execute tool calls in parallel
    const results = await Promise.all(
      toolCalls.map(async (tc) => {
        totalToolCalls++;
        if (totalToolCalls > AGENT_MAX_TOOLS) {
          return { tc, out: { error: "tool_call_cap" } };
        }
        let args = {};
        try { args = JSON.parse(tc.function?.arguments || "{}"); } catch {}
        const t0 = Date.now();
        const out = await executeTool(tc.function?.name, args);
        trace.push({
          iter,
          tool: tc.function?.name,
          args,
          out,
          ms: Date.now() - t0,
        });
        return { tc, out };
      })
    );
    for (const { tc, out } of results) {
      messages.push({
        role: "tool",
        tool_call_id: tc.id,
        content: JSON.stringify(out).slice(0, 4000),
      });
    }
  }
  // We reached the cap without a clean final answer. Try one last forced-JSON turn.
  try {
    const j = await openRouterTurn({
      messages: [
        ...messages,
        { role: "user", content: "Tool/iteration cap reached. Respond now with the final JSON only." },
      ],
      model,
      referer,
      title,
      withTools: false,
      forceJson: true,
    });
    const c = j?.choices?.[0]?.message?.content || "";
    trace.push({ note: "forced_final" });
    return { content: c, trace };
  } catch (e) {
    trace.push({ note: "forced_final_failed", error: String(e?.message || e) });
    return { content: "", trace };
  }
}

function parseAgentContent(text, validCount) {
  let parsed = null;
  // 1. strict parse
  if (text) {
    try { parsed = JSON.parse(text); } catch {}
  }
  // 2. extract first {...} block (handles "Here it is: { ... }" or trailing junk)
  if (!parsed && text) {
    const m = text.match(/\{[\s\S]*\}/);
    if (m) { try { parsed = JSON.parse(m[0]); } catch {} }
  }
  // 3. last resort: pull integers from text
  if (!parsed && text) {
    const ints = [...text.matchAll(/\b(\d{1,3})\b/g)].map((m) => +m[1]);
    parsed = { matches: ints, reason: "" };
  }
  if (!parsed) parsed = { matches: [], reason: "" };
  const matches = Array.isArray(parsed.matches) ? parsed.matches : [];
  const cleaned = [];
  const seen = new Set();
  for (const v of matches) {
    const n = typeof v === "number" ? v : parseInt(v, 10);
    if (Number.isInteger(n) && n >= 0 && n < validCount && !seen.has(n)) {
      seen.add(n);
      cleaned.push(n);
      if (cleaned.length >= MAX_MATCHES) break;
    }
  }
  return {
    matches: cleaned,
    reason: String(parsed.reason || "").slice(0, 200),
  };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }
  if (!process.env.OPENROUTER_API_KEY) {
    res.status(503).json({ error: "not_configured" });
    return;
  }

  const ip = clientIp(req);
  if (rateLimited(ip)) {
    res.status(429).json({ error: "rate_limited" });
    return;
  }

  try {
    const body =
      typeof req.body === "string"
        ? JSON.parse(req.body || "{}")
        : req.body || {};
    const query = String(body.query || "")
      .trim()
      .slice(0, MAX_QUERY_LEN);
    if (query.length < 2) {
      res.status(400).json({ error: "query_too_short" });
      return;
    }

    const projects = await loadProjects();
    const { sys, user } = buildPrompt(projects, query);

    // Resolve model. Guard against bad providers that don't honor the tools +
    // strict-JSON contract (we've been losing to Mercury via env overrides).
    const envModel = process.env.OPENROUTER_MODEL;
    const BLOCKED = /(^|\/)(inception|mercury)\b/i;
    let model = envModel || DEFAULT_MODEL;
    let modelSource = envModel ? "env" : "default";
    if (BLOCKED.test(model)) {
      console.log(
        `[search] WARNING: env OPENROUTER_MODEL='${envModel}' is blocked (no tool support). Forcing ${DEFAULT_MODEL}.`
      );
      model = DEFAULT_MODEL;
      modelSource = "forced_default";
    }
    console.log(
      `[search] env.OPENROUTER_MODEL=${envModel} resolved=${model} source=${modelSource}`
    );

    const referer = process.env.OPENROUTER_REFERER || "";
    const title = process.env.OPENROUTER_TITLE || "Bangalore Site";

    const { content, trace } = await runAgent({ sys, user, model, referer, title });
    const { matches, reason } = parseAgentContent(content, projects.length);

    // Translate indexes -> names so the client doesn't depend on array order
    const names = matches.map((i) => projects[i]?.name).filter(Boolean);

    // One-line summary log for the dev terminal
    const toolSummary = trace
      .filter((t) => t.tool)
      .map((t) => `${t.tool}(${t.ms || 0}ms)`)
      .join(", ");
    console.log(
      `[search] q=${JSON.stringify(query)} model=${model} matches=${names.length} tools=[${toolSummary}]`
    );

    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({ matches: names, reason });
  } catch (e) {
    const msg = (e && e.message) || "error";
    // Map known failure modes to safe codes
    if (msg === "upstream_429")
      return res.status(429).json({ error: "upstream_rate_limited" });
    if (msg.startsWith("upstream_"))
      return res.status(502).json({ error: msg });
    if (e?.name === "AbortError")
      return res.status(504).json({ error: "timeout" });
    res.status(500).json({ error: "internal_error" });
  }
}
