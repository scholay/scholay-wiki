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
import { computeDiff } from '../../../utils/diff';
import './DiffViewer.css';

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
