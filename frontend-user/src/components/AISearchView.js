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
import CiteModal from './CiteModal';
import InsufficientBalanceModal from './InsufficientBalanceModal';
import './QACard.css'; // 对话区域样式
import { conversationAPI, subscriptionAPI, publicScholarAPI, analysisDimensionAPI, walletAPI } from '../services/api';
import AnalysisCellText from './AnalysisCellText';
import wsClient from '../services/websocket';
import { trackSmartAnalysis, EntryPoint } from '../utils/usageTracker';
import { getSearchQuery, getAIModelLevel, getAIConversationId, setAIConversationId, clearSearchQuery } from '../utils/searchStorage';
import { organizeMessagesByParentId } from '../utils/messageUtils';
import '../pages/styles/search-results/papers.css'; // 导入维度面板样式（先导入）
import '../pages/styles/advanced-search/index.css'; // AI 模式布局样式（后导入，覆盖定位）

// 懒加载 AuthModal
const AuthModal = lazy(() => import('./AuthModal'));

/**
 * AISearchView 组件
 * @param {Object} props
 * @param {string} props.initialQuery - 初始搜索查询（从 sessionStorage 或 props 传入）
 * @param {string} props.initialModelLevel - 初始模型级别
 * @param {Function} props.onSwitchToNormal - 切换到普通搜索模式的回调
 * @param {boolean} props.autoTriggerSearch - 是否自动触发搜索（从学术检索切换过来时为 true）
 * @param {boolean} props.fromAcademicSearch - 是否从学术检索切换过来（用于显示过渡动画）
 */
