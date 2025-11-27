import React, { createContext, useContext, useState, useEffect } from 'react';

const ThemeContext = createContext();

// localStorage 键名
const THEME_KEY = 'theme';
const USER_PREFERENCE_KEY = 'theme_user_preference'; // 用户是否手动设置过主题

// 根据当前时间获取推荐主题
// 日间模式: 6:00 - 18:00
// 夜间模式: 18:00 - 6:00
const getThemeByTime = () => {
  const hour = new Date().getHours();
  return (hour >= 6 && hour < 18) ? 'light' : 'dark';
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

export const ThemeProvider = ({ children }) => {
  // 初始化主题
  const [theme, setTheme] = useState(() => {
    const userPreference = localStorage.getItem(USER_PREFERENCE_KEY);
    const savedTheme = localStorage.getItem(THEME_KEY);
    
    // 如果用户手动设置过主题，使用用户的偏好
    if (userPreference === 'true' && savedTheme) {
      return savedTheme;
    }
    
    // 否则根据当前时间自动设置
    return getThemeByTime();
  });

  // 切换主题（用户手动切换）
  const toggleTheme = () => {
    setTheme(prevTheme => {
      const newTheme = prevTheme === 'dark' ? 'light' : 'dark';
      localStorage.setItem(THEME_KEY, newTheme);
      localStorage.setItem(USER_PREFERENCE_KEY, 'true'); // 标记用户已手动设置
      return newTheme;
    });
  };

  // 设置特定主题（用户手动设置）
  const setSpecificTheme = (themeName) => {
    setTheme(themeName);
    localStorage.setItem(THEME_KEY, themeName);
    localStorage.setItem(USER_PREFERENCE_KEY, 'true'); // 标记用户已手动设置
  };

  // 重置为自动模式（根据时间自动切换）
  const resetToAutoTheme = () => {
    localStorage.removeItem(USER_PREFERENCE_KEY);
    const autoTheme = getThemeByTime();
    setTheme(autoTheme);
    localStorage.setItem(THEME_KEY, autoTheme);
  };

  // 检查是否为用户手动设置的主题
  const isUserPreference = () => {
    return localStorage.getItem(USER_PREFERENCE_KEY) === 'true';
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

  // 定时检查是否需要根据时间自动切换主题（仅在非用户手动设置时）
  useEffect(() => {
    // 如果用户手动设置过，不自动切换
    if (isUserPreference()) {
      return;
    }

    // 每分钟检查一次是否需要切换主题
    const checkAndUpdateTheme = () => {
      if (!isUserPreference()) {
        const timeBasedTheme = getThemeByTime();
        if (timeBasedTheme !== theme) {
          setTheme(timeBasedTheme);
          localStorage.setItem(THEME_KEY, timeBasedTheme);
        }
      }
    };

    const intervalId = setInterval(checkAndUpdateTheme, 60000); // 每分钟检查

    return () => clearInterval(intervalId);
  }, [theme]);

  const value = {
    theme,
    toggleTheme,
    setTheme: setSpecificTheme,
    resetToAutoTheme,
    isUserPreference: isUserPreference(),
    isDark: theme === 'dark',
    isLight: theme === 'light'
  };

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
};
