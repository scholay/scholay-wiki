import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { WIKI_ARTICLES, WIKI_CATEGORIES } from "../src/features/wiki/content";
import type {
  WikiArticle,
  WikiMergedTableCell,
  WikiSection,
  WikiSectionBlock,
} from "../src/features/wiki/types";
import { sanitizeWikiMCPText, sanitizeWikiMCPValue } from "./wiki-mcp-public";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const defaultOutput = path.resolve(
  scriptDirectory,
  "../../backend/internal/wikimcp/articles.json",
);
const checkOnly = process.argv.includes("--check");
const outputFlag = process.argv.indexOf("--output");
const outputPath =
  outputFlag >= 0 && process.argv[outputFlag + 1]
    ? path.resolve(process.cwd(), process.argv[outputFlag + 1])
    : defaultOutput;

const categoryTitle = new Map(
  WIKI_CATEGORIES.map((category) => [category.slug, category.title]),
);

const articles = [...WIKI_ARTICLES]
  .sort((left, right) => left.slug.localeCompare(right.slug, "en"))
  .map((article) => ({
    slug: article.slug,
    title: sanitizeWikiMCPText(article.title),
    summary: sanitizeWikiMCPText(article.summary),
    category: article.category,
    category_title: categoryTitle.get(article.category) ?? article.category,
    kind: article.kind,
    status: article.status,
    audience: sanitizeWikiMCPValue(article.audience),
    aliases: sanitizeWikiMCPValue(article.aliases ?? []),
    related: article.related ?? [],
    url: `https://www.scholay.com/wiki/${article.slug}`,
    resource_uri: `scholay://wiki/article/${article.slug}`,
    header_embeds: sanitizeWikiMCPValue(article.headerEmbeds ?? []),
    sections: article.sections.map((section) => ({
      id: section.id,
      title: sanitizeWikiMCPText(section.title),
      markdown: sanitizeWikiMCPText(section.markdown),
      content_markdown: sanitizeWikiMCPText(renderSection(section)),
      ...(section.table ? { table: sanitizeWikiMCPValue(section.table) } : {}),
      ...(section.embeds
        ? { embeds: sanitizeWikiMCPValue(section.embeds) }
        : {}),
      ...(section.blocks
        ? { blocks: sanitizeWikiMCPValue(section.blocks) }
        : {}),
    })),
    content_markdown: sanitizeWikiMCPText(renderArticle(article)),
  }));

const payload = `${JSON.stringify(
  {
    schema_version: 1,
    article_count: articles.length,
    articles,
  },
  null,
  2,
)}\n`;

if (checkOnly) {
  const existing = await readFile(outputPath, "utf8").catch(() => "");
  if (existing !== payload) {
    console.error(
      `Wiki MCP article snapshot is stale. Run: npm run generate:wiki-mcp`,
    );
    process.exitCode = 1;
  } else {
    console.log(
      `Wiki MCP article snapshot is current (${articles.length} articles).`,
    );
  }
} else {
  await writeFile(outputPath, payload, "utf8");
  console.log(`Wrote ${articles.length} Wiki articles to ${outputPath}.`);
}

