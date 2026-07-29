import { NavLink } from 'react-router-dom';
import {
  Search,
  Folder,
  PenTool,
  FileCheck,
  Compass,
  LayoutGrid,
  type LucideIcon,
} from 'lucide-react';
import { RhinoBrandIcon } from '@/shared/components/RhinoBrandIcon';
import { PRISM_COMING_SOON } from '@/shared/lib/feature-flags';
import { cn } from '@/shared/lib/utils';
import { SearchModeSwitch } from '@/features/search/components/SearchModeSwitch';
import type { SearchMode } from '@/features/search/search-mode';

type Accent = 'green' | 'amber' | 'red' | 'blue' | 'muted';

const ACCENT: Record<Accent, string> = {
  green: 'bg-brand-green/12 text-brand-green',
  amber: 'bg-brand-amber/12 text-brand-amber',
  red: 'bg-brand-red/12 text-brand-red',
  blue: 'bg-brand-blue/12 text-brand-blue',
  muted: 'bg-surface-1 text-faint',
};

type LinkEntrance = {
  id: string;
  label: string;
  icon: LucideIcon;
  accent: Accent;
  href: string;
  title: string;
  comingSoon?: boolean;
  hot?: boolean;
};

/** 下方功能入口（含智能助手 / 文献搜索的跳转入口） */
const FEATURE_LINKS: LinkEntrance[] = [
  {
    id: 'claw',
    label: '智能助手',
    icon: RhinoBrandIcon,
    accent: 'amber',
    href: '/claw',
    title: '进入智能助手',
    hot: true,
  },
  {
    id: 'paper-search',
    label: '文献搜索',
    icon: Search,
    accent: 'green',
    href: '/search',
    title: '进入文献搜索',
  },
  {
    id: 'library',
    label: '我的资源',
    icon: Folder,
    accent: 'red',
    href: '/library',
    title: '文献集 · 期刊集 · 稿件集 · 文件夹',
  },
  {
    id: 'prism',
    label: '智能写作',
    icon: PenTool,
    accent: 'green',
    href: '/prism',
    title: '科研级 LaTeX 写作',
    comingSoon: PRISM_COMING_SOON,
  },
  {
    id: 'peer-review',
    label: '智能审稿',
    icon: FileCheck,
    accent: 'red',
    href: '/peer-review',
    title: '投稿前 AI 预审',
  },
  {
    id: 'skills',
    label: 'Skills广场',
    icon: Compass,
    accent: 'amber',
    href: '/tools/skills',
    title: '社区技能',
  },
  {
    id: 'tools-plaza',
    label: '功能广场',
    icon: LayoutGrid,
    accent: 'blue',
    href: '/tools',
    title: '全网工具黄页',
  },
];

interface HomeSearchModeRowProps {
  mode: SearchMode;
  onModeChange: (mode: SearchMode) => void;
}

/** 首页输入框下：复用全站 SearchModeSwitch，挂 tour 锚点。 */
export function HomeSearchModeRow({
  mode,
  onModeChange,
}: HomeSearchModeRowProps) {
  return (
    <div data-tour="home-mode-switch">
      <SearchModeSwitch mode={mode} onModeChange={onModeChange} />
    </div>
  );
}

/**
 * 首页第二层：功能跳转入口（含智能搜索 / 文献搜索）。
 */
export function HomeFeatureEntrances() {
  return (
    <nav aria-label="功能入口" className="mx-auto w-full max-w-3xl">
      <ul className="flex flex-wrap items-stretch justify-center gap-1.5 sm:gap-2">
        {FEATURE_LINKS.map((item) => {
          const Icon = item.icon;
          return (
            <li key={item.id}>
              <NavLink
                to={item.href}
                title={item.title}
                className={({ isActive }) =>
                  cn(
                    'group relative inline-flex h-9 items-center gap-1.5 rounded-md border px-2.5',
                    'bg-background shadow-sm outline-none transition-colors',
                    'hover:border-border-strong hover:bg-surface-1',
                    'focus-visible:ring-2 focus-visible:ring-ring/30',
                    isActive
                      ? 'border-foreground/20 bg-surface-1'
                      : 'border-border',
                  )
                }
              >
                <span
                  className={cn(
                    'flex size-6 shrink-0 items-center justify-center rounded-sm',
                    ACCENT[item.accent],
                  )}
                >
                  <Icon className="size-3.5" strokeWidth={2} />
                </span>
                <span className="max-w-[5.5rem] truncate text-2xs font-semibold text-foreground sm:max-w-[6.5rem]">
                  {item.label}
                </span>
                {item.hot && (
                  <span className="absolute -right-1 -top-1.5 rounded-pill bg-brand-red px-1 py-px text-[9px] font-bold leading-none text-background">
                    HOT
                  </span>
                )}
                {item.comingSoon && (
                  <span
                    className="absolute -right-0.5 -top-0.5 size-1.5 rounded-pill bg-brand-amber ring-2 ring-background"
                    aria-label="即将推出"
                  />
                )}
              </NavLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
