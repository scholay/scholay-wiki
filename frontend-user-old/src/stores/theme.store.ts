/**
 * theme.store —— V2 设计系统下只保留 light 模式
 * ============================================================================
 * 设计稿 scholay.pen 只有日间模式，所以这里把所有切换 API 改成 no-op，
 * 只对外暴露 `theme: 'light'` / `isDark: false` / `isLight: true` 保持兼容，
 * 避免引用方（NavBar 老菜单 / ThemeToggle）崩溃。
 *
 * 想彻底删除可以把 useTheme / selectIsDark 等也清理掉，并把所有 consumer 直接
 * 移除暗色相关分支。
 * ============================================================================
 */
import { create } from 'zustand';

type ThemeMode = 'light';

interface ThemeStore {
  theme: ThemeMode;
  isUserPreference: boolean;
  toggleTheme: () => void;
  setTheme: (theme: ThemeMode) => void;
  resetToAutoTheme: () => void;
}

function applyLightThemeToDOM() {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.className = 'light';
  root.setAttribute('data-theme', 'light');

  let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'theme-color';
    document.head.appendChild(meta);
  }
  meta.content = '#ffffff';
}

// 旧版本可能在 localStorage 里写过 theme='dark'；清掉以免误导。
if (typeof localStorage !== 'undefined') {
  try {
    if (localStorage.getItem('theme') === 'dark') localStorage.removeItem('theme');
  } catch { /* ignore */ }
}

export const useThemeStore = create<ThemeStore>(() => ({
  theme: 'light',
  isUserPreference: false,
  toggleTheme: () => { /* no-op：暗色已废弃 */ },
  setTheme:    () => { /* no-op */ },
  resetToAutoTheme: () => { /* no-op */ },
}));

// 启动时强制把 DOM 设为亮色
applyLightThemeToDOM();

// 兼容选择器
export const selectIsDark = () => false;
export const selectIsLight = () => true;

export const useTheme = () => {
  const theme = useThemeStore((s) => s.theme);
  const toggleTheme = useThemeStore((s) => s.toggleTheme);
  const setTheme = useThemeStore((s) => s.setTheme);
  const resetToAutoTheme = useThemeStore((s) => s.resetToAutoTheme);
  return {
    theme,
    toggleTheme,
    setTheme,
    resetToAutoTheme,
    isUserPreference: false,
    isDark: false,
    isLight: true,
  };
};
