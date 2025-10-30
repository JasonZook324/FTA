#!/usr/bin/env bash
set -e

echo "🔧 Installing dependencies..."
npm install

echo "🚀 Building client with Vite..."
npx vite build

echo "🧱 Building server with esbuild..."
npx esbuild server/index.ts --platform=node --packages=external --bundle --format=esm --outdir=dist
