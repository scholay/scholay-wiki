import React, { useState, useRef, useEffect, memo, useCallback, useMemo } from 'react';
import './AIHistoryDropdown.css';

const AIHistoryDropdown = memo(({
  conversations,
  currentConversationId,
  onSelectConversation,
  onDeleteConversation,
  onNewConversation,
  loading,
}) => {
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef(null);

  // 点击外部关闭下拉框
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // 获取当前会话标题 - 使用 useMemo 缓存
  const currentTitle = useMemo(() => {
    if (!currentConversationId || !conversations || conversations.length === 0) {
      return '新对话';
    }
    const current = conversations.find(c => c.id === currentConversationId);
    return current?.title || '新对话';
  }, [currentConversationId, conversations]);

  // 格式化时间 - 使用 useCallback 缓存
  const formatTime = useCallback((dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    const now = new Date();
    const diff = now - date;
    
    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;
    if (diff < 604800000) return `${Math.floor(diff / 86400000)}天前`;
    
    return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
  }, []);

  // 处理新建对话
  const handleNewConversation = useCallback(() => {
    onNewConversation();
    setShowDropdown(false);
  }, [onNewConversation]);

  // 处理选择对话
  const handleSelectConversation = useCallback((convId) => {
    onSelectConversation(convId);
    setShowDropdown(false);
  }, [onSelectConversation]);

  return (
    <div className="ai-history-dropdown" ref={dropdownRef}>
      <button 
        className={`ai-history-dropdown-btn ${showDropdown ? 'open' : ''}`}
        onClick={() => setShowDropdown(!showDropdown)}
        disabled={loading}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10"/>
          <polyline points="12,6 12,12 16,14"/>
        </svg>
        <span className="ai-history-btn-text">{currentTitle}</span>
        <svg 
          className={`ai-history-arrow ${showDropdown ? 'open' : ''}`}
          width="12" 
          height="12" 
          viewBox="0 0 24 24" 
          fill="none" 
          stroke="currentColor" 
          strokeWidth="2"
        >
          <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
      
      {showDropdown && (
        <>
          <div className="ai-dropdown-overlay" onClick={() => setShowDropdown(false)} />
          <div className="ai-history-dropdown-menu">
            <div className="ai-dropdown-header">
              <span>历史对话</span>
              <button 
                className="ai-dropdown-new-btn"
                onClick={handleNewConversation}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 5v14M5 12h14" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                新建
              </button>
            </div>
            
            <div className="ai-history-list">
              {(!conversations || conversations.length === 0) ? (
                <div className="ai-history-empty">暂无历史对话</div>
              ) : (
                conversations.map((conv) => (
                  <div 
                    key={conv.id} 
                    className={`ai-history-item ${conv.id === currentConversationId ? 'active' : ''}`}
                    onClick={() => handleSelectConversation(conv.id)}
                  >
                    <div className="ai-history-item-content">
                      <span className="ai-history-item-title">{conv.title || '未命名对话'}</span>
                      <span className="ai-history-item-time">{formatTime(conv.updated_at || conv.created_at)}</span>
                    </div>
                    <button
                      className="ai-history-item-delete"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (window.confirm('确定要删除这个对话吗？')) {
                          onDeleteConversation(conv.id);
                        }
                      }}
                      title="删除对话"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
});

AIHistoryDropdown.displayName = 'AIHistoryDropdown';

export default AIHistoryDropdown;
