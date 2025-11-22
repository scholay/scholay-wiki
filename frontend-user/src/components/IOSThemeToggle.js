import React from 'react';
import { useTheme } from '../contexts/ThemeContext';
import './IOSThemeToggle.css';

const IOSThemeToggle = ({ className = '', showLabel = false }) => {
  const { theme, toggleTheme } = useTheme();

  return (
    <div className={`ios-theme-toggle-wrapper ${className}`}>
      {showLabel && (
        <span className="ios-theme-toggle-label">
          {theme === 'dark' ? '夜间模式' : '日间模式'}
        </span>
      )}
      <button
        className={`ios-theme-toggle ${theme}`}
        onClick={toggleTheme}
        aria-label={`切换到${theme === 'dark' ? '日间' : '夜间'}模式`}
        title={`切换到${theme === 'dark' ? '日间' : '夜间'}模式`}
      >
        <span className="ios-toggle-slider">
          <span className="ios-toggle-icon">
            {theme === 'dark' ? (
              // 月亮图标
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                <path d="M21.64 13a1 1 0 0 0-1.05-.14 8.05 8.05 0 0 1-3.37.73 8.15 8.15 0 0 1-8.14-8.1 8.59 8.59 0 0 1 .25-2A1 1 0 0 0 8 2.36a10.14 10.14 0 1 0 14 11.69 1 1 0 0 0-.36-1.05Zm-9.5 6.69A8.14 8.14 0 0 1 7.08 5.22v.27a10.15 10.15 0 0 0 10.14 10.14 9.79 9.79 0 0 0 2.1-.22 8.11 8.11 0 0 1-7.18 4.32v-.04Z"/>
              </svg>
            ) : (
              // 太阳图标
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 17.5a5.5 5.5 0 1 1 0-11 5.5 5.5 0 0 1 0 11Zm0-9.5a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0-3.5a.75.75 0 0 1-.75-.75V2.75a.75.75 0 0 1 1.5 0v1a.75.75 0 0 1-.75.75ZM12 19.5a.75.75 0 0 1 .75.75v1a.75.75 0 0 1-1.5 0v-1a.75.75 0 0 1 .75-.75ZM4.5 12a.75.75 0 0 1-.75.75h-1a.75.75 0 0 1 0-1.5h1a.75.75 0 0 1 .75.75ZM19.5 12a.75.75 0 0 1 .75-.75h1a.75.75 0 0 1 0 1.5h-1a.75.75 0 0 1-.75-.75ZM6.22 6.22a.75.75 0 0 1 0-1.06l.71-.71a.75.75 0 0 1 1.06 1.06l-.71.71a.75.75 0 0 1-1.06 0ZM17.78 17.78a.75.75 0 0 1 0 1.06l-.71.71a.75.75 0 0 1-1.06-1.06l.71-.71a.75.75 0 0 1 1.06 0ZM17.78 6.22a.75.75 0 0 1-1.06 0l-.71-.71a.75.75 0 0 1 1.06-1.06l.71.71a.75.75 0 0 1 0 1.06ZM6.22 17.78a.75.75 0 0 1 1.06 0l.71.71a.75.75 0 0 1-1.06 1.06l-.71-.71a.75.75 0 0 1 0-1.06Z"/>
              </svg>
            )}
          </span>
        </span>
      </button>
    </div>
  );
};

export default IOSThemeToggle;
