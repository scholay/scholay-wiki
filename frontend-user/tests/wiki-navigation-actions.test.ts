import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  WIKI_ARTICLES,
  isAdminOnlyCategory,
  wikiInterestRecommendations,
} from "../src/features/wiki/content";
import { wikiArticleCopyText } from "../src/features/wiki/content/wiki-article-export";
import {
  WIKI_MCP_CONFIG,
  WIKI_MCP_ENDPOINT,
  wikiMcpConfigText,
} from "../src/features/wiki/wiki-mcp";

describe("Wiki 复制、MCP 与页尾路径", () => {
  it("复制本页覆盖正文与结构化引导，而不是只复制定位路径", () => {
    const article = WIKI_ARTICLES.find(
      (item) => item.slug === "pdf-chat-guide",
    );
    expect(article).toBeDefined();
    const text = wikiArticleCopyText(article!, {
      navPath: ["Scholay Wiki", "智能搜索", article!.title],
    });

    expect(text).toContain(`# ${article!.title}`);
    expect(text).toContain(`https://www.scholay.com/wiki/${article!.slug}`);
    expect(text).toContain("```text");
    expect(text).toContain("提示：");
    expect(text).not.toBe(`/wiki/${article!.slug}`);
  });

  it("每篇词条末尾都有去重、可访问且有理由的兴趣推荐", () => {
    for (const article of WIKI_ARTICLES) {
      const items = wikiInterestRecommendations(article, true);
      expect(items.length, article.slug).toBeGreaterThan(0);
      expect(items.length, article.slug).toBeLessThanOrEqual(4);
      expect(new Set(items.map((item) => item.article.slug)).size).toBe(
        items.length,
      );
      expect(
        items.every(
          (item) =>
            item.article.slug !== article.slug &&
            item.reason.trim().length > 0 &&
            item.description.trim().length > 0,
        ),
        article.slug,
      ).toBe(true);
    }
  });

  it("页尾优先汇总作者明确写出的下一步，再用关联词条补足", () => {
    const article = WIKI_ARTICLES.find(
      (item) => item.slug === "pdf-chat-guide",
    );
    const explicit = article?.sections
      .flatMap((section) => section.blocks ?? [])
      .find((block) => block.type === "next-steps");
    expect(article).toBeDefined();
    expect(explicit?.type).toBe("next-steps");
    if (!article || !explicit || explicit.type !== "next-steps") return;

    const recommendations = wikiInterestRecommendations(article, true);
    expect(recommendations[0]?.article.slug).toBe(
      explicit.group.items[0]?.articleSlug,
    );
    expect(recommendations[0]?.reason).toBe("本页建议的下一步");
  });

  it("公开读者的页尾推荐不会泄漏管理员词条", () => {
    for (const article of WIKI_ARTICLES.filter(
      (item) => !isAdminOnlyCategory(item.category),
    )) {
      const recommendations = wikiInterestRecommendations(article, false);
      expect(recommendations.length, article.slug).toBeGreaterThan(0);
      expect(
        recommendations.every(
          (item) => !isAdminOnlyCategory(item.article.category),
        ),
        article.slug,
      ).toBe(true);
    }
  });

  it("MCP 按钮复制公开、只读的 Streamable HTTP 配置", () => {
    expect(WIKI_MCP_ENDPOINT).toBe(
      "https://www.scholay.com/api/v1/public/wiki/mcp",
    );
    expect(JSON.parse(wikiMcpConfigText())).toEqual(WIKI_MCP_CONFIG);
    expect(WIKI_MCP_CONFIG.mcpServers["scholay-wiki"]).toEqual({
      type: "http",
      url: WIKI_MCP_ENDPOINT,
    });

    const root = path.resolve(process.cwd());
    const layout = readFileSync(
      path.join(root, "src/features/wiki/components/WikiLayout.tsx"),
      "utf8",
    );
    const articlePage = readFileSync(
      path.join(root, "src/features/wiki/pages/WikiArticlePage.tsx"),
      "utf8",
    );
    expect(layout).toContain("WikiMcpCopyButton");
    expect(layout).toContain("复制 Scholay Wiki MCP 配置");
    expect(articlePage).toContain('"复制本页"');
    expect(articlePage).not.toContain('"复制定位"');
  });
});
