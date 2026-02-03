/**
 * ToolCallDisplay - 工具调用可视化组件
 * 显示 AI Agent 正在执行的工具调用及其结果
 */

import React, { useState } from 'react';
import './ToolCallDisplay.css';

// 工具状态图标（使用文字符号）
const STATUS_ICONS = {
  pending: '...',
  running: '*',
  success: '+',
  error: 'x',
  waiting: '||'
};

// 工具分类图标（使用文字标识）
const CATEGORY_ICONS = {
  latex: 'TEX',
  search: 'Q',
  bibtex: 'BIB',
  file: 'F',
  convert: 'C',
  math: 'M',
  image: 'IMG',
  code: '</>',
  template: 'T',
  web: 'W',
  default: '*'
};

/**
 * 单个工具调用项
 */
const ToolCallItem = ({ call, expanded, onToggle }) => {
  const statusIcon = STATUS_ICONS[call.status] || STATUS_ICONS.pending;
  const categoryIcon = CATEGORY_ICONS[call.category] || CATEGORY_ICONS.default;
  const duration = call.endTime && call.startTime 
    ? ((call.endTime - call.startTime) / 1000).toFixed(2) 
    : null;

  return (
    <div 
      className={`tool-call-item tool-call-status-${call.status}`}
      data-status={call.status}
    >
      <div 
        className="tool-call-header"
        onClick={onToggle}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && onToggle()}
      >
        <span className="tool-call-category-icon">{categoryIcon}</span>
        <span className="tool-call-name">{call.name}</span>
        <span className={`tool-call-status-icon status-${call.status}`}>
          {statusIcon}
        </span>
        {duration && (
          <span className="tool-call-duration">{duration}s</span>
        )}
        <span className={`tool-call-expand-icon ${expanded ? 'expanded' : ''}`}>
          ▶
        </span>
      </div>

      {expanded && (
        <div className="tool-call-details">
          {/* 描述 */}
          {call.description && (
            <div className="tool-call-description">
              {call.description}
            </div>
          )}

          {/* 参数 */}
          {call.arguments && Object.keys(call.arguments).length > 0 && (
            <div className="tool-call-section">
              <h5 className="tool-call-section-title">输入参数</h5>
              <div className="tool-call-code">
                {Object.entries(call.arguments).map(([key, value]) => (
                  <div key={key} className="tool-call-param">
                    <span className="param-key">{key}:</span>
                    <span className="param-value">
                      {typeof value === 'object' 
                        ? JSON.stringify(value, null, 2)
                        : String(value)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 结果 */}
          {call.result !== undefined && (
            <div className="tool-call-section">
              <h5 className="tool-call-section-title">
                {call.status === 'success' ? '执行结果' : '错误信息'}
              </h5>
              <div className={`tool-call-code ${call.status === 'error' ? 'error' : ''}`}>
                {typeof call.result === 'object' 
                  ? JSON.stringify(call.result, null, 2)
                  : String(call.result)}
              </div>
            </div>
          )}

          {/* 时间信息 */}
          {call.startTime && (
            <div className="tool-call-meta">
              <span>开始时间: {new Date(call.startTime).toLocaleTimeString()}</span>
              {call.endTime && (
                <span>结束时间: {new Date(call.endTime).toLocaleTimeString()}</span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

/**
 * 工具调用显示容器
 */
const ToolCallDisplay = ({ 
  toolCalls = [], 
  collapsed = false,
  title = 'AI 工具调用',
  showSummary = true
}) => {
  const [expandedIds, setExpandedIds] = useState(new Set());
  const [isCollapsed, setIsCollapsed] = useState(collapsed);

  const toggleExpand = (callId) => {
    setExpandedIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(callId)) {
        newSet.delete(callId);
      } else {
        newSet.add(callId);
      }
      return newSet;
    });
  };

  const expandAll = () => {
    setExpandedIds(new Set(toolCalls.map(c => c.id)));
  };

  const collapseAll = () => {
    setExpandedIds(new Set());
  };

  // 统计数据
  const stats = {
    total: toolCalls.length,
    success: toolCalls.filter(c => c.status === 'success').length,
    error: toolCalls.filter(c => c.status === 'error').length,
    running: toolCalls.filter(c => c.status === 'running').length,
    pending: toolCalls.filter(c => c.status === 'pending' || c.status === 'waiting').length
  };

  if (!toolCalls.length) {
    return null;
  }

  return (
    <div className={`tool-call-display ${isCollapsed ? 'collapsed' : ''}`}>
      {/* 头部 */}
      <div 
        className="tool-call-display-header"
        onClick={() => setIsCollapsed(!isCollapsed)}
      >
        <span className="tool-call-display-icon">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
          </svg>
        </span>
        <span className="tool-call-display-title">{title}</span>
        
        {/* 摘要统计 */}
        {showSummary && (
          <div className="tool-call-display-summary">
            <span className="summary-total">{stats.total} 个调用</span>
            {stats.success > 0 && (
              <span className="summary-success">+ {stats.success}</span>
            )}
            {stats.error > 0 && (
              <span className="summary-error">x {stats.error}</span>
            )}
            {stats.running > 0 && (
              <span className="summary-running">* {stats.running}</span>
            )}
          </div>
        )}

        <span className={`tool-call-display-collapse-icon ${isCollapsed ? '' : 'expanded'}`}>
          ▼
        </span>
      </div>

      {/* 内容 */}
      {!isCollapsed && (
        <div className="tool-call-display-content">
          {/* 工具栏 */}
          <div className="tool-call-display-toolbar">
            <button 
              className="tool-call-toolbar-btn"
              onClick={expandAll}
              title="展开全部"
            >
              展开全部
            </button>
            <button 
              className="tool-call-toolbar-btn"
              onClick={collapseAll}
              title="折叠全部"
            >
              折叠全部
            </button>
          </div>

          {/* 工具调用列表 */}
          <div className="tool-call-list">
            {toolCalls.map(call => (
              <ToolCallItem
                key={call.id}
                call={call}
                expanded={expandedIds.has(call.id)}
                onToggle={() => toggleExpand(call.id)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * 实时工具调用指示器
 * 用于在 AI 回复中显示当前正在执行的工具
 */
export const ToolCallIndicator = ({ toolCall }) => {
  if (!toolCall) return null;

  const categoryIcon = CATEGORY_ICONS[toolCall.category] || CATEGORY_ICONS.default;
  const statusIcon = STATUS_ICONS[toolCall.status] || STATUS_ICONS.running;

  return (
    <div className="tool-call-indicator">
      <span className="indicator-icon">{categoryIcon}</span>
      <span className="indicator-text">
        正在调用 <strong>{toolCall.name}</strong>
      </span>
      <span className={`indicator-status status-${toolCall.status}`}>
        {statusIcon}
      </span>
      {toolCall.status === 'running' && (
        <span className="indicator-spinner"></span>
      )}
    </div>
  );
};

export default ToolCallDisplay;
