#!/bin/bash
set -e

echo "Agentforce Field Intelligence Platform — Setup"
echo "================================================"

command -v docker >/dev/null 2>&1 || { echo "ERROR: Docker required. Install from https://docker.com"; exit 1; }

# Check .env exists with a real key
if [ ! -f .env ]; then
  cp .env.example .env
  echo ""
  echo "Created .env file."
  echo "Please open .env and set your ANTHROPIC_API_KEY, then run this script again."
  exit 0
fi

if grep -q "your_anthropic_api_key_here" .env 2>/dev/null; then
  echo ""
  echo "ERROR: Please set ANTHROPIC_API_KEY in .env"
  echo "Get a key at: https://console.anthropic.com"
  exit 1
fi

echo "Config OK. Starting services..."
echo ""

docker compose up -d --build

echo ""
echo "Waiting for services to start (about 30s for first run)..."
sleep 30

echo ""
echo "Done! Open http://localhost:3000"
echo ""
echo "Useful commands:"
echo "  docker compose logs -f backend    # backend logs"
echo "  docker compose logs -f frontend   # frontend logs"
echo "  docker compose down               # stop everything"
