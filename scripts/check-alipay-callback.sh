#!/bin/bash

# Script to check Alipay callback logs
# Usage:
#   ./scripts/check-alipay-callback.sh           # Show all callback logs
#   ./scripts/check-alipay-callback.sh 10        # Show last 10 callbacks
#   ./scripts/check-alipay-callback.sh ORDER123  # Search for specific order

echo "=========================================="
echo "Alipay Callback Log Viewer"
echo "=========================================="

# 注:后端已迁到 slog 结构化日志,日志行形如 `msg="alipay callback ..." order_no=...`,
# 不再有旧的 [ALIPAY_CALLBACK_START/END] 标签。这里按 slog 实际输出 grep。
if [ -z "$1" ]; then
    echo "Showing all Alipay callback logs..."
    echo ""
    docker logs scholar_backend 2>&1 | grep -i "alipay callback"
elif [[ "$1" =~ ^[0-9]+$ ]]; then
    echo "Showing last $1 callback log lines..."
    echo ""
    docker logs scholar_backend 2>&1 | grep -i "alipay callback" | tail -n "$1"
else
    echo "Searching for order: $1..."
    echo ""
    docker logs scholar_backend 2>&1 | grep -i "alipay callback" | grep "$1"
fi

echo ""
echo "=========================================="
echo "Done!"
echo "=========================================="
