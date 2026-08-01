import { ChevronDown, Search, Sparkles, type LucideIcon } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import { cn } from '@/shared/lib/utils';

type SearchMode = 'smart' | 'engine';

const MODE_META: Record<
  SearchMode,
  { label: string; icon: LucideIcon }
> = {
  smart: { label: '智能搜索', icon: Sparkles },
  engine: { label: '搜索引擎', icon: Search },
};

/**
 * 输入框左侧模式选择 —— 左侧图标 + 当前模式文案，点开下拉切换。
 *
 * checked = 智能搜索；unchecked = 搜索引擎。
 */
export function SmartSearchToggle({
  checked,
  onCheckedChange,
  className,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  className?: string;
}) {
  const mode: SearchMode = checked ? 'smart' : 'engine';
  const { label, icon: ModeIcon } = MODE_META[mode];

  return (
    <div
      data-tour="home-mode-switch"
      className={cn(
        'inline-flex shrink-0 items-center border-r border-border pr-2.5 select-none',
        className,
      )}
      onMouseDown={(e) => e.preventDefault()}
    >
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`检索模式：${label}`}
            title="选择检索模式"
            className={cn(
              'inline-flex h-7 max-w-[8.5rem] items-center gap-1 rounded-sm px-2',
              'text-2xs font-semibold transition-colors',
              'outline-none focus-visible:ring-2 focus-visible:ring-ring/35',
              'data-[state=open]:bg-surface-1',
              mode === 'smart'
                ? 'text-brand-red hover:bg-brand-red/8'
                : 'text-foreground hover:bg-surface-2',
            )}
          >
            <ModeIcon className="size-3 shrink-0" strokeWidth={2.25} />
            <span className="truncate">{label}</span>
            <ChevronDown
              className="size-3 shrink-0 opacity-50"
              strokeWidth={2.25}
              aria-hidden
            />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" sideOffset={6} className="min-w-[9rem]">
          <DropdownMenuRadioGroup
            value={mode}
            onValueChange={(v) => onCheckedChange(v === 'smart')}
          >
            {(Object.keys(MODE_META) as SearchMode[]).map((key) => {
              const meta = MODE_META[key];
              const Icon = meta.icon;
              return (
                <DropdownMenuRadioItem
                  key={key}
                  value={key}
                  className="cursor-pointer text-xs font-medium"
                >
                  <span className="inline-flex items-center gap-1.5">
                    <Icon className="size-3.5 shrink-0" strokeWidth={2.2} />
                    {meta.label}
                  </span>
                </DropdownMenuRadioItem>
              );
            })}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
