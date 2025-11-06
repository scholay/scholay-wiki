#!/bin/bash
# 图片优化脚本
# 使用ImageMagick或其他工具压缩图片

set -e

echo "======================================"
echo "  图片优化脚本"
echo "======================================"
echo ""

# 检查是否安装了ImageMagick
if ! command -v convert &> /dev/null; then
    echo "❌ ImageMagick未安装"
    echo "   macOS: brew install imagemagick"
    echo "   Ubuntu: apt-get install imagemagick"
    exit 1
fi

# Logo路径
LOGO_USER="/Users/youngp/mypro/scholar/frontend-user/public/logo.png"
LOGO_ADMIN="/Users/youngp/mypro/scholar/frontend-admin/public/logo.png"

# 优化函数
optimize_logo() {
    local file=$1
    if [ ! -f "$file" ]; then
        echo "⊙ 跳过: $file (不存在)"
        return
    fi

    local original_size=$(du -h "$file" | cut -f1)
    local backup="${file}.backup"

    echo "处理: $file"
    echo "  原始大小: $original_size"

    # 备份原文件
    cp "$file" "$backup"

    # 优化PNG: 调整质量、去除元数据
    convert "$file" \
        -strip \
        -quality 85 \
        -define png:compression-filter=5 \
        -define png:compression-level=9 \
        -define png:compression-strategy=1 \
        "$file.tmp"

    # 如果优化后的文件更小,则使用它
    if [ -f "$file.tmp" ]; then
        local new_size=$(du -h "$file.tmp" | cut -f1)
        mv "$file.tmp" "$file"
        echo "  优化后: $new_size"
        echo "  ✓ 优化完成"
    else
        echo "  ✗ 优化失败"
        mv "$backup" "$file"
    fi

    echo ""
}

# 优化logo
optimize_logo "$LOGO_USER"
optimize_logo "$LOGO_ADMIN"

echo "======================================"
echo "✓ 图片优化完成"
echo "======================================"
echo ""
echo "建议:"
echo "1. 使用WebP格式可以进一步减小50%的体积"
echo "2. 为不同尺寸生成不同的logo(如favicon 16x16)"
echo "3. 考虑使用SVG格式替代PNG(矢量图)"
