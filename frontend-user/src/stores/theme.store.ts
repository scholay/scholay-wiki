import { useEffect, useState } from 'react';
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

function applyDocumentTheme(dark: boolean) {
  document.documentElement.classList.toggle('dark', dark);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', dark ? '#09090A' : '#F6F4EE');
}

/** persist 读完 localStorage 之前,不要用默认 light 把 index.html 的 FOUC 脚本盖掉。 */
export function useThemeHydrated() {
  const [ready, setReady] = useState(() => useThemeStore.persist.hasHydrated());
  useEffect(() => {
    if (useThemeStore.persist.hasHydrated()) {
      setReady(true);
      return;
    }
    return useThemeStore.persist.onFinishHydration(() => setReady(true));
  }, []);
  return ready;
}

export function useResolvedDark() {
  const theme = useThemeStore((s) => s.theme);
  const hydrated = useThemeHydrated();
  if (!hydrated && typeof document !== 'undefined') {
    return document.documentElement.classList.contains('dark');
  }
  return resolveTheme(theme) === 'dark';
}

/**
 * 把当前主题应用到 <html class>。在 App 顶层一次性挂上即可。
 */
export function useApplyTheme() {
  const theme = useThemeStore((s) => s.theme);
  const ready = useThemeHydrated();
  useEffect(() => {
    if (!ready) return;
    const apply = () => applyDocumentTheme(resolveTheme(theme) === 'dark');
    apply();
    if (theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [theme, ready]);
}
