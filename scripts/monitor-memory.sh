#!/bin/bash
# ============================================================================
# Scholay学术 V1.0
# 内存监控脚本
# Copyright (c) 2025 成都恩特罐罐文化科技有限公司
# ============================================================================
# 
# 用法:
#   ./scripts/monitor-memory.sh          # 显示所有容器内存使用情况
#   ./scripts/monitor-memory.sh -a       # 同上
#   ./scripts/monitor-memory.sh -w       # 持续监控模式（每 10 秒刷新）
#   ./scripts/monitor-memory.sh -c       # 检查是否超过告警阈值
#   ./scripts/monitor-memory.sh -r       # 显示 Redis 详细内存信息
#   ./scripts/monitor-memory.sh -m       # 显示 MySQL 详细内存信息
#

set -e

# 颜色定义
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 告警阈值（百分比）
WARN_THRESHOLD=70
CRITICAL_THRESHOLD=85

# 容器名称(与当前 compose 对齐:frontend_admin 已下线;补上最易 OOM 的 agent / prism_tex 及 minio/umami/egress)。
CONTAINERS=("scholar_mysql" "scholar_redis" "scholar_minio" "scholar_backend" "scholar_agent" "scholar_prism_tex" "scholar_nginx" "scholar_frontend_user" "scholar_umami")

# 打印带颜色的消息
print_header() {
    echo -e "\n${BLUE}========================================${NC}"
    echo -e "${BLUE}  Scholar 内存监控 - $(date '+%Y-%m-%d %H:%M:%S')${NC}"
    echo -e "${BLUE}========================================${NC}\n"
}

# 获取容器内存使用情况
get_container_memory() {
    local container=$1
    docker stats --no-stream --format "table {{.Name}}\t{{.MemUsage}}\t{{.MemPerc}}" "$container" 2>/dev/null | tail -n 1
}

# 检查内存使用是否超过阈值
check_threshold() {
    local container=$1
    local mem_perc=$(docker stats --no-stream --format "{{.MemPerc}}" "$container" 2>/dev/null | tr -d '%')
    
    if [ -z "$mem_perc" ]; then
        return
    fi
    
    # 转换为整数比较
    local mem_int=${mem_perc%.*}
    
    if [ "$mem_int" -ge "$CRITICAL_THRESHOLD" ]; then
        echo -e "${RED}[CRITICAL]${NC} $container: ${mem_perc}% (阈值: ${CRITICAL_THRESHOLD}%)"
        return 2
    elif [ "$mem_int" -ge "$WARN_THRESHOLD" ]; then
        echo -e "${YELLOW}[WARNING]${NC} $container: ${mem_perc}% (阈值: ${WARN_THRESHOLD}%)"
        return 1
    else
        echo -e "${GREEN}[OK]${NC} $container: ${mem_perc}%"
        return 0
    fi
}

# 显示所有容器内存使用情况
show_all_memory() {
    print_header
    
    echo -e "${BLUE}容器内存使用情况:${NC}"
    echo "----------------------------------------"
    
    for container in "${CONTAINERS[@]}"; do
        if docker ps --format '{{.Names}}' | grep -q "^${container}$"; then
            get_container_memory "$container"
        else
            echo -e "${YELLOW}$container: 未运行${NC}"
        fi
    done
    
    echo ""
    echo -e "${BLUE}系统总体内存:${NC}"
    free -h 2>/dev/null || echo "无法获取系统内存信息"
}

# 持续监控模式
watch_memory() {
    echo -e "${BLUE}持续监控模式 (每 10 秒刷新，按 Ctrl+C 退出)${NC}\n"
    
    while true; do
        clear
        show_all_memory
        sleep 10
    done
}

