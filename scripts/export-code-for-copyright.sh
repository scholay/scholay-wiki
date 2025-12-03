#!/bin/bash
# ============================================================================
# 软件著作权代码导出脚本
# 按要求导出：前30页 + 后30页（每页不少于30行）
# 软件名称: Scholay学术 V1.0
# 著作权人: 成都恩特罐罐文化科技有限公司
# ============================================================================

OUTPUT_DIR="./code-export"
FULL_FILE="$OUTPUT_DIR/全部源代码.txt"
FRONT_FILE="$OUTPUT_DIR/Scholay学术_V1.0_源代码_前30页.txt"
BACK_FILE="$OUTPUT_DIR/Scholay学术_V1.0_源代码_后30页.txt"
COMBINED_FILE="$OUTPUT_DIR/Scholay学术_V1.0_源代码_著作权申请版.txt"

# 每页行数（软著要求每页不少于30行，我们设置为50行，更规范）
LINES_PER_PAGE=50
# 前后各30页
PAGES=30

mkdir -p "$OUTPUT_DIR"

echo "============================================"
echo "  Scholay学术 V1.0 软件著作权代码导出"
echo "============================================"
echo ""

# 步骤1: 生成完整代码文件（带行号）
echo "[1/4] 正在收集所有源代码..."

# 创建临时文件存储代码
TEMP_CODE=$(mktemp)

# 添加文件头
cat > "$TEMP_CODE" << 'HEADER'
// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

HEADER

# 收集后端Go代码
echo "   - 后端代码 (Go)..."
for file in $(find backend -name "*.go" -type f | sort); do
    echo "" >> "$TEMP_CODE"
    echo "// ========== 文件: $file ==========" >> "$TEMP_CODE"
    cat "$file" >> "$TEMP_CODE"
done

# 收集前端JS代码
echo "   - 前端用户端代码 (JavaScript)..."
for file in $(find frontend-user/src -name "*.js" -type f 2>/dev/null | sort); do
    echo "" >> "$TEMP_CODE"
    echo "// ========== 文件: $file ==========" >> "$TEMP_CODE"
    cat "$file" >> "$TEMP_CODE"
done

echo "   - 前端管理端代码 (JavaScript)..."
for file in $(find frontend-admin/src -name "*.js" -type f 2>/dev/null | sort); do
    echo "" >> "$TEMP_CODE"
    echo "// ========== 文件: $file ==========" >> "$TEMP_CODE"
    cat "$file" >> "$TEMP_CODE"
done

# 收集CSS代码
echo "   - 样式文件 (CSS)..."
for file in $(find frontend-user/src frontend-admin/src -name "*.css" -type f 2>/dev/null | sort); do
    echo "" >> "$TEMP_CODE"
    echo "/* ========== 文件: $file ========== */" >> "$TEMP_CODE"
    cat "$file" >> "$TEMP_CODE"
done

# 收集SQL代码
echo "   - 数据库脚本 (SQL)..."
for file in $(find docker -name "*.sql" -type f | sort); do
    echo "" >> "$TEMP_CODE"
    echo "-- ========== 文件: $file ==========" >> "$TEMP_CODE"
    cat "$file" >> "$TEMP_CODE"
done

# 保存完整代码
cp "$TEMP_CODE" "$FULL_FILE"

# 统计总行数
TOTAL_LINES=$(wc -l < "$TEMP_CODE" | tr -d ' ')
echo ""
echo "   总代码行数: $TOTAL_LINES"

# 步骤2: 计算前30页和后30页的行数
FRONT_LINES=$((LINES_PER_PAGE * PAGES))  # 1500行
BACK_LINES=$((LINES_PER_PAGE * PAGES))   # 1500行

echo ""
echo "[2/4] 正在提取前${PAGES}页 (前${FRONT_LINES}行)..."

# 生成前30页
cat > "$FRONT_FILE" << 'FRONT_HEADER'
================================================================================
                    Scholay学术 V1.0 源代码（前30页）
================================================================================

软件名称：Scholay学术
版本号：V1.0
著作权人：成都恩特罐罐文化科技有限公司
统一社会信用代码：91510100MAEEHRNE26

Copyright (c) 2025 成都恩特罐罐文化科技有限公司
All Rights Reserved.

说明：本文档为软件著作权登记用源代码，包含前30页内容。
      每页50行，共计1500行。

================================================================================
                              源 代 码 正 文
================================================================================

FRONT_HEADER

