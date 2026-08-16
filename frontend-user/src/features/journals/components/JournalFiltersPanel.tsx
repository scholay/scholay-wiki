import { useState, type ReactNode } from 'react';
import { ChevronDown, Filter, X } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover';
import { cn } from '@/shared/lib/utils';
import {
  CCF_OPTIONS,
  FQB_QUARTILE_OPTIONS,
  IF_THRESHOLD_OPTIONS,
  JCR_QUARTILE_OPTIONS,
  PUBLISHER_OPTIONS,
  type JournalFilters,
} from '../types';

interface JournalFiltersPanelProps {
  filters: JournalFilters;
  onFiltersChange: (next: JournalFilters) => void;
  className?: string;
  /** Dialog already has a title; skip the in-panel chrome. */
  hideHeader?: boolean;
  /** Left rail: fill height and scroll groups, no dialog max-height. */
  rail?: boolean;
}

/** 期刊筛选表单 —— 结果顶栏 Popover 内复用。 */
export function JournalFiltersPanel({
  filters,
  onFiltersChange,
  className,
  hideHeader = false,
  rail = false,
}: JournalFiltersPanelProps) {
  const patch = <K extends keyof JournalFilters>(k: K, v: JournalFilters[K]) =>
    onFiltersChange({ ...filters, [k]: v });

  const clearAll = () =>
    onFiltersChange({
      fqbQuartile: undefined,
      jcrQuartile: undefined,
      minImpactFactor: undefined,
      ccfRank: undefined,
      publisher: undefined,
    });

  const chips = buildJournalFilterChips(filters, patch);
  const hasActive = chips.length > 0;

  return (
    <div className={cn('flex min-h-0 flex-col', rail && 'h-full', className)}>
      {!hideHeader && (
        <div
          className={cn(
            'flex items-center justify-between gap-2 border-b border-border',
            rail ? 'px-3 py-2' : 'px-4 py-3',
          )}
        >
          <span className="text-sm font-bold text-foreground">筛选器</span>
          {hasActive && (
            <button
              type="button"
              onClick={clearAll}
              className="text-2xs font-bold text-brand-red hover:opacity-70"
            >
              清空
            </button>
          )}
        </div>
      )}
      {hideHeader && hasActive && (
        <div className="flex justify-end px-4 pt-3">
          <button
            type="button"
            onClick={clearAll}
            className="text-2xs font-bold text-brand-red hover:opacity-70"
          >
            清空
          </button>
        </div>
      )}

      {hasActive && (
        <div className={cn('border-b border-border py-2', rail ? 'px-3' : 'px-4')}>
          <div className="flex flex-wrap gap-1.5">
            {chips.map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={c.remove}
                className="inline-flex h-[22px] items-center gap-1 rounded-pill border border-brand-red/30 bg-danger-soft px-2 text-2xs font-medium text-brand-red"
              >
                {c.label}
                <X className="size-2.5" strokeWidth={3} />
              </button>
            ))}
          </div>
        </div>
      )}

      <div
        className={cn(
          'overflow-y-auto py-1',
          rail ? 'min-h-0 flex-1' : !hideHeader && 'max-h-[min(60vh,520px)]',
        )}
      >
        <FilterRadioGroup
          label="中科院分区"
          name="fqbQuartile"
          value={filters.fqbQuartile}
          options={FQB_QUARTILE_OPTIONS}
          onChange={(v) => patch('fqbQuartile', v)}
          compact={rail}
        />
        <FilterRadioGroup
          label="JCR 分区"
          name="jcrQuartile"
          value={filters.jcrQuartile}
          options={JCR_QUARTILE_OPTIONS}
          onChange={(v) => patch('jcrQuartile', v)}
          compact={rail}
        />
        <FilterRadioGroup
          label="影响因子"
          name="minImpactFactor"
          value={filters.minImpactFactor}
          options={IF_THRESHOLD_OPTIONS}
          onChange={(v) => patch('minImpactFactor', v)}
          compact={rail}
        />
        <FilterRadioGroup
          label="CCF 推荐"
          name="ccfRank"
          value={filters.ccfRank}
          options={CCF_OPTIONS}
          onChange={(v) => patch('ccfRank', v)}
          compact={rail}
        />
        <FilterRadioGroup
          label="出版商"
          name="publisher"
          value={filters.publisher}
          options={PUBLISHER_OPTIONS}
          onChange={(v) => patch('publisher', v)}
          compact={rail}
        />
      </div>
    </div>
  );
}

export function countActiveJournalFilters(filters: JournalFilters): number {
  return buildJournalFilterChips(filters, () => {}).length;
}

