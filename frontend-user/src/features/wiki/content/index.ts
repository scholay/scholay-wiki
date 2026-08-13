import { administrationArticles } from "./administration";
import { backendDomainArticles } from "./backend-domains";
import { discoveryArticles } from "./discovery";
import { ecosystemArticles } from "./ecosystem";
import { foundationArticles } from "./foundations";
import { accountGuideArticles } from "./guides-account";
import { discoveryGuideArticles } from "./guides-discovery";
import { workflowGuideArticles } from "./guides-workflows";
import { infrastructureArticles } from "./infrastructure";
import { membershipArticles } from "./membership";
import { WIKI_NAV_CATEGORIES } from "./navigation";
import { platformArticles } from "./platform";
import { policyAndHistoryArticles } from "./policies-and-history";
import { researchAiArticles } from "./research-ai";
import { userExperienceArticles } from "./user-experience";
import { WIKI_CATEGORIES } from "./categories";
import type {
  WikiArticle,
  WikiCategory,
  WikiCategoryMeta,
  WikiNavCategory,
  WikiNavCategoryMeta,
  WikiNavNode,
  WikiNavTrail,
  WikiSectionBlock,
} from "../types";

export {
  WIKI_CATEGORIES,
  WIKI_KIND_LABEL,
  WIKI_STATUS_LABEL,
} from "./categories";
export { WIKI_NAV_CATEGORIES } from "./navigation";
export {
  WIKI_PRODUCT_MENUS,
  resolveWikiProductMenu,
  resolveWikiProductMenuFromNavCategory,
} from "./product-menus";
export { WIKI_START_PATHS } from "./start-paths";

export const WIKI_ARTICLES: WikiArticle[] = [
  ...administrationArticles,
  ...foundationArticles,
  ...discoveryArticles,
  ...researchAiArticles,
  ...ecosystemArticles,
  ...membershipArticles,
  ...platformArticles,
  ...infrastructureArticles,
  ...backendDomainArticles,
  ...policyAndHistoryArticles,
  ...userExperienceArticles,
  ...discoveryGuideArticles,
  ...workflowGuideArticles,
  ...accountGuideArticles,
];

export const WIKI_ARTICLE_BY_SLUG = new Map(
  WIKI_ARTICLES.map((article) => [article.slug, article]),
);

export function isAdminOnlyCategory(slug: WikiCategory): boolean {
  return WIKI_CATEGORIES.find((item) => item.slug === slug)?.adminOnly === true;
}

export function visibleCategories(canSeeAdmin: boolean): WikiCategoryMeta[] {
  return WIKI_CATEGORIES.filter(
    (category) => canSeeAdmin || !category.adminOnly,
  );
}

export function visibleNavCategories(
  canSeeAdmin: boolean,
): WikiNavCategoryMeta[] {
  return WIKI_NAV_CATEGORIES.map((category) => ({
    ...category,
    children: visibleNavNodes(category.children, canSeeAdmin),
  })).filter((category) => category.children.length > 0);
}

export function visibleNavNodes(
  nodes: WikiNavNode[],
  canSeeAdmin: boolean,
): WikiNavNode[] {
  return nodes.flatMap((node) => {
    if (node.adminOnly && !canSeeAdmin) return [];
    if (
      node.target &&
      !canViewWikiArticle(
        WIKI_ARTICLE_BY_SLUG.get(node.target.articleSlug),
        canSeeAdmin,
      )
    ) {
      return [];
    }
    return [
      {
        ...node,
        children: node.children
          ? visibleNavNodes(node.children, canSeeAdmin)
          : undefined,
      },
    ];
  });
}

export function navCategoryBySlug(
  slug: string | undefined,
): WikiNavCategoryMeta | undefined {
  return WIKI_NAV_CATEGORIES.find((category) => category.slug === slug);
}

export function articleNavTrail(articleSlug: string): WikiNavTrail | undefined {
  for (const category of WIKI_NAV_CATEGORIES) {
    const nodes = primaryTrail(category.children, articleSlug);
    if (nodes) return { category, nodes };
  }
  return undefined;
}

export function navArticlesInCategory(
  categorySlug: WikiNavCategory,
  canSeeAdmin = true,
): WikiArticle[] {
  const category = visibleNavCategories(canSeeAdmin).find(
    (item) => item.slug === categorySlug,
  );
  if (!category) return [];

  const slugs: string[] = [];
  collectPrimarySlugs(category.children, slugs);
  return slugs
    .map((slug) => WIKI_ARTICLE_BY_SLUG.get(slug))
    .filter((article): article is WikiArticle =>
      canViewWikiArticle(article, canSeeAdmin),
    );
}

export function navHref(node: WikiNavNode): string | undefined {
  if (!node.target) return undefined;
  const base = `/wiki/${node.target.articleSlug}`;
  return node.target.sectionId ? `${base}#${node.target.sectionId}` : base;
}

function primaryTrail(
  nodes: WikiNavNode[],
  articleSlug: string,
): WikiNavNode[] | undefined {
  for (const node of nodes) {
    if (
      node.target?.articleSlug === articleSlug &&
      node.target.shortcut !== true
    ) {
      return [node];
    }
    const childTrail = node.children
      ? primaryTrail(node.children, articleSlug)
      : undefined;
    if (childTrail) return [node, ...childTrail];
  }
  return undefined;
}

