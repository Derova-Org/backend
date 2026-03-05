#!/usr/bin/env bash
# Spin up test Postgres (if Docker available), run E2E tests, tear down.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
COMPOSE_FILE="$SCRIPT_DIR/../../docker-compose.e2e.yml"
PROJECT_NAME="derova-e2e"

USE_DOCKER=false

cleanup() {
  if $USE_DOCKER; then
    echo "Tearing down E2E infrastructure..."
    docker compose -f "$COMPOSE_FILE" -p "$PROJECT_NAME" down -v --remove-orphans 2>/dev/null || true
  fi
}
trap cleanup EXIT

export NODE_ENV="test"
export JWT_SECRET="e2e-test-secret"
export HMAC_KEY="cbfb987137ad1b98bfeca589fdf0a54dbf9d83ce4fa8ecfd7dae89c8787d14e2"

if [ -z "${DATABASE_URL:-}" ]; then
  if command -v docker &>/dev/null && docker info &>/dev/null 2>&1; then
    USE_DOCKER=true
    echo "Starting test Postgres via Docker..."
    docker compose -f "$COMPOSE_FILE" -p "$PROJECT_NAME" up -d --wait
    export DATABASE_URL="postgresql://derova:derova@127.0.0.1:5433/derova_e2e"
  elif pg_isready -h 127.0.0.1 -p 5432 &>/dev/null; then
    echo "Using existing Postgres on port 5432..."
    export DATABASE_URL="postgresql://derova:derova@127.0.0.1:5432/derova_dev"
  else
    echo "ERROR: No DATABASE_URL set, Docker unavailable, and no Postgres on localhost:5432"
    exit 1
  fi
fi

echo "Running E2E tests against $DATABASE_URL..."
cd "$BACKEND_DIR"
node --test --import tsx test/e2e/**/*.test.ts
