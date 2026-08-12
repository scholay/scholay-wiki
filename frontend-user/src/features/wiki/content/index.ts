import { administrationArticles } from "./administration";
import { backendDomainArticles } from "./backend-domains";
import { discoveryArticles } from "./discovery";
import { ecosystemArticles } from "./ecosystem";
import { foundationArticles } from "./foundations";
import { infrastructureArticles } from "./infrastructure";
import { membershipArticles } from "./membership";
import { platformArticles } from "./platform";
import { policyAndHistoryArticles } from "./policies-and-history";
import { researchAiArticles } from "./research-ai";
import { userExperienceArticles } from "./user-experience";
import { WIKI_CATEGORIES } from "./categories";
import type { WikiArticle, WikiCategory } from "../types";

export {
  WIKI_CATEGORIES,
  WIKI_KIND_LABEL,
  WIKI_STATUS_LABEL,
} from "./categories";

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
];

export const WIKI_ARTICLE_BY_SLUG = new Map(
  WIKI_ARTICLES.map((article) => [article.slug, article]),
);

export function articlesInCategory(category: WikiCategory): WikiArticle[] {
  return WIKI_ARTICLES.filter((article) => article.category === category);
}

export function relatedArticles(article: WikiArticle): WikiArticle[] {
  return (article.related ?? [])
    .map((slug) => WIKI_ARTICLE_BY_SLUG.get(slug))
    .filter((item): item is WikiArticle => Boolean(item));
}

export function searchWikiArticles(query: string): WikiArticle[] {
  const needle = normalize(query);
  if (!needle) return WIKI_ARTICLES;

  return WIKI_ARTICLES.map((article) => ({
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
      article.category,
      article.kind,
      article.status,
      ...article.audience,
      ...article.sourcePaths,
    ]
      .filter(Boolean)
      .join(" "),
  );
  const body = normalize(
    article.sections
      .map((section) => `${section.title} ${section.markdown}`)
      .join(" "),
  );

  if (title === needle) return 100;
  if (title.includes(needle)) return 70;
  if (aliases.includes(needle)) return 50;
  if (summary.includes(needle)) return 30;
  if (metadata.includes(needle)) return 20;
  if (body.includes(needle)) return 10;
  return 0;
}

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase("zh-CN").replace(/\s+/g, " ");
}
