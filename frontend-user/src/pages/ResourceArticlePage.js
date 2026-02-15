/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 *
 * ResourceArticlePage - 学术资源文章详情页
 * 展示单篇原创学术指南文章，含 SEO 结构化数据和相关文章推荐
 */

import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Clock, Calendar, ChevronRight, Search, FileText, BookOpen, Sparkles, Code } from 'lucide-react';
import SEO from '../components/SEO';
import { getArticleBySlug, getRelatedArticles } from './resourceArticles';
import './styles/ResourcePage.css';

const iconMap = {
  Search,
  FileText,
  BookOpen,
  Sparkles,
  Code,
};

const ResourceArticlePage = () => {
  const { slug } = useParams();
  const navigate = useNavigate();
  const article = getArticleBySlug(slug);
  const relatedArticles = getRelatedArticles(slug, 4);

  if (!article) {
    return (
      <div className="article-page">
        <div className="article-container">
          <div className="article-header">
            <button className="back-btn" onClick={() => navigate('/resources')}>
              <ArrowLeft size={20} />
              <span>返回资源中心</span>
            </button>
          </div>
          <div style={{ textAlign: 'center', padding: '80px 0', color: 'var(--text-tertiary)' }}>
            <h2 style={{ color: 'var(--text-primary)', marginBottom: 12 }}>文章未找到</h2>
            <p>该文章可能已被移动或删除</p>
            <button
              className="article-cta-btn"
              style={{ marginTop: 24 }}
              onClick={() => navigate('/resources')}
            >
              浏览全部文章
            </button>
          </div>
        </div>
      </div>
    );
  }

  const IconComponent = iconMap[article.categoryIcon] || BookOpen;

  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: article.title,
    description: article.excerpt,
    datePublished: article.date,
    dateModified: article.date,
    author: {
      '@type': 'Organization',
      name: 'Scholay',
      url: 'https://www.scholay.com',
    },
    publisher: {
      '@type': 'Organization',
      name: 'Scholay',
      logo: {
        '@type': 'ImageObject',
        url: 'https://www.scholay.com/logo.png',
      },
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

  const renderContent = (blocks) => {
    return blocks.map((block, index) => {
      switch (block.type) {
        case 'heading':
          return <h2 key={index}>{block.text}</h2>;
        case 'paragraph':
          return <p key={index}>{block.text}</p>;
        case 'tip':
          return (
            <div key={index} className="article-tip-box">
              <h4>{block.title}</h4>
              <p>{block.text}</p>
            </div>
          );
        default:
          return null;
      }
    });
  };

  return (
    <div className="article-page">
      <SEO
        title={`${article.title} - Scholay 学术资源`}
        description={article.excerpt}
        keywords={`${article.category},${article.title},学术指南,Scholay`}
        canonical={`/resources/${article.slug}`}
        ogType="article"
        structuredData={structuredData}
      />

      <div className="article-container">
        {/* Breadcrumb */}
        <nav className="article-breadcrumb" aria-label="面包屑导航">
          <button onClick={() => navigate('/')}>首页</button>
          <ChevronRight size={14} />
          <button onClick={() => navigate('/resources')}>学术资源</button>
          <ChevronRight size={14} />
          <span>{article.category}</span>
        </nav>

        {/* Hero */}
        <div className="article-hero">
          <div className="article-category-badge">
            <IconComponent size={14} />
            {article.category}
          </div>
          <h1>{article.title}</h1>
          <div className="article-meta">
            <span><Clock size={14} />{article.readTime}阅读</span>
            <span><Calendar size={14} />{article.date}</span>
            <span>Scholay 学术团队</span>
          </div>
        </div>

        {/* Article Body */}
        <div className="article-body">
          {renderContent(article.content)}
        </div>

        {/* CTA */}
        <div className="article-cta">
          <h3>立即体验 Scholay 的 AI 学术工具</h3>
          <p>智能文献检索、AI 论文分析、在线 LaTeX 编辑器，助力你的科研之路</p>
          <button className="article-cta-btn" onClick={() => navigate('/')}>
            <Search size={16} />
            开始使用
          </button>
        </div>

        {/* Related Articles */}
        {relatedArticles.length > 0 && (
          <section className="related-articles">
            <h2>相关推荐</h2>
            <div className="related-articles-grid">
              {relatedArticles.map(related => (
                <article
                  key={related.slug}
                  className="related-article-card"
                  onClick={() => navigate(`/resources/${related.slug}`)}
                  role="link"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter') navigate(`/resources/${related.slug}`); }}
                >
                  <h4>{related.title}</h4>
                  <p>{related.category} · {related.readTime}</p>
                </article>
              ))}
            </div>
          </section>
        )}

        {/* Footer */}
        <footer className="article-footer">
          <p className="copyright">&copy; {new Date().getFullYear()} Scholay. All rights reserved.</p>
          <nav className="footer-links">
            <button onClick={() => navigate('/resources')}>资源中心</button>
            <span>|</span>
            <button onClick={() => navigate('/about')}>关于我们</button>
            <span>|</span>
            <button onClick={() => navigate('/contact')}>联系我们</button>
            <span>|</span>
            <button onClick={() => navigate('/privacy')}>隐私政策</button>
            <span>|</span>
            <button onClick={() => navigate('/terms')}>服务条款</button>
          </nav>
        </footer>
      </div>
    </div>
  );
};

export default ResourceArticlePage;
