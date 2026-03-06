#!/usr/bin/env bash
# 清理构建产物
set -euo pipefail

cd "$(dirname "$0")/.."

echo "🧹 Cleaning build artifacts..."

CLEANED=0

for f in main.js main.js.map dist; do
  if [ -e "$f" ]; then
    rm -rf "$f"
    echo "   Removed: $f"
    CLEANED=$((CLEANED + 1))
  fi
done

if [ "$CLEANED" -eq 0 ]; then
  echo "   Nothing to clean"
else
  echo "✅ Cleaned $CLEANED item(s)"
fi
