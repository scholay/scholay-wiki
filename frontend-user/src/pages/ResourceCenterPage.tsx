/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 *
 * ResourceCenterPage - 学术资源中心列表页
 *
 * 本页面脱离 DocsLayout，采用全宽单栏布局 —— 列表/浏览场景更合适。
 * 详情页 /resources/:slug 仍走 DocsLayout（需要左侧章节导航）。
 */

import React, { useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Clock, Calendar, Search, FileText, BookOpen, Sparkles, Code,
  ArrowRight, SearchX,
} from 'lucide-react';
import SEO from '../components/common/SEO';
import { siteUrl } from '../config/site';
import resourceArticles, { RESOURCE_CATEGORIES } from './resourceArticles';
import './styles/ResourceCenter.css';

type IconComponentType = React.ComponentType<{ size?: number | string }>;
const iconMap: Record<string, IconComponentType> = {
  Search,
  FileText,
  BookOpen,
  Sparkles,
  Code,
};

interface ResourceArticle {
  slug: string;
  title: string;
  category: string;
  categoryIcon: string;
  excerpt: string;
  readTime: string;
  date: string;
}

// 分类色号 —— 让卡片颜色跟着分类走，避免通篇一种绿。
const CATEGORY_ACCENT: Record<string, string> = {
  '研究方法': '#10a37f',
  '论文写作': '#E74C3C',
  '学术规范': '#8b5cf6',
  'AI与学术': '#3b82f6',
  '工具教程': '#f59e0b',
};

const ResourceCenterPage: React.FC = () => {
  const navigate = useNavigate();
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [query, setQuery] = useState<string>('');

  const articles = resourceArticles as unknown as ResourceArticle[];

  // 每个分类的计数（用于 chip 上的数字）
  const counts = useMemo(() => {
    const m: Record<string, number> = { all: articles.length };
    articles.forEach(a => {
      m[a.category] = (m[a.category] || 0) + 1;
    });
    return m;
  }, [articles]);

  const filtered = useMemo<ResourceArticle[]>(() => {
    const q = query.trim().toLowerCase();
    return articles.filter(a => {
      if (activeCategory !== 'all' && a.category !== activeCategory) return false;
      if (!q) return true;
      return (
        a.title.toLowerCase().includes(q) ||
        a.excerpt.toLowerCase().includes(q) ||
        a.category.toLowerCase().includes(q)
      );
    });
  }, [articles, activeCategory, query]);

  const totalCategories = RESOURCE_CATEGORIES.length - 1; // 去掉 "全部"

  const handleReset = useCallback(() => {
    setQuery('');
    setActiveCategory('all');
  }, []);

  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: '学术资源中心 - Scholay',
    description: 'Scholay 学术资源中心提供原创学术指南，涵盖文献检索技巧、论文写作方法、引用格式规范、研究方法论和 AI 学术工具使用教程。',
    url: siteUrl('/resources'),
    mainEntity: {
      '@type': 'ItemList',
      itemListElement: articles.map((article, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        url: siteUrl(`/resources/${article.slug}`),
        name: article.title,
      })),
    },
  };

  return (
    <div className="rc-page">
      <SEO
        title="学术资源中心 - Scholay | 文献检索、论文写作与研究方法指南"
        description="Scholay 学术资源中心提供原创学术指南，涵盖文献检索技巧、论文写作方法、引用格式规范、研究方法论和 AI 学术工具使用教程，助力科研工作者提升效率。"
        keywords="学术资源,文献检索教程,论文写作技巧,引用格式指南,研究方法论,AI学术工具,LaTeX教程,文献综述写作,同行评审"
        canonical="/resources"
        structuredData={structuredData}
      />

      <div className="rc-container">
        {/* Hero */}
        <section className="rc-hero">
          <span className="rc-hero-badge">
            <BookOpen size={14} />
            学术资源中心
          </span>
          <h1 className="rc-hero-title">
            精选<em>学术指南</em>与实用教程
          </h1>
          <p className="rc-hero-desc">
            覆盖文献检索、论文写作、学术规范与科研工具的原创长文，帮助你在每个科研阶段做得更从容。
          </p>
          <div className="rc-hero-meta">
            <span><strong>{articles.length}</strong> 篇原创长文</span>
            <span className="rc-dot" />
            <span><strong>{totalCategories}</strong> 大主题</span>
            <span className="rc-dot" />
            <span>持续更新</span>
          </div>
        </section>

        {/* 搜索 + 分类 */}
        <section className="rc-controls">
          <div className="rc-search">
            <Search size={16} />
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="搜索文章标题、摘要或分类..."
              aria-label="搜索资源文章"
            />
          </div>

          <div className="rc-filters" role="tablist" aria-label="资源分类">
            {RESOURCE_CATEGORIES.map(cat => {
              const count = counts[cat.id] || 0;
              if (cat.id !== 'all' && count === 0) return null;
              const active = activeCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  role="tab"
                  aria-selected={active}
                  className={`rc-chip ${active ? 'active' : ''}`}
                  onClick={() => setActiveCategory(cat.id)}
                >
                  {cat.label}
                  <span className="rc-chip-count">{count}</span>
                </button>
              );
            })}
          </div>
        </section>

        {/* 列表 */}
        {filtered.length > 0 ? (
          <section className="rc-grid">
            {filtered.map(article => {
              const Icon = iconMap[article.categoryIcon] || BookOpen;
              const accent = CATEGORY_ACCENT[article.category] || 'var(--primary-solid)';
              return (
                <article
                  key={article.slug}
                  className="rc-card"
                  style={{ ['--rc-accent' as string]: accent }}
                  onClick={() => navigate(`/resources/${article.slug}`)}
                  role="link"
                  tabIndex={0}
                  onKeyDown={e => {
                    if (e.key === 'Enter') navigate(`/resources/${article.slug}`);
                  }}
                >
                  <div className="rc-card-header">
                    <span className="rc-card-cat">
                      <Icon size={12} />
                      {article.category}
                    </span>
                    <ArrowRight className="rc-card-arrow" size={16} />
                  </div>
                  <h3 className="rc-card-title">{article.title}</h3>
                  <p className="rc-card-excerpt">{article.excerpt}</p>
                  <div className="rc-card-meta">
                    <span><Clock size={12} />{article.readTime}</span>
                    <span className="rc-meta-sep" />
                    <span><Calendar size={12} />{article.date}</span>
                  </div>
                </article>
              );
            })}
          </section>
        ) : (
          <div className="rc-empty">
            <div className="rc-empty-icon">
              <SearchX size={22} />
            </div>
            <h3>没有匹配的文章</h3>
            <p>试试调整筛选条件，或浏览全部分类。</p>
            <button className="rc-empty-btn" onClick={handleReset}>
              清除筛选
            </button>
          </div>
        )}

        {/* 尾部 CTA — 替代原右栏 FeaturePromo */}
        <section className="rc-cta">
          <div className="rc-cta-text">
            <h3>想看更轻松的内容？</h3>
            <p>Scholay 博客有行业观察、AI 学术实践与工具对比，定期更新。</p>
          </div>
          <button className="rc-cta-btn" onClick={() => navigate('/blog')}>
            浏览博客
            <ArrowRight size={16} />
          </button>
        </section>
      </div>
    </div>
  );
};

export default ResourceCenterPage;
