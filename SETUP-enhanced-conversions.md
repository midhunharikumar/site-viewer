# Google Ads enhanced conversions — setup

Conversion ID: **`AW-18316898313`**
Page-view conversion label: **`0F8LCLi14NIcEInglp5E`**

## What was wrong

Google Ads reported enhanced conversions as not in use. Three separate causes:

1. **`allow_enhanced_conversions` was never set.** The tag ran
   `gtag('config', 'AW-18316898313')` with no options, so gtag.js would not send
   user-provided data even if we gave it some.
2. **No user data was ever supplied.** Nothing in the codebase called
   `gtag('set', 'user_data', ...)`, so the `em` parameter was absent from every
   conversion hit — the "missing entirely" case in Tag Assistant.
3. **The only conversion fires at page load**, in `<head>`, before the visitor
   has typed anything. On its own that conversion can never carry user data.

Meanwhile the one place a real email exists — the lead form in `app.js`
(`submitLead`) — fired no conversion and reported nothing to Google.

## What we now do

### 1. Enhanced conversions enabled (all 585 pages)

```js
gtag('config', 'AW-18316898313', {'allow_enhanced_conversions': true});
```

### 2. User data supplied before the conversion event (7 conversion pages)

`index.html`, `3d.html`, `launches/`, `heat/`, `builders/`, `areas/`,
`projects/` read a previously-captured email and hand it to gtag **before** the
conversion event:

```js
var e = localStorage.getItem('bv_ec_email');
if (e) gtag('set', 'user_data', { email: e });
```

Order matters. `gtag('set','user_data',...)` must run **before**
`gtag('event','conversion',...)` or the `em` parameter ships empty
(`tv.1~em.`).

### 3. Email captured at the lead form (`app.js`)

`setEnhancedConversionData(email)` runs on a successful lead submit. It
normalises (trim + lowercase), validates, persists to `localStorage`, and calls
`gtag('set','user_data',...)`. gtag.js SHA-256 hashes the value in the browser —
**the raw address never leaves the page.**

Persisting is what makes this work: a first-time visitor's page-view conversion
has no data to send, but every subsequent visit is matched.

## Remaining manual step — the lead conversion label

`LEAD_CONVERSION_LABEL` in `app.js` is **intentionally empty**. Populating it
makes lead submissions fire as their own conversion, which is the high-value
action worth bidding on:

1. Google Ads → **Goals** → **Summary** → **+ New conversion action**
2. Website → create a "Submit lead form" action
3. Open it → **Tag setup** → copy the string after the slash in
   `AW-18316898313/XXXXXXXX`
4. Paste it into `LEAD_CONVERSION_LABEL` in `app.js`

Until then no lead conversion fires. That is deliberate — reusing the page-view
label would double-count it. Enhanced conversions still work on the page-view
conversion via the stored email.

## Verifying

Per the Tag Assistant instructions, check the `em` parameter on the conversion
hit:

| `em` value | Meaning |
| --- | --- |
| absent | Tag misconfigured, no data sent — **the old state** |
| `tv.1~em.` | Parameter sent but empty |
| `tv.1~em.e1` | Data sent but malformed |
| long hash (>10 chars) | Working correctly |

A first visit in a clean profile legitimately shows no `em` — there is no email
yet. Submit the lead form, then reload a conversion page and re-check; the hash
should now be present.

Diagnostics report: **Goals → Summary → Diagnostics tab**. Alerts need ≥20
conversions/week to render, and reflect the past 1–7 days, so allow a few days
after deploying before reading the status.

## Privacy — action required

Enhanced conversions sends hashed customer data to Google. Google's policy
requires a privacy policy disclosing that, plus consent where local law demands
it. **This site currently has no privacy policy, no cookie banner, and no
Consent Mode**, and the lead form makes no disclosure at the point of capture.

Before relying on this in production:

- Publish a privacy policy covering data shared with Google for ad measurement.
- Add a line near the email field saying the address is used for ad measurement.
- If you have EU/UK traffic, implement
  [Consent Mode v2](https://developers.google.com/tag-platform/security/guides/consent)
  — enhanced conversions is gated on `ad_user_data` there.

## Rollback

Remove the `{'allow_enhanced_conversions': true}` argument from the config call,
delete the `bv_ec_email` block from the 7 conversion pages, and drop
`setEnhancedConversionData` plus its call in `submitLead` from `app.js`.
