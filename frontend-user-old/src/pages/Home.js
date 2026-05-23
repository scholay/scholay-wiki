/**
 * ============================================================================
 * Scholay学术 V2.0 · 首页
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * ============================================================================
 *
 * 极简风首页（参考 scholay.pen 设计稿）：
 *   - 顶栏：菜单按钮 + 七彩 Scholay 小 logo / 右侧用户药丸
 *   - 主区：七彩 Scholay 大 logo + 640px 搜索框 + 智能搜索按钮
 *   - 页脚：版权 + 法务/资源链接
 *
 * 旧版首页（任务历史、AI 工具卡片、热门搜索等）已废弃，等其它页面
 * 一起统一到新设计后再决定是否做"快捷入口"二级页。
 */

import React, { useState, useRef, useEffect, lazy, Suspense } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../utils/AuthContext';
import SEO from '../components/common/SEO';
import { generateFAQSchema } from '../utils/seoHelpers';
import { prepareSearchNavigation, preparePaperNavigation, prepareAuthorNavigation } from '../utils/searchStorage';
import MessageModal from '../components/common/MessageModal';
import NavBarV2 from '../components/v2/NavBarV2';
import SuggestionsDropdownV2 from '../components/v2/search/SuggestionsDropdownV2';
import './styles/HomeV2.css';

const AuthModal = lazy(() => import('../components/auth/AuthModal'));

// 大 logo 字母拆分：S | ch | o | l | a | y
const BIG_LOGO = [
  { text: 'S',  color: '#CC2222' },
  { text: 'ch', color: '#2A7A2A' },
  { text: 'o',  color: '#D4A017' },
  { text: 'l',  color: '#111111' },
  { text: 'a',  color: '#CC2222' },
  { text: 'y',  color: '#2A7A2A' },
];

const faqData = [
  {
    question: '什么是 Scholay 学术搜索平台？',
    answer:
      'Scholay 是一个 AI 驱动的学术搜索平台，提供智能文献检索、论文分析、引用图谱可视化等功能，帮助研究人员快速找到高质量学术资源。',
  },
  {
    question: 'Scholay 支持哪些搜索模式？',
    answer:
      'Scholay 支持学术检索和智能搜索两种模式：学术检索快速定位标题、作者、关键词；智能搜索使用大模型理解你的研究需求并给出更精准的结果。',
  },
  {
    question: 'Scholay 是免费的吗？',
    answer:
      'Scholay 提供免费的基础功能（学术检索、论文详情查看等）。高级功能如智能分析、智能审稿可能需要订阅会员。',
  },
];

