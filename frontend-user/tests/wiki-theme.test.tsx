// @vitest-environment jsdom

import { readdirSync, readFileSync } from "node:fs";
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
import { WikiEmbedBrandLogo } from "../src/features/wiki/embeds/WikiEmbedBrandLogo";
import { WikiEmbedFrame } from "../src/features/wiki/embeds/WikiEmbedFrame";
import { WikiEmbedList } from "../src/features/wiki/embeds/WikiEmbedList";
import { WikiEmbedPdfChatWorkspace } from "../src/features/wiki/embeds/WikiEmbedPdfChatWorkspace";
import { WIKI_EMBED_REGISTRY } from "../src/features/wiki/embeds/registry";
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
const wikiEmbedDirectory = resolve(process.cwd(), "src/features/wiki/embeds");
const wikiEmbedSources = readdirSync(wikiEmbedDirectory)
  .filter((fileName) => /^WikiEmbed.*\.tsx$/.test(fileName))
  .map((fileName) => ({
    fileName,
    source: readFileSync(resolve(wikiEmbedDirectory, fileName), "utf8"),
  }));
const DEFAULT_THEME_COLOR = "#F6F4EE";
const LIGHT_THEME_COLOR = "#FFFFFF";
const DARK_THEME_COLOR = "#0B0B0D";