/** 结果顶栏「筛选」—— 点开 Popover,不再占左侧栏。 */
export function JournalFiltersButton({
  filters,
  onFiltersChange,
  className,
}: {
  filters: JournalFilters;
  onFiltersChange: (next: JournalFilters) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const activeCount = countActiveJournalFilters(filters);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="打开筛选器"
          title="筛选"
          className={cn(
            'inline-flex h-7 shrink-0 items-center gap-1.5 rounded-8 px-3 text-12 transition-colors',
            open || activeCount > 0
              ? 'bg-foreground text-background font-medium'
              : 'border border-border bg-background text-subtle hover:border-foreground',
            className,
          )}
        >
          <Filter className="size-3" strokeWidth={open || activeCount > 0 ? 2.5 : 2} />
          筛选
          {activeCount > 0 ? (
            <span className="tabular-nums">{activeCount}</span>
          ) : null}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        side="bottom"
        className="w-[min(320px,calc(100vw-48px))] p-0"
      >
        <JournalFiltersPanel
          hideHeader
          filters={filters}
          onFiltersChange={onFiltersChange}
        />
      </PopoverContent>
    </Popover>
  );
}

export function buildJournalFilterChips(
  filters: JournalFilters,
  patch: <K extends keyof JournalFilters>(k: K, v: JournalFilters[K]) => void,
): Array<{ key: string; label: string; remove: () => void }> {
  const chips: Array<{ key: string; label: string; remove: () => void }> = [];
  const push = (
    key: keyof JournalFilters,
    options: readonly { value: string | number; label: string }[],
    prefix: string,
  ) => {
    const v = filters[key];
    if (v == null || v === '') return;
    const opt = options.find((o) => o.value === v);
    chips.push({
      key,
      label: `${prefix} · ${opt?.label ?? String(v)}`,
      remove: () => patch(key, undefined as JournalFilters[typeof key]),
    });
  };
  push('fqbQuartile', FQB_QUARTILE_OPTIONS, '中科院');
  push('jcrQuartile', JCR_QUARTILE_OPTIONS, 'JCR');
  push('minImpactFactor', IF_THRESHOLD_OPTIONS, 'IF');
  push('ccfRank', CCF_OPTIONS, 'CCF');
  push('publisher', PUBLISHER_OPTIONS, '出版商');
  return chips;
}

function FilterGroup({
  label,
  children,
  defaultCollapsed = false,
  compact = false,
}: {
  label: string;
  children: ReactNode;
  defaultCollapsed?: boolean;
  compact?: boolean;
}) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  return (
    <div className="flex flex-col">
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        className={cn(
          'flex h-6 items-center justify-between gap-2 pb-1 pt-1.5 text-left transition-colors hover:bg-surface-1',
          compact ? 'px-3' : 'px-4',
        )}
      >
        <span className="text-2xs font-bold uppercase tracking-[0.16em] text-faint">
          {label}
        </span>
        <ChevronDown
          className={cn(
            'size-3 text-subtle transition-transform',
            collapsed && '-rotate-90',
          )}
        />
      </button>
      {!collapsed && <div className="flex flex-col pb-1">{children}</div>}
    </div>
  );
}

function FilterRadioGroup<T extends string | number>({
  label,
  name,
  value,
  options,
  onChange,
  compact = false,
}: {
  label: string;
  name: string;
  value: T | undefined;
  options: readonly { value: T; label: string }[];
  onChange: (v: T | undefined) => void;
  compact?: boolean;
}) {
  return (
    <FilterGroup label={label} compact={compact}>
      <RadioRow
        name={name}
        checked={value == null}
        label="不限"
        onSelect={() => onChange(undefined)}
        compact={compact}
      />
      {options.map((opt) => (
        <RadioRow
          key={String(opt.value)}
          name={name}
          checked={value === opt.value}
          label={opt.label}
          onSelect={() => onChange(opt.value)}
          compact={compact}
        />
      ))}
    </FilterGroup>
  );
}

function RadioRow({
  name,
  checked,
  label,
  onSelect,
  compact = false,
}: {
  name: string;
  checked: boolean;
  label: string;
  onSelect: () => void;
  compact?: boolean;
}) {
  return (
    <label
      className={cn(
        'flex h-6 cursor-pointer items-center gap-2 transition-colors hover:bg-surface-1',
        compact ? 'px-3' : 'gap-2.5 px-4',
      )}
    >
      <input
        type="radio"
        name={name}
        checked={checked}
        onChange={onSelect}
        className="size-3.5 accent-brand-red"
      />
      <span
        className={cn(
          'min-w-0 flex-1 truncate text-sm',
          checked ? 'font-semibold text-foreground' : 'text-subtle',
        )}
      >
        {label}
      </span>
    </label>
  );
}
