/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罗罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 * 
 * AuthorProfileCard - 作者信息卡片组件
 * 从 SearchResultsPage.js 提取
 */

import React, { memo } from 'react';
import PropTypes from 'prop-types';

/**
 * AuthorProfileCard 组件
 */
const AuthorProfileCard = memo(({ author }) => {
  if (!author) return null;

  return (
    <div className="author-profile-card">
      <div className="author-profile-main">
        <div className="author-profile-avatar">
          <span className="author-avatar-letter">
            {author.name ? author.name.charAt(0).toUpperCase() : 'A'}
          </span>
        </div>
        <div className="author-profile-info">
          <h1 className="author-profile-name">{author.name}</h1>
          {author.affiliations && author.affiliations.length > 0 && (
            <p className="author-profile-affiliation">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                <circle cx="12" cy="10" r="3"/>
              </svg>
              {author.affiliations[0]}
            </p>
          )}
          {author.homepage && (
            <a 
              href={author.homepage} 
              target="_blank" 
              rel="noopener" 
              className="author-profile-homepage"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/>
                <line x1="2" y1="12" x2="22" y2="12"/>
                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
              </svg>
              个人主页
            </a>
          )}
        </div>
      </div>
      <div className="author-profile-metrics">
        <div className="author-metric-item">
          <span className="author-metric-value">{author.paperCount || 0}</span>
          <span className="author-metric-label">发表论文</span>
        </div>
        <div className="author-metric-divider"></div>
        <div className="author-metric-item">
          <span className="author-metric-value">{author.hIndex || 0}</span>
          <span className="author-metric-label">H 指数</span>
        </div>
        <div className="author-metric-divider"></div>
        <div className="author-metric-item">
          <span className="author-metric-value">{(author.citationCount || 0).toLocaleString()}</span>
          <span className="author-metric-label">总被引</span>
        </div>
      </div>
    </div>
  );
});

AuthorProfileCard.displayName = 'AuthorProfileCard';

AuthorProfileCard.propTypes = {
  author: PropTypes.shape({
    name: PropTypes.string,
    affiliations: PropTypes.arrayOf(PropTypes.string),
    homepage: PropTypes.string,
    paperCount: PropTypes.number,
    hIndex: PropTypes.number,
    citationCount: PropTypes.number,
  }),
};

export default AuthorProfileCard;
