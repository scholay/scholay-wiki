import React, { useState, useRef, useEffect, lazy, Suspense } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { useAuth } from '../utils/AuthContext';
import { useSidebar } from '../contexts/SidebarContext';
import { useTheme } from '../contexts/ThemeContext';
import SearchFilters from '../components/SearchFilters';
import ModelSelector from '../components/ModelSelector';
import ThemeToggle from '../components/ThemeToggle';
import { NormalSearchIcon, AdvancedSearchIcon } from '../components/SearchIcons';
import SEO from '../components/SEO';
import { generateFAQSchema } from '../utils/seoHelpers';
import './Home.css';

// 懒加载 AuthModal - 只在需要时加载
const AuthModal = lazy(() => import('../components/AuthModal'));

const Home = () => {
  const navigate = useNavigate();
  const { isAuthenticated, user } = useAuth();
  const { resetSidebarConfig } = useSidebar();
  const { theme } = useTheme();
  const outletContext = useOutletContext();
  const sidebarCollapsed = outletContext?.sidebarCollapsed ?? true;
  
  const [showAuthModal, setShowAuthModal] = useState(false);
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
  const textareaRef = useRef(null);
  const lastTypingDelayRef = useRef(90);
  const [isComposing, setIsComposing] = useState(false); // 跟踪输入法状态

  // Typewriter effect for welcome title
  const [displayedText, setDisplayedText] = useState('');
  const [currentPhraseIndex, setCurrentPhraseIndex] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);

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

  // 重置侧边栏配置（Home 页面不需要历史记录）
  useEffect(() => {
    resetSidebarConfig();
  }, [resetSidebarConfig]);

  // 搜索示例轮播效果
  useEffect(() => {
    const currentExamples = searchExamples[searchMode];
    const interval = setInterval(() => {
      setCurrentExampleIndex((prevIndex) => (prevIndex + 1) % currentExamples.length);
    }, 3000); // 每3秒切换一次

    return () => clearInterval(interval);
  }, [searchMode]); // 当searchMode变化时重新开始轮播

  // 当切换搜索模式时，重置示例索引
  useEffect(() => {
    setCurrentExampleIndex(0);
  }, [searchMode]);

  useEffect(() => {
    const phrases = [
      '探索学术世界,从这里开始',
      '发现前沿研究,开启智慧之旅',
      '用AI连接知识,让学术触手可及',
      '搜索论文,理解文献,推动创新'
    ];

    const currentPhrase = phrases[currentPhraseIndex];
    const pauseAfterComplete = 30000; // 30s 展示间隔
    const pauseAfterDelete = 500;

    if (!isDeleting && displayedText === currentPhrase) {
      // Finished typing, pause then start deleting
      const timeout = setTimeout(() => {
        setIsDeleting(true);
      }, pauseAfterComplete);
      return () => clearTimeout(timeout);
    }

    if (isDeleting && displayedText === '') {
      // Finished deleting, move to next phrase
      setIsDeleting(false);
      setCurrentPhraseIndex((prev) => (prev + 1) % phrases.length);
      const timeout = setTimeout(() => {
      }, pauseAfterDelete);
      return () => clearTimeout(timeout);
    }

    const phraseLength = currentPhrase.length || 1;
    const rawProgress = displayedText.length / phraseLength;
    const directionalProgress = isDeleting ? 1 - rawProgress : rawProgress;
    const clampedProgress = Math.min(1, Math.max(0, directionalProgress));
    const wave = Math.sin(Math.PI * clampedProgress);
    const config = isDeleting
      ? { base: 60, variance: 18, min: 28 }
      : { base: 115, variance: 35, min: 60 };
    const targetDelay = Math.max(
      config.min,
      config.base - wave * config.variance
    );
    const smoothDelay = lastTypingDelayRef.current * 0.4 + targetDelay * 0.6;
    lastTypingDelayRef.current = smoothDelay;

    // Type or delete character
    const timeout = setTimeout(() => {
      setDisplayedText(prev => {
        if (isDeleting) {
          return currentPhrase.substring(0, prev.length - 1);
        } else {
          return currentPhrase.substring(0, prev.length + 1);
        }
      });
    }, smoothDelay);

    return () => clearTimeout(timeout);
  }, [displayedText, isDeleting, currentPhraseIndex]);

  const handleLoginSuccess = () => {
    setShowAuthModal(false);
  };

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    // Check if user is authenticated
    if (!isAuthenticated) {
      setShowAuthModal(true);
      return;
    }

    const userMessage = searchQuery.trim();

    // 学术检索模式：直接跳转到结果页面，带上筛选条件
    if (searchMode === 'normal') {
      const params = new URLSearchParams({ query: userMessage });

      // 添加筛选条件到URL参数
      if (filters.yearFrom) params.set('yearFrom', filters.yearFrom);
      if (filters.yearTo) params.set('yearTo', filters.yearTo);
      if (filters.publicationTypes.length > 0) params.set('publicationTypes', filters.publicationTypes.join(','));
      if (filters.fieldsOfStudy.length > 0) params.set('fieldsOfStudy', filters.fieldsOfStudy.join(','));
      if (filters.openAccessPdf) params.set('openAccessPdf', filters.openAccessPdf);
      if (filters.venue) params.set('venue', filters.venue);

      navigate(`/search-results?${params.toString()}`);
      return;
    }

    // 智能分析模式：跳转到智能分析页面，带上query参数以便自动搜索
    if (searchMode === 'advanced') {
      const params = new URLSearchParams({
        query: userMessage,
        modelLevel: modelLevel  // 传递模型级别
      });
      navigate(`/advanced-search?${params.toString()}`);
      return;
    }
  };

  // FAQ数据用于结构化数据
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
      answer: 'Scholay基于Semantic Scholar学术图谱API，提供来自计算机科学、生物医学等多个领域的数百万篇学术论文数据。'
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
      
      <div className={`main-container ${isAuthenticated ? (sidebarCollapsed ? 'sidebar-collapsed-narrow' : 'has-sidebar') : 'sidebar-collapsed'}`}>
        <nav className="top-navbar">
          <div className="navbar-left">
            <div className="logo">
              <span className="logo-text">Scholay</span>
            </div>
          </div>

          <div className="navbar-right">
            <ThemeToggle />
            {!isAuthenticated && (
              <div className="auth-buttons">
                <button
                  onClick={() => navigate('/pricing')}
                  className="btn-auth btn-pricing"
                >
                  价格方案
                </button>
                <button
                  onClick={() => setShowAuthModal(true)}
                  className="btn-auth btn-login"
                >
                  登录
                </button>
                <button
                  onClick={() => setShowAuthModal(true)}
                  className="btn-auth btn-register"
                >
                  免费注册
                </button>
              </div>
            )}
          </div>
        </nav>

        <div className="search-content">
          <div className="chat-container">
            <div className="welcome-screen">
              <h1 className="welcome-title">
                {displayedText}
              </h1>
            </div>

            {/* 备案号 */}
            <div className="icp-filing">
              <a
                href="https://beian.miit.gov.cn/"
                target="_blank"
                rel="noopener noreferrer"
              >
                蜀ICP备2025145653号
              </a>
            </div>

            <form onSubmit={handleSearch} className="home-composer-wrapper">
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
                      }}
                      onFocus={() => {
                        if (!isAuthenticated) {
                          setShowAuthModal(true);
                        }
                      }}
                      onCompositionStart={() => setIsComposing(true)}
                      onCompositionEnd={() => setIsComposing(false)}
                      onKeyDown={(e) => {
                        // Submit on Enter, new line on Shift+Enter
                        // 但要避免在输入法输入过程中触发提交
                        if (e.key === 'Enter' && !e.shiftKey && !isComposing) {
                          e.preventDefault();
                          if (searchQuery.trim()) {
                            handleSearch(e);
                          }
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

                  {/* 底部操作栏 */}
                  <div className="home-composer-footer">
                    <div className="home-composer-footer-left">
                      {/* 搜索模式切换 - 分段控制器设计 */}
                      <div className="home-search-mode-segmented">
                        <button
                          type="button"
                          className={`mode-segment ${searchMode === 'normal' ? 'active' : ''}`}
                          onClick={() => setSearchMode('normal')}
                        >
                          <span className="mode-segment-icon">
                            <NormalSearchIcon size={16} />
                          </span>
                          <span className="mode-segment-label">学术检索</span>
                        </button>
                        <button
                          type="button"
                          className={`mode-segment ${searchMode === 'advanced' ? 'active' : ''}`}
                          onClick={() => setSearchMode('advanced')}
                        >
                          <span className="mode-segment-icon">
                            <AdvancedSearchIcon size={16} />
                          </span>
                          <span className="mode-segment-label">智能分析</span>
                        </button>
                      </div>

                      {/* 分隔线 */}
                      <div className="footer-divider"></div>

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
          </div>
        </div>
      </div>

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
    </div>
  );
};

export default Home;
