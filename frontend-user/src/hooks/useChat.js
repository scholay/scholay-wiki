/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 * 
 * useChat - 聊天功能自定义 Hook
 * 封装聊天相关的状态和逻辑
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import api from '../services/client';
import logger from '../utils/logger';

/**
 * useChat Hook
 * @param {Object} options 配置选项
 * @param {boolean} options.isAuthenticated 是否已登录
 */
const useChat = ({ isAuthenticated }) => {
  // 会话状态
  const [conversations, setConversations] = useState([]);
  const [currentConversation, setCurrentConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  
  // 输入状态
  const [inputMessage, setInputMessage] = useState('');
  
  // 流式传输状态
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [isWaitingForResponse, setIsWaitingForResponse] = useState(false);
  
  // 模型状态
  const [modelLevel, setModelLevel] = useState('low');
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  
  // 配额状态
  const [quota, setQuota] = useState(null);
  const [usage, setUsage] = useState(null);
  
  // 消息操作状态
  const [hoveredMessage, setHoveredMessage] = useState(null);
  const [editingMessage, setEditingMessage] = useState(null);
  const [editContent, setEditContent] = useState('');
  
  // Refs
  const streamingContentRef = useRef('');
  const eventSourceRef = useRef(null);
  const messagesEndRef = useRef(null);

  // 滚动到底部
  const scrollToBottom = useCallback((behavior = 'smooth') => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior });
    }
  }, []);

  // 加载会话列表
  const loadConversations = useCallback(async () => {
    if (!isAuthenticated) return;
    
    try {
      const response = await api.get('/chat/conversations');
      if (response.data.code === 0) {
        setConversations(response.data.data || []);
      }
    } catch (error) {
      logger.error('Load conversations error:', error);
    }
  }, [isAuthenticated]);

  // 加载会话消息
  const loadMessages = useCallback(async (conversationId) => {
    if (!conversationId) return;
    
    setLoading(true);
    try {
      const response = await api.get(`/chat/conversations/${conversationId}/messages`);
      if (response.data.code === 0) {
        setMessages(response.data.data || []);
        setTimeout(() => scrollToBottom('auto'), 100);
      }
    } catch (error) {
      logger.error('Load messages error:', error);
    } finally {
      setLoading(false);
    }
  }, [scrollToBottom]);

  // 选择会话
  const selectConversation = useCallback(async (conversation) => {
    if (isStreaming) return;
    
    setCurrentConversation(conversation);
    setMessages([]);
    
    if (conversation) {
      await loadMessages(conversation.id);
    }
  }, [isStreaming, loadMessages]);

  // 新建会话
  const createNewConversation = useCallback(() => {
    if (isStreaming) return;
    
    setCurrentConversation(null);
    setMessages([]);
    setInputMessage('');
  }, [isStreaming]);

  // 删除会话
  const deleteConversation = useCallback(async (conversationId) => {
    try {
      const response = await api.delete(`/chat/conversations/${conversationId}`);
      if (response.data.code === 0) {
        setConversations(prev => prev.filter(c => c.id !== conversationId));
        if (currentConversation?.id === conversationId) {
          setCurrentConversation(null);
          setMessages([]);
        }
        return true;
      }
    } catch (error) {
      logger.error('Delete conversation error:', error);
    }
    return false;
  }, [currentConversation]);

  // 取消流式传输
  const cancelStreaming = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setIsStreaming(false);
    setIsWaitingForResponse(false);
  }, []);

  // 清理
  useEffect(() => {
    return () => {
      cancelStreaming();
    };
  }, [cancelStreaming]);

  // 加载会话列表
  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  return {
    // 会话状态
    conversations,
    setConversations,
    currentConversation,
    setCurrentConversation,
    messages,
    setMessages,
    loading,
    setLoading,
    
    // 输入状态
    inputMessage,
    setInputMessage,
    
    // 流式传输状态
    isStreaming,
    setIsStreaming,
    streamingContent,
    setStreamingContent,
    isWaitingForResponse,
    setIsWaitingForResponse,
    
    // 模型状态
    modelLevel,
    setModelLevel,
    showModelDropdown,
    setShowModelDropdown,
    
    // 配额状态
    quota,
    setQuota,
    usage,
    setUsage,
    
    // 消息操作状态
    hoveredMessage,
    setHoveredMessage,
    editingMessage,
    setEditingMessage,
    editContent,
    setEditContent,
    
    // Refs
    streamingContentRef,
    eventSourceRef,
    messagesEndRef,
    
    // 方法
    scrollToBottom,
    loadConversations,
    loadMessages,
    selectConversation,
    createNewConversation,
    deleteConversation,
    cancelStreaming,
  };
};

export default useChat;

