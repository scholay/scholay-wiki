/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 */

import React, { useRef, useEffect, memo } from 'react';
import YearHistogram from './YearHistogram';
import './SearchFilters.css';

const SearchFilters = memo(({ filters, onFiltersChange, isExpanded, onToggle }) => {
  const filtersPanelRef = useRef(null);
  const overlayRef = useRef(null);

  const handleOverlayClick = (e) => {
    if (e.target === overlayRef.current) {
      onToggle();
    }
  };

  useEffect(() => {
    const updateMaxHeight = () => {
      if (filtersPanelRef.current && isExpanded) {
        const rect = filtersPanelRef.current.getBoundingClientRect();
        const viewportHeight = window.innerHeight;
        const availableHeight = viewportHeight - rect.top - 20; // 20px bottom padding
        filtersPanelRef.current.style.maxHeight = `${Math.max(200, availableHeight)}px`;
      }
    };

    if (isExpanded) {
      // Update on mount and when expanded
      setTimeout(updateMaxHeight, 0);

      // Update on window resize
      window.addEventListener('resize', updateMaxHeight);
      return () => window.removeEventListener('resize', updateMaxHeight);
    }
  }, [isExpanded]);

  const fieldsOfStudy = [
    { value: 'Computer Science', label: '计算机科学' },
    { value: 'Medicine', label: '医学' },
    { value: 'Biology', label: '生物学' },
    { value: 'Chemistry', label: '化学' },
    { value: 'Physics', label: '物理学' },
    { value: 'Mathematics', label: '数学' },
    { value: 'Engineering', label: '工程学' },
    { value: 'Materials Science', label: '材料科学' },
    { value: 'Economics', label: '经济学' },
    { value: 'Psychology', label: '心理学' },
    { value: 'Sociology', label: '社会学' },
    { value: 'Political Science', label: '政治学' },
    { value: 'Business', label: '商业' },
    { value: 'Environmental Science', label: '环境科学' },
    { value: 'Geography', label: '地理学' },
    { value: 'History', label: '历史学' },
    { value: 'Philosophy', label: '哲学' },
    { value: 'Art', label: '艺术' },
  ];

  const handleYearChange = (yearFrom, yearTo) => {
    onFiltersChange({ ...filters, yearFrom: String(yearFrom), yearTo: String(yearTo) });
  };

  const handleFieldOfStudyToggle = (field) => {
    const current = filters.fieldsOfStudy || [];
    const updated = current.includes(field)
      ? current.filter(f => f !== field)
      : [...current, field];
    onFiltersChange({ ...filters, fieldsOfStudy: updated });
  };

  const handleClearFieldsOfStudy = () => {
    onFiltersChange({ ...filters, fieldsOfStudy: [] });
  };

  const handleOpenAccessToggle = () => {
    onFiltersChange({ ...filters, openAccessPdf: filters.openAccessPdf ? '' : 'true' });
  };

  const handleMinCitationChange = (value) => {
    onFiltersChange({ ...filters, minCitationCount: value });
  };

  const handleClearFilters = () => {
    onFiltersChange({
      yearFrom: '',
      yearTo: '',
      publicationTypes: [],
      fieldsOfStudy: [],
      openAccessPdf: '',
      venue: '',
      minCitationCount: '',
    });
  };

  const hasActiveFilters = () => {
    return filters.yearFrom || filters.yearTo ||
           (filters.publicationTypes && filters.publicationTypes.length > 0) ||
           (filters.fieldsOfStudy && filters.fieldsOfStudy.length > 0) ||
           filters.openAccessPdf || filters.venue || filters.minCitationCount;
  };

  // 最小引用次数选项
  const citationOptions = [
    { value: '', label: '不限' },
    { value: '10', label: '≥ 10' },
    { value: '50', label: '≥ 50' },
    { value: '100', label: '≥ 100' },
    { value: '500', label: '≥ 500' },
    { value: '1000', label: '≥ 1000' },
  ];

  return (
    <div className={`filters-container ${isExpanded ? 'expanded' : ''}`}>
      {/* 蒙层 */}
      <div className="filters-overlay" ref={overlayRef} onClick={handleOverlayClick} />

      {/* 筛选面板 */}
      <div className="search-filters" ref={filtersPanelRef}>
      <div className="filters-header">
        <h3>筛选条件</h3>
        <button
          className={`clear-filters-btn ${hasActiveFilters() ? 'visible' : ''}`}
          onClick={handleClearFilters}
          disabled={!hasActiveFilters()}
        >
          清除全部
        </button>
      </div>

      <div className="filters-content">
        {/* Year Range with Histogram */}
        <div className="filter-group year-filter-group">
          <label className="filter-label">发表年份</label>
          <YearHistogram
            yearFrom={filters.yearFrom ? parseInt(filters.yearFrom) : undefined}
            yearTo={filters.yearTo ? parseInt(filters.yearTo) : undefined}
            onChange={handleYearChange}
          />
        </div>

        {/* Min Citation Count */}
        <div className="filter-group">
          <label className="filter-label">被引次数不低于</label>
          <div className="citation-options">
            {citationOptions.map(option => (
              <button
                key={option.value}
                type="button"
                className={`citation-option-btn ${(filters.minCitationCount || '') === option.value ? 'active' : ''}`}
                onClick={() => handleMinCitationChange(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {/* Open Access - Toggle Switch */}
        <div className="filter-group">
          <div className="open-access-switch-container">
            <span className="switch-label">仅显示开放获取论文 (Open Access)</span>
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={filters.openAccessPdf === 'true'}
                onChange={handleOpenAccessToggle}
              />
              <span className="toggle-slider"></span>
            </label>
          </div>
        </div>

        {/* Fields of Study */}
        <div className="filter-group">
          <div className="filter-label-row">
            <label className="filter-label">研究领域</label>
            {filters.fieldsOfStudy && filters.fieldsOfStudy.length > 0 && (
              <button
                type="button"
                className="clear-section-btn"
                onClick={handleClearFieldsOfStudy}
              >
                清除
              </button>
            )}
          </div>
          <div className="checkbox-list scrollable">
            {fieldsOfStudy.map(field => {
              const isChecked = (filters.fieldsOfStudy || []).includes(field.value);
              return (
                <label key={field.value} className="checkbox-item">
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => handleFieldOfStudyToggle(field.value)}
                  />
                  <span>{field.label}</span>
                </label>
              );
            })}
          </div>
        </div>
      </div>

      {/* 底部应用按钮 */}
      <div className="filters-footer">
        <button
          className="apply-filters-btn"
          onClick={onToggle}
        >
          确定
        </button>
        </div>
      </div>
    </div>
  );
});

export default SearchFilters;
