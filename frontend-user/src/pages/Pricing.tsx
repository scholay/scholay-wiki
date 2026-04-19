/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
// Logo import removed — TopNavBar handles navigation
import SEO from '../components/common/SEO';
import './styles/Pricing.css';

/* 当前免费开放的功能列表 */
const FREE_FEATURES = [
  {
    key: 'search',
    icon: (
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
        <line x1="8" y1="11" x2="14" y2="11" />
        <line x1="11" y1="8" x2="11" y2="14" />
      </svg>
    ),
    title: '学术搜索',
    description: '覆盖超过 2 亿篇学术文献，支持语义检索与精确匹配，快速定位所需论文。'
  },
  {
    key: 'analysis',
    icon: (
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2L2 7l10 5 10-5-10-5z" />
        <path d="M2 17l10 5 10-5" />
        <path d="M2 12l10 5 10-5" />
      </svg>
    ),
    title: 'AI 智能分析',
    description: '基于大语言模型对论文进行深度解读，自动提炼要点、生成摘要与结构化分析。'
  },
  {
    key: 'chat',
    icon: (
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
        <line x1="9" y1="10" x2="15" y2="10" />
        <line x1="12" y1="7" x2="12" y2="13" />
      </svg>
    ),
    title: 'AI 聊天',
    description: '与 AI 进行多轮学术对话，解答研究疑问、辅助文献综述与灵感验证。'
  },
  {
    key: 'review',
    icon: (
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <path d="M9 15l2 2 4-4" />
      </svg>
    ),
    title: '智能审稿',
    description: '上传论文即可获得 AI 审稿意见，涵盖结构、逻辑、语言等多维度评估。'
  },
  {
    key: 'latex',
    icon: (
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="16 18 22 12 16 6" />
        <polyline points="8 6 2 12 8 18" />
        <line x1="14" y1="4" x2="10" y2="20" />
      </svg>
    ),
    title: 'LaTeX 编辑器',
    description: '在线 LaTeX 编写与实时预览，支持模板选择与格式化，高效完成论文排版。'
  }
];

/* 平台核心数据 */
const PLATFORM_STATS = [
  { value: '2亿+', label: '可检索文献' },
  { value: '< 10 秒', label: '平均响应时间' },
  { value: '99.9%', label: '服务可用率' },
  { value: '0', label: '使用费用' }
];

const Pricing: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="pricing-page">
      <SEO
        title="免费使用 - Scholay | AI学术搜索"
        description="Scholay 所有功能当前免费开放，包括学术搜索、AI智能分析、AI聊天、智能审稿、LaTeX编辑器等，助力学术研究。"
        keywords="Scholay免费,学术搜索免费,AI论文分析,学术工具,科研工具"
        canonical="/pricing"
      />

      <main className="pricing-main">
        {/* 主视觉区域 */}
        <section className="pricing-hero">
          <div className="hero-center">
            <span className="hero-pill">当前所有功能免费开放</span>
            <h1>所有功能 · 免费开放</h1>
            <p className="hero-subtitle">
              无需订阅、无需付费。Scholay 的全部学术能力现已面向所有用户免费开放，
              助你专注于研究本身。
            </p>
            <button
              type="button"
              className="hero-start-btn"
              onClick={() => navigate('/')}
            >
              立即开始使用
            </button>
          </div>
        </section>

        {/* 平台数据展示 */}
        <section className="stats-section">
          <div className="stats-grid">
            {PLATFORM_STATS.map(stat => (
              <div key={stat.label} className="stat-item">
                <span className="stat-value">{stat.value}</span>
                <span className="stat-label">{stat.label}</span>
              </div>
            ))}
          </div>
        </section>

        {/* 功能卡片区域 */}
        <section className="features-section">
          <div className="section-heading">
            <h2>免费开放的核心功能</h2>
            <p className="section-description">
              从文献检索到论文写作，覆盖学术研究全流程
            </p>
          </div>
          <div className="features-grid">
            {FREE_FEATURES.map(feature => (
              <article key={feature.key} className="feature-card">
                <div className="feature-icon">{feature.icon}</div>
                <h3 className="feature-title">{feature.title}</h3>
                <p className="feature-desc">{feature.description}</p>
              </article>
            ))}
          </div>
        </section>

        {/* 底部提示 */}
        <section className="future-notice">
          <div className="notice-card">
            <h3>关于未来计划</h3>
            <p>
              我们可能会在未来推出高级订阅方案，届时将提供更强大的模型调用额度与专属功能。
              当前阶段，所有用户均可无限制体验全部能力，敬请放心使用。
            </p>
            <button
              type="button"
              className="notice-btn"
              onClick={() => navigate('/')}
            >
              前往首页探索
            </button>
          </div>
        </section>
      </main>
    </div>
  );
};

export default Pricing;
