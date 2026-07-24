#!/usr/bin/env bash
# Runs automatically once the Codespace container is created.
set -euo pipefail

echo "==> Installing dependencies..."
npm install

if [ ! -f .env.local ]; then
  echo "==> Creating .env.local from .env.example (mock mode by default)..."
  cp .env.example .env.local
fi

echo "==> Done. Run 'npm run dev' to start ArcRelay on port 3000."
