/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 *
 * ResourceCenterPage - 学术资源中心页面
 * 展示原创学术指南文章列表，支持分类筛选
 */

import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Clock, Calendar, Search, FileText, BookOpen, Sparkles, Code } from 'lucide-react';
import SEO from '../components/SEO';
import FeaturePromo from '../components/FeaturePromo';
import resourceArticles, { RESOURCE_CATEGORIES } from './resourceArticles';
import './styles/ResourcePage.css';

const iconMap = {
  Search,
  FileText,
  BookOpen,
  Sparkles,
  Code,
};

const ResourceCenterPage = () => {
  const navigate = useNavigate();
  const [activeCategory, setActiveCategory] = useState('all');

  const filteredArticles = useMemo(() => {
    if (activeCategory === 'all') return resourceArticles;
    return resourceArticles.filter(a => a.category === activeCategory);
  }, [activeCategory]);

  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: '学术资源中心 - Scholay',
    description: 'Scholay 学术资源中心提供原创学术指南，涵盖文献检索技巧、论文写作方法、引用格式规范、研究方法论和 AI 学术工具使用教程。',
    url: 'https://www.scholay.com/resources',
    mainEntity: {
      '@type': 'ItemList',
      itemListElement: resourceArticles.map((article, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        url: `https://www.scholay.com/resources/${article.slug}`,
        name: article.title,
      })),
    },
  };

  return (
    <div className="resource-center-page">
      <SEO
        title="学术资源中心 - Scholay | 文献检索、论文写作与研究方法指南"
        description="Scholay 学术资源中心提供原创学术指南，涵盖文献检索技巧、论文写作方法、引用格式规范、研究方法论和 AI 学术工具使用教程，助力科研工作者提升效率。"
        keywords="学术资源,文献检索教程,论文写作技巧,引用格式指南,研究方法论,AI学术工具,LaTeX教程,文献综述写作,同行评审"
        canonical="/resources"
        structuredData={structuredData}
      />

      <div className="resource-center-container">
        <div className="resource-center-header">
          <button className="back-btn" onClick={() => navigate('/')}>
            <ArrowLeft size={20} />
            <span>返回首页</span>
          </button>
        </div>

        <div className="resource-center-hero">
          <h1>学术资源中心</h1>
          <p className="hero-description">
            精心编写的学术指南与教程，帮助研究者掌握文献检索、论文写作、引用规范和科研工具使用技巧，让学术之路更加顺畅。
          </p>
        </div>

        <div className="resource-categories">
          {RESOURCE_CATEGORIES.map(cat => (
            <button
              key={cat.id}
              className={`category-tag ${activeCategory === cat.id ? 'active' : ''}`}
              onClick={() => setActiveCategory(cat.id)}
            >
              {cat.label}
            </button>
          ))}
        </div>

        <div className="resource-grid">
          {filteredArticles.map(article => {
            const IconComponent = iconMap[article.categoryIcon] || BookOpen;
            return (
              <article
                key={article.slug}
                className="resource-card"
                onClick={() => navigate(`/resources/${article.slug}`)}
                role="link"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter') navigate(`/resources/${article.slug}`); }}
              >
                <div className="resource-card-category">
                  <IconComponent size={14} />
                  {article.category}
                </div>
                <h3>{article.title}</h3>
                <p className="resource-card-excerpt">{article.excerpt}</p>
                <div className="resource-card-meta">
                  <span><Clock size={13} />{article.readTime}</span>
                  <span><Calendar size={13} />{article.date}</span>
                </div>
              </article>
            );
          })}
        </div>

        {/* 功能推广 */}
        <FeaturePromo compact />

        {/* Footer */}
        <footer className="article-footer">
          <p className="copyright">&copy; {new Date().getFullYear()} Scholay. All rights reserved.</p>
          <nav className="footer-links">
            <button onClick={() => navigate('/blog')}>博客</button>
            <span>|</span>
            <button onClick={() => navigate('/about')}>关于我们</button>
            <span>|</span>
            <button onClick={() => navigate('/contact')}>联系我们</button>
            <span>|</span>
            <button onClick={() => navigate('/privacy')}>隐私政策</button>
            <span>|</span>
            <button onClick={() => navigate('/terms')}>服务条款</button>
            <span>|</span>
            <button onClick={() => navigate('/disclaimer')}>免责声明</button>
          </nav>
        </footer>
      </div>
    </div>
  );
};

export default ResourceCenterPage;
