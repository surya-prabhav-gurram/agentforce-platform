#!/bin/bash
set -e

echo "Starting dev environment (Postgres in Docker, app local)"
echo ""

# Start postgres only
docker compose up -d postgres
echo "Waiting for Postgres..."
sleep 5

# Backend
cd backend
npm install
npx prisma migrate deploy
npm run seed 2>/dev/null || true
npm run dev &
BACKEND_PID=$!
cd ..

# Frontend
cd frontend
npm install
npm run dev &
FRONTEND_PID=$!
cd ..

echo ""
echo "Dev servers running:"
echo "  Frontend:  http://localhost:3000"
echo "  Backend:   http://localhost:4000/graphql"
echo ""
echo "Press Ctrl+C to stop"

trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; docker compose down" EXIT
wait
