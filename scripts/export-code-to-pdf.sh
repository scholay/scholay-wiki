#!/bin/bash
# ============================================================================
# 代码导出脚本 - 用于软件著作权申请
# 软件名称: Scholay学术 V1.0
# 著作权人: 成都恩特罐罐文化科技有限公司
# ============================================================================

OUTPUT_DIR="./code-export"
OUTPUT_FILE="$OUTPUT_DIR/Scholay学术_V1.0_源代码.txt"
TIMESTAMP=$(date "+%Y-%m-%d %H:%M:%S")

# 创建输出目录
mkdir -p "$OUTPUT_DIR"

# 清空或创建输出文件
cat > "$OUTPUT_FILE" << 'HEADER'
================================================================================
                          Scholay学术 V1.0 源代码清单
================================================================================

软件名称：Scholay学术
版本号：V1.0
著作权人：成都恩特罐罐文化科技有限公司
统一社会信用代码：91510100MAEEHRNE26

Copyright (c) 2025 成都恩特罐罐文化科技有限公司
All Rights Reserved. 保留所有权利。

================================================================================
                                   目    录
================================================================================

HEADER

echo "正在生成代码清单..."

# 生成目录
file_count=0
page_num=1

echo "" >> "$OUTPUT_FILE"
echo "一、后端代码 (Go)" >> "$OUTPUT_FILE"
echo "----------------------------------------" >> "$OUTPUT_FILE"
for file in $(find backend -name "*.go" -type f | sort); do
    file_count=$((file_count + 1))
    echo "  $file_count. $file" >> "$OUTPUT_FILE"
done

echo "" >> "$OUTPUT_FILE"
echo "二、前端代码 - 用户端 (JavaScript/JSX)" >> "$OUTPUT_FILE"
echo "----------------------------------------" >> "$OUTPUT_FILE"
for file in $(find frontend-user/src -name "*.js" -o -name "*.jsx" 2>/dev/null | sort); do
    file_count=$((file_count + 1))
    echo "  $file_count. $file" >> "$OUTPUT_FILE"
done

echo "" >> "$OUTPUT_FILE"
echo "三、前端代码 - 管理端 (JavaScript/JSX)" >> "$OUTPUT_FILE"
echo "----------------------------------------" >> "$OUTPUT_FILE"
for file in $(find frontend-admin/src -name "*.js" -o -name "*.jsx" 2>/dev/null | sort); do
    file_count=$((file_count + 1))
    echo "  $file_count. $file" >> "$OUTPUT_FILE"
done

echo "" >> "$OUTPUT_FILE"
echo "四、样式文件 (CSS)" >> "$OUTPUT_FILE"
echo "----------------------------------------" >> "$OUTPUT_FILE"
for file in $(find frontend-user/src frontend-admin/src -name "*.css" 2>/dev/null | sort); do
    file_count=$((file_count + 1))
    echo "  $file_count. $file" >> "$OUTPUT_FILE"
done

echo "" >> "$OUTPUT_FILE"
echo "五、数据库脚本 (SQL)" >> "$OUTPUT_FILE"
echo "----------------------------------------" >> "$OUTPUT_FILE"
for file in $(find docker -name "*.sql" -type f | sort); do
    file_count=$((file_count + 1))
    echo "  $file_count. $file" >> "$OUTPUT_FILE"
done

echo "" >> "$OUTPUT_FILE"
echo "总计文件数: $file_count" >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"

# 添加源代码内容
cat >> "$OUTPUT_FILE" << 'CONTENT_HEADER'

================================================================================
                                 源 代 码 正 文
================================================================================

CONTENT_HEADER

# 函数：添加文件内容
add_file_content() {
    local file="$1"
    local section="$2"

    echo "" >> "$OUTPUT_FILE"
    echo "================================================================================" >> "$OUTPUT_FILE"
    echo "文件: $file" >> "$OUTPUT_FILE"
    echo "================================================================================" >> "$OUTPUT_FILE"
    echo "" >> "$OUTPUT_FILE"

    # 添加行号
    nl -ba "$file" >> "$OUTPUT_FILE"

    echo "" >> "$OUTPUT_FILE"
    echo "---------------------------- 文件结束 ----------------------------" >> "$OUTPUT_FILE"
    echo "" >> "$OUTPUT_FILE"
}

