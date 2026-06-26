# Weekly newsletter drafts

Write each week's issue as a markdown file here (e.g. `2026-06-26.md`). Copy
`TEMPLATE.md` to start. Then send it **offline** with the Mailgun script:

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
