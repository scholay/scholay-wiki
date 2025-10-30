import React, { useState, useRef, useEffect } from 'react';
import './YearHistogram.css';

const YearHistogram = ({ yearFrom, yearTo, onChange }) => {
  // Real data from Semantic Scholar
  const HISTOGRAM_DATA = [
    { key: "1920-1922", docCount: 68980 },
    { key: "1922-1924", docCount: 79672 },
    { key: "1924-1926", docCount: 88293 },
    { key: "1926-1928", docCount: 97511 },
    { key: "1928-1930", docCount: 107498 },
    { key: "1930-1932", docCount: 152344 },
    { key: "1932-1934", docCount: 191913 },
    { key: "1934-1936", docCount: 197566 },
    { key: "1936-1938", docCount: 224764 },
    { key: "1938-1940", docCount: 227638 },
    { key: "1940-1942", docCount: 229315 },
    { key: "1942-1944", docCount: 180717 },
    { key: "1944-1946", docCount: 177185 },
    { key: "1946-1948", docCount: 304563 },
    { key: "1948-1950", docCount: 383166 },
    { key: "1950-1952", docCount: 518044 },
    { key: "1952-1954", docCount: 563295 },
    { key: "1954-1956", docCount: 598740 },
    { key: "1956-1958", docCount: 640507 },
    { key: "1958-1960", docCount: 708720 },
    { key: "1960-1962", docCount: 816118 },
    { key: "1962-1964", docCount: 897407 },
    { key: "1964-1966", docCount: 1066677 },
    { key: "1966-1968", docCount: 1225365 },
    { key: "1968-1970", docCount: 1411006 },
    { key: "1970-1972", docCount: 1629462 },
    { key: "1972-1974", docCount: 1660845 },
    { key: "1974-1976", docCount: 1764346 },
    { key: "1976-1978", docCount: 1880037 },
    { key: "1978-1980", docCount: 2046456 },
    { key: "1980-1982", docCount: 2272791 },
    { key: "1982-1984", docCount: 2372634 },
    { key: "1984-1986", docCount: 2611105 },
    { key: "1986-1988", docCount: 2899608 },
    { key: "1988-1990", docCount: 3234007 },
    { key: "1990-1992", docCount: 3644881 },
    { key: "1992-1994", docCount: 3909273 },
    { key: "1994-1996", docCount: 4341130 },
    { key: "1996-1998", docCount: 4915565 },
    { key: "1998-2000", docCount: 5527797 },
    { key: "2000-2002", docCount: 6605968 },
    { key: "2002-2004", docCount: 7683128 },
    { key: "2004-2006", docCount: 9449516 },
    { key: "2006-2008", docCount: 10933510 },
    { key: "2008-2010", docCount: 12740297 },
    { key: "2010-2012", docCount: 14576809 },
    { key: "2012-2014", docCount: 16237484 },
    { key: "2014-2016", docCount: 17277493 },
    { key: "2016-2018", docCount: 17205503 },
    { key: "2018-2020", docCount: 16796627 },
    { key: "2020-2022", docCount: 15815647 },
    { key: "2022-2024", docCount: 12550600 },
    { key: "2024-2026", docCount: 10286528 }
  ];

  const startYear = 1920;
  const endYear = 2026;
  const totalYears = endYear - startYear;

  // Initialize with provided values or defaults
  const [lowYear, setLowYear] = useState(yearFrom || startYear);
  const [highYear, setHighYear] = useState(yearTo || endYear);
  const [dragging, setDragging] = useState(null); // 'low' or 'high'
  const sliderRef = useRef(null);

  // Update internal state when props change (e.g., when filters are cleared)
  // But only if not currently dragging
  useEffect(() => {
    if (!dragging) {
      setLowYear(yearFrom || startYear);
      setHighYear(yearTo || endYear);
    }
  }, [yearFrom, yearTo, dragging, startYear, endYear]);

  const maxValue = Math.max(...HISTOGRAM_DATA.map(d => d.docCount));

  // Convert year to slider position (0-100%)
  const yearToPercent = (year) => {
    return ((year - startYear) / totalYears) * 100;
  };

  // Convert slider position to year
  const percentToYear = (percent) => {
    return Math.round(startYear + (percent / 100) * totalYears);
  };

  // Handle slider drag
  const handleMouseDown = (handle) => (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(handle);
  };

  useEffect(() => {
    if (!dragging) return;

    const handleMouseMove = (e) => {
      if (!sliderRef.current) return;

      const rect = sliderRef.current.getBoundingClientRect();
      const padding = 8; // Match the CSS padding
      const effectiveWidth = rect.width - padding * 2;
      const x = Math.max(padding, Math.min(e.clientX - rect.left, rect.width - padding));
      const percent = ((x - padding) / effectiveWidth) * 100;
      const year = percentToYear(percent);

      if (dragging === 'low') {
        const newLowYear = Math.min(year, highYear - 1);
        setLowYear(newLowYear);
      } else if (dragging === 'high') {
        const newHighYear = Math.max(year, lowYear + 1);
        setHighYear(newHighYear);
      }
    };

    const handleMouseUp = () => {
      // Call onChange when dragging ends
      onChange(lowYear, highYear);
      setDragging(null);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragging, lowYear, highYear, onChange, startYear, totalYears, yearToPercent, percentToYear]);

  const lowPercent = yearToPercent(lowYear);
  const highPercent = yearToPercent(highYear);

  return (
    <div className="year-histogram">

      {/* Histogram visualization with integrated handles */}
      <div className="histogram-container" ref={sliderRef}>
        <svg className="histogram-svg" viewBox="0 0 100 50" preserveAspectRatio="none">
          <defs>
            <linearGradient id="barGradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#4ade80" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#22c55e" stopOpacity="0.6" />
            </linearGradient>
            <linearGradient id="barGradientSelected" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#4ade80" stopOpacity="1" />
              <stop offset="100%" stopColor="#16a34a" stopOpacity="0.8" />
            </linearGradient>
          </defs>

          {HISTOGRAM_DATA.map((item, index) => {
            // Parse year range
            const [rangeStart, rangeEnd] = item.key.split('-').map(Number);
            const midYear = (rangeStart + rangeEnd) / 2;

            // Calculate position and size
            const x = ((midYear - startYear) / totalYears) * 100;
            const barWidth = ((rangeEnd - rangeStart) / totalYears) * 100 * 0.85; // 85% width for gaps
            const height = (item.docCount / maxValue) * 50;
            const y = 50 - height;

            // Check if in selected range
            const isInRange = rangeEnd >= lowYear && rangeStart <= highYear;

            return (
              <rect
                key={item.key}
                x={x - barWidth / 2}
                y={y}
                width={barWidth}
                height={height}
                fill={isInRange ? "url(#barGradientSelected)" : "url(#barGradient)"}
                opacity={isInRange ? 1 : 0.25}
                rx="0.5"
              />
            );
          })}
        </svg>

        {/* Low handle */}
        <div
          className="slider-handle slider-handle-low"
          style={{ left: `${lowPercent}%` }}
          onMouseDown={handleMouseDown('low')}
        >
          <div className="handle-label">{lowYear}</div>
        </div>

        {/* High handle */}
        <div
          className="slider-handle slider-handle-high"
          style={{ left: `${highPercent}%` }}
          onMouseDown={handleMouseDown('high')}
        >
          <div className="handle-label">{highYear}</div>
        </div>
      </div>

    </div>
  );
};

export default YearHistogram;
