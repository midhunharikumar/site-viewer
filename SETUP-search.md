# AI project search — setup

The "New builds" panel has a search box with two modes:

- **As you type** → free, instant, all in the browser. A token-based fuzzy match against name, builder, locality, type, status, price, and the note field.
- **Press Enter / Ask AI** → sends the query to OpenRouter through a Vercel serverless function (`api/search.js`) for natural-language matching ("near airport under 1.5 Cr", "ready to move in Whitefield IT corridor", "Japanese-themed apartments", etc.). Non-matching markers are dimmed; matches are highlighted with a yellow ring.

The page works fully without the AI step — if the env var below isn't set, the proxy returns 503 and the UI gracefully falls back to keyword matching.

## API key safety

The OpenRouter API key **never** reaches the browser. It lives only in a Vercel environment variable that's read by `api/search.js` at runtime. The browser only ever talks to `/api/search` on the same origin — it has no idea OpenRouter is on the other end.

Other safety measures already in the proxy:

- Per-IP rate limiting (20 req / 60s, in-memory).
- Query length cap (240 chars) and minimum length (2).
- The project catalog sent to the LLM is loaded **server-side** from `data/projects.json`, not from the client — so a malicious caller can't make us spend tokens on their own payload.
- Strict JSON output via `response_format: { type: 'json_object' }`.
- Output is validated: only integer indexes in range, capped at 40 results, deduped, then mapped back to project names.
- `Cache-Control: no-store` on responses.
- 12s upstream timeout (`AbortController`).
- Errors are mapped to safe codes (`upstream_502`, `timeout`, `rate_limited`) — upstream error bodies are not echoed.

## Vercel setup

1. Get an OpenRouter API key: https://openrouter.ai/keys
2. In **Vercel → your project → Settings → Environment Variables**, add:

   | Key                  | Value                                            | Required |
   | -------------------- | ------------------------------------------------ | -------- |
   | `OPENROUTER_API_KEY` | `sk-or-v1-...`                                   | yes      |
   | `OPENROUTER_MODEL`   | `anthropic/claude-haiku-4.5` (default if unset)  | no       |
   | `OPENROUTER_REFERER` | `https://your-domain.example`                    | no       |
   | `OPENROUTER_TITLE`   | `Bangalore Site`                                 | no       |

3. Redeploy.

Recommended models (cheap + fast, good enough for filtering 156 short rows):

- `anthropic/claude-haiku-4.5` ← default
- `openai/gpt-5-mini`
- `google/gemini-2.5-flash`

If you switch to a bigger model (Sonnet / GPT-5 / Gemini Pro) the queries get smarter on nuanced asks ("good for young families with parks"), but per-search cost goes up roughly 5–10×.

## Cost ballpark

Each AI search sends ~7 KB of catalog as input and gets back ~50 tokens of output. With Haiku-4.5 that's roughly **$0.001 per search**. The keyword fallback is free.

## Local testing

```
vercel dev
# then open http://localhost:3000 and try a query
```

Without `OPENROUTER_API_KEY` set, `/api/search` returns 503 and the UI shows
"AI search not configured — using keyword match", then proceeds with the
keyword filter. Useful for local dev.

## Removing the feature

To roll back: delete `api/search.js`, remove the `projSearch` CSS block and
`projpin.hit/projpin.dim` styles from `index.html`, and restore the simpler
`buildProjectsLegend()` / `refreshProjects()` in `app.js` from git history
(they're the only changes in that section).
