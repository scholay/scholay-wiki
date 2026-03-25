/**
 * 对话相关状态管理 Hook
 * 从 useAISearch.js 拆分
 */
import { useState, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { conversationApi as conversationAPI } from 'features/ai-chat/api/conversationApi';
import { setAIConversationId } from '../../../utils/searchStorage';
import logger from '../../../utils/logger';

export const useConversationState = (eventSourceRef) => {
  const [searchParams, setSearchParams] = useSearchParams();

  // 对话列表
  const [conversations, setConversations] = useState([]);
  const [conversationsLoading, setConversationsLoading] = useState(false);

  // 当前对话
  const [currentConversationId, setCurrentConversationId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [messagePagination, setMessagePagination] = useState({
    page: 1,
    pageSize: 20,
    total: 0,
    hasMore: false,
    isLoadingMore: false,
  });

  // 计算属性：QA列表
  const qaList = useMemo(() => {
    const list = [];
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      if (msg.role === 'user') {
        const assistantMsg = messages[i + 1];
        list.push({
          messageId: msg.message_id || msg.id, // 优先使用 message_id (UUID)
          question: msg.content,
          answer: assistantMsg?.content || '',
          assistantMsgId: assistantMsg?.message_id || assistantMsg?.id,
          suggestedQuestions: assistantMsg?.suggestedQuestions,
        });
      }
    }
    return list;
  }, [messages]);

  // 计算属性：当前对话标题
  const currentConversationTitle = useMemo(() => {
    if (!currentConversationId || !conversations.length) return '';
    const conv = conversations.find(c => c.id === currentConversationId);
    return conv?.title || '';
  }, [currentConversationId, conversations]);

  // 辅助函数
  const organizeMessagesByParentId = useCallback((messageList) => {
    if (!messageList || messageList.length === 0) return [];
    const organized = [];
    const userMessages = messageList.filter(m => m.role === 'user');
    const assistantMessages = messageList.filter(m => m.role === 'assistant');

    userMessages.forEach(userMsg => {
      organized.push(userMsg);
      // 使用 message_id (UUID) 来匹配 parent_message_id，而不是 id (数据库自增ID)
      const assistantReply = assistantMessages.find(
        m => m.parent_message_id === userMsg.message_id
      );
      if (assistantReply) {
        organized.push(assistantReply);
      }
    });

    return organized;
  }, []);

  const extractSuggestedQuestions = useCallback((content) => {
    const regex = /\[FOLLOW_UP_QUESTIONS\]([\s\S]*?)\[\/FOLLOW_UP_QUESTIONS\]/;
    const match = content.match(regex);

    if (match && match[1]) {
      const questionsText = match[1].trim();
      const questions = questionsText
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.match(/^\d+\.\s+/))
        .map(line => line.replace(/^\d+\.\s+/, ''));

      return questions;
    }

    return [];
  }, []);

  // 加载对话列表
  const loadConversations = useCallback(async () => {
    setConversationsLoading(true);
    try {
      const response = await conversationAPI.getConversations(1, 50, 'search');
      if (response.data.code === 0 && response.data.data) {
        setConversations(response.data.data.conversations || []);
      }
    } catch (error) {
      logger.error('Failed to load search conversations:', error);
    } finally {
      setConversationsLoading(false);
    }
  }, []);

  // 新建对话
  const handleNewConversation = useCallback(() => {
    if (eventSourceRef?.current) {
      eventSourceRef.current.close();
    }
    setCurrentConversationId(null);
    setAIConversationId(null);
    setMessages([]);
    setSearchParams(prev => {
      const newParams = new URLSearchParams(prev);
      newParams.delete('conversationId');
      return newParams;
    });
    return { shouldClearPapers: true };
  }, [eventSourceRef, setSearchParams]);

  // 删除对话
  const handleDeleteConversation = useCallback(async (conversationId) => {
    try {
      await conversationAPI.deleteConversation(conversationId);
      setConversations(prev => prev.filter(c => c.id !== conversationId));
      if (currentConversationId === conversationId) {
        handleNewConversation();
      }
    } catch (error) {
      logger.error('Failed to delete conversation:', error);
      alert('删除失败');
    }
  }, [currentConversationId, handleNewConversation]);

  return {
    // 状态
    conversations,
    conversationsLoading,
    currentConversationId,
    messages,
    messagePagination,
    qaList,
    currentConversationTitle,
    searchParams,

    // Setter
    setConversations,
    setCurrentConversationId,
    setMessages,
    setMessagePagination,
    setSearchParams,

    // 方法
    organizeMessagesByParentId,
    extractSuggestedQuestions,
    loadConversations,
    handleNewConversation,
    handleDeleteConversation,
  };
};

export default useConversationState;
