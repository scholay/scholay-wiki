/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罗罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 * 
 * AISearchHeader - AI 搜索头部组件
 * 从 AISearchView.js 提取
 */

import React, { memo } from 'react';
import PropTypes from 'prop-types';
import AIHistoryDropdown from '../AIHistoryDropdown';
import ModelSelector from '../ModelSelector';

/**
 * AISearchHeader 组件
 */
const AISearchHeader = memo(({
  onNavigateHome,
  onSwitchToNormal,
  conversations,
  currentConversationId,
  conversationsLoading,
  onSelectConversation,
  onDeleteConversation,
  onNewConversation,
  modelLevel,
  onModelChange,
  isAuthenticated,
}) => {
  return (
    <div className="ai-search-header">
      {/* 左侧 Logo 和切换按钮 */}
      <div className="ai-header-left">
        <div className="ai-logo" onClick={onNavigateHome}>
          <span className="ai-logo-text">Scholay</span>
        </div>
        <button className="ai-switch-btn" onClick={onSwitchToNormal} title="切换到直接检索">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8"/>
            <path d="M21 21l-4.35-4.35"/>
          </svg>
          <span>直接检索</span>
        </button>
      </div>

      {/* 中间对话选择器 */}
      <div className="ai-header-center">
        <AIHistoryDropdown
          conversations={conversations}
          currentConversationId={currentConversationId}
          onSelectConversation={onSelectConversation}
          onDeleteConversation={onDeleteConversation}
          onNewConversation={onNewConversation}
          loading={conversationsLoading}
        />
      </div>

      {/* 右侧模型选择器 */}
      <div className="ai-header-right">
        <ModelSelector
          value={modelLevel}
          onChange={onModelChange}
          mode="ai-chat"
          compact={true}
          isAuthenticated={isAuthenticated}
          dropdownAlign="right"
        />
      </div>
    </div>
  );
});

AISearchHeader.displayName = 'AISearchHeader';

AISearchHeader.propTypes = {
  onNavigateHome: PropTypes.func.isRequired,
  onSwitchToNormal: PropTypes.func.isRequired,
  conversations: PropTypes.array,
  currentConversationId: PropTypes.number,
  conversationsLoading: PropTypes.bool,
  onSelectConversation: PropTypes.func.isRequired,
  onDeleteConversation: PropTypes.func.isRequired,
  onNewConversation: PropTypes.func.isRequired,
  modelLevel: PropTypes.string,
  onModelChange: PropTypes.func.isRequired,
  isAuthenticated: PropTypes.bool,
};

AISearchHeader.defaultProps = {
  conversations: [],
  conversationsLoading: false,
  modelLevel: 'low',
  isAuthenticated: false,
};

export default AISearchHeader;
