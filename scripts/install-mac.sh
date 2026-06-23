#!/usr/bin/env bash
set -euo pipefail
npm install
npx playwright install chromium
if [ ! -f .env ]; then
  cp .env.example .env
  echo "Creado .env: completá PACS_BASE_URL, PACS_USER, PACS_PASS y HTTP_API_TOKEN."
fi
npm run build
