#!/bin/bash
# ============================================
# Scholar Database Schema Auto-Sync Script
# 自动同步表、字段、索引的变化
# ============================================

set -e

# 数据库连接配置
DB_HOST="${DB_HOST:-mysql}"
DB_PORT="${DB_PORT:-3306}"
DB_USER="${MYSQL_USER:-scholar_user}"
DB_PASSWORD="${MYSQL_PASSWORD:-scholar_pass}"
DB_NAME="${MYSQL_DATABASE:-scholar}"
SCHEMA_FILE="/docker-entrypoint-initdb.d/01_schema.sql"

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# 日志函数
log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

echo "======================================="
echo "  Scholar Database Schema Auto-Sync   "
echo "======================================="
echo "Database: $DB_NAME"
echo "Host: $DB_HOST:$DB_PORT"
echo ""

# 等待MySQL准备就绪
log_info "Waiting for MySQL to be ready..."
MAX_RETRIES=30
RETRY_COUNT=0

until mysql -h"$DB_HOST" -P"$DB_PORT" -u"$DB_USER" -p"$DB_PASSWORD" -e "SELECT 1" >/dev/null 2>&1; do
  RETRY_COUNT=$((RETRY_COUNT + 1))
  if [ $RETRY_COUNT -ge $MAX_RETRIES ]; then
    log_error "MySQL failed to start after $MAX_RETRIES attempts"
    exit 1
  fi
  echo "MySQL is unavailable - waiting... ($RETRY_COUNT/$MAX_RETRIES)"
  sleep 2
done

log_success "MySQL is ready!"
echo ""

# 检查schema文件是否存在
if [ ! -f "$SCHEMA_FILE" ]; then
  log_error "Schema file not found: $SCHEMA_FILE"
  exit 1
fi

# 1. 首先应用CREATE TABLE IF NOT EXISTS（创建不存在的表）
log_info "Creating tables if not exists..."
mysql -h"$DB_HOST" -P"$DB_PORT" -u"$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" < "$SCHEMA_FILE" 2>&1 | grep -v "Warning" || true

# 2. 同步字段和索引
log_info "Synchronizing columns and indexes..."

# 从schema文件提取所有表名
TABLES=$(grep "^CREATE TABLE IF NOT EXISTS" "$SCHEMA_FILE" | sed "s/.*\`\([^\`]*\)\`.*/\1/")

