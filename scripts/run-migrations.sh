#!/bin/bash
# ============================================
# Scholar 数据库迁移执行脚本
# 按编号顺序依次执行 migrations/ 目录下的所有 SQL 文件
# 每次重启全量重放，通过幂等 SQL 保证安全性
# ============================================

set -e

# 数据库连接配置
DB_HOST="${DB_HOST:-mysql}"
DB_PORT="${DB_PORT:-3306}"
DB_USER="${MYSQL_USER:-scholar_user}"
DB_PASSWORD="${MYSQL_PASSWORD:-scholar_pass}"
DB_NAME="${MYSQL_DATABASE:-scholar}"
MIGRATIONS_DIR="/docker-entrypoint-initdb.d/migrations"

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# 日志函数
log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
log_step() { echo -e "${CYAN}[STEP]${NC} $1"; }

fatal_error() {
    echo -e "${RED}[FATAL]${NC} $1"
    exit 1
}

echo "======================================="
echo "  Scholar 数据库迁移系统"
echo "======================================="
echo "数据库: $DB_NAME"
echo "地址: $DB_HOST:$DB_PORT"
echo "迁移目录: $MIGRATIONS_DIR"
echo ""

# 等待 MySQL 准备就绪
log_info "等待 MySQL 准备就绪..."
MAX_RETRIES=30
RETRY_COUNT=0

until mysql -h"$DB_HOST" -P"$DB_PORT" -u"$DB_USER" -p"$DB_PASSWORD" -e "SELECT 1" >/dev/null 2>&1; do
    RETRY_COUNT=$((RETRY_COUNT + 1))
    if [ $RETRY_COUNT -ge $MAX_RETRIES ]; then
        fatal_error "MySQL 在 $MAX_RETRIES 次尝试后仍未就绪"
    fi
    echo "  MySQL 未就绪 - 等待中... ($RETRY_COUNT/$MAX_RETRIES)"
    sleep 2
done

log_success "MySQL 已就绪！"
echo ""

# 检查迁移目录
if [ ! -d "$MIGRATIONS_DIR" ]; then
    fatal_error "迁移目录不存在: $MIGRATIONS_DIR"
fi

# 获取所有 SQL 文件并按文件名排序
SQL_FILES=$(find "$MIGRATIONS_DIR" -maxdepth 1 -name "*.sql" -type f | sort)
FILE_COUNT=$(echo "$SQL_FILES" | grep -c "\.sql$" || echo "0")

if [ "$FILE_COUNT" -eq 0 ]; then
    fatal_error "迁移目录中没有 SQL 文件"
fi

log_info "发现 $FILE_COUNT 个迁移文件"
echo ""

# 依次执行每个迁移文件
EXECUTED=0
FAILED=0
START_TIME=$(date +%s)

for SQL_FILE in $SQL_FILES; do
    FILE_NAME=$(basename "$SQL_FILE")
    EXECUTED=$((EXECUTED + 1))

    log_step "[$EXECUTED/$FILE_COUNT] 执行: $FILE_NAME"

    # 创建临时文件存储错误输出
    SQL_ERRORS=$(mktemp)

    # 执行 SQL 文件
    if ! mysql -h"$DB_HOST" -P"$DB_PORT" -u"$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" < "$SQL_FILE" 2> "$SQL_ERRORS"; then
        echo -e "${RED}  ✗ 执行失败！${NC}"
        echo -e "${RED}  ========== 错误信息 ==========${NC}"
        cat "$SQL_ERRORS"
        echo -e "${RED}  ==============================${NC}"
        rm -f "$SQL_ERRORS"
        fatal_error "迁移文件 $FILE_NAME 执行失败，终止迁移"
    fi

    # 检查是否有非 Warning 的错误
    if [ -s "$SQL_ERRORS" ]; then
        REAL_ERRORS=$(grep -viE "warning|insecure" "$SQL_ERRORS" 2>/dev/null || true)
        if [ -n "$REAL_ERRORS" ]; then
            echo -e "${RED}  ✗ 执行产生错误！${NC}"
            echo "$REAL_ERRORS"
            rm -f "$SQL_ERRORS"
            fatal_error "迁移文件 $FILE_NAME 产生错误，终止迁移"
        fi
    fi

    rm -f "$SQL_ERRORS"
    echo -e "${GREEN}  ✓ 完成${NC}"
done

END_TIME=$(date +%s)
ELAPSED=$((END_TIME - START_TIME))

echo ""
log_success "全部 $EXECUTED 个迁移文件执行成功！（耗时 ${ELAPSED}秒）"
echo ""

# 清理工具存储过程
log_info "清理工具存储过程..."
mysql -h"$DB_HOST" -P"$DB_PORT" -u"$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" -e "
    DROP PROCEDURE IF EXISTS add_column_if_not_exists;
    DROP PROCEDURE IF EXISTS add_index_if_not_exists;
    DROP PROCEDURE IF EXISTS add_foreign_key_if_not_exists;
    DROP PROCEDURE IF EXISTS drop_index_if_exists;
" 2>/dev/null || log_warning "清理存储过程时出现警告（可忽略）"
log_success "存储过程已清理"
echo ""

# 显示数据库状态统计
log_info "当前数据库状态:"
echo ""

TABLES=$(mysql -h"$DB_HOST" -P"$DB_PORT" -u"$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" -sN -e "SHOW TABLES;" 2>/dev/null) || {
    fatal_error "无法获取表列表"
}

TABLE_COUNT=0
echo "数据库表列表:"
for TABLE in $TABLES; do
    ROW_COUNT=$(mysql -h"$DB_HOST" -P"$DB_PORT" -u"$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" -sN -e "SELECT COUNT(*) FROM \`$TABLE\`;" 2>/dev/null) || ROW_COUNT="?"
    COL_COUNT=$(mysql -h"$DB_HOST" -P"$DB_PORT" -u"$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" -sN -e "
        SELECT COUNT(*) FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA='$DB_NAME' AND TABLE_NAME='$TABLE';" 2>/dev/null) || COL_COUNT="?"
    IDX_COUNT=$(mysql -h"$DB_HOST" -P"$DB_PORT" -u"$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" -sN -e "
        SELECT COUNT(DISTINCT INDEX_NAME) FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA='$DB_NAME' AND TABLE_NAME='$TABLE';" 2>/dev/null) || IDX_COUNT="?"

    printf "  %-35s %6s 行, %3s 列, %2s 索引\n" "$TABLE" "$ROW_COUNT" "$COL_COUNT" "$IDX_COUNT"
    TABLE_COUNT=$((TABLE_COUNT + 1))
done

echo ""
echo "======================================="
echo "  迁移完成统计"
echo "======================================="
echo "迁移文件数: $EXECUTED"
echo "数据库表数: $TABLE_COUNT"
echo "总耗时: ${ELAPSED}秒"
echo ""

log_success "数据库迁移全部完成！"
echo "======================================="

exit 0
