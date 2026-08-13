import {
  BookOpen,
  Compass,
  FileCheck,
  Folder,
  PenTool,
  Search,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import type { WikiNavCategory } from "../types";

/**
 * Wiki 页眉对照的全站功能菜单（检索 / 智能 / 资源 共 7 项）。
 * 文案对齐产品顶栏宫灯 MenuCarousel。
 */
export type WikiProductMenuId =
  | "search"
  | "journal-search"
  | "claw"
  | "prism"
  | "peer-review"
  | "library"
  | "tools";

export type WikiProductMenuCategory = "search" | "ai" | "resource";

export interface WikiProductMenu {
  id: WikiProductMenuId;
  label: string;
  englishName: string;
  description: string;
  icon: LucideIcon;
  category: WikiProductMenuCategory;
}

export const WIKI_PRODUCT_MENUS: WikiProductMenu[] = [
  {
    id: "search",
    label: "文献搜索",
    englishName: "Paper Search",
    description: "全网 / 库内 检索文献、学者",
    icon: Search,
    category: "search",
  },
  {
    id: "journal-search",
    label: "期刊搜索",
    englishName: "Journal Search",
    description: "检索期刊 · 影响因子 · 分区",
    icon: BookOpen,
    category: "search",
  },
  {
    id: "claw",
    label: "智能助手",
    englishName: "AI Assistance",
    description: "智能问答与对话",
    icon: Sparkles,
    category: "ai",
  },
  {
    id: "prism",
    label: "智能写作",
    englishName: "Scholay Prism",
    description: "科研级 LaTeX 写作",
    icon: PenTool,
    category: "ai",
  },
  {
    id: "peer-review",
    label: "智能审稿",
    englishName: "AI Reviewer",
    description: "投稿前 AI 预审",
    icon: FileCheck,
    category: "ai",
  },
  {
    id: "library",
    label: "我的资源",
    englishName: "My Resources",
    description: "文献集 · 期刊集 · 稿件集 · 文件夹",
    icon: Folder,
    category: "resource",
  },
  {
    id: "tools",
    label: "Skills广场",
    englishName: "Skills Plaza",
    description: "社区技能",
    icon: Compass,
    category: "resource",
  },
];

export function wikiProductMenuById(
  id: WikiProductMenuId,
): WikiProductMenu | undefined {
  return WIKI_PRODUCT_MENUS.find((menu) => menu.id === id);
}

/** 词条级覆盖：null = 明确不属于这 7 项，继续用栏目图标。 */
const ARTICLE_MENU: Record<string, WikiProductMenuId | null> = {
  "smart-search": null,
  "community-skills": "tools",
  "feature-tools": "tools",
  "feature-tools-coldstart-governance": "tools",
};

const NAV_CATEGORY_MENU: Partial<Record<WikiNavCategory, WikiProductMenuId>> = {
  assistant: "claw",
  "literature-search": "search",
  "journal-search": "journal-search",
  writing: "prism",
  review: "peer-review",
  resources: "library",
};

export function resolveWikiProductMenuFromNavCategory(
  navCategory?: WikiNavCategory,
): WikiProductMenu | undefined {
  if (!navCategory) return undefined;
  const id = NAV_CATEGORY_MENU[navCategory];
  return id ? wikiProductMenuById(id) : undefined;
}

export function resolveWikiProductMenu(
  articleSlug: string,
  navCategory?: WikiNavCategory,
): WikiProductMenu | undefined {
  if (Object.prototype.hasOwnProperty.call(ARTICLE_MENU, articleSlug)) {
    const id = ARTICLE_MENU[articleSlug];
    return id ? wikiProductMenuById(id) : undefined;
  }
  return resolveWikiProductMenuFromNavCategory(navCategory);
}
