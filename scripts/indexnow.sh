#!/usr/bin/env bash
# Submit every sitemap URL to IndexNow (Bing, Yandex, Seznam, Naver).
# Cross-platform: works on macOS (BSD xargs) and Linux. All chunking is done
# in Python so we don't depend on GNU-only xargs flags.
# Usage:  ./scripts/indexnow.sh
set -e
HOST=flatmap.cloud
KEY=a8c4f0e9b2d34d6e8a1f5c7b9e2d4c6a
KEYLOC="https://$HOST/$KEY.txt"

exec python3 - "$HOST" "$KEY" "$KEYLOC" <<'PY'
import json, re, sys, urllib.request, urllib.error

host, key, keyloc = sys.argv[1], sys.argv[2], sys.argv[3]
sitemap = f"https://{host}/sitemap.xml"

print(f"Fetching {sitemap} ...")
try:
    with urllib.request.urlopen(sitemap, timeout=20) as r:
        xml = r.read().decode("utf-8", "replace")
except Exception as e:
    print(f"ERROR fetching sitemap: {e}", file=sys.stderr); sys.exit(1)

urls = re.findall(r"<loc>([^<]+)</loc>", xml)
print(f"Found {len(urls)} URLs in sitemap.")
if not urls:
    print("Nothing to submit."); sys.exit(0)

chunk = 100
sent_ok = sent_err = 0
for i in range(0, len(urls), chunk):
    batch = urls[i:i+chunk]
    payload = {"host": host, "key": key, "keyLocation": keyloc, "urlList": batch}
    req = urllib.request.Request(
        "https://api.indexnow.org/indexnow",
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json; charset=utf-8"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            print(f"  batch {i//chunk+1:>3}: {len(batch):>3} urls -> HTTP {r.status}")
            sent_ok += len(batch)
    except urllib.error.HTTPError as e:
        # 200/202 = OK; 422 = some URLs rejected (still informative)
        body = e.read().decode("utf-8", "replace")[:200] if e.fp else ""
        print(f"  batch {i//chunk+1:>3}: HTTP {e.code} {e.reason}  {body}", file=sys.stderr)
        sent_err += len(batch)
    except Exception as e:
        print(f"  batch {i//chunk+1:>3}: ERROR {e}", file=sys.stderr)
        sent_err += len(batch)

print(f"\nDone. Submitted: {sent_ok}  Failed: {sent_err}")
sys.exit(0 if sent_err == 0 else 1)
PY
