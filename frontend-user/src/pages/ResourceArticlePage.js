/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 *
 * ResourceArticlePage - 学术资源文章详情页
 *
 * 重设计：去掉灰色"内容盒子"，正文在页面背景上自然流动；
 * 头两级标题挂锚点 id，右栏 <ArticleTOC /> 做 scroll-spy 目录。
 */

import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Clock, Calendar, ChevronRight,
  Search, FileText, BookOpen, Sparkles, Code, Lightbulb,
} from 'lucide-react';
import SEO from '../components/common/SEO';
import { getArticleBySlug, getRelatedArticles } from './resourceArticles';
import './styles/ResourceArticle.css';

const iconMap = {
  Search,
  FileText,
  BookOpen,
  Sparkles,
  Code,
};

// 与列表页保持一致的分类强调色，让每篇文章的视觉锚点连贯
const CATEGORY_ACCENT = {
  '研究方法': '#10a37f',
  '论文写作': '#E74C3C',
  '学术规范': '#8b5cf6',
  'AI与学术': '#3b82f6',
  '工具教程': '#f59e0b',
};

const ResourceArticlePage = () => {
  const { slug } = useParams();
  const navigate = useNavigate();
  const article = getArticleBySlug(slug);
  const relatedArticles = getRelatedArticles(slug, 4);

  if (!article) {
    return (
      <div className="rca">
        <nav className="rca-crumb" aria-label="面包屑导航">
          <button onClick={() => navigate('/')}>首页</button>
          <ChevronRight size={12} className="rca-crumb-sep" />
          <button onClick={() => navigate('/resources')}>学术资源</button>
        </nav>
        <div style={{ padding: '80px 0', textAlign: 'center', color: 'var(--text-tertiary)' }}>
          <h2 style={{ color: 'var(--text-primary)', marginBottom: 12 }}>文章未找到</h2>
          <p>该文章可能已被移动或删除</p>
          <button
            className="rca-back-link"
            style={{ marginTop: 24 }}
            onClick={() => navigate('/resources')}
          >
            <ArrowLeft size={14} />
            返回资源中心
          </button>
        </div>
      </div>
    );
  }

  const IconComponent = iconMap[article.categoryIcon] || BookOpen;
  const accent = CATEGORY_ACCENT[article.category] || 'var(--primary-solid)';

  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: article.title,
    description: article.excerpt,
    datePublished: article.date,
    dateModified: article.date,
    author: { '@type': 'Organization', name: 'Scholay', url: 'https://www.scholay.com' },
    publisher: {
      '@type': 'Organization',
      name: 'Scholay',
      logo: { '@type': 'ImageObject', url: 'https://www.scholay.com/logo.png' },
    },
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': `https://www.scholay.com/resources/${article.slug}`,
    },
    articleSection: article.category,
    wordCount: article.content.reduce((acc, block) => {
      if (block.type === 'paragraph' || block.type === 'tip') return acc + (block.text || '').length;
      return acc;
    }, 0),
  };

  const renderContent = (blocks) =>
    blocks.map((block, index) => {
      switch (block.type) {
        case 'heading':
          return (
            <h2 key={index} id={`h-${index}`}>
              {block.text}
            </h2>
          );
        case 'paragraph':
          return <p key={index}>{block.text}</p>;
        case 'tip':
          return (
            <div key={index} className="rca-tip">
              <div className="rca-tip-label">
                <Lightbulb size={12} />
                小贴士
              </div>
              {block.title && <p className="rca-tip-title">{block.title}</p>}
              <p>{block.text}</p>
            </div>
          );
        default:
          return null;
      }
    });

  return (
    <article
      className="rca"
      style={{ ['--rca-accent']: accent }}
    >
      <SEO
        title={`${article.title} - Scholay 学术资源`}
        description={article.excerpt}
        keywords={`${article.category},${article.title},学术指南,Scholay`}
        canonical={`/resources/${article.slug}`}
        ogType="article"
        structuredData={structuredData}
      />

      {/* 面包屑 */}
      <nav className="rca-crumb" aria-label="面包屑导航">
        <button onClick={() => navigate('/')}>首页</button>
        <ChevronRight size={12} className="rca-crumb-sep" />
        <button onClick={() => navigate('/resources')}>学术资源</button>
        <ChevronRight size={12} className="rca-crumb-sep" />
        <span className="rca-crumb-current">{article.category}</span>
      </nav>

      {/* Hero */}
      <header className="rca-hero">
        <div className="rca-cat-badge">
          <IconComponent size={12} />
          {article.category}
        </div>
        <h1 className="rca-title">{article.title}</h1>
        <div className="rca-meta">
          <span><Clock size={13} />{article.readTime}阅读</span>
          <span className="rca-meta-sep" />
          <span><Calendar size={13} />{article.date}</span>
          <span className="rca-meta-sep" />
          <span className="rca-author">Scholay 学术团队</span>
        </div>
      </header>

      {/* 正文 */}
      <div className="rca-body">{renderContent(article.content)}</div>

      {/* 相关推荐 */}
      {relatedArticles.length > 0 && (
        <footer className="rca-footer">
          <div className="rca-footer-heading">
            <h2>继续阅读</h2>
            <a onClick={(e) => { e.preventDefault(); navigate('/resources'); }} href="/resources">
              查看全部 →
            </a>
          </div>
          <div className="rca-related-grid">
            {relatedArticles.map((related) => (
              <button
                key={related.slug}
                className="rca-related-card"
                onClick={() => navigate(`/resources/${related.slug}`)}
              >
                <span className="rca-related-cat">{related.category}</span>
                <h3 className="rca-related-title">{related.title}</h3>
                <span className="rca-related-meta">{related.readTime}阅读 · {related.date}</span>
              </button>
            ))}
          </div>
        </footer>
      )}

      <button className="rca-back-link" onClick={() => navigate('/resources')}>
        <ArrowLeft size={14} />
        返回资源中心
      </button>
    </article>
  );
};

export default ResourceArticlePage;
