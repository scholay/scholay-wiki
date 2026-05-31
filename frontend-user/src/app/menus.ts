import {
  type LucideIcon,
  Search,
  BookOpen,
  Folder,
  Compass,
  FileCheck,
  PenTool,
  Sparkles,
} from 'lucide-react';

/**
 * 全站功能菜单 —— 唯一来源(对照 .pen `S72unz` 全站功能菜单浮层)。
 *
 * 7 个功能 / 3 个分类(检索 · 智能 · 资源),所有名称、英文、描述、icon
 * 都按 .pen 标准化。任何地方需要"功能名 / 子标题 / icon"都从这里取,
 * 不再在组件内硬编码 "Prism" "工具大全" 等历史叫法。
 */

export type MenuCategory = 'search' | 'ai' | 'resource';

export interface Menu {
  id: string;
  /** 中文显示名(用户看到的主标题) */
  label: string;
  /** 英文名(显示在副标题前缀,作品牌识别) */
  englishName: string;
  /** 副标题中文描述(不含英文前缀,用于功能解释) */
  description: string;
  icon: LucideIcon;
  /** 主路由路径 */
  href: string;
  /** 分类 —— 用于全站功能菜单浮层分组 */
  category: MenuCategory;
  /**
   * "即将推出" 标记 —— true 时菜单点击仍可跳转,但会在 chip 上加 amber 角标,
   * 进入页面后由各自 Page 渲染 ComingSoonView 占位预览
   */
  comingSoon?: boolean;
  /** 哪些路径前缀算"在当前菜单内" */
  match: (pathname: string) => boolean;
}

const startsWith = (prefix: string) => (p: string) =>
  p === prefix || p.startsWith(prefix + '/');

export const MENUS: Menu[] = [
  // ---------- 检索 ----------
  {
    id: 'search',
    label: '文献搜索',
    englishName: 'Scholar Search',
    description: '全网 / 库内 检索文献、学者',
    icon: Search,
    // 文献搜索独立成菜单 —— 首页(/)是品牌首页,这里只负责检索工作区。
    // SearchPage 内部有 last-search 持久化:无 query 时会自动恢复上次的
    // 关键词 / 筛选 / 分页(scholay.last-search localStorage)。
    href: '/search',
    category: 'search',
    match: startsWith('/search'),
  },
  {
    id: 'journal-search',
    label: '期刊搜索',
    englishName: 'Journal Search',
    description: '检索期刊 · 影响因子 · 分区',
    icon: BookOpen,
    href: '/journals/search',
    category: 'search',
    match: startsWith('/journals'),
  },

  // ---------- 智能 ----------
  {
    id: 'claw',
    label: '智能助手',
    englishName: 'AI Assistance',
    description: '智能问答与对话',
    icon: Sparkles,
    href: '/claw',
    category: 'ai',
    match: startsWith('/claw'),
  },
  {
    id: 'prism',
    label: '智能写作',
    englishName: 'Scholay Prism',
    description: '科研级 LaTeX 写作',
    icon: PenTool,
    href: '/prism',
    category: 'ai',
    comingSoon: true,
    match: startsWith('/prism'),
  },
  {
    id: 'peer-review',
    label: '智能审稿',
    englishName: 'AI Reviewer',
    description: '投稿前 AI 预审',
    icon: FileCheck,
    href: '/peer-review',
    category: 'ai',
    match: startsWith('/peer-review'),
  },

  // ---------- 资源 ----------
  {
    id: 'library',
    label: '文献集',
    englishName: 'Collections',
    description: '我的文献集合 · 自定义文件夹',
    icon: Folder,
    href: '/library',
    category: 'resource',
    match: startsWith('/library'),
  },
  {
    id: 'tools',
    label: '功能广场',
    englishName: 'Playground',
    description: '全部功能与玩法探索',
    icon: Compass,
    href: '/tools',
    category: 'resource',
    comingSoon: true,
    match: startsWith('/tools'),
  },
];

export const CATEGORY_LABELS: Record<MenuCategory, string> = {
  search: '检索',
  ai: '智能',
  resource: '资源',
};

/** 按分类分组,保持 MENUS 内的顺序 */
export function groupMenusByCategory(): Array<{ category: MenuCategory; label: string; items: Menu[] }> {
  const order: MenuCategory[] = ['search', 'ai', 'resource'];
  return order.map((category) => ({
    category,
    label: CATEGORY_LABELS[category],
    items: MENUS.filter((m) => m.category === category),
  }));
}

/** 当前路径对应的菜单索引。无匹配(典型如在 `/` 首页)返回 0 ——
 *  carousel 仍要展示首项,但 chip 自身不会高亮,因为 carousel 内部用
 *  `m.match(pathname)` 二次判定 active 态,findActiveMenuIndex 仅决定居中位置。 */
export function findActiveMenuIndex(pathname: string): number {
  const idx = MENUS.findIndex((m) => m.match(pathname));
  return idx >= 0 ? idx : 0;
}

/** prev/active/next 三联,用于 carousel 显示 */
export function pickCarouselTriple(active: number) {
  const n = MENUS.length;
  return {
    prev: MENUS[(active - 1 + n) % n],
    active: MENUS[active],
    next: MENUS[(active + 1) % n],
  };
}
