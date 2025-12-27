#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
将软件设计说明书Markdown文件转换为PDF，并添加页眉页脚
"""

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.colors import black, gray, HexColor
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import Paragraph, Table, TableStyle
from reportlab.lib.enums import TA_LEFT, TA_CENTER
import os
import sys
import re

# 页面设置
PAGE_WIDTH, PAGE_HEIGHT = A4
MARGIN_LEFT = 25 * mm
MARGIN_RIGHT = 25 * mm
MARGIN_TOP = 35 * mm
MARGIN_BOTTOM = 25 * mm

# 页眉页脚信息
HEADER_LEFT = "Scholay学术平台 V1.0"
HEADER_RIGHT = "软件设计说明书"
FOOTER_LEFT = "成都恩特罐罐文化科技有限公司"
FOOTER_CENTER = "统一社会信用代码: 91510100MAEEHRNE26"

# 字体设置
FONT_SIZE_TITLE = 18
FONT_SIZE_H1 = 16
FONT_SIZE_H2 = 14
FONT_SIZE_H3 = 12
FONT_SIZE_BODY = 10
FONT_SIZE_CODE = 9
FONT_SIZE_HEADER = 8
LINE_HEIGHT = 14

def find_chinese_font():
    """查找可用的中文字体"""
    font_paths = [
        '/System/Library/Fonts/STHeiti Light.ttc',
        '/System/Library/Fonts/STHeiti Medium.ttc',
        '/System/Library/Fonts/PingFang.ttc',
        '/Library/Fonts/Arial Unicode.ttf',
        '/System/Library/Fonts/Hiragino Sans GB.ttc',
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
            if font_path.endswith('.ttc'):
                pdfmetrics.registerFont(TTFont('ChineseFont', font_path, subfontIndex=0))
            else:
                pdfmetrics.registerFont(TTFont('ChineseFont', font_path))
            print(f"使用字体: {font_path}")
            return 'ChineseFont'
        except Exception as e:
            print(f"注册字体失败: {e}")
    
    print("警告: 未找到中文字体")
    return 'Helvetica'

class MarkdownToPDF:
    def __init__(self, font_name):
        self.font_name = font_name
        self.pages = []
        self.current_page_lines = []
        self.lines_per_page = 48  # 每页行数
        self.in_code_block = False
        self.in_table = False
        self.table_data = []
        
    def process_markdown(self, content):
        """处理Markdown内容"""
        lines = content.split('\n')
        
        for line in lines:
            self.process_line(line)
        
        # 保存最后一页
        if self.current_page_lines:
            self.pages.append(self.current_page_lines)
        
        return self.pages
    
    def process_line(self, line):
        """处理单行"""
        # 检查代码块
        if line.strip().startswith('```'):
            self.in_code_block = not self.in_code_block
            self.add_line(('code_marker', '─' * 60))
            return
        
        # 检查表格
        if '|' in line and not self.in_code_block:
            if line.strip().startswith('|') or line.strip().endswith('|'):
                # 跳过分隔行
                if re.match(r'^[\|\s\-:]+$', line.strip()):
                    return
                self.add_line(('table', line))
                return
        
        if self.in_code_block:
            self.add_line(('code', line))
            return
        
        # 处理标题
        if line.startswith('# '):
            self.add_line(('h1', line[2:].strip()))
        elif line.startswith('## '):
            self.add_line(('h2', line[3:].strip()))
        elif line.startswith('### '):
            self.add_line(('h3', line[4:].strip()))
        elif line.startswith('#### '):
            self.add_line(('h4', line[5:].strip()))
        elif line.startswith('---'):
            self.add_line(('hr', '─' * 70))
        elif line.strip() == '':
            self.add_line(('empty', ''))
        else:
            # 普通文本，处理长行
            self.wrap_and_add_line(line)
    
    def wrap_and_add_line(self, line):
        """处理长行换行"""
        max_chars = 75  # 每行最大字符数
        
        if len(line) <= max_chars:
            self.add_line(('text', line))
        else:
            # 分割长行
            words = line
            while len(words) > max_chars:
                # 尝试在空格处断行
                break_point = max_chars
                for i in range(max_chars, max(0, max_chars - 20), -1):
                    if words[i] == ' ':
                        break_point = i
                        break
                
                self.add_line(('text', words[:break_point]))
                words = words[break_point:].lstrip()
            
            if words:
                self.add_line(('text', words))
    
    def add_line(self, line_tuple):
        """添加行到当前页"""
        self.current_page_lines.append(line_tuple)
        
        # 检查是否需要新页
        if len(self.current_page_lines) >= self.lines_per_page:
            self.pages.append(self.current_page_lines)
            self.current_page_lines = []

def draw_header_footer(c, page_num, total_pages, font_name):
    """绘制页眉和页脚"""
    header_y = PAGE_HEIGHT - MARGIN_TOP + 15 * mm
    footer_y = MARGIN_BOTTOM - 10 * mm
    
    c.setFont(font_name, FONT_SIZE_HEADER)
    c.setStrokeColor(gray)
    c.setFillColor(gray)
    
    # 页眉
    c.drawString(MARGIN_LEFT, header_y, HEADER_LEFT)
    header_right_width = c.stringWidth(HEADER_RIGHT, font_name, FONT_SIZE_HEADER)
    c.drawString(PAGE_WIDTH - MARGIN_RIGHT - header_right_width, header_y, HEADER_RIGHT)
    
    # 页眉下划线
    c.setLineWidth(0.5)
    c.line(MARGIN_LEFT, header_y - 3 * mm, PAGE_WIDTH - MARGIN_RIGHT, header_y - 3 * mm)
    
    # 页脚
    c.drawString(MARGIN_LEFT, footer_y, FOOTER_LEFT)
    footer_center_width = c.stringWidth(FOOTER_CENTER, font_name, FONT_SIZE_HEADER)
    c.drawString((PAGE_WIDTH - footer_center_width) / 2, footer_y, FOOTER_CENTER)
    
    page_text = f"第 {page_num} 页 / 共 {total_pages} 页"
    page_text_width = c.stringWidth(page_text, font_name, FONT_SIZE_HEADER)
    c.drawString(PAGE_WIDTH - MARGIN_RIGHT - page_text_width, footer_y, page_text)
    
    # 页脚上划线
    c.line(MARGIN_LEFT, footer_y + 5 * mm, PAGE_WIDTH - MARGIN_RIGHT, footer_y + 5 * mm)
    
    c.setFillColor(black)

def render_page(c, page_lines, font_name):
    """渲染一页内容"""
    y = PAGE_HEIGHT - MARGIN_TOP
    
    for line_type, content in page_lines:
        if line_type == 'h1':
            c.setFont(font_name, FONT_SIZE_H1)
            c.setFillColor(HexColor('#1a1a1a'))
            y -= 8  # 标题前额外间距
            c.drawString(MARGIN_LEFT, y, content)
            y -= LINE_HEIGHT + 4
        elif line_type == 'h2':
            c.setFont(font_name, FONT_SIZE_H2)
            c.setFillColor(HexColor('#2a2a2a'))
            y -= 6
            c.drawString(MARGIN_LEFT, y, content)
            y -= LINE_HEIGHT + 2
        elif line_type == 'h3':
            c.setFont(font_name, FONT_SIZE_H3)
            c.setFillColor(HexColor('#3a3a3a'))
            y -= 4
            c.drawString(MARGIN_LEFT, y, content)
            y -= LINE_HEIGHT
        elif line_type == 'h4':
            c.setFont(font_name, FONT_SIZE_BODY)
            c.setFillColor(HexColor('#4a4a4a'))
            c.drawString(MARGIN_LEFT, y, "▪ " + content)
            y -= LINE_HEIGHT
        elif line_type == 'code':
            c.setFont(font_name, FONT_SIZE_CODE)
            c.setFillColor(HexColor('#333333'))
            # 代码块缩进
            c.drawString(MARGIN_LEFT + 10, y, content)
            y -= LINE_HEIGHT - 2
        elif line_type == 'code_marker':
            c.setFont(font_name, FONT_SIZE_CODE)
            c.setFillColor(gray)
            c.drawString(MARGIN_LEFT, y, content)
            y -= LINE_HEIGHT - 2
        elif line_type == 'hr':
            c.setStrokeColor(gray)
            c.setLineWidth(0.5)
            c.line(MARGIN_LEFT, y, PAGE_WIDTH - MARGIN_RIGHT, y)
            y -= LINE_HEIGHT
        elif line_type == 'table':
            c.setFont(font_name, FONT_SIZE_BODY)
            c.setFillColor(black)
            # 简化表格渲染
            c.drawString(MARGIN_LEFT, y, content)
            y -= LINE_HEIGHT
        elif line_type == 'empty':
            y -= LINE_HEIGHT / 2
        else:  # text
            c.setFont(font_name, FONT_SIZE_BODY)
            c.setFillColor(black)
            c.drawString(MARGIN_LEFT, y, content)
            y -= LINE_HEIGHT

def convert_md_to_pdf(input_file, output_file):
    """将Markdown文件转换为PDF"""
    
    # 注册字体
    font_name = register_font()
    
    # 读取文件
    print(f"读取文件: {input_file}")
    with open(input_file, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # 处理Markdown
    processor = MarkdownToPDF(font_name)
    pages = processor.process_markdown(content)
    total_pages = len(pages)
    
    print(f"总页数: {total_pages}")
    
    # 创建PDF
    c = canvas.Canvas(output_file, pagesize=A4)
    c.setTitle("Scholay学术平台 V1.0 软件设计说明书")
    c.setAuthor("成都恩特罐罐文化科技有限公司")
    c.setSubject("软件设计说明书")
    
    for page_num, page_lines in enumerate(pages, 1):
        render_page(c, page_lines, font_name)
        draw_header_footer(c, page_num, total_pages, font_name)
        
        if page_num < total_pages:
            c.showPage()
    
    c.save()
    print(f"\nPDF已生成: {output_file}")

def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_dir = os.path.dirname(script_dir)
    
    input_file = os.path.join(project_dir, "code-export", "Scholay学术_V1.0_软件设计说明书.md")
    output_file = os.path.join(project_dir, "code-export", "Scholay学术_V1.0_软件设计说明书.pdf")
    
    if not os.path.exists(input_file):
        print(f"错误: 找不到输入文件 {input_file}")
        sys.exit(1)
    
    convert_md_to_pdf(input_file, output_file)
    print("\n转换完成!")

if __name__ == "__main__":
    main()


