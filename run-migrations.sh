#!/usr/bin/env bash
set -euo pipefail

DB_HOST="db.jrwvplbvcwxejrhwkxdj.supabase.co"
DB_USER="postgres"
DB_NAME="postgres"
DB_PORT="5432"

if [ -z "${PGPASSWORD:-}" ]; then
  echo "Set your database password first:"
  echo "  export PGPASSWORD='your-new-password'"
  echo "Then re-run this script."
  exit 1
fi

MIGRATIONS_DIR="$(dirname "$0")/supabase/migrations"

echo "Running migrations against $DB_HOST..."

for file in "$MIGRATIONS_DIR"/0001_init.sql \
            "$MIGRATIONS_DIR"/0002_deployments_public.sql \
            "$MIGRATIONS_DIR"/0003_credits_and_hardening.sql \
            "$MIGRATIONS_DIR"/0004_foundations.sql \
            "$MIGRATIONS_DIR"/0005_storage.sql \
            "$MIGRATIONS_DIR"/0006_knowledge.sql \
            "$MIGRATIONS_DIR"/0007_agent_api.sql \
            "$MIGRATIONS_DIR"/0008_evals.sql; do
  echo "  → $(basename "$file")"
  psql "postgresql://$DB_USER@$DB_HOST:$DB_PORT/$DB_NAME" -f "$file" -v ON_ERROR_STOP=1 -q
done

echo ""
echo "All 8 migrations done."
