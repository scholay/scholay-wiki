/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 * 
 * Diff 对比组件
 * 用于显示 AI 修改前后的差异
 */

import React, { useState, useCallback, useMemo } from 'react';
import './DiffViewer.css';

// 简单的 diff 算法
function computeDiff(oldText, newText) {
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');
  const result = [];
  
  let i = 0, j = 0;
  
  while (i < oldLines.length || j < newLines.length) {
    if (i >= oldLines.length) {
      // 新增的行
      result.push({ type: 'add', content: newLines[j], lineNumber: j + 1 });
      j++;
    } else if (j >= newLines.length) {
      // 删除的行
      result.push({ type: 'remove', content: oldLines[i], lineNumber: i + 1 });
      i++;
    } else if (oldLines[i] === newLines[j]) {
      // 相同的行
      result.push({ type: 'same', content: oldLines[i], lineNumber: i + 1 });
      i++;
      j++;
    } else {
      // 找到下一个匹配点
      let foundInNew = newLines.slice(j).indexOf(oldLines[i]);
      let foundInOld = oldLines.slice(i).indexOf(newLines[j]);
      
      if (foundInNew === -1 && foundInOld === -1) {
        // 都找不到，标记为修改
        result.push({ type: 'remove', content: oldLines[i], lineNumber: i + 1 });
        result.push({ type: 'add', content: newLines[j], lineNumber: j + 1 });
        i++;
        j++;
      } else if (foundInNew === -1 || (foundInOld !== -1 && foundInOld < foundInNew)) {
        // 在旧文本中找到，说明新文本有新增
        result.push({ type: 'add', content: newLines[j], lineNumber: j + 1 });
        j++;
      } else {
        // 在新文本中找到，说明旧文本有删除
        result.push({ type: 'remove', content: oldLines[i], lineNumber: i + 1 });
        i++;
      }
    }
  }
  
  return result;
}

function DiffViewer({ oldContent, newContent, onAccept, onReject, title = 'Diff 对比' }) {
  const [viewMode, setViewMode] = useState('split'); // 'split' | 'unified'
  
  // 计算 diff
  const diffResult = useMemo(() => {
    return computeDiff(oldContent, newContent);
  }, [oldContent, newContent]);
  
  // 统计变化
  const stats = useMemo(() => {
    const adds = diffResult.filter(d => d.type === 'add').length;
    const removes = diffResult.filter(d => d.type === 'remove').length;
    return { adds, removes };
  }, [diffResult]);
  
  // 渲染统一视图
  const renderUnifiedView = useCallback(() => (
    <div className="diff-viewer-unified">
      {diffResult.map((line, index) => (
        <div
          key={index}
          className={`diff-viewer-line ${line.type}`}
        >
          <span className="diff-viewer-line-marker">
            {line.type === 'add' && '+'}
            {line.type === 'remove' && '-'}
            {line.type === 'same' && ' '}
          </span>
          <span className="diff-viewer-line-content">{line.content || ' '}</span>
        </div>
      ))}
    </div>
  ), [diffResult]);
  
  // 渲染分栏视图
  const renderSplitView = useCallback(() => {
    const oldLines = oldContent.split('\n');
    const newLines = newContent.split('\n');
    const maxLines = Math.max(oldLines.length, newLines.length);
    
    return (
      <div className="diff-viewer-split">
        <div className="diff-viewer-split-pane">
          <div className="diff-viewer-split-header">原文</div>
          <div className="diff-viewer-split-content">
            {oldLines.map((line, index) => (
              <div
                key={index}
                className={`diff-viewer-line ${newLines[index] !== line ? 'remove' : 'same'}`}
              >
                <span className="diff-viewer-line-number">{index + 1}</span>
                <span className="diff-viewer-line-content">{line || ' '}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="diff-viewer-split-pane">
          <div className="diff-viewer-split-header">修改后</div>
          <div className="diff-viewer-split-content">
            {newLines.map((line, index) => (
              <div
                key={index}
                className={`diff-viewer-line ${oldLines[index] !== line ? 'add' : 'same'}`}
              >
                <span className="diff-viewer-line-number">{index + 1}</span>
                <span className="diff-viewer-line-content">{line || ' '}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }, [oldContent, newContent]);
  
  return (
    <div className="diff-viewer-overlay">
      <div className="diff-viewer-modal">
        {/* 头部 */}
        <div className="diff-viewer-header">
          <h3 className="diff-viewer-title">{title}</h3>
          <div className="diff-viewer-stats">
            <span className="diff-viewer-stat add">+{stats.adds}</span>
            <span className="diff-viewer-stat remove">-{stats.removes}</span>
          </div>
          <div className="diff-viewer-view-toggle">
            <button
              className={viewMode === 'split' ? 'active' : ''}
              onClick={() => setViewMode('split')}
            >
              分栏
            </button>
            <button
              className={viewMode === 'unified' ? 'active' : ''}
              onClick={() => setViewMode('unified')}
            >
              统一
            </button>
          </div>
          <button
            className="diff-viewer-close-btn"
            onClick={onReject}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        
        {/* 内容 */}
        <div className="diff-viewer-content">
          {viewMode === 'unified' ? renderUnifiedView() : renderSplitView()}
        </div>
        
        {/* 底部操作 */}
        <div className="diff-viewer-footer">
          <button
            className="diff-viewer-btn reject"
            onClick={onReject}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
            取消
          </button>
          <button
            className="diff-viewer-btn accept"
            onClick={onAccept}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
            应用修改
          </button>
        </div>
      </div>
    </div>
  );
}

export default DiffViewer;
