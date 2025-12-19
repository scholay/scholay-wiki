/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 * 
 * useConversation - 对话管理 Hook
 * 管理 AI 对话的创建、删除、重命名、加载等操作
 */

import { useState, useCallback, useRef } from 'react';
import { conversationAPI } from '../services/api';
import { organizeMessagesByParentId } from '../utils/messageUtils';

/**
 * 对话管理 Hook
 * @param {Object} options - 配置选项
 * @param {Function} options.onConversationChange - 对话变化回调
 * @param {Function} options.onError - 错误回调
 */
const useConversation = (options = {}) => {
  const { onConversationChange, onError } = options;

  const [conversations, setConversations] = useState([]);
  const [currentConversationId, setCurrentConversationId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [conversationsLoading, setConversationsLoading] = useState(false);
  
  // 分页状态
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: 20,
    total: 0,
    hasMore: false,
    isLoadingMore: false,
  });

  const prevScrollHeightRef = useRef(0);

  // 加载对话列表
  const fetchConversations = useCallback(async () => {
    setConversationsLoading(true);
    try {
      const response = await conversationAPI.getConversations();
      if (response.data.code === 0) {
        setConversations(response.data.data || []);
      }
    } catch (error) {
      console.error('Failed to fetch conversations:', error);
      onError?.('加载对话列表失败');
    } finally {
      setConversationsLoading(false);
    }
  }, [onError]);

  // 选择/加载对话
  const selectConversation = useCallback(async (conversationId, page = 1, pageSize = 20) => {
    const isInitialLoad = page === 1;

    if (isInitialLoad) {
      setLoading(true);
      setMessages([]);
    } else {
      setPagination(prev => ({ ...prev, isLoadingMore: true }));
    }

    try {
      const response = await conversationAPI.getConversation(conversationId, page, pageSize);
      if (response.data.code === 0 && response.data.data) {
        const conv = response.data.data;
        const organizedMessages = organizeMessagesByParentId(conv.messages || []);

        if (isInitialLoad) {
          setCurrentConversationId(conv.id);
          setMessages(organizedMessages);
        } else {
          setMessages(prev => [...organizedMessages, ...prev]);
        }

        setPagination({
          page: conv.page || page,
          pageSize: conv.pageSize || pageSize,
          total: conv.total || organizedMessages.length,
          hasMore: conv.hasMore || false,
          isLoadingMore: false,
        });

        onConversationChange?.(conv);
        return conv;
      }
    } catch (error) {
      console.error('Failed to load conversation:', error);
      onError?.('加载对话失败');
    } finally {
      setLoading(false);
      setPagination(prev => ({ ...prev, isLoadingMore: false }));
    }
    return null;
  }, [onConversationChange, onError]);

  // 加载更多消息
  const loadMoreMessages = useCallback(async () => {
    if (!currentConversationId || pagination.isLoadingMore || !pagination.hasMore) {
      return;
    }
    return selectConversation(currentConversationId, pagination.page + 1, pagination.pageSize);
  }, [currentConversationId, pagination, selectConversation]);

  // 创建新对话
  const createConversation = useCallback(() => {
    setCurrentConversationId(null);
    setMessages([]);
    setPagination({
      page: 1,
      pageSize: 20,
      total: 0,
      hasMore: false,
      isLoadingMore: false,
    });
  }, []);

  // 删除对话
  const deleteConversation = useCallback(async (conversationId) => {
    try {
      await conversationAPI.deleteConversation(conversationId);
      setConversations(prev => prev.filter(c => c.id !== conversationId));
      
      if (currentConversationId === conversationId) {
        createConversation();
      }
      return true;
    } catch (error) {
      console.error('Failed to delete conversation:', error);
      onError?.('删除对话失败');
      return false;
    }
  }, [currentConversationId, createConversation, onError]);

  // 重命名对话
  const renameConversation = useCallback(async (conversationId, newTitle) => {
    try {
      await conversationAPI.renameConversation(conversationId, newTitle);
      setConversations(prev => 
        prev.map(c => c.id === conversationId ? { ...c, title: newTitle } : c)
      );
      return true;
    } catch (error) {
      console.error('Failed to rename conversation:', error);
      onError?.('重命名对话失败');
      return false;
    }
  }, [onError]);

  // 添加消息
  const addMessage = useCallback((message) => {
    setMessages(prev => [...prev, message]);
  }, []);

  // 更新消息
  const updateMessage = useCallback((messageId, updates) => {
    setMessages(prev => 
      prev.map(msg => 
        msg.message_id === messageId || msg.id === messageId
          ? { ...msg, ...updates }
          : msg
      )
    );
  }, []);

  // 更新最后一条消息
  const updateLastMessage = useCallback((updates) => {
    setMessages(prev => {
      if (prev.length === 0) return prev;
      const newMessages = [...prev];
      newMessages[newMessages.length - 1] = {
        ...newMessages[newMessages.length - 1],
        ...updates,
      };
      return newMessages;
    });
  }, []);

  return {
    // 状态
    conversations,
    currentConversationId,
    messages,
    loading,
    conversationsLoading,
    pagination,
    prevScrollHeightRef,
    
    // 方法
    fetchConversations,
    selectConversation,
    loadMoreMessages,
    createConversation,
    deleteConversation,
    renameConversation,
    addMessage,
    updateMessage,
    updateLastMessage,
    setCurrentConversationId,
    setMessages,
    setConversations,
  };
};

export default useConversation;

