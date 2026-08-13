// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WikiLayout } from "../src/features/wiki/components/WikiLayout";
import {
  WIKI_DARK_MEDIA_QUERY,
  WIKI_THEME_ATTRIBUTE,
  WIKI_THEME_STORAGE_KEY,
  useWikiTheme,
} from "../src/features/wiki/hooks/useWikiTheme";

const indexHtml = readFileSync(resolve(process.cwd(), "index.html"), "utf8");
const globalsCss = readFileSync(
  resolve(process.cwd(), "src/styles/globals.css"),
  "utf8",
);
const normalizedGlobalsCss = globalsCss.replaceAll('"', "'");
const DEFAULT_THEME_COLOR = "#F6F4EE";
const LIGHT_THEME_COLOR = "#FFFFFF";
const DARK_THEME_COLOR = "#0B0B0D";

interface MatchMediaController {
  listenerCount: () => number;
  setMatches: (matches: boolean) => void;
}

function installMatchMedia(initialMatches: boolean): MatchMediaController {
  let matches = initialMatches;
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  const media = {
    get matches() {
      return matches;
    },
    media: WIKI_DARK_MEDIA_QUERY,
    onchange: null,
    addEventListener: (
      type: string,
      listener: (event: MediaQueryListEvent) => void,
    ) => {
      if (type === "change") listeners.add(listener);
    },
    removeEventListener: (
      type: string,
      listener: (event: MediaQueryListEvent) => void,
    ) => {
      if (type === "change") listeners.delete(listener);
    },
    addListener: (listener: (event: MediaQueryListEvent) => void) =>
      listeners.add(listener),
    removeListener: (listener: (event: MediaQueryListEvent) => void) =>
      listeners.delete(listener),
    dispatchEvent: () => true,
  } as MediaQueryList;

  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn((query: string) => {
      expect(query).toBe(WIKI_DARK_MEDIA_QUERY);
      return media;
    }),
  });

  return {
    listenerCount: () => listeners.size,
    setMatches(nextMatches) {
      matches = nextMatches;
      const event = {
        matches,
        media: WIKI_DARK_MEDIA_QUERY,
      } as MediaQueryListEvent;
      listeners.forEach((listener) => listener(event));
    },
  };
}

function bootstrapSource(): string {
  const source = indexHtml.match(
    /<script id="wiki-theme-bootstrap">([\s\S]*?)<\/script>/,
  )?.[1];
  expect(source, "index.html 缺少同步 Wiki 主题引导脚本").toBeDefined();
  return source!;
}

function cssRuleBody(selector: string, after = 0): string {
  const selectorIndex = normalizedGlobalsCss.indexOf(selector, after);
  expect(selectorIndex, `globals.css 缺少选择器：${selector}`).toBeGreaterThan(
    -1,
  );
  const openBrace = normalizedGlobalsCss.indexOf(
    "{",
    selectorIndex + selector.length,
  );
  let depth = 1;
  let cursor = openBrace + 1;
  while (cursor < normalizedGlobalsCss.length && depth > 0) {
    if (normalizedGlobalsCss[cursor] === "{") depth += 1;
    if (normalizedGlobalsCss[cursor] === "}") depth -= 1;
    cursor += 1;
  }
  expect(depth, `${selector} 的 CSS 大括号不平衡`).toBe(0);
  return normalizedGlobalsCss.slice(openBrace + 1, cursor - 1);
}

function declaredVariables(ruleBody: string): string[] {
  return [...ruleBody.matchAll(/^\s*(--[a-z0-9-]+)\s*:/gm)].map(
    (match) => match[1],
  );
}

function executeBootstrap(pathname: string) {
  window.history.replaceState({}, "", pathname);
  document.documentElement.removeAttribute(WIKI_THEME_ATTRIBUTE);
  document.head.querySelector<HTMLMetaElement>(
    'meta[name="theme-color"]',
  )!.content = DEFAULT_THEME_COLOR;
  Function("window", "document", bootstrapSource())(window, document);
  return document.documentElement.getAttribute(WIKI_THEME_ATTRIBUTE);
}

