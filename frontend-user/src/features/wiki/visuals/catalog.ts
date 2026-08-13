import type { WikiNavCategory } from "../types";

export const WIKI_CATEGORY_ICON_SRC = {
  overview: "/wiki/assets/icons/categories/overview.png",
  scenarios: "/wiki/assets/icons/categories/scenarios.png",
  assistant: "/wiki/assets/icons/categories/assistant.png",
  "literature-search": "/wiki/assets/icons/categories/literature-search.png",
  "journal-search": "/wiki/assets/icons/categories/journal-search.png",
  writing: "/wiki/assets/icons/categories/writing.png",
  review: "/wiki/assets/icons/categories/review.png",
  intelligence: "/wiki/assets/icons/categories/intelligence.png",
  resources: "/wiki/assets/icons/categories/resources.png",
  limits: "/wiki/assets/icons/categories/limits.png",
  subscription: "/wiki/assets/icons/categories/subscription.png",
  referrals: "/wiki/assets/icons/categories/referrals.png",
  login: "/wiki/assets/icons/categories/login.png",
  roadmap: "/wiki/assets/icons/categories/roadmap.png",
  terms: "/wiki/assets/icons/categories/terms.png",
  other: "/wiki/assets/icons/categories/other.png",
} satisfies Record<WikiNavCategory, string>;

export const WIKI_EXTRA_FEATURE_ICON_SRC = {
  "smart-search": "/wiki/assets/icons/categories/smart-search.png",
} as const;

export type WikiExtraFeatureIconSlug = keyof typeof WIKI_EXTRA_FEATURE_ICON_SRC;
export type WikiFeatureIconSlug = WikiNavCategory | WikiExtraFeatureIconSlug;

export function wikiFeatureIconSrc(slug: WikiFeatureIconSlug): string {
  return slug === "smart-search"
    ? WIKI_EXTRA_FEATURE_ICON_SRC[slug]
    : WIKI_CATEGORY_ICON_SRC[slug];
}

interface WikiArticleIntroVisual {
  src: string;
  alt: string;
  caption: string;
}

export const WIKI_ARTICLE_INTRO_VISUALS = {
  claw: {
    src: "/wiki/assets/illustrations/intros/claw.png",
    alt: "犀牛智能助手在研究工作台汇集附件、引用、技能与工具并生成交付物的图示",
    caption: "智能助手工作台",
  },
} as const satisfies Record<string, WikiArticleIntroVisual>;

export type WikiArticleIntroVisualSlug =
  keyof typeof WIKI_ARTICLE_INTRO_VISUALS;

export function wikiArticleIntroVisual(
  articleSlug: string,
): WikiArticleIntroVisual | undefined {
  return Object.prototype.hasOwnProperty.call(
    WIKI_ARTICLE_INTRO_VISUALS,
    articleSlug,
  )
    ? WIKI_ARTICLE_INTRO_VISUALS[articleSlug as WikiArticleIntroVisualSlug]
    : undefined;
}
