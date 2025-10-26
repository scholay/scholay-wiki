#!/bin/bash
# Database Schema Auto-Sync Script
# This script automatically syncs database schema from init files on every startup
# It safely applies CREATE TABLE IF NOT EXISTS and ALTER TABLE statements

set -e

DB_HOST="${DB_HOST:-mysql}"
DB_PORT="${DB_PORT:-3306}"
DB_USER="${MYSQL_USER:-scholar_user}"
DB_PASSWORD="${MYSQL_PASSWORD:-scholar_pass}"
DB_NAME="${MYSQL_DATABASE:-scholar}"
INIT_DIR="/docker-entrypoint-initdb.d"

echo "======================================="
echo "  Scholar Database Schema Auto-Sync   "
echo "======================================="
echo "Database: $DB_NAME"
echo "Host: $DB_HOST:$DB_PORT"
echo ""

# Wait for MySQL to be ready
echo "Waiting for MySQL to be ready..."
MAX_RETRIES=30
RETRY_COUNT=0

until mysql -h"$DB_HOST" -P"$DB_PORT" -u"$DB_USER" -p"$DB_PASSWORD" -e "SELECT 1" >/dev/null 2>&1; do
  RETRY_COUNT=$((RETRY_COUNT + 1))
  if [ $RETRY_COUNT -ge $MAX_RETRIES ]; then
    echo "❌ Error: MySQL failed to start after $MAX_RETRIES attempts"
    exit 1
  fi
  echo "MySQL is unavailable - waiting... ($RETRY_COUNT/$MAX_RETRIES)"
  sleep 2
done

echo "✓ MySQL is ready!"
echo ""

# Apply schema from init files
echo "Syncing database schema from init files..."
echo ""

SQL_FILES_FOUND=0
SQL_FILES_PROCESSED=0
SQL_FILES_FAILED=0

for sql_file in "$INIT_DIR"/*.sql; do
  if [ -f "$sql_file" ]; then
    SQL_FILES_FOUND=$((SQL_FILES_FOUND + 1))
    filename=$(basename "$sql_file")

    echo "Processing: $filename"

    if mysql -h"$DB_HOST" -P"$DB_PORT" -u"$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" < "$sql_file" 2>&1; then
      echo "  ✓ Successfully applied: $filename"
      SQL_FILES_PROCESSED=$((SQL_FILES_PROCESSED + 1))
    else
      echo "  ✗ Failed to apply: $filename"
      SQL_FILES_FAILED=$((SQL_FILES_FAILED + 1))
    fi
    echo ""
  fi
done

# Show current tables
echo "Current database tables:"
TABLES=$(mysql -h"$DB_HOST" -P"$DB_PORT" -u"$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" -sN -e "SHOW TABLES;" 2>/dev/null || echo "")

if [ -z "$TABLES" ]; then
  echo "  (No tables found)"
else
  echo "$TABLES" | while read -r table; do
    ROW_COUNT=$(mysql -h"$DB_HOST" -P"$DB_PORT" -u"$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" -sN -e "SELECT COUNT(*) FROM \`$table\`;" 2>/dev/null || echo "0")
    echo "  - $table ($ROW_COUNT rows)"
  done
fi

echo ""
echo "======================================="
echo "  Schema Sync Summary"
echo "======================================="
echo "SQL files found:     $SQL_FILES_FOUND"
echo "Successfully applied: $SQL_FILES_PROCESSED"
echo "Failed:              $SQL_FILES_FAILED"
echo ""

if [ $SQL_FILES_FAILED -eq 0 ]; then
  echo "✓ Schema sync completed successfully!"
else
  echo "⚠ Schema sync completed with errors"
fi

echo "======================================="
