/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 * 
 * AI 对话面板组件
 * 使用 LaTeX AI Agent 系统
 */

import React, { useState, useCallback, useRef, useEffect, useMemo, forwardRef, useImperativeHandle } from 'react';
import { useAuth } from '../../utils/AuthContext';
import { LatexAiAgent, LatexCommands } from './ai';
import { parseAiMessage, parseStreamingMessage, calculateCodeDiff } from './ai/MessageParser';
import { useLatexConversation } from './hooks/useLatexConversation';
import DiffViewer from './DiffViewer';
import PermissionDialog from './PermissionDialog';
import ToolCallDisplay, { ToolCallIndicator } from './ToolCallDisplay';
import ThinkingPanel from './ThinkingPanel';
import CodePreview from './CodePreview';
import { userAPI } from '../../services/api';
import { trackScholayPrism } from '../../utils/usageTracker';
import './AiChatPanel.css';

const AiChatPanel = forwardRef(function AiChatPanel({ 
  documentId, 
  selectedText, 
  fullContent, 
  onApplySuggestion, 
  cursorPosition,
  pendingMessage,  // 新增：外部触发的待发送消息
  onPendingMessageSent,  // 新增：消息发送后的回调
  isCollapsed = false,  // 是否折叠
  onToggleCollapse,  // 切换折叠状态
}, ref) {
  const { isAuthenticated, token } = useAuth();
  
  // 使用对话历史 Hook（当有 documentId 时）
  const {
    conversation,
    messages: historyMessages,
    isLoading: historyLoading,
    hasMore,
    loadHistory,
    addMessage: addHistoryMessage,
    updateLastMessage: updateHistoryLastMessage,
    clearConversation,
    getStreamChatUrl,
  } = useLatexConversation(documentId);
  
  // 状态
  const [localMessages, setLocalMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [availableModels, setAvailableModels] = useState([]);
  const [selectedModelId, setSelectedModelId] = useState(null);
  const [showModelMenu, setShowModelMenu] = useState(false);
  const [showCommandMenu, setShowCommandMenu] = useState(false);
  const [currentResponse, setCurrentResponse] = useState('');
  const [modelsLoading, setModelsLoading] = useState(true);
  
  // Diff 状态
  const [pendingDiff, setPendingDiff] = useState(null); // { original, modified, messageIndex }
  
  // 工具调用和权限状态
  const [toolCalls, setToolCalls] = useState([]); // 当前消息的工具调用
  const [currentToolCall, setCurrentToolCall] = useState(null); // 正在执行的工具调用
  const [permissionRequest, setPermissionRequest] = useState(null); // 待确认的权限请求
  const [showPermissionDialog, setShowPermissionDialog] = useState(false);
  
  // 思考时间跟踪状态
  const [thinkingStartTime, setThinkingStartTime] = useState(null);
  const [thinkingDuration, setThinkingDuration] = useState(0);
  
  // 当 documentId 变化时清空本地消息，以便显示新项目的历史消息
  const prevDocumentIdRef = useRef(documentId);
  useEffect(() => {
    if (documentId !== prevDocumentIdRef.current) {
      console.log('[AiChatPanel] documentId changed, clearing local messages');
      setLocalMessages([]);
      setCurrentResponse('');
      setToolCalls([]);
      setCurrentToolCall(null);
      prevDocumentIdRef.current = documentId;
    }
  }, [documentId]);

  // 合并本地消息和历史消息
  const messages = useMemo(() => {
    // 优先级：本地消息 > 历史消息
    // 本地消息包含当前会话中的对话，应该优先显示
    if (localMessages.length > 0) {
      return localMessages;
    }
    
    // 如果本地没有消息，显示历史消息
    if (documentId && historyMessages.length > 0) {
      // 将历史消息转换为本地消息格式
      console.log('[AiChatPanel] Rendering history messages:', historyMessages.length);
      return historyMessages.map(msg => {
        const thinkContent = msg.think_content || null;
        const replyContent = msg.reply_content || null;
        const codeContent = msg.code_content || null;
        const hasStructured = !!(thinkContent || replyContent || codeContent);
        
        // 获取思考时间和代码统计（如果后端有保存的话）
        const msgThinkingDuration = msg.thinking_duration || 0;
        const msgCodeStats = msg.code_stats || null;
        
        // 调试日志
        if (msg.role === 'assistant') {
          console.log('[AiChatPanel] Assistant message:', {
            hasContent: !!msg.content,
            contentLength: msg.content?.length,
            hasStructured,
            thinkContent: !!thinkContent,
            replyContent: !!replyContent,
            codeContent: !!codeContent,
            thinkingDuration: msgThinkingDuration,
            codeStats: msgCodeStats,
          });
        }
        
        return {
          role: msg.role,
          content: msg.content || '',
          thinkContent,
          replyContent,
          codeContent,
          // 思考时间和代码统计
          thinkingDuration: msgThinkingDuration,
          codeStats: msgCodeStats,
          // 对于助理消息，始终创建 parsed 对象以便渲染逻辑正确处理
          parsed: msg.role === 'assistant' ? {
            think: thinkContent,
            reply: replyContent,
            code: codeContent,
            raw: msg.content || '',
            hasStructured,
          } : null,
          isStreaming: false,
          createdAt: msg.created_at,
        };
      });
    }
    
    return [];
  }, [documentId, historyMessages, localMessages]);
  
  // 设置消息的统一方法
  const setMessages = useCallback((updater) => {
    if (documentId) {
      // 当有 documentId 时，实际使用 historyMessages，这里只更新本地临时状态
      setLocalMessages(updater);
    } else {
      setLocalMessages(updater);
    }
  }, [documentId]);
  
  // 提取 LaTeX 代码块的辅助函数
  const extractLatexCode = useCallback((content) => {
    if (!content) return null;
    // 尝试提取 ```latex ... ``` 或 ```tex ... ``` 代码块
    const latexMatch = content.match(/```(?:latex|tex)?\n?([\s\S]*?)```/);
    if (latexMatch) {
      return latexMatch[1].trim();
    }
    // 如果内容本身看起来像 LaTeX 代码
    if (content.includes('\\') && (
      content.includes('\\begin') ||
      content.includes('\\section') ||
      content.includes('\\documentclass') ||
      content.includes('\\usepackage') ||
      content.includes('\\textbf') ||
      content.includes('\\item')
    )) {
      return content.trim();
    }
    return null;
  }, []);
  
  // 引用
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const agentRef = useRef(null);
  const selectedTextRef = useRef(selectedText);
  
  // 更新 selectedText ref
  useEffect(() => {
    selectedTextRef.current = selectedText;
  }, [selectedText]);

  // 加载可用模型列表
  useEffect(() => {
    const loadModels = async () => {
      try {
        setModelsLoading(true);
        const response = await userAPI.getLatexAgentModels();
        if (response.data?.code === 0 && response.data?.data?.models) {
          const models = response.data.data.models;
          setAvailableModels(models);
          // 设置默认模型
          const defaultModel = models.find(m => m.is_default) || models[0];
          if (defaultModel) {
            setSelectedModelId(defaultModel.id);
          }
        }
      } catch (error) {
        console.error('Failed to load models:', error);
        // 加载失败时使用备用默认值
        setAvailableModels([{
          id: 0,
          display_name: '默认模型',
          description: '使用服务器默认配置',
        }]);
        setSelectedModelId(0);
      } finally {
        setModelsLoading(false);
      }
    };

    if (isAuthenticated) {
      loadModels();
    }
  }, [isAuthenticated]);
  
  // 提取 LaTeX 代码的函数（在 effect 外定义以便引用）
  const extractLatexCodeFn = (content) => {
    if (!content) return null;
    const latexMatch = content.match(/```(?:latex|tex)?\n?([\s\S]*?)```/);
    if (latexMatch) {
      return latexMatch[1].trim();
    }
    if (content.includes('\\') && (
      content.includes('\\begin') ||
      content.includes('\\section') ||
      content.includes('\\documentclass') ||
      content.includes('\\usepackage') ||
      content.includes('\\textbf') ||
      content.includes('\\item')
    )) {
      return content.trim();
    }
    return null;
  };

  // 初始化 Agent
  useEffect(() => {
    // 获取 API 端点（如果有 documentId，使用带上下文的端点）
    const apiEndpoint = documentId 
      ? getStreamChatUrl() 
      : '/api/v1/user/latex-writer/chat/stream';
    
    agentRef.current = new LatexAiAgent({
      defaultModelId: selectedModelId,
      apiEndpoint: apiEndpoint,
    });

    const agent = agentRef.current;

    agent.on('onStart', () => {
      setIsLoading(true);
      setCurrentResponse('');
      setThinkingStartTime(Date.now());
      setThinkingDuration(0);
    });

    agent.on('onMessage', (text, isComplete) => {
      setCurrentResponse(text);
      if (isComplete) {
        // 更新最后一条消息
        setLocalMessages(prev => {
          const updated = [...prev];
          const lastIndex = updated.length - 1;
          if (updated[lastIndex]?.role === 'assistant') {
            updated[lastIndex] = {
              ...updated[lastIndex],
              content: text,
              isStreaming: false
            };
          }
          return updated;
        });
      }
    });

    agent.on('onComplete', (fullText) => {
      setIsLoading(false);
      setCurrentResponse('');
      
      // 计算思考时间
      const duration = thinkingStartTime ? Math.round((Date.now() - thinkingStartTime) / 1000) : 0;
      setThinkingDuration(duration);
      setThinkingStartTime(null);
      
      // 解析结构化输出
      const parsed = parseAiMessage(fullText);
      
      // 提取代码
      const extractedCode = parsed.code || extractLatexCodeFn(fullText);
      
      // 计算代码 diff 统计
      let codeStats = null;
      if (extractedCode && fullContent) {
        codeStats = calculateCodeDiff(fullContent, extractedCode);
      }
      
      // 如果有代码，自动应用到编辑器（通过 diff 确认）
      if (extractedCode && onApplySuggestion) {
        // 调用外部的 handleApplySuggestion，显示 diff 对比
        onApplySuggestion(extractedCode);
      }
      
      // 确保最终内容正确（标记为非流式）
      setLocalMessages(prev => {
        const updated = [...prev];
        const lastIndex = updated.length - 1;
        if (updated[lastIndex]?.role === 'assistant') {
          updated[lastIndex] = {
            ...updated[lastIndex],
            content: fullText,
            isStreaming: false,
            // 解析后的结构化数据
            parsed: parsed,
            thinkContent: parsed.think,
            replyContent: parsed.reply,
            codeContent: parsed.code,
            // 思考时间和代码统计
            thinkingDuration: duration,
            codeStats: codeStats,
            // 代码已自动触发 diff
            hasDiff: false,
          };
        }
        return updated;
      });
      
      // 注意：不再自动清空 localMessages
      // 历史消息会在下次对话或刷新页面时从后端加载
      // 这样可以确保当前对话内容始终可见
    });

    agent.on('onError', (error) => {
      setIsLoading(false);
      setCurrentToolCall(null);
      setThinkingStartTime(null);
      setThinkingDuration(0);
      setLocalMessages(prev => {
        const updated = [...prev];
        const lastIndex = updated.length - 1;
        if (updated[lastIndex]?.role === 'assistant') {
          updated[lastIndex] = {
            role: 'assistant',
            content: `抱歉，请求出错: ${error.message}`,
            isError: true,
            isStreaming: false
          };
        }
        return updated;
      });
    });

    // 工具调用事件（如果支持）
    agent.on('onToolCall', (toolCall) => {
      const newToolCall = {
        id: toolCall.id || `tool-${Date.now()}`,
        name: toolCall.name,
        category: toolCall.category || 'default',
        description: toolCall.description,
        arguments: toolCall.arguments,
        status: 'running',
        startTime: Date.now()
      };
      setCurrentToolCall(newToolCall);
      setToolCalls(prev => [...prev, newToolCall]);
    });

    agent.on('onToolResult', (result) => {
      setToolCalls(prev => prev.map(tc => 
        tc.id === result.callId 
          ? { ...tc, status: result.success ? 'success' : 'error', result: result.data, endTime: Date.now() }
          : tc
      ));
      setCurrentToolCall(null);
    });

    // 权限请求事件（如果支持）
    agent.on('onPermissionRequest', (request) => {
      setPermissionRequest({
        requestId: request.id,
        toolName: request.toolName,
        description: request.description,
        arguments: request.arguments,
        riskLevel: request.riskLevel || 'medium'
      });
      setShowPermissionDialog(true);
    });

    return () => {
      agent.destroy();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentId]); // 当 documentId 变化时重新初始化 Agent

  // 更新模型 ID
  useEffect(() => {
    if (agentRef.current) {
      agentRef.current.updateConfig({ defaultModelId: selectedModelId });
    }
  }, [selectedModelId]);

  // 滚动到底部
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, currentResponse, scrollToBottom]);

  // 获取快捷命令
  const quickCommands = useMemo(() => LatexCommands.getQuickCommands(), []);

  // 发送指定消息的函数（供外部调用或 pendingMessage 使用）
  const sendMessage = useCallback(async (message) => {
    if (!message?.trim() || isLoading) return;
    
    if (!isAuthenticated) {
      setLocalMessages(prev => [...prev, {
        role: 'assistant',
        content: '请先登录后再使用 AI 功能。',
        isError: true
      }]);
      return;
    }

    const prompt = message.trim();

    // 添加用户消息
    const userMessage = {
      role: 'user',
      content: prompt,
      context: selectedText ? `[选中内容]\n${selectedText}` : null
    };
    setLocalMessages(prev => [...prev, userMessage]);
    
    // 添加助手消息占位
    setLocalMessages(prev => [...prev, {
      role: 'assistant',
      content: '',
      isStreaming: true
    }]);

    // 使用 Agent 发送
    await agentRef.current?.chatWithContext(selectedText, prompt, {
      fullContent,
      modelId: selectedModelId,
    });
  }, [isLoading, isAuthenticated, selectedText, fullContent, selectedModelId]);

  // 暴露方法给父组件
  useImperativeHandle(ref, () => ({
    sendMessage,
  }), [sendMessage]);

  // 处理外部触发的待发送消息
  useEffect(() => {
    if (pendingMessage && !isLoading) {
      sendMessage(pendingMessage);
      onPendingMessageSent?.();
    }
  }, [pendingMessage, isLoading, sendMessage, onPendingMessageSent]);

  // 发送消息
  const handleSend = useCallback(async () => {
    if (!inputValue.trim() || isLoading) return;
    
    if (!isAuthenticated) {
      setLocalMessages(prev => [...prev, {
        role: 'assistant',
        content: '请先登录后再使用 AI 功能。',
        isError: true
      }]);
      return;
    }

    const prompt = inputValue.trim();
    setInputValue('');

    // 记录 ScholayPrism 使用统计
    trackScholayPrism(documentId);

    // 添加用户消息
    const userMessage = {
      role: 'user',
      content: prompt,
      context: selectedText ? `[选中内容]\n${selectedText}` : null
    };
    setLocalMessages(prev => [...prev, userMessage]);
    
    // 添加助手消息占位
    setLocalMessages(prev => [...prev, {
      role: 'assistant',
      content: '',
      isStreaming: true
    }]);

    // 使用 Agent 发送
    await agentRef.current.chatWithContext(selectedText, prompt, {
      fullContent,
      modelId: selectedModelId,
    });
  }, [inputValue, isLoading, isAuthenticated, selectedText, fullContent, selectedModelId, documentId]);

  // 执行快捷命令
  const handleQuickCommand = useCallback(async (command) => {
    if (isLoading) return;
    
    if (!isAuthenticated) {
      setLocalMessages(prev => [...prev, {
        role: 'assistant',
        content: '请先登录后再使用 AI 功能。',
        isError: true
      }]);
      return;
    }

    if (command.requiresSelection && !selectedText) {
      setLocalMessages(prev => [...prev, {
        role: 'assistant',
        content: '此操作需要先选中文本。',
        isError: true
      }]);
      return;
    }

    // 添加用户消息
    setLocalMessages(prev => [...prev, {
      role: 'user',
      content: `执行命令: ${command.name}`,
      context: selectedText ? `[选中内容]\n${selectedText}` : null
    }]);
    
    // 添加助手消息占位
    setLocalMessages(prev => [...prev, {
      role: 'assistant',
      content: '',
      isStreaming: true
    }]);

    setShowCommandMenu(false);

    // 使用 Agent 执行命令
    await agentRef.current.executeCommand(command.id, selectedText, {
      fullContent,
      modelId: selectedModelId,
    });
  }, [isLoading, isAuthenticated, selectedText, fullContent, selectedModelId]);

  // 取消请求
  const handleCancel = useCallback(() => {
    if (agentRef.current) {
      agentRef.current.stop();
    }
    setIsLoading(false);
  }, []);

  // 应用建议到编辑器
  const handleApply = useCallback((content) => {
    // 提取代码块中的内容
    const codeBlockMatch = content.match(/```(?:latex|tex)?\n?([\s\S]*?)```/);
    const suggestion = codeBlockMatch ? codeBlockMatch[1].trim() : content;
    onApplySuggestion?.(suggestion);
  }, [onApplySuggestion]);

  // 清空对话
  const handleClear = useCallback(async () => {
    if (isLoading) {
      handleCancel();
    }
    // 如果有 documentId，调用后端清空对话
    if (documentId && clearConversation) {
      await clearConversation();
    }
    setLocalMessages([]);
    setToolCalls([]);
    setCurrentToolCall(null);
  }, [isLoading, handleCancel, documentId, clearConversation]);

  // 权限批准处理
  const handlePermissionApprove = useCallback(async (response) => {
    setShowPermissionDialog(false);
    setPermissionRequest(null);
    
    // 通知 Agent 权限已批准
    if (agentRef.current && agentRef.current.respondToPermissionRequest) {
      agentRef.current.respondToPermissionRequest({
        requestId: response.requestId,
        approved: true,
        scope: response.scope
      });
    }
  }, []);

  // 权限拒绝处理
  const handlePermissionDeny = useCallback(async (response) => {
    setShowPermissionDialog(false);
    setPermissionRequest(null);
    
    // 通知 Agent 权限被拒绝
    if (agentRef.current && agentRef.current.respondToPermissionRequest) {
      agentRef.current.respondToPermissionRequest({
        requestId: response.requestId,
        approved: false
      });
    }
  }, []);

  // 键盘事件
  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  // 渲染消息内容（处理流式更新和结构化输出）
  const renderMessageContent = (msg, index) => {
    const isLastAssistant = msg.role === 'assistant' && index === messages.length - 1;
    
    // 如果是流式输出中
    if (isLastAssistant && currentResponse) {
      const streamParsed = parseStreamingMessage(currentResponse);
      // 根据 currentSection 判断各部分的流式状态
      const isThinkStreaming = streamParsed.currentSection === 'think';
      const isReplyStreaming = streamParsed.currentSection === 'reply';
      const isCodeStreaming = streamParsed.currentSection === 'code';
      const isWaiting = streamParsed.currentSection === 'waiting';
      const isRawMode = streamParsed.currentSection === 'raw' || streamParsed.currentSection === 'none';
      
      // 如果是原始模式（没有检测到标签）或等待模式（标签不完整），显示原始文本
      if (isRawMode || isWaiting) {
        return (
          <div className="ai-chat-parsed-content">
            {currentToolCall && (
              <ToolCallIndicator toolCall={currentToolCall} />
            )}
            <div className="ai-chat-reply ai-chat-streaming-raw">
              {streamParsed.displayText || currentResponse}
              <span className="ai-chat-cursor">▋</span>
            </div>
          </div>
        );
      }
      
      return (
        <div className="ai-chat-parsed-content">
          {/* 显示正在执行的工具调用 */}
          {currentToolCall && (
            <ToolCallIndicator toolCall={currentToolCall} />
          )}
          {/* 思考内容 - 使用 ThinkingPanel */}
          {streamParsed.thinkText && (
            <ThinkingPanel
              content={streamParsed.thinkText}
              isStreaming={isThinkStreaming}
              duration={thinkingDuration}
              defaultOpen={true}
            />
          )}
          {/* 回复内容 - 带流式光标 */}
          {streamParsed.replyText && (
            <div className="ai-chat-reply">
              {streamParsed.replyText}
              {isReplyStreaming && <span className="ai-chat-cursor">▋</span>}
            </div>
          )}
          {/* 代码预览 - 使用 CodePreview */}
          {streamParsed.codeText && (
            <CodePreview
              code={streamParsed.codeText}
              originalCode={fullContent}
              isStreaming={isCodeStreaming}
              onApply={onApplySuggestion}
            />
          )}
          {/* 如果还没有任何内容，显示等待光标 */}
          {!streamParsed.thinkText && !streamParsed.replyText && !streamParsed.codeText && (
            <span className="ai-chat-cursor">▋</span>
          )}
        </div>
      );
    }
    
    // 用户消息：直接显示内容
    if (msg.role === 'user') {
      return msg.content || '';
    }
    
    // 助理消息处理
    if (msg.role === 'assistant') {
      const thinkContent = msg.thinkContent || msg.parsed?.think;
      const replyContent = msg.replyContent || msg.parsed?.reply;
      const codeContent = msg.codeContent || msg.parsed?.code;
      const rawContent = msg.content || msg.parsed?.raw || '';
      const msgThinkingDuration = msg.thinkingDuration || 0;
      const msgCodeStats = msg.codeStats || null;
      
      const hasStructuredContent = !!(thinkContent || replyContent || codeContent);
      
      // 如果有结构化内容，显示结构化格式
      if (hasStructuredContent) {
        return (
          <div className="ai-chat-parsed-content">
            {/* 思考内容 - 使用 ThinkingPanel */}
            {thinkContent && (
              <ThinkingPanel
                content={thinkContent}
                isStreaming={false}
                duration={msgThinkingDuration}
                defaultOpen={false}
              />
            )}
            {/* 回复内容 */}
            {replyContent && (
              <div className="ai-chat-reply">{replyContent}</div>
            )}
            {/* 代码预览 - 使用 CodePreview */}
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
      
      // 流式输出中的占位符
      if (msg.isStreaming) {
        return <span className="ai-chat-cursor">▋</span>;
      }
      
      // 没有结构化内容的旧数据，不显示
      return <div className="ai-chat-reply ai-chat-empty-message">（历史消息格式不兼容）</div>;
    }
    
    // 其他角色（如 system），显示原始内容
    return msg.content || '';
  };

  // 折叠状态渲染
  if (isCollapsed) {
    return (
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
  }

  return (
    <div className="ai-chat-panel">
      {/* 头部 */}
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
                        onClick={() => handleQuickCommand(cmd)}
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
                        onClick={() => handleQuickCommand(cmd)}
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
          <button
            className="ai-chat-clear-btn"
            onClick={handleClear}
            title="清空对话"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
          </button>
        </div>
      </div>

      {/* 选中文本提示 */}
      {selectedText && (
        <div className="ai-chat-selection-hint">
          <span>已选中 {selectedText.length} 字符</span>
          <div className="ai-chat-quick-actions">
            {quickCommands.slice(0, 4).map(cmd => (
              <button
                key={cmd.id}
                className="ai-chat-quick-btn"
                onClick={() => handleQuickCommand(cmd)}
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
              
              {/* Diff 预览 */}
              {msg.hasDiff && msg.originalCode && msg.modifiedCode && (
                <div className="ai-chat-diff-container">
                  <DiffViewer
                    oldContent={msg.originalCode}
                    newContent={msg.modifiedCode}
                    onAccept={() => {
                      handleApply(msg.modifiedCode);
                      // 标记 diff 已处理
                      setLocalMessages(prev => {
                        const updated = [...prev];
                        updated[index] = { ...updated[index], hasDiff: false, diffApplied: true };
                        return updated;
                      });
                    }}
                    onReject={() => {
                      // 标记 diff 已处理
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
              
              {/* Diff 已处理的状态消息 */}
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
              
              {/* 普通消息内容 */}
              {!msg.hasDiff && !msg.diffApplied && !msg.diffRejected && (
                <div className="ai-chat-message-content">
                  {renderMessageContent(msg, index)}
                </div>
              )}
              
              {msg.role === 'assistant' && !msg.isStreaming && !msg.isError && msg.content && !msg.hasDiff && !msg.diffApplied && !msg.diffRejected && (
                <div className="ai-chat-message-actions">
                  {/* 只有当消息中没有 codeContent 时才显示整体应用按钮 */}
                  {!msg.codeContent && (
                    <button
                      className="ai-chat-action-btn"
                      onClick={() => {
                        // 提取代码块
                        const code = extractLatexCode(msg.content);
                        if (code) {
                          onApplySuggestion?.(code);
                        } else {
                          handleApply(msg.content);
                        }
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

      {/* 工具调用显示（当有工具调用且不是流式输出时） */}
      {toolCalls.length > 0 && !isLoading && (
        <ToolCallDisplay 
          toolCalls={toolCalls}
          collapsed={true}
          title="AI 工具调用记录"
          showSummary={true}
        />
      )}

      {/* 输入区域 */}
      <div className="ai-chat-input-area">
        {isLoading && (
          <button className="ai-chat-cancel-btn" onClick={handleCancel}>
            取消
          </button>
        )}
        <textarea
          ref={inputRef}
          className="ai-chat-input"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={selectedText ? '基于选中内容提问...' : '输入问题或指令...'}
          disabled={isLoading}
          rows={1}
        />
        <button
          className="ai-chat-send-btn"
          onClick={handleSend}
          disabled={!inputValue.trim() || isLoading}
        >
          {isLoading ? (
            <span className="ai-chat-send-spinner" />
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="22" y1="2" x2="11" y2="13"/>
              <polygon points="22 2 15 22 11 13 2 9 22 2"/>
            </svg>
          )}
        </button>
      </div>

      {/* 权限确认对话框 */}
      <PermissionDialog
        visible={showPermissionDialog}
        request={permissionRequest}
        onApprove={handlePermissionApprove}
        onDeny={handlePermissionDeny}
        onClose={() => {
          setShowPermissionDialog(false);
          setPermissionRequest(null);
        }}
      />
    </div>
  );
});

export default AiChatPanel;
