#!/bin/bash
# Database Schema Auto-Sync Script
# This script automatically syncs database schema from init files on every startup
# It safely applies CREATE TABLE IF NOT EXISTS and ALTER TABLE statements

set -e  # Exit on error

DB_HOST="${DB_HOST:-mysql}"
DB_PORT="${DB_PORT:-3306}"
DB_USER="${MYSQL_USER:-scholar_user}"
DB_PASSWORD="${MYSQL_PASSWORD:-scholar_pass}"
DB_NAME="${MYSQL_DATABASE:-scholar}"
INIT_DIR="/docker-entrypoint-initdb.d"

# Color codes for better readability
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

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

echo -e "${GREEN}✓ MySQL is ready!${NC}"
echo ""

# Check if init directory exists and has SQL files
if [ ! -d "$INIT_DIR" ]; then
  echo -e "${YELLOW}⚠ Warning: Init directory not found: $INIT_DIR${NC}"
  exit 0
fi

# Count SQL files
SQL_FILE_COUNT=$(find "$INIT_DIR" -maxdepth 1 -name "*.sql" -type f | wc -l)
if [ "$SQL_FILE_COUNT" -eq 0 ]; then
  echo -e "${YELLOW}⚠ No SQL files found in $INIT_DIR${NC}"
  exit 0
fi

# Apply schema from init files
echo "Syncing database schema from init files..."
echo ""

SQL_FILES_FOUND=0
SQL_FILES_PROCESSED=0
SQL_FILES_FAILED=0

# Process files in sorted order (01_schema.sql, 02_..., etc.)
for sql_file in $(find "$INIT_DIR" -maxdepth 1 -name "*.sql" -type f | sort); do
  SQL_FILES_FOUND=$((SQL_FILES_FOUND + 1))
  filename=$(basename "$sql_file")

  echo -e "${BLUE}Processing: $filename${NC}"

  # Execute SQL file and capture output
  if OUTPUT=$(mysql -h"$DB_HOST" -P"$DB_PORT" -u"$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" < "$sql_file" 2>&1); then
    echo -e "  ${GREEN}✓ Successfully applied: $filename${NC}"
    SQL_FILES_PROCESSED=$((SQL_FILES_PROCESSED + 1))

    # Show any output messages (like from SELECT statements)
    if [ -n "$OUTPUT" ]; then
      echo "$OUTPUT" | while IFS= read -r line; do
        echo "    $line"
      done
    fi
  else
    echo -e "  ${RED}✗ Failed to apply: $filename${NC}"
    echo -e "  ${RED}Error: $OUTPUT${NC}"
    SQL_FILES_FAILED=$((SQL_FILES_FAILED + 1))
  fi
  echo ""
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
echo -e "Successfully applied: ${GREEN}$SQL_FILES_PROCESSED${NC}"
echo -e "Failed:              ${RED}$SQL_FILES_FAILED${NC}"
echo ""

if [ $SQL_FILES_FAILED -eq 0 ]; then
  echo -e "${GREEN}✓ Schema sync completed successfully!${NC}"
  exit 0
else
  echo -e "${RED}⚠ Schema sync completed with $SQL_FILES_FAILED error(s)${NC}"
  exit 1
fi

echo "======================================="
