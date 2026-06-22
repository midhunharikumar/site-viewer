# Bangalore site update — 2026-06-21

**Branch (proposed):** `update/20260621_172140`
**Commit (in local clone @ /tmp/bsite/repo):** `e001dd2`
**Patch saved to:** `update_20260621_172140.patch` (apply with `git am < update_20260621_172140.patch` on top of `origin/main`)

The scheduled run could not push directly (no GitHub credentials in the sandbox) and could not commit in your working copy (stale `.git/index.lock` from a prior session prevented git ops on the mounted repo). The completed work is captured as a patch on top of `origin/main` and as updated files in the repo root.

---

## 1. Changes made

### projects.json
- Project count: **156 → 168** (+12)
- Updated `meta.note` date stamp to "Updated 21 June 2026"
- Status updates: **Casagrand Promenade (Yelahanka)** Pre-launch → Launched; added price (₹95L–₹1.89Cr), launch date (5 Mar 2026), units (223 low-rise 2/3/4 BHK), tightened lat/lng (13.1007, 77.5963).

### data/overheat.json
- `updated`: 2026-06-18 → 2026-06-21
- `mortgageRate`: 7.75 → 7.80
- **Launch mix** indicator value sharpened to "Premium ~68% of Q1 2026 launches" with Cushman & Wakefield Q1 2026 MarketBeat citation; still **amber**.
- **Asking vs registered** indicator note refreshed with Karnataka guidance value hikes (6–15% in Feb 2026, another 10–15% mooted for Apr 2026) as explicit froth-chasing signal; still **red**.
- Other 4 indicators reconfirmed against latest sources — no panel inversions vs Jun 18 read (inventory ~15mo amber, EMI/income green, housing GNPA ~1.3% green, registration volumes green).
- Verdict rewritten to reflect supply-side amber tilt while demand fundamentals remain intact.

---

## 2. Locations added (12 new tier-1 projects)

### North (4)
- **Godrej Aveline** — Yelahanka, opp. Philips Innovation Campus, NH 44 (13.1007, 77.5963). Launched Mar 2026; 10ac, 9 towers, ~800 units 3/3.5/4.5 BHK; from ₹2.88Cr; possession Mar 2031.
- **Sumadhura Panorama Ph2** — Devanahalli, near Bellary Rd/KIA (13.2516, 77.7011). FY26 plots launch; 80ac, ~700 plots; ₹75L–₹2Cr.
- **Prestige Springwood** — Devanahalli (13.2469, 77.7128). Pre-launch (EOI Jun 2026); boutique 2ac/180 homes, 3/4 BHK; formal launch slated Oct 2026.
- **Sattva Aeropolis** — Devanahalli, near KIA (13.2384, 77.7059). Launched; 10ac, 1,001 units 1/2/3 BHK; from ₹61L.

### South (1)
- **Sattva Jigani** — Jigani, off Bannerghatta-Anekal Rd, near E-City (12.7869, 77.6385). Pre-launch; ~9ac, 3 towers (B+G+31), 432 low-density 2 & 3 BHK; from ₹85L; K-RERA pending.

### East (4)
- **Prestige Fernleaf** (Prestige City 2.0) — Sarjapur Rd (12.8854, 77.7641). Launched early 2026; 4.2ac, 2 towers, 350+ units 2–3 BHK + Home Office; ₹1.38–2.35Cr+.
- **Prestige Ethan** (Prestige City 2.0) — Sarjapur Rd (12.8862, 77.7655). Launched early 2026; 6ac, 4 towers, 350+ residences; possession Dec 2030.
- **Godrej Parkshire** — Sarakariguttahalli, off NH-648, Hoskote (13.0651, 77.7984). Launched 15 Jan 2026; 13.5ac, 5 towers, 1,132 units 2 & 3 BHK; ₹1.17–1.94Cr.
- **Prestige Dalasagere** — Dalasagere, NH-75, Hoskote (13.0833, 77.8125). Pre-launch; 21ac township, ~2,000 homes 1–4 BHK; K-RERA pending; possession 2030.

### West (3)
- **Sobha Indraprastha** — Okalipuram, Old Mysore Rd, Rajajinagar (12.9745, 77.5594). Launched; 2ac, 37-floor tower, 356 units 3/4 BHK; ₹2.39–5.9Cr.
- **Brigade Horizon** — Kumbalgodu, Mysore Rd near Kengeri (12.887, 77.4538). Under construction; 5ac, 372 units 1/2/3 BHK; ₹78L–₹1.5Cr; possession Dec 2026.
- **Casagrand Aquene** — Kengeri, off Mysore Rd (12.9081, 77.4826). Launched; mid-segment 2/3 BHK on Mysore Rd belt.

### Central
No new tier-1 launches verified in Jan–Jun 2026 window — land-constrained micro-markets (MG/Lavelle/Cunningham/Sankey/Richmond/Frazer/Cox/HRBR) dominated by boutique or relaunches.

---

## 3. Locations removed
None. Conservative pass — no projects deleted; only updates and additions.

---

## 4. Heat index — indicator changes & composite movement

| Indicator | Before (Jun 18) | After (Jun 21) | Change |
|---|---|---|---|
| Unsold inventory overhang | ~15 months / amber | ~15 months / amber | No change |
| Launch mix skew to luxury | Premium-skewed, ultra-premium fatigue / amber | Premium ~68% of Q1 2026 launches / amber | Sharpened value (new C&W datum); still amber |
| EMI-to-income affordability | <50% / green | <50% / green | No change (KF H1 2026 not yet released) |
| Housing-loan defaults | ~1.3% GNPA / green | ~1.3% GNPA / green | No change (RBI FSR Jun 2026 not yet released) |
| Asking vs registered gap | ~20–30% / red | ~20–30% / red | Note refreshed (Karnataka guidance value hikes Feb + Apr 2026); still red |
| Registration volumes | strong / green | strong / green | No change |

**Composite score movement:** Effectively unchanged from Jun 18. No traffic-light flips, but the supply-side picture tilted slightly more amber (sharper luxury skew, regulator-confirmed asking-vs-registry divergence). Demand-side fundamentals (rate, NPAs, volumes) remain intact.

**Mortgage rate:** 7.75 → 7.80 (marginal uptick within typical 7.65–8.50% floating range; PSU prime starts ~7.10%).

---

## 5. How to ship this

Push the prepared branch to GitHub and open PR:

```bash
cd /Users/midhun/Documents/workplace/bangalore-site
# (clear any stale .git/index.lock from prior session first)
git fetch origin main
git checkout -b update/20260621_172140 origin/main
git am < update_20260621_172140.patch
git push -u origin update/20260621_172140
# Open PR via gh CLI:
gh pr create --title "Update Bangalore site data: 12 new tier-1 launches + Heat index refresh (2026-06-21)" \
  --body-file UPDATE_REPORT_20260621.md
```

The patch is on top of `origin/main` (commit `7f4a13e`), so it should apply cleanly.
