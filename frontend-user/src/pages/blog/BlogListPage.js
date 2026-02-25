/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 *
 * BlogListPage - 博客列表页
 */

import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Clock, Calendar, Search, User } from 'lucide-react';
import SEO from '../../components/SEO';
import blogArticles, { BLOG_CATEGORIES, getAuthor } from './blogArticles';
import '../styles/ResourcePage.css';

const ARTICLES_PER_PAGE = 9;

const BlogListPage = () => {
  const navigate = useNavigate();
  const [activeCategory, setActiveCategory] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);

  const filteredArticles = useMemo(() => {
    if (activeCategory === 'all') return blogArticles;
    return blogArticles.filter(a => a.category === activeCategory);
  }, [activeCategory]);

  const totalPages = Math.ceil(filteredArticles.length / ARTICLES_PER_PAGE);
  const paginatedArticles = filteredArticles.slice(
    (currentPage - 1) * ARTICLES_PER_PAGE,
    currentPage * ARTICLES_PER_PAGE
  );

  const handleCategoryChange = (catId) => {
    setActiveCategory(catId);
    setCurrentPage(1);
  };

  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'Blog',
    name: 'Scholay 博客',
    description: 'Scholay 博客分享学术搜索技巧、AI 研究工具使用方法、论文写作指南和学术行业观察，助力科研工作者提升效率。',
    url: 'https://www.scholay.com/blog',
    publisher: {
      '@type': 'Organization',
      name: 'Scholay',
      url: 'https://www.scholay.com',
    },
    blogPost: blogArticles.slice(0, 10).map(article => ({
      '@type': 'BlogPosting',
      headline: article.title,
      url: `https://www.scholay.com/blog/${article.slug}`,
      datePublished: article.date,
      dateModified: article.updatedDate || article.date,
      author: {
        '@type': 'Person',
        name: getAuthor(article.author)?.name || 'Scholay',
      },
    })),
  };

  return (
    <div className="resource-center-page">
      <SEO
        title="Scholay 博客 | 学术搜索技巧、AI 研究工具与论文写作指南"
        description="Scholay 博客分享学术搜索技巧、AI 研究工具使用方法、论文写作指南和学术行业观察。原创深度文章助力科研工作者提升效率。"
        keywords="学术博客,AI学术工具,论文写作技巧,文献检索方法,学术搜索,科研效率,Scholay博客"
        canonical="/blog"
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
          <h1>Scholay 博客</h1>
          <p className="hero-description">
            分享学术搜索技巧、AI 研究工具实践、论文写作方法和行业深度观察，帮助研究者用更聪明的方式做科研。
          </p>
        </div>

        <div className="resource-categories">
          {BLOG_CATEGORIES.map(cat => (
            <button
              key={cat.id}
              className={`category-tag ${activeCategory === cat.id ? 'active' : ''}`}
              onClick={() => handleCategoryChange(cat.id)}
            >
              {cat.label}
            </button>
          ))}
        </div>

        <div className="resource-grid">
          {paginatedArticles.map(article => {
            const author = getAuthor(article.author);
            return (
              <article
                key={article.slug}
                className="resource-card"
                onClick={() => navigate(`/blog/${article.slug}`)}
                role="link"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter') navigate(`/blog/${article.slug}`); }}
              >
                <div className="resource-card-category">
                  {article.category}
                </div>
                <h3>{article.title}</h3>
                <p className="resource-card-excerpt">{article.excerpt}</p>
                <div className="resource-card-meta">
                  {author && (
                    <span><User size={13} />{author.name}</span>
                  )}
                  <span><Clock size={13} />{article.readTime}</span>
                  <span><Calendar size={13} />{article.date}</span>
                </div>
              </article>
            );
          })}
        </div>

        {totalPages > 1 && (
          <div className="blog-pagination">
            <button
              className="blog-page-btn"
              disabled={currentPage === 1}
              onClick={() => setCurrentPage(p => p - 1)}
            >
              上一页
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
              <button
                key={page}
                className={`blog-page-btn ${currentPage === page ? 'active' : ''}`}
                onClick={() => setCurrentPage(page)}
              >
                {page}
              </button>
            ))}
            <button
              className="blog-page-btn"
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage(p => p + 1)}
            >
              下一页
            </button>
          </div>
        )}

        <div className="article-cta">
          <h3>开始你的学术探索之旅</h3>
          <p>使用 Scholay 的 AI 智能搜索，覆盖超过 2 亿篇学术论文</p>
          <button className="article-cta-btn" onClick={() => navigate('/')}>
            <Search size={16} />
            开始搜索
          </button>
        </div>

        <footer className="article-footer">
          <p className="copyright">&copy; {new Date().getFullYear()} Scholay. All rights reserved.</p>
          <nav className="footer-links">
            <button onClick={() => navigate('/resources')}>学术资源</button>
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

export default BlogListPage;
