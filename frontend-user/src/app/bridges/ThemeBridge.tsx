/**
 * ThemeBridge — 桥接层
 *
 * 让使用旧 useTheme() 的页面自动读取 Zustand themeStore。
 * 当所有页面迁移到 useThemeStore 后可删除此文件。
 */

import React, { createContext, useContext, useMemo } from 'react';
import { useThemeStore } from '../../shared/stores/themeStore';

type ThemeName = 'dark' | 'light';

interface ThemeContextValue {
  theme: ThemeName;
  toggleTheme: () => void;
  setTheme: (t: ThemeName) => void;
  resetToAutoTheme: () => void;
  isUserPreference: boolean;
  isDark: boolean;
  isLight: boolean;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export const ThemeBridgeProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const theme = useThemeStore((s) => s.theme);
  const isDark = useThemeStore((s) => s.isDark);
  const isLight = useThemeStore((s) => s.isLight);
  const isUserPreference = useThemeStore((s) => s.isUserPreference);
  const toggleTheme = useThemeStore((s) => s.toggleTheme);
  const setTheme = useThemeStore((s) => s.setTheme);
  const resetToAutoTheme = useThemeStore((s) => s.resetToAutoTheme);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      toggleTheme,
      setTheme,
      resetToAutoTheme,
      isUserPreference,
      isDark,
      isLight,
    }),
    [theme, isDark, isLight, isUserPreference, toggleTheme, setTheme, resetToAutoTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeBridgeProvider');
  }
  return context;
};
