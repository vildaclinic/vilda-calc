#!/usr/bin/env bash
set -euo pipefail

MAX_LINES=${MAX_LINES:-21000}
CURRENT_LINES=$(wc -l < app.js)

if [[ "$CURRENT_LINES" -gt "$MAX_LINES" ]]; then
  echo "FAIL: app.js has $CURRENT_LINES lines (limit: $MAX_LINES)."
  exit 1
fi

echo "OK: app.js has $CURRENT_LINES lines (limit: $MAX_LINES)."
