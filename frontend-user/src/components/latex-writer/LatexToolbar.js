/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 * 
 * LaTeX 工具栏组件
 */

import React, { useState, useCallback } from 'react';
import './LatexToolbar.css';

// LaTeX 常用命令
const LATEX_COMMANDS = {
  section: {
    label: '章节',
    items: [
      { name: '一级标题', value: '\\section{标题}' },
      { name: '二级标题', value: '\\subsection{标题}' },
      { name: '三级标题', value: '\\subsubsection{标题}' },
      { name: '段落', value: '\\paragraph{标题}' },
    ]
  },
  format: {
    label: '格式',
    items: [
      { name: '粗体', value: '\\textbf{文本}' },
      { name: '斜体', value: '\\textit{文本}' },
      { name: '下划线', value: '\\underline{文本}' },
      { name: '等宽字体', value: '\\texttt{文本}' },
    ]
  },
  math: {
    label: '数学',
    items: [
      { name: '行内公式', value: '$公式$' },
      { name: '行间公式', value: '\\[\n公式\n\\]' },
      { name: '方程环境', value: '\\begin{equation}\n公式\n\\end{equation}' },
      { name: '分数', value: '\\frac{分子}{分母}' },
      { name: '求和', value: '\\sum_{i=1}^{n}' },
      { name: '积分', value: '\\int_{a}^{b}' },
      { name: '矩阵', value: '\\begin{bmatrix}\na & b \\\\\nc & d\n\\end{bmatrix}' },
    ]
  },
  list: {
    label: '列表',
    items: [
      { name: '无序列表', value: '\\begin{itemize}\n\\item 项目1\n\\item 项目2\n\\end{itemize}' },
      { name: '有序列表', value: '\\begin{enumerate}\n\\item 项目1\n\\item 项目2\n\\end{enumerate}' },
      { name: '描述列表', value: '\\begin{description}\n\\item[术语] 描述\n\\end{description}' },
    ]
  },
  figure: {
    label: '图表',
    items: [
      { name: '图片', value: '\\begin{figure}[htbp]\n\\centering\n\\includegraphics[width=0.8\\textwidth]{图片路径}\n\\caption{图片标题}\n\\label{fig:label}\n\\end{figure}' },
      { name: '表格', value: '\\begin{table}[htbp]\n\\centering\n\\caption{表格标题}\n\\begin{tabular}{|c|c|c|}\n\\hline\n列1 & 列2 & 列3 \\\\\n\\hline\n数据 & 数据 & 数据 \\\\\n\\hline\n\\end{tabular}\n\\label{tab:label}\n\\end{table}' },
    ]
  },
  reference: {
    label: '引用',
    items: [
      { name: '引用', value: '\\cite{引用键}' },
      { name: '交叉引用', value: '\\ref{标签}' },
      { name: '脚注', value: '\\footnote{脚注内容}' },
    ]
  },
};

function LatexToolbar({
  onAction,
  onCompile,
  isCompiling,
  onToggleLeftPanel,
  onToggleRightPanel,
  isLeftPanelCollapsed,
  isRightPanelCollapsed,
  projectName,
  onBackToProjects
}) {
  const [activeDropdown, setActiveDropdown] = useState(null);

  const handleDropdownClick = useCallback((key) => {
    setActiveDropdown(prev => prev === key ? null : key);
  }, []);

  const handleItemClick = useCallback((value) => {
    onAction?.('insert', value);
    setActiveDropdown(null);
  }, [onAction]);

  const handleClickOutside = useCallback(() => {
    setActiveDropdown(null);
  }, []);

  return (
    <div className="latex-toolbar" onClick={handleClickOutside}>
      {/* 返回按钮和项目名称 */}
      {projectName && (
        <div className="latex-toolbar-project">
          <button
            className="latex-toolbar-back-btn"
            onClick={(e) => { e.stopPropagation(); onBackToProjects?.(); }}
            title="返回项目列表"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
          </button>
          <span className="latex-toolbar-project-name" title={projectName}>
            {projectName}
          </span>
        </div>
      )}

      {projectName && <div className="latex-toolbar-divider" />}

      {/* 面板切换按钮 */}
      <div className="latex-toolbar-group">
        <button
          className={`latex-toolbar-btn ${isLeftPanelCollapsed ? 'active' : ''}`}
          onClick={(e) => { e.stopPropagation(); onToggleLeftPanel?.(); }}
          title={isLeftPanelCollapsed ? '显示文件树' : '隐藏文件树'}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
            <line x1="9" y1="3" x2="9" y2="21"/>
          </svg>
        </button>
      </div>

      <div className="latex-toolbar-divider" />

      {/* LaTeX 命令下拉菜单 */}
      {Object.entries(LATEX_COMMANDS).map(([key, { label, items }]) => (
        <div key={key} className="latex-toolbar-dropdown">
          <button
            className={`latex-toolbar-btn ${activeDropdown === key ? 'active' : ''}`}
            onClick={(e) => { e.stopPropagation(); handleDropdownClick(key); }}
          >
            {label}
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </button>
          {activeDropdown === key && (
            <div className="latex-toolbar-dropdown-menu" onClick={(e) => e.stopPropagation()}>
              {items.map((item, index) => (
                <button
                  key={index}
                  className="latex-toolbar-dropdown-item"
                  onClick={() => handleItemClick(item.value)}
                >
                  {item.name}
                </button>
              ))}
            </div>
          )}
        </div>
      ))}

      <div className="latex-toolbar-spacer" />

      {/* 编译按钮 */}
      <div className="latex-toolbar-group">
        <button
          className="latex-toolbar-btn latex-toolbar-compile-btn"
          onClick={(e) => { e.stopPropagation(); onCompile?.(); }}
          disabled={isCompiling}
          title="编译 PDF (Ctrl+Enter)"
        >
          {isCompiling ? (
            <>
              <span className="latex-toolbar-spinner" />
              编译中...
            </>
          ) : (
            <>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="5 3 19 12 5 21 5 3"/>
              </svg>
              编译
            </>
          )}
        </button>
      </div>

      <div className="latex-toolbar-divider" />

      {/* 右侧面板切换 */}
      <div className="latex-toolbar-group">
        <button
          className={`latex-toolbar-btn ${isRightPanelCollapsed ? 'active' : ''}`}
          onClick={(e) => { e.stopPropagation(); onToggleRightPanel?.(); }}
          title={isRightPanelCollapsed ? '显示 PDF 预览' : '隐藏 PDF 预览'}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
            <line x1="15" y1="3" x2="15" y2="21"/>
          </svg>
        </button>
      </div>
    </div>
  );
}

export default LatexToolbar;
