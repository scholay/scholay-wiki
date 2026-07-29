import { useEffect } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type Theme = 'light' | 'dark' | 'system';

interface ThemeState {
  theme: Theme;
  setTheme: (t: Theme) => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: 'light',
      setTheme: (theme) => set({ theme }),
    }),
    { name: 'scholay.theme' }
  )
);

export function resolveTheme(theme: Theme): 'light' | 'dark' {
  if (theme === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
  }
  return theme;
}

/**
 * 把当前主题应用到 <html class>。在 App 顶层一次性挂上即可。
 */
export function useApplyTheme() {
  const theme = useThemeStore((s) => s.theme);
  useEffect(() => {
    const apply = () => {
      document.documentElement.classList.toggle(
        'dark',
        resolveTheme(theme) === 'dark',
      );
    };
    apply();
    if (theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [theme]);
}
