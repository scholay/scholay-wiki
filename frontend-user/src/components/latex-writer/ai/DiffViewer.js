/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 * 
 * Diff 预览组件 - 显示修改前后的对比
 * 类似 Git diff 的交互方式
 */

import React, { useMemo, useCallback } from 'react';
import './DiffViewer.css';

/**
 * 简单的 diff 算法 - 基于行的比较
 */
function computeDiff(oldText, newText) {
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');
  
  const result = [];
  let oldIndex = 0;
  let newIndex = 0;
  
  // 使用 LCS (最长公共子序列) 的简化版本
  const lcs = computeLCS(oldLines, newLines);
  
  let lcsIndex = 0;
  
  while (oldIndex < oldLines.length || newIndex < newLines.length) {
    if (lcsIndex < lcs.length) {
      const [lcsOldIdx, lcsNewIdx] = lcs[lcsIndex];
      
      // 处理删除的行
      while (oldIndex < lcsOldIdx) {
        result.push({
          type: 'removed',
          oldLineNum: oldIndex + 1,
          newLineNum: null,
          content: oldLines[oldIndex],
        });
        oldIndex++;
      }
      
      // 处理添加的行
      while (newIndex < lcsNewIdx) {
        result.push({
          type: 'added',
          oldLineNum: null,
          newLineNum: newIndex + 1,
          content: newLines[newIndex],
        });
        newIndex++;
      }
      
      // 处理相同的行
      result.push({
        type: 'unchanged',
        oldLineNum: oldIndex + 1,
        newLineNum: newIndex + 1,
        content: oldLines[oldIndex],
      });
      oldIndex++;
      newIndex++;
      lcsIndex++;
    } else {
      // 处理剩余的删除行
      while (oldIndex < oldLines.length) {
        result.push({
          type: 'removed',
          oldLineNum: oldIndex + 1,
          newLineNum: null,
          content: oldLines[oldIndex],
        });
        oldIndex++;
      }
      
      // 处理剩余的添加行
      while (newIndex < newLines.length) {
        result.push({
          type: 'added',
          oldLineNum: null,
          newLineNum: newIndex + 1,
          content: newLines[newIndex],
        });
        newIndex++;
      }
    }
  }
  
  return result;
}

/**
 * 计算 LCS 索引对
 */
function computeLCS(oldLines, newLines) {
  const m = oldLines.length;
  const n = newLines.length;
  
  // DP 表
  const dp = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
  
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }
  
  // 回溯找出 LCS 的索引
  const result = [];
  let i = m, j = n;
  
  while (i > 0 && j > 0) {
    if (oldLines[i - 1] === newLines[j - 1]) {
      result.unshift([i - 1, j - 1]);
      i--;
      j--;
    } else if (dp[i - 1][j] > dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }
  
  return result;
}

/**
 * Diff 查看器组件
 */
function DiffViewer({
  originalContent,
  modifiedContent,
  onAccept,
  onReject,
  onAcceptLine,
  onRejectLine,
  title = 'AI 建议的修改',
  showLineActions = false,
}) {
  // 计算 diff
  const diffLines = useMemo(() => {
    if (!originalContent || !modifiedContent) return [];
    return computeDiff(originalContent, modifiedContent);
  }, [originalContent, modifiedContent]);

  // 统计变更
  const stats = useMemo(() => {
    const added = diffLines.filter(l => l.type === 'added').length;
    const removed = diffLines.filter(l => l.type === 'removed').length;
    return { added, removed };
  }, [diffLines]);

  // 渲染行号
  const renderLineNumber = useCallback((num) => {
    return num ? String(num).padStart(4, ' ') : '    ';
  }, []);

  // 如果没有变更
  if (diffLines.length === 0 || (stats.added === 0 && stats.removed === 0)) {
    return (
      <div className="diff-viewer diff-viewer-empty">
        <div className="diff-viewer-header">
          <span className="diff-viewer-title">{title}</span>
        </div>
        <div className="diff-viewer-empty-content">
          <span>无变更</span>
        </div>
      </div>
    );
  }

  return (
    <div className="diff-viewer">
      {/* 头部 */}
      <div className="diff-viewer-header">
        <div className="diff-viewer-title">{title}</div>
        <div className="diff-viewer-stats">
          <span className="diff-stat-added">+{stats.added}</span>
          <span className="diff-stat-removed">-{stats.removed}</span>
        </div>
      </div>

      {/* Diff 内容 */}
      <div className="diff-viewer-content">
        <pre className="diff-viewer-code">
          {diffLines.map((line, index) => (
            <div
              key={index}
              className={`diff-line diff-line-${line.type}`}
            >
              {/* 行号 */}
              <span className="diff-line-number diff-line-number-old">
                {renderLineNumber(line.oldLineNum)}
              </span>
              <span className="diff-line-number diff-line-number-new">
                {renderLineNumber(line.newLineNum)}
              </span>
              
              {/* 变更标记 */}
              <span className="diff-line-marker">
                {line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' '}
              </span>
              
              {/* 内容 */}
              <span className="diff-line-content">
                {line.content}
              </span>
              
              {/* 行操作按钮 */}
              {showLineActions && line.type !== 'unchanged' && (
                <span className="diff-line-actions">
                  {line.type === 'added' && (
                    <>
                      <button
                        className="diff-line-action accept"
                        onClick={() => onAcceptLine?.(index, line)}
                        title="接受此行"
                      >
                        ✓
                      </button>
                      <button
                        className="diff-line-action reject"
                        onClick={() => onRejectLine?.(index, line)}
                        title="拒绝此行"
                      >
                        ✗
                      </button>
                    </>
                  )}
                </span>
              )}
            </div>
          ))}
        </pre>
      </div>

      {/* 操作按钮 */}
      <div className="diff-viewer-actions">
        <button
          className="diff-action-button diff-action-accept"
          onClick={onAccept}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          接受全部修改
        </button>
        <button
          className="diff-action-button diff-action-reject"
          onClick={onReject}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
          放弃修改
        </button>
      </div>
    </div>
  );
}

/**
 * 内联 Diff 组件 - 用于在编辑器中显示单行变更
 */
export function InlineDiff({ original, modified, onAccept, onReject }) {
  if (original === modified) {
    return <span className="inline-diff-unchanged">{original}</span>;
  }

  return (
    <span className="inline-diff">
      <span className="inline-diff-removed">{original}</span>
      <span className="inline-diff-arrow">→</span>
      <span className="inline-diff-added">{modified}</span>
      <span className="inline-diff-actions">
        <button className="inline-diff-accept" onClick={onAccept}>✓</button>
        <button className="inline-diff-reject" onClick={onReject}>✗</button>
      </span>
    </span>
  );
}

export default DiffViewer;
