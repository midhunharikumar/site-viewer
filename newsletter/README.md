# Weekly newsletter drafts

> **Automation:** a Vercel Cron sends a freshly-generated newsletter every Saturday
> morning automatically (see `../SETUP-email.md` §4). The steps below are for
> generating/sending **manually** (testing or ad-hoc issues).

## Fastest path: generate a draft from real data
`npm run draft` builds `newsletter/<today>.md` for you — price movers, new launches,
and the market-heat verdict are auto-filled from the repo's real data
(`index.html`, `data/projects.json`, `data/overheat.json`), and the **intro** is written
by the LLM (OpenRouter / Gemini, using `OPENROUTER_API_KEY`). Only the intro is
LLM-generated; every number/name comes straight from the data, so it can't be misquoted.

```bash
npm run draft                  # writes newsletter/<today>.md (LLM intro if key set)
npm run draft -- --no-llm      # skip the LLM, deterministic intro
npm run draft -- --movers 6 --launches 5
npm run draft -- --model anthropic/claude-haiku-4.5   # override the model
```

Then **review/edit** the generated file and send it (see below).

## Or write it by hand
Copy `TEMPLATE.md` to e.g. `2026-06-26.md` and edit. Then send it with the Mailgun script:

```bash
# 1. Always preview first (dry-run, no email sent)
npm run newsletter -- --draft newsletter/2026-06-26.md --subject "This week in Bengaluru property"

# 2. Send a test to yourself
npm run newsletter -- --draft newsletter/2026-06-26.md --subject "Test" --to you@email.com --send

# 3. Send to the whole 'report' list
npm run newsletter -- --draft newsletter/2026-06-26.md --subject "This week in Bengaluru property" --send
```

- `.md` files get a tiny markdown→HTML conversion (headings, bold/italic, links, lists).
  You can also write a `.html` file directly — it's sent as-is inside the email shell.
- Recipients come from the `report` rows in the Google Sheet (or `--csv <export.csv>`).
- See `../SETUP-email.md` for env setup and the subscriber read-back step.