head -n $FRONT_LINES "$TEMP_CODE" | nl -ba >> "$FRONT_FILE"

echo ""
echo "[3/4] 正在提取后${PAGES}页 (后${BACK_LINES}行)..."

# 生成后30页
cat > "$BACK_FILE" << 'BACK_HEADER'
================================================================================
                    Scholay学术 V1.0 源代码（后30页）
================================================================================

软件名称：Scholay学术
版本号：V1.0
著作权人：成都恩特罐罐文化科技有限公司
统一社会信用代码：91510100MAEEHRNE26

Copyright (c) 2025 成都恩特罐罐文化科技有限公司
All Rights Reserved.

说明：本文档为软件著作权登记用源代码，包含后30页内容。
      每页50行，共计1500行。

================================================================================
                              源 代 码 正 文
================================================================================

BACK_HEADER

# 计算从哪一行开始取后30页
START_LINE=$((TOTAL_LINES - BACK_LINES + 1))
if [ $START_LINE -lt 1 ]; then
    START_LINE=1
fi

tail -n $BACK_LINES "$TEMP_CODE" | nl -ba -v $START_LINE >> "$BACK_FILE"

# 步骤3: 生成合并版本（前30页 + 后30页）
echo ""
echo "[4/4] 正在生成合并版本..."

cat > "$COMBINED_FILE" << 'COMBINED_HEADER'
================================================================================

                    Scholay学术 V1.0 源代码

                    （软件著作权登记材料）

================================================================================

软件名称：Scholay学术
版本号：V1.0
著作权人：成都恩特罐罐文化科技有限公司
统一社会信用代码：91510100MAEEHRNE26

Copyright (c) 2025 成都恩特罐罐文化科技有限公司
All Rights Reserved. 保留所有权利。

--------------------------------------------------------------------------------
说明：
本文档为软件著作权登记用源代码，按照登记要求提供：
- 前30页：源代码前1500行（每页50行）
- 后30页：源代码后1500行（每页50行）
--------------------------------------------------------------------------------

================================================================================
                         第一部分：前30页源代码
================================================================================

COMBINED_HEADER

head -n $FRONT_LINES "$TEMP_CODE" | nl -ba >> "$COMBINED_FILE"

cat >> "$COMBINED_FILE" << 'MIDDLE'

================================================================================
                         第二部分：后30页源代码
================================================================================

MIDDLE

tail -n $BACK_LINES "$TEMP_CODE" | nl -ba -v $START_LINE >> "$COMBINED_FILE"

cat >> "$COMBINED_FILE" << 'FOOTER'

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

# 清理临时文件
rm -f "$TEMP_CODE"

# 统计输出文件
COMBINED_LINES=$(wc -l < "$COMBINED_FILE" | tr -d ' ')
COMBINED_SIZE=$(du -h "$COMBINED_FILE" | cut -f1)

echo ""
echo "============================================"
echo "            导出完成!"
echo "============================================"
echo ""
echo "输出文件:"
echo "  1. $COMBINED_FILE"
echo "     (推荐使用，包含前30页+后30页)"
echo ""
echo "  2. $FRONT_FILE"
echo "     (仅前30页)"
echo ""
echo "  3. $BACK_FILE"
echo "     (仅后30页)"
echo ""
echo "  4. $FULL_FILE"
echo "     (全部源代码，约${TOTAL_LINES}行)"
echo ""
echo "统计信息:"
echo "  - 源代码总行数: $TOTAL_LINES 行"
echo "  - 每页行数: $LINES_PER_PAGE 行"
echo "  - 前30页: $FRONT_LINES 行"
echo "  - 后30页: $BACK_LINES 行"
echo "  - 合并文件: $COMBINED_LINES 行 ($COMBINED_SIZE)"
echo ""
echo "============================================"
echo "            转PDF方法"
echo "============================================"
echo ""
echo "方法1: 使用Word"
echo "  1. 用Word打开 $COMBINED_FILE"
echo "  2. 页面设置: A4, 页边距2cm"
echo "  3. 字体: 宋体/等宽字体, 10pt"
echo "  4. 文件 -> 导出 -> 创建PDF"
echo ""
echo "方法2: 使用VS Code"
echo "  1. 用VS Code打开文件"
echo "  2. 安装 'Print' 扩展"
echo "  3. Ctrl+Shift+P -> Print"
echo ""
echo "方法3: 在线转换"
echo "  访问 https://www.ilovepdf.com/txt_to_pdf"
echo ""