beforeEach(() => {
  window.localStorage.clear();
  window.history.replaceState({}, "", "/wiki");
  document.documentElement.removeAttribute(WIKI_THEME_ATTRIBUTE);
  let themeColor = document.head.querySelector<HTMLMetaElement>(
    'meta[name="theme-color"]',
  );
  if (!themeColor) {
    themeColor = document.createElement("meta");
    themeColor.name = "theme-color";
    document.head.appendChild(themeColor);
  }
  themeColor.content = DEFAULT_THEME_COLOR;
  themeColor.setAttribute("data-default-color", DEFAULT_THEME_COLOR);
  themeColor.setAttribute("data-wiki-light-color", LIGHT_THEME_COLOR);
  themeColor.setAttribute("data-wiki-dark-color", DARK_THEME_COLOR);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.localStorage.clear();
  document.documentElement.removeAttribute(WIKI_THEME_ATTRIBUTE);
  document.head
    .querySelector<HTMLMetaElement>('meta[name="theme-color"]')
    ?.remove();
  Reflect.deleteProperty(window, "matchMedia");
});

describe("Wiki 主题状态", () => {
  it("没有人工偏好时首帧跟随系统，并持续响应系统主题变化", () => {
    const media = installMatchMedia(true);
    const { result, unmount } = renderHook(() => useWikiTheme());

    expect(result.current.theme).toBe("dark");
    expect(result.current.isDark).toBe(true);
    expect(document.documentElement.getAttribute(WIKI_THEME_ATTRIBUTE)).toBe(
      "dark",
    );
    expect(
      document.head.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
        ?.content,
    ).toBe(DARK_THEME_COLOR);
    expect(media.listenerCount()).toBe(1);

    act(() => media.setMatches(false));
    expect(result.current.theme).toBe("light");
    expect(document.documentElement.getAttribute(WIKI_THEME_ATTRIBUTE)).toBe(
      "light",
    );

    unmount();
    expect(document.documentElement.hasAttribute(WIKI_THEME_ATTRIBUTE)).toBe(
      false,
    );
    expect(
      document.head.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
        ?.content,
    ).toBe(DEFAULT_THEME_COLOR);
  });

  it("人工切换后持久化且停止跟随系统，重新挂载仍恢复该选择", () => {
    const media = installMatchMedia(false);
    const first = renderHook(() => useWikiTheme());

    act(() => first.result.current.toggleTheme());
    expect(first.result.current.theme).toBe("dark");
    expect(window.localStorage.getItem(WIKI_THEME_STORAGE_KEY)).toBe("dark");
    expect(media.listenerCount()).toBe(0);

    act(() => media.setMatches(false));
    expect(first.result.current.theme).toBe("dark");
    first.unmount();

    const second = renderHook(() => useWikiTheme());
    expect(second.result.current.theme).toBe("dark");
    second.unmount();
  });

  it("跨标签偏好变化会同步；删除偏好后重新跟随系统", () => {
    const media = installMatchMedia(false);
    const { result } = renderHook(() => useWikiTheme());

    act(() => {
      window.localStorage.setItem(WIKI_THEME_STORAGE_KEY, "dark");
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: WIKI_THEME_STORAGE_KEY,
          newValue: "dark",
        }),
      );
    });
    expect(result.current.theme).toBe("dark");
    expect(media.listenerCount()).toBe(0);

    act(() => {
      window.localStorage.removeItem(WIKI_THEME_STORAGE_KEY);
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: WIKI_THEME_STORAGE_KEY,
          newValue: null,
        }),
      );
    });
    expect(result.current.theme).toBe("light");
    expect(media.listenerCount()).toBe(1);
  });

  it("存储或 matchMedia 不可用时安全回落，不阻断会话内切换", () => {
    installMatchMedia(true);
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("privacy mode");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota exceeded");
    });

    const { result, unmount } = renderHook(() => useWikiTheme());
    expect(result.current.theme).toBe("dark");
    expect(() => act(() => result.current.toggleTheme())).not.toThrow();
    expect(result.current.theme).toBe("light");
    unmount();

    vi.restoreAllMocks();
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: () => {
        throw new Error("unsupported");
      },
    });
    const fallback = renderHook(() => useWikiTheme());
    expect(fallback.result.current.theme).toBe("light");
  });
});