# 检查告警阈值
check_alerts() {
    print_header
    
    echo -e "${BLUE}内存告警检查:${NC}"
    echo "----------------------------------------"
    
    local has_warning=0
    local has_critical=0
    
    for container in "${CONTAINERS[@]}"; do
        if docker ps --format '{{.Names}}' | grep -q "^${container}$"; then
            check_threshold "$container"
            local result=$?
            if [ $result -eq 2 ]; then
                has_critical=1
            elif [ $result -eq 1 ]; then
                has_warning=1
            fi
        fi
    done
    
    echo ""
    
    if [ $has_critical -eq 1 ]; then
        echo -e "${RED}存在内存临界告警，建议立即检查!${NC}"
        exit 2
    elif [ $has_warning -eq 1 ]; then
        echo -e "${YELLOW}存在内存警告，建议关注!${NC}"
        exit 1
    else
        echo -e "${GREEN}所有容器内存使用正常${NC}"
        exit 0
    fi
}

# 显示 Redis 详细内存信息
show_redis_memory() {
    print_header
    
    echo -e "${BLUE}Redis 内存详情:${NC}"
    echo "----------------------------------------"
    
    if ! docker ps --format '{{.Names}}' | grep -q "^scholar_redis$"; then
        echo -e "${RED}Redis 容器未运行${NC}"
        exit 1
    fi
    
    echo -e "\n${BLUE}内存信息:${NC}"
    docker exec scholar_redis redis-cli INFO memory | grep -E "^(used_memory|used_memory_human|used_memory_peak|maxmemory|mem_fragmentation_ratio)"
    
    echo -e "\n${BLUE}键空间信息:${NC}"
    docker exec scholar_redis redis-cli INFO keyspace
    
    echo -e "\n${BLUE}客户端连接:${NC}"
    docker exec scholar_redis redis-cli INFO clients | grep -E "^(connected_clients|blocked_clients)"
}

# 显示 MySQL 详细内存信息
show_mysql_memory() {
    print_header
    
    echo -e "${BLUE}MySQL 内存详情:${NC}"
    echo "----------------------------------------"
    
    if ! docker ps --format '{{.Names}}' | grep -q "^scholar_mysql$"; then
        echo -e "${RED}MySQL 容器未运行${NC}"
        exit 1
    fi
    
    echo -e "\n${BLUE}InnoDB 缓冲池状态:${NC}"
    docker exec scholar_mysql mysql -u root -p${MYSQL_ROOT_PASSWORD:-rootpassword} -e "SHOW STATUS LIKE 'Innodb_buffer_pool%'" 2>/dev/null | grep -E "(pool_size|pages_data|pages_free|read_requests|reads)"
    
    echo -e "\n${BLUE}连接状态:${NC}"
    docker exec scholar_mysql mysql -u root -p${MYSQL_ROOT_PASSWORD:-rootpassword} -e "SHOW STATUS LIKE 'Threads%'" 2>/dev/null
    
    echo -e "\n${BLUE}全局内存配置:${NC}"
    docker exec scholar_mysql mysql -u root -p${MYSQL_ROOT_PASSWORD:-rootpassword} -e "SHOW VARIABLES LIKE '%buffer%size'" 2>/dev/null | head -20
}

# 显示帮助信息
show_help() {
    echo "Scholar 内存监控脚本"
    echo ""
    echo "用法: $0 [选项]"
    echo ""
    echo "选项:"
    echo "  -a, --all        显示所有容器内存使用情况 (默认)"
    echo "  -w, --watch      持续监控模式（每 10 秒刷新）"
    echo "  -c, --check      检查是否超过告警阈值"
    echo "  -r, --redis      显示 Redis 详细内存信息"
    echo "  -m, --mysql      显示 MySQL 详细内存信息"
    echo "  -h, --help       显示此帮助信息"
    echo ""
    echo "告警阈值:"
    echo "  WARNING:  ${WARN_THRESHOLD}%"
    echo "  CRITICAL: ${CRITICAL_THRESHOLD}%"
}

# 主函数
main() {
    case "${1:-}" in
        -a|--all|"")
            show_all_memory
            ;;
        -w|--watch)
            watch_memory
            ;;
        -c|--check)
            check_alerts
            ;;
        -r|--redis)
            show_redis_memory
            ;;
        -m|--mysql)
            show_mysql_memory
            ;;
        -h|--help)
            show_help
            ;;
        *)
            echo "未知选项: $1"
            show_help
            exit 1
            ;;
    esac
}

main "$@"
