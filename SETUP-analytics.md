# Analytics (PostHog) + the AI gate

## 1. PostHog project

1. Create a project at https://posthog.com (free tier is 1M events/month).
2. Copy the **Project API key** (`phc_...`). This key is public and write-only —
   it is designed to ship to the browser, so it is safe in page source.
3. In Vercel → Project → Settings → Environment Variables add:

   ```
   POSTHOG_KEY = phc_xxxxxxxxxxxxxxxx
   ```

4. Redeploy. `/api/config` picks it up at request time and defines
   `window.POSTHOG_KEY`; with the var unset, the loader never runs and the site
   behaves exactly as before. That is why local dev makes no analytics calls.

### Region

`vercel.json` proxies to the **US** cloud (`us.i.posthog.com`). On the EU cloud,
change the three `/ingest/*` rewrite destinations to `eu.i.posthog.com` /
`eu-assets.i.posthog.com`, and `ui_host` in the loader in `index.html`.

Note both regions are outside India. If you later route personal data through
PostHog (see masking below), that is a DPDP Act consideration worth a legal look.

### Why the proxy

Requests go to `flatmap.cloud/ingest/*` instead of `*.i.posthog.com`, so the
common ad-blocker lists don't silently drop a chunk of your traffic. The
rewrites are in `vercel.json` — they do **not** apply under
`scripts/dev-server.mjs`, which is fine because local dev has no key anyway.

## 2. What is captured

Autocapture is **off** on purpose: the map is SVG/canvas, so autocapture yields
useless selectors for pin clicks while eating the event quota. Everything
meaningful is captured explicitly via `track()` in `app.js`:

| Event | Properties | Answers |
|---|---|---|
| `$pageview` | (automatic) | traffic, sources |
| `locality_opened` | name, zone, metric | which areas have demand → who to sell to |
| `project_opened` | name, builder, status, type | which builders have demand → who to sell to |
| `overlay_toggled` | layer, on | which data layers earn their place |
| `heat_index_viewed` | – | is the heat index a draw? |
| `ai_search_started` | query_len, uses_left, unlocked | funnel top |
| `ai_search` | mode (ai/keyword), matches, ms, tool_calls, uses_left | **cost per search**, quality, latency |
| `ai_search_cancelled` | ms, tool_calls | are people giving up? how long do they wait? |
| `ai_gate_shown` | query_len, uses | how many reach the wall |
| `ai_gate_submitted` | query_len | **gate conversion rate** |
| `ai_gate_dismissed` | – | how many bounce off it |
| `lead_submitted` | kind | all capture forms, incl. `ai-unlock` |

`person_profiles: "identified_only"` — anonymous visitors don't create person
profiles, which keeps the bill down. `identifyUser(email)` runs on any lead
submit, so a person appears once they hand over an email.

Session replay is **not enabled**. If you turn it on, keep `maskAllInputs: true`
(already set in the loader) or you will record people typing their email.

## 3. The AI gate

Two free AI searches, then an email modal.

- Counter: `localStorage` `bv_ai_uses`; unlock flag `bv_ai_unlocked`.
- A use is only spent on a **successful AI answer** — a keyword fallback after
  an API error does not count against the visitor.
- After the first search the result line shows "1 free AI search left", so the
  wall is never a surprise.
- On unlock the pending query runs automatically, the lead posts to `/api/lead`
  with `kind: "ai-unlock"`, and the email flows into enhanced conversions and
  PostHog `identify` exactly like the other capture forms.

### This is a lead gate, not a paywall

It lives in `localStorage`. Anyone can clear it, and that is acceptable for
capturing an email. **It is not spend protection.** The only thing standing
between a scripted caller and your OpenRouter bill is the per-IP rate limit in
`api/search.js` (`RL_MAX` requests / `RL_WINDOW_MS`), and that limit is
in-memory: it resets on every cold start and is not shared across Vercel
instances. Before this gets real traffic, move it to a durable store
(Vercel KV / Upstash) keyed by IP.

Tune the allowance with `AI_FREE_USES` in `app.js`.

## 4. Local development

`npm run dev` serves the site and runs the `api/` handlers against `.env.local`.
Because that file holds **production** credentials, the dev server stubs the
routes that reach real external systems — `/api/lead`, `/api/cron/newsletter`,
`/api/cron/alerts` — and logs the payload instead. To exercise them for real:

```bash
ALLOW_REAL_SIDE_EFFECTS=1 npm run dev
```

Note that `/api/search` is *not* stubbed: it spends real OpenRouter credit.
