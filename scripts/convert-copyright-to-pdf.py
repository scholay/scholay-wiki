#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
将软件著作权源代码文本文件转换为PDF，并添加页眉页脚
"""

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.colors import black, gray
import os
import sys

# 页面设置
PAGE_WIDTH, PAGE_HEIGHT = A4
MARGIN_LEFT = 25 * mm
MARGIN_RIGHT = 25 * mm
MARGIN_TOP = 30 * mm
MARGIN_BOTTOM = 25 * mm

# 页眉页脚信息
HEADER_LEFT = "Scholay学术平台 V1.0"
HEADER_RIGHT = "软件著作权登记材料"
FOOTER_LEFT = "成都恩特罐罐文化科技有限公司"
FOOTER_CENTER = "统一社会信用代码: 91510100MAEEHRNE26"

# 字体设置
FONT_SIZE_BODY = 9  # 正文字号
FONT_SIZE_HEADER = 8  # 页眉页脚字号
LINE_HEIGHT = 12  # 行高

def find_chinese_font():
    """查找可用的中文字体"""
    # macOS 常用中文字体路径
    font_paths = [
        '/System/Library/Fonts/STHeiti Light.ttc',
        '/System/Library/Fonts/STHeiti Medium.ttc',
        '/System/Library/Fonts/PingFang.ttc',
        '/Library/Fonts/Arial Unicode.ttf',
        '/System/Library/Fonts/Hiragino Sans GB.ttc',
        '/System/Library/Fonts/Supplemental/Songti.ttc',
        '/System/Library/Fonts/Supplemental/STHeiti Light.ttc',
        '/System/Library/Fonts/Supplemental/STHeiti Medium.ttc',
        # 尝试更多字体
        '/System/Library/Fonts/STSong.ttf',
        '/System/Library/Fonts/Supplemental/Heiti.ttc',
    ]
    
    for path in font_paths:
        if os.path.exists(path):
            return path
    
    return None

def register_font():
    """注册中文字体"""
    font_path = find_chinese_font()
    if font_path:
        try:
            # 对于 .ttc 文件，需要指定字体索引
            if font_path.endswith('.ttc'):
                pdfmetrics.registerFont(TTFont('ChineseFont', font_path, subfontIndex=0))
            else:
                pdfmetrics.registerFont(TTFont('ChineseFont', font_path))
            print(f"使用字体: {font_path}")
            return 'ChineseFont'
        except Exception as e:
            print(f"注册字体失败: {e}")
    
    print("警告: 未找到中文字体，使用默认字体（中文可能无法正常显示）")
    return 'Helvetica'

def draw_header_footer(c, page_num, total_pages, font_name):
    """绘制页眉和页脚"""
    # 页眉线位置
    header_y = PAGE_HEIGHT - MARGIN_TOP + 10 * mm
    footer_y = MARGIN_BOTTOM - 10 * mm
    
    c.setFont(font_name, FONT_SIZE_HEADER)
    c.setStrokeColor(gray)
    c.setFillColor(gray)
    
    # 页眉 - 左侧
    c.drawString(MARGIN_LEFT, header_y, HEADER_LEFT)
    
    # 页眉 - 右侧
    header_right_width = c.stringWidth(HEADER_RIGHT, font_name, FONT_SIZE_HEADER)
    c.drawString(PAGE_WIDTH - MARGIN_RIGHT - header_right_width, header_y, HEADER_RIGHT)
    
    # 页眉下划线
    c.setLineWidth(0.5)
    c.line(MARGIN_LEFT, header_y - 3 * mm, PAGE_WIDTH - MARGIN_RIGHT, header_y - 3 * mm)
    
    # 页脚 - 左侧（公司名称）
    c.drawString(MARGIN_LEFT, footer_y, FOOTER_LEFT)
    
    # 页脚 - 中间（信用代码）
    footer_center_width = c.stringWidth(FOOTER_CENTER, font_name, FONT_SIZE_HEADER)
    c.drawString((PAGE_WIDTH - footer_center_width) / 2, footer_y, FOOTER_CENTER)
    
    # 页脚 - 右侧（页码）
    page_text = f"第 {page_num} 页 / 共 {total_pages} 页"
    page_text_width = c.stringWidth(page_text, font_name, FONT_SIZE_HEADER)
    c.drawString(PAGE_WIDTH - MARGIN_RIGHT - page_text_width, footer_y, page_text)
    
    # 页脚上划线
    c.line(MARGIN_LEFT, footer_y + 5 * mm, PAGE_WIDTH - MARGIN_RIGHT, footer_y + 5 * mm)
    
    c.setFillColor(black)

def convert_to_pdf(input_file, output_file):
    """将文本文件转换为PDF"""
    
    # 注册中文字体
    font_name = register_font()
    
    # 读取源文件
    print(f"读取文件: {input_file}")
    with open(input_file, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # 按行分割
    lines = content.split('\n')
    print(f"总行数: {len(lines)}")
    
    # 计算每页可容纳的行数
    content_height = PAGE_HEIGHT - MARGIN_TOP - MARGIN_BOTTOM
    lines_per_page = int(content_height / LINE_HEIGHT)
    print(f"每页行数: {lines_per_page}")
    
    # 计算总页数
    total_pages = (len(lines) + lines_per_page - 1) // lines_per_page
    print(f"预计页数: {total_pages}")
    
    # 创建PDF
    c = canvas.Canvas(output_file, pagesize=A4)
    c.setTitle("Scholay学术平台 V1.0 源代码 - 软件著作权登记材料")
    c.setAuthor("成都恩特罐罐文化科技有限公司")
    c.setSubject("软件著作权登记源代码")
    
    current_page = 1
    current_line = 0
    y_position = PAGE_HEIGHT - MARGIN_TOP
    
    for i, line in enumerate(lines):
        # 检查是否需要新页
        if current_line >= lines_per_page or i == 0:
            if i > 0:
                # 绘制当前页的页眉页脚
                draw_header_footer(c, current_page, total_pages, font_name)
                c.showPage()
                current_page += 1
            
            current_line = 0
            y_position = PAGE_HEIGHT - MARGIN_TOP
        
        # 绘制文本行
        c.setFont(font_name, FONT_SIZE_BODY)
        c.setFillColor(black)
        
        # 处理长行（简单截断，保持代码格式）
        max_chars = 100  # 每行最大字符数
        if len(line) > max_chars:
            # 对于过长的行，分多行显示
            for j in range(0, len(line), max_chars):
                if current_line >= lines_per_page:
                    draw_header_footer(c, current_page, total_pages, font_name)
                    c.showPage()
                    current_page += 1
                    current_line = 0
                    y_position = PAGE_HEIGHT - MARGIN_TOP
                
                sub_line = line[j:j+max_chars]
                c.drawString(MARGIN_LEFT, y_position, sub_line)
                y_position -= LINE_HEIGHT
                current_line += 1
        else:
            c.drawString(MARGIN_LEFT, y_position, line)
            y_position -= LINE_HEIGHT
            current_line += 1
    
    # 绘制最后一页的页眉页脚
    draw_header_footer(c, current_page, total_pages, font_name)
    
    # 保存PDF
    c.save()
    print(f"\nPDF已生成: {output_file}")
    print(f"实际页数: {current_page}")

def main():
    # 文件路径
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_dir = os.path.dirname(script_dir)
    
    input_file = os.path.join(project_dir, "code-export", "Scholay学术_V1.0_源代码_著作权申请版.txt")
    output_file = os.path.join(project_dir, "code-export", "Scholay学术_V1.0_源代码_著作权申请版.pdf")
    
    if not os.path.exists(input_file):
        print(f"错误: 找不到输入文件 {input_file}")
        sys.exit(1)
    
    convert_to_pdf(input_file, output_file)
    print("\n转换完成!")
    print(f"PDF文件位置: {output_file}")

if __name__ == "__main__":
    main()


