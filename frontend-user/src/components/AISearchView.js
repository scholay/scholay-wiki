/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 * 
 * AISearchView - 智能分析视图组件
 * 嵌入到 SearchResultsPage 中，通过 mode=ai 参数激活
 */

import React, { useState, useEffect, useRef, lazy, Suspense, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
// ScrollToBottom 已被 scroll-snap 替代
import { useAuth } from '../utils/AuthContext';
import logger from '../utils/logger';
import AIPaperList from './AIPaperList';
import PaperCitationMarkdown from './PaperCitationMarkdown';
import AIHistoryDropdown from './AIHistoryDropdown';
import './QACard.css'; // 对话区域样式
import api, { conversationAPI, subscriptionAPI, publicScholarAPI } from '../services/api';
import { trackSmartAnalysis, EntryPoint } from '../utils/usageTracker';
import { getSearchQuery, getAIModelLevel, getAIConversationId, setAIConversationId } from '../utils/searchStorage';
import '../pages/styles/advanced-search/index.css';

// 懒加载 AuthModal
const AuthModal = lazy(() => import('./AuthModal'));

// 辅助函数：根据parent_message_id组织消息，确保问答对正确匹配
// 对于有parent_message_id的新消息，使用严格的父子关系
// 对于没有parent_message_id的旧消息，回退到时间顺序
const organizeMessagesByParentId = (messages) => {
  if (!messages || messages.length === 0) return [];
  
  // 检查是否有消息包含parent_message_id
  const hasParentIds = messages.some(m => m.parent_message_id);
  
  // 如果没有parent_message_id，使用原始顺序（向后兼容旧数据）
  if (!hasParentIds) {
    return messages;
  }
  
  // 构建消息映射
  const messageMap = {};
  messages.forEach(msg => {
    messageMap[msg.message_id] = msg;
  });
  
  // 找到所有根消息（用户消息且没有parent_message_id的）
  const rootMessages = messages.filter(m => m.role === 'user' && !m.parent_message_id);
  
  // 构建有序的消息列表
  const organized = [];
  const processedIds = new Set();
  
  // 对每个根消息，递归添加其子消息
  const addMessageAndChildren = (msg) => {
    if (processedIds.has(msg.id)) return;
    
    organized.push(msg);
    processedIds.add(msg.id);
    
    // 查找以当前消息为parent的子消息
    const children = messages.filter(m => 
      m.parent_message_id === msg.message_id && !processedIds.has(m.id)
    );
    
    // 按时间排序子消息
    children.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    
    children.forEach(child => {
      addMessageAndChildren(child);
    });
  };
  
  // 按时间排序根消息
  rootMessages.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  
  // 处理所有根消息
  rootMessages.forEach(rootMsg => {
    addMessageAndChildren(rootMsg);
  });
  
  // 添加任何未被处理的消息（孤儿消息，可能是数据不一致）
  messages.forEach(msg => {
    if (!processedIds.has(msg.id)) {
      organized.push(msg);
    }
  });
  
  return organized;
};

/**
 * AISearchView 组件
 * @param {Object} props
 * @param {string} props.initialQuery - 初始搜索查询（从 sessionStorage 或 props 传入）
 * @param {string} props.initialModelLevel - 初始模型级别
 * @param {Function} props.onSwitchToNormal - 切换到普通搜索模式的回调
 */
const AISearchView = ({ initialQuery = '', initialModelLevel = 'low', onSwitchToNormal }) => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { isAuthenticated, user, loading: authLoading } = useAuth();

  // Conversation state
  // 优先从 URL 获取 conversationId，其次从 sessionStorage
  const [currentConversationId, setCurrentConversationId] = useState(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const urlConvId = urlParams.get('conversationId');
    if (urlConvId) {
      return parseInt(urlConvId);
    }
    return getAIConversationId();
  });
  const [conversations, setConversations] = useState([]);
  const [conversationsLoading, setConversationsLoading] = useState(false);
  const [messages, setMessages] = useState([]);
  const [searchQuery, setSearchQuery] = useState(() => initialQuery || getSearchQuery());
  const [loading, setLoading] = useState(false);
  const [modelLevel, setModelLevel] = useState(() => initialModelLevel || getAIModelLevel() || 'low'); // 'low', 'mid', 'high' - 当前对话使用的模型级别，默认普通模型
  const [quota, setQuota] = useState(null); // 用户配额信息
  const [usage, setUsage] = useState(null); // 用户使用情况
  const [papers, setPapers] = useState([]);
  const [papersTotal, setPapersTotal] = useState(0);
  // 配额检查已废弃，现在使用货币系统进行扣费控制
  const [showAuthModal, setShowAuthModal] = useState(false); // 登录弹窗
  const [paperSets, setPaperSets] = useState([]); // 多个论文集合，用于 Tab 切换
  const [activeTab, setActiveTab] = useState(0); // 当前激活的 tab
  const [streamingContent, setStreamingContent] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [showAIThinking, setShowAIThinking] = useState(false); // AI 思考中状态
  const [expandedQAIndex, setExpandedQAIndex] = useState(null); // 当前展开的问答卡片索引
  const [highlightedPaperIndex, setHighlightedPaperIndex] = useState(null); // 高亮的论文索引
  const [scrollToPaperIndex, setScrollToPaperIndex] = useState(null); // 需要滚动到的论文索引
  const [isComposing, setIsComposing] = useState(false); // 跟踪输入法状态
  const [isLoadingSuggestedQuestions, setIsLoadingSuggestedQuestions] = useState(false); // 推荐问题加载状态
  const [manualTabSwitch, setManualTabSwitch] = useState(false); // 是否手动切换了 tab（点击引文）
  
  // 论文展示相关状态 - 由 AIPaperList 组件内部管理

  const eventSourceRef = useRef(null);
  const textareaRef = useRef(null);
  const streamingContentRef = useRef('');
  const isLoadingHistoryRef = useRef(false); // 标记是否正在加载历史对话
  const papersContainerRef = useRef(null); // 论文列表容器
  const qaSnapContainerRef = useRef(null); // 问答滚动容器

  // 论文详情字段 - 和学术检索保持一致
  const PAPER_FIELDS = ['paperId', 'title', 'abstract', 'authors', 'year', 'citationCount', 'url', 'venue', 'publicationDate', 'openAccessPdf', 'fieldsOfStudy', 'isOpenAccess', 'referenceCount', 'influentialCitationCount', 'tldr', 'journal', 'externalIds'];

  // 将 messages 转换为问答对列表
  const qaList = useMemo(() => {
    const list = [];
    let currentQA = null;
    
    messages.forEach((msg, index) => {
      if (msg.role === 'user') {
        // 开始新的问答对
        if (currentQA) {
          list.push(currentQA);
        }
        currentQA = {
          question: msg.content,
          answer: '',
          suggestedQuestions: undefined,
          messageId: msg.id || msg.message_id,
          userMsgIndex: index,
        };
      } else if (msg.role === 'assistant' && currentQA) {
        // 添加回答到当前问答对
        currentQA.answer = msg.content;
        currentQA.suggestedQuestions = msg.suggestedQuestions;
        currentQA.assistantMsgIndex = index;
        currentQA.assistantMsgId = msg.id || msg.message_id;
      }
    });
    
    // 添加最后一个问答对
    if (currentQA) {
      list.push(currentQA);
    }
    
    return list;
  }, [messages]);

  // 计算每个问答对对应的论文数量
  const getQAPaperCount = (qaIndex) => {
    if (!paperSets || paperSets.length === 0) return 0;
    // paperSets 是倒序的（最新在索引0），qaList 是正序的（最老在索引0）
    const paperSetIndex = paperSets.length - 1 - qaIndex;
    if (paperSetIndex >= 0 && paperSetIndex < paperSets.length) {
      const paperSet = paperSets[paperSetIndex];
      return paperSet?.papers?.length || 0;
    }
    return 0;
  };

  // 处理问答切换 - 同时切换论文列表
  const handleQAToggle = (qaIndex) => {
    if (expandedQAIndex === qaIndex) {
      // 点击已展开的问答，不做任何操作
      return;
    }
    setExpandedQAIndex(qaIndex);
    
    // 同步切换左侧论文列表
    // paperSets 是倒序的（最新在索引0），qaIndex 是正序的（最老在索引0）
    const paperSetIndex = paperSets.length - 1 - qaIndex;
    if (paperSetIndex >= 0 && paperSetIndex < paperSets.length) {
      setActiveTab(paperSetIndex);
      // 同步更新论文显示
      const paperSet = paperSets[paperSetIndex];
      if (paperSet?.papers) {
        setPapers(paperSet.papers);
        setPapersTotal(paperSet.total || paperSet.papers.length);
      }
    }
    setManualTabSwitch(true); // 标记为手动切换
  };

  // 移除自动跳转逻辑，允许未登录用户访问页面

  // 加载对话历史
  useEffect(() => {
    if (isAuthenticated) {
      loadConversations();
    }
  }, [isAuthenticated]);

  // 当创建新对话时刷新对话列表
  useEffect(() => {
    if (currentConversationId && isAuthenticated) {
      loadConversations();
    }
  }, [currentConversationId]);

  // 获取配额和使用情况
  useEffect(() => {
    const fetchQuotaAndUsage = async () => {
      try {
        const response = await subscriptionAPI.getUsage();

        if (response.data.code === 0) {
          const data = response.data.data;
          // 后端返回的数据包含 usage 和 limits
          // 将 limits 映射为 quota 格式
          const quotaData = {
            advancedSearchLowQuota: data.limits?.advanced_search_low?.limit ?? -1,
            advancedSearchMidQuota: data.limits?.advanced_search_mid?.limit ?? -1,
            advancedSearchHighQuota: data.limits?.advanced_search_high?.limit ?? -1,
          };

          // 将 usage 映射为前端格式
          const usageData = {
            advancedSearchLowCount: data.usage?.advanced_search_low ?? 0,
            advancedSearchMidCount: data.usage?.advanced_search_mid ?? 0,
            advancedSearchHighCount: data.usage?.advanced_search_high ?? 0,
          };

          setQuota(quotaData);
          setUsage(usageData);
        }
      } catch (error) {
        console.error('Failed to fetch quota/usage:', error);
      }
    };

    if (isAuthenticated && user) {
      fetchQuotaAndUsage();
    }
  }, [isAuthenticated, user]);

  const loadConversations = async () => {
    setConversationsLoading(true);
    try {
      const response = await conversationAPI.getConversations(1, 50, 'search');
      if (response.data.code === 0 && response.data.data) {
        setConversations(response.data.data.conversations || []);
      }
    } catch (error) {
      console.error('Failed to load search conversations:', error);
    } finally {
      setConversationsLoading(false);
    }
  };

  // 获取当前模型的剩余次数
  const getRemainingCount = () => {
    if (!quota || !usage) return null;

    // 映射配额和使用情况字段
    const quotaFieldMap = {
      'low': 'advancedSearchLowQuota',
      'mid': 'advancedSearchMidQuota',
      'high': 'advancedSearchHighQuota'
    };

    const usageFieldMap = {
      'low': 'advancedSearchLowCount',
      'mid': 'advancedSearchMidCount',
      'high': 'advancedSearchHighCount'
    };

    const quotaField = quotaFieldMap[modelLevel];
    const usageField = usageFieldMap[modelLevel];

    const quotaValue = quota[quotaField];
    const usageValue = usage[usageField] || 0;

    // -1 表示无限制
    if (quotaValue === -1) return null; // 无限制时不显示提示

    const remaining = Math.max(0, quotaValue - usageValue);
    return remaining;
  };

  // 从 sessionStorage 或 URL 参数读取对话ID或初始查询（仅执行一次）
  useEffect(() => {
    const urlConversationId = searchParams.get('conversationId');
    const storedQuery = getSearchQuery();
    const storedModelLevel = getAIModelLevel();

    // 如果有存储的模型级别，设置模型级别
    if (storedModelLevel && ['low', 'mid', 'high'].includes(storedModelLevel)) {
      setModelLevel(storedModelLevel);
    }

    // 如果 URL 有 conversationId 且已登录且对话列表已加载
    if (urlConversationId && isAuthenticated && conversations.length > 0) {
      // 检查这个对话是否存在
      const conversation = conversations.find(c => c.id === parseInt(urlConversationId));
      if (conversation) {
        // 如果当前没有加载这个对话的消息，则加载
        if (messages.length === 0 || currentConversationId !== parseInt(urlConversationId)) {
          handleSelectConversation(urlConversationId);
        }
      } else {
        // 对话不存在，重定向到首页
        console.log(`Conversation ${urlConversationId} not found, redirecting to home`);
        navigate('/');
      }
    } else if (storedQuery && isAuthenticated && messages.length === 0 && !urlConversationId && !currentConversationId) {
      // 有存储的查询且没有对话ID，执行搜索（从首页跳转过来的情况）
      setSearchQuery(storedQuery);
      setLoading(true); // 显示 loading 状态
      setTimeout(() => {
        handleInitialSearch(storedQuery);
      }, 100);
    } else if (!urlConversationId && !storedQuery && isAuthenticated && !authLoading) {
      // 没有 conversationId 也没有存储的查询，重定向到首页
      console.log('No conversationId and no stored query, redirecting to home');
      navigate('/');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, conversations, authLoading]);

  // 当对话ID变化时，更新 sessionStorage 和 URL 参数
  useEffect(() => {
    if (currentConversationId) {
      setAIConversationId(currentConversationId);
      const currentUrl = new URLSearchParams(window.location.search);
      const urlConvId = currentUrl.get('conversationId');
      if (urlConvId !== String(currentConversationId)) {
        setSearchParams(prev => {
          const newParams = new URLSearchParams(prev);
          newParams.set('conversationId', String(currentConversationId));
          return newParams;
        });
      }
    } else {
      setAIConversationId(null);
      const currentUrl = new URLSearchParams(window.location.search);
      if (currentUrl.get('conversationId')) {
        setSearchParams(prev => {
          const newParams = new URLSearchParams(prev);
          newParams.delete('conversationId');
          return newParams;
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentConversationId]);

  // 获取延伸问题（通过独立 API）
  const fetchFollowUpQuestions = async (conversationId, messageId, message, showLoading = true) => {
    try {
      logger.log(`Fetching follow-up questions for message ${messageId}`);
      // 只有在需要显示 loading 时才设置状态（通常只有最新消息才显示）
      if (showLoading) {
        setIsLoadingSuggestedQuestions(true);
      }
      const response = await conversationAPI.getFollowUpQuestions(conversationId, messageId);

      if (response.data.code === 0 && response.data.data.questions) {
        const questionsText = response.data.data.questions;
        const questions = extractSuggestedQuestions(questionsText);

        if (questions.length > 0) {
          // 更新消息的延伸问题
          setMessages(prev => prev.map(msg =>
            msg.id === messageId
              ? { ...msg, suggestedQuestions: questions }
              : msg
          ));

          logger.log(`Loaded ${questions.length} follow-up questions`);
          // react-scroll-to-bottom 会自动处理滚动
        }
      }
    } catch (error) {
      // 延伸问题加载失败不影响主流程，只记录日志
      console.error('Failed to load follow-up questions:', error);
      logger.log('Failed to load follow-up questions, but search completed successfully');
    } finally {
      if (showLoading) {
        setIsLoadingSuggestedQuestions(false);
      }
    }
  };

  // 解析 AI 回复中的推荐问题
  const extractSuggestedQuestions = (content) => {
    const regex = /\[FOLLOW_UP_QUESTIONS\]([\s\S]*?)\[\/FOLLOW_UP_QUESTIONS\]/;
    const match = content.match(regex);

    if (match && match[1]) {
      // 提取问题列表
      const questionsText = match[1].trim();
      const questions = questionsText
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.match(/^\d+\.\s+/)) // 匹配 "1. " 格式
        .map(line => line.replace(/^\d+\.\s+/, '')); // 移除序号

      return questions;
    }

    return [];
  };

  // 处理延伸问题点击 - 直接触发新搜索
  const handleFollowUpQuestionClick = async (question) => {
    // 检查是否已登录
    if (!isAuthenticated) {
      alert('请先登录');
      return;
    }

    // 检查是否正在加载
    if (loading || isStreaming) {
      return;
    }

    // react-scroll-to-bottom 会自动处理滚动

    // 使用现有的 handleInitialSearch 函数触发新搜索
    // 这会自动处理配额检查、创建消息、启动流式搜索等所有逻辑
    await handleInitialSearch(question);
  };

  // react-scroll-to-bottom 自动处理滚动，不需要手动控制

  // 当消息列表变化时，自动展开最新的问答卡片并滚动到最新
  useEffect(() => {
    // 计算问答对数量
    const qaCount = Math.ceil(messages.filter(m => m.role === 'user').length);
    if (qaCount > 0) {
      // 自动展开最新的问答卡片
      setExpandedQAIndex(qaCount - 1);
      
      // 滚动到最新的问答 section
      setTimeout(() => {
        if (qaSnapContainerRef.current) {
          const sections = qaSnapContainerRef.current.querySelectorAll('.qa-section');
          const lastSection = sections[sections.length - 1];
          if (lastSection) {
            lastSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        }
      }, 100);
    }
  }, [messages.length]);

  // 当消息列表变化时，仅在特定情况下更新索引
  useEffect(() => {
    // 如果正在加载历史对话，不自动更新
    if (isLoadingHistoryRef.current) return;
    
    // 问答卡片的展开状态会在 messages.length 变化时自动更新
  }, [messages.length]);

  // 当展开的卡片变化时，自动切换论文 tab
  useEffect(() => {
    if (expandedQAIndex === null || paperSets.length === 0) return;
    
    // 如果是手动切换的 tab，不执行自动切换
    if (manualTabSwitch) return;
    
    // paperSets 是倒序的（最新在索引0），expandedQAIndex 是正序的（最老在索引0）
    // 需要反转索引
    const tabIndex = paperSets.length - 1 - expandedQAIndex;
    if (tabIndex >= 0 && tabIndex < paperSets.length && activeTab !== tabIndex) {
      setActiveTab(tabIndex);
    }
  }, [expandedQAIndex, paperSets.length, manualTabSwitch]);

  // Clean up event source on unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  // 侧边栏配置已移除 - AISearchView 现在是嵌入式组件，不再管理侧边栏

  const handleNewConversation = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }
    setCurrentConversationId(null);
    setAIConversationId(null); // 清除 sessionStorage 中的对话ID
    setMessages([]);
    setPapers([]);
    setPapersTotal(0);
    setPaperSets([]); // 清空论文集合
    setSearchQuery('');
    setStreamingContent('');
    setIsStreaming(false);
    // 清除 URL 中的 conversationId
    setSearchParams(prev => {
      const newParams = new URLSearchParams(prev);
      newParams.delete('conversationId');
      return newParams;
    });
  };

  const handleDeleteConversation = async (conversationId) => {
    try {
      await conversationAPI.deleteConversation(conversationId);
      setConversations(conversations.filter(c => c.id !== conversationId));
      if (currentConversationId === conversationId) {
        handleNewConversation();
      }
    } catch (error) {
      console.error('Failed to delete conversation:', error);
      alert('删除失败');
    }
  };

  const handleRenameConversation = async (conversationId, newTitle) => {
    logger.log('handleRenameConversation called:', { conversationId, newTitle });
    try {
      const response = await api.put(`/user/conversations/${conversationId}/title`, { title: newTitle });
      logger.log('Rename API response:', response.data);
      setConversations(prevConversations =>
        prevConversations.map(conv =>
          conv.id === conversationId ? { ...conv, title: newTitle } : conv
        )
      );
      logger.log('Local conversations updated');
    } catch (error) {
      console.error('Failed to rename conversation:', error);
      console.error('Error details:', error.response?.data);
    }
  };

  const handleSelectConversation = async (conversationId) => {
    setLoading(true);
    setSearchQuery(''); // 清空搜索输入框
    setStreamingContent(''); // 切换对话时清空流式内容
    setPaperSets([]); // 清空论文集合
    isLoadingHistoryRef.current = true; // 标记正在加载历史对话
    // react-scroll-to-bottom 会自动处理滚动

    try {
      const response = await conversationAPI.getConversation(conversationId);
      if (response.data.code === 0 && response.data.data) {
        const conv = response.data.data;
        setCurrentConversationId(conv.id);
        
        // 重新组织消息顺序，使用parent_message_id建立问答对
        const organizedMessages = organizeMessagesByParentId(conv.messages || []);
        setMessages(organizedMessages);

        // 查找所有有论文结果的消息，构建 paperSets
        // 支持新格式 (search_paper_ids) 和旧格式 (search_results)
        const messagesWithPapers = organizedMessages.filter(
          m => m.role === 'user' && (
            (m.search_paper_ids && m.search_paper_ids.length > 0) ||
            (m.search_results && m.search_results.length > 0)
          )
        );

        if (messagesWithPapers.length > 0) {
          // 检查是否需要批量获取论文详情（新格式）
          const messagesNeedingFetch = messagesWithPapers.filter(
            m => m.search_paper_ids && m.search_paper_ids.length > 0 && (!m.search_results || m.search_results.length === 0)
          );

          if (messagesNeedingFetch.length > 0) {
            // 新格式：需要批量获取论文详情
            logger.log(`History: ${messagesNeedingFetch.length} messages need paper details fetch`);
            
            // 收集所有需要获取的论文ID
            const allPaperIds = [...new Set(messagesNeedingFetch.flatMap(m => m.search_paper_ids))];
            
            // 批量获取论文详情 - 使用和学术检索一致的字段
            try {
              const response = await publicScholarAPI.getPaperBatch(allPaperIds, PAPER_FIELDS);
              if (response.data.code === 0 && response.data.data) {
                const papersMap = {};
                (response.data.data || []).forEach(paper => {
                  if (paper.paperId) {
                    papersMap[paper.paperId] = paper;
                  }
                });

                // 构建 paperSets
                const sets = messagesWithPapers.map((msg, index) => {
                  let papers = [];
                  if (msg.search_paper_ids && msg.search_paper_ids.length > 0) {
                    // 新格式：从获取的详情中匹配
                    papers = msg.search_paper_ids.map(id => papersMap[id]).filter(Boolean);
                  } else if (msg.search_results && msg.search_results.length > 0) {
                    // 旧格式：直接使用
                    papers = msg.search_results;
                  }
                  
                  return {
                    title: index === messagesWithPapers.length - 1 ? '最新搜索' : `搜索 ${index + 1}`,
                    papers: papers,
                    total: msg.search_results_total || papers.length,
                    query: msg.search_query
                  };
                });

                setPaperSets(sets.reverse());
                setPapers(sets[0].papers);
                setPapersTotal(sets[0].total);
              }
            } catch (err) {
              console.error('Failed to fetch paper details for history:', err);
            }
          } else {
            // 旧格式：直接使用 search_results
            const sets = messagesWithPapers.map((msg, index) => ({
              title: index === messagesWithPapers.length - 1 ? '最新搜索' : `搜索 ${index + 1}`,
              papers: msg.search_results,
              total: msg.search_results_total || msg.search_results.length,
              query: msg.search_query
            }));
            setPaperSets(sets.reverse());
            setPapers(sets[0].papers);
            setPapersTotal(sets[0].total);
          }

          // 对于历史对话中的 assistant 消息，只加载已有的推荐问题，不再异步获取
          const assistantMessages = organizedMessages.filter(m => m.role === 'assistant');
          assistantMessages.forEach((assistantMsg) => {
            // 如果已有 follow_up_questions 字段，直接解析
            if (assistantMsg.follow_up_questions) {
              const questions = extractSuggestedQuestions(assistantMsg.follow_up_questions);
              if (questions.length > 0) {
                setMessages(prev => prev.map(msg =>
                  msg.id === assistantMsg.id
                    ? { ...msg, suggestedQuestions: questions }
                    : msg
                ));
              }
            }
            // 历史对话中没有推荐问题的消息，不再尝试加载
          });
        } else {
          setPapers([]);
          setPapersTotal(0);
        }
      }
    } catch (error) {
      console.error('Failed to load conversation:', error);
      alert('加载对话失败');
    } finally {
      setLoading(false);
    }
  };

  const handleInitialSearch = async (query) => {
    if (!query.trim()) return;

    // 检查是否登录，未登录则弹出登录弹窗
    if (!isAuthenticated) {
      setShowAuthModal(true);
      return;
    }

    const userMessage = query.trim();
    const isFirstMessage = messages.length === 0;

    setSearchQuery('');

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    // Immediately show user message with loading state
    const tempUserMessage = {
      id: 'temp-' + Date.now(),
      role: 'user',
      content: userMessage,
      search_query: userMessage,
      search_results: null,
      created_at: new Date().toISOString()
    };

    // 先计算新的索引（当前用户消息数量）
    const currentUserMessageCount = messages.filter(m => m.role === 'user').length;
    
    setMessages(prev => [...prev, tempUserMessage]);
    setLoading(true);
    setShowAIThinking(true); // 显示 AI 思考状态

    // 清空之前的流式内容状态，避免重复显示
    setStreamingContent('');
    streamingContentRef.current = '';
    setIsStreaming(false);
    
    // react-scroll-to-bottom 会自动处理滚动

    // 每次搜索都清空旧的论文列表，确保显示 skeleton loading
    setPapers([]);
    setPapersTotal(0);

    try {
      // 配额检查已废弃，现在使用货币系统进行扣费控制（在后端处理）

      let conversationId = currentConversationId;

      if (!conversationId) {
        const createResponse = await conversationAPI.createConversation(
          userMessage.length > 50 ? userMessage.substring(0, 50) + '...' : userMessage,
          'search'
        );
        if (createResponse.data.code === 0 && createResponse.data.data) {
          conversationId = createResponse.data.data.id;
          setCurrentConversationId(conversationId);
          // 刷新对话列表，确保新对话显示在侧边栏
          loadConversations();
        } else {
          throw new Error('Failed to create conversation');
        }
      }

      // 所有搜索都使用 advanced-search API，而不是 continue API
      // 这样确保每次搜索都计入 advanced_search_* 配额
      const response = await conversationAPI.addMessage(
        conversationId,
        userMessage,
        userMessage,
        false // Advanced mode doesn't use direct search
      );

      if (response.data.code === 0 && response.data.data) {
        const newMessage = response.data.data;
        // Replace temp message with real message
        setMessages(prev => prev.map(msg =>
          msg.id === tempUserMessage.id ? newMessage : msg
        ));

        // Always use advanced search for all searches
        startAdvancedSearch(conversationId, newMessage.id, userMessage);
      } else {
        throw new Error(response.data.message || 'Failed to send message');
      }
    } catch (error) {
      console.error('Search failed:', error);
      // Remove temp message on error
      setMessages(prev => prev.filter(msg => msg.id !== tempUserMessage.id));
      alert('搜索失败: ' + (error.response?.data?.message || error.message));
      // Only stop loading on error, let streaming handlers manage loading state
      setLoading(false);
      setShowAIThinking(false);
    }
  };

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    // 记录使用统计
    trackSmartAnalysis(EntryPoint.ADVANCED_SEARCH_PAGE, searchQuery);

    // react-scroll-to-bottom 会自动处理滚动
    await handleInitialSearch(searchQuery);
  };

  const startAdvancedSearch = async (convId, messageId, query) => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const token = localStorage.getItem('user_token');
    if (!token) {
      console.error('No auth token found');
      return;
    }

    // 配额检查已废弃，现在使用货币系统进行扣费控制（在后端处理）

    setIsStreaming(true);
    setStreamingContent('');
    streamingContentRef.current = '';
    setShowAIThinking(true);
    
    // react-scroll-to-bottom 会自动处理滚动

    // 添加新的论文集合占位符
    setPaperSets(prevSets => [
      {
        title: '最新搜索',
        papers: [],
        total: 0,
        query: query,
        isLoading: true // 标记正在加载
      },
      ...prevSets
    ]);

    const url = `/api/v1/user/conversations/${convId}/messages/${messageId}/advanced-search`;
    const eventSource = new EventSource(`${url}?token=${token}&model_level=${modelLevel}`);
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      logger.log('Advanced search stream started');
    };

    let isFirstMessage = true;

    eventSource.onmessage = (event) => {
      // 检查是否是错误消息（第一条消息）
      if (isFirstMessage) {
        isFirstMessage = false;
        try {
          const data = JSON.parse(event.data);
          if (data.code === 403 || data.message?.includes('配额不足')) {
            // 配额不足错误
            eventSource.close();
            setIsStreaming(false);
            setShowAIThinking(false);
            setLoading(false);
            
            // 删除刚添加的用户消息
            setMessages(prev => prev.filter(msg => msg.id !== messageId));
            
            // 移除添加的论文集合占位符
            setPaperSets(prevSets => prevSets.slice(1));
            
            // 显示配额不足的提示
            alert('配额不足，请升级订阅');
            return;
          }
        } catch (e) {
          // 如果不是JSON格式，继续正常处理
        }
      }
      
      if (event.data.startsWith('[DONE]')) {
        logger.log('Advanced search completed');
        eventSource.close();

        // 先清空流式内容和停止状态，避免重复显示
        const finalContent = streamingContentRef.current;

        setStreamingContent('');
        streamingContentRef.current = '';
        setIsStreaming(false);

        // 将流式内容添加到消息列表（不包含延伸问题，延伸问题将通过独立API获取）
        if (finalContent) {
          setMessages(prev => {
            const lastMessage = prev[prev.length - 1];
            // 如果最后一条消息不是 assistant 或内容为空，添加新的 assistant 消息
            if (!lastMessage || lastMessage.role !== 'assistant' || !lastMessage.content) {
              const newMessage = {
                id: messageId, // 使用实际的 messageId
                role: 'assistant',
                content: finalContent,
                suggestedQuestions: [], // 初始化为空，稍后通过 API 加载
                created_at: new Date().toISOString()
              };

              // react-scroll-to-bottom 会自动处理滚动

              // 异步加载延伸问题
              fetchFollowUpQuestions(convId, messageId, newMessage);

              return [...prev, newMessage];
            }
            return prev;
          });
        }

        // 最后关闭其他loading状态
        setLoading(false);
        setShowAIThinking(false);
        return;
      }

      if (event.data.startsWith('[ERROR]')) {
        const errorMsg = event.data.substring(7).trim(); // Remove '[ERROR]' prefix
        console.error('Advanced search error:', errorMsg);
        eventSource.close();

        // Clear all loading states
        setIsStreaming(false);
        setLoading(false);
        setShowAIThinking(false);

        // Remove loading placeholder from paper sets
        setPaperSets(prevSets => prevSets.filter(set => !set.isLoading));

        // Display error message to user
        setStreamingContent('');
        streamingContentRef.current = '';

        // Add error message as assistant message (backend already provides friendly message)
        setMessages(prev => [...prev, {
          id: 'error-' + Date.now(),
          role: 'assistant',
          content: errorMsg,
          created_at: new Date().toISOString()
        }]);

        return;
      }

      if (event.data.startsWith('[PAPERS]')) {
        // Handle papers data - now receives only paper IDs
        try {
          const papersData = JSON.parse(event.data.substring(8));
          const paperIds = papersData.paperIds || papersData.papers || []; // 兼容新旧格式
          const newTotal = papersData.total || 0;

          // 检查是新格式（只有IDs）还是旧格式（完整论文数据）
          const isNewFormat = Array.isArray(paperIds) && paperIds.length > 0 && typeof paperIds[0] === 'string';

          if (isNewFormat) {
            // 新格式：只有IDs，需要批量获取论文详情
            logger.log(`Received ${paperIds.length} paper IDs, fetching details...`);
            
            // 异步获取论文详情 - 使用和学术检索一致的字段
            publicScholarAPI.getPaperBatch(paperIds, PAPER_FIELDS).then(response => {
              if (response.data.code === 0 && response.data.data) {
                const newPapers = response.data.data || [];
                logger.log(`Fetched ${newPapers.length} paper details`);
                
                setPapers(newPapers);
                setPapersTotal(newTotal);

                // 更新第一个占位符（索引0）为真实的论文数据
                setPaperSets(prevSets => {
                  const newSets = [...prevSets];
                  if (newSets.length > 0 && newSets[0].isLoading) {
                    newSets[0] = {
                      title: '最新搜索',
                      papers: newPapers,
                      total: newTotal,
                      query: query,
                      isLoading: false
                    };
                  } else {
                    newSets.unshift({
                      title: '最新搜索',
                      papers: newPapers,
                      total: newTotal,
                      query: query,
                      isLoading: false
                    });
                  }
                  return newSets;
                });

                setLoading(false);
              }
            }).catch(err => {
              console.error('Failed to fetch paper details:', err);
              setLoading(false);
            });
          } else {
            // 旧格式：完整论文数据（向后兼容）
            const newPapers = paperIds;
            setPapers(newPapers);
            setPapersTotal(newTotal);

            setPaperSets(prevSets => {
              const newSets = [...prevSets];
              if (newSets.length > 0 && newSets[0].isLoading) {
                newSets[0] = {
                  title: '最新搜索',
                  papers: newPapers,
                  total: newTotal,
                  query: query,
                  isLoading: false
                };
              } else {
                newSets.unshift({
                  title: '最新搜索',
                  papers: newPapers,
                  total: newTotal,
                  query: query,
                  isLoading: false
                });
              }
              return newSets;
            });

            setLoading(false);
          }
        } catch (err) {
          console.error('Failed to parse papers data:', err);
        }
        return;
      }

      if (event.data.startsWith('[FOLLOW_UP_QUESTIONS]')) {
        // Handle follow-up questions (non-streaming, all at once)
        try {
          const followUpQuestions = event.data.substring(21); // Remove '[FOLLOW_UP_QUESTIONS]' prefix
          console.log('Received follow-up questions:', followUpQuestions);

          // Extract questions from the content
          const questions = extractSuggestedQuestions(followUpQuestions);
          // questions 已经通过 updateLastAssistantMessage 更新到消息中
        } catch (err) {
          console.error('Failed to parse follow-up questions:', err);
        }
        return;
      }

      try {
        const data = JSON.parse(event.data);
        if (data.choices && data.choices[0] && data.choices[0].delta) {
          const delta = data.choices[0].delta;
          if (delta.content) {
            // 收到第一个内容片段时，关闭 AI 思考动画
            if (streamingContentRef.current === '') {
              setShowAIThinking(false);
            }
            // loading 已经在收到论文数据时关闭了，不需要再次设置
            streamingContentRef.current += delta.content;
            setStreamingContent(prev => prev + delta.content);
            
          }
        }
      } catch (err) {
        console.error('Failed to parse SSE data:', err);
      }
    };

    eventSource.onerror = (err) => {
      console.error('SSE error:', err);
      eventSource.close();
      setIsStreaming(false);
      setShowAIThinking(false);
      setLoading(false);
      
      // 如果是连接失败，删除用户消息和论文集合占位符
      setMessages(prev => prev.filter(msg => msg.id !== messageId));
      setPaperSets(prevSets => prevSets.slice(1));
      
      // 注意：配额检查已废弃，错误可能是余额不足，由后端返回具体错误信息
    };
  };

  // 继续对话 - 用于智能分析后的追问
  const startContinueConversation = async (conversationId, query) => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const token = localStorage.getItem('user_token');
    if (!token) {
      console.error('No auth token found');
      return;
    }

    setIsStreaming(true);
    setStreamingContent('');
    streamingContentRef.current = '';
    setLoading(true);
    setShowAIThinking(true); // 显示 AI 思考状态

    // 清空当前论文列表，显示 loading skeleton
    setPapers([]);
    setPapersTotal(0);

    // 添加新的论文集合占位符，用于新的搜索
    setPaperSets(prevSets => [
      {
        title: '追问搜索',
        papers: [],
        total: 0,
        query: query,
        isLoading: true // 标记正在加载
      },
      ...prevSets
    ]);

    try {
      // 调用继续对话 API
      const response = await fetch(
        `/api/v1/user/conversations/${conversationId}/continue`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            query,
            model_level: modelLevel  // 传递模型级别
          })
        }
      );

      if (!response.ok) {
        throw new Error('Failed to continue conversation');
      }

      // 创建 EventSource 来接收流式响应
      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      const readStream = async () => {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split('\n');

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.substring(6);

              if (data.startsWith('[DONE]')) {
                // 先清空流式内容和停止状态，避免重复显示
                const finalContent = streamingContentRef.current;

                setStreamingContent('');
                streamingContentRef.current = '';
                setIsStreaming(false);

                // 将流式内容添加到消息列表（不包含延伸问题）
                if (finalContent) {
                  setMessages(prev => {
                    const lastMessage = prev[prev.length - 1];
                    if (!lastMessage || lastMessage.role !== 'assistant' || !lastMessage.content) {
                      return [...prev, {
                        id: 'assistant-' + Date.now(),
                        role: 'assistant',
                        content: finalContent,
                        created_at: new Date().toISOString()
                      }];
                    }
                    return prev;
                  });
                }

                setLoading(false);
                return;
              }

              if (data.startsWith('[ERROR]')) {
                const errorMsg = data.substring(8).trim(); // Remove '[ERROR] ' prefix
                console.error('Continue conversation error:', errorMsg);
                setIsStreaming(false);
                setLoading(false);
                setShowAIThinking(false);
                
                // Remove loading placeholder from paper sets
                setPaperSets(prevSets => prevSets.filter(set => !set.isLoading));
                
                // Add error message as assistant message (backend already provides friendly message)
                setMessages(prev => [...prev, {
                  id: 'error-' + Date.now(),
                  role: 'assistant',
                  content: errorMsg,
                  created_at: new Date().toISOString()
                }]);
                
                return;
              }

              if (data.startsWith('[PAPERS]')) {
                try {
                  const papersData = JSON.parse(data.substring(8));
                  const paperIds = papersData.paperIds || papersData.papers || [];
                  const newTotal = papersData.total || 0;

                  // 检查是新格式（只有IDs）还是旧格式（完整论文数据）
                  const isNewFormat = Array.isArray(paperIds) && paperIds.length > 0 && typeof paperIds[0] === 'string';

                  if (isNewFormat) {
                    // 新格式：只有IDs，需要批量获取论文详情
                    logger.log(`Continue: Received ${paperIds.length} paper IDs, fetching details...`);
                    
                    // 使用和学术检索一致的字段
                    publicScholarAPI.getPaperBatch(paperIds, PAPER_FIELDS).then(response => {
                      if (response.data.code === 0 && response.data.data) {
                        const newPapers = response.data.data || [];
                        
                        setPapers(newPapers);
                        setPapersTotal(newTotal);
                        setLoading(false);

                        setPaperSets(prevSets => {
                          const newSets = [...prevSets];
                          if (newSets.length > 0 && newSets[0].isLoading) {
                            newSets[0] = {
                              title: '追问搜索',
                              papers: newPapers,
                              total: newTotal,
                              query: query,
                              isLoading: false
                            };
                          } else {
                            newSets.unshift({
                              title: '追问搜索',
                              papers: newPapers,
                              total: newTotal,
                              query: query,
                              isLoading: false
                            });
                          }
                          return newSets;
                        });
                      }
                    }).catch(err => {
                      console.error('Failed to fetch paper details:', err);
                      setLoading(false);
                    });
                  } else {
                    // 旧格式：完整论文数据（向后兼容）
                    const newPapers = paperIds;
                    setPapers(newPapers);
                    setPapersTotal(newTotal);
                    setLoading(false);

                    setPaperSets(prevSets => {
                      const newSets = [...prevSets];
                      if (newSets.length > 0 && newSets[0].isLoading) {
                        newSets[0] = {
                          title: '追问搜索',
                          papers: newPapers,
                          total: newTotal,
                          query: query,
                          isLoading: false
                        };
                      } else {
                        newSets.unshift({
                          title: '追问搜索',
                          papers: newPapers,
                          total: newTotal,
                          query: query,
                          isLoading: false
                        });
                      }
                      return newSets;
                    });
                  }
                } catch (err) {
                  console.error('Failed to parse papers data:', err);
                }
                continue;
              }

              if (data.startsWith('[FOLLOW_UP_QUESTIONS]')) {
                // Handle follow-up questions (non-streaming, all at once)
                try {
                  const followUpQuestions = data.substring(21); // Remove '[FOLLOW_UP_QUESTIONS]' prefix
                  console.log('Received follow-up questions for continue conversation:', followUpQuestions);

                  // Extract questions from the content
                  const questions = extractSuggestedQuestions(followUpQuestions);
                  // questions 已经通过 updateLastAssistantMessage 更新到消息中
                } catch (err) {
                  console.error('Failed to parse follow-up questions:', err);
                }
                continue;
              }

              // 解析流式内容
              try {
                const jsonData = JSON.parse(data);
                if (jsonData.choices && jsonData.choices[0] && jsonData.choices[0].delta) {
                  const delta = jsonData.choices[0].delta;
                  if (delta.content) {
                    // 收到第一个内容片段时，关闭 AI 思考动画
                    if (streamingContentRef.current === '') {
                      setShowAIThinking(false);
                    }
                    streamingContentRef.current += delta.content;
                    setStreamingContent(prev => prev + delta.content);
                  }
                }
              } catch (err) {
                // 可能不是 JSON，忽略
              }
            }
          }
        }
      };

      readStream();
    } catch (error) {
      console.error('Continue conversation failed:', error);
      setIsStreaming(false);
      setLoading(false);
      setShowAIThinking(false); // 关闭 AI 思考状态
      alert('继续对话失败: ' + error.message);
    }
  };

  // 处理点击论文信息，切换到对应的 tab
  const handlePaperInfoClick = (searchQuery) => {
    if (!paperSets || paperSets.length === 0) return;

    // 查找匹配的 tab
    const tabIndex = paperSets.findIndex(set => set.query === searchQuery);
    if (tabIndex !== -1) {
      setActiveTab(tabIndex);
    }
  };

  // 处理引文hover - 立即响应，无延迟
  const handleCitationHover = (paperIndex, messageId) => {
    // 检查这个论文索引是否属于当前显示的论文集合
    if (paperSets && paperSets.length > 0) {
      // 找到所有 assistant 消息
      const assistantMessages = messages.filter(m => m.role === 'assistant');
      // 找到当前消息在 assistant 消息中的索引
      const assistantIndex = assistantMessages.findIndex(m => m.id === messageId);
      
      if (assistantIndex !== -1) {
        // 计算对应的 tab 索引
        const tabIndex = paperSets.length - 1 - assistantIndex;
        
        // 只有当论文属于当前显示的 tab 时才设置高亮
        if (tabIndex === activeTab) {
          setHighlightedPaperIndex(paperIndex);
        } else {
          // 不是当前 tab 的论文，不设置高亮
          setHighlightedPaperIndex(null);
        }
        return;
      }
    }
    
    // 如果没有 paperSets（单个搜索），直接设置高亮
    setHighlightedPaperIndex(paperIndex);
  };

  const handleCitationLeave = () => {
    // 使用 requestAnimationFrame 确保在下一帧检查，避免事件触发顺序问题
    requestAnimationFrame(() => {
      // 检查鼠标是否真的离开了所有引文元素
      const citationElements = document.querySelectorAll('.paper-citation-text');
      let isHoveringAnyCitation = false;

      citationElements.forEach(element => {
        if (element.matches(':hover')) {
          isHoveringAnyCitation = true;
        }
      });

      // 只有当鼠标不在任何引文上时才清除高亮
      if (!isHoveringAnyCitation) {
        setHighlightedPaperIndex(null);
      }
    });
  };

  // 清理全局鼠标移动监听
  useEffect(() => {
    // 全局监听鼠标移动，确保状态正确清理（无延迟）
    const handleGlobalMouseMove = (e) => {
      // 检查鼠标是否在引文元素上
      const target = e.target;
      const isCitation = target.closest('.paper-citation-text');

      // 如果鼠标不在引文上且有高亮状态，立即清除
      if (!isCitation && highlightedPaperIndex !== null) {
        setHighlightedPaperIndex(null);
      }
    };

    document.addEventListener('mousemove', handleGlobalMouseMove);

    return () => {
      document.removeEventListener('mousemove', handleGlobalMouseMove);
    };
  }, [highlightedPaperIndex]);

  // Main advanced search interface
  return (
    <div className="advanced-search-page ai-search-view-embedded">
      <div className="advanced-search-content">
        {/* 结果布局 - 复用学术检索样式 */}
          <div className="as-results-layout search-results-page">
            {/* 顶部导航栏 - 简化版 */}
            <div className="results-layout">
              <div className="results-search-header ai-results-header">
                {/* 左侧 Logo */}
                <div className="results-logo" onClick={() => navigate('/')}>
                  <span className="results-logo-text">Scholay</span>
                </div>
                
                {/* 中间区域 - 显示当前分析状态 */}
                <div className="ai-header-center">
                  <div className="ai-analysis-indicator">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/>
                    </svg>
                    <span className="ai-indicator-text">智能分析</span>
                    {papersTotal > 0 && (
                      <span className="ai-papers-count">已找到 {papersTotal} 篇相关论文</span>
                    )}
                  </div>
                </div>
                
                {/* 右侧空白区域 - 保持布局平衡 */}
                <div className="search-header-right">
                  {/* 操作按钮移到右侧对话面板 */}
                </div>
              </div>

              {/* 主内容区 - 两栏布局：论文列表 + AI对话 */}
              <div className="results-main ai-results-main">
                {/* 左侧：论文列表容器 - 复用学术检索样式 */}
                <div className="papers-container" ref={papersContainerRef}>
                  <AIPaperList
                    papers={papers}
                    loading={loading}
                    total={papersTotal}
                    highlightedPaperIndex={highlightedPaperIndex}
                    scrollToPaperIndex={scrollToPaperIndex}
                    onScrollComplete={() => setScrollToPaperIndex(null)}
                    onPaperClick={(paper, index) => {
                      // 可以在这里添加论文点击逻辑
                      setHighlightedPaperIndex(null);
                    }}
                  />
                </div>

              {/* 右侧：AI对话区域 */}
              <div className="ai-chat-panel">
                {/* 对话面板顶部操作栏 */}
                <div className="ai-chat-header">
                  <div className="ai-chat-header-left">
                    <span className="ai-chat-title">AI 对话</span>
                  </div>
                  <div className="ai-chat-header-right">
                    {/* 历史记录下拉框 */}
                    <AIHistoryDropdown
                      conversations={conversations}
                      currentConversationId={currentConversationId}
                      onSelectConversation={handleSelectConversation}
                      onDeleteConversation={handleDeleteConversation}
                      onNewConversation={handleNewConversation}
                      loading={conversationsLoading}
                    />
                    
                    {/* 新建对话按钮 */}
                    <button className="ai-new-conversation-btn" onClick={handleNewConversation} title="新建对话">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M12 5v14M5 12h14" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </button>
                  </div>
                </div>


                {/* 问答滚动容器 - 使用 scroll-snap 实现丝滑切换 */}
                <div 
                  className="qa-snap-container"
                  ref={qaSnapContainerRef}
                  onScroll={(e) => {
                    const container = e.currentTarget;
                    const sections = container.querySelectorAll('.qa-section');
                    const containerScrollTop = container.scrollTop;
                    const containerHeight = container.clientHeight;
                    
                    // 找到当前最可见的 section（中点在可视区域内的）
                    let closestIndex = 0;
                    let closestDistance = Infinity;
                    
                    sections.forEach((section, index) => {
                      const sectionTop = section.offsetTop;
                      const sectionMiddle = sectionTop + section.clientHeight / 2;
                      const viewMiddle = containerScrollTop + containerHeight / 2;
                      const distance = Math.abs(sectionMiddle - viewMiddle);
                      
                      if (distance < closestDistance) {
                        closestDistance = distance;
                        closestIndex = index;
                      }
                    });
                    
                    // 更新当前问答索引（同步左侧论文列表）
                    if (closestIndex !== expandedQAIndex && !isStreaming) {
                      handleQAToggle(closestIndex);
                    }
                  }}
                >
                  {qaList.length === 0 ? (
                    <div className="qa-section">
                      <div className="qa-empty-state">
                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                        </svg>
                        <p>输入问题开始智能分析</p>
                      </div>
                    </div>
                  ) : (
                    qaList.map((qa, index) => (
                      <div 
                        key={qa.messageId || index} 
                        className={`qa-section ${index === expandedQAIndex ? 'active' : ''}`}
                      >
                        {/* 问题卡片 - 悬浮效果 */}
                        <div className="qa-question-wrapper">
                          <div className={`qa-current-question ${index > 0 ? 'has-prev' : ''}`}>
                            <div className="qa-question-text">{qa.question}</div>
                            {getQAPaperCount(index) > 0 && (
                              <div className="qa-question-meta">
                                <span className="qa-paper-badge">
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                                    <polyline points="14 2 14 8 20 8"/>
                                  </svg>
                                  {getQAPaperCount(index)} 篇相关论文
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                        
                        {/* 回答内容区域 */}
                        <div className="qa-answer-area">
                          {index === qaList.length - 1 && showAIThinking ? (
                            <div className="qa-thinking-skeleton">
                              <div className="skeleton-line" style={{width: '90%'}}></div>
                              <div className="skeleton-line" style={{width: '95%'}}></div>
                              <div className="skeleton-line" style={{width: '80%'}}></div>
                              <div className="skeleton-line" style={{width: '85%'}}></div>
                            </div>
                          ) : (
                            <div className="qa-answer-content">
                              <PaperCitationMarkdown
                                content={
                                  index === qaList.length - 1 && isStreaming
                                    ? streamingContent
                                    : qa.answer || ''
                                }
                                onCitationHover={(paperIndex) => handleCitationHover(paperIndex, qa.assistantMsgId)}
                                onCitationLeave={handleCitationLeave}
                                onCitationClick={(paperIndex) => {
                                  const tabIndex = paperSets.length - 1 - index;
                                  if (tabIndex >= 0 && tabIndex < paperSets.length) {
                                    setActiveTab(tabIndex);
                                    setManualTabSwitch(true);
                                  }
                                  setScrollToPaperIndex(paperIndex);
                                }}
                              />
                            </div>
                          )}
                          
                          {/* 延伸问题 - 只在最新问答时显示 */}
                          {index === qaList.length - 1 && 
                           !isStreaming && 
                           !showAIThinking && 
                           qa.suggestedQuestions !== undefined && (
                            <div className="qa-suggested">
                              <div className="qa-suggested-header">
                                <span className="qa-suggested-title">你可以继续提问</span>
                              </div>
                              <div className="qa-suggested-list">
                                {(isLoadingSuggestedQuestions || 
                                  !qa.suggestedQuestions || 
                                  qa.suggestedQuestions.length === 0) ? (
                                  <>
                                    <div className="qa-suggested-btn skeleton-loading">
                                      <span className="question-text"></span>
                                    </div>
                                    <div className="qa-suggested-btn skeleton-loading">
                                      <span className="question-text"></span>
                                    </div>
                                    <div className="qa-suggested-btn skeleton-loading">
                                      <span className="question-text"></span>
                                    </div>
                                  </>
                                ) : (
                                  qa.suggestedQuestions.map((q, i) => (
                                    <button
                                      key={i}
                                      className="qa-suggested-btn"
                                      onClick={() => handleFollowUpQuestionClick(q)}
                                      disabled={loading}
                                    >
                                      <span className="question-text">{q}</span>
                                    </button>
                                  ))
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                  {/* 底部占位元素 - 防止最后一个 section 回弹 */}
                  <div className="qa-bottom-spacer"></div>
                </div>



                {/* 底部输入框 */}
                <div className="as-bottom-input-container">
                  <form onSubmit={handleSearch} className="advanced-bottom-composer-wrapper">
                    {/* 输入区域 */}
                    <div className="advanced-bottom-composer-input-area">
                      <textarea
                        ref={textareaRef}
                        className="advanced-bottom-chat-input"
                        placeholder="继续追问或输入新的搜索需求..."
                        value={searchQuery}
                        maxLength={1000}
                        onChange={(e) => {
                          setSearchQuery(e.target.value);
                          e.target.style.height = 'auto';
                          e.target.style.height = Math.min(e.target.scrollHeight, 200) + 'px';
                        }}
                        onCompositionStart={() => setIsComposing(true)}
                        onCompositionEnd={() => setIsComposing(false)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey && !isComposing) {
                            e.preventDefault();
                            if (!loading && searchQuery.trim()) {
                              handleSearch(e);
                            }
                          }
                        }}
                        disabled={loading}
                        rows={1}
                      />
                      <button type="submit" className="btn-send" disabled={loading || !searchQuery.trim()}>
                        {loading ? (
                          <div className="spinner-small"></div>
                        ) : (
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M5 12h14M12 5l7 7-7 7"/>
                          </svg>
                        )}
                      </button>
                    </div>

                    {/* 底部操作栏 */}
                  </form>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 登录弹窗 */}
      {showAuthModal && (
        <Suspense fallback={null}>
          <AuthModal
            isOpen={showAuthModal}
            onClose={() => setShowAuthModal(false)}
            onSuccess={() => {
              setShowAuthModal(false);
              // 登录成功后可以自动执行搜索
              if (searchQuery.trim()) {
                handleSearch({ preventDefault: () => {} });
              }
            }}
          />
        </Suspense>
      )}
    </div>
  );
};

export default AISearchView;
