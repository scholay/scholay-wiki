/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 * 
 * LaTeX 对话历史管理 Hook
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { useAuth } from '../../../utils/AuthContext';
import { userAPI } from '../../../services/api';

/**
 * LaTeX 对话历史管理 Hook
 * @param {number} documentId - 文档 ID
 * @returns {Object} 对话状态和操作方法
 */
export function useLatexConversation(documentId) {
  const { isAuthenticated, token } = useAuth();
  
  // 状态
  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  // eslint-disable-next-line no-unused-vars
  const [isInitialized, setIsInitialized] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState(null);
  
  // 分页
  const pageRef = useRef(1);
  const loadingRef = useRef(false);

  // 加载对话信息
  const loadConversation = useCallback(async () => {
    if (!documentId || !isAuthenticated) return null;
    
    try {
      const res = await userAPI.getDocumentConversation(documentId);
      if (res.data?.data) {
        setConversation(res.data.data);
        return res.data.data;
      }
      return null;
    } catch (err) {
      console.error('[useLatexConversation] Failed to load conversation:', err);
      setError(err.message);
      return null;
    }
  }, [documentId, isAuthenticated]);

  // 加载历史消息
  const loadHistory = useCallback(async (reset = false) => {
    if (!documentId || !isAuthenticated) return;
    if (loadingRef.current) return;
    
    // 如果是 reset，重置分页但不清空消息（等数据加载完再替换）
    if (reset) {
      pageRef.current = 1;
      setHasMore(true);
    }
    
    if (!hasMore && !reset) return;
    
    loadingRef.current = true;
    setIsLoading(true);
    setError(null);
    
    try {
      const res = await userAPI.getConversationHistory(documentId, pageRef.current, 20);
      const data = res.data?.data;
      
      if (data) {
        const newMessages = data.messages || [];
        
        if (reset) {
          // 直接替换消息，不先清空
          setMessages(newMessages);
        } else {
          // 追加旧消息到前面
          setMessages(prev => [...newMessages, ...prev]);
        }
        
        setHasMore(data.has_more || false);
        
        if (data.conversation) {
          setConversation(data.conversation);
        }
        
        pageRef.current += 1;
      }
    } catch (err) {
      console.error('[useLatexConversation] Failed to load history:', err);
      setError(err.message);
    } finally {
      setIsLoading(false);
      loadingRef.current = false;
    }
  }, [documentId, isAuthenticated, hasMore]);

  // 添加消息到本地状态
  const addMessage = useCallback((message) => {
    setMessages(prev => [...prev, message]);
  }, []);

  // 更新最后一条消息
  const updateLastMessage = useCallback((updater) => {
    setMessages(prev => {
      if (prev.length === 0) return prev;
      
      const updated = [...prev];
      const lastIndex = updated.length - 1;
      
      if (typeof updater === 'function') {
        updated[lastIndex] = updater(updated[lastIndex]);
      } else {
        updated[lastIndex] = { ...updated[lastIndex], ...updater };
      }
      
      return updated;
    });
  }, []);

  // 清空对话
  const clearConversation = useCallback(async () => {
    if (!documentId) return false;
    
    try {
      await userAPI.clearConversation(documentId);
      setMessages([]);
      setConversation(prev => prev ? { ...prev, message_count: 0, total_tokens: 0 } : null);
      pageRef.current = 1;
      setHasMore(false);
      return true;
    } catch (err) {
      console.error('[useLatexConversation] Failed to clear conversation:', err);
      setError(err.message);
      return false;
    }
  }, [documentId]);

  // 获取流式聊天 URL
  const getStreamChatUrl = useCallback(() => {
    if (!documentId) return null;
    return userAPI.getStreamChatWithContextUrl(documentId);
  }, [documentId]);

  // 文档 ID 变化时重置和加载
  useEffect(() => {
    if (!documentId || !isAuthenticated) {
      // 无效状态，清空
      setMessages([]);
      setConversation(null);
      setIsInitialized(false);
      return;
    }

    // 重置状态（但不清空消息，等加载完再替换）
    pageRef.current = 1;
    setHasMore(true);
    setError(null);
    setIsInitialized(false);
    loadingRef.current = false;

    // 加载对话和历史
    const init = async () => {
      try {
        setIsLoading(true);
        
        // 先加载对话信息
        const convRes = await userAPI.getDocumentConversation(documentId);
        if (convRes.data?.data) {
          setConversation(convRes.data.data);
        }
        
        // 再加载历史消息
        const historyRes = await userAPI.getConversationHistory(documentId, 1, 20);
        const data = historyRes.data?.data;
        
        if (data) {
          // 直接设置消息，不先清空
          setMessages(data.messages || []);
          setHasMore(data.has_more || false);
          pageRef.current = 2;
        } else {
          // 如果没有数据，清空消息
          setMessages([]);
        }
        
        setIsInitialized(true);
      } catch (err) {
        console.error('[useLatexConversation] Init failed:', err);
        setError(err.message);
        setMessages([]); // 出错时清空
      } finally {
        setIsLoading(false);
      }
    };

    init();
  }, [documentId, isAuthenticated]);

  return {
    // 状态
    conversation,
    messages,
    isLoading,
    hasMore,
    error,
    token,
    
    // 操作方法
    loadConversation,
    loadHistory,
    addMessage,
    updateLastMessage,
    clearConversation,
    getStreamChatUrl,
    
    // 重置
    reset: () => {
      setMessages([]);
      setConversation(null);
      pageRef.current = 1;
      setHasMore(true);
      setError(null);
      setIsInitialized(false);
    },
  };
}

export default useLatexConversation;
