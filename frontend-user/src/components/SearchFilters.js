import React, { useRef, useEffect } from 'react';
import YearHistogram from './YearHistogram';
import './SearchFilters.css';

const SearchFilters = ({ filters, onFiltersChange, isExpanded, onToggle }) => {
  const filtersPanelRef = useRef(null);

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
    'Sociology',
    'Political Science',
    'Business',
    'Environmental Science',
    'Geography',
    'History',
    'Philosophy',
    'Art',
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

  if (!isExpanded) return null;

  return (
    <div className="search-filters" ref={filtersPanelRef}>
      <div className="filters-header">
        <h3>筛选条件</h3>
        {hasActiveFilters() && (
          <button className="clear-filters-btn" onClick={handleClearFilters}>
            清除全部
          </button>
        )}
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

        {/* Open Access */}
        <div className="filter-group">
          <label className="checkbox-item open-access-toggle">
            <input
              type="checkbox"
              checked={filters.openAccessPdf === 'true'}
              onChange={handleOpenAccessToggle}
            />
            <span>仅显示开放获取论文 (Open Access)</span>
          </label>
        </div>

        {/* Fields of Study */}
        <div className="filter-group">
          <label className="filter-label">研究领域</label>
          <div className="checkbox-list scrollable">
            {fieldsOfStudy.map(field => (
              <label key={field} className="checkbox-item">
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

export default SearchFilters;
