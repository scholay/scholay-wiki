import {
  type LucideIcon,
  Search,
  Database,
  Compass,
  FileCheck,
  PenTool,
  Globe,
  LayoutGrid,
} from 'lucide-react';
import { RhinoBrandIcon } from '@/shared/components/RhinoBrandIcon';

/**
 * 全站功能菜单 —— 唯一来源(对照 .pen `S72unz` 全站功能菜单浮层)。
 *
 * 6 个功能 / 3 个分类(检索 · 智能 · 资源),所有名称、英文、描述、icon
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
    label: '学术搜索',
    englishName: 'Paper Search',
    description: '文献 · 期刊库 · 数据库 · 情报',
    icon: Search,
    href: '/search',
    category: 'search',
    match: (p) =>
      startsWith('/search')(p) ||
      startsWith('/journals')(p) ||
      startsWith('/tools/datasets')(p) ||
      startsWith('/tools/news')(p),
  },

  // ---------- 智能 ----------
  {
    id: 'claw',
    label: '智能助手',
    englishName: 'AI Assistance',
    description: '智能问答与对话',
    icon: RhinoBrandIcon,
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
    label: '我的资源',
    englishName: 'My Resources',
    description: '文献集 · 期刊集 · 稿件集 · 文件夹',
    icon: Database,
    href: '/library',
    category: 'resource',
    match: startsWith('/library'),
  },
  {
    id: 'tools',
    label: 'scholay广场',
    englishName: 'Scholay Plaza',
    description: '学术工具 · 学术skills · 学术prompts',
    icon: Compass,
    href: '/tools',
    category: 'resource',
    match: (p) =>
      (startsWith('/tools')(p) &&
        !startsWith('/tools/datasets')(p) &&
        !startsWith('/tools/news')(p)) ||
      startsWith('/skills')(p),
  },
  // 「学术资源」(/resources + /blog 学术资源中心)不进顶栏功能菜单 —— 它是内容/资源页,
  // 不是核心功能,入口放页脚(shared/components/Footer.tsx 的 BRAND_LINKS 已有「学术资源」)。
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

/** 路径 → 用户可见的功能名(后退目标等共用)。 */
export function resolveFeatureLabel(pathname: string): string {
  const menu = MENUS.find((m) => m.match(pathname));
  if (menu) return menu.label;
  if (/^\/(paper|author|journal|pdf)\//.test(pathname)) return '浏览器';
  if (pathname === '/') return '首页';
  return '浏览中';
}

/** 路径 → 顶栏功能 chip（名 + 图标）。首页显示「全站功能」。 */
export function resolveFeatureChip(pathname: string): {
  label: string;
  icon: LucideIcon;
} {
  const menu = MENUS.find((m) => m.match(pathname));
  if (menu) return { label: menu.label, icon: menu.icon };
  if (/^\/(paper|author|journal|pdf)\//.test(pathname)) {
    return { label: '浏览器', icon: Globe };
  }
  if (pathname === '/') return { label: '全站功能', icon: LayoutGrid };
  return { label: '浏览中', icon: Compass };
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
