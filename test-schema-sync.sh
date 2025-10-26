#!/bin/bash
# Test script for database schema auto-sync

echo "========================================="
echo "  Database Schema Sync Test"
echo "========================================="
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if docker-compose is running
if ! docker-compose ps | grep -q "scholar_mysql.*Up"; then
    echo -e "${RED}Error: MySQL container is not running${NC}"
    echo "Please start the project first: docker-compose up -d"
    exit 1
fi

echo "Step 1: Check current tables"
echo "-----------------------------"
CURRENT_TABLES=$(docker exec scholar_mysql mysql -u scholar_user -pscholar_pass scholar -sN -e "SHOW TABLES;" 2>/dev/null)

if [ -z "$CURRENT_TABLES" ]; then
    echo -e "${YELLOW}No tables found in database${NC}"
else
    echo "Current tables:"
    echo "$CURRENT_TABLES" | while read -r table; do
        echo "  - $table"
    done
fi
echo ""

echo "Step 2: Trigger schema sync"
echo "-----------------------------"
echo "Restarting schema-sync service..."
docker-compose up -d --force-recreate schema-sync

echo ""
echo "Waiting for sync to complete..."
sleep 5

echo ""
echo "Step 3: View sync logs"
echo "-----------------------------"
docker logs scholar_schema_sync
echo ""

echo "Step 4: Verify tables"
echo "-----------------------------"
NEW_TABLES=$(docker exec scholar_mysql mysql -u scholar_user -pscholar_pass scholar -sN -e "SHOW TABLES;" 2>/dev/null)

if [ -z "$NEW_TABLES" ]; then
    echo -e "${RED}✗ No tables found - sync may have failed${NC}"
    exit 1
else
    echo -e "${GREEN}✓ Tables found:${NC}"
    echo "$NEW_TABLES" | while read -r table; do
        ROW_COUNT=$(docker exec scholar_mysql mysql -u scholar_user -pscholar_pass scholar -sN -e "SELECT COUNT(*) FROM \`$table\`;" 2>/dev/null)
        echo "  - $table ($ROW_COUNT rows)"
    done
fi

echo ""
echo "Step 5: Check table structure"
echo "-----------------------------"
echo "Checking 'users' table structure:"
docker exec scholar_mysql mysql -u scholar_user -pscholar_pass scholar -e "DESCRIBE users;" 2>/dev/null

echo ""
echo "========================================="
echo -e "${GREEN}✓ Schema sync test completed!${NC}"
echo "========================================="
echo ""
echo "To add a new table:"
echo "1. Edit docker/mysql/init/01_schema.sql"
echo "2. Add: CREATE TABLE IF NOT EXISTS \`your_table\` (...);"
echo "3. Run: docker-compose restart schema-sync backend"
echo "4. Test: ./test-schema-sync.sh"
echo ""
