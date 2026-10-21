#!/bin/sh
set -e

echo "Running database migrations with Alembic..."
alembic upgrade head

echo "Seeding default users and system data..."
python -m scripts.seed_users || true

echo "Starting AgriAdvisor AI backend server..."
exec "$@"