const AISearchView = ({ initialQuery = '', initialModelLevel = 'low', onSwitchToNormal, autoTriggerSearch = false, fromAcademicSearch = false }) => {
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
  const [citePaper, setCitePaper] = useState(null); // 引用弹窗的论文
  
  // 论文展示相关状态 - 由 AIPaperList 组件内部管理

  // 分析维度相关状态
  const [dimensions, setDimensions] = useState([]); // 可用维度列表
  const [selectedDimensions, setSelectedDimensions] = useState([]); // 已选中的维度
  const [analysisResults, setAnalysisResults] = useState({}); // { paperId: { dimensionKey: result } }
  const [analyzingPapers, setAnalyzingPapers] = useState({}); // { paperId: boolean } 正在分析的论文
  const [floatPanelExpanded, setFloatPanelExpanded] = useState(false); // 悬浮面板展开状态
  const [floatPanelView, setFloatPanelView] = useState('list'); // 'list' | 'detail' | 'create' | 'edit'
  const [editingDimension, setEditingDimension] = useState(null); // 正在编辑的维度
  const [viewingDimension, setViewingDimension] = useState(null); // 正在查看的维度
  const [editForm, setEditForm] = useState({ name: '', description: '' }); // 编辑表单
  
  // 扣费相关状态
  const [totalDeducted, setTotalDeducted] = useState(0); // 累计扣费金额
  const [showBalanceModal, setShowBalanceModal] = useState(false); // 是否显示余额不足弹窗
  const [balanceError, setBalanceError] = useState(null); // 余额不足的详细信息
  const analysisAbortedRef = useRef(false); // 是否已中止分析

  const eventSourceRef = useRef(null);
  const textareaRef = useRef(null);
  const streamingContentRef = useRef('');
  const isLoadingHistoryRef = useRef(false); // 标记是否正在加载历史对话
  const papersContainerRef = useRef(null); // 论文列表容器
  const qaSnapContainerRef = useRef(null); // 问答滚动容器
  
  // 自动滚动相关
  const [autoScroll, setAutoScroll] = useState(true); // 是否自动滚动到底部
  const [disableSnapTemporarily, setDisableSnapTemporarily] = useState(false); // 临时禁用 scroll-snap
  const lastScrollTimeRef = useRef(Date.now()); // 上次程序滚动的时间
  const prevIsLoadingSuggestedRef = useRef(false); // 上一次推荐问题加载状态
  
  // 分页相关状态
  const [messagePagination, setMessagePagination] = useState({
    page: 1,
    pageSize: 20,
    total: 0,
    hasMore: false,
    isLoadingMore: false,
  });
  const prevScrollHeightRef = useRef(0); // 加载更多前的滚动高度，用于保持滚动位置

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

  // 获取当前对话标题
  const currentConversationTitle = useMemo(() => {
    if (!currentConversationId || !conversations || conversations.length === 0) {
      return null;
    }
    const conv = conversations.find(c => c.id === currentConversationId);
    return conv?.title || null;
  }, [currentConversationId, conversations]);

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

  // 处理问答切换 - 同时切换论文列表（支持懒加载）
  const handleQAToggle = async (qaIndex) => {
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
      const paperSet = paperSets[paperSetIndex];
      
      // 检查是否需要懒加载
      if (!paperSet.isLoaded && paperSet.paperIds && paperSet.paperIds.length > 0 && !paperSet.isLoading) {
        // 需要懒加载：设置加载状态
        logger.log(`Lazy loading papers for QA ${qaIndex} (${paperSet.paperIds.length} papers)`);
        setPapers([]); // 清空当前论文
        setPapersTotal(paperSet.total);
        
        // 标记为正在加载
        setPaperSets(prev => prev.map((set, idx) => 
          idx === paperSetIndex ? { ...set, isLoading: true } : set
        ));
        
        try {
          const response = await publicScholarAPI.getPaperBatch(paperSet.paperIds, PAPER_FIELDS);
          if (response.data.code === 0 && response.data.data) {
            const loadedPapers = response.data.data || [];
            setPapers(loadedPapers);
            setPapersTotal(paperSet.total || loadedPapers.length);
            // 更新 paperSets 中的数据，标记为已加载
            setPaperSets(prev => prev.map((set, idx) => 
              idx === paperSetIndex ? { ...set, papers: loadedPapers, isLoaded: true, isLoading: false } : set
            ));
            logger.log(`Lazy loaded ${loadedPapers.length} papers for QA ${qaIndex}`);
          }
        } catch (err) {
          logger.error(`Failed to lazy load papers for QA ${qaIndex}:`, err);
          // 加载失败，重置加载状态
          setPaperSets(prev => prev.map((set, idx) => 
            idx === paperSetIndex ? { ...set, isLoading: false } : set
          ));
        }
      } else if (paperSet?.papers) {
        // 已加载：直接显示
        setPapers(paperSet.papers);
        setPapersTotal(paperSet.total || paperSet.papers.length);
      }
    }
    setManualTabSwitch(true); // 标记为手动切换
  };

  // 滚动到底部函数
  const scrollToBottom = (behavior = 'smooth') => {
    const container = qaSnapContainerRef.current;
    if (!container) return;
    
    logger.log('[DEBUG-SCROLL] scrollToBottom 被调用, behavior:', behavior, 'scrollHeight:', container.scrollHeight);
    lastScrollTimeRef.current = Date.now();
    container.scrollTo({
      top: container.scrollHeight,
      behavior
    });
  };

  // 处理滚动事件 - 检测用户手动滚动
  const handleQAContainerScroll = (e) => {
    const container = e.currentTarget;
    const sections = container.querySelectorAll('.qa-section');
    const containerScrollTop = container.scrollTop;
    const containerHeight = container.clientHeight;
    
    // 检测是否是用户手动滚动（而非程序触发）
    const now = Date.now();
    const isProgrammaticScroll = now - lastScrollTimeRef.current < 100;
    
    if (!isProgrammaticScroll) {
      // 用户手动滚动
      const { scrollTop, scrollHeight, clientHeight } = container;
      const atBottom = scrollHeight - scrollTop - clientHeight < 100;
      
      if (atBottom) {
        // 用户滚动到底部，恢复自动滚动
        if (!autoScroll) {
          setAutoScroll(true);
        }
      } else if (isStreaming && autoScroll) {
        // 流式传输中用户向上滚动，暂停自动滚动
        setAutoScroll(false);
      }
      
      // 检测是否滚动到顶部，触发加载更多
      if (scrollTop < 100 && messagePagination.hasMore && !messagePagination.isLoadingMore && !isStreaming) {
        logger.log('[DEBUG-SCROLL] 滚动到顶部，触发加载更多');
        loadMoreMessages();
      }
    }
    
    // 原有的 section 切换逻辑
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
  };

  // 流式传输时自动滚动到底部
  useEffect(() => {
    if (isStreaming && autoScroll && streamingContent) {
      logger.log('[DEBUG-SCROLL] 流式传输中滚动到底部');
      scrollToBottom('auto'); // 使用 'auto' 避免 smooth 滚动的延迟
    }
  }, [streamingContent, isStreaming, autoScroll]);

  // 新消息时自动滚动到底部（仅在用户发送新问题时，不在流式传输结束时）
  useEffect(() => {
    // 只有在开始新问题时滚动（用户消息增加），不在 AI 回复结束时滚动
    const userMessageCount = messages.filter(m => m.role === 'user').length;
    if (userMessageCount > 0 && autoScroll && !isStreaming) {
      // 检查是否是用户刚发送了新问题（而不是 AI 回复完成）
      const lastMessage = messages[messages.length - 1];
      if (lastMessage?.role === 'user') {
        logger.log('[DEBUG-SCROLL] 用户发送新问题，触发滚动');
        setTimeout(() => scrollToBottom('smooth'), 50);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length, isStreaming]);

  // 流式传输状态变化时的处理
  useEffect(() => {
    logger.log('[DEBUG-SCROLL] isStreaming 变化:', isStreaming);
    if (isStreaming) {
      // 开始流式传输时：重置自动滚动，禁用 scroll-snap
      setAutoScroll(true);
      setDisableSnapTemporarily(true);
    }
  }, [isStreaming]);

  // 推荐问题加载完成后，滚动到底部显示推荐问题
  useEffect(() => {
    // 检测从 loading 变为 loaded（true -> false）
    const wasLoading = prevIsLoadingSuggestedRef.current;
    prevIsLoadingSuggestedRef.current = isLoadingSuggestedQuestions;
    
    if (wasLoading && !isLoadingSuggestedQuestions && !isStreaming) {
      // 推荐问题刚加载完成，滚动到底部
      setTimeout(() => {
        logger.log('[DEBUG-SCROLL] 推荐问题加载完成，滚动到底部');
        scrollToBottom('smooth');
      }, 100);
    }
  }, [isLoadingSuggestedQuestions, isStreaming]);

  // 流式传输结束且推荐问题加载完成后，延迟恢复 scroll-snap
  useEffect(() => {
    logger.log('[DEBUG-SCROLL] 检查恢复 scroll-snap: isStreaming=', isStreaming, 'isLoadingSuggestedQuestions=', isLoadingSuggestedQuestions);
    if (!isStreaming && !isLoadingSuggestedQuestions) {
      // 延迟恢复 scroll-snap，给 DOM 足够时间稳定
      const timer = setTimeout(() => {
        logger.log('[DEBUG-SCROLL] 恢复 scroll-snap');
        setDisableSnapTemporarily(false);
      }, 800); // 延迟 800ms 恢复 scroll-snap
      return () => clearTimeout(timer);
    }
  }, [isStreaming, isLoadingSuggestedQuestions]);

  // 移除自动跳转逻辑，允许未登录用户访问页面

  // 防止重复加载的 ref
  const hasLoadedConversationsRef = useRef(false);
  const hasLoadedDimensionsRef = useRef(false);
  const hasInitializedFromURLRef = useRef(false); // 防止 URL 参数重复初始化

  // 加载对话历史（只在首次认证成功时加载）
  useEffect(() => {
    if (isAuthenticated && !hasLoadedConversationsRef.current) {
      hasLoadedConversationsRef.current = true;
      loadConversations();
    }
  }, [isAuthenticated]);

  // 当创建新对话时刷新对话列表（不是首次加载时）
  useEffect(() => {
    // 只有在已经加载过对话列表后，新建对话时才刷新
    if (currentConversationId && isAuthenticated && hasLoadedConversationsRef.current) {
      // 检查新对话是否已在列表中，不在才刷新
      const existsInList = conversations.some(c => c.id === currentConversationId);
      if (!existsInList) {
        loadConversations();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        logger.error('Failed to fetch quota/usage:', error);
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
      logger.error('Failed to load search conversations:', error);
    } finally {
      setConversationsLoading(false);
    }
  };

  // ========== 维度分析相关函数 ==========
  
  // 获取维度的唯一标识（与学术检索页面保持一致）
  const getDimensionKey = (dim) => {
    return dim.dimensionKey || dim.key || dim.name;
  };

  // 加载维度列表（智能分析页面需要登录，始终使用带 JWT 验证的接口）
  const loadDimensions = async () => {
    if (!isAuthenticated) {
      logger.warn('User not authenticated, skipping dimension load');
      return;
    }
    try {
      const response = await analysisDimensionAPI.getDimensions();
      if (response.data.code === 0 && response.data.data) {
        const dims = response.data.data.dimensions || [];
        setDimensions(dims);
      }
    } catch (err) {
      logger.error('Failed to load dimensions:', err);
    }
  };

  // 加载维度列表（只在首次认证成功时加载）
  useEffect(() => {
    if (isAuthenticated && !hasLoadedDimensionsRef.current) {
      hasLoadedDimensionsRef.current = true;
      loadDimensions();
    }
  }, [isAuthenticated]);

  // 刷新维度列表（始终使用带 JWT 验证的接口）
  const refreshDimensions = async () => {
    if (!isAuthenticated) return;
    try {
      const response = await analysisDimensionAPI.getDimensions();
      if (response.data.code === 0) {
        setDimensions(response.data.data.dimensions || []);
      }
    } catch (error) {
      console.error('刷新维度列表失败:', error);
    }
  };

  // 切换维度选中状态
  const handleDimensionToggle = (dim) => {
    const dimKey = getDimensionKey(dim);
    setSelectedDimensions(prev => {
      const isSelected = prev.some(d => getDimensionKey(d) === dimKey);
      if (isSelected) {
        return prev.filter(d => getDimensionKey(d) !== dimKey);
      } else {
        return [...prev, dim];
      }
    });
  };

  // 为论文分析所有维度（智能分析页面始终使用带 JWT 验证的接口）
  // 返回: { success: boolean, aborted: boolean, deducted: number }
  const analyzePaper = async (paper) => {
    const abstractText = paper.abstract || paper.tldr?.text;
    if (!abstractText) return { success: false, aborted: false, deducted: 0 };

    // 智能分析页面需要登录，未登录时不执行分析
    if (!isAuthenticated) {
      logger.warn('User not authenticated, skipping paper analysis');
      return { success: false, aborted: false, deducted: 0 };
    }
    
    // 如果已中止，跳过
    if (analysisAbortedRef.current) return { success: false, aborted: true, deducted: 0 };

    setAnalyzingPapers(prev => ({
      ...prev,
      [paper.paperId]: true
    }));

    try {
      // 始终使用带 JWT 验证的接口
      const response = await analysisDimensionAPI.analyzePaper(paper.paperId, paper.title, abstractText);

      if (response.data.code === 0 && response.data.data) {
        // 接口返回格式: { data: { data: { key: value }, dimensions: [...], deducted_amount: number } }
        const responseData = response.data.data;
        const dimensionData = responseData.data || responseData;
        const deductedAmount = responseData.deducted_amount || 0;
        
        console.log('[AISearchView] analyzePaper response:', {
          paperId: paper.paperId,
          responseData,
          dimensionData,
          deductedAmount,
          keys: Object.keys(dimensionData)
        });
        
        // 累计扣费金额
        if (deductedAmount > 0) {
          setTotalDeducted(prev => prev + deductedAmount);
        }
        
        setAnalysisResults(prev => ({
          ...prev,
          [paper.paperId]: dimensionData
        }));
        
        return { success: true, aborted: false, deducted: deductedAmount };
      } else {
        setAnalysisResults(prev => ({
          ...prev,
          [paper.paperId]: { _error: true, _message: response.data.message || '分析失败' }
        }));
        return { success: false, aborted: false, deducted: 0 };
      }
    } catch (error) {
      logger.error('Failed to analyze paper:', paper.paperId, error);
      
      // 检查是否是余额不足错误
      if (error.response?.data?.code === 4020) {
        analysisAbortedRef.current = true;
        setBalanceError({
          ...error.response.data.data,
          alreadyDeducted: totalDeducted
        });
        setShowBalanceModal(true);
        return { success: false, aborted: true, deducted: 0 };
      }
      
      setAnalysisResults(prev => ({
        ...prev,
        [paper.paperId]: { _error: true, _message: error.response?.data?.message || '分析失败' }
      }));
      return { success: false, aborted: false, deducted: 0 };
    } finally {
      setAnalyzingPapers(prev => ({
        ...prev,
        [paper.paperId]: false
      }));
    }
  };

  // 并发控制分析
  // 分析完成后显示扣费提示 toast
  const analyzeWithConcurrency = async (papersToAnalyze, maxConcurrent = 5) => {
    // 重置中止标记和累计扣费
    analysisAbortedRef.current = false;
    setTotalDeducted(0);
    
    const queue = [...papersToAnalyze];
    const inProgress = new Set();
    let aborted = false;
    let totalDeductedInBatch = 0;

    const processNext = async () => {
      if (queue.length === 0 || analysisAbortedRef.current) return;
      
      const paper = queue.shift();
      inProgress.add(paper.paperId);
      
      try {
        const result = await analyzePaper(paper);
        if (result.aborted) {
          aborted = true;
          return;
        }
        totalDeductedInBatch += result.deducted || 0;
      } finally {
        inProgress.delete(paper.paperId);
        if (queue.length > 0 && !analysisAbortedRef.current) {
          await processNext();
        }
      }
    };

    const initialBatch = [];
    for (let i = 0; i < Math.min(maxConcurrent, queue.length); i++) {
      initialBatch.push(processNext());
    }
    
    await Promise.all(initialBatch);
    
    // 分析完成后，如果有扣费且未中止，发送 toast 通知
    if (!aborted && totalDeductedInBatch > 0) {
      wsClient.emit('toast', {
        title: '扣费提醒',
        content: `本次分析共消耗 ${totalDeductedInBatch} 经费`,
        category: 'transaction',
        created_at: new Date().toISOString()
      });
    }
    
    // 重置累计扣费
    setTotalDeducted(0);
  };

  // 当选中维度变化时，为当前论文执行分析
  useEffect(() => {
    if (selectedDimensions.length === 0) return;

    const papersToAnalyze = papers.filter(paper => 
      (paper.abstract || paper.tldr?.text) && 
      !analysisResults[paper.paperId] && 
      !analyzingPapers[paper.paperId]
    );

    if (papersToAnalyze.length > 0) {
      analyzeWithConcurrency(papersToAnalyze);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDimensions.length, papers]);

  // 创建/编辑维度
  const handleSaveDimension = async () => {
    if (!editForm.name.trim()) {
      alert('请输入维度名称');
      return;
    }

    const dimensionKey = editingDimension 
      ? getDimensionKey(editingDimension)
      : editForm.name.trim().toLowerCase().replace(/\s+/g, '_');

    try {
      const response = await analysisDimensionAPI.createDimension(
        dimensionKey,
        editForm.name.trim(),
        editForm.description.trim()
      );

      if (response.data.code === 0) {
        await refreshDimensions();
        setFloatPanelView('list');
        setEditingDimension(null);
        setEditForm({ name: '', description: '' });
      } else {
        alert(response.data.message || '保存失败');
      }
    } catch (error) {
      console.error('保存维度失败:', error);
      alert('保存失败，请稍后重试');
    }
  };

  // 删除维度
  const handleDeleteDimension = async (dimension) => {
    if (!window.confirm(`确定要删除维度「${dimension.name}」吗？`)) {
      return;
    }

    try {
      const response = await analysisDimensionAPI.deleteDimension(getDimensionKey(dimension));
      if (response.data.code === 0) {
        setSelectedDimensions(prev => prev.filter(d => getDimensionKey(d) !== getDimensionKey(dimension)));
        await refreshDimensions();
        if (floatPanelView === 'edit' && editingDimension && getDimensionKey(editingDimension) === getDimensionKey(dimension)) {
          setFloatPanelView('list');
          setEditingDimension(null);
        }
      } else {
        alert(response.data.message || '删除失败');
      }
    } catch (error) {
      console.error('删除维度失败:', error);
      alert('删除失败，请稍后重试');
    }
  };

  // 打开编辑视图（新建或编辑）
  const handleOpenEditView = (dimension) => {
    if (dimension) {
      // 编辑现有维度
      setEditingDimension(dimension);
      setEditForm({ name: dimension.name, description: dimension.description || '' });
    } else {
      // 新建维度
      setEditingDimension(null);
      setEditForm({ name: '', description: '' });
    }
    setFloatPanelView(dimension?.userId > 0 ? 'edit' : 'create');
    setViewingDimension(null);
  };

  // ========== 维度分析相关函数结束 ==========

  // 从 sessionStorage 或 URL 参数读取对话ID或初始查询（仅执行一次）
  useEffect(() => {
    // 防止重复初始化
    if (hasInitializedFromURLRef.current) {
      return;
    }

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
          hasInitializedFromURLRef.current = true; // 标记已初始化
          handleSelectConversation(urlConversationId);
        }
      } else {
        // 对话不存在，重定向到首页
        hasInitializedFromURLRef.current = true; // 标记已初始化
        logger.log(`Conversation ${urlConversationId} not found, redirecting to home`);
        navigate('/');
      }
    } else if (storedQuery && isAuthenticated && messages.length === 0 && !urlConversationId && !currentConversationId) {
      // 有存储的查询且没有对话ID，执行搜索（从首页跳转过来的情况）
      hasInitializedFromURLRef.current = true; // 标记已初始化
      setSearchQuery(storedQuery);
      setLoading(true); // 显示 loading 状态
      // 立即清除存储的查询，防止 useEffect 重复触发时再次执行搜索
      clearSearchQuery();
      setTimeout(() => {
        handleInitialSearch(storedQuery);
      }, 100);
    } else if (!urlConversationId && !storedQuery && isAuthenticated && !authLoading && !loading && !currentConversationId) {
      // 没有 conversationId 也没有存储的查询，且不在加载中，重定向到首页
      hasInitializedFromURLRef.current = true; // 标记已初始化
      logger.log('No conversationId and no stored query, redirecting to home');
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
      logger.error('Failed to load follow-up questions:', error);
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

  // 记录上一次的消息数量，用于判断是新增消息还是更新消息
  const prevMessageCountRef = useRef(0);

  // 当消息列表变化时，自动展开最新的问答卡片
  useEffect(() => {
    // 计算问答对数量
    const qaCount = Math.ceil(messages.filter(m => m.role === 'user').length);
    logger.log('[DEBUG-SCROLL] messages.length effect 触发, qaCount:', qaCount, 'messages.length:', messages.length, 'prevCount:', prevMessageCountRef.current);
    if (qaCount > 0) {
      // 自动展开最新的问答卡片
      setExpandedQAIndex(qaCount - 1);
      
      // 记录消息数量变化
      const isNewMessage = messages.length > prevMessageCountRef.current;
      prevMessageCountRef.current = messages.length;
      
      // 注意：不再在这里触发 scrollIntoView，因为它会把 section 滚动到顶部
      // 滚动逻辑统一由 scrollToBottom 处理
      if (isNewMessage) {
        logger.log('[DEBUG-SCROLL] 新增消息，由 scrollToBottom 处理滚动');
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      logger.error('Failed to delete conversation:', error);
      alert('删除失败');
    }
  };

  const handleSelectConversation = async (conversationId, page = 1, pageSize = 20) => {
    const isInitialLoad = page === 1;
    
    if (isInitialLoad) {
      setLoading(true);
      setSearchQuery(''); // 清空搜索输入框
      setStreamingContent(''); // 切换对话时清空流式内容
      setPaperSets([]); // 清空论文集合
      isLoadingHistoryRef.current = true; // 标记正在加载历史对话
    } else {
      // 加载更多时，记录当前滚动高度
      if (qaSnapContainerRef.current) {
        prevScrollHeightRef.current = qaSnapContainerRef.current.scrollHeight;
      }
      setMessagePagination(prev => ({ ...prev, isLoadingMore: true }));
    }

    try {
      const response = await conversationAPI.getConversation(conversationId, page, pageSize);
      if (response.data.code === 0 && response.data.data) {
        const conv = response.data.data;
        
        if (isInitialLoad) {
          setCurrentConversationId(conv.id);
        }
        
        // 更新分页状态
        setMessagePagination({
          page: conv.page || page,
          pageSize: conv.page_size || pageSize,
          total: conv.total || 0,
          hasMore: conv.has_more || false,
          isLoadingMore: false,
        });
        
        // 重新组织消息顺序，使用parent_message_id建立问答对
        const organizedMessages = organizeMessagesByParentId(conv.messages || []);
        
        if (isInitialLoad) {
          // 初始加载：替换消息
          setMessages(organizedMessages);
        } else {
          // 加载更多：将历史消息添加到前面
          setMessages(prev => [...organizedMessages, ...prev]);
        }

        // 查找所有有论文结果的消息，构建 paperSets（懒加载模式）
        // 支持新格式 (search_paper_ids) 和旧格式 (search_results)
        const messagesWithPapers = organizedMessages.filter(
          m => m.role === 'user' && (
            (m.search_paper_ids && m.search_paper_ids.length > 0) ||
            (m.search_results && m.search_results.length > 0)
          )
        );

        if (messagesWithPapers.length > 0) {
          // 构建 paperSets 元数据（不立即获取论文详情）
          const sets = messagesWithPapers.map((msg, index) => {
            const hasNewFormat = msg.search_paper_ids && msg.search_paper_ids.length > 0;
            const hasOldFormat = msg.search_results && msg.search_results.length > 0;
            
            return {
              title: index === messagesWithPapers.length - 1 ? '最新搜索' : `搜索 ${index + 1}`,
              papers: hasOldFormat ? msg.search_results : [], // 旧格式直接有数据，新格式为空
              paperIds: hasNewFormat ? msg.search_paper_ids : [], // 新格式存储IDs用于懒加载
              total: msg.search_results_total || (hasOldFormat ? msg.search_results.length : msg.search_paper_ids?.length || 0),
              query: msg.search_query,
              isLoaded: hasOldFormat, // 旧格式已加载，新格式需要懒加载
              isLoading: false
            };
          });

          const reversedSets = sets.reverse();
          
          // 只加载最新一个问答的论文（索引0是最新的）
          const latestSet = reversedSets[0];
          if (latestSet.isLoaded) {
            // 旧格式：直接使用
            setPaperSets(reversedSets);
            setPapers(latestSet.papers);
            setPapersTotal(latestSet.total);
          } else if (latestSet.paperIds && latestSet.paperIds.length > 0) {
            // 新格式：只加载最新问答的论文
            // 先标记为正在加载，防止重复请求
            reversedSets[0] = { ...reversedSets[0], isLoading: true };
            setPaperSets(reversedSets);
            
            logger.log(`History: Loading papers for latest QA (${latestSet.paperIds.length} papers)`);
            try {
              const response = await publicScholarAPI.getPaperBatch(latestSet.paperIds, PAPER_FIELDS);
              if (response.data.code === 0 && response.data.data) {
                const loadedPapers = response.data.data || [];
                setPapers(loadedPapers);
                setPapersTotal(latestSet.total);
                // 更新 paperSets 中的数据，标记为已加载
                setPaperSets(prev => prev.map((set, idx) => 
                  idx === 0 ? { ...set, papers: loadedPapers, isLoaded: true, isLoading: false } : set
                ));
              }
            } catch (err) {
              logger.error('Failed to fetch paper details for latest QA:', err);
              // 加载失败，重置加载状态
              setPaperSets(prev => prev.map((set, idx) => 
                idx === 0 ? { ...set, isLoading: false } : set
              ));
            }
          } else {
            setPaperSets(reversedSets);
            setPapers([]);
            setPapersTotal(0);
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
      logger.error('Failed to load conversation:', error);
      if (isInitialLoad) {
        alert('加载对话失败');
      }
    } finally {
      if (isInitialLoad) {
        setLoading(false);
        isLoadingHistoryRef.current = false; // 标记加载完成
        // 初始加载完成后，滚动到底部显示最新消息
        // 使用 requestAnimationFrame 确保 DOM 已更新
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            logger.log('[DEBUG-SCROLL] 历史对话加载完成，滚动到底部');
            scrollToBottom('auto');
          });
        });
      } else {
        setMessagePagination(prev => ({ ...prev, isLoadingMore: false }));
        // 加载更多后，保持滚动位置
        setTimeout(() => {
          if (qaSnapContainerRef.current && prevScrollHeightRef.current) {
            const newScrollHeight = qaSnapContainerRef.current.scrollHeight;
            const scrollDiff = newScrollHeight - prevScrollHeightRef.current;
            qaSnapContainerRef.current.scrollTop = scrollDiff;
            logger.log('[DEBUG-SCROLL] 加载更多完成，调整滚动位置:', scrollDiff);
          }
        }, 100);
      }
    }
  };
  
  // 加载更多历史消息
  const loadMoreMessages = async () => {
    if (!currentConversationId || messagePagination.isLoadingMore || !messagePagination.hasMore) {
      return;
    }
    const nextPage = messagePagination.page + 1;
    logger.log('[DEBUG-SCROLL] 加载更多历史消息, page:', nextPage);
    await handleSelectConversation(currentConversationId, nextPage, messagePagination.pageSize);
  };

  const handleInitialSearch = async (query) => {
    if (!query.trim()) return;

    // 检查是否登录，未登录则弹出登录弹窗
    if (!isAuthenticated) {
      setShowAuthModal(true);
      return;
    }

    // 根据模型级别确定业务类型
    const getBizType = (level) => {
      switch (level) {
        case 'mid': return 'smart_analysis_mid';
        case 'high': return 'smart_analysis_high';
        default: return 'smart_analysis_low';
      }
    };

    // 先检查余额是否充足
    try {
      const checkResult = await walletAPI.checkBalanceByBizType(getBizType(modelLevel));
      if (checkResult.data.code === 0 && checkResult.data.data) {
        if (!checkResult.data.data.sufficient) {
          // 余额不足，显示弹窗
          setBalanceError({
            balance: checkResult.data.data.balance || 0,
            required: checkResult.data.data.required || 0,
            shortage: checkResult.data.data.shortage || 0,
            alreadyDeducted: 0
          });
          setShowBalanceModal(true);
          return;
        }
      }
    } catch (error) {
      logger.error('Failed to check balance:', error);
      // 检查失败时继续执行，让后端处理
    }

    const userMessage = query.trim();

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
      let conversationId = currentConversationId;

      if (!conversationId) {
        const createResponse = await conversationAPI.createConversation(
          userMessage.length > 50 ? userMessage.substring(0, 50) + '...' : userMessage,
          'search'
        );
        if (createResponse.data.code === 0 && createResponse.data.data) {
          conversationId = createResponse.data.data.id;
          setCurrentConversationId(conversationId);
          // useEffect 会在 currentConversationId 变化时自动刷新对话列表
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
      logger.error('Search failed:', error);
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
      logger.error('No auth token found');
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
          // 检查余额不足错误 (code 4020)
          if (data.code === 4020 || data.message?.includes('经费不足')) {
            eventSource.close();
            setIsStreaming(false);
            setShowAIThinking(false);
            setLoading(false);
            
            // 删除刚添加的用户消息
            setMessages(prev => prev.filter(msg => msg.id !== messageId));
            
            // 移除添加的论文集合占位符
            setPaperSets(prevSets => prevSets.slice(1));
            
            // 显示经费不足弹窗
            setBalanceError({
              balance: data.data?.balance || 0,
              required: data.data?.required || 0,
              shortage: data.data?.shortage || 0,
              alreadyDeducted: 0
            });
            setShowBalanceModal(true);
            return;
          }
          // 兼容旧的配额不足错误
          if (data.code === 403 || data.message?.includes('配额不足')) {
            eventSource.close();
            setIsStreaming(false);
            setShowAIThinking(false);
            setLoading(false);
            
            // 删除刚添加的用户消息
            setMessages(prev => prev.filter(msg => msg.id !== messageId));
            
            // 移除添加的论文集合占位符
            setPaperSets(prevSets => prevSets.slice(1));
            
            // 显示经费不足弹窗
            setBalanceError({
              balance: 0,
              required: 0,
              shortage: 0,
              alreadyDeducted: 0
            });
            setShowBalanceModal(true);
            return;
          }
        } catch (e) {
          // 如果不是JSON格式，继续正常处理
        }
      }
      
      if (event.data.startsWith('[DONE]')) {
        logger.log('Advanced search completed, raw data:', event.data);
        eventSource.close();

        // 解析扣费金额
        // 格式: [DONE] {"deducted_amount": 10}
        let deductedAmount = 0;
        try {
          const doneData = event.data.substring(6).trim(); // Remove '[DONE] ' prefix
          logger.log('DONE data after trim:', doneData);
          if (doneData) {
            const parsed = JSON.parse(doneData);
            logger.log('Parsed DONE data:', parsed);
            deductedAmount = parsed.deducted_amount || 0;
          }
        } catch (e) {
          logger.error('Failed to parse DONE data:', e);
        }

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
        
        // 刷新对话列表以获取最新标题
        loadConversations();
        
        // 显示扣费提示 toast
        logger.log('Deducted amount:', deductedAmount);
        if (deductedAmount > 0) {
          logger.log('Emitting toast for deduction');
          wsClient.emit('toast', {
            title: '扣费提醒',
            content: `本次分析消耗 ${deductedAmount} 经费`,
            category: 'transaction',
            created_at: new Date().toISOString()
          });
        }
        return;
      }

      if (event.data.startsWith('[ERROR]')) {
        const errorMsg = event.data.substring(7).trim(); // Remove '[ERROR]' prefix
        logger.error('Advanced search error:', errorMsg);
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
              logger.error('Failed to fetch paper details:', err);
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
          logger.error('Failed to parse papers data:', err);
        }
        return;
      }

      if (event.data.startsWith('[TITLE]')) {
        // Handle title update event
        try {
          const titleData = JSON.parse(event.data.substring(7));
          const newTitle = titleData.title;
          logger.log('Received title update:', newTitle);
          
          // Update conversations list with new title
          setConversations(prev => prev.map(c => 
            c.id === convId ? { ...c, title: newTitle } : c
          ));
        } catch (err) {
          logger.error('Failed to parse title data:', err);
        }
        return;
      }

      if (event.data.startsWith('[FOLLOW_UP_QUESTIONS]')) {
        // Handle follow-up questions (non-streaming, all at once)
        try {
          const followUpQuestions = event.data.substring(21); // Remove '[FOLLOW_UP_QUESTIONS]' prefix
          logger.log('Received follow-up questions:', followUpQuestions);

          // Extract questions from the content - 结果通过 updateLastAssistantMessage 更新到消息中
          extractSuggestedQuestions(followUpQuestions);
        } catch (err) {
          logger.error('Failed to parse follow-up questions:', err);
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
        logger.error('Failed to parse SSE data:', err);
      }
    };

    eventSource.onerror = (err) => {
      logger.error('SSE error:', err);
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

  // Main advanced search interface - 简化容器嵌套
  return (
    <div className="as-results-layout search-results-page ai-search-view-embedded">
      {/* 顶部导航栏 + 主内容区 */}
      <div className="results-layout">
        {/* 顶部导航栏 */}
        <div className="results-search-header ai-results-header">
          {/* 左侧 Logo - 垂直居中 */}
          <div className="results-logo" onClick={() => navigate('/')}>
            <span className="results-logo-text">Scholay</span>
          </div>
          
          {/* 标题区域 - 紧邻Logo，垂直居中 */}
          <div className="ai-header-title-area">
            {currentConversationTitle ? (
              <h1 className="ai-conversation-title">{currentConversationTitle}</h1>
            ) : (
              <h1 className="ai-conversation-title ai-title-default">智能分析</h1>
            )}
          </div>
        </div>

        {/* 主内容区 - 两栏布局：论文列表 + AI聊天 */}
        <div className="results-main ai-results-main">
                {/* 左侧：论文列表容器 - 复用学术检索样式 */}
                <div className={`papers-container ${selectedDimensions.length > 0 ? 'has-analysis has-collapsed-panel' : ''}`} ref={papersContainerRef}>
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
                    onCite={(paper) => setCitePaper(paper)}
                    // 维度分析相关 props
                    selectedDimensions={selectedDimensions}
                    analysisResults={analysisResults}
                    analyzingPapers={analyzingPapers}
                    getDimensionKey={getDimensionKey}
                    onDimensionRemove={handleDimensionToggle}
                  />
                  
                  {/* 右侧悬浮面板 - AI 分析维度入口 */}
                  {papers.length > 0 && (
                    <div 
                      className={`dimension-float-panel ${selectedDimensions.length > 0 && !floatPanelExpanded ? 'collapsed' : ''} ${floatPanelExpanded ? 'expanded' : ''}`}
                      onMouseEnter={() => setFloatPanelExpanded(true)}
                      onMouseLeave={() => setFloatPanelExpanded(false)}
                    >
                      {/* 收起状态的侧边标签 */}
                      <div className="dimension-float-collapsed-tab">
                        <span>智能矩阵分析</span>
                      </div>
                      {/* 展开状态的完整内容 */}
                      <div className="dimension-float-content">
                        {floatPanelView === 'list' && (
                          <>
                            {/* 列表视图 - 与学术检索页面保持一致 */}
                            <div className="dimension-float-header">
                              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M12 2L2 7l10 5 10-5-10-5z"/>
                                <path d="M2 17l10 5 10-5"/>
                                <path d="M2 12l10 5 10-5"/>
                              </svg>
                              <span>智能矩阵分析</span>
                            </div>
                            <p className="dimension-float-desc">
                              点击维度标签，AI 将从不同角度分析论文
                            </p>
                            <div className="dimension-float-tags">
                              {dimensions.map(dim => {
                                const isSelected = selectedDimensions.some(s => getDimensionKey(s) === getDimensionKey(dim));
                                const isCustom = dim.userId > 0;
                                return (
                                  <div key={getDimensionKey(dim)} className={`dimension-tag-row ${isCustom ? 'custom' : ''}`}>
                                    <button
                                      className={`dimension-tag-btn ${isSelected ? 'selected' : ''} ${isCustom ? 'custom' : ''}`}
                                      onClick={() => handleDimensionToggle(dim)}
                                      title={isSelected ? `点击移除 ${dim.name}` : dim.description}
                                    >
                                      {isSelected && (
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                                          <polyline points="20 6 9 17 4 12"/>
                                        </svg>
                                      )}
                                      <span className="dimension-tag-name">{dim.name}</span>
                                    </button>
                                    <div className="dimension-tag-actions">
                                      <button
                                        className="dimension-tag-action-btn"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setViewingDimension(dim);
                                          setFloatPanelView('detail');
                                        }}
                                        title="查看维度详情"
                                      >
                                        详情
                                      </button>
                                      <button
                                        className="dimension-tag-action-btn"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleOpenEditView(dim);
                                        }}
                                        title={isCustom ? "编辑维度" : "自定义此维度"}
                                      >
                                        修改
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                            {/* 底部统计和新增按钮 */}
                            <div className="dimension-float-footer">
                              <div className="dimension-float-stats">
                                已选 {selectedDimensions.length} / 共 {dimensions.length} 个
                                {dimensions.filter(d => d.userId > 0).length > 0 && (
                                  <span className="custom-count">（自定义 {dimensions.filter(d => d.userId > 0).length} 个）</span>
                                )}
                              </div>
                              <button 
                                className="dimension-add-btn"
                                onClick={() => handleOpenEditView(null)}
                              >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <line x1="12" y1="5" x2="12" y2="19"/>
                                  <line x1="5" y1="12" x2="19" y2="12"/>
                                </svg>
                                新增
                              </button>
                            </div>
                          </>
                        )}

                        {floatPanelView === 'detail' && viewingDimension && (
                          <>
                            {/* 详情视图 */}
                            <div className="dimension-detail-header">
                              <button 
                                className="dimension-detail-back"
                                onClick={() => {
                                  setFloatPanelView('list');
                                  setViewingDimension(null);
                                }}
                              >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <polyline points="15 18 9 12 15 6"/>
                                </svg>
                                返回
                              </button>
                              <div className="dimension-detail-title-wrapper">
                                <span className="dimension-detail-title">{viewingDimension?.name}</span>
                                {viewingDimension?.userId > 0 ? (
                                  <span className="custom-badge small">自定义</span>
                                ) : (
                                  <span className="system-badge small">系统</span>
                                )}
                              </div>
                            </div>
                            <div className="dimension-detail-content">
                              <div className="dimension-detail-section">
                                <div className="dimension-detail-label">分析提示词</div>
                                <div className="dimension-detail-value">
                                  {viewingDimension?.description || '使用默认分析逻辑'}
                                </div>
                              </div>
                            </div>
                            <div className="dimension-detail-actions">
                              <button 
                                className="dimension-action-btn edit"
                                onClick={() => handleOpenEditView(viewingDimension)}
                              >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                                </svg>
                                {viewingDimension?.userId > 0 ? '编辑' : '自定义'}
                              </button>
                              {viewingDimension?.userId > 0 && (
                                <button 
                                  className="dimension-action-btn delete"
                                  onClick={() => handleDeleteDimension(viewingDimension)}
                                >
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <polyline points="3 6 5 6 21 6"/>
                                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                                  </svg>
                                  删除
                                </button>
                              )}
                            </div>
                          </>
                        )}
                        
                        {(floatPanelView === 'create' || floatPanelView === 'edit') && (
                          <>
                            {/* 编辑/新增视图 - 与学术检索页面保持一致 */}
                            <div className="dimension-detail-header">
                              <button 
                                className="dimension-detail-back"
                                onClick={() => {
                                  setFloatPanelView('list');
                                  setEditingDimension(null);
                                }}
                              >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <polyline points="15 18 9 12 15 6"/>
                                </svg>
                                返回
                              </button>
                              <span className="dimension-detail-title">
                                {editingDimension ? '编辑维度' : '新增维度'}
                              </span>
                            </div>
                            <div className="dimension-edit-form">
                              <div className="dimension-form-group">
                                <label className="dimension-form-label">维度名称</label>
                                <input
                                  type="text"
                                  className="dimension-form-input"
                                  placeholder="输入维度名称..."
                                  value={editForm.name}
                                  onChange={(e) => setEditForm(prev => ({ ...prev, name: e.target.value }))}
                                  maxLength={50}
                                />
                              </div>
                              <div className="dimension-form-group">
                                <label className="dimension-form-label">分析指令</label>
                                <textarea
                                  className="dimension-form-textarea"
                                  placeholder="输入 AI 分析时使用的指令..."
                                  value={editForm.description}
                                  onChange={(e) => setEditForm(prev => ({ ...prev, description: e.target.value }))}
                                  rows={5}
                                />
                              </div>
                            </div>
                            <div className="dimension-edit-actions">
                              <button 
                                className="dimension-action-btn cancel"
                                onClick={() => {
                                  setFloatPanelView('list');
                                  setEditingDimension(null);
                                }}
                              >
                                取消
                              </button>
                              <button 
                                className="dimension-action-btn save"
                                onClick={handleSaveDimension}
                                disabled={!editForm.name.trim() || !editForm.description.trim()}
                              >
                                保存
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>

              {/* 右侧：AI聊天区域 */}
              <div className="ai-chat-panel">
                {/* 对话面板顶部操作栏 - 紧凑版 */}
                <div className="ai-chat-header ai-chat-header-compact">
                  {/* 新建对话按钮 */}
                  <button className="ai-header-icon-btn" onClick={handleNewConversation} title="新建对话">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 5v14M5 12h14" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>
                  
                  {/* 历史记录按钮 */}
                  <AIHistoryDropdown
                    conversations={conversations}
                    currentConversationId={currentConversationId}
                    onSelectConversation={handleSelectConversation}
                    onDeleteConversation={handleDeleteConversation}
                    onNewConversation={handleNewConversation}
                    loading={conversationsLoading}
                    iconOnly={true}
                  />
                </div>


                {/* 问答滚动容器 - 使用 scroll-snap 实现丝滑切换 */}
                <div 
                  className={`qa-snap-container ${isStreaming || disableSnapTemporarily ? 'streaming' : ''}`}
                  ref={qaSnapContainerRef}
                  onScroll={handleQAContainerScroll}
                >
                  {/* 加载历史对话时显示 loading */}
                  {loading && qaList.length === 0 && currentConversationId ? (
                    <div className="qa-section">
                      <div className="qa-loading-state">
                        <div className="qa-loading-spinner"></div>
                        <p>加载对话中...</p>
                      </div>
                    </div>
                  ) : qaList.length === 0 ? (
                    <div className="qa-section">
                      <div className="qa-empty-state">
                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                        </svg>
                        <p>输入问题开始智能分析</p>
                      </div>
                    </div>
                  ) : (
                    <>
                      {/* 加载更多历史消息指示器 */}
                      {messagePagination.hasMore && (
                        <div className="qa-load-more-indicator">
                          {messagePagination.isLoadingMore ? (
                            <div className="qa-loading-more">
                              <div className="loading-spinner-small"></div>
                              <span>加载历史消息...</span>
                            </div>
                          ) : (
                            <button 
                              className="qa-load-more-btn"
                              onClick={loadMoreMessages}
                            >
                              ↑ 加载更早的消息
                            </button>
                          )}
                        </div>
                      )}
                      {qaList.map((qa, index) => (
                      <div 
                        key={qa.messageId || index} 
                        className={`qa-section ${index === expandedQAIndex ? 'active' : ''}`}
                      >
                        {/* 问题卡片 - 悬浮效果 */}
                        <div className="qa-question-wrapper">
                          <div className={`qa-current-question ${index > 0 ? 'has-prev' : ''}`}>
                            <div className="qa-question-text">
                              {qa.question}
                              {/* 第一个问题显示"来自学术检索"标签 */}
                              {index === 0 && fromAcademicSearch && (
                                <span className="from-search-badge">
                                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <circle cx="11" cy="11" r="8"/>
                                    <path d="M21 21l-4.35-4.35"/>
                                  </svg>
                                  来自学术检索
                                </span>
                              )}
                            </div>
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
                    ))}
                    </>
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
      
      {/* 引用弹窗 */}
      {citePaper && (
        <CiteModal
          paper={citePaper}
          onClose={() => setCitePaper(null)}
        />
      )}
      
      {/* 经费不足弹窗 */}
      <InsufficientBalanceModal
        isOpen={showBalanceModal}
        onClose={() => {
          setShowBalanceModal(false);
          setBalanceError(null);
          // 重置中止标记，允许用户充值后继续
          analysisAbortedRef.current = false;
        }}
        balance={balanceError?.balance || 0}
        required={balanceError?.required || 0}
        shortage={balanceError?.shortage || 0}
        alreadyDeducted={balanceError?.alreadyDeducted || 0}
      />
    </div>
  );
};

export default AISearchView;
