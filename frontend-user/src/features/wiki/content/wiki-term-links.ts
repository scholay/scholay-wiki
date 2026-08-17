import type { WikiArticle } from "../types";
import { WIKI_TERMS } from "./terms";

interface WikiTermLink {
  terms: readonly string[];
  articleSlug: string;
}

/** 从 terms.ts 派生；aliases 不会自动变成链接，避免普通检索别名过度链接。 */
export const WIKI_TERM_LINKS: readonly WikiTermLink[] = WIKI_TERMS.map(
  (term) => ({
    terms: [term.canonical, ...(term.linkVariants ?? [])],
    articleSlug: term.articleSlug,
  }),
);

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
