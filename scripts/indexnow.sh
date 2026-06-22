#!/usr/bin/env bash
# Submit all new URLs to IndexNow (Bing, Yandex, Seznam). 
# Run after every deploy: ./scripts/indexnow.sh
set -e
KEY=a8c4f0e9b2d34d6e8a1f5c7b9e2d4c6a
HOST=flatmap.cloud
KEYLOC="https://$HOST/$KEY.txt"
# Pull sitemap URLs
URLS=$(curl -s "https://$HOST/sitemap.xml" | grep -oE '<loc>[^<]+</loc>' | sed -E 's/<\/?loc>//g')
# Chunk to 100 per POST
echo "$URLS" | xargs -n 100 -d'\n' python3 -c "
import sys,json,urllib.request
lines=sys.stdin.read().split()
payload={'host':'$HOST','key':'$KEY','keyLocation':'$KEYLOC','urlList':lines}
req=urllib.request.Request('https://api.indexnow.org/indexnow', data=json.dumps(payload).encode(), headers={'Content-Type':'application/json; charset=utf-8'})
try:
    r=urllib.request.urlopen(req,timeout=20); print('submitted', len(lines), '->', r.status)
except Exception as e: print('err', e)
"