function collectPrimarySlugs(nodes: WikiNavNode[], target: string[]): void {
  for (const node of nodes) {
    if (node.target && node.target.shortcut !== true) {
      if (!target.includes(node.target.articleSlug)) {
        target.push(node.target.articleSlug);
      }
    }
    if (node.children) collectPrimarySlugs(node.children, target);
  }
}

export function visibleArticles(canSeeAdmin: boolean): WikiArticle[] {
  return WIKI_ARTICLES.filter(
    (article) => canSeeAdmin || !isAdminOnlyCategory(article.category),
  );
}

export function canViewWikiArticle(
  article: WikiArticle | undefined,
  canSeeAdmin: boolean,
): article is WikiArticle {
  if (!article) return false;
  return canSeeAdmin || !isAdminOnlyCategory(article.category);
}

export function articlesInCategory(
  category: WikiCategory,
  canSeeAdmin = true,
): WikiArticle[] {
  if (!canSeeAdmin && isAdminOnlyCategory(category)) return [];
  return visibleArticles(canSeeAdmin).filter(
    (article) => article.category === category,
  );
}

export function relatedArticles(
  article: WikiArticle,
  canSeeAdmin = true,
): WikiArticle[] {
  return (article.related ?? [])
    .map((slug) => WIKI_ARTICLE_BY_SLUG.get(slug))
    .filter((item): item is WikiArticle =>
      canViewWikiArticle(item, canSeeAdmin),
    );
}

export function searchWikiArticles(
  query: string,
  canSeeAdmin = true,
): WikiArticle[] {
  const pool = visibleArticles(canSeeAdmin);
  const needle = normalize(query);
  if (!needle) return pool;

  return pool
    .map((article) => ({
      article,
      score: articleScore(article, needle),
    }))
    .filter(({ score }) => score > 0)
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.article.title.localeCompare(b.article.title, "zh-CN"),
    )
    .map(({ article }) => article);
}

export function wikiSectionPlainText(
  section: WikiArticle["sections"][number],
): string {
  const tableText = section.table
    ? [
        ...section.table.columns.map((column) => column.header),
        ...section.table.rows.flatMap((row) =>
          Object.values(row).flatMap((cell) => {
            if (typeof cell === "string") return [cell];
            if (Array.isArray(cell)) {
              return cell.flatMap((item) => [item.label, item.href]);
            }
            return [cell.label, cell.href];
          }),
        ),
      ].join(" ")
    : "";
  const guidanceText = (section.blocks ?? [])
    .flatMap(wikiBlockSearchText)
    .join(" ");
  return `${section.title} ${section.markdown} ${tableText} ${guidanceText}`;
}

function articleScore(article: WikiArticle, needle: string): number {
  const category = WIKI_CATEGORIES.find(
    (item) => item.slug === article.category,
  );
  const title = normalize(article.title);
  const aliases = normalize((article.aliases ?? []).join(" "));
  const summary = normalize(article.summary);
  const metadata = normalize(
    [
      category?.title,
      category?.shortTitle,
      ...navLabelsForArticle(article.slug),
      article.category,
      article.kind,
      article.status,
      ...article.audience,
      ...article.sourcePaths,
    ]
      .filter(Boolean)
      .join(" "),
  );
  const body = normalize(article.sections.map(wikiSectionPlainText).join(" "));

  if (title === needle) return 100;
  if (title.includes(needle)) return 70;
  if (aliases.includes(needle)) return 50;
  if (summary.includes(needle)) return 30;
  if (metadata.includes(needle)) return 20;
  if (body.includes(needle)) return 10;
  return 0;
}

function wikiBlockSearchText(block: WikiSectionBlock): string[] {
  switch (block.type) {
    case "markdown":
    case "table":
    case "embeds":
      return [];
    case "prompt-tabs":
      return [
        block.group.title,
        block.group.description ?? "",
        ...block.group.options.flatMap((option) => [
          option.label,
          option.prompt,
        ]),
      ];
    case "article-link":
      return [
        block.card.title ?? "",
        block.card.description ?? "",
        block.card.articleSlug,
      ];
    case "tip":
      return [block.tip.text, block.tip.link?.label ?? ""];
    case "next-steps":
      return [
        block.group.title ?? "",
        block.group.description ?? "",
        ...block.group.items.flatMap((item) => [
          item.title ?? "",
          item.description,
          item.articleSlug,
        ]),
      ];
  }
}

function navLabelsForArticle(articleSlug: string): string[] {
  const labels: string[] = [];
  const visit = (nodes: WikiNavNode[], ancestors: string[]) => {
    for (const node of nodes) {
      const path = [...ancestors, node.title];
      if (node.target?.articleSlug === articleSlug) labels.push(...path);
      if (node.children) visit(node.children, path);
    }
  };
  for (const category of WIKI_NAV_CATEGORIES) {
    visit(category.children, [category.title]);
  }
  return labels;
}

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase("zh-CN").replace(/\s+/g, " ");
}
