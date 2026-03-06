#!/usr/bin/env bash
# 开发模式 — watch 文件变化并自动重新构建
set -euo pipefail

cd "$(dirname "$0")/.."

echo "📦 Installing dependencies..."
npm ci

echo "👀 Starting dev mode (watch)..."
echo "   Press Ctrl+C to stop"
echo ""
node esbuild.config.mjs
