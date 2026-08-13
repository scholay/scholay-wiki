import type { WikiArticle } from "../types";

interface WikiTermLink {
  terms: readonly string[];
  articleSlug: string;
}

/**
 * 人工维护的规范术语表。这里只放跨章节高频概念；aliases 不会自动变成链接，
 * 避免把普通名词和界面标签过度链接。
 */
export const WIKI_TERM_LINKS: readonly WikiTermLink[] = [
  {
    terms: [
      "智能助手（Scholay Claw）",
      "智能助手 Scholay Claw",
      "Scholay Claw",
      "智能助手",
    ],
    articleSlug: "claw",
  },
  {
    terms: ["智能写作（Scholay Prism）", "Scholay Prism", "智能写作"],
    articleSlug: "prism",
  },
  {
    terms: ["智能审稿（AI 模拟评议）", "智能审稿", "AI 审稿"],
    articleSlug: "peer-review",
  },
  { terms: ["传统文献搜索"], articleSlug: "literature-search-guide" },
  { terms: ["智能搜索"], articleSlug: "smart-search" },
  { terms: ["PDF 对话"], articleSlug: "pdf-chat-guide" },
  { terms: ["个人文献集"], articleSlug: "literature-library" },
  { terms: ["暂存区"], articleSlug: "staging-area" },
  { terms: ["论文矩阵分析", "矩阵分析"], articleSlug: "matrix-analysis" },
  { terms: ["AI 周期额度", "AI 额度"], articleSlug: "ai-usage-quota" },
  { terms: ["科研经费"], articleSlug: "wallet-payg" },
  { terms: ["稿件", "出版物"], articleSlug: "manuscript-vs-publication" },
  {
    terms: ["开放获取（OA）", "开放获取", "OA"],
    articleSlug: "open-access-and-paper-translation",
  },
  {
    terms: ["社区技能（Skill）", "社区技能", "Skill"],
    articleSlug: "community-skills",
  },
  { terms: ["学术情报", "研究新闻"], articleSlug: "research-news" },
  {
    terms: ["中科院分区", "期刊分区", "JCR", "CCF"],
    articleSlug: "journal-metrics-guide",
  },
] as const;

const FLAT_TERM_LINKS = WIKI_TERM_LINKS.flatMap((entry) =>
  entry.terms.map((term) => ({ term, articleSlug: entry.articleSlug })),
).sort((a, b) => b.term.length - a.term.length);

export function linkWikiTermsInArticle(article: WikiArticle): string[] {
  const linkedTargets = new Set<string>();
  return article.sections.map((section) =>
    linkWikiTerms(section.markdown, article.slug, linkedTargets),
  );
}

export function linkWikiTerms(
  markdown: string,
  currentArticleSlug: string,
  linkedTargets = new Set<string>(),
): string {
  let inFence = false;
  return markdown
    .split("\n")
    .map((line) => {
      if (/^\s*(```|~~~)/.test(line)) {
        inFence = !inFence;
        return line;
      }
      if (inFence || /^\s{0,3}#{1,6}\s/.test(line) || line.includes("|")) {
        return line;
      }
      return linkPlainMarkdownLine(line, currentArticleSlug, linkedTargets);
    })
    .join("\n");
}

function linkPlainMarkdownLine(
  line: string,
  currentArticleSlug: string,
  linkedTargets: Set<string>,
): string {
  const protectedParts = line.split(/(\[[^\]]+\]\([^)]+\)|`[^`\n]*`)/g);
  return protectedParts
    .map((part, index) =>
      index % 2 === 1
        ? part
        : linkPlainText(part, currentArticleSlug, linkedTargets),
    )
    .join("");
}

function linkPlainText(
  text: string,
  currentArticleSlug: string,
  linkedTargets: Set<string>,
): string {
  let cursor = 0;
  let output = "";

  while (cursor < text.length) {
    const tail = text.slice(cursor);
    const next = FLAT_TERM_LINKS.filter(
      (entry) =>
        entry.articleSlug !== currentArticleSlug &&
        !linkedTargets.has(entry.articleSlug),
    )
      .map((entry) => ({ ...entry, index: termIndex(tail, entry.term) }))
      .filter((entry) => entry.index >= 0)
      .sort((a, b) => a.index - b.index || b.term.length - a.term.length)[0];

    if (!next) {
      output += tail;
      break;
    }

    output += tail.slice(0, next.index);
    const matched = tail.slice(next.index, next.index + next.term.length);
    output += `[${matched}](/wiki/${next.articleSlug})`;
    linkedTargets.add(next.articleSlug);
    cursor += next.index + next.term.length;
  }

  return output;
}

function termIndex(text: string, term: string): number {
  if (!/^[A-Za-z0-9 ]+$/.test(term)) return text.indexOf(term);
  const pattern = new RegExp(`\\b${escapeRegExp(term)}\\b`);
  return text.search(pattern);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
