import { administrationArticles } from "./administration";
import { backendDomainArticles } from "./backend-domains";
import { currentProductArticles } from "./current-product";
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

export const WIKI_ARTICLES: WikiArticle[] = [
  ...administrationArticles,
  ...foundationArticles,
  ...currentProductArticles,
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

export function navHref(node: WikiNavNode): string | undefined {
  if (!node.target) return undefined;
  const base = `/wiki/${node.target.articleSlug}`;
  return node.target.sectionId ? `${base}#${node.target.sectionId}` : base;
}

/** 栏目或分组展开后落到的第一篇词条，按侧栏从上到下的顺序。 */
export function firstNavHref(nodes: WikiNavNode[]): string | undefined {
  for (const node of nodes) {
    const href = navHref(node);
    if (href) return href;
    if (node.children) {
      const nested = firstNavHref(node.children);
      if (nested) return nested;
    }
  }
  return undefined;
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

export interface WikiInterestRecommendation {
  article: WikiArticle;
  sectionId?: string;
  reason: string;
  description: string;
}

/**
 * 页尾兴趣推荐：优先采用作者在正文里明确写出的“下一步”，再用 related 图谱补足。
 * 这样每篇词条都有继续路径，同时不会把简单的相邻顺序冒充成用户意图。
 */
export function wikiInterestRecommendations(
  article: WikiArticle,
  canSeeAdmin = true,
  limit = 4,
): WikiInterestRecommendation[] {
  const recommendations: WikiInterestRecommendation[] = [];
  const seen = new Set<string>([article.slug]);
  const explicitNextSteps: WikiInterestRecommendation[] = [];
  const explicitSlugs = new Set<string>();

  for (const section of article.sections) {
    for (const block of section.blocks ?? []) {
      if (block.type !== "next-steps") continue;
      for (const item of block.group.items) {
        const target = WIKI_ARTICLE_BY_SLUG.get(item.articleSlug);
        if (
          !canViewWikiArticle(target, canSeeAdmin) ||
          seen.has(target.slug) ||
          explicitSlugs.has(target.slug)
        ) {
          continue;
        }
        explicitSlugs.add(target.slug);
        explicitNextSteps.push({
          article: target,
          sectionId: item.sectionId,
          reason: "本页建议的下一步",
          description: item.description,
        });
      }
    }
  }

  // 用户已经在正文中得到的明确下一步，是页尾推荐最可靠的依据。
  // 页尾会再次汇总这些路径，确保长词条读到结尾时不必回找前文卡片。
  for (const item of explicitNextSteps) {
    seen.add(item.article.slug);
    recommendations.push(item);
  }

  for (const target of relatedArticles(article, canSeeAdmin)) {
    if (seen.has(target.slug)) continue;
    seen.add(target.slug);
    recommendations.push({
      article: target,
      reason: recommendationReason(article, target),
      description: target.summary,
    });
  }

  // 有些公开边界词条的 related 只指向后台运维页；公开读者看不到这些目标时，
  // 从同一栏目选择现行词条兜底，既保持每页有出口，也不越过权限边界。
  if (!recommendations.length) {
    const fallback = visibleArticles(canSeeAdmin)
      .filter(
        (target) =>
          target.slug !== article.slug && target.category === article.category,
      )
      .sort(
        (left, right) =>
          Number(right.status === "current") -
            Number(left.status === "current") ||
          Number(right.kind === article.kind) -
            Number(left.kind === article.kind) ||
          left.title.localeCompare(right.title, "zh-CN"),
      );
    for (const target of fallback) {
      if (seen.has(target.slug)) continue;
      seen.add(target.slug);
      recommendations.push({
        article: target,
        reason: recommendationReason(article, target),
        description: target.summary,
      });
      if (recommendations.length >= limit) break;
    }
  }

  return recommendations.slice(0, limit);
}

function recommendationReason(
  source: WikiArticle,
  target: WikiArticle,
): string {
  if (target.status === "planned" || target.status === "experimental") {
    return "继续前先确认状态";
  }
  if (target.kind === "rule") return "补充规则与边界";
  if (target.kind === "entity") return "理解相关对象";
  if (target.category === source.category) return "继续当前主题";
  if (target.category === "membership") return "查看额度与权益影响";
  if (target.category === "policies") return "了解使用边界";
  if (target.kind === "feature" || target.kind === "page") {
    return "可以继续使用";
  }
  return "延伸了解";
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
      score: articleScore(article, needle, canSeeAdmin),
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
        section.table.caption ?? "",
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

function articleScore(
  article: WikiArticle,
  needle: string,
  canSeeAdmin: boolean,
): number {
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
      ...(canSeeAdmin ? article.sourcePaths : []),
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
    case "path-cards":
      return block.items.flatMap((item) => [
        item.title,
        item.description,
        item.articleSlug,
      ]);
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