echo "正在导出后端代码..."
echo "" >> "$OUTPUT_FILE"
echo "################################################################################" >> "$OUTPUT_FILE"
echo "#                          一、后端代码 (Go)                                   #" >> "$OUTPUT_FILE"
echo "################################################################################" >> "$OUTPUT_FILE"

for file in $(find backend -name "*.go" -type f | sort); do
    add_file_content "$file" "后端"
done

echo "正在导出前端用户端代码..."
echo "" >> "$OUTPUT_FILE"
echo "################################################################################" >> "$OUTPUT_FILE"
echo "#                    二、前端代码 - 用户端 (JavaScript/JSX)                    #" >> "$OUTPUT_FILE"
echo "################################################################################" >> "$OUTPUT_FILE"

for file in $(find frontend-user/src -name "*.js" -o -name "*.jsx" 2>/dev/null | sort); do
    add_file_content "$file" "前端用户端"
done

echo "正在导出前端管理端代码..."
echo "" >> "$OUTPUT_FILE"
echo "################################################################################" >> "$OUTPUT_FILE"
echo "#                    三、前端代码 - 管理端 (JavaScript/JSX)                    #" >> "$OUTPUT_FILE"
echo "################################################################################" >> "$OUTPUT_FILE"

for file in $(find frontend-admin/src -name "*.js" -o -name "*.jsx" 2>/dev/null | sort); do
    add_file_content "$file" "前端管理端"
done

echo "正在导出样式文件..."
echo "" >> "$OUTPUT_FILE"
echo "################################################################################" >> "$OUTPUT_FILE"
echo "#                           四、样式文件 (CSS)                                 #" >> "$OUTPUT_FILE"
echo "################################################################################" >> "$OUTPUT_FILE"

for file in $(find frontend-user/src frontend-admin/src -name "*.css" 2>/dev/null | sort); do
    add_file_content "$file" "样式"
done

echo "正在导出数据库脚本..."
echo "" >> "$OUTPUT_FILE"
echo "################################################################################" >> "$OUTPUT_FILE"
echo "#                          五、数据库脚本 (SQL)                                #" >> "$OUTPUT_FILE"
echo "################################################################################" >> "$OUTPUT_FILE"

for file in $(find docker -name "*.sql" -type f | sort); do
    add_file_content "$file" "数据库"
done

# 添加结尾
cat >> "$OUTPUT_FILE" << 'FOOTER'

================================================================================
                                   文 档 结 束
================================================================================

软件名称：Scholay学术
版本号：V1.0
著作权人：成都恩特罐罐文化科技有限公司
统一社会信用代码：91510100MAEEHRNE26

Copyright (c) 2025 成都恩特罐罐文化科技有限公司
All Rights Reserved. 保留所有权利。

================================================================================
FOOTER

# 统计信息
total_lines=$(wc -l < "$OUTPUT_FILE")
file_size=$(du -h "$OUTPUT_FILE" | cut -f1)

echo ""
echo "=========================================="
echo "        代码导出完成!"
echo "=========================================="
echo ""
echo "输出文件: $OUTPUT_FILE"
echo "文件大小: $file_size"
echo "总行数: $total_lines"
echo "文件数量: $file_count"
echo ""
echo "提示: 请使用文本编辑器或Word打开此文件,"
echo "      然后导出为PDF格式用于软件著作权申请。"
echo ""
echo "Word导出PDF步骤:"
echo "  1. 用Word打开 $OUTPUT_FILE"
echo "  2. 设置页面: A4纸, 页边距2cm"
echo "  3. 设置字体: 宋体或等宽字体, 10-11pt"
echo "  4. 文件 -> 导出 -> 创建PDF"
echo ""
