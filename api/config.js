// Vercel Serverless Function: exposes a small set of PUBLIC-safe config values
// to the browser as `window.<KEY> = "..."` JavaScript.
//
// Why a function (not a static file)?
// - The CARTO basemap API key needs to reach the browser (Leaflet/MapLibre make
//   the tile requests directly from the client), but we don't want it committed
//   to source control. Reading it from process.env at request time lets us
//   rotate the key in the Vercel dashboard without a redeploy of the HTML/JS.
//
// Setup:
//   1. Get a free key at https://carto.com/basemaps/apikey (5M tiles/mo).
//   2. In Vercel -> Project -> Settings -> Environment Variables, add:
//        CARTO_API_KEY = eyJhbGciOi...           (Production + Preview)
//      Optional (recommended): also lock the key to your production domain
//      in the CARTO dashboard so it can't be re-used elsewhere.
//   3. Redeploy (or just hit /api/config once — this function reads env at
//      invocation, so the key is picked up on the next cold start).
//
// Protocol:
//   GET /api/config
//   200 application/javascript:  window.CARTO_API_KEY = "...";
//
// Loaded from index.html and 3d.html via:
//   <script src="/api/config"></script>
// placed BEFORE app.js / the map init inline script.

export default function handler(req, res) {
  // JSON-encoding the string is the safe way to inline it into JS — it escapes
  // any stray quote/backslash/newline. Empty string if the env var is unset.
  const key = process.env.CARTO_API_KEY || "";
  const body = "window.CARTO_API_KEY = " + JSON.stringify(key) + ";\n";

  res.setHeader("Content-Type", "application/javascript; charset=utf-8");
  // Short cache — long enough to avoid a request per navigation, short enough
  // that a key rotation propagates within minutes.
  res.setHeader("Cache-Control", "public, max-age=300, s-maxage=300, stale-while-revalidate=3600");
  res.status(200).send(body);
}
