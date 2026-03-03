#!/usr/bin/env bash
# Mimics the Vercel cron that hits /api/discord/gateway every 9 minutes.
# The gateway handler runs for 10 minutes, so there's ~1 minute of overlap
# where the new listener takes over via leader election and the old one
# shuts down via heartbeat detection.
#
# Usage: ./dev/discord-gateway-cron.sh
# Requires CRON_SECRET to be set in the environment (or .env.local).

set -euo pipefail

CRON_SECRET="${CRON_SECRET:-$(grep '^CRON_SECRET=' .env.local 2>/dev/null | cut -d= -f2-)}"

if [ -z "$CRON_SECRET" ]; then
  echo "Error: CRON_SECRET not found in environment or .env.local"
  exit 1
fi

URL="http://localhost:3000/api/discord/gateway"
INTERVAL=$((9 * 60))  # 9 minutes in seconds

echo "Starting discord gateway cron (every ${INTERVAL}s)"
echo "URL: $URL"

while true; do
  echo "[$(date '+%H:%M:%S')] Sending request to gateway..."
  # Run curl in background so we don't block the next iteration.
  # The endpoint runs for ~10 minutes; the next request after 9 minutes
  # will take over via leader election.
  curl -s -o /dev/null -w "  -> HTTP %{http_code}\n" \
    -H "Authorization: Bearer $CRON_SECRET" \
    "$URL" &

  sleep "$INTERVAL"
done
