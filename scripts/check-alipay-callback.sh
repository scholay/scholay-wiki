#!/bin/bash

# Script to check Alipay callback logs
# Usage:
#   ./scripts/check-alipay-callback.sh           # Show all callback logs
#   ./scripts/check-alipay-callback.sh 10        # Show last 10 callbacks
#   ./scripts/check-alipay-callback.sh ORDER123  # Search for specific order

echo "=========================================="
echo "Alipay Callback Log Viewer"
echo "=========================================="

if [ -z "$1" ]; then
    echo "Showing all Alipay callback logs..."
    echo ""
    docker logs scholar_backend 2>&1 | grep -E "\[ALIPAY_CALLBACK"
elif [[ "$1" =~ ^[0-9]+$ ]]; then
    echo "Showing last $1 callback sessions..."
    echo ""
    docker logs scholar_backend 2>&1 | grep -E "ALIPAY_CALLBACK_START|ALIPAY_CALLBACK_END" | tail -n $(($1 * 2))
else
    echo "Searching for order: $1..."
    echo ""
    docker logs scholar_backend 2>&1 | grep -E "\[ALIPAY_CALLBACK" | grep "$1"
fi

echo ""
echo "=========================================="
echo "Done!"
echo "=========================================="
