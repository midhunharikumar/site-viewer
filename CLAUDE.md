The purpose of this repository is to keep up to date bangalore site information. 


The following data files contain critical information that needs constant updating.
`cauvery.json` : Cauvery water availability
`concept.json` : New metro connectivity proposals
`livability.json` : Livability scores for different localities.
`localities.json` : Per-locality price history, projections, CAGR, and rental yield (127 localities). This is the core dataset the map colours by and the Heat index computes from. It was extracted out of `index.html` (previously an inline `DATA` object) and is now fetched at runtime like the other data files.
`metro.json` : Metro lines data for bangalore city.
`overheat.json` : Market overheating indicators (inventory overhang, affordability, NPAs, asking-vs-registry gap) shown in the Heat index panel.
`projects.json`: Apartment development projects in various stages.
`schools.json` : School locations within the city.

## What you can do :
### Update mode

When the user command is Update. Proceed with the following steps.

#### New developments and constructions

- Spawn subagents to search for new apartment developments across north, south, east, west and central Bangalore.
- Do web searches to find new constructions and launch announcements and identify their geographical locations within the city.
- Read `projects.json` and compare the new locations found. Remove duplicates and update status of the projects. Update `projects.json` too with the new projects and new launches.
- Only search for tier one builders from tier1 list. Tier1 list can be found in `projects.json` key `builders`.
- Terms such as `new launch` `new construction` `new development` can produce better search results.
- If the status of existing projects in your database have changed update them. If you get more precise location information about them update lat and lng too.
- Entries to `projects.json` should match its existing format and contain the structure 
- ```json {
   "builder": "Assetz",
   "name": "Assetz Zen & Sato",
   "loc": "Sathanur, Bagalur Main Rd",
   "lat": 13.1228,
   "lng": 77.6326,
   "type": "Apartments",
   "status": "Under construction",
   "price": "–",
   "note": "Japanese-inspired 3 & 4 BHK; 7-acre, 412 units in 4 towers (G+14), 74% open space. 104 Srinivasa Nagar, Sathanur (near airport corridor).",
   "color": "#a855f7"
  }
  ```
- Make sure to update the `meta` field in `projects.json` with the correct project count.

#### Market heat analysis (overheating check)

Run this on every Update so the 🌡️ Heat index panel (`index.html?heat=1`) stays current.

- Do web searches to refresh the six curated indicators in `data/overheat.json`:
  1. **Unsold inventory overhang** — months of inventory / quarters-to-sell for Bengaluru (Anarock, JLL, Knight Frank, Meraqi quarterly reports). Search terms: `Bangalore residential unsold inventory overhang quarters to sell`.
  2. **Launch mix skew to luxury** — share of new launches in premium/luxury vs mid/affordable segments.
  3. **EMI-to-income affordability** — Knight Frank Affordability Index for Bengaluru (released half-yearly); also note current repo-rate direction.
  4. **Housing-loan defaults (NPAs)** — RBI Financial Stability Report housing GNPA (semi-annual); CRIF/CIBIL retail delinquency notes. There is no public locality-level default data — SARFAESI/IBAPI e-auction counts for Bengaluru are the best city-level distress proxy if a number is needed.
  5. **Asking vs registered price gap** — spot-check 2–3 localities: portal asking rates (99acres/Magicbricks) vs registry transaction averages (Kaveri/IGR Karnataka). A widening gap is a froth signal.
  6. **Registration volumes** — IGR Karnataka stamp-duty collections / Kaveri registration counts trend.
- For each indicator update `value`, `note`, `src`, `url`, and set `status` using these heuristics: `green` = comfortable/improving, `amber` = stretched or deteriorating, `red` = clear froth signal. Update the top-level `updated` date, `mortgageRate` (typical home-loan rate) and rewrite `verdict` (2–3 sentences) if the picture changed.
- Do NOT hand-edit the other four panel indicators (rental yield, negative carry, price momentum, boom concentration) — app.js computes them live from the locality data in `data/localities.json`, so they refresh automatically when locality prices/yields are updated.
- Sanity-check the result by loading `index.html?heat=1` and confirming the composite score and bands render.

#### Commit and update

Use a single long-lived branch named `update` for every Update run. Do NOT create a new dated branch each time — the date lives in the commit message and PR title instead.

- Sync from main first:
  - `git fetch origin`
  - `git checkout main && git pull --ff-only origin main`
  - `git checkout update` (if it doesn't exist yet: `git checkout -b update main`)
  - Reset `update` to match the fresh main so every run starts clean: `git reset --hard origin/main`. (Rationale: the previous run's PR should already be merged; if it isn't, land it first before running Update again.)
- Make the `data/projects.json` and `data/overheat.json` edits.
- Commit with a title that carries today's date and a one-line delta, e.g. `Update 2026-07-05: +6 launches; heat index refresh (composite 53→57)`. The body must include: 1) Changes made, 2) Locations added, 3) Locations removed, 4) Heat index: indicator changes and whether the composite score moved up or down.
- Push: `git push --force-with-lease origin update` (force is needed because the branch was reset to main).
- Open the PR (or update the existing one — if a PR is already open against `update`, the push refreshes it; edit the title/body to reflect this run's date and delta rather than opening a duplicate).