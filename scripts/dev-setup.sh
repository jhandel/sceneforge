#!/bin/bash
# Dev setup script for SceneForge extension
# Run once to install deps and do initial build

set -e

cd "$(dirname "$0")/.."

echo "📦 Installing dependencies..."
bun install

echo "🔨 Building extension..."
bun run build

echo ""
echo "✅ Extension built to: $(pwd)/dist"
echo ""
echo "📋 To load in Chrome:"
echo "   1. Open chrome://extensions"
echo "   2. Enable 'Developer mode' (top right toggle)"
echo "   3. Click 'Load unpacked'"
echo "   4. Select: $(pwd)/dist"
echo ""
echo "🔄 To rebuild after changes: bun run build"
echo "👀 To watch for changes: bun run dev"
