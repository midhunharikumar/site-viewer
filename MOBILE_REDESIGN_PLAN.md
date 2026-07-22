# Mobile & Tablet Redesign Plan — BengaluruValue

**Goal:** A seamless, fast, purpose-built mobile/tablet experience. Split the data out of `index.html`, kill the load waterfall, and replace the retrofitted desktop UI with a mobile-first interface.

**Scope agreed:** Full mobile redesign now + data split.

---

## Current state (measured)

- `index.html` = **684KB / 12,721 lines**. Of that, **~509KB (74%) is a single inline `DATA` object** — 127 localities embedded at lines 2701–10804.
- `app.js` = **88KB**, injected only *after* 7 JSON files resolve.
- Load path today: download 684KB HTML → render-blocking Leaflet JS + Chart.js + 3-family Google Fonts (Spectral has 7 weights + italics) → `Promise.all` fetch of 7 data files → inject `app.js` → build map + 127 markers + charts. Nothing meaningful paints until near the end.
- Mobile is handled by three `@media` breakpoints (860 / 640 / 380px) that reflow the desktop sidebar into a slide-in drawer (`#sidebar` `transform: translateX(-105%)`, scrim, `toggleSidebar()`). `isMobile()`, `openDetail()`, `closeDetail()` already exist in `app.js`.
- `app.js` reads `DATA.localities` (global), plus `window.{METRO,LIVE,PROJECTS,CONCEPT,CAUVERY,SCHOOLS,OVERHEAT}`.

**Conclusion:** the dominant problem is the load waterfall, led by the 509KB inline data. The interface issues are secondary but real. We fix both.

---

## Phase 1 — Split the data, break the waterfall

*Biggest win, low risk. Ship this first.*

1. **Extract `DATA` to `data/localities.json`.** Move the object literal from the inline `<script>` (lines ~2701–10804) into a standalone JSON file. This alone drops the HTML shell from ~684KB to ~150KB.
2. **Add it to the existing fetch map** in the boot script (`data/localities.json` → `window.DATA`). `app.js` references `DATA` as a global; `window.DATA` satisfies that with no code change. Verify no other inline script reads `DATA` before fetch resolves.
3. **Defer render-blocking scripts.** Add `defer` to Leaflet and move Chart.js to lazy-load — it's only needed when a detail panel opens (`openDetail`). Load it on first detail open via a small `ensureChart()` promise.
4. **Trim fonts.** Cut the Google Fonts request to the weights actually rendered (audit usage; Spectral likely needs 2–3 weights, not 7 + italics). Add `font-display: swap` (already on the request) and consider self-hosting the two primary weights to remove a third-party round-trip.
5. **First-paint skeleton.** Show the header + a map skeleton/shimmer immediately (the `.skel` style already exists) so the first second isn't blank.

**Update-workflow impact:** the Update process and `CLAUDE.md` currently treat locality prices/yields as living inside `index.html`. After the split they live in `data/localities.json`. Update `CLAUDE.md` and any scripts to point at the new file. (This is why we confirmed the split — the heat panel's live-computed indicators read locality data, so the path change must be reflected.)

**Acceptance:** HTML shell < 200KB; first contentful paint in the first ~1s on throttled mobile; no functional regressions on desktop.

---

## Phase 2 — Progressive rendering

1. **Paint shell first, hydrate after.** Render map tiles + header before building 127 markers; add markers in an idle callback / next frame so the map is interactive sooner.
2. **Viewport/zone-scoped markers on mobile.** Render markers for the active zone or current viewport rather than all 127 at once; add the rest on pan/zoom. Reduces main-thread work and memory on low-end phones.
3. **Lazy charts + heavy panels.** Confirm Chart.js and the heat modal only initialize on demand.

**Acceptance:** time-to-interactive materially lower on mobile; smooth pan/zoom on a mid-range Android.

---

## Phase 3 — Purpose-built mobile & tablet interface

Replace "desktop crammed into a drawer" with a mobile-first flow. Keep the desktop layout untouched above the tablet breakpoint.

**Mobile (≤ 640px):**
- **Map-first, full-screen.** The map is the primary surface; chrome floats over it.
- **Bottom sheet for detail.** Replace the full-screen `#detail` sheet with a draggable bottom sheet (peek → half → full) — the native pattern users expect. Locality/project detail lives here.
- **Compact filter bar** instead of the full sidebar: a single row for zone + "colour map by" metric, with advanced controls (livability sub-metrics, time scrubber, AI search) behind a "More" tap or a secondary sheet.
- **Defer heavy features.** AI search, full legend stack, and the time scrubber load/appear on interaction, not on first paint.
- **Simplify legends** into one collapsible chip rather than the stacked legend panel.

**Tablet (641–1024px):**
- Intermediate layout: a narrower persistent sidebar or a collapsible rail, map takes the rest. Detail as a side panel rather than a bottom sheet.

**Design decisions to confirm during build** (reasonable defaults chosen, flag if you disagree): bottom-sheet over modal for detail; filter bar over drawer; hide time scrubber by default on mobile.

**Acceptance:** a first-time mobile user can find a locality, change the map metric, and open detail without opening a drawer or hunting; controls are thumb-reachable.

---

## Phase 4 — Verify

1. Lighthouse mobile (throttled) before/after — capture FCP, TTI, total transfer.
2. Real-width device checks at 380 / 414 / 768 / 1024px.
3. Regression pass on desktop (map, markers, detail, charts, heat modal, AI search, deep-link hash).
4. Confirm the Update workflow still round-trips: edit `data/localities.json` → heat panel recomputes → `index.html?heat=1` renders.
5. High-stakes verification via a subagent reviewing the diff for broken references to the old inline `DATA`.

---

## Sequencing

Phase 1 is independently shippable and delivers most of the speed win — do it first and deploy. Phases 2–3 build on it. Phase 4 runs continuously and as a final gate.

## Risks

- **Data split breaks a hidden inline reference to `DATA`.** Mitigation: grep all inline scripts; keep `window.DATA` global name identical.
- **Update workflow points at the old location.** Mitigation: update `CLAUDE.md` + scripts in the same PR.
- **Mobile redesign touches shared CSS/JS used by desktop.** Mitigation: gate new mobile UI behind the existing `isMobile()` / breakpoints; snapshot desktop before/after.