describe("Wiki 主题首屏与边界契约", () => {
  it("同步引导脚本早于主模块，并且只标记精确 Wiki 路径", () => {
    expect(indexHtml.indexOf('id="wiki-theme-bootstrap"')).toBeGreaterThan(-1);
    expect(indexHtml.indexOf('id="wiki-theme-bootstrap"')).toBeLessThan(
      indexHtml.indexOf('src="/src/main.tsx"'),
    );

    installMatchMedia(true);
    expect(executeBootstrap("/wiki")).toBe("dark");
    expect(
      document.head.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
        ?.content,
    ).toBe(DARK_THEME_COLOR);
    expect(executeBootstrap("/wiki/account-connections")).toBe("dark");
    expect(executeBootstrap("/search")).toBeNull();
    expect(
      document.head.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
        ?.content,
    ).toBe(DEFAULT_THEME_COLOR);
    expect(executeBootstrap("/wiki-old")).toBeNull();
  });

  it("同步引导优先恢复持久化选择，读取失败时回落系统偏好", () => {
    installMatchMedia(true);
    window.localStorage.setItem(WIKI_THEME_STORAGE_KEY, "light");
    expect(executeBootstrap("/wiki")).toBe("light");
    expect(
      document.head.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
        ?.content,
    ).toBe(LIGHT_THEME_COLOR);

    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("privacy mode");
    });
    expect(executeBootstrap("/wiki/sources")).toBe("dark");
  });

  it("主题按钮暴露稳定名称、按钮语义及当前按压状态", () => {
    installMatchMedia(false);
    const { container } = render(
      <MemoryRouter initialEntries={["/wiki"]}>
        <WikiLayout />
      </MemoryRouter>,
    );

    const toggle = screen.getByRole("button", { name: "切换到夜间模式" });
    expect(toggle.getAttribute("type")).toBe("button");
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
    expect(toggle.querySelector("svg")?.getAttribute("aria-hidden")).toBe(
      "true",
    );

    fireEvent.click(toggle);
    const darkToggle = screen.getByRole("button", { name: "切换到日间模式" });
    expect(darkToggle.getAttribute("aria-pressed")).toBe("true");
    expect(
      container
        .querySelector(".wiki-doc-surface")
        ?.getAttribute(WIKI_THEME_ATTRIBUTE),
    ).toBe("dark");
  });

  it("暗色 token 只落在 Wiki 壳与 portal，不复活全站根主题", () => {
    const darkSection =
      normalizedGlobalsCss.indexOf("Wiki 夜间模式只属于文档路由");
    expect(darkSection, "globals.css 缺少 Wiki 夜间模式作用域").toBeGreaterThan(
      -1,
    );
    const darkRule = cssRuleBody(
      ".wiki-doc-surface[data-wiki-theme='dark']",
      darkSection,
    );

    expect(darkRule).toContain("color-scheme: dark");
    expect(darkRule).toContain("--background:");
    expect(darkRule).toContain("--foreground:");
    expect(darkRule).toContain("--surface-card:");
    expect(normalizedGlobalsCss).not.toMatch(
      /html\[data-wiki-theme='dark'\]\s*\{[^}]*--(?:background|surface|foreground|border|brand)-/s,
    );
    expect(globalsCss).not.toMatch(/\bdark:[a-z-]+/);
  });

  it("夜间井壁可暗化，但 canvas 完整恢复亮色产品 mock", () => {
    const darkSection =
      normalizedGlobalsCss.indexOf("Wiki 夜间模式只属于文档路由");
    const stageSection = normalizedGlobalsCss.indexOf("夜间只暗化井壁");
    const canvasSection = normalizedGlobalsCss.indexOf(
      "Fixture 是被文档引用的“原产品截图”",
    );
    expect(darkSection).toBeGreaterThan(-1);
    expect(stageSection).toBeGreaterThan(-1);
    expect(canvasSection).toBeGreaterThan(-1);
    const darkRule = cssRuleBody(
      ".wiki-doc-surface[data-wiki-theme='dark']",
      darkSection,
    );
    const stageRule = cssRuleBody(".wiki-embed-stage", stageSection);
    const canvasRule = cssRuleBody(".wiki-embed-canvas", canvasSection);
    const darkVariables = declaredVariables(darkRule);
    const canvasVariables = new Set(declaredVariables(canvasRule));

    expect(stageRule.match(/\binset\b/g)).toHaveLength(5);
    expect(canvasRule).toContain("color-scheme: light");
    expect(canvasRule).toMatch(/--background:\s*#f6f4ee/i);
    expect(canvasRule).toMatch(/--surface-card:\s*#ffffff/i);
    expect(canvasRule).toContain("--foreground: var(--ink-2)");
    expect(
      darkVariables.filter((variable) => !canvasVariables.has(variable)),
      "Wiki 暗色作用域新增 token 时，canvas 必须同时恢复亮色值，避免嵌入 mock 被污染",
    ).toEqual([]);
  });
});
