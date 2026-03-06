#!/usr/bin/env bash
# 一键构建脚本 — 运行 lint + type-check + build (production)
set -euo pipefail

cd "$(dirname "$0")/.."

echo "📦 Installing dependencies..."
npm ci

echo "🔍 Linting..."
npm run lint

echo "🔎 Type checking..."
npx tsc -noEmit -skipLibCheck

echo "🏗️  Building for production..."
node esbuild.config.mjs production

echo ""
if [ -f main.js ]; then
  SIZE=$(wc -c < main.js | tr -d ' ')
  echo "✅ Build complete — main.js (${SIZE} bytes)"
else
  echo "❌ Build failed: main.js not found"
  exit 1
fi
