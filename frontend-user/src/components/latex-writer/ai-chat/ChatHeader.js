import React from 'react';
import { LatexCommands } from '../ai';

const ChatHeader = ({
  onToggleCollapse,
  showCommandMenu,
  setShowCommandMenu,
  showModelMenu,
  setShowModelMenu,
  isLoading,
  modelsLoading,
  availableModels,
  selectedModelId,
  setSelectedModelId,
  quickCommands,
  selectedText,
  onQuickCommand,
  onClear,
}) => (
  <div className="ai-chat-header">
    <div className="ai-chat-title" onClick={onToggleCollapse} style={{ cursor: 'pointer' }}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 2a10 10 0 1 0 10 10H12V2z"/>
        <path d="M12 2a10 10 0 0 1 10 10"/>
        <circle cx="12" cy="12" r="6"/>
      </svg>
      Prism AI 助手
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginLeft: 4 }}>
        <polyline points="18 15 12 9 6 15"/>
      </svg>
    </div>
    <div className="ai-chat-header-actions">
      {/* 命令菜单 */}
      <div className="ai-chat-command-select">
        <button
          className="ai-chat-command-btn"
          onClick={() => setShowCommandMenu(!showCommandMenu)}
          disabled={isLoading}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>
          </svg>
          命令
        </button>
        {showCommandMenu && (
          <>
            <div className="ai-chat-menu-overlay" onClick={() => setShowCommandMenu(false)} />
            <div className="ai-chat-command-menu">
              <div className="ai-chat-menu-section">
                <div className="ai-chat-menu-title">快捷命令</div>
                {quickCommands.map(cmd => (
                  <button
                    key={cmd.id}
                    className="ai-chat-menu-item"
                    onClick={() => onQuickCommand(cmd)}
                    disabled={cmd.requiresSelection && !selectedText}
                  >
                    <span className="ai-chat-menu-icon" dangerouslySetInnerHTML={{ __html: cmd.icon }} />
                    <span>{cmd.name}</span>
                    {cmd.shortcut && <span className="ai-chat-menu-shortcut">{cmd.shortcut}</span>}
                  </button>
                ))}
              </div>
              <div className="ai-chat-menu-section">
                <div className="ai-chat-menu-title">高级命令</div>
                {LatexCommands.getAdvancedCommands().slice(0, 4).map(cmd => (
                  <button
                    key={cmd.id}
                    className="ai-chat-menu-item"
                    onClick={() => onQuickCommand(cmd)}
                    disabled={cmd.requiresSelection && !selectedText}
                  >
                    <span className="ai-chat-menu-icon" dangerouslySetInnerHTML={{ __html: cmd.icon }} />
                    <span>{cmd.name}</span>
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      {/* 模型选择 */}
      <div className="ai-chat-model-select">
        <button
          className="ai-chat-model-btn"
          onClick={() => setShowModelMenu(!showModelMenu)}
          disabled={modelsLoading}
        >
          {modelsLoading ? '加载中...' : (
            availableModels.find(m => m.id === selectedModelId)?.display_name || '选择模型'
          )}
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </button>
        {showModelMenu && !modelsLoading && (
          <>
            <div className="ai-chat-menu-overlay" onClick={() => setShowModelMenu(false)} />
            <div className="ai-chat-model-menu">
              {availableModels.length === 0 ? (
                <div className="ai-chat-model-empty">暂无可用模型</div>
              ) : (
                availableModels.map(model => (
                  <button
                    key={model.id}
                    className={`ai-chat-model-item ${selectedModelId === model.id ? 'active' : ''}`}
                    onClick={() => { setSelectedModelId(model.id); setShowModelMenu(false); }}
                  >
                    <span className="ai-chat-model-label">
                      {model.display_name}
                      {model.is_default && <span className="ai-chat-model-default">默认</span>}
                    </span>
                    {model.description && (
                      <span className="ai-chat-model-desc">{model.description}</span>
                    )}
                  </button>
                ))
              )}
            </div>
          </>
        )}
      </div>
      
      {/* 清空按钮 */}
      <button className="ai-chat-clear-btn" onClick={onClear} title="清空对话">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="3 6 5 6 21 6"/>
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
        </svg>
      </button>
    </div>
  </div>
);

export default ChatHeader;
