import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { WIKI_ARTICLES } from "@/features/wiki/content";
import {
  sanitizeWikiMCPText,
  sanitizeWikiMCPValue,
} from "../scripts/wiki-mcp-public";

interface ExportedWikiArticle {
  slug: string;
  title: string;
  summary: string;
  category: string;
  status: string;
  audience: string[];
  aliases: string[];
  related: string[];
  sections: Array<{
    id: string;
    title: string;
    markdown: string;
    table?: unknown;
    embeds?: unknown;
    blocks?: unknown;
    content_markdown: string;
  }>;
  resource_uri: string;
  content_markdown: string;
  sourcePaths?: unknown;
  source_paths?: unknown;
}

const snapshotPath = path.resolve(
  process.cwd(),
  "../backend/internal/wikimcp/articles.json",
);
const snapshot = JSON.parse(readFileSync(snapshotPath, "utf8")) as {
  schema_version: number;
  article_count: number;
  articles: ExportedWikiArticle[];
};

describe("Wiki MCP public snapshot", () => {
  it("covers every authored Wiki article exactly once", () => {
    const sourceSlugs = [
      ...WIKI_ARTICLES.map((article) => article.slug),
    ].sort();
    const exportedSlugs = snapshot.articles.map((article) => article.slug);

    expect(snapshot.schema_version).toBe(1);
    expect(snapshot.article_count).toBe(WIKI_ARTICLES.length);
    expect(exportedSlugs).toEqual(sourceSlugs);
    expect(new Set(exportedSlugs).size).toBe(exportedSlugs.length);
  });

  it("keeps public content in sync without exposing repository paths", () => {
    const exportedBySlug = new Map(
      snapshot.articles.map((article) => [article.slug, article]),
    );

    for (const source of WIKI_ARTICLES) {
      const exported = exportedBySlug.get(source.slug);
      expect(exported, source.slug).toBeDefined();
      expect(exported).toMatchObject({
        slug: source.slug,
        title: sanitizeWikiMCPText(source.title),
        summary: sanitizeWikiMCPText(source.summary),
        category: source.category,
        status: source.status,
        audience: sanitizeWikiMCPValue(source.audience),
        aliases: sanitizeWikiMCPValue(source.aliases ?? []),
        related: source.related ?? [],
        resource_uri: `scholay://wiki/article/${source.slug}`,
      });
      expect(exported?.sourcePaths).toBeUndefined();
      expect(exported?.source_paths).toBeUndefined();
      expect(exported?.content_markdown).toContain(`# ${source.title}`);
      expect(exported?.sections).toHaveLength(source.sections.length);

      source.sections.forEach((section, index) => {
        expect(exported?.sections[index]).toMatchObject({
          id: section.id,
          title: sanitizeWikiMCPText(section.title),
          markdown: sanitizeWikiMCPText(section.markdown),
          ...(section.table
            ? { table: sanitizeWikiMCPValue(section.table) }
            : {}),
          ...(section.embeds
            ? { embeds: sanitizeWikiMCPValue(section.embeds) }
            : {}),
          ...(section.blocks
            ? { blocks: sanitizeWikiMCPValue(section.blocks) }
            : {}),
        });
        expect(exported?.sections[index].content_markdown).toBeTruthy();
      });
    }

    const serialized = JSON.stringify(snapshot);
    expect(serialized).not.toContain('"sourcePaths"');
    expect(serialized).not.toContain('"source_paths"');
    expect(serialized).not.toMatch(/\/Users\/|[a-zA-Z]:\\/);
    expect(serialized).not.toMatch(
      /(^|[\s`"'（(：:，,。；;])(?:frontend-user|frontend-admin|backend|agent|miniprogram|docs|scripts|docker|src|\.github)\/[a-zA-Z0-9_.:/-]+/,
    );
  });
});
