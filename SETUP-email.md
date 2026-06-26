# Sending: price alerts + weekly newsletter (via Mailgun)

Capturing signups already works (see `SETUP-leads.md`): the price-alert and report
forms write to a Google Sheet. This doc covers the **sending** side. There are two
ways it runs:

- **Automated (Vercel Cron)** — both emails go out **every Saturday morning** with no
  manual step. See [§4](#4-automated-weekly-send-vercel-cron).
- **Manual (local CLI)** — the same logic on demand from your machine, dry-run by
  default. Useful for testing or ad-hoc sends.

```
Google Sheet ──read (doGet / CSV)──▶ script or cron ──Mailgun API──▶ emails
```

Three local scripts (all **default to dry-run**; add `--send` to deliver):
- `npm run draft` — generates a newsletter draft from real repo data (LLM writes the intro).
- `npm run alerts` — emails price-alert subscribers whose locality crossed their ₹/sqft threshold.
- `npm run newsletter` — broadcasts a draft to the report/newsletter list.

---

## 1. One-time setup

### a. Environment (`.env.local`, gitignored)
Already added for you (copy shape is in `.env.example`):

```
MAILGUN_API_KEY=...            # ⚠️ rotate this — it was shared in cleartext
MAILGUN_DOMAIN=mail.deepsilabs.com
MAILGUN_FROM=noreply@mail.deepsilabs.com
MAILGUN_TO=info@deepsilabs.com
SHEET_READ_URL=                # from step (b); leave blank to use --csv instead
SHEET_READ_TOKEN=
SHEET_WEBHOOK_URL=             # same /exec URL — write 'alert-sent' state + lead capture
CRON_SECRET=                   # openssl rand -hex 32 — protects the cron endpoints
SITE_URL=https://flatmap.cloud # optional; used for links in emails
```

> **Rotate the Mailgun key.** It was pasted into chat in plaintext. Generate a new
> Sending API key in the Mailgun dashboard and replace `MAILGUN_API_KEY`.

### b. Read subscribers back from the Sheet (pick ONE)

**Option 1 — Apps Script `doGet` (automated read).** In the same Apps Script project
that has `doPost` (see `SETUP-leads.md`), add:

```javascript
function doGet(e){
  if (e.parameter.token !== PropertiesService.getScriptProperties().getProperty('READ_TOKEN'))
    return ContentService.createTextOutput(JSON.stringify({ok:false}))
      .setMimeType(ContentService.MimeType.JSON);
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Leads')
        || SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
  var rows = sh.getDataRange().getValues();            // [timestamp,kind,email,meta,referer,ua]
  var out = rows.slice(1).map(function(r){
    return { when:r[0], kind:r[1], email:r[2], meta:r[3] };
  });
  return ContentService.createTextOutput(JSON.stringify({ok:true, rows:out}))
    .setMimeType(ContentService.MimeType.JSON);
}
```

Then: **Project Settings → Script Properties → add** `READ_TOKEN` = a long random string.
**Deploy → Manage deployments → Edit → New version.** Put the `/exec` URL in `SHEET_READ_URL`
and the token in `SHEET_READ_TOKEN`. Verify:

```bash
curl -L "$SHEET_READ_URL?token=$SHEET_READ_TOKEN"   # → {"ok":true,"rows":[...]}
```

**Option 2 — CSV export (no Apps Script change).** In the Sheet, *File → Download →
Comma-separated values*, then pass `--csv path/to/export.csv` to either script.

---

## 2. Send price alerts

```bash
npm run alerts                      # dry-run, read from Sheet
npm run alerts -- --csv leads.csv   # dry-run, read from a CSV export
npm run alerts -- --limit 5         # cap to 5 (testing)
npm run alerts -- --send            # actually email
```

- Compares each `price-alert` subscriber's saved threshold against the locality's
  current modeled price (`price2026`, read live from `index.html`).
- Re-send guard: `scripts/.alert-state.json` (gitignored) records who's already been
  notified for a given locality+threshold so reruns don't spam. Delete it to reset.

## 3. Send the weekly newsletter

```bash
# generate a draft from real data (price movers / launches / heat auto-filled,
# intro written by the LLM via OPENROUTER_API_KEY). Or copy TEMPLATE.md by hand.
npm run draft                                        # → newsletter/<today>.md
npm run draft -- --no-llm                            # deterministic, no API call

# preview (dry-run)
npm run newsletter -- --draft newsletter/2026-06-26.md --subject "This week in Bengaluru property"

# test to yourself
npm run newsletter -- --draft newsletter/2026-06-26.md --subject "Test" --to you@email.com --send

# send to the whole report list
npm run newsletter -- --draft newsletter/2026-06-26.md --subject "This week in Bengaluru property" --send
```

- `.md` drafts get a small markdown→HTML conversion; `.html` drafts are sent as-is.
- Recipients are the `report` rows (or `--csv`). Sent as BCC in batches of ~800.

---

## 4. Automated weekly send (Vercel Cron)

Two cron jobs run **every Saturday ~08:00 IST** (`vercel.json` → `crons`, scheduled in
UTC: `30 2 * * 6` newsletter, `45 2 * * 6` alerts; the Hobby plan triggers within the
hour, so treat the time as approximate):

- `GET /api/cron/newsletter` — builds the draft from live data (LLM intro via
  `OPENROUTER_API_KEY`, deterministic fallback) and broadcasts it to the `report` list
  **plus `MAILGUN_TO`**. Runs unattended — there is no review step.
- `GET /api/cron/alerts` — sends price alerts for newly-crossed thresholds.

**Dedupe (alerts):** serverless has no disk, so each sent alert is written back to the
Sheet as a row with kind `alert-sent` (`meta = {locality, threshold, price}`) via
`SHEET_WEBHOOK_URL`, and read back on the next run to skip repeats. The manual CLI keeps
its own file state (`scripts/.alert-state.json`) — so prefer one path or the other to
avoid two state stores.

### Required Vercel env vars
Set these in **Vercel → Project → Settings → Environment Variables** (they live in
`.env.local` for local runs):

```
CRON_SECRET          # openssl rand -hex 32 — protects the cron endpoints
MAILGUN_API_KEY      MAILGUN_DOMAIN      MAILGUN_FROM      MAILGUN_TO
SHEET_READ_URL       SHEET_READ_TOKEN    # read subscribers
SHEET_WEBHOOK_URL    # same /exec URL — write 'alert-sent' state (+ lead capture)
OPENROUTER_API_KEY   # optional — newsletter intro; falls back to deterministic
SITE_URL             # optional — links in emails (default https://flatmap.cloud)
```

Vercel automatically sends `Authorization: Bearer $CRON_SECRET` on cron invocations;
the endpoints reject anything else. Redeploy after adding the vars.

### Test the cron endpoints manually
```bash
curl -i -H "Authorization: Bearer $CRON_SECRET" https://flatmap.cloud/api/cron/newsletter
curl -i -H "Authorization: Bearer $CRON_SECRET" https://flatmap.cloud/api/cron/alerts
# → {"ok":true,"sent":N,...}.  Without the header → 401.
```
View runs in **Vercel → Project → Cron Jobs** (logs + manual "Run" button).

### Change the schedule
Edit the cron expressions in `vercel.json` (UTC) and redeploy. To pause automation,
remove the `crons` array (the endpoints still work for manual `curl`).

---

## Notes
- Deliverability: make sure SPF/DKIM for `mail.deepsilabs.com` are verified in Mailgun.
- Plan limits: Hobby allows 2 cron jobs at ≤ daily frequency (weekly is fine) with
  approximate trigger times. Pro gives exact times and more jobs.
