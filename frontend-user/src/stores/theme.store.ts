import { create } from 'zustand';

const THEME_KEY = 'theme';
const USER_PREFERENCE_KEY = 'theme_user_preference';

type ThemeMode = 'light' | 'dark';

function getThemeByTime(): ThemeMode {
  const hour = new Date().getHours();
  return hour >= 6 && hour < 18 ? 'light' : 'dark';
}

function getInitialTheme(): ThemeMode {
  const userPref = localStorage.getItem(USER_PREFERENCE_KEY);
  const saved = localStorage.getItem(THEME_KEY) as ThemeMode | null;
  if (userPref === 'true' && saved) return saved;
  return getThemeByTime();
}

interface ThemeStore {
  theme: ThemeMode;
  isUserPreference: boolean;

  toggleTheme: () => void;
  setTheme: (theme: ThemeMode) => void;
  resetToAutoTheme: () => void;
}

function applyThemeToDOM(theme: ThemeMode) {
  const root = document.documentElement;
  root.className = theme;
  root.setAttribute('data-theme', theme);

  let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'theme-color';
    document.head.appendChild(meta);
  }
  meta.content = theme === 'dark' ? '#212121' : '#ffffff';
}

export const useThemeStore = create<ThemeStore>((set, get) => ({
  theme: getInitialTheme(),
  isUserPreference: localStorage.getItem(USER_PREFERENCE_KEY) === 'true',

  toggleTheme: () => {
    const newTheme: ThemeMode = get().theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem(THEME_KEY, newTheme);
    localStorage.setItem(USER_PREFERENCE_KEY, 'true');
    applyThemeToDOM(newTheme);
    set({ theme: newTheme, isUserPreference: true });
  },

  setTheme: (theme) => {
    localStorage.setItem(THEME_KEY, theme);
    localStorage.setItem(USER_PREFERENCE_KEY, 'true');
    applyThemeToDOM(theme);
    set({ theme, isUserPreference: true });
  },

  resetToAutoTheme: () => {
    localStorage.removeItem(USER_PREFERENCE_KEY);
    const autoTheme = getThemeByTime();
    localStorage.setItem(THEME_KEY, autoTheme);
    applyThemeToDOM(autoTheme);
    set({ theme: autoTheme, isUserPreference: false });
  },
}));

// Apply theme on store creation (before React mounts)
applyThemeToDOM(useThemeStore.getState().theme);

// Auto-switch timer: check every minute when not user-preference
let autoTimerId: ReturnType<typeof setInterval> | null = null;

function startAutoThemeTimer() {
  if (autoTimerId) return;
  autoTimerId = setInterval(() => {
    const state = useThemeStore.getState();
    if (state.isUserPreference) return;
    const timeTheme = getThemeByTime();
    if (timeTheme !== state.theme) {
      localStorage.setItem(THEME_KEY, timeTheme);
      applyThemeToDOM(timeTheme);
      useThemeStore.setState({ theme: timeTheme });
    }
  }, 60_000);
}

startAutoThemeTimer();

// Derived selectors (avoid re-renders for unchanged values)
export const selectIsDark = (s: ThemeStore) => s.theme === 'dark';
export const selectIsLight = (s: ThemeStore) => s.theme === 'light';

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
