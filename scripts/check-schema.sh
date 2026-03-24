#!/bin/bash
# ============================================
# Scholar Database Schema Sync (Replay Mode)
# 按文件名排序依次执行所有 SQL 文件
# 所有 SQL 均需保证幂等性
# ============================================

set -e

DB_HOST="${DB_HOST:-mysql}"
DB_PORT="${DB_PORT:-3306}"
DB_USER="${MYSQL_USER:-scholar_user}"
DB_PASSWORD="${MYSQL_PASSWORD:-scholar_pass}"
DB_NAME="${MYSQL_DATABASE:-scholar}"
MIGRATIONS_DIR="/docker-entrypoint-initdb.d"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }

echo "======================================="
echo "  Scholar Database Schema Sync         "
echo "  Mode: Sequential Replay              "
echo "======================================="
echo "Database: $DB_NAME @ $DB_HOST:$DB_PORT"
echo ""

# 等待 MySQL 就绪
log_info "Waiting for MySQL to be ready..."
MAX_RETRIES=30
RETRY_COUNT=0

until mysql -h"$DB_HOST" -P"$DB_PORT" -u"$DB_USER" -p"$DB_PASSWORD" -e "SELECT 1" >/dev/null 2>&1; do
  RETRY_COUNT=$((RETRY_COUNT + 1))
  if [ $RETRY_COUNT -ge $MAX_RETRIES ]; then
    echo -e "${RED}[FATAL]${NC} MySQL failed to start after $MAX_RETRIES attempts"
    exit 1
  fi
  echo "  MySQL is unavailable - waiting... ($RETRY_COUNT/$MAX_RETRIES)"
  sleep 2
done

log_success "MySQL is ready!"
echo ""

# 检查 SQL 文件目录
SQL_FILES=$(ls "$MIGRATIONS_DIR"/*.sql 2>/dev/null | sort)
if [ -z "$SQL_FILES" ]; then
  echo -e "${RED}[FATAL]${NC} No SQL files found in $MIGRATIONS_DIR"
  exit 1
fi

FILE_COUNT=$(echo "$SQL_FILES" | wc -l | tr -d ' ')
log_info "Found $FILE_COUNT SQL file(s) to execute"
echo ""

# 按顺序执行所有 SQL 文件
EXECUTED=0
for SQL_FILE in $SQL_FILES; do
  FILENAME=$(basename "$SQL_FILE")
  log_info "Executing: $FILENAME"

  SQL_ERRORS=$(mktemp)

  if ! mysql -h"$DB_HOST" -P"$DB_PORT" -u"$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" < "$SQL_FILE" 2> "$SQL_ERRORS"; then
    echo -e "${RED}[FATAL]${NC} Failed: $FILENAME"
    echo -e "${RED}========== Error Output ==========${NC}"
    cat "$SQL_ERRORS"
    echo -e "${RED}==================================${NC}"
    rm -f "$SQL_ERRORS"
    exit 1
  fi

  # 检查非 Warning 的错误输出
  if [ -s "$SQL_ERRORS" ]; then
    REAL_ERRORS=$(grep -viE "warning|insecure" "$SQL_ERRORS" 2>/dev/null || true)
    if [ -n "$REAL_ERRORS" ]; then
      echo -e "${RED}[FATAL]${NC} Errors in: $FILENAME"
      echo "$REAL_ERRORS"
      rm -f "$SQL_ERRORS"
      exit 1
    fi
  fi

  rm -f "$SQL_ERRORS"
  EXECUTED=$((EXECUTED + 1))
  log_success "  Done: $FILENAME ($EXECUTED/$FILE_COUNT)"
done

echo ""

# 显示最终状态
log_info "Database status:"
echo ""

TABLES=$(mysql -h"$DB_HOST" -P"$DB_PORT" -u"$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" -sN -e "SHOW TABLES;" 2>/dev/null) || {
  log_warning "Failed to list tables"
  TABLES=""
}

TABLE_COUNT=0
for TABLE in $TABLES; do
  ROW_COUNT=$(mysql -h"$DB_HOST" -P"$DB_PORT" -u"$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" -sN -e "SELECT COUNT(*) FROM \`$TABLE\`;" 2>/dev/null) || ROW_COUNT="?"
  printf "  %-40s %6s rows\n" "$TABLE" "$ROW_COUNT"
  TABLE_COUNT=$((TABLE_COUNT + 1))
done

echo ""
echo "======================================="
echo "  Schema Sync Summary"
echo "======================================="
echo "  SQL files executed: $EXECUTED"
echo "  Total tables: $TABLE_COUNT"
echo "======================================="
echo ""

log_success "Schema sync completed successfully!"

exit 0
