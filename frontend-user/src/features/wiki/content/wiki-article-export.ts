import type {
  WikiArticle,
  WikiMergedTableCell,
  WikiSection,
  WikiSectionBlock,
} from "../types";

interface WikiArticleExportOptions {
  canonicalBase?: string;
  navPath?: string[];
  resolveArticleTitle?: (slug: string) => string | undefined;
}

/**
 * 生成适合粘贴到笔记、对话或研究记录中的完整词条文本。
 * 这里使用内容模型，而不是抓取 DOM，因此隐藏的 Tab 场景和结构化 Tips 也不会丢失。
 */
export function wikiArticleCopyText(
  article: WikiArticle,
  options: WikiArticleExportOptions = {},
): string {
  const canonicalBase = (
    options.canonicalBase ?? "https://www.scholay.com/wiki"
  ).replace(/\/$/, "");
  const lines = [
    options.navPath?.length ? options.navPath.join(" / ") : "Scholay Wiki",
    "",
    `# ${article.title}`,
    "",
    article.summary,
    "",
    `链接：${canonicalBase}/${article.slug}`,
  ];

  for (const section of article.sections) {
    lines.push("", `## ${section.title}`, "");
    lines.push(
      ...sectionCopyLines(section, options.resolveArticleTitle).filter(Boolean),
    );
  }

  return collapseBlankLines(lines).trim();
}

function sectionCopyLines(
  section: WikiSection,
  resolveArticleTitle?: (slug: string) => string | undefined,
): string[] {
  if (!section.blocks?.length) {
    return legacySectionLines(section);
  }

  return section.blocks.flatMap((block) =>
    blockCopyLines(block, section, resolveArticleTitle),
  );
}

function legacySectionLines(section: WikiSection): string[] {
  const lines = [section.markdown];
  if (section.table) lines.push("", tableCopyText(section));
  if (section.embeds?.length) {
    lines.push(
      "",
      ...section.embeds.map(
        (embed) => `[界面示例] ${embed.caption ?? embed.id}`,
      ),
    );
  }
  return lines;
}

function blockCopyLines(
  block: WikiSectionBlock,
  section: WikiSection,
  resolveArticleTitle?: (slug: string) => string | undefined,
): string[] {
  switch (block.type) {
    case "markdown":
      return [block.markdown ?? section.markdown, ""];
    case "table":
      return section.table ? [tableCopyText(section), ""] : [];
    case "embeds": {
      const embeds = block.ids?.length
        ? block.ids.flatMap((id) => {
            const match = section.embeds?.find((embed) => embed.id === id);
            return match ? [match] : [];
          })
        : (section.embeds ?? []);
      return [
        ...embeds.map((embed) => `[界面示例] ${embed.caption ?? embed.id}`),
        "",
      ];
    }
    case "prompt-tabs":
      return [
        `### ${block.group.title}`,
        block.group.description ?? "",
        ...block.group.options.flatMap((option) => [
          "",
          `#### ${option.label}`,
          "```text",
          option.prompt,
          "```",
        ]),
        "",
      ];
    case "article-link":
      return [
        `[进一步了解] ${
          block.card.title ??
          resolveArticleTitle?.(block.card.articleSlug) ??
          block.card.articleSlug
        }：${block.card.description ?? "查看关联词条。"} (${targetHref(block.card)})`,
        "",
      ];
    case "tip":
      return [
        `提示：${block.tip.text}${
          block.tip.link
            ? `（${block.tip.link.label}：${targetHref(block.tip.link)}）`
            : ""
        }`,
        "",
      ];
    case "next-steps":
      return [
        `### ${block.group.title ?? "下一步"}`,
        block.group.description ?? "",
        ...block.group.items.map(
          (item) =>
            `- ${
              item.title ??
              resolveArticleTitle?.(item.articleSlug) ??
              item.articleSlug
            }：${item.description} (${targetHref(item)})`,
        ),
        "",
      ];
    case "path-cards":
      return [
        ...block.items.map(
          (item) =>
            `- ${item.title}：${item.description} (${targetHref(item)})`,
        ),
        "",
      ];
  }
}

function tableCopyText(section: WikiSection): string {
  if (!section.table) return "";
  const headers = section.table.columns.map((column) => column.header);
  const rows = section.table.rows.map((row) =>
    section.table!.columns.map((column) => cellText(row[column.key] ?? "")),
  );
  return [
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.join(" | ")} |`),
  ].join("\n");
}

function cellText(cell: WikiMergedTableCell): string {
  if (typeof cell === "string") return cell.replaceAll("|", "\\|");
  if (Array.isArray(cell)) {
    return cell.map((item) => `${item.label} (${item.href})`).join("；");
  }
  return `${cell.label} (${cell.href})`;
}

function targetHref(target: {
  articleSlug: string;
  sectionId?: string;
}): string {
  return `/wiki/${target.articleSlug}${target.sectionId ? `#${target.sectionId}` : ""}`;
}

function collapseBlankLines(lines: string[]): string {
  return lines.join("\n").replace(/\n{3,}/g, "\n\n");
}