function renderArticle(article: WikiArticle): string {
  const metadata = [
    `- 栏目：${categoryTitle.get(article.category) ?? article.category}`,
    `- 类型：${article.kind}`,
    `- 状态：${article.status}`,
    article.audience.length > 0
      ? `- 适用对象：${article.audience.join("、")}`
      : "",
    article.aliases && article.aliases.length > 0
      ? `- 别名：${article.aliases.join("、")}`
      : "",
    `- Wiki 页面：https://www.scholay.com/wiki/${article.slug}`,
  ].filter(Boolean);

  const headerEmbeds = (article.headerEmbeds ?? []).map(
    (embed) => `- ${embed.caption ?? embed.id}（界面元素：${embed.id}）`,
  );

  return [
    `# ${article.title}`,
    "",
    article.summary,
    "",
    ...metadata,
    ...(headerEmbeds.length > 0
      ? ["", "## 页面示意", "", ...headerEmbeds]
      : []),
    ...article.sections.flatMap((section) => [
      "",
      `## ${section.title}`,
      "",
      renderSection(section),
    ]),
  ]
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function renderSection(section: WikiSection): string {
  if (!section.blocks || section.blocks.length === 0) {
    return [
      section.table ? renderTable(section) : "",
      section.markdown,
      section.embeds
        ? renderEmbeds(
            section,
            section.embeds.map(({ id }) => id),
          )
        : "",
    ]
      .filter(Boolean)
      .join("\n\n");
  }

  return section.blocks
    .map((block) => renderBlock(section, block))
    .filter(Boolean)
    .join("\n\n");
}

function renderBlock(section: WikiSection, block: WikiSectionBlock): string {
  switch (block.type) {
    case "markdown":
      return block.markdown ?? section.markdown;
    case "table":
      return section.table ? renderTable(section) : "";
    case "embeds":
      return renderEmbeds(
        section,
        block.ids ?? section.embeds?.map(({ id }) => id) ?? [],
      );
    case "prompt-tabs":
      return [
        `### ${block.group.title}`,
        block.group.description ?? "",
        ...block.group.options.flatMap((option) => [
          `#### ${option.label}`,
          "```text",
          option.prompt,
          "```",
        ]),
      ]
        .filter(Boolean)
        .join("\n\n");
    case "article-link": {
      const title = block.card.title ?? block.card.articleSlug;
      const hash = block.card.sectionId ? `#${block.card.sectionId}` : "";
      return [
        `**延伸词条：[${title}](https://www.scholay.com/wiki/${block.card.articleSlug}${hash})**`,
        block.card.description ?? "",
      ]
        .filter(Boolean)
        .join("\n\n");
    }
    case "tip": {
      const link = block.tip.link
        ? ` [${block.tip.link.label}](https://www.scholay.com/wiki/${block.tip.link.articleSlug}${block.tip.link.sectionId ? `#${block.tip.link.sectionId}` : ""})`
        : "";
      return `> 提示：${block.tip.text}${link}`;
    }
    case "next-steps":
      return [
        `### ${block.group.title ?? "下一步"}`,
        block.group.description ?? "",
        ...block.group.items.map((item) => {
          const title = item.title ?? item.articleSlug;
          const hash = item.sectionId ? `#${item.sectionId}` : "";
          return `- [${title}](https://www.scholay.com/wiki/${item.articleSlug}${hash})：${item.description}`;
        }),
      ]
        .filter(Boolean)
        .join("\n\n");
    case "path-cards":
      return block.items
        .map(
          (item) =>
            `- [${item.title}](https://www.scholay.com/wiki/${item.articleSlug}${item.sectionId ? `#${item.sectionId}` : ""})：${item.description}`,
        )
        .join("\n");
  }
}

function renderTable(section: WikiSection): string {
  const table = section.table;
  if (!table) return "";
  const headers = table.columns.map((column) => escapeTable(column.header));
  const separator = table.columns.map(() => "---");
  const rows = table.rows.map((row) =>
    table.columns
      .map((column) => escapeTable(renderCell(row[column.key] ?? "")))
      .join(" | "),
  );
  return [
    table.caption ? `**${table.caption}**` : "",
    `| ${headers.join(" | ")} |`,
    `| ${separator.join(" | ")} |`,
    ...rows.map((row) => `| ${row} |`),
  ]
    .filter(Boolean)
    .join("\n");
}

function renderCell(cell: WikiMergedTableCell): string {
  if (typeof cell === "string") return cell;
  const links = Array.isArray(cell) ? cell : [cell];
  return links.map((link) => `[${link.label}](${link.href})`).join("、");
}

function escapeTable(value: string): string {
  return value.replaceAll("|", "\\|").replaceAll("\n", "<br>");
}

function renderEmbeds(section: WikiSection, ids: string[]): string {
  if (ids.length === 0) return "";
  const refs = new Map(
    (section.embeds ?? []).map((embed) => [embed.id, embed]),
  );
  return [
    "**界面元素示意**",
    ...ids.map((id) => `- ${refs.get(id)?.caption ?? id}（组件：${id}）`),
  ].join("\n");
}
