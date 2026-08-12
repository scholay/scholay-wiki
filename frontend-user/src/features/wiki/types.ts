export type WikiArticleKind =
  | "overview"
  | "page"
  | "feature"
  | "rule"
  | "entity"
  | "architecture"
  | "legacy";

export type WikiArticleStatus =
  "current" | "experimental" | "compatibility" | "historical" | "planned";

export type WikiCategory =
  | "getting-started"
  | "discovery"
  | "research-ai"
  | "knowledge"
  | "membership"
  | "mobile"
  | "administration"
  | "platform"
  | "policies"
  | "history";

export interface WikiSection {
  id: string;
  title: string;
  markdown: string;
}

export interface WikiArticle {
  slug: string;
  title: string;
  summary: string;
  category: WikiCategory;
  kind: WikiArticleKind;
  status: WikiArticleStatus;
  audience: string[];
  aliases?: string[];
  /** 当前仓库中的事实来源；覆盖检查会验证这些路径存在。 */
  sourcePaths: string[];
  related?: string[];
  sections: WikiSection[];
}

export interface WikiCategoryMeta {
  slug: WikiCategory;
  title: string;
  shortTitle: string;
  description: string;
}
