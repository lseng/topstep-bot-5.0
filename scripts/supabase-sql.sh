#!/bin/bash
# Execute SQL against Supabase database
# Usage: ./scripts/supabase-sql.sh "SELECT * FROM alerts LIMIT 5"
# Or:    ./scripts/supabase-sql.sh < migration.sql

set -e

# Load token from environment or .env.local
if [ -z "$SUPABASE_ACCESS_TOKEN" ]; then
  if [ -f .env.local ]; then
    export $(grep SUPABASE_ACCESS_TOKEN .env.local | xargs)
  fi
fi

if [ -z "$SUPABASE_ACCESS_TOKEN" ]; then
  echo "Error: SUPABASE_ACCESS_TOKEN not found"
  echo "Set it in environment or .env.local"
  exit 1
fi

# Execute SQL
if [ -n "$1" ]; then
  # SQL provided as argument
  echo "$1" | supabase db execute --project-ref mmudpobhfstanoenoumz
else
  # SQL provided via stdin
  supabase db execute --project-ref mmudpobhfstanoenoumz
fi
