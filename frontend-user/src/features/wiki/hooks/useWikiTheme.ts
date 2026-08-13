import { useCallback, useEffect, useLayoutEffect, useState } from "react";

export type WikiTheme = "light" | "dark";

export const WIKI_THEME_STORAGE_KEY = "scholay.wiki.theme";
export const WIKI_THEME_ATTRIBUTE = "data-wiki-theme";
export const WIKI_DARK_MEDIA_QUERY = "(prefers-color-scheme: dark)";

function storedPreference(): WikiTheme | null {
  if (typeof window === "undefined") return null;

  try {
    const value = window.localStorage.getItem(WIKI_THEME_STORAGE_KEY);
    return value === "light" || value === "dark" ? value : null;
  } catch {
    return null;
  }
}

function systemTheme(): WikiTheme {
  if (
    typeof window === "undefined" ||
    typeof window.matchMedia !== "function"
  ) {
    return "light";
  }

  try {
    return window.matchMedia(WIKI_DARK_MEDIA_QUERY).matches ? "dark" : "light";
  } catch {
    return "light";
  }
}

function bootstrappedTheme(): WikiTheme | null {
  if (typeof document === "undefined") return null;
  const value = document.documentElement.getAttribute(WIKI_THEME_ATTRIBUTE);
  return value === "light" || value === "dark" ? value : null;
}

function persistPreference(theme: WikiTheme) {
  try {
    window.localStorage.setItem(WIKI_THEME_STORAGE_KEY, theme);
  } catch {
    // 隐私模式、配额耗尽等情况下仍允许本次会话切换，不让存储阻断 Wiki。
  }
}

/**
 * Wiki 独立主题状态。
 *
 * 没有人工选择时跟随系统；用户切换后保存明确的 light / dark 偏好。主题只通过
 * WikiLayout 的局部属性生效，html 上的同名属性只负责首屏预置与 portal 选色，
 * 不允许用来覆写全站根 token。
 */
export function useWikiTheme() {
  const [preference, setPreference] = useState<WikiTheme | null>(
    storedPreference,
  );
  const [preferredSystemTheme, setPreferredSystemTheme] = useState<WikiTheme>(
    () => bootstrappedTheme() ?? systemTheme(),
  );
  const theme = preference ?? preferredSystemTheme;

  // 直接访问 /wiki 时，index.html 已在主 bundle 前同步写入同一个属性；layout
  // 挂载后接管它。useLayoutEffect 保证 SPA 导航与切换不会多留一帧旧的 portal 主题。
  useLayoutEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    const themeColor = document.head.querySelector<HTMLMetaElement>(
      'meta[name="theme-color"]',
    );
    const wikiThemeColor = themeColor?.getAttribute(`data-wiki-${theme}-color`);
    root.setAttribute(WIKI_THEME_ATTRIBUTE, theme);
    if (themeColor && wikiThemeColor) themeColor.content = wikiThemeColor;

    return () => {
      if (root.getAttribute(WIKI_THEME_ATTRIBUTE) === theme) {
        root.removeAttribute(WIKI_THEME_ATTRIBUTE);
      }
      if (themeColor && themeColor.content === wikiThemeColor) {
        const defaultThemeColor = themeColor.getAttribute("data-default-color");
        if (defaultThemeColor) themeColor.content = defaultThemeColor;
      }
    };
  }, [theme]);

  useEffect(() => {
    if (preference !== null) return;
    if (
      typeof window === "undefined" ||
      typeof window.matchMedia !== "function"
    ) {
      return;
    }

    let media: MediaQueryList;
    try {
      media = window.matchMedia(WIKI_DARK_MEDIA_QUERY);
    } catch {
      return;
    }

    const update = (matches: boolean) =>
      setPreferredSystemTheme(matches ? "dark" : "light");
    const onChange = (event: MediaQueryListEvent) => update(event.matches);
    update(media.matches);

    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", onChange);
      return () => media.removeEventListener("change", onChange);
    }

    // Safari 13 等旧实现只有 addListener/removeListener；保持 Wiki 可降级运行。
    const legacyMedia = media as MediaQueryList & {
      addListener?: (listener: (event: MediaQueryListEvent) => void) => void;
      removeListener?: (listener: (event: MediaQueryListEvent) => void) => void;
    };
    legacyMedia.addListener?.(onChange);
    return () => legacyMedia.removeListener?.(onChange);
  }, [preference]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const onStorage = (event: StorageEvent) => {
      if (event.key !== null && event.key !== WIKI_THEME_STORAGE_KEY) return;
      const next =
        event.newValue === "light" || event.newValue === "dark"
          ? event.newValue
          : null;
      setPreference(next);
    };

    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const toggleTheme = useCallback(() => {
    setPreference((currentPreference) => {
      const currentTheme = currentPreference ?? preferredSystemTheme;
      const nextTheme: WikiTheme = currentTheme === "dark" ? "light" : "dark";
      persistPreference(nextTheme);
      return nextTheme;
    });
  }, [preferredSystemTheme]);

  return {
    theme,
    isDark: theme === "dark",
    toggleTheme,
  } as const;
}
