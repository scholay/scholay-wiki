import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Checkbox } from '@/shared/ui/checkbox';
import { cn } from '@/shared/lib/utils';
import type { TimeRange } from '../../types';

/**
 * 共享给 SearchSidebar 的两个原子:
 *   - FilterGroup —— 可折叠 label + children 容器,顶部 chevron 旋转
 *   - CheckboxRow —— shadcn Checkbox + 文案 + hover 行
 *   - TIME_OPTIONS / timeRangeLabel —— 时间范围常量与 chip 文案
 */

export function FilterGroup({
  label,
  children,
  defaultCollapsed = false,
}: {
  label: string;
  children: React.ReactNode;
  defaultCollapsed?: boolean;
}) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  return (
    <div className="flex flex-col">
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        className="flex items-center justify-between gap-2 h-6 px-4 pt-1.5 pb-1 text-left hover:bg-surface-1 transition-colors"
      >
        <span className="text-2xs font-bold uppercase text-faint">
          {label}
        </span>
        <ChevronDown
          className={cn(
            'size-3 text-subtle transition-transform',
            collapsed && '-rotate-90'
          )}
        />
      </button>
      {!collapsed && <div className="flex flex-col pb-1">{children}</div>}
    </div>
  );
}

export function CheckboxRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <label className="flex items-center gap-2.5 h-6 px-4 cursor-pointer hover:bg-surface-1 transition-colors">
      <Checkbox checked={checked} onCheckedChange={onChange} />
      <span
        className={cn(
          'flex-1 min-w-0 truncate text-sm',
          checked ? 'text-foreground font-semibold' : 'text-subtle'
        )}
      >
        {label}
      </span>
    </label>
  );
}

export const TIME_OPTIONS: { value: TimeRange; label: string }[] = [
  { value: 'all', label: '不限' },
  { value: '1y', label: '近 1 年' },
  { value: '3y', label: '近 3 年' },
  { value: '5y', label: '近 5 年' },
];

export function timeRangeLabel(r: TimeRange): string {
  return TIME_OPTIONS.find((o) => o.value === r)?.label ?? r;
}
