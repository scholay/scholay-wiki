import React from 'react';

const CollapsedView = ({ onToggleCollapse }) => (
  <div className="ai-chat-panel ai-chat-panel-collapsed">
    <div className="ai-chat-header ai-chat-header-collapsed" onClick={onToggleCollapse}>
      <div className="ai-chat-collapsed-bar">
        <div className="ai-chat-collapsed-handle" />
      </div>
      <div className="ai-chat-collapsed-content">
        <span className="ai-chat-collapsed-hint">Thought for 19 seconds...</span>
        <div className="ai-chat-collapsed-actions">
          <button className="ai-chat-collapsed-btn" title="展开">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
              <line x1="9" y1="3" x2="9" y2="21"/>
            </svg>
          </button>
          <button className="ai-chat-collapsed-btn" title="代码视图">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="16 18 22 12 16 6"/>
              <polyline points="8 6 2 12 8 18"/>
            </svg>
          </button>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </div>
      </div>
    </div>
  </div>
);

export default CollapsedView;
