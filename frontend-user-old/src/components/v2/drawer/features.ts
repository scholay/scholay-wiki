/**
 * 功能元数据 —— DrawerV2 顶部切换器与内容路由共享
 * ============================================================================
 * 单一事实源：每个功能的 key / 显示名 / 图标 / 默认路由
 * 顺序即"轮播顺序"——左右箭头按这个顺序走
 *
 * 图标统一用 lucide-react 矢量组件（避免 emoji 的字体/对齐问题）。
 */
import {
  Home,
  Search,
  Library,
  LayoutGrid,
  Scale,
  Feather,
  Send,
  Settings,
  type LucideIcon,
} from 'lucide-react';
import type { DrawerFeature } from '../../../stores/drawerV2.store';

export interface FeatureMeta {
  key: DrawerFeature;
  label: string;
  icon: LucideIcon;
  route: string;
}

export const FEATURES: FeatureMeta[] = [
  { key: 'home',     label: '首页',     icon: Home,       route: '/' },
  { key: 'search',   label: '学术搜索', icon: Search,     route: '/search-results' },
  { key: 'library',  label: '文献集',   icon: Library,    route: '/library' },
  { key: 'features', label: '功能大全', icon: LayoutGrid, route: '/features' },
  { key: 'review',   label: '智能审稿', icon: Scale,      route: '/peer-review-v2' },
  { key: 'latex',    label: 'Prism',    icon: Feather,    route: '/latex-writer' },
  { key: 'submit',   label: '投稿',     icon: Send,       route: '/submit' },
  { key: 'settings', label: '设置',     icon: Settings,   route: '/settings' },
];

const FEATURE_BY_KEY = new Map(FEATURES.map((f) => [f.key, f]));

export const getFeature = (key: DrawerFeature): FeatureMeta =>
  FEATURE_BY_KEY.get(key) ?? FEATURES[0];

/** 根据路由路径推断当前活跃功能 */
export const routeToFeature = (pathname: string): DrawerFeature => {
  if (pathname === '/') return 'home';
  if (pathname.startsWith('/search-results')) return 'search';
  if (pathname.startsWith('/library')) return 'library';
  if (pathname.startsWith('/peer-review')) return 'review';
  if (pathname.startsWith('/latex-writer')) return 'latex';
  if (pathname.startsWith('/submit')) return 'submit';
  if (pathname.startsWith('/features')) return 'features';
  if (pathname.startsWith('/settings')) return 'settings';
  return 'home';
};

/** 轮播：相对当前 feature 的前/后一个 */
export const neighborFeature = (current: DrawerFeature, delta: -1 | 1): FeatureMeta => {
  const idx = FEATURES.findIndex((f) => f.key === current);
  const next = (idx + delta + FEATURES.length) % FEATURES.length;
  return FEATURES[next];
};
