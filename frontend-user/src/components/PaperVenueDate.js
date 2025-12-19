/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 * 
 * PaperVenueDate - 论文出版信息组件
 * 显示期刊/会议名称和出版日期
 */

import React, { memo } from 'react';
import PropTypes from 'prop-types';

const PaperVenueDate = memo(({
  venue,
  publicationDate,
  year,
  className = '',
}) => {
  if (!venue && !publicationDate && !year) {
    return null;
  }

  // 获取年份
  const displayYear = publicationDate 
    ? new Date(publicationDate).getFullYear() 
    : year;

  return (
    <p className={`search-result-paper-venue-date ${className}`}>
      {venue && (
        <span className="search-result-venue-name">{venue}</span>
      )}
      {venue && displayYear && ' · '}
      {displayYear && (
        <span className="pub-date pub-year">{displayYear}</span>
      )}
    </p>
  );
});

PaperVenueDate.displayName = 'PaperVenueDate';

PaperVenueDate.propTypes = {
  venue: PropTypes.string,
  publicationDate: PropTypes.string,
  year: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  className: PropTypes.string,
};

PaperVenueDate.defaultProps = {
  className: '',
};

export default PaperVenueDate;

