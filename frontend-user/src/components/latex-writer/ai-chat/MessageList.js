import React, { useRef, useEffect, useCallback } from 'react';
import { parseStreamingMessage } from '../ai/MessageParser';
import DiffViewer from '../DiffViewer';
import { ToolCallIndicator } from '../ToolCallDisplay';
import ThinkingPanel from '../ThinkingPanel';
import CodePreview from '../CodePreview';

const MessageList = ({
  messages,
  currentResponse,
  currentToolCall,
  thinkingDuration,
  fullContent,
  onApplySuggestion,
  extractLatexCode,
  setLocalMessages,
  getExtraContent,
  isLoading,
  selectedText,
  quickCommands,
  onQuickCommand,
}) => {
  const messagesEndRef = useRef(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, currentResponse, scrollToBottom]);

  const handleApply = useCallback((content) => {
    const codeBlockMatch = content.match(/```(?:latex|tex)?\n?([\s\S]*?)```/);
    const suggestion = codeBlockMatch ? codeBlockMatch[1].trim() : content;
    onApplySuggestion?.(suggestion);
  }, [onApplySuggestion]);

  const renderMessageContent = (msg, index) => {
    const isLastAssistant = msg.role === 'assistant' && index === messages.length - 1;
    
    if (isLastAssistant && currentResponse) {
      const streamParsed = parseStreamingMessage(currentResponse);
      const isThinkStreaming = streamParsed.currentSection === 'think';
      const isReplyStreaming = streamParsed.currentSection === 'reply';
      const isCodeStreaming = streamParsed.currentSection === 'code';
      const isRawMode = streamParsed.currentSection === 'raw' || streamParsed.currentSection === 'none';
      
      if (isRawMode || streamParsed.currentSection === 'waiting') {
        return (
          <div className="ai-chat-parsed-content">
            {currentToolCall && <ToolCallIndicator toolCall={currentToolCall} />}
            <div className="ai-chat-reply ai-chat-streaming-raw">
              {streamParsed.displayText || currentResponse}
              <span className="ai-chat-cursor">▋</span>
            </div>
          </div>
        );
      }
      
      const extraContent = getExtraContent(currentResponse, streamParsed);
      
      return (
        <div className="ai-chat-parsed-content">
          {currentToolCall && <ToolCallIndicator toolCall={currentToolCall} />}
          {streamParsed.thinkText && (
            <ThinkingPanel
              content={streamParsed.thinkText}
              isStreaming={isThinkStreaming}
              duration={thinkingDuration}
              defaultOpen={true}
            />
          )}
          {streamParsed.replyText && (
            <div className="ai-chat-reply">
              {streamParsed.replyText}
              {isReplyStreaming && <span className="ai-chat-cursor">▋</span>}
            </div>
          )}
          {streamParsed.codeText && (
            <CodePreview
              code={streamParsed.codeText}
              originalCode={fullContent}
              isStreaming={isCodeStreaming}
              onApply={onApplySuggestion}
            />
          )}
          {extraContent && (
            <div className="ai-chat-extra-content">
              {extraContent}
              {!streamParsed.isComplete && <span className="ai-chat-cursor">▋</span>}
            </div>
          )}
          {!streamParsed.thinkText && !streamParsed.replyText && !streamParsed.codeText && !extraContent && (
            <span className="ai-chat-cursor">▋</span>
          )}
        </div>
      );
    }
    
    if (msg.role === 'user') return msg.content || '';
    
    if (msg.role === 'assistant') {
      const thinkContent = msg.thinkContent || msg.parsed?.think;
      const replyContent = msg.replyContent || msg.parsed?.reply;
      const codeContent = msg.codeContent || msg.parsed?.code;
      const msgThinkingDuration = msg.thinkingDuration || 0;
      const msgCodeStats = msg.codeStats || null;
      const hasStructuredContent = !!(thinkContent || replyContent || codeContent);
      
      if (hasStructuredContent) {
        return (
          <div className="ai-chat-parsed-content">
            {thinkContent && (
              <ThinkingPanel
                content={thinkContent}
                isStreaming={false}
                duration={msgThinkingDuration}
                defaultOpen={false}
              />
            )}
            {replyContent && <div className="ai-chat-reply">{replyContent}</div>}
            {codeContent && !msg.hasDiff && (
              <CodePreview
                code={codeContent}
                originalCode={fullContent}
                isStreaming={false}
                onApply={onApplySuggestion}
                preCalculatedStats={msgCodeStats}
              />
            )}
          </div>
        );
      }
      
      if (msg.isStreaming) return <span className="ai-chat-cursor">▋</span>;
      
      return <div className="ai-chat-reply ai-chat-empty-message">（历史消息格式不兼容）</div>;
    }
    
    return msg.content || '';
  };

  return (
    <>
      {/* 选中文本提示 */}
      {selectedText && (
        <div className="ai-chat-selection-hint">
          <span>已选中 {selectedText.length} 字符</span>
          <div className="ai-chat-quick-actions">
            {quickCommands.slice(0, 4).map(cmd => (
              <button
                key={cmd.id}
                className="ai-chat-quick-btn"
                onClick={() => onQuickCommand(cmd)}
                disabled={isLoading}
                title={cmd.name}
              >
                {cmd.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 消息列表 */}
      <div className="ai-chat-messages">
        {messages.length === 0 ? (
          <div className="ai-chat-empty">
            <p>输入问题或选中 LaTeX 代码后使用快捷命令</p>
            <div className="ai-chat-tips">
              <p>提示：</p>
              <ul>
                <li>选中代码后可使用快捷命令（续写、润色、翻译等）</li>
                <li>点击消息中的"应用"可将修改插入编辑器</li>
                <li>支持自定义提问，AI 会根据上下文回答</li>
                <li>AI 会自动调用工具来帮助完成任务</li>
              </ul>
            </div>
          </div>
        ) : (
          messages.map((msg, index) => (
            <div
              key={index}
              className={`ai-chat-message ${msg.role} ${msg.isError ? 'error' : ''} ${msg.isStreaming ? 'streaming' : ''} ${msg.hasDiff ? 'has-diff' : ''}`}
            >
              {msg.context && (
                <div className="ai-chat-message-context">
                  <span className="ai-chat-context-label">选中内容:</span>
                  <pre>{msg.context.substring(0, 200)}{msg.context.length > 200 ? '...' : ''}</pre>
                </div>
              )}
              
              {msg.hasDiff && msg.originalCode && msg.modifiedCode && (
                <div className="ai-chat-diff-container">
                  <DiffViewer
                    oldContent={msg.originalCode}
                    newContent={msg.modifiedCode}
                    onAccept={() => {
                      handleApply(msg.modifiedCode);
                      setLocalMessages(prev => {
                        const updated = [...prev];
                        updated[index] = { ...updated[index], hasDiff: false, diffApplied: true };
                        return updated;
                      });
                    }}
                    onReject={() => {
                      setLocalMessages(prev => {
                        const updated = [...prev];
                        updated[index] = { ...updated[index], hasDiff: false, diffRejected: true };
                        return updated;
                      });
                    }}
                    title="AI 建议的修改"
                  />
                </div>
              )}
              
              {msg.diffApplied && (
                <div className="ai-chat-diff-status applied">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                  修改已应用到编辑器
                </div>
              )}
              {msg.diffRejected && (
                <div className="ai-chat-diff-status rejected">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18"/>
                    <line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                  已放弃修改
                </div>
              )}
              
              {!msg.hasDiff && !msg.diffApplied && !msg.diffRejected && (
                <div className="ai-chat-message-content">
                  {renderMessageContent(msg, index)}
                </div>
              )}
              
              {msg.role === 'assistant' && !msg.isStreaming && !msg.isError && msg.content && !msg.hasDiff && !msg.diffApplied && !msg.diffRejected && (
                <div className="ai-chat-message-actions">
                  {!msg.codeContent && (
                    <button
                      className="ai-chat-action-btn"
                      onClick={() => {
                        const code = extractLatexCode(msg.content);
                        if (code) onApplySuggestion?.(code);
                        else handleApply(msg.content);
                      }}
                      title="应用到编辑器"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="20 6 9 17 4 12"/>
                      </svg>
                      应用
                    </button>
                  )}
                  <button
                    className="ai-chat-action-btn"
                    onClick={() => navigator.clipboard.writeText(msg.codeContent || msg.content)}
                    title="复制"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                    </svg>
                    复制
                  </button>
                </div>
              )}
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>
    </>
  );
};

export default MessageList;
