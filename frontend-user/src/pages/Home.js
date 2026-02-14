/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 */

import React, { useState, useRef, useEffect, lazy, Suspense, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../utils/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import SearchFilters from '../components/SearchFilters';
import ModelSelector from '../components/ModelSelector';
import MobileHelpModal from '../components/MobileHelpModal';
import SearchSuggestions from '../components/SearchSuggestions';
import MessageModal from '../components/MessageModal';
import { NormalSearchIcon, AdvancedSearchIcon } from '../components/SearchIcons';
import SEO from '../components/SEO';
import { generateFAQSchema } from '../utils/seoHelpers';
// 注：使用追踪已移至 API 调用层，首页无需重复追踪
import { prepareSearchNavigation, preparePaperNavigation, prepareAuthorNavigation } from '../utils/searchStorage';
import { userAPI } from '../services/api';
import './styles/home/index.css';

// 懒加载 AuthModal - 只在需要时加载
const AuthModal = lazy(() => import('../components/AuthModal'));

const Home = () => {
  const navigate = useNavigate();
  const { isAuthenticated, user } = useAuth();
  useTheme(); // 确保主题 context 可用
  
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [kickedMessage, setKickedMessage] = useState(null); // 被踢出提示
  const [searchMode, setSearchMode] = useState('normal'); // 'normal' or 'advanced'
  const [showFilters, setShowFilters] = useState(false); // 显示筛选条件
  const [modelLevel, setModelLevel] = useState('low'); // 'low', 'mid', 'high' - 默认普通模型
  const [filters, setFilters] = useState({
    yearFrom: '',
    yearTo: '',
    publicationTypes: [],
    fieldsOfStudy: [],
    openAccessPdf: '',
    venue: '',
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false); // 搜索建议下拉框
  const textareaRef = useRef(null);
  const composerRef = useRef(null); // 用于定位搜索建议下拉框
  const [isComposing, setIsComposing] = useState(false); // 跟踪输入法状态
  
  // 任务历史状态
  const [taskHistory, setTaskHistory] = useState([]);
  const [taskHistoryLoading, setTaskHistoryLoading] = useState(false);

  // Typewriter effect for welcome title
  // 静态标语（保留供将来使用）
  // eslint-disable-next-line no-unused-vars
  const sloganText = '科研者的瑞士军刀';

  // Placeholder examples carousel
  const [currentExampleIndex, setCurrentExampleIndex] = useState(0);
  
  // 搜索示例数据 - 覆盖多个学科领域
  const searchExamples = {
    normal: [
      '搜索论文标题、作者、关键词...',                                    // 说明文字
      '示例：深度学习在医学影像诊断中的应用',                             // 计算机+医学
      '示例：量子纠缠在量子通信中的研究',                                 // 物理学
      '示例：CRISPR基因编辑技术的伦理问题',                              // 生物+伦理
      '示例：碳纳米管在新能源电池中的应用',                               // 材料+化学
      '示例：行为经济学对消费决策的影响',                                 // 经济学+心理学
      '示例：气候变化对海洋生态系统的影响',                               // 环境+生态
      '示例：人工智能在药物研发中的应用',                                 // AI+医药
      '示例：区块链技术在供应链管理中的创新',                             // 计算机+管理
      '示例：纳米机器人在精准医疗中的前景',                               // 工程+医学
      '示例：社交媒体对青少年心理健康的影响'                              // 社会学+心理学
    ],
    advanced: [
      '用自然语言描述研究需求，AI 智能解析并搜索...',                      // 说明文字
      '示例：帮我找一些关于肿瘤免疫治疗最新突破的高引用论文',              // 医学
      '示例：我想了解拓扑量子计算在容错量子计算中的应用研究',              // 物理+计算机
      '示例：寻找关于可持续城市发展和智慧城市建设的综述文章',              // 城市规划+工程
      '示例：推荐一些讨论人工智能在金融风险预测中的机器学习方法',          // 金融+AI
      '示例：我需要了解石墨烯在光电器件中的最新应用进展',                  // 材料+物理
      '示例：帮我找关于神经退行性疾病发病机制的前沿研究',                  // 神经科学+医学
      '示例：想看看生物降解塑料材料的环境友好型设计研究',                  // 环境+化学
      '示例：寻找探讨社会不平等对教育机会影响的实证研究',                  // 社会学+教育
      '示例：推荐一些关于合成生物学在生物制造中的应用论文',                // 生物+工程
      '示例：我想研究脑机接口技术在神经康复中的临床应用'                   // 神经科学+工程
    ]
  };

  // 搜索示例轮播效果
  useEffect(() => {
    const currentExamples = searchExamples[searchMode];
    const interval = setInterval(() => {
      setCurrentExampleIndex((prevIndex) => (prevIndex + 1) % currentExamples.length);
    }, 3000); // 每3秒切换一次

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchMode]); // 当searchMode变化时重新开始轮播

  // 当切换搜索模式时，重置示例索引
  useEffect(() => {
    setCurrentExampleIndex(0);
  }, [searchMode]);

  // 检查是否有被踢出的消息
  useEffect(() => {
    const message = sessionStorage.getItem('auth_kicked_message');
    if (message) {
      setKickedMessage(message);
      sessionStorage.removeItem('auth_kicked_message');
    }
  }, []);

  // 加载任务历史（仅登录用户）- 按天分组，最近3天，每天最多20条
  const loadTaskHistory = useCallback(async () => {
    if (!isAuthenticated) {
      setTaskHistory([]);
      return;
    }
    
    setTaskHistoryLoading(true);
    try {
      const response = await userAPI.getTaskHistory(3, 20);
      if (response.data?.code === 0 && response.data?.data?.groups) {
        // 后端已经按天分组返回
        setTaskHistory(response.data.data.groups);
      }
    } catch (error) {
      console.error('Failed to load task history:', error);
      setTaskHistory([]);
    } finally {
      setTaskHistoryLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    loadTaskHistory();
  }, [loadTaskHistory]);

  const handleLoginSuccess = () => {
    setShowAuthModal(false);
    // 登录成功后重新加载任务历史
    loadTaskHistory();
  };

  // 点击任务历史项
  const handleTaskHistoryClick = (item) => {
    if (item.type === 'smart_analysis') {
      // 跳转到智能分析页面
      navigate(`/search-results?mode=ai&conversationId=${item.id}`);
    } else if (item.type === 'peer_review') {
      // 跳转到智能审稿页面
      navigate(`/peer-review?taskId=${item.id}`);
    }
  };

  // 格式化时间（用于卡片内显示）
  const formatTime = (timeStr) => {
    const date = new Date(timeStr);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 1) return '刚刚';
    if (diffMins < 60) return `${diffMins}分钟前`;
    if (diffHours < 24) return `${diffHours}小时前`;
    if (diffDays < 7) return `${diffDays}天前`;
    
    return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
  };

  // 展开状态管理
  const [expandedDays, setExpandedDays] = useState({});
  
  // 切换某天的展开状态
  const toggleDayExpanded = (dayLabel) => {
    setExpandedDays(prev => ({
      ...prev,
      [dayLabel]: !prev[dayLabel]
    }));
  };

  // 获取任务状态标签
  const getStatusLabel = (status) => {
    const statusMap = {
      'completed': { text: '已完成', className: 'status-completed' },
      'processing': { text: '进行中', className: 'status-processing' },
      'pending': { text: '等待中', className: 'status-pending' },
      'failed': { text: '失败', className: 'status-failed' },
    };
    return statusMap[status] || { text: status, className: '' };
  };

  // 处理选择论文建议
  const handleSelectPaper = (paper) => {
    // 使用论文标题作为搜索查询
    const title = paper.title || '';
    const paperId = paper.id || '';
    setSearchQuery(title);
    setShowSuggestions(false);
    // 跳转到搜索结果页面，并带上 paperId 以显示论文详情
    const targetUrl = preparePaperNavigation(paperId, title);
    navigate(targetUrl);
  };

  // 处理选择作者建议
  const handleSelectAuthor = (author) => {
    // 使用作者名字作为搜索查询
    const name = author.name || '';
    const authorId = author.authorId || '';
    setSearchQuery(name);
    setShowSuggestions(false);
    // 跳转到搜索结果页面，并带上 authorId 以显示作者详情
    const targetUrl = prepareAuthorNavigation(authorId, name);
    navigate(targetUrl);
  };

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    const userMessage = searchQuery.trim();

    // 学术检索模式：允许未登录用户使用
    if (searchMode === 'normal') {
      // 使用 sessionStorage 存储搜索参数
      const targetUrl = prepareSearchNavigation({
        query: userMessage,
        filters: filters,
        mode: 'normal'
      });

      navigate(targetUrl);
      return;
    }

    // 智能分析模式：需要登录才能使用
    if (searchMode === 'advanced') {
      // Check if user is authenticated
      if (!isAuthenticated) {
        setShowAuthModal(true);
        return;
      }

      // 使用 sessionStorage 存储搜索参数
      const targetUrl = prepareSearchNavigation({
        query: userMessage,
        mode: 'ai',
        modelLevel: modelLevel
      });

      navigate(targetUrl);
      return;
    }
  };

  // FAQ 展开状态
  const [expandedFaq, setExpandedFaq] = useState(null);
  
  // 底部 Tab 切换状态
  const [activeTab, setActiveTab] = useState('features');

  // FAQ数据用于结构化数据和页面展示
  const faqData = [
    {
      question: '什么是Scholay学术搜索平台？',
      answer: 'Scholay是一个AI驱动的学术搜索平台，提供智能文献检索、论文分析、引用图谱可视化等功能，帮助研究人员快速找到高质量学术资源。'
    },
    {
      question: 'Scholay支持哪些搜索模式？',
      answer: 'Scholay支持学术检索和智能分析两种模式。学术检索可以快速检索论文标题、作者和关键词；智能分析使用AI智能理解并解析您的研究需求，提供更精准的结果。'
    },
    {
      question: 'Scholay的数据来源是什么？',
      answer: 'Scholay的学术数据来自于互联网公开数据，覆盖计算机科学、生物医学等多个学科领域的学术论文。'
    },
    {
      question: 'Scholay是免费的吗？',
      answer: '是的，Scholay提供免费的基础功能，包括学术检索、论文详情查看等。高级功能如智能分析、智能审稿等可能需要订阅会员。'
    },
    {
      question: '如何使用智能助手功能？',
      answer: '登录后，点击首页的"智能助手"卡片即可进入。您可以向AI提问任何学术相关问题，它会基于学术文献为您提供专业解答。'
    }
  ];

  // Main search interface
  return (
    <div className="home-search">
      <SEO
        title="Scholay - AI驱动的学术搜索平台 | 智能文献检索与分析"
        description="Scholay是创新的学术搜索平台，提供AI驱动的文献检索、智能论文分析、引用图谱可视化等功能。支持学术检索和智能分析两种模式，帮助研究人员快速找到高质量学术资源，提升科研效率。"
        keywords="学术搜索,论文检索,文献查找,AI论文分析,学术资源,科研工具,Semantic Scholar,论文引用,学术数据库,研究助手,智能搜索"
        canonical="/"
        structuredData={generateFAQSchema(faqData)}
      />
      
      <div className="main-container">
        <div className="search-content">
          <div className="home-chat-container">
            <div className="welcome-screen">
              <div className="welcome-brand">
                <img src="/brand-logo.svg" alt="Scholay Logo" className="welcome-brand-logo" />
                <img src="/brand-text.svg" alt="Scholay" className="welcome-brand-text" />
                {/* 右侧空白占位，与Logo等宽，使文字视觉居中 */}
                <div className="welcome-brand-spacer" aria-hidden="true"></div>
              </div>
              <p className="welcome-tagline">AI驱动的学术搜索引擎 · 覆盖2亿+学术论文</p>
            </div>

            {/* 搜索模式切换 - 放在输入框外部上方 */}
            <div className="home-search-mode-header">
              <div className="home-search-mode-segmented">
                <button
                  type="button"
                  className={`mode-segment ${searchMode === 'normal' ? 'active' : ''}`}
                  onClick={() => setSearchMode('normal')}
                >
                  <span className="mode-segment-icon">
                    <NormalSearchIcon size={16} />
                  </span>
                  <span className="mode-segment-label">直接检索</span>
                </button>
                <button
                  type="button"
                  className={`mode-segment ${searchMode === 'advanced' ? 'active' : ''}`}
                  onClick={() => setSearchMode('advanced')}
                >
                  <span className="mode-segment-icon">
                    <AdvancedSearchIcon size={16} />
                  </span>
                  <span className="mode-segment-label">智能检索</span>
                </button>
              </div>
            </div>

            <form onSubmit={handleSearch} className="home-composer-wrapper" ref={composerRef}>
              {/* 输入区域 */}
              <div className="home-composer-input-area">
                    <textarea
                      ref={textareaRef}
                      className="home-chat-input"
                      placeholder={searchExamples[searchMode][currentExampleIndex]}
                      value={searchQuery}
                      maxLength={1000}
                      onChange={(e) => {
                        setSearchQuery(e.target.value);
                        // Auto-resize textarea
                        e.target.style.height = 'auto';
                        e.target.style.height = Math.min(e.target.scrollHeight, 200) + 'px';
                        // 学术检索模式下显示搜索建议
                        if (searchMode === 'normal' && e.target.value.trim().length >= 2) {
                          setShowSuggestions(true);
                        } else {
                          setShowSuggestions(false);
                        }
                      }}
                      onFocus={() => {
                        // 学术检索模式下，如果有输入内容则显示搜索建议
                        if (searchMode === 'normal' && searchQuery.trim().length >= 2) {
                          setShowSuggestions(true);
                        }
                      }}
                      onBlur={() => {
                        // 延迟关闭，以便点击建议项时不会立即关闭
                        setTimeout(() => setShowSuggestions(false), 200);
                      }}
                      onCompositionStart={() => setIsComposing(true)}
                      onCompositionEnd={() => setIsComposing(false)}
                      onKeyDown={(e) => {
                        // Submit on Enter, new line on Shift+Enter
                        // 但要避免在输入法输入过程中触发提交
                        if (e.key === 'Enter' && !e.shiftKey && !isComposing) {
                          e.preventDefault();
                          setShowSuggestions(false);
                          if (searchQuery.trim()) {
                            handleSearch(e);
                          }
                        }
                        // Escape 关闭搜索建议
                        if (e.key === 'Escape') {
                          setShowSuggestions(false);
                        }
                      }}
                      rows={1}
                    />
                    <button type="submit" className="btn-send" disabled={!searchQuery.trim()}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M5 12h14M12 5l7 7-7 7"/>
                      </svg>
                    </button>
                  </div>

              {/* 搜索建议下拉框 - 仅在学术检索模式下显示 */}
              {searchMode === 'normal' && (
                <SearchSuggestions
                  query={searchQuery}
                  onSelectPaper={handleSelectPaper}
                  onSelectAuthor={handleSelectAuthor}
                  onClose={() => setShowSuggestions(false)}
                  visible={showSuggestions}
                  inputRef={textareaRef}
                />
              )}

                  {/* 底部操作栏 */}
                  <div className="home-composer-footer">
                    <div className="home-composer-footer-left">

                      {/* 筛选按钮 - 仅在学术检索模式显示 */}
                      {searchMode === 'normal' && (() => {
                        const hasFilters = filters.yearFrom ||
                                         filters.yearTo ||
                                         filters.publicationTypes.length > 0 ||
                                         filters.fieldsOfStudy.length > 0 ||
                                         filters.openAccessPdf ||
                                         filters.venue;

                        const handleClearClick = (e) => {
                          e.stopPropagation();
                          setFilters({
                            yearFrom: '',
                            yearTo: '',
                            publicationTypes: [],
                            fieldsOfStudy: [],
                            openAccessPdf: '',
                            venue: '',
                          });
                        };

                        return (
                          <button
                            type="button"
                            className={`footer-btn filter-btn ${showFilters ? 'panel-open' : ''} ${hasFilters ? 'has-filters' : ''}`}
                            onClick={() => setShowFilters(!showFilters)}
                            onMouseEnter={(e) => e.currentTarget.classList.add('is-hovering')}
                            onMouseLeave={(e) => e.currentTarget.classList.remove('is-hovering')}
                            title={hasFilters ? "点击打开筛选" : "筛选条件"}
                          >
                            <div className="filter-icon-wrapper" onClick={(e) => {
                              if (hasFilters && e.currentTarget.parentElement.classList.contains('is-hovering')) {
                                e.stopPropagation();
                                handleClearClick(e);
                              }
                            }}>
                              <svg className="filter-icon" width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                                <path d="M2.5 3.75C2.5 3.19772 2.94772 2.75 3.5 2.75H16.5C17.0523 2.75 17.5 3.19772 17.5 3.75V5.25C17.5 5.51522 17.3946 5.76957 17.2071 5.95711L11.75 11.4142V16.25C11.75 16.6297 11.5085 16.9705 11.1522 17.1094L8.65217 18.1094C8.15522 18.3078 7.58333 17.9469 7.58333 17.4167V11.4142L2.79289 5.95711C2.60536 5.76957 2.5 5.51522 2.5 5.25V3.75Z"/>
                              </svg>
                              <svg className="clear-icon" width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                                <path d="M13.5355 5.46447C13.9261 5.85499 13.9261 6.48816 13.5355 6.87868L11.4142 9L13.5355 11.1213C13.9261 11.5118 13.9261 12.145 13.5355 12.5355C13.145 12.9261 12.5118 12.9261 12.1213 12.5355L10 10.4142L7.87868 12.5355C7.48816 12.9261 6.85499 12.9261 6.46447 12.5355C6.07394 12.145 6.07394 11.5118 6.46447 11.1213L8.58579 9L6.46447 6.87868C6.07394 6.48816 6.07394 5.85499 6.46447 5.46447C6.85499 5.07394 7.48816 5.07394 7.87868 5.46447L10 7.58579L12.1213 5.46447C12.5118 5.07394 13.145 5.07394 13.5355 5.46447Z"/>
                              </svg>
                            </div>
                            <span>筛选</span>
                          </button>
                        );
                      })()}

                      {/* 模型选择器 - 仅在智能分析模式显示 */}
                      {searchMode === 'advanced' && (
                        <div className="model-selector-wrapper">
                          <ModelSelector
                            value={modelLevel}
                            onChange={setModelLevel}
                            userSubscription={user?.subscription}
                            isAuthenticated={isAuthenticated}
                          />
                        </div>
                      )}
                    </div>
                  </div>
            </form>

            {/* 学术检索模式下的筛选条件 */}
            {searchMode === 'normal' && (
              <SearchFilters
                filters={filters}
                onFiltersChange={setFilters}
                isExpanded={showFilters}
                onToggle={() => setShowFilters(!showFilters)}
              />
            )}

            {/* 热门搜索标签 - 可点击快速搜索 */}
            <div className="home-hot-searches">
              <span className="home-hot-label">热门:</span>
              {['深度学习', '量子计算', 'CRISPR', '气候变化', 'GPT', '新能源'].map((tag) => (
                <button
                  key={tag}
                  className="home-hot-tag"
                  onClick={() => {
                    setSearchQuery(tag);
                    const targetUrl = prepareSearchNavigation({
                      query: tag,
                      filters: filters,
                      mode: 'normal'
                    });
                    navigate(targetUrl);
                  }}
                >
                  {tag}
                </button>
              ))}
            </div>

            {/* 精品AI工具快捷入口 - 在输入框下方 */}
            <div className="home-shortcuts-section">
              <h3 className="home-shortcuts-title">AI 工具</h3>
            </div>
            <div className="home-assistant-shortcuts">
              <div 
                className="home-shortcut-card"
                onClick={() => navigate('/latex-writer')}
              >
                <div className="home-shortcut-icon home-shortcut-icon-video">
                  <video
                    className="home-shortcut-video"
                    autoPlay
                    loop
                    muted
                    playsInline
                  >
                    <source src="https://cdn.openai.com/ctf-cdn/260126_Prism_Logo_SL_v04.mp4" type="video/mp4" />
                  </video>
                </div>
                <div className="home-shortcut-content">
                  <h4 className="home-shortcut-title">ScholayPrism</h4>
                  <p className="home-shortcut-desc">LaTeX 写作 + GPT-5.2</p>
                </div>
                <svg className="home-shortcut-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9 18l6-6-6-6"/>
                </svg>
              </div>

              <div 
                className="home-shortcut-card"
                onClick={() => navigate('/chat')}
              >
                <div className="home-shortcut-icon" style={{ background: 'linear-gradient(135deg, rgba(16, 163, 127, 0.15) 0%, rgba(16, 163, 127, 0.08) 100%)', color: '#10A37F' }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                  </svg>
                </div>
                <div className="home-shortcut-content">
                  <h4 className="home-shortcut-title">智能助手</h4>
                  <p className="home-shortcut-desc">有问题，交给智能助手！</p>
                </div>
                <svg className="home-shortcut-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9 18l6-6-6-6"/>
                </svg>
              </div>

              <div 
                className="home-shortcut-card"
                onClick={() => navigate('/peer-review')}
              >
                <div className="home-shortcut-icon" style={{ background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.15) 0%, rgba(99, 102, 241, 0.08) 100%)', color: '#6366f1' }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                    <path d="M12 18l-2.4-1.2L7 18v-4l2.6 1.3L12 14l2.4 1.3L17 14v4l-2.6-1.2L12 18z"/>
                  </svg>
                </div>
                <div className="home-shortcut-content">
                  <h4 className="home-shortcut-title">智能审稿</h4>
                  <p className="home-shortcut-desc">智能预审，明智之举！</p>
                </div>
                <svg className="home-shortcut-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9 18l6-6-6-6"/>
                </svg>
              </div>
            </div>
          </div>

          {/* 任务历史区域 - 按天分组，仅登录用户显示 */}
          {isAuthenticated && taskHistory.length > 0 && (
            <div className="home-task-history">
              <div className="home-task-history-header">
                <h3 className="home-task-history-title">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10"/>
                    <polyline points="12 6 12 12 16 14"/>
                  </svg>
                  最近任务
                </h3>
              </div>
              {taskHistoryLoading ? (
                <div className="home-task-history-loading">加载中...</div>
              ) : (
                <div className="home-task-timeline">
                  {taskHistory.map((dayGroup) => {
                    const { date: dayLabel, tasks, total } = dayGroup;
                    const isExpanded = expandedDays[dayLabel];
                    const maxVisible = 6; // 每行3个，两行共6个
                    const hasMore = tasks.length > maxVisible;
                    // 如果有更多任务且未展开，只显示5个，第6个位置留给展开按钮
                    const visibleTasks = isExpanded ? tasks : tasks.slice(0, hasMore ? maxVisible - 1 : maxVisible);
                    
                    return (
                      <div key={dayLabel} className="home-timeline-day">
                        <div className="home-timeline-day-header">
                          <span className="home-timeline-dot"></span>
                          <span className="home-timeline-day-label">{dayLabel}</span>
                          <span className="home-timeline-day-count">({total})</span>
                        </div>
                        <div className="home-timeline-cards-wrapper">
                          <div className={`home-timeline-cards ${isExpanded ? 'expanded' : ''}`}>
                            {visibleTasks.map((item) => {
                              const statusInfo = getStatusLabel(item.status);
                              return (
                                <div
                                  key={`${item.type}-${item.id}`}
                                  className="home-task-card"
                                  onClick={() => handleTaskHistoryClick(item)}
                                >
                                  <div className="home-task-card-header">
                                    <div className={`home-task-card-icon ${item.type === 'smart_analysis' ? 'icon-analysis' : 'icon-review'}`}>
                                      {item.type === 'smart_analysis' ? (
                                        <AdvancedSearchIcon size={14} />
                                      ) : (
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                                          <polyline points="14 2 14 8 20 8"/>
                                          <path d="M12 18l-2.4-1.2L7 18v-4l2.6 1.3L12 14l2.4 1.3L17 14v4l-2.6-1.2L12 18z"/>
                                        </svg>
                                      )}
                                    </div>
                                    <div className="home-task-card-title">{item.title}</div>
                                  </div>
                                  <div className="home-task-card-footer">
                                    <div className={`home-task-card-status ${statusInfo.className}`}>
                                      {statusInfo.text}
                                    </div>
                                    <span className="home-task-card-type">
                                      {item.type === 'smart_analysis' ? '智能检索' : '智能审稿'}
                                    </span>
                                    <span className="home-task-card-time">{formatTime(item.updated_at)}</span>
                                  </div>
                                </div>
                              );
                            })}
                            {/* 展开/收起按钮放在第6个位置（第二排最后） */}
                            {hasMore && (
                              <button 
                                className="home-timeline-more-btn"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleDayExpanded(dayLabel);
                                }}
                              >
                                {isExpanded ? (
                                  <>
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                      <path d="M18 15l-6-6-6 6"/>
                                    </svg>
                                    <span>收起</span>
                                  </>
                                ) : (
                                  <>
                                    <span className="more-count">+{tasks.length - (maxVisible - 1)}</span>
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                      <path d="M6 9l6 6 6-6"/>
                                    </svg>
                                  </>
                                )}
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

        </div>
      </div>

      {/* Tab 切换区域 - 仅未登录用户显示 */}
      {!isAuthenticated && (
        <div className="home-tab-section">
          {/* Tab 切换按钮 */}
          <div className="home-tab-header">
            <button
              className={`home-tab-btn ${activeTab === 'features' ? 'active' : ''}`}
              onClick={() => setActiveTab('features')}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
              </svg>
              平台介绍
            </button>
            <button
              className={`home-tab-btn ${activeTab === 'users' ? 'active' : ''}`}
              onClick={() => setActiveTab('users')}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                <circle cx="9" cy="7" r="4"/>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
              </svg>
              适用人群
            </button>
            <button
              className={`home-tab-btn ${activeTab === 'faq' ? 'active' : ''}`}
              onClick={() => setActiveTab('faq')}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/>
                <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
                <line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
              常见问题
            </button>
          </div>

          {/* Tab 内容区域 */}
          <div className="home-tab-content">
            {/* 平台介绍 Tab */}
            {activeTab === 'features' && (
              <div className="home-tab-panel">
                <div className="home-stats-row">
                  <div className="home-stat-card">
                    <div className="home-stat-number">2亿+</div>
                    <div className="home-stat-label">学术论文</div>
                  </div>
                  <div className="home-stat-card">
                    <div className="home-stat-number">多学科</div>
                    <div className="home-stat-label">覆盖领域</div>
                  </div>
                  <div className="home-stat-card">
                    <div className="home-stat-number">AI驱动</div>
                    <div className="home-stat-label">智能分析</div>
                  </div>
                  <div className="home-stat-card">
                    <div className="home-stat-number">免费</div>
                    <div className="home-stat-label">基础功能</div>
                  </div>
                </div>
                <div className="home-highlights-row">
                  <div className="home-highlight-card">
                    <div className="home-highlight-icon">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <circle cx="11" cy="11" r="8"/>
                        <path d="M21 21l-4.35-4.35"/>
                      </svg>
                    </div>
                    <div className="home-highlight-content">
                      <h4>海量文献检索</h4>
                      <p>基于互联网公开学术数据，覆盖计算机、生物、医学等多学科领域</p>
                    </div>
                  </div>
                  <div className="home-highlight-card">
                    <div className="home-highlight-icon">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M12 2L2 7l10 5 10-5-10-5z"/>
                        <path d="M2 17l10 5 10-5"/>
                        <path d="M2 12l10 5 10-5"/>
                      </svg>
                    </div>
                    <div className="home-highlight-content">
                      <h4>AI 智能分析</h4>
                      <p>自然语言理解研究需求，AI 智能解析并推荐相关论文，提升检索效率</p>
                    </div>
                  </div>
                  <div className="home-highlight-card">
                    <div className="home-highlight-icon">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                        <polyline points="14 2 14 8 20 8"/>
                        <line x1="16" y1="13" x2="8" y2="13"/>
                        <line x1="16" y1="17" x2="8" y2="17"/>
                      </svg>
                    </div>
                    <div className="home-highlight-content">
                      <h4>论文深度解读</h4>
                      <p>智能助手帮你快速理解论文，智能审稿辅助学术写作，引用分析发现研究脉络</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 适用人群 Tab */}
            {activeTab === 'users' && (
              <div className="home-tab-panel">
                <div className="home-user-types-grid">
                  <div className="home-user-type-card">
                    <div className="home-user-type-icon">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M12 14l9-5-9-5-9 5 9 5z"/>
                        <path d="M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z"/>
                      </svg>
                    </div>
                    <h4>高校学生</h4>
                    <p>快速查找课题相关文献，完成论文写作与文献综述</p>
                  </div>
                  <div className="home-user-type-card">
                    <div className="home-user-type-icon">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
                      </svg>
                    </div>
                    <h4>科研人员</h4>
                    <p>追踪研究前沿，发现高影响力论文，拓展研究思路</p>
                  </div>
                  <div className="home-user-type-card">
                    <div className="home-user-type-icon">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/>
                      </svg>
                    </div>
                    <h4>学者教授</h4>
                    <p>深度分析学术脉络，引用图谱可视化，辅助学术决策</p>
                  </div>
                  <div className="home-user-type-card">
                    <div className="home-user-type-icon">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
                      </svg>
                    </div>
                    <h4>企业研发</h4>
                    <p>技术调研与专利分析，了解行业研究动态与技术趋势</p>
                  </div>
                </div>
              </div>
            )}

            {/* 常见问题 Tab */}
            {activeTab === 'faq' && (
              <div className="home-tab-panel">
                <div className="home-faq-list">
                  {faqData.map((faq, index) => (
                    <div 
                      key={index} 
                      className={`home-faq-item ${expandedFaq === index ? 'expanded' : ''}`}
                    >
                      <button 
                        className="home-faq-question"
                        onClick={() => setExpandedFaq(expandedFaq === index ? null : index)}
                      >
                        <span>{faq.question}</span>
                        <svg 
                          className="home-faq-arrow" 
                          width="16" 
                          height="16" 
                          viewBox="0 0 24 24" 
                          fill="none" 
                          stroke="currentColor" 
                          strokeWidth="2"
                        >
                          <path d="M6 9l6 6 6-6"/>
                        </svg>
                      </button>
                      <div className="home-faq-answer">
                        <p>{faq.answer}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* 简洁页脚 */}
          <div className="home-simple-footer">
            <p>© 2025 Scholay</p>
          </div>
        </div>
      )}

      {/* 条件渲染 AuthModal - 只在需要时加载 */}
      {showAuthModal && (
        <Suspense fallback={null}>
          <AuthModal
            isOpen={showAuthModal}
            onClose={() => setShowAuthModal(false)}
            onLoginSuccess={handleLoginSuccess}
          />
        </Suspense>
      )}

      {/* 移动端帮助弹窗 */}
      <MobileHelpModal
        isOpen={showHelpModal}
        onClose={() => setShowHelpModal(false)}
      />

      {/* 被踢出登录提示 */}
      <MessageModal
        isOpen={!!kickedMessage}
        onClose={() => setKickedMessage(null)}
        type="warning"
        title="登录已失效"
        message={kickedMessage}
        confirmText="知道了"
      />

      {/* 右下角固定链接 */}
      <div className="home-footer-fixed">
        <button 
          className="footer-link-btn"
          onClick={() => navigate('/feedback')}
        >
          反馈
        </button>
        <span className="footer-link-divider">|</span>
        <button 
          className="footer-link-btn"
          onClick={() => navigate('/about')}
        >
          关于我们
        </button>
        <span className="footer-link-divider">|</span>
        <button 
          className="footer-link-btn"
          onClick={() => navigate('/contact')}
        >
          联系我们
        </button>
        <span className="footer-link-divider">|</span>
        <button 
          className="footer-link-btn"
          onClick={() => navigate('/privacy')}
        >
          隐私政策
        </button>
        <span className="footer-link-divider">|</span>
        <button 
          className="footer-link-btn"
          onClick={() => navigate('/terms')}
        >
          服务条款
        </button>
      </div>

    </div>
  );
};

export default Home;
