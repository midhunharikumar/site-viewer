# Lead capture → Google Sheet

Signups (monthly-report, price-alerts, request-area) flow:

```
Browser form ──POST /api/lead──▶ Vercel function ──POST──▶ Apps Script webhook ──▶ Google Sheet
```

The browser only ever talks to your own `/api/lead` (same origin → no CORS, real
success/error). The Apps Script URL is kept server-side in a Vercel env var, so it
isn't exposed in the page.

Emails are **also** saved to the visitor's `localStorage` (`bv_leads`) as a fallback.

## 1. Create the Sheet + Apps Script

1. Create a Google Sheet. In row 1 add headers (optional but nice):
   `timestamp | kind | email | meta | referer | user_agent`
2. **Extensions → Apps Script**, replace the code with:

```javascript
function doPost(e) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Leads') || ss.getSheets()[0];
  var d = {};
  try { d = JSON.parse(e.postData.contents); } catch (err) {}
  sheet.appendRow([
    new Date(),
    d.kind || '',
    d.email || '',
    JSON.stringify(d.meta || {}),
    d.ref || '',
    d.ua || ''
  ]);
  return ContentService
    .createTextOutput(JSON.stringify({ ok: true }))
    .setMimeType(ContentService.MimeType.JSON);
}
```

3. **Deploy → New deployment → Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
   - Deploy, authorize, and **copy the Web app URL** (ends in `/exec`).

## 2. Configure Vercel

Project → Settings → Environment Variables:

```
SHEET_WEBHOOK_URL = https://script.google.com/macros/s/XXXXXXXX/exec
```

Redeploy. Done — submit the form on the site and a row should appear in the Sheet.

## Testing locally
`/api/lead` only runs under the Vercel runtime. Use `vercel dev` (not `npx serve`)
to exercise the function locally, or just test on a Vercel preview deployment.
Without the function, the form still works and saves to `localStorage`.

## No-server alternative (if you don't want the Vercel function)
Point the browser straight at the Apps Script URL instead:
- set `LEAD_ENDPOINT` in `app.js` to the `/exec` URL, and
- post with `mode:'no-cors'` + `Content-Type: text/plain` (Apps Script can't return
  CORS headers, so the response can't be read — the UI would show optimistic success).
The Vercel-function path above is preferred because it gives real success/failure and
hides the URL.

## Sending (built — manual/offline)
The send side is now wired up via Mailgun, run on demand from your machine (no cron):
- **Newsletter**: `npm run newsletter` broadcasts a manual draft to the report list.
- **Price alerts**: `npm run alerts` compares current modeled price vs each saved threshold.

See **`SETUP-email.md`** for setup (Mailgun env + reading the list back from the Sheet) and usage.
