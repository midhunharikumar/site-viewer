# AI project search — setup

The "New builds" panel has a search box with two modes:

- **As you type** → free, instant, all in the browser. Token-based fuzzy match against name, builder, locality, type, status, price, and the note field.
- **Press Enter / Ask AI** → sends the query to `/api/search`, a Vercel serverless function. The function runs an **agent loop**: it calls OpenRouter with a set of distance/landmark tools and lets the model invoke them until it has enough context to return final matches. Non-matching markers are dimmed; matches are highlighted with a yellow ring.

The page works fully without the AI step — if the env var below isn't set, the proxy returns 503 and the UI gracefully falls back to keyword matching.

## What the agent can do

The serverless function (`api/search.js`) exposes these tools to the LLM:

| Tool | Purpose | Latency |
| --- | --- | --- |
| `landmark_coords(name)` | Lookup lat/lng for known Bangalore landmarks (airport, ITPL, Manyata, MG Road, Forum Mall, locality centroids, etc.) | <1 ms |
| `haversine_km(lat1,lng1,lat2,lng2)` | Straight-line distance | <1 ms |
| `route_minutes(from,to,profile)` | Real driving / walking time via **OSRM public demo** (`router.project-osrm.org`) | ~300 ms – 1 s |
| `nearest_metro(lat,lng)` | Closest station from `data/metro.json` + km | <2 ms |

The model can decide which to call. The system prompt nudges it to short-list with `haversine_km` first and only call `route_minutes` on the top candidates — `route_minutes` is the slow tool and we don't want it hitting OSRM 156 times.

Example queries the agent now handles well:

- *within 30 min drive of airport*
- *walking distance from any metro station*
- *under 1.5 Cr and ≤25 km from Manyata Tech Park*
- *Sobha projects near ORR*
- *plots within 10 km of Devanahalli*

## Safety / cost caps

In `api/search.js`:

- `AGENT_MAX_ITER = 8` — max LLM round-trips per request
- `AGENT_MAX_TOOLS = 30` — hard cap on tool calls per request
- `AGENT_WALL_MS = 25_000` — overall wall-clock budget
- `LLM_TIMEOUT_MS = 12_000` — per upstream call
- `RL_MAX = 20` requests / IP / 60 s (in-memory)
- `MAX_QUERY_LEN = 240` chars

A typical query takes 1–3 agent iterations (~3–5 s end to end). Distance-heavy queries can take 4–6 (~6–10 s).

## API key safety

The OpenRouter API key **never** reaches the browser. It lives only in a Vercel environment variable read by `api/search.js`. The browser only ever talks to same-origin `/api/search`.

Additional hardening:

- Catalog sent to the LLM is loaded **server-side** from `data/projects.json` — no client-supplied payloads.
- Strict JSON output on the final turn (`response_format: json_object`).
- Output validated: only in-range integer indexes, capped at 40, deduped, then mapped to project names.
- `Cache-Control: no-store` on responses.
- Upstream error bodies are not echoed — only safe codes (`upstream_502`, `timeout`, `rate_limited`).
- OSRM calls are short-lived (`AbortController`, 6 s).

## Vercel setup

1. Get an OpenRouter API key: https://openrouter.ai/keys
2. In **Vercel → your project → Settings → Environment Variables**, add:

   | Key                  | Value                                            | Required |
   | -------------------- | ------------------------------------------------ | -------- |
   | `OPENROUTER_API_KEY` | `sk-or-v1-...`                                   | yes      |
   | `OPENROUTER_MODEL`   | `google/gemini-3.1-flash-lite` (default if unset) | no       |
   | `OPENROUTER_REFERER` | `https://your-domain.example`                    | no       |
   | `OPENROUTER_TITLE`   | `Bangalore Site`                                 | no       |

3. Redeploy.

### Model choice

Tools need a model that follows the OpenAI-style `tools` schema reliably. Tested-good defaults:

- `google/gemini-3.1-flash-lite` ← default (cheap, fast, good tool calling)
- `openai/gpt-5-mini`
- `anthropic/claude-haiku-4.5`

Avoid Mercury / diffusion models — they don't support tool calls cleanly and have produced empty results in testing.

## Local dev

Create `.env.local` in the repo root (do **not** commit; add to `.gitignore`):

```
OPENROUTER_API_KEY=sk-or-v1-...
OPENROUTER_MODEL=google/gemini-3.1-flash-lite
```

Then:
```
npx vercel dev
```

`vercel dev` auto-loads `.env.local`. The file also requires `dotenv` since `api/search.js` does `import 'dotenv/config'` for belt-and-suspenders loading:
```
npm i dotenv
```

Quick test:
```
curl -sS -X POST http://localhost:3000/api/search \
  -H "Content-Type: application/json" \
  -d '{"query":"within 30 min drive of airport"}' | jq
```

Watch the `vercel dev` terminal — you'll see a one-line summary per request:
```
[search] q="within 30 min drive of airport" model=openai/gpt-5-mini matches=12 tools=[landmark_coords(0ms), haversine_km(0ms), haversine_km(0ms), route_minutes(412ms), route_minutes(389ms), ...]
```

## Cost ballpark

- Text-only queries (no tool calls): ~$0.0005 per search with gpt-5-mini.
- Distance queries (3–8 tool calls): ~$0.002–0.005 per search.
- OSRM is free.

## Removing the feature

To roll back: delete `api/search.js`, remove the `projSearch` CSS block and `projpin.hit/projpin.dim` styles from `index.html`, and restore the simpler `buildProjectsLegend()` / `refreshProjects()` in `app.js` from git history.
