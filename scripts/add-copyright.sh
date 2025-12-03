#!/bin/bash
# ============================================================================
# 版权声明添加脚本
# 软件名称: Scholay学术 V1.0
# 著作权人: 成都恩特罐罐文化科技有限公司
# ============================================================================

# Go文件的版权头
GO_COPYRIGHT='// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

'

# JavaScript/JSX文件的版权头
JS_COPYRIGHT='/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 */

'

# CSS文件的版权头
CSS_COPYRIGHT='/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 */

'

# SQL文件的版权头
SQL_COPYRIGHT='-- ============================================================================
-- Scholay学术 V1.0
-- Copyright (c) 2025 成都恩特罐罐文化科技有限公司
-- 统一社会信用代码: 91510100MAEEHRNE26
-- All Rights Reserved.
-- ============================================================================

'

# HTML文件的版权头
HTML_COPYRIGHT='<!--
============================================================================
Scholay学术 V1.0
Copyright (c) 2025 成都恩特罐罐文化科技有限公司
统一社会信用代码: 91510100MAEEHRNE26
All Rights Reserved.
============================================================================
-->

'

# 函数: 为文件添加版权头
add_copyright() {
    local file="$1"
    local copyright="$2"
    local marker="$3"

    # 检查文件是否已有版权声明
    if grep -q "成都恩特罐罐文化科技有限公司" "$file" 2>/dev/null; then
        echo "跳过 (已有版权): $file"
        return
    fi

    # 创建临时文件
    local temp_file=$(mktemp)

    # 写入版权头和原文件内容
    echo -n "$copyright" > "$temp_file"
    cat "$file" >> "$temp_file"

    # 替换原文件
    mv "$temp_file" "$file"
    echo "已添加版权: $file"
}

# 处理Go文件
echo "========== 处理 Go 文件 =========="
find backend -name "*.go" -type f | while read file; do
    add_copyright "$file" "$GO_COPYRIGHT" "//"
done

# 处理JavaScript/JSX文件 (排除node_modules和build)
echo ""
echo "========== 处理 JavaScript 文件 =========="
find frontend-user/src frontend-admin/src -name "*.js" -o -name "*.jsx" 2>/dev/null | while read file; do
    add_copyright "$file" "$JS_COPYRIGHT" "/*"
done

# 处理CSS文件 (排除node_modules和build)
echo ""
echo "========== 处理 CSS 文件 =========="
find frontend-user/src frontend-admin/src -name "*.css" 2>/dev/null | while read file; do
    add_copyright "$file" "$CSS_COPYRIGHT" "/*"
done

# 处理SQL文件
echo ""
echo "========== 处理 SQL 文件 =========="
find docker -name "*.sql" -type f | while read file; do
    add_copyright "$file" "$SQL_COPYRIGHT" "--"
done

# 处理HTML文件
echo ""
echo "========== 处理 HTML 文件 =========="
find frontend-user/public frontend-admin/public -name "*.html" 2>/dev/null | while read file; do
    add_copyright "$file" "$HTML_COPYRIGHT" "<!--"
done

echo ""
echo "========== 版权声明添加完成 =========="
echo "软件名称: Scholay学术 V1.0"
echo "著作权人: 成都恩特罐罐文化科技有限公司"
echo "统一社会信用代码: 91510100MAEEHRNE26"
