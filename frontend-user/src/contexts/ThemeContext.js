/**
 * Compatibility layer – delegates entirely to the Zustand theme store.
 * ThemeProvider is now a no-op wrapper (side effects run in store module).
 */
import React from 'react';
import { useThemeStore, selectIsDark, selectIsLight } from '../stores/theme.store';

export const useTheme = () => {
  const theme = useThemeStore((s) => s.theme);
  const toggleTheme = useThemeStore((s) => s.toggleTheme);
  const setTheme = useThemeStore((s) => s.setTheme);
  const resetToAutoTheme = useThemeStore((s) => s.resetToAutoTheme);
  const isUserPreference = useThemeStore((s) => s.isUserPreference);
  const isDark = useThemeStore(selectIsDark);
  const isLight = useThemeStore(selectIsLight);

  return { theme, toggleTheme, setTheme, resetToAutoTheme, isUserPreference, isDark, isLight };
};

export const ThemeProvider = ({ children }) => children;
