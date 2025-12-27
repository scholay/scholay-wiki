/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 * 
 * FilterSidebar - 搜索结果筛选侧边栏组件
 * Google Scholar 风格的筛选器
 */

import React, { useState, useMemo } from 'react';
import PropTypes from 'prop-types';
import { FIELDS_OF_STUDY } from '../utils/constants';
import './FilterSidebar.css';

const FilterSidebar = ({ filters, onApplyFilters }) => {
  const [showCustomYearRange, setShowCustomYearRange] = useState(false);
  const [customYearFrom, setCustomYearFrom] = useState('');
  const [customYearTo, setCustomYearTo] = useState('');
  const [showAllFields, setShowAllFields] = useState(false);

  const currentYear = useMemo(() => new Date().getFullYear(), []);

  const yearOptions = useMemo(() => [
    { value: '', label: '时间不限' },
    { value: String(currentYear), label: `${currentYear}年至今` },
    { value: String(currentYear - 1), label: `${currentYear - 1}年至今` },
    { value: String(currentYear - 4), label: `${currentYear - 4}年至今` },
  ], [currentYear]);

  // 检查是否有自定义年份范围
  const customYearDisplay = useMemo(() => {
    return (filters.yearFrom || filters.yearTo) && 
      !yearOptions.slice(1).some(opt => opt.value === filters.yearFrom && !filters.yearTo);
  }, [filters.yearFrom, filters.yearTo, yearOptions]);

  const handleYearOptionClick = (value) => {
    setShowCustomYearRange(false);
    setCustomYearFrom('');
    setCustomYearTo('');
    onApplyFilters({ ...filters, yearFrom: value, yearTo: '' });
  };

  const handleCustomYearToggle = () => {
    if (customYearDisplay && !showCustomYearRange) {
      setCustomYearFrom(filters.yearFrom || '');
      setCustomYearTo(filters.yearTo || '');
    }
    setShowCustomYearRange(!showCustomYearRange);
  };

  const handleCustomYearApply = () => {
    if (customYearFrom || customYearTo) {
      onApplyFilters({ 
        ...filters, 
        yearFrom: customYearFrom, 
        yearTo: customYearTo 
      });
      setShowCustomYearRange(false);
    }
  };

  const handleOpenAccessChange = (value) => {
    onApplyFilters({ ...filters, openAccessPdf: value });
  };

  const handleCitationChange = (value) => {
    onApplyFilters({ ...filters, minCitationCount: value });
  };

  const handleFieldToggle = (fieldKey) => {
    const currentFields = filters.fieldsOfStudy || [];
    const newFields = currentFields.includes(fieldKey)
      ? currentFields.filter(f => f !== fieldKey)
      : [...currentFields, fieldKey];
    onApplyFilters({ ...filters, fieldsOfStudy: newFields });
  };

  const displayedFields = showAllFields ? FIELDS_OF_STUDY : FIELDS_OF_STUDY.slice(0, 6);

  return (
    <div className="filter-sidebar">
      {/* 时间筛选 */}
      <div className="filter-group">
        <div className="filter-options">
          {yearOptions.map((opt) => (
            <button 
              key={opt.value || 'unlimited'}
              className={`filter-option ${
                opt.value === '' 
                  ? (!filters.yearFrom && !filters.yearTo ? 'active' : '')
                  : (filters.yearFrom === opt.value && !filters.yearTo && !showCustomYearRange ? 'active' : '')
              }`}
              onClick={() => handleYearOptionClick(opt.value)}
            >
              {opt.label}
            </button>
          ))}
          
          {/* 自定义范围按钮 */}
          <button 
            className={`filter-option ${showCustomYearRange || customYearDisplay ? 'active' : ''}`}
            onClick={handleCustomYearToggle}
          >
            {customYearDisplay && !showCustomYearRange
              ? `${filters.yearFrom || ''}-${filters.yearTo || ''}`
              : '自定义范围...'}
          </button>
        </div>
        
        {/* 自定义年份范围输入 */}
        {showCustomYearRange && (
          <div className="filter-year-range">
            <input 
              type="number"
              className="filter-year-input"
              placeholder="起始"
              value={customYearFrom}
              onChange={(e) => setCustomYearFrom(e.target.value)}
              min="1900"
              max={currentYear}
            />
            <span className="filter-year-separator">-</span>
            <input 
              type="number"
              className="filter-year-input"
              placeholder="结束"
              value={customYearTo}
              onChange={(e) => setCustomYearTo(e.target.value)}
              min="1900"
              max={currentYear}
            />
            <button 
              className="filter-year-apply"
              onClick={handleCustomYearApply}
            >
              确定
            </button>
          </div>
        )}
      </div>

      <div className="filter-divider" />

      {/* PDF开源 */}
      <div className="filter-group">
        <div className="filter-options">
          <button 
            className={`filter-option ${!filters.openAccessPdf ? 'active' : ''}`}
            onClick={() => handleOpenAccessChange('')}
          >
            全部
          </button>
          <button 
            className={`filter-option ${filters.openAccessPdf === 'true' ? 'active' : ''}`}
            onClick={() => handleOpenAccessChange('true')}
          >
            PDF开源
          </button>
        </div>
      </div>

      <div className="filter-divider" />

      {/* 引用次数筛选 */}
      <div className="filter-group">
        <div className="filter-options">
          <button 
            className={`filter-option ${!filters.minCitationCount ? 'active' : ''}`}
            onClick={() => handleCitationChange('')}
          >
            被引次数不限
          </button>
          {['10', '50', '100', '500'].map(count => (
            <button 
              key={count}
              className={`filter-option ${filters.minCitationCount === count ? 'active' : ''}`}
              onClick={() => handleCitationChange(count)}
            >
              ≥{count}
            </button>
          ))}
        </div>
      </div>

      <div className="filter-divider" />

      {/* 研究领域 */}
      <div className="filter-group">
        <div className="filter-group-title">
          研究领域
        </div>
        <div className="filter-field-list">
          {displayedFields.map(field => (
            <label 
              key={field.key}
              className={`filter-field-item ${filters.fieldsOfStudy?.includes(field.key) ? 'selected' : ''}`}
            >
              <input 
                type="checkbox"
                className="filter-field-checkbox"
                checked={filters.fieldsOfStudy?.includes(field.key) || false}
                onChange={() => handleFieldToggle(field.key)}
              />
              <span>{field.label}</span>
            </label>
          ))}
        </div>
        <button 
          className="filter-show-more"
          onClick={() => setShowAllFields(!showAllFields)}
        >
          {showAllFields ? '收起' : `展开更多 (${FIELDS_OF_STUDY.length - 6})`}
        </button>
      </div>
    </div>
  );
};

FilterSidebar.propTypes = {
  filters: PropTypes.shape({
    yearFrom: PropTypes.string,
    yearTo: PropTypes.string,
    openAccessPdf: PropTypes.string,
    minCitationCount: PropTypes.string,
    fieldsOfStudy: PropTypes.arrayOf(PropTypes.string),
  }).isRequired,
  onApplyFilters: PropTypes.func.isRequired,
};

export default React.memo(FilterSidebar);

