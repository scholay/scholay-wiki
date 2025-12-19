/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 * 
 * PaperAuthorsRow - 论文作者行组件
 * 显示作者标签和研究领域
 */

import React, { memo } from 'react';
import PropTypes from 'prop-types';

const PaperAuthorsRow = memo(({
  authors = [],
  fieldsOfStudy = [],
  currentAuthorId = null,
  maxAuthors = 4,
  maxFields = 2,
  onAuthorClick,
  className = '',
}) => {
  if (!authors || authors.length === 0) {
    return null;
  }

  const handleAuthorClick = (e, author) => {
    e.stopPropagation();
    onAuthorClick?.(author);
  };

  return (
    <div className={`search-result-paper-authors-row ${className}`}>
      <div className="search-result-paper-author-tags">
        {authors.slice(0, maxAuthors).map((author, idx) => (
          <span 
            key={author.authorId || idx} 
            className={`author-tag ${author.authorId === currentAuthorId ? 'current-author' : ''} ${onAuthorClick ? 'clickable' : ''}`}
            onClick={onAuthorClick ? (e) => handleAuthorClick(e, author) : undefined}
          >
            {author.name}
          </span>
        ))}
        {authors.length > maxAuthors && (
          <span className="author-tag author-more">
            +{authors.length - maxAuthors} authors
          </span>
        )}
      </div>
      
      {/* 研究领域 */}
      {fieldsOfStudy && fieldsOfStudy.length > 0 && (
        <span className="search-result-paper-fields">
          {fieldsOfStudy.slice(0, maxFields).join(', ')}
        </span>
      )}
    </div>
  );
});

PaperAuthorsRow.displayName = 'PaperAuthorsRow';

PaperAuthorsRow.propTypes = {
  authors: PropTypes.arrayOf(PropTypes.shape({
    authorId: PropTypes.string,
    name: PropTypes.string,
  })),
  fieldsOfStudy: PropTypes.arrayOf(PropTypes.string),
  currentAuthorId: PropTypes.string,
  maxAuthors: PropTypes.number,
  maxFields: PropTypes.number,
  onAuthorClick: PropTypes.func,
  className: PropTypes.string,
};

PaperAuthorsRow.defaultProps = {
  authors: [],
  fieldsOfStudy: [],
  currentAuthorId: null,
  maxAuthors: 4,
  maxFields: 2,
  className: '',
};

export default PaperAuthorsRow;

