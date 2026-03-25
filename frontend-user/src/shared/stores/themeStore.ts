/**
 * 主题状态 Store (Zustand)
 *
 * 完整替代 contexts/ThemeContext.js：
 *   - 明暗主题切换 + DOM 同步
 *   - 自动模式（根据时间自动切换）
 *   - 每分钟定时检查（非用户手动设置时）
 */

import { create } from 'zustand';

type ThemeName = 'dark' | 'light';

const THEME_KEY = 'theme';
const USER_PREFERENCE_KEY = 'theme_user_preference';
const AUTO_CHECK_INTERVAL = 60_000; // 1 分钟

const getThemeByTime = (): ThemeName => {
  const hour = new Date().getHours();
  return hour >= 6 && hour < 18 ? 'light' : 'dark';
};

const getInitialTheme = (): ThemeName => {
  const userPreference = localStorage.getItem(USER_PREFERENCE_KEY);
  const savedTheme = localStorage.getItem(THEME_KEY) as ThemeName | null;
  if (userPreference === 'true' && savedTheme) return savedTheme;
  return getThemeByTime();
};

function applyThemeToDOM(theme: ThemeName) {
  const root = document.documentElement;
  root.className = theme;
  root.setAttribute('data-theme', theme);

  let meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement('meta');
    (meta as HTMLMetaElement).name = 'theme-color';
    document.head.appendChild(meta);
  }
  (meta as HTMLMetaElement).content = theme === 'dark' ? '#212121' : '#ffffff';
}

interface ThemeStore {
  theme: ThemeName;
  isUserPreference: boolean;
  isDark: boolean;
  isLight: boolean;
  toggleTheme: () => void;
  setTheme: (t: ThemeName) => void;
  resetToAutoTheme: () => void;
}

/* ----------------------------------------------------------------
 * 定时自动切换定时器
 * ---------------------------------------------------------------- */

let autoThemeTimer: ReturnType<typeof setInterval> | null = null;

function startAutoThemeTimer() {
  stopAutoThemeTimer();
  autoThemeTimer = setInterval(() => {
    const state = useThemeStore.getState();
    if (state.isUserPreference) return;

    const timeTheme = getThemeByTime();
    if (timeTheme !== state.theme) {
      applyThemeToDOM(timeTheme);
      localStorage.setItem(THEME_KEY, timeTheme);
      useThemeStore.setState({
        theme: timeTheme,
        isDark: timeTheme === 'dark',
        isLight: timeTheme === 'light',
      });
    }
  }, AUTO_CHECK_INTERVAL);
}

function stopAutoThemeTimer() {
  if (autoThemeTimer) {
    clearInterval(autoThemeTimer);
    autoThemeTimer = null;
  }
}

/* ----------------------------------------------------------------
 * Store 定义
 * ---------------------------------------------------------------- */

export const useThemeStore = create<ThemeStore>()((set, get) => {
  const initial = getInitialTheme();
  applyThemeToDOM(initial);

  // 如果非用户手动设置，启动定时检查
  const isUserPref = localStorage.getItem(USER_PREFERENCE_KEY) === 'true';
  if (!isUserPref) {
    startAutoThemeTimer();
  }

  return {
    theme: initial,
    isUserPreference: isUserPref,
    isDark: initial === 'dark',
    isLight: initial === 'light',

    toggleTheme: () => {
      const next: ThemeName = get().theme === 'dark' ? 'light' : 'dark';
      localStorage.setItem(THEME_KEY, next);
      localStorage.setItem(USER_PREFERENCE_KEY, 'true');
      applyThemeToDOM(next);
      stopAutoThemeTimer();
      set({
        theme: next,
        isDark: next === 'dark',
        isLight: next === 'light',
        isUserPreference: true,
      });
    },

    setTheme: (t: ThemeName) => {
      localStorage.setItem(THEME_KEY, t);
      localStorage.setItem(USER_PREFERENCE_KEY, 'true');
      applyThemeToDOM(t);
      stopAutoThemeTimer();
      set({
        theme: t,
        isDark: t === 'dark',
        isLight: t === 'light',
        isUserPreference: true,
      });
    },

    resetToAutoTheme: () => {
      localStorage.removeItem(USER_PREFERENCE_KEY);
      const auto = getThemeByTime();
      localStorage.setItem(THEME_KEY, auto);
      applyThemeToDOM(auto);
      startAutoThemeTimer();
      set({
        theme: auto,
        isDark: auto === 'dark',
        isLight: auto === 'light',
        isUserPreference: false,
      });
    },
  };
});

/* 选择器 */
export const useTheme = () => useThemeStore((s) => s.theme);
export const useIsDark = () => useThemeStore((s) => s.isDark);
