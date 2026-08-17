import { describe, expect, it } from "vitest";
import {
  WIKI_ARTICLE_BY_SLUG,
  WIKI_ARTICLES,
} from "../src/features/wiki/content";
import {
  WIKI_DEPRECATED_TERM_ALLOWLIST,
  WIKI_DEPRECATED_TERMS,
  WIKI_TERMS,
} from "../src/features/wiki/content/terms";
import { WIKI_TERM_LINKS } from "../src/features/wiki/content/wiki-term-links";
import { WIKI_AUDIT_BASELINE } from "../src/features/wiki/coverage";
import { MOCK_SURFACE_COVERAGE } from "../src/features/wiki/embeds/mock-surface-coverage";
import { scanWikiBaseline } from "../scripts/wiki-baseline-lib";

interface WikiTextFragment {
  articleSlug: string;
  sectionId?: string;
  field: string;
  text: string;
}

function primitiveStrings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(primitiveStrings);
  if (value && typeof value === "object") {
    return Object.values(value).flatMap(primitiveStrings);
  }
  return [];
}

function wikiTextFragments(): WikiTextFragment[] {
  return WIKI_ARTICLES.flatMap((article) => [
    {
      articleSlug: article.slug,
      field: "title",
      text: article.title,
    },
    {
      articleSlug: article.slug,
      field: "summary",
      text: article.summary,
    },
    ...article.sections.flatMap((section) => [
      {
        articleSlug: article.slug,
        sectionId: section.id,
        field: "section-title",
        text: section.title,
      },
      ...section.markdown.split("\n").map((text) => ({
        articleSlug: article.slug,
        sectionId: section.id,
        field: "markdown",
        text,
      })),
      ...primitiveStrings(section.table).map((text) => ({
        articleSlug: article.slug,
        sectionId: section.id,
        field: "table",
        text,
      })),
      ...primitiveStrings(section.blocks).map((text) => ({
        articleSlug: article.slug,
        sectionId: section.id,
        field: "block",
        text,
      })),
    ]),
  ]);
}

function deprecatedMatches(text: string) {
  const occupied: Array<[number, number]> = [];
  const matches: Array<{ term: string; index: number }> = [];
  for (const term of WIKI_DEPRECATED_TERMS) {
    let cursor = 0;
    while (cursor < text.length) {
      const index = text.indexOf(term, cursor);
      if (index < 0) break;
      const end = index + term.length;
      if (!occupied.some(([start, finish]) => index < finish && end > start)) {
        occupied.push([index, end]);
        matches.push({ term, index });
      }
      cursor = end;
    }
  }
  return matches.sort((left, right) => left.index - right.index);
}

describe("Scholay Wiki 维护门禁", () => {
  it("术语链接完全由单源表派生，且目标词条存在", () => {
    expect(WIKI_TERM_LINKS).toEqual(
      WIKI_TERMS.map((term) => ({
        terms: [term.canonical, ...(term.linkVariants ?? [])],
        articleSlug: term.articleSlug,
      })),
    );
    expect(new Set(WIKI_TERMS.map((term) => term.canonical)).size).toBe(
      WIKI_TERMS.length,
    );
    for (const term of WIKI_TERMS) {
      expect(WIKI_ARTICLE_BY_SLUG.has(term.articleSlug), term.canonical).toBe(
        true,
      );
      expect(term.deprecated).not.toContain(term.canonical);
    }
  });

  it("现行正文不使用 deprecated 产品名，历史/必要引用逐片段白名单", () => {
    const violations = wikiTextFragments().flatMap((fragment) =>
      deprecatedMatches(fragment.text).flatMap(({ term }) => {
        const allowed = WIKI_DEPRECATED_TERM_ALLOWLIST.some(
          (allowance) =>
            allowance.term === term &&
            allowance.articleSlug === fragment.articleSlug &&
            (!allowance.sectionId ||
              allowance.sectionId === fragment.sectionId) &&
            fragment.text.includes(allowance.context),
        );
        return allowed
          ? []
          : [
              `${fragment.articleSlug}#${fragment.sectionId ?? fragment.field} [${fragment.field}] ${term}: ${fragment.text.trim()}`,
            ];
      }),
    );
    expect(violations).toEqual([]);
  });

  it("生成基线与当前路由、模块、Agent、小程序、迁移和工具数据一致", () => {
    const scan = scanWikiBaseline();
    for (const key of [
      "renderedRoutes",
      "redirectRoutes",
      "backendModules",
      "agentFeatures",
      "agentSkills",
      "miniProgramPages",
      "migrations",
      "coldStartTools",
    ] as const) {
      expect(scan[key], key).toBe(WIKI_AUDIT_BASELINE[key]);
    }
    expect(scan.renderedRoutePaths).toContain("/tools/datasets");
    expect(scan.renderedRoutePaths).toContain("/tools/prompts");
    expect(scan.renderedRoutePaths).toContain("/journals");
    expect(scan.redirectRoutePaths).toContain("/journals/select");
    expect(scan.redirectRoutePaths).toContain("/peer-review/conference");
    expect(
      scan.renderedRoutePaths.filter((route) =>
        scan.redirectRoutePaths.includes(route),
      ),
    ).toEqual([]);
  });

  it("每个可见 mock coverage entry 都带合法复核日期", () => {
    const visible = MOCK_SURFACE_COVERAGE.filter(
      (entry) => entry.disposition !== "excluded",
    );
    for (const entry of visible) {
      expect(entry.verifiedAt, entry.key).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
    for (const key of [
      "site-navigation-tree",
      "my-resources-sections",
      "manuscript-collection",
      "scholay-plaza-hub",
      "invite-nav-hub",
      "funds-reminder",
      "oauth-confirm",
      "theme-and-rhino-loading",
      "journal-comments",
      "search-workspace",
      "claw-empty-state-correction",
    ]) {
      const entry = visible.find((candidate) => candidate.key === key);
      expect(entry?.verifiedAt, key).toBe("2026-08-17");
    }
  });
});
