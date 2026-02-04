#!/bin/bash

# Docker 日志导出脚本
# 用法:
#   ./scripts/export-logs.sh              # 导出所有容器最近24小时日志
#   ./scripts/export-logs.sh backend      # 只导出后端日志
#   ./scripts/export-logs.sh --all        # 导出所有容器全部日志
#   ./scripts/export-logs.sh --hours 48   # 导出最近48小时日志

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
LOGS_DIR="$PROJECT_ROOT/logs"
HOURS=24

# 容器列表
CONTAINERS="scholar_backend scholar_frontend_user scholar_frontend_admin scholar_nginx scholar_mysql scholar_redis"

# 解析参数
ALL_LOGS=false
TARGET=""

while [[ $# -gt 0 ]]; do
    case $1 in
        --all|-a)
            ALL_LOGS=true
            shift
            ;;
        --hours|-h)
            HOURS="$2"
            shift 2
            ;;
        --help)
            echo "用法: $0 [选项] [容器名]"
            echo ""
            echo "选项:"
            echo "  --all, -a       导出全部日志（不限时间）"
            echo "  --hours N, -h N 导出最近 N 小时日志（默认24）"
            echo "  --help          显示帮助"
            echo ""
            echo "容器名: backend, frontend-user, frontend-admin, nginx, mysql, redis"
            echo ""
            echo "示例:"
            echo "  $0                  # 导出所有容器最近24小时日志"
            echo "  $0 backend          # 只导出后端日志"
            echo "  $0 --hours 48       # 导出最近48小时日志"
            echo "  $0 --all backend    # 导出后端全部日志"
            exit 0
            ;;
        *)
            TARGET="scholar_$1"
            shift
            ;;
    esac
done

# 创建日志目录
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
EXPORT_DIR="$LOGS_DIR/$TIMESTAMP"
mkdir -p "$EXPORT_DIR"

echo "导出日志到: $EXPORT_DIR"
echo ""

# 导出函数
export_log() {
    local container=$1
    local name=$(echo "$container" | sed 's/scholar_//')
    
    if ! docker ps -a --format '{{.Names}}' | grep -q "^${container}$"; then
        echo "  [跳过] $name (容器不存在)"
        return
    fi
    
    local logfile="$EXPORT_DIR/${name}.log"
    
    if [ "$ALL_LOGS" = true ]; then
        docker logs -t "$container" > "$logfile" 2>&1
    else
        docker logs -t --since "${HOURS}h" "$container" > "$logfile" 2>&1
    fi
    
    local size=$(ls -lh "$logfile" | awk '{print $5}')
    local lines=$(wc -l < "$logfile" | tr -d ' ')
    echo "  [完成] $name ($size, $lines 行)"
}

# 执行导出
if [ -n "$TARGET" ]; then
    export_log "$TARGET"
else
    for container in $CONTAINERS; do
        export_log "$container"
    done
fi

echo ""
echo "日志已导出到: $EXPORT_DIR"
ls -lh "$EXPORT_DIR"
