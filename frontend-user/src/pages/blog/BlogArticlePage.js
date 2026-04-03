/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 *
 * BlogArticlePage - 博客文章详情页
 */

import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Clock, Calendar, ChevronRight, Search, User } from 'lucide-react';
import SEO from '../../components/SEO';
import FeaturePromo, { matchFeatureByArticle } from '../../components/FeaturePromo';
import { getBlogArticleBySlug, getRelatedBlogArticles, getAuthor } from './blogArticles';
import '../styles/ResourcePage.css';

const BlogArticlePage = () => {
  const { slug } = useParams();
  const navigate = useNavigate();
  const article = getBlogArticleBySlug(slug);
  const relatedArticles = getRelatedBlogArticles(slug, 4);

  if (!article) {
    return (
      <div className="article-page">
        <div className="article-container">
          <div style={{ textAlign: 'center', padding: '80px 0', color: 'var(--text-tertiary)' }}>
            <h2 style={{ color: 'var(--text-primary)', marginBottom: 12 }}>文章未找到</h2>
            <p>该文章可能已被移动或删除</p>
            <button
              className="article-cta-btn"
              style={{ marginTop: 24 }}
              onClick={() => navigate('/blog')}
            >
              浏览全部文章
            </button>
          </div>
        </div>
      </div>
    );
  }

  const author = getAuthor(article.author);

  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: article.title,
    description: article.excerpt,
    datePublished: article.date,
    dateModified: article.updatedDate || article.date,
    author: {
      '@type': 'Person',
      name: author?.name || 'Scholay',
      jobTitle: author?.role || '',
      description: author?.bio || '',
    },
    publisher: {
      '@type': 'Organization',
      name: 'Scholay',
      url: 'https://www.scholay.com',
      logo: {
        '@type': 'ImageObject',
        url: 'https://www.scholay.com/brand-logo.svg',
      },
    },
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': `https://www.scholay.com/blog/${article.slug}`,
    },
    articleSection: article.category,
    keywords: article.tags.join(', '),
    wordCount: article.content.reduce((acc, block) => {
      if (block.type === 'paragraph' || block.type === 'tip') return acc + (block.text || '').length;
      return acc;
    }, 0),
  };

  const breadcrumbData = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: '首页', item: 'https://www.scholay.com/' },
      { '@type': 'ListItem', position: 2, name: '博客', item: 'https://www.scholay.com/blog' },
      { '@type': 'ListItem', position: 3, name: article.title, item: `https://www.scholay.com/blog/${article.slug}` },
    ],
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
        title={`${article.title} - Scholay 博客`}
        description={article.excerpt}
        keywords={article.tags.join(',')}
        canonical={`/blog/${article.slug}`}
        ogType="article"
        structuredData={[structuredData, breadcrumbData]}
      />

      <div className="article-container">
        <nav className="article-breadcrumb" aria-label="面包屑导航">
          <button onClick={() => navigate('/')}>首页</button>
          <ChevronRight size={14} />
          <button onClick={() => navigate('/blog')}>博客</button>
          <ChevronRight size={14} />
          <span>{article.category}</span>
        </nav>

        <div className="article-hero">
          <div className="article-category-badge">
            {article.category}
          </div>
          <h1>{article.title}</h1>
          <div className="article-meta">
            {author && (
              <span><User size={14} />{author.name}</span>
            )}
            <span><Clock size={14} />{article.readTime}阅读</span>
            <span><Calendar size={14} />{article.date}</span>
          </div>
          {author && (
            <div className="blog-author-card">
              <div className="blog-author-avatar">
                {author.name[0]}
              </div>
              <div className="blog-author-info">
                <div className="blog-author-name">{author.name}<span className="blog-author-role">{author.role}</span></div>
                <div className="blog-author-bio">{author.bio}</div>
              </div>
            </div>
          )}
        </div>

        <div className="article-body">
          {renderContent(article.content)}
        </div>

        {article.tags && article.tags.length > 0 && (
          <div className="blog-tags">
            {article.tags.map(tag => (
              <span key={tag} className="blog-tag">{tag}</span>
            ))}
          </div>
        )}

        {/* FeaturePromo 已移至 DocsLayout 右侧栏 */}

        {relatedArticles.length > 0 && (
          <section className="related-articles">
            <h2>相关推荐</h2>
            <div className="related-articles-grid">
              {relatedArticles.map(related => (
                <article
                  key={related.slug}
                  className="related-article-card"
                  onClick={() => navigate(`/blog/${related.slug}`)}
                  role="link"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter') navigate(`/blog/${related.slug}`); }}
                >
                  <h4>{related.title}</h4>
                  <p>{related.category} · {related.readTime}</p>
                </article>
              ))}
            </div>
          </section>
        )}


      </div>
    </div>
  );
};

export default BlogArticlePage;
