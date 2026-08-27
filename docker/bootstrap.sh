#!/usr/bin/env bash
# Applies the production schema to the local stack, then verifies the result.
#
# Runs as a one-shot service after storage-api is healthy, so storage-api has
# already created the `storage` schema through its own migrations by the time
# supabase_schema.sql inserts the bucket row.
set -euo pipefail

export PGPASSWORD="${POSTGRES_PASSWORD}"
PSQL=(psql --host=db --port=5432 --username=postgres --dbname=postgres --no-password)

echo "==> Waiting for Postgres"
until "${PSQL[@]}" --quiet --tuples-only --command 'select 1' >/dev/null 2>&1; do
    sleep 1
done

echo "==> Applying backend/data/supabase_schema.sql"
# No ON_ERROR_STOP here: the schema is the production file and is applied
# repeatedly across restarts, so statements that are already satisfied are
# expected to complain. verify.sql below is what decides whether the run
# actually succeeded.
"${PSQL[@]}" --file=/schema/supabase_schema.sql || true

echo "==> Verifying"
"${PSQL[@]}" --set=ON_ERROR_STOP=1 --file=/verify.sql

echo "==> Local Supabase stack is ready"
