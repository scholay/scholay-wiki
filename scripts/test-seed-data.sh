#!/bin/bash
# 测试预置数据的幂等性
# 此脚本验证重启后预置数据不会被覆盖

set -e

echo "======================================="
echo "  预置数据幂等性测试"
echo "======================================="
echo ""

# 颜色定义
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

DB_HOST="${DB_HOST:-mysql}"
DB_USER="${MYSQL_USER:-scholar_user}"
DB_PASSWORD="${MYSQL_PASSWORD:-scholar_pass}"
DB_NAME="${MYSQL_DATABASE:-scholar}"

echo -e "${BLUE}1. 检查预置订阅计划数据...${NC}"
PLANS_COUNT=$(mysql -h"$DB_HOST" -u"$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" -sN -e "SELECT COUNT(*) FROM subscription_plans WHERE plan_code IN ('free', 'pro', 'max');")
echo "   订阅计划数量: $PLANS_COUNT (应该是 3)"

echo ""
echo -e "${BLUE}2. 检查FREE计划价格...${NC}"
FREE_PRICE=$(mysql -h"$DB_HOST" -u"$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" -sN -e "SELECT price_monthly FROM subscription_plans WHERE plan_code = 'free';")
echo "   FREE计划月价格: ¥$FREE_PRICE (应该是 0.00)"

echo ""
echo -e "${BLUE}3. 模拟管理员修改价格...${NC}"
mysql -h"$DB_HOST" -u"$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" -e "UPDATE subscription_plans SET price_monthly = 99.00, plan_name = 'FREE修改版' WHERE plan_code = 'free';" 2>/dev/null || echo "   更新失败"
MODIFIED_PRICE=$(mysql -h"$DB_HOST" -u"$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" -sN -e "SELECT price_monthly FROM subscription_plans WHERE plan_code = 'free';")
MODIFIED_NAME=$(mysql -h"$DB_HOST" -u"$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" -sN -e "SELECT plan_name FROM subscription_plans WHERE plan_code = 'free';")
echo "   修改后月价格: ¥$MODIFIED_PRICE"
echo "   修改后名称: $MODIFIED_NAME"

echo ""
echo -e "${BLUE}4. 重新执行预置数据脚本 (模拟重启)...${NC}"
mysql -h"$DB_HOST" -u"$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" < /docker-entrypoint-initdb.d/migrations/0003_initial_defaults.sql 2>&1 | grep -v "Duplicate entry" || true

echo ""
echo -e "${BLUE}5. 验证数据是否被覆盖...${NC}"
FINAL_PRICE=$(mysql -h"$DB_HOST" -u"$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" -sN -e "SELECT price_monthly FROM subscription_plans WHERE plan_code = 'free';")
FINAL_NAME=$(mysql -h"$DB_HOST" -u"$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" -sN -e "SELECT plan_name FROM subscription_plans WHERE plan_code = 'free';")
echo "   重启后月价格: ¥$FINAL_PRICE"
echo "   重启后名称: $FINAL_NAME"

echo ""
echo "======================================="
echo "  测试结果"
echo "======================================="

if [ "$FINAL_PRICE" = "$MODIFIED_PRICE" ] && [ "$FINAL_NAME" = "$MODIFIED_NAME" ]; then
    echo -e "${GREEN}✓ 通过!${NC} 预置数据未被覆盖"
    echo -e "${GREEN}✓ INSERT IGNORE 工作正常${NC}"

    # 恢复原始数据用于下次测试
    echo ""
    echo "恢复原始数据..."
    mysql -h"$DB_HOST" -u"$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" -e "UPDATE subscription_plans SET price_monthly = 0.00, plan_name = 'FREE' WHERE plan_code = 'free';"
    echo -e "${GREEN}✓ 已恢复${NC}"
    exit 0
else
    echo -e "${YELLOW}✗ 失败!${NC} 数据被覆盖了"
    echo "期望价格: $MODIFIED_PRICE, 实际: $FINAL_PRICE"
    echo "期望名称: $MODIFIED_NAME, 实际: $FINAL_NAME"
    exit 1
fi
