import { Search, Globe, Database, type LucideIcon } from 'lucide-react';
import { RhinoBrandIcon } from '@/shared/components/RhinoBrandIcon';
import { cn } from '@/shared/lib/utils';
import type { SearchMode } from '../search-mode';

type ModeTab = {
  id: string;
  label: string;
  icon: LucideIcon;
  mode: SearchMode;
  title: string;
};

type DisabledTab = {
  id: string;
  label: string;
  icon: LucideIcon;
  title: string;
};

const MODE_TABS: Array<ModeTab | DisabledTab> = [
  {
    id: 'smart-search',
    label: '智能搜索',
    icon: RhinoBrandIcon,
    mode: 'smart',
    title: '切换为对话式智能搜索',
  },
  {
    id: 'paper-search',
    label: '文献搜索',
    icon: Search,
    mode: 'classic',
    title: '切换为传统关键词检索',
  },
  {
    id: 'web-search',
    label: '联网搜索',
    icon: Globe,
    title: '即将推出',
  },
  {
    id: 'internal-search',
    label: '内部搜索',
    icon: Database,
    title: '即将推出',
  },
];

interface SearchModeSwitchProps {
  mode: SearchMode;
  onModeChange: (mode: SearchMode) => void;
  className?: string;
}

/**
 * 检索模式分段切换：智能 / 文献 / 联网·内部（后两项占位）。
 * 首页输入框下、检索工作区、智能助手底栏共用。
 */
export function SearchModeSwitch({
  mode,
  onModeChange,
  className,
}: SearchModeSwitchProps) {
  return (
    <div
      role="group"
      aria-label="检索模式"
      className={cn('w-full', className)}
    >
      <ul className="flex w-full items-stretch gap-0.5 rounded-md border border-border bg-surface-1 p-0.5">
        {MODE_TABS.map((item) => {
          const Icon = item.icon;
          if (!('mode' in item)) {
            return (
              <li key={item.id} className="min-w-0 flex-1">
                <span
                  title={item.title}
                  aria-disabled="true"
                  className={cn(
                    'flex h-7 w-full cursor-not-allowed items-center justify-center gap-1',
                    'rounded-sm px-1.5 text-2xs font-medium text-faint opacity-45',
                  )}
                >
                  <Icon className="size-3 shrink-0" strokeWidth={2} />
                  <span className="truncate">{item.label}</span>
                </span>
              </li>
            );
          }
          const active = mode === item.mode;
          return (
            <li key={item.id} className="min-w-0 flex-1">
              <button
                type="button"
                title={item.title}
                aria-pressed={active}
                onClick={() => onModeChange(item.mode)}
                className={cn(
                  'flex h-7 w-full items-center justify-center gap-1 rounded-sm px-1.5',
                  'text-2xs font-semibold outline-none transition-colors',
                  'focus-visible:ring-2 focus-visible:ring-ring/30',
                  active
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <Icon className="size-3 shrink-0" strokeWidth={2} />
                <span className="truncate">{item.label}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
