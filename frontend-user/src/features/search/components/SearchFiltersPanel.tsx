import { useCallback } from 'react';
import { useAutoAnimate } from '@formkit/auto-animate/react';
import { X } from 'lucide-react';
import { Checkbox } from '@/shared/ui/checkbox';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/ui/tooltip';
import { SOURCE_META } from '@/shared/lib/source';
import { cn } from '@/shared/lib/utils';
import {
  SOURCE_OPTIONS,
  isSubjectsSingleSelect,
  pruneFiltersForSource,
  sortOptionsForSource,
  sourceSupports,
  subjectsForSource,
  typesForSource,
  type SearchFilters,
  type SearchSource,
  type SortOrder,
} from '../types';
import { buildFilterChips } from './search-sidebar/chips-from-filters';
import {
  CheckboxRow,
  FilterGroup,
  TIME_OPTIONS,
} from './search-sidebar/primitives';

interface SearchFiltersPanelProps {
  filters: SearchFilters;
  onFiltersChange: (next: SearchFilters) => void;
  className?: string;
}

/** 文献检索筛选器表单 —— 原侧栏筛选器,现可在结果区弹层内复用 */
export function SearchFiltersPanel({
  filters,
  onFiltersChange,
  className,
}: SearchFiltersPanelProps) {
  const [chipsRef] = useAutoAnimate<HTMLDivElement>({
    duration: 160,
    easing: 'ease-out',
  });

  const patch = useCallback(
    <K extends keyof SearchFilters>(k: K, v: SearchFilters[K]) =>
      onFiltersChange({ ...filters, [k]: v }),
    [filters, onFiltersChange],
  );

  const toggleInList = useCallback(
    (k: 'venues' | 'subjects' | 'publicationTypes', id: string) => {
      const list = filters[k];
      if (list.includes(id)) {
        onFiltersChange({
          ...filters,
          [k]: list.filter((x) => x !== id) as SearchFilters[typeof k],
        });
      } else {
        onFiltersChange({
          ...filters,
          [k]: [...list, id] as SearchFilters[typeof k],
        });
      }
    },
    [filters, onFiltersChange],
  );

  const handleSourceChange = useCallback(
    (next: SearchSource) => {
      onFiltersChange(pruneFiltersForSource(filters, next));
    },
    [filters, onFiltersChange],
  );

  const subjectOptions = subjectsForSource(filters.source);
  const typeOptions = typesForSource(filters.source);
  const subjectsSingle = isSubjectsSingleSelect(filters.source);
  const showSubjects = subjectOptions.length > 0;
  const showTypes = typeOptions.length > 0;
  const showOpenAccess = sourceSupports(filters.source, 'openAccess');
  const chips = buildFilterChips({ filters, patch, toggleInList });

  const clearAll = () => {
    onFiltersChange({
      ...filters,
      timeRange: 'all',
      venues: [],
      subjects: [],
      publicationTypes: [],
      openAccess: false,
      minCitations: undefined,
    });
  };

  return (
    <div className={cn('flex flex-col', className)}>
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
        <span className="text-sm font-bold text-foreground">筛选器</span>
        {chips.length > 0 && (
          <button
            type="button"
            onClick={clearAll}
            className="text-2xs font-bold text-brand-red hover:opacity-70"
          >
            清空
          </button>
        )}
      </div>

      {chips.length > 0 && (
        <div className="border-b border-border px-4 py-2">
          <div ref={chipsRef} className="flex flex-wrap gap-1.5">
            {chips.map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={c.remove}
                className="inline-flex items-center gap-1 h-[22px] px-2 rounded-pill bg-danger-soft text-brand-red text-2xs font-medium border border-brand-red/30"
              >
                {c.label}
                <X className="size-2.5" strokeWidth={3} />
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="max-h-[min(60vh,520px)] overflow-y-auto py-1">
        <FilterGroup label="数据源">
          <div className="flex flex-col">
            {SOURCE_OPTIONS.map((opt) => {
              const meta =
                opt.value === 'auto'
                  ? {
                      name: '综合',
                      description:
                        '自动选源:某个源暂时不可用时自动切换到下一个,搜索不中断',
                    }
                  : SOURCE_META[opt.value];
              return (
                <Tooltip key={opt.value}>
                  <TooltipTrigger asChild>
                    <label
                      className={cn(
                        'flex items-center gap-2.5 px-4 py-1.5 cursor-pointer hover:bg-surface-1 transition-colors',
                        filters.source === opt.value && 'bg-surface-1',
                      )}
                    >
                      <input
                        type="radio"
                        name="search-source-panel"
                        checked={filters.source === opt.value}
                        onChange={() => handleSourceChange(opt.value)}
                        className="size-3.5 accent-brand-red"
                      />
                      <div
                        className={cn(
                          'flex-1 min-w-0 text-sm truncate',
                          filters.source === opt.value
                            ? 'text-foreground font-semibold'
                            : 'text-subtle',
                        )}
                      >
                        {opt.label}
                      </div>
                    </label>
                  </TooltipTrigger>
                  <TooltipContent
                    side="right"
                    sideOffset={4}
                    className="text-xs bg-background text-foreground border-border shadow-md max-w-[220px]"
                  >
                    <div className="font-semibold">{meta.name}</div>
                    <div className="text-muted-foreground mt-0.5">
                      {meta.description}
                    </div>
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>
        </FilterGroup>

        {sortOptionsForSource(filters.source).length > 1 && (
          <FilterGroup label="排序">
            {sortOptionsForSource(filters.source).map((opt) => (
              <label
                key={opt.value}
                className="flex items-center gap-2.5 h-6 px-4 cursor-pointer hover:bg-surface-1 transition-colors"
              >
                <input
                  type="radio"
                  name="search-sort-panel"
                  checked={filters.sort === opt.value}
                  onChange={() => patch('sort', opt.value as SortOrder)}
                  className="size-3.5 accent-brand-red"
                />
                <span
                  className={cn(
                    'flex-1 min-w-0 truncate text-sm',
                    filters.sort === opt.value
                      ? 'text-foreground font-semibold'
                      : 'text-subtle',
                  )}
                >
                  {opt.label}
                </span>
              </label>
            ))}
          </FilterGroup>
        )}

        <FilterGroup label="发表时间">
          {TIME_OPTIONS.map((opt) => (
            <label
              key={opt.value}
              className="flex items-center gap-2.5 h-6 px-4 cursor-pointer hover:bg-surface-1 transition-colors"
            >
              <input
                type="radio"
                name="search-timeRange-panel"
                checked={filters.timeRange === opt.value}
                onChange={() => patch('timeRange', opt.value)}
                className="size-3.5 accent-brand-red"
              />
              <span
                className={cn(
                  'flex-1 min-w-0 truncate text-sm',
                  filters.timeRange === opt.value
                    ? 'text-foreground font-semibold'
                    : 'text-subtle',
                )}
              >
                {opt.label}
              </span>
            </label>
          ))}
        </FilterGroup>

        {showSubjects && (
          <FilterGroup label="学科领域" defaultCollapsed>
            {subjectOptions.map((opt) => {
              const checked = filters.subjects.includes(opt.value);
              return subjectsSingle ? (
                <label
                  key={opt.value}
                  className="flex items-center gap-2.5 h-6 px-4 cursor-pointer hover:bg-surface-1 transition-colors"
                >
                  <input
                    type="radio"
                    name="search-subjects-single-panel"
                    checked={checked}
                    onChange={() => patch('subjects', [opt.value])}
                    onClick={() => {
                      if (checked) patch('subjects', []);
                    }}
                    className="size-3.5 accent-brand-red"
                  />
                  <span
                    className={cn(
                      'flex-1 min-w-0 truncate text-sm',
                      checked ? 'text-foreground font-semibold' : 'text-subtle',
                    )}
                  >
                    {opt.label}
                  </span>
                </label>
              ) : (
                <CheckboxRow
                  key={opt.value}
                  label={opt.label}
                  checked={checked}
                  onChange={() => toggleInList('subjects', opt.value)}
                />
              );
            })}
          </FilterGroup>
        )}

        {showTypes && (
          <FilterGroup label="文献类型" defaultCollapsed>
            {typeOptions.map((opt) => (
              <CheckboxRow
                key={opt.value}
                label={opt.label}
                checked={filters.publicationTypes.includes(opt.value)}
                onChange={() => toggleInList('publicationTypes', opt.value)}
              />
            ))}
          </FilterGroup>
        )}

        {showOpenAccess && (
          <FilterGroup label="开放获取">
            <label className="flex items-center gap-2.5 h-6 px-4 cursor-pointer hover:bg-surface-1 transition-colors">
              <Checkbox
                checked={filters.openAccess}
                onCheckedChange={(v) => patch('openAccess', !!v)}
              />
              <span
                className={cn(
                  'flex-1 min-w-0 truncate text-sm',
                  filters.openAccess
                    ? 'text-foreground font-semibold'
                    : 'text-subtle',
                )}
              >
                仅显示开放获取论文
              </span>
            </label>
          </FilterGroup>
        )}
      </div>
    </div>
  );
}