function ThemePolicyFixture() {
  return <div data-testid="theme-policy-fixture" />;
}

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
    expect(darkRule).toContain("--inverse: var(--ink-11)");
    expect(darkRule).toContain("--on-inverse: var(--ink-2)");
    expect(darkRule).toContain("--surface-card:");
    expect(normalizedGlobalsCss).not.toMatch(
      /html\[data-wiki-theme='dark'\]\s*\{[^}]*--(?:background|surface|foreground|border|brand)-/s,
    );
    expect(globalsCss).not.toMatch(/\bdark:[a-z-]+/);
  });

  it("嵌入和注册表默认跟随 Wiki，同时保留显式浅色岛能力", () => {
    const { container, rerender } = render(
      <WikiEmbedFrame caption="默认主题">
        <ThemePolicyFixture />
      </WikiEmbedFrame>,
    );
    expect(
      container
        .querySelector(".wiki-embed-canvas")
        ?.getAttribute("data-wiki-embed-theme"),
    ).toBe("follow-wiki");

    rerender(
      <WikiEmbedFrame caption="浅色主题" themePolicy="light-only">
        <ThemePolicyFixture />
      </WikiEmbedFrame>,
    );
    expect(
      container
        .querySelector(".wiki-embed-canvas")
        ?.getAttribute("data-wiki-embed-theme"),
    ).toBe("light-only");

    rerender(<WikiEmbedList embeds={[{ id: "common-agent-status" }]} />);
    expect(
      container
        .querySelector(".wiki-embed-canvas")
        ?.getAttribute("data-wiki-embed-theme"),
    ).toBe("follow-wiki");
    expect(WIKI_EMBED_REGISTRY["common-agent-status"].themePolicy).toBe(
      undefined,
    );
    expect(WIKI_EMBED_REGISTRY["wechat-qr-login"].themePolicy).toBeUndefined();
    expect(
      WIKI_EMBED_REGISTRY["wechat-qr-binding"].themePolicy,
    ).toBeUndefined();
  });

  it("嵌入全目录不覆写语义色，品牌标统一经过暗色适配层", () => {
    const forbiddenColorOverride =
      /["']--(?:background|surface-(?:card|[1-3])|foreground|(?:subtle|muted|faint)-foreground|border(?:-hairline|-strong)?|brand-(?:red|green|amber)(?:-soft)?|on-(?:brand|dark)|status-[\w-]+|destructive|popover|shadow-(?:raised|overlay))["']\s*:/;
    const directBrandLogoImport =
      /from\s+["']@\/shared\/components\/BrandLogo["']/;

    for (const { fileName, source } of wikiEmbedSources) {
      expect(source).not.toMatch(forbiddenColorOverride);
      expect(source).not.toMatch(/hsl\(var\(--/);
      if (fileName !== "WikiEmbedBrandLogo.tsx") {
        expect(source).not.toMatch(directBrandLogoImport);
      }
    }
    expect(
      wikiEmbedSources.find(
        ({ fileName }) => fileName === "WikiEmbedBrandLogo.tsx",
      )?.source,
    ).toMatch(directBrandLogoImport);

    const { container } = render(
      <WikiEmbedBrandLogo variant="wordmark" height={17} />,
    );
    expect(container.querySelector(".wiki-embed-brand-logo-light")).not.toBe(
      null,
    );
    expect(container.querySelector(".wiki-embed-brand-logo-dark")).not.toBe(
      null,
    );
  });

  it("暗色 follow-wiki 实底在元素边界桥接对应的暗色前景", () => {
    const bridgeSection = normalizedGlobalsCss.indexOf(
      "follow-wiki 实底对比度桥接",
    );
    const paperSection = normalizedGlobalsCss.indexOf(
      "PDF 工作区的论文页是内容介质",
      bridgeSection,
    );
    expect(bridgeSection).toBeGreaterThan(-1);
    expect(paperSection).toBeGreaterThan(bridgeSection);

    const bridgeCss = normalizedGlobalsCss.slice(bridgeSection, paperSection);
    const darkCarrierRule = cssRuleBody(
      ":where(\n    .bg-background",
      bridgeSection,
    );
    const inverseFillRule = cssRuleBody(
      ":where(.bg-foreground, .bg-inverse)",
      bridgeSection,
    );
    const foregroundRule = cssRuleBody(":where(.bg-foreground)", bridgeSection);
    const brandRule = cssRuleBody(
      ":where(.bg-brand-red, .bg-brand-green, .bg-brand-amber)",
      bridgeSection,
    );
    const amberRule = cssRuleBody(":where(.bg-brand-amber)", bridgeSection);

    expect(darkCarrierRule).toContain("--subtle-foreground: var(--ink-10)");
    expect(darkCarrierRule).toContain("--muted-foreground: var(--ink-9)");
    expect(darkCarrierRule).toContain("--faint-foreground: var(--ink-8)");
    expect(inverseFillRule).toContain("--subtle-foreground: var(--ink-5)");
    expect(inverseFillRule).toContain("--muted-foreground: var(--ink-6)");
    expect(inverseFillRule).toContain("--faint-foreground: #6e6e78");
    expect(foregroundRule).toContain("--on-dark: var(--ink-2)");
    expect(brandRule).toContain("--on-dark: var(--on-brand)");
    expect(amberRule).toContain("--foreground: var(--on-brand)");
    for (const carrierClass of [
      ".bg-surface-1",
      ".bg-surface-2",
      ".bg-surface-3",
      ".bg-secondary",
      ".bg-brand-red-soft",
      ".bg-status-info-soft",
      ".bg-amber-soft",
      ".bg-prism-badge-bg",
    ]) {
      expect(bridgeCss).toContain(carrierClass);
    }
    expect(
      bridgeCss.match(/data-wiki-embed-theme='follow-wiki'/g),
    ).toHaveLength(10);
    expect(bridgeCss).not.toContain("data-wiki-embed-theme='light-only'");
    expect(bridgeCss.indexOf(":where(.bg-brand-red")).toBeGreaterThan(
      bridgeCss.indexOf(":where(.bg-foreground)"),
    );
  });

  it("PDF 对话工作区只在论文纸张节点恢复浅色内容 token", () => {
    const paperSection =
      normalizedGlobalsCss.indexOf("PDF 工作区的论文页是内容介质");
    const logoSection = normalizedGlobalsCss.indexOf(
      "品牌文字标只适合浅底",
      paperSection,
    );
    expect(paperSection).toBeGreaterThan(-1);
    expect(logoSection).toBeGreaterThan(paperSection);

    const paperCss = normalizedGlobalsCss.slice(paperSection, logoSection);
    const paperRule = cssRuleBody(".wiki-embed-pdf-paper", paperSection);
    expect(paperRule).toContain("color-scheme: light");
    expect(paperRule).toContain("--surface-card: #ffffff");
    expect(paperRule).toContain("--surface-1: #efede5");
    expect(paperRule).toContain("--foreground: var(--ink-2)");
    expect(paperRule).toContain("--subtle-foreground: var(--ink-5)");
    expect(paperRule).toContain("--faint-foreground: #6e6e78");
    expect(paperRule).toContain("--border: rgb(31 31 35 / 0.12)");
    expect(paperCss.match(/data-wiki-embed-theme='follow-wiki'/g)).toHaveLength(
      2,
    );
    expect(paperCss).not.toContain("light-only");

    const { container } = render(<WikiEmbedPdfChatWorkspace />);
    expect(container.querySelectorAll(".wiki-embed-pdf-paper")).toHaveLength(1);
    expect(
      container
        .querySelector("[data-wiki-fixture='pdf-chat-workspace']")
        ?.classList.contains("wiki-embed-pdf-paper"),
    ).toBe(false);
  });

  it("light-only 后代抵消站级 dark carrier 的元素级覆写", () => {
    const canvasSection = normalizedGlobalsCss.indexOf(
      "默认 fixture 跟随 Wiki 主题",
    );
    const descendantSection =
      normalizedGlobalsCss.indexOf("light-only 后代承载面复位");
    const mermaidSection = normalizedGlobalsCss.indexOf(
      "Mermaid 的配色由 theme-bridge",
      descendantSection,
    );
    expect(canvasSection).toBeGreaterThan(-1);
    expect(descendantSection).toBeGreaterThan(canvasSection);
    expect(mermaidSection).toBeGreaterThan(descendantSection);

    const descendantCss = normalizedGlobalsCss.slice(
      descendantSection,
      mermaidSection,
    );
    const cardRule = cssRuleBody(
      ":where(.bg-background, .bg-surface-card, .bg-card, .bg-popover)",
      descendantSection,
    );
    const inverseRule = cssRuleBody(":where(.bg-inverse)", descendantSection);
    const softRule = cssRuleBody(
      ":where(\n    .bg-brand-red-soft",
      descendantSection,
    );
    const amberSoftRule = cssRuleBody(
      ":where(\n    .bg-amber-soft",
      descendantSection,
    );

    expect(cardRule).toContain("--subtle-foreground: var(--ink-5)");
    expect(cardRule).toContain("--muted-foreground: var(--ink-6)");
    expect(cardRule).toContain("--faint-foreground: #6e6e78");
    expect(inverseRule).toContain("--subtle-foreground: var(--ink-10)");
    expect(inverseRule).toContain("--muted-foreground: var(--ink-9)");
    expect(inverseRule).toContain("--faint-foreground: var(--ink-8)");
    expect(softRule).toContain("--subtle-foreground: var(--ink-5)");
    expect(softRule).toContain("--muted-foreground: var(--ink-6)");
    expect(softRule).toContain("--faint-foreground: #696973");
    expect(amberSoftRule).toContain("--subtle-foreground: var(--ink-5)");
    expect(amberSoftRule).toContain("--muted-foreground: #5b5b66");
    expect(amberSoftRule).toContain("--faint-foreground: #61616b");
    expect(
      descendantCss.match(/data-wiki-embed-theme='light-only'/g),
    ).toHaveLength(8);
    expect(descendantCss).not.toContain("follow-wiki");
  });

  it("夜间井壁和默认 canvas 一起暗化，仅 light-only 完整恢复浅色 token", () => {
    const darkSection =
      normalizedGlobalsCss.indexOf("Wiki 夜间模式只属于文档路由");
    const embedSection = normalizedGlobalsCss.indexOf("Wiki 嵌入演示井");
    const stageSection = normalizedGlobalsCss.indexOf("夜间只暗化井壁");
    const canvasSection = normalizedGlobalsCss.indexOf(
      "默认 fixture 跟随 Wiki 主题",
    );
    expect(darkSection).toBeGreaterThan(-1);
    expect(embedSection).toBeGreaterThan(-1);
    expect(stageSection).toBeGreaterThan(-1);
    expect(canvasSection).toBeGreaterThan(-1);
    const darkRule = cssRuleBody(
      ".wiki-doc-surface[data-wiki-theme='dark']",
      darkSection,
    );
    const followCanvasRule = cssRuleBody(".wiki-embed-canvas", embedSection);
    const defaultDarkLogoSelector = normalizedGlobalsCss.indexOf(
      ".wiki-embed-brand-logo-dark",
      embedSection,
    );
    const defaultDarkLogoRule = cssRuleBody(
      ".wiki-embed-brand-logo-dark",
      defaultDarkLogoSelector,
    );
    const darkLightLogoRule = cssRuleBody(
      ".wiki-embed-brand-logo-light",
      embedSection,
    );
    const darkMarkLogoRule = cssRuleBody(
      ".wiki-embed-brand-logo-dark",
      defaultDarkLogoSelector + ".wiki-embed-brand-logo-dark".length,
    );
    const stageRule = cssRuleBody(".wiki-embed-stage", stageSection);
    const lightOnlyCanvasRule = cssRuleBody(
      ".wiki-embed-canvas[data-wiki-embed-theme='light-only']",
      canvasSection,
    );
    const darkVariables = declaredVariables(darkRule);
    const lightOnlyVariables = new Set(declaredVariables(lightOnlyCanvasRule));

    expect(stageRule.match(/\binset\b/g)).toHaveLength(5);
    expect(followCanvasRule).not.toContain("color-scheme: light");
    expect(defaultDarkLogoRule).toContain("display: none");
    expect(darkLightLogoRule).toContain("display: none");
    expect(darkMarkLogoRule).toContain("display: inline-flex");
    expect(lightOnlyCanvasRule).not.toMatch(/\bfilter\b/);
    expect(lightOnlyCanvasRule).not.toMatch(/drop-shadow/);
    expect(lightOnlyCanvasRule).toContain("color-scheme: light");
    expect(lightOnlyCanvasRule).toMatch(/--background:\s*#f6f4ee/i);
    expect(lightOnlyCanvasRule).toMatch(/--surface-card:\s*#ffffff/i);
    expect(lightOnlyCanvasRule).toContain("--foreground: var(--ink-2)");
    expect(lightOnlyCanvasRule).toContain("--inverse: var(--ink-2)");
    expect(lightOnlyCanvasRule).toContain("--on-inverse: var(--ink-11)");
    expect(
      darkVariables.filter((variable) => !lightOnlyVariables.has(variable)),
      "Wiki 暗色作用域新增 token 时，light-only canvas 必须同时恢复浅色值",
    ).toEqual([]);
  });
});
