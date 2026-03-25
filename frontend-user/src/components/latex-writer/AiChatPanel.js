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
import { parseAiMessage, calculateCodeDiff } from './ai/MessageParser';
import { useLatexConversation } from './hooks/useLatexConversation';
import PermissionDialog from './PermissionDialog';
import ToolCallDisplay from './ToolCallDisplay';
import { userAPI } from '../../services/api';
import { trackScholayPrism } from '../../utils/usageTracker';
import CollapsedView from './ai-chat/CollapsedView';
import ChatHeader from './ai-chat/ChatHeader';
import ChatInput from './ai-chat/ChatInput';
import MessageList from './ai-chat/MessageList';
import './AiChatPanel.css';

const AiChatPanel = forwardRef(function AiChatPanel({ 
  documentId, 
  selectedText, 
  fullContent, 
  onApplySuggestion, 
  cursorPosition,
  pendingMessage,
  onPendingMessageSent,
  isCollapsed = false,
  onToggleCollapse,
}, ref) {
  const { isAuthenticated } = useAuth();
  
  const {
    messages: historyMessages,
    clearConversation,
    getStreamChatUrl,
  } = useLatexConversation(documentId);
  
  const [localMessages, setLocalMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [availableModels, setAvailableModels] = useState([]);
  const [selectedModelId, setSelectedModelId] = useState(null);
  const [showModelMenu, setShowModelMenu] = useState(false);
  const [showCommandMenu, setShowCommandMenu] = useState(false);
  const [currentResponse, setCurrentResponse] = useState('');
  const [modelsLoading, setModelsLoading] = useState(true);
  
  const [toolCalls, setToolCalls] = useState([]);
  const [currentToolCall, setCurrentToolCall] = useState(null);
  const [permissionRequest, setPermissionRequest] = useState(null);
  const [showPermissionDialog, setShowPermissionDialog] = useState(false);
  
  const [thinkingStartTime, setThinkingStartTime] = useState(null);
  const [thinkingDuration, setThinkingDuration] = useState(0);
  
  const prevDocumentIdRef = useRef(documentId);
  useEffect(() => {
    if (documentId !== prevDocumentIdRef.current) {
      setLocalMessages([]);
      setCurrentResponse('');
      setToolCalls([]);
      setCurrentToolCall(null);
      prevDocumentIdRef.current = documentId;
    }
  }, [documentId]);

  const messages = useMemo(() => {
    if (localMessages.length > 0) return localMessages;
    
    if (documentId && historyMessages.length > 0) {
      return historyMessages.map(msg => {
        const thinkContent = msg.think_content || null;
        const replyContent = msg.reply_content || null;
        const codeContent = msg.code_content || null;
        const hasStructured = !!(thinkContent || replyContent || codeContent);
        const msgThinkingDuration = msg.thinking_duration || 0;
        const msgCodeStats = msg.code_stats || null;
        
        return {
          role: msg.role,
          content: msg.content || '',
          thinkContent,
          replyContent,
          codeContent,
          thinkingDuration: msgThinkingDuration,
          codeStats: msgCodeStats,
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
  
  const extractLatexCode = useCallback((content) => {
    if (!content) return null;
    const latexMatch = content.match(/```(?:latex|tex)?\n?([\s\S]*?)```/);
    if (latexMatch) return latexMatch[1].trim();
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
  
  const inputRef = useRef(null);
  const agentRef = useRef(null);
  const selectedTextRef = useRef(selectedText);
  
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
          const defaultModel = models.find(m => m.is_default) || models[0];
          if (defaultModel) setSelectedModelId(defaultModel.id);
        }
      } catch (error) {
        console.error('Failed to load models:', error);
        setAvailableModels([{ id: 0, display_name: '默认模型', description: '使用服务器默认配置' }]);
        setSelectedModelId(0);
      } finally {
        setModelsLoading(false);
      }
    };

    if (isAuthenticated) loadModels();
  }, [isAuthenticated]);
  
  const extractLatexCodeFn = (content) => {
    if (!content) return null;
    const latexMatch = content.match(/```(?:latex|tex)?\n?([\s\S]*?)```/);
    if (latexMatch) return latexMatch[1].trim();
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
        setLocalMessages(prev => {
          const updated = [...prev];
          const lastIndex = updated.length - 1;
          if (updated[lastIndex]?.role === 'assistant') {
            updated[lastIndex] = { ...updated[lastIndex], content: text, isStreaming: false };
          }
          return updated;
        });
      }
    });

    agent.on('onComplete', (fullText) => {
      setIsLoading(false);
      setCurrentResponse('');
      
      const duration = thinkingStartTime ? Math.round((Date.now() - thinkingStartTime) / 1000) : 0;
      setThinkingDuration(duration);
      setThinkingStartTime(null);
      
      const parsed = parseAiMessage(fullText);
      const extractedCode = parsed.code || extractLatexCodeFn(fullText);
      
      let codeStats = null;
      if (extractedCode && fullContent) {
        codeStats = calculateCodeDiff(fullContent, extractedCode);
      }
      
      if (extractedCode && onApplySuggestion) {
        onApplySuggestion(extractedCode);
      }
      
      setLocalMessages(prev => {
        const updated = [...prev];
        const lastIndex = updated.length - 1;
        if (updated[lastIndex]?.role === 'assistant') {
          updated[lastIndex] = {
            ...updated[lastIndex],
            content: fullText,
            isStreaming: false,
            parsed: parsed,
            thinkContent: parsed.think,
            replyContent: parsed.reply,
            codeContent: parsed.code,
            thinkingDuration: duration,
            codeStats: codeStats,
            hasDiff: false,
          };
        }
        return updated;
      });
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

    return () => { agent.destroy(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentId]);

  useEffect(() => {
    if (agentRef.current) {
      agentRef.current.updateConfig({ defaultModelId: selectedModelId });
    }
  }, [selectedModelId]);

  const quickCommands = useMemo(() => LatexCommands.getQuickCommands(), []);

  const getExtraContent = useCallback((fullText, parsed) => {
    if (!fullText) return null;
    
    let extra = fullText;
    extra = extra.replace(/<think>[\s\S]*?<\/think>/gi, '');
    extra = extra.replace(/<reply>[\s\S]*?<\/reply>/gi, '');
    extra = extra.replace(/<code>[\s\S]*?<\/code>/gi, '');
    
    if (parsed.currentSection === 'think' && parsed.thinkText) {
      const thinkIdx = extra.indexOf('<think>');
      if (thinkIdx !== -1) extra = extra.substring(0, thinkIdx);
    }
    if (parsed.currentSection === 'reply' && parsed.replyText) {
      const replyIdx = extra.indexOf('<reply>');
      if (replyIdx !== -1) extra = extra.substring(0, replyIdx);
    }
    if (parsed.currentSection === 'code' && parsed.codeText) {
      const codeIdx = extra.indexOf('<code>');
      if (codeIdx !== -1) extra = extra.substring(0, codeIdx);
    }
    
    extra = extra.trim();
    
    if (extra && (
      extra.includes('---') || extra.includes('🔧') || extra.includes('✅') ||
      extra.includes('⚠️') || extra.includes('🔍') || extra.length > 10
    )) {
      return extra;
    }
    
    return null;
  }, []);

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

    const userMessage = {
      role: 'user',
      content: prompt,
      context: selectedText ? `[选中内容]\n${selectedText}` : null
    };
    setLocalMessages(prev => [...prev, userMessage]);
    
    setLocalMessages(prev => [...prev, {
      role: 'assistant',
      content: '',
      isStreaming: true
    }]);

    await agentRef.current?.chatWithContext(selectedText, prompt, {
      fullContent,
      modelId: selectedModelId,
    });
  }, [isLoading, isAuthenticated, selectedText, fullContent, selectedModelId]);

  useImperativeHandle(ref, () => ({ sendMessage }), [sendMessage]);

  useEffect(() => {
    if (pendingMessage && !isLoading) {
      sendMessage(pendingMessage);
      onPendingMessageSent?.();
    }
  }, [pendingMessage, isLoading, sendMessage, onPendingMessageSent]);

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

    trackScholayPrism(documentId);

    const userMessage = {
      role: 'user',
      content: prompt,
      context: selectedText ? `[选中内容]\n${selectedText}` : null
    };
    setLocalMessages(prev => [...prev, userMessage]);
    
    setLocalMessages(prev => [...prev, {
      role: 'assistant',
      content: '',
      isStreaming: true
    }]);

    await agentRef.current.chatWithContext(selectedText, prompt, {
      fullContent,
      modelId: selectedModelId,
    });
  }, [inputValue, isLoading, isAuthenticated, selectedText, fullContent, selectedModelId, documentId]);

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

    setLocalMessages(prev => [...prev, {
      role: 'user',
      content: `执行命令: ${command.name}`,
      context: selectedText ? `[选中内容]\n${selectedText}` : null
    }]);
    
    setLocalMessages(prev => [...prev, {
      role: 'assistant',
      content: '',
      isStreaming: true
    }]);

    setShowCommandMenu(false);

    await agentRef.current.executeCommand(command.id, selectedText, {
      fullContent,
      modelId: selectedModelId,
    });
  }, [isLoading, isAuthenticated, selectedText, fullContent, selectedModelId]);

  const handleCancel = useCallback(() => {
    if (agentRef.current) agentRef.current.stop();
    setIsLoading(false);
  }, []);

  const handleClear = useCallback(async () => {
    if (isLoading) handleCancel();
    if (documentId && clearConversation) await clearConversation();
    setLocalMessages([]);
    setToolCalls([]);
    setCurrentToolCall(null);
  }, [isLoading, handleCancel, documentId, clearConversation]);

  const handlePermissionApprove = useCallback(async (response) => {
    setShowPermissionDialog(false);
    setPermissionRequest(null);
    if (agentRef.current && agentRef.current.respondToPermissionRequest) {
      agentRef.current.respondToPermissionRequest({
        requestId: response.requestId,
        approved: true,
        scope: response.scope
      });
    }
  }, []);

  const handlePermissionDeny = useCallback(async (response) => {
    setShowPermissionDialog(false);
    setPermissionRequest(null);
    if (agentRef.current && agentRef.current.respondToPermissionRequest) {
      agentRef.current.respondToPermissionRequest({
        requestId: response.requestId,
        approved: false
      });
    }
  }, []);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  if (isCollapsed) {
    return <CollapsedView onToggleCollapse={onToggleCollapse} />;
  }

  return (
    <div className="ai-chat-panel">
      <ChatHeader
        onToggleCollapse={onToggleCollapse}
        showCommandMenu={showCommandMenu}
        setShowCommandMenu={setShowCommandMenu}
        showModelMenu={showModelMenu}
        setShowModelMenu={setShowModelMenu}
        isLoading={isLoading}
        modelsLoading={modelsLoading}
        availableModels={availableModels}
        selectedModelId={selectedModelId}
        setSelectedModelId={setSelectedModelId}
        quickCommands={quickCommands}
        selectedText={selectedText}
        onQuickCommand={handleQuickCommand}
        onClear={handleClear}
      />

      <MessageList
        messages={messages}
        currentResponse={currentResponse}
        currentToolCall={currentToolCall}
        thinkingDuration={thinkingDuration}
        fullContent={fullContent}
        onApplySuggestion={onApplySuggestion}
        extractLatexCode={extractLatexCode}
        setLocalMessages={setLocalMessages}
        getExtraContent={getExtraContent}
        isLoading={isLoading}
        selectedText={selectedText}
        quickCommands={quickCommands}
        onQuickCommand={handleQuickCommand}
      />

      {toolCalls.length > 0 && !isLoading && (
        <ToolCallDisplay 
          toolCalls={toolCalls}
          collapsed={true}
          title="AI 工具调用记录"
          showSummary={true}
        />
      )}

      <ChatInput
        inputRef={inputRef}
        inputValue={inputValue}
        setInputValue={setInputValue}
        isLoading={isLoading}
        selectedText={selectedText}
        onSend={handleSend}
        onCancel={handleCancel}
        onKeyDown={handleKeyDown}
      />

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
