import React from 'react';
import YearHistogram from './YearHistogram';
import './FilterSidebar.css';

const FilterSidebar = ({ filters, onFiltersChange, resultsTotal }) => {

  const publicationTypes = [
    { value: 'JournalArticle', label: 'Journal Article' },
    { value: 'Conference', label: 'Conference' },
    { value: 'Book', label: 'Book' },
    { value: 'BookSection', label: 'Book Section' },
    { value: 'Dataset', label: 'Dataset' },
  ];

  const fieldsOfStudy = [
    'Computer Science',
    'Medicine',
    'Biology',
    'Chemistry',
    'Physics',
    'Mathematics',
    'Engineering',
    'Materials Science',
    'Economics',
    'Psychology',
  ];

  const handleYearChange = (yearFrom, yearTo) => {
    onFiltersChange({ ...filters, yearFrom: String(yearFrom), yearTo: String(yearTo) });
  };

  const handlePublicationTypeToggle = (type) => {
    const current = filters.publicationTypes || [];
    const updated = current.includes(type)
      ? current.filter(t => t !== type)
      : [...current, type];
    onFiltersChange({ ...filters, publicationTypes: updated });
  };

  const handleFieldOfStudyToggle = (field) => {
    const current = filters.fieldsOfStudy || [];
    const updated = current.includes(field)
      ? current.filter(f => f !== field)
      : [...current, field];
    onFiltersChange({ ...filters, fieldsOfStudy: updated });
  };

  const handleOpenAccessToggle = () => {
    onFiltersChange({ ...filters, openAccessPdf: filters.openAccessPdf ? '' : 'true' });
  };

  const handleVenueChange = (e) => {
    onFiltersChange({ ...filters, venue: e.target.value });
  };

  const handleClearFilters = () => {
    onFiltersChange({
      yearFrom: '',
      yearTo: '',
      publicationTypes: [],
      fieldsOfStudy: [],
      openAccessPdf: '',
      venue: '',
    });
  };

  const hasActiveFilters = () => {
    return filters.yearFrom || filters.yearTo ||
           (filters.publicationTypes && filters.publicationTypes.length > 0) ||
           (filters.fieldsOfStudy && filters.fieldsOfStudy.length > 0) ||
           filters.openAccessPdf || filters.venue;
  };

  return (
    <div className="filter-sidebar">
      <div className="filter-sidebar-header">
        <h2>筛选条件</h2>
        {hasActiveFilters() && (
          <button className="clear-all-btn" onClick={handleClearFilters}>
            清除
          </button>
        )}
      </div>

      <div className="filter-sidebar-content">
        {/* Year Range with Histogram */}
        <div className="filter-section">
          <div className="filter-section-title-wrapper">
            <h3 className="filter-section-title">发表年份</h3>
            {(filters.yearFrom || filters.yearTo) && (
              <span className="year-range-display">
                {filters.yearFrom || '1920'} - {filters.yearTo || '2026'}
              </span>
            )}
          </div>
          <YearHistogram
            yearFrom={filters.yearFrom ? parseInt(filters.yearFrom) : undefined}
            yearTo={filters.yearTo ? parseInt(filters.yearTo) : undefined}
            onChange={handleYearChange}
          />
        </div>

        {/* Open Access */}
        <div className="filter-section">
          <label className="filter-option open-access">
            <input
              type="checkbox"
              checked={filters.openAccessPdf === 'true'}
              onChange={handleOpenAccessToggle}
            />
            <span>仅开放获取</span>
          </label>
        </div>

        {/* Fields of Study */}
        <div className="filter-section">
          <h3 className="filter-section-title">研究领域</h3>
          <div className="filter-options scrollable">
            {fieldsOfStudy.map(field => (
              <label key={field} className="filter-option">
                <input
                  type="checkbox"
                  checked={(filters.fieldsOfStudy || []).includes(field)}
                  onChange={() => handleFieldOfStudyToggle(field)}
                />
                <span>{field}</span>
              </label>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default FilterSidebar;
