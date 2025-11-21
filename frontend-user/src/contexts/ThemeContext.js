import React, { createContext, useContext, useState, useEffect } from 'react';

const ThemeContext = createContext();

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

export const ThemeProvider = ({ children }) => {
  // 从localStorage获取保存的主题，默认为dark（夜间模式）
  const [theme, setTheme] = useState(() => {
    const savedTheme = localStorage.getItem('theme');
    return savedTheme || 'dark';
  });

  // 切换主题
  const toggleTheme = () => {
    setTheme(prevTheme => {
      const newTheme = prevTheme === 'dark' ? 'light' : 'dark';
      localStorage.setItem('theme', newTheme);
      return newTheme;
    });
  };

  // 设置特定主题
  const setSpecificTheme = (themeName) => {
    setTheme(themeName);
    localStorage.setItem('theme', themeName);
  };

  // 当主题改变时，更新document的class
  useEffect(() => {
    const root = document.documentElement;
    root.className = theme;
    
    // 也可以设置data-theme属性，方便CSS选择器使用
    root.setAttribute('data-theme', theme);
    
    // 更新meta标签的theme-color（影响浏览器地址栏颜色）
    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (metaThemeColor) {
      metaThemeColor.content = theme === 'dark' ? '#212121' : '#ffffff';
    } else {
      const meta = document.createElement('meta');
      meta.name = 'theme-color';
      meta.content = theme === 'dark' ? '#212121' : '#ffffff';
      document.head.appendChild(meta);
    }
  }, [theme]);

  const value = {
    theme,
    toggleTheme,
    setTheme: setSpecificTheme,
    isDark: theme === 'dark',
    isLight: theme === 'light'
  };

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
};
