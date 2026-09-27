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

# Zero-padded names sort in the order they must run. For a fresh database; on an existing one,
# run only the new files (e.g. paste 0015_webhooks.sql into the Supabase SQL editor).
count=0
for file in "$MIGRATIONS_DIR"/[0-9][0-9][0-9][0-9]_*.sql; do
  echo "  → $(basename "$file")"
  psql "postgresql://$DB_USER@$DB_HOST:$DB_PORT/$DB_NAME" -f "$file" -v ON_ERROR_STOP=1 -q
  count=$((count + 1))
done

echo ""
echo "All $count migrations done."
