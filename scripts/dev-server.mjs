// Local dev server: static files + the api/*.js Vercel handlers.
//
// `python3 -m http.server` can't run the serverless functions, so /api/search
// answered 501 and "✦ Ask AI" silently fell back to keyword matching, while
// /api/config 404'd and the CARTO key never reached the browser. This server
// shims just enough of Vercel's req/res to invoke the real handlers.
//
//   node scripts/dev-server.mjs [port]        (default 8123)
//
// Env comes from .env.local via dotenv, same names as the Vercel dashboard.
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config();

const ROOT = process.cwd();
const PORT = Number(process.argv[2] || 8123);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
};

// Vercel's handlers expect res.status().json()/.send() and a parsed req.body.
function decorate(res) {
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (obj) => {
    if (!res.hasHeader("Content-Type"))
      res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify(obj));
    return res;
  };
  res.send = (body) => { res.end(body); return res; };
  return res;
}

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  if (!chunks.length) return undefined;
  const raw = Buffer.concat(chunks).toString("utf8");
  const ct = req.headers["content-type"] || "";
  if (ct.includes("application/json")) { try { return JSON.parse(raw); } catch { return raw; } }
  return raw;
}

async function serveApi(req, res, route) {
  const file = path.join(ROOT, "api", route + ".js");
  try { await fs.access(file); }
  catch { res.statusCode = 404; return res.end("no such api route: " + route); }
  try {
    // Cache-bust so handler edits are picked up without a restart.
    const mod = await import(pathToFileURL(file).href + "?t=" + Date.now());
    req.body = await readBody(req);
    req.query = Object.fromEntries(new URL(req.url, "http://x").searchParams);
    await mod.default(req, decorate(res));
  } catch (e) {
    console.error("[api/" + route + "]", e);
    if (!res.headersSent) { res.statusCode = 500; res.end("handler threw: " + e.message); }
  }
}

async function serveStatic(req, res, pathname) {
  let rel = decodeURIComponent(pathname).replace(/^\/+/, "");
  if (rel === "") rel = "index.html";
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT)) { res.statusCode = 403; return res.end("forbidden"); }
  let target = file;
  try {
    const st = await fs.stat(target);
    if (st.isDirectory()) target = path.join(target, "index.html");
  } catch {
    // Extensionless pretty URL (/l/whitefield) -> try the .html file.
    if (!path.extname(target)) target += ".html";
  }
  try {
    const buf = await fs.readFile(target);
    res.setHeader("Content-Type", MIME[path.extname(target)] || "application/octet-stream");
    res.setHeader("Cache-Control", "no-store");
    res.end(buf);
  } catch {
    res.statusCode = 404;
    res.end("404 " + pathname);
  }
}

http.createServer(async (req, res) => {
  const { pathname } = new URL(req.url, "http://localhost");
  if (pathname.startsWith("/api/")) return serveApi(req, res, pathname.slice(5));
  return serveStatic(req, res, pathname);
}).listen(PORT, () => {
  const has = (k) => (process.env[k] ? "set" : "MISSING");
  console.log("dev server  http://localhost:" + PORT);
  console.log("  CARTO_API_KEY=" + has("CARTO_API_KEY") + "  OPENROUTER_API_KEY=" + has("OPENROUTER_API_KEY"));
});