const Home = () => {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const inputRef = useRef(null);

  const [query, setQuery] = useState('');
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [kickedMessage, setKickedMessage] = useState(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [hoverSplit, setHoverSplit] = useState(false);
  const [isComposing, setIsComposing] = useState(false);
  const splitRef = useRef(null);
  const splitHideTimerRef = useRef(null);

  // 自动聚焦输入框
  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 100);
    return () => clearTimeout(t);
  }, []);

  // 被踢出登录提示
  useEffect(() => {
    const message = sessionStorage.getItem('auth_kicked_message');
    if (message) {
      setKickedMessage(message);
      sessionStorage.removeItem('auth_kicked_message');
    }
  }, []);

  const runNormalSearch = () => {
    const q = query.trim();
    if (!q) return;
    navigate(prepareSearchNavigation({ query: q, mode: 'normal' }));
  };

  const runSmartSearch = () => {
    const q = query.trim();
    if (!q) {
      // 没输入：聚焦输入框，提示用户输入
      inputRef.current?.focus();
      return;
    }
    if (!isAuthenticated) {
      setShowAuthModal(true);
      return;
    }
    navigate(prepareSearchNavigation({ query: q, mode: 'ai' }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    runNormalSearch();
  };

  // ============ 联想下拉 选中 ============
  const closeSuggestions = () => setShowSuggestions(false);

  const onSelectPaperSuggestion = (paper) => {
    const title = paper.title || paper.name || '';
    const paperId = paper.paperId || paper.id || '';
    setQuery(title);
    closeSuggestions();
    // 与首页 search 旧逻辑保持一致：跳搜索结果并带 paperId
    navigate(preparePaperNavigation(paperId, title));
  };

  const onSelectAuthorSuggestion = (author) => {
    const name = author.name || '';
    const authorId = author.authorId || author.id || '';
    setQuery(name);
    closeSuggestions();
    navigate(prepareAuthorNavigation(authorId, name));
  };

  const onSelectJournalSuggestion = (journal) => {
    const name = journal.canonical_name || journal.name || '';
    closeSuggestions();
    if (!name) return;
    // 走"搜索期刊"路径，列表展示
    navigate(`/journals?q=${encodeURIComponent(name)}`);
  };

  // ============ Hover-split：默认搜论文 / hover 出现"搜期刊" ============
  const onSearchAreaEnter = () => {
    if (splitHideTimerRef.current) {
      clearTimeout(splitHideTimerRef.current);
      splitHideTimerRef.current = null;
    }
    setHoverSplit(true);
  };
  const onSearchAreaLeave = () => {
    // 离开后延迟一点再隐藏，便于用户把鼠标挪到 popover 上
    if (splitHideTimerRef.current) clearTimeout(splitHideTimerRef.current);
    splitHideTimerRef.current = setTimeout(() => setHoverSplit(false), 120);
  };
  const runJournalSearch = () => {
    const q = query.trim();
    if (!q) {
      inputRef.current?.focus();
      return;
    }
    setHoverSplit(false);
    navigate(`/journals?q=${encodeURIComponent(q)}`);
  };

  return (
    <div className="home2">
      <SEO
        title="Scholay - AI 驱动的学术搜索平台 | 智能文献检索与分析"
        description="Scholay 是一个 AI 驱动的学术搜索平台，提供智能文献检索、论文分析、引用图谱可视化等功能。覆盖全球 3 亿+ 学术论文，助你高效科研。"
        keywords="学术搜索,论文检索,文献查找,AI 论文分析,学术资源,科研工具,智能搜索"
        canonical="/"
        structuredData={generateFAQSchema(faqData)}
      />

      {/* ============== 顶部导航 ============== */}
      <NavBarV2 onLoginClick={() => setShowAuthModal(true)} />

      {/* ============== 主区 ============== */}
      <main className="home2-main">
        <div className="home2-logo" aria-label="Scholay">
          {BIG_LOGO.map((l, i) => (
            <span key={i} style={{ color: l.color }}>{l.text}</span>
          ))}
        </div>

        <div className="home2-spacer-32" />

        <div className="home2-search-stack">
          <form className="home2-search" onSubmit={handleSubmit} role="search">
            <input
              ref={inputRef}
              type="text"
              className="home2-search-input"
              placeholder="搜索学术论文、期刊、作者…"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                if (e.target.value.trim().length >= 2) setShowSuggestions(true);
                else setShowSuggestions(false);
              }}
              onFocus={() => {
                if (query.trim().length >= 2) setShowSuggestions(true);
              }}
              onBlur={() => {
                // 延迟关闭，使下拉项点击能被识别（mousedown 在 blur 之前）
                setTimeout(() => setShowSuggestions(false), 150);
              }}
              onCompositionStart={() => setIsComposing(true)}
              onCompositionEnd={() => setIsComposing(false)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setShowSuggestions(false);
                if (e.key === 'Enter' && !isComposing) {
                  // 默认走论文搜索
                  setShowSuggestions(false);
                }
              }}
              maxLength={1000}
              aria-label="学术搜索"
            />

            <div
              ref={splitRef}
              className={`home2-search-btnwrap ${hoverSplit ? 'is-hover' : ''}`}
              onMouseEnter={onSearchAreaEnter}
              onMouseLeave={onSearchAreaLeave}
            >
              <button
                type="submit"
                className="home2-search-icon-btn"
                aria-label="搜索论文"
                title="搜索论文"
                disabled={!query.trim()}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8" />
                  <path d="M21 21l-4.35-4.35" />
                </svg>
              </button>

              {/* 悬浮在主搜索按钮下方的分裂选项：搜期刊 */}
              <div className="home2-split-pop" role="menu" aria-hidden={!hoverSplit}>
                <button
                  type="button"
                  className="home2-split-item"
                  onClick={runJournalSearch}
                  disabled={!query.trim()}
                  title="搜索期刊"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5V4.5A2.5 2.5 0 0 1 6.5 2z" />
                  </svg>
                  <span>搜索期刊</span>
                </button>
              </div>
            </div>

            <SuggestionsDropdownV2
              query={query}
              source="olx"
              visible={showSuggestions}
              onClose={closeSuggestions}
              onSelectPaper={onSelectPaperSuggestion}
              onSelectJournal={onSelectJournalSuggestion}
              onSelectAuthor={onSelectAuthorSuggestion}
            />
          </form>
        </div>

        <button type="button" className="home2-smart-btn" onClick={runSmartSearch}>
          智能搜索
        </button>
      </main>

      {/* ============== 页脚 ============== */}
      <footer className="home2-footer" role="contentinfo">
        <span className="home2-footer-text">© {new Date().getFullYear()} Scholay</span>
        <span className="home2-footer-divider" aria-hidden="true" />
        <Link to="/about" className="home2-footer-link">关于我们</Link>
        <span className="home2-footer-divider" aria-hidden="true" />
        <Link to="/privacy" className="home2-footer-link">隐私政策</Link>
        <span className="home2-footer-divider" aria-hidden="true" />
        <Link to="/terms" className="home2-footer-link">服务条款</Link>
        <span className="home2-footer-divider" aria-hidden="true" />
        <Link to="/help" className="home2-footer-link">帮助中心</Link>
      </footer>

      {/* 登录弹窗 */}
      {showAuthModal && (
        <Suspense fallback={null}>
          <AuthModal
            isOpen={showAuthModal}
            onClose={() => setShowAuthModal(false)}
            onLoginSuccess={() => setShowAuthModal(false)}
          />
        </Suspense>
      )}

      {/* 被踢出登录提示 */}
      <MessageModal
        isOpen={!!kickedMessage}
        onClose={() => setKickedMessage(null)}
        type="warning"
        title="登录已失效"
        message={kickedMessage}
        confirmText="知道了"
      />
    </div>
  );
};

export default Home;