for TABLE in $TABLES; do
    echo "Checking table: $TABLE"

    # 获取表定义的起止行号
    START_LINE=$(grep -n "^CREATE TABLE IF NOT EXISTS \`$TABLE\`" "$SCHEMA_FILE" | cut -d: -f1)
    END_LINE=$(tail -n +$START_LINE "$SCHEMA_FILE" | grep -n "^) ENGINE=" | head -1 | cut -d: -f1)
    END_LINE=$((START_LINE + END_LINE - 1))

    # 提取表定义内容
    TABLE_DEF=$(sed -n "${START_LINE},${END_LINE}p" "$SCHEMA_FILE")

    # ========== 同步字段 ==========
    # 提取schema中的字段（排除PRIMARY KEY、INDEX等行，但保留字段定义中的UNIQUE约束）
    # 首先收集schema中定义的所有字段名
    SCHEMA_FIELDS=""
    echo "$TABLE_DEF" | grep "^  \`" | grep -v "PRIMARY KEY\|^  INDEX\|^  UNIQUE\|^  KEY\|^  CONSTRAINT\|^  FOREIGN KEY" | while IFS= read -r LINE; do
        # 提取字段名
        FIELD_NAME=$(echo "$LINE" | sed "s/^  \`\([^\`]*\)\`.*/\1/")
        # 提取字段定义（去掉字段名和末尾逗号，保留 UNIQUE 约束）
        # 注意：保留 UNIQUE 可以确保新增字段的唯一性约束不丢失
        # 虽然可能导致索引名称不可控，但功能上是正确的
        FIELD_DEF=$(echo "$LINE" | sed "s/^  \`[^\`]*\` //; s/,$//")

        # 检查字段是否存在
        EXISTS=$(mysql -h"$DB_HOST" -P"$DB_PORT" -u"$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" -sN -e "
            SELECT COUNT(*) FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA='$DB_NAME'
            AND TABLE_NAME='$TABLE'
            AND COLUMN_NAME='$FIELD_NAME'" 2>/dev/null)

        if [ "$EXISTS" = "0" ]; then
            # 字段不存在，添加字段（保留 UNIQUE 约束，确保唯一性不丢失）
            log_info "  Adding column: $FIELD_NAME"
            mysql -h"$DB_HOST" -P"$DB_PORT" -u"$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" -e "
                ALTER TABLE \`$TABLE\` ADD COLUMN \`$FIELD_NAME\` $FIELD_DEF" 2>/dev/null || log_warning "  Failed to add column $FIELD_NAME"
        else
            # 字段存在，跳过 MODIFY 操作（避免重复创建索引）
            # 注意：MODIFY COLUMN 会导致包含 UNIQUE 的字段重复创建索引
            # 如果确实需要修改字段类型，请手动执行 ALTER TABLE MODIFY COLUMN
            echo "  ✓ Column $FIELD_NAME exists"
        fi
    done

    # ========== 删除schema中不存在的字段 ==========
    # 注意：删除字段是危险操作，可能导致数据丢失
    # 因此这个功能已被禁用。如需删除字段，请手动执行 ALTER TABLE DROP COLUMN
    # log_info "  Skipping column removal (disabled for safety)"

    # ========== 同步索引 ==========
    # 提取schema中的索引
    echo "$TABLE_DEF" | grep -E "^  (INDEX|UNIQUE)" | grep -v "PRIMARY KEY\|FOREIGN KEY" | while IFS= read -r LINE; do
        # 判断索引类型
        IS_UNIQUE=0
        if echo "$LINE" | grep -q "UNIQUE"; then
            IS_UNIQUE=1
        fi

        # 提取索引名和字段
        INDEX_NAME=$(echo "$LINE" | sed "s/.*\`\([^\`]*\)\`.*/\1/")
        INDEX_COLS=$(echo "$LINE" | sed "s/.*(\(.*\)).*/\1/")

        # 检查索引是否存在
        EXISTS=$(mysql -h"$DB_HOST" -P"$DB_PORT" -u"$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" -sN -e "
            SELECT COUNT(*) FROM information_schema.STATISTICS
            WHERE TABLE_SCHEMA='$DB_NAME'
            AND TABLE_NAME='$TABLE'
            AND INDEX_NAME='$INDEX_NAME'" 2>/dev/null)

        if [ "$EXISTS" = "0" ]; then
            # 索引不存在，创建索引
            if [ "$IS_UNIQUE" = "1" ]; then
                log_info "  Adding unique index: $INDEX_NAME"
                mysql -h"$DB_HOST" -P"$DB_PORT" -u"$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" -e "
                    CREATE UNIQUE INDEX \`$INDEX_NAME\` ON \`$TABLE\` ($INDEX_COLS)" 2>/dev/null || log_warning "  Failed to add unique index $INDEX_NAME"
            else
                log_info "  Adding index: $INDEX_NAME"
                mysql -h"$DB_HOST" -P"$DB_PORT" -u"$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" -e "
                    CREATE INDEX \`$INDEX_NAME\` ON \`$TABLE\` ($INDEX_COLS)" 2>/dev/null || log_warning "  Failed to add index $INDEX_NAME"
            fi
        else
            echo "  ✓ Index $INDEX_NAME exists"
        fi
    done

    echo ""
done

# 3. 显示最终状态
log_info "Current database status:"
echo ""

TABLES=$(mysql -h"$DB_HOST" -P"$DB_PORT" -u"$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" -sN -e "SHOW TABLES;" 2>/dev/null)
TABLE_COUNT=0

echo "Tables in database:"
for TABLE in $TABLES; do
    ROW_COUNT=$(mysql -h"$DB_HOST" -P"$DB_PORT" -u"$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" -sN -e "SELECT COUNT(*) FROM \`$TABLE\`;" 2>/dev/null)
    COL_COUNT=$(mysql -h"$DB_HOST" -P"$DB_PORT" -u"$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" -sN -e "
        SELECT COUNT(*) FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA='$DB_NAME' AND TABLE_NAME='$TABLE';" 2>/dev/null)
    IDX_COUNT=$(mysql -h"$DB_HOST" -P"$DB_PORT" -u"$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" -sN -e "
        SELECT COUNT(DISTINCT INDEX_NAME) FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA='$DB_NAME' AND TABLE_NAME='$TABLE';" 2>/dev/null)

    printf "  %-30s %6s rows, %3s columns, %2s indexes\n" "$TABLE" "$ROW_COUNT" "$COL_COUNT" "$IDX_COUNT"
    TABLE_COUNT=$((TABLE_COUNT + 1))
done

echo ""
echo "======================================="
echo "  Schema Sync Summary"
echo "======================================="
echo "Total tables: $TABLE_COUNT"
echo ""

log_success "Schema sync completed successfully!"
echo "======================================="

exit 0