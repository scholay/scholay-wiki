import { AnimatePresence, m, useDragControls } from 'framer-motion';
import { X } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { SHEET_SPRING } from '@/shared/lib/motion';
import { haptic } from '@/shared/lib/haptics';
import { Switch } from '@/shared/ui/switch';
import {
  DEFAULT_FILTERS,
  SOURCE_OPTIONS,
  isSubjectsSingleSelect,
  pruneFiltersForSource,
  sortOptionsForSource,
  sourceSupports,
  subjectsForSource,
  typesForSource,
  type SearchFilters,
  type SearchSource,
  type TimeRange,
} from '@/shared/lib/search-filters';

/**
 * 移动端搜索「筛选」底部抽屉 —— 与 PC 侧边栏(SearchSidebar)同一套 taxonomy / 源联动逻辑
 * (共享自 @/shared/lib/search-filters):数据源 / 排序 / 时间 / 开放获取 / 最少引用 / 学科 / 类型。
 * 渲染在搜索浮层内部(absolute 定位,留在移动列内),不走 shadcn 右侧 Sheet。
 * 实时编辑 filters → 浮层的搜索 hook 自动重查;「完成」仅收起抽屉。
 */
const TIME_OPTIONS: { value: TimeRange; label: string }[] = [
  { value: 'all', label: '不限' },
  { value: '1y', label: '近 1 年' },
  { value: '3y', label: '近 3 年' },
  { value: '5y', label: '近 5 年' },
];

const MIN_CITE_OPTIONS: { value: number | undefined; label: string }[] = [
  { value: undefined, label: '不限' },
  { value: 10, label: '≥ 10' },
  { value: 50, label: '≥ 50' },
  { value: 100, label: '≥ 100' },
];

export function MobileSearchFilterSheet({
  open,
  onClose,
  filters,
  onChange,
}: {
  open: boolean;
  onClose: () => void;
  filters: SearchFilters;
  onChange: (f: SearchFilters) => void;
}) {
  const dragControls = useDragControls();
  const set = (patch: Partial<SearchFilters>) => onChange({ ...filters, ...patch });
  const setSource = (s: SearchSource) => onChange(pruneFiltersForSource(filters, s));
  const toggleArr = (key: 'subjects' | 'publicationTypes', v: string, single: boolean) => {
    const cur = filters[key];
    const has = cur.includes(v);
    const next = single ? (has ? [] : [v]) : has ? cur.filter((x) => x !== v) : [...cur, v];
    set({ [key]: next } as Partial<SearchFilters>);
  };

  const subjects = subjectsForSource(filters.source);
  const types = typesForSource(filters.source);
  const sorts = sortOptionsForSource(filters.source);

  return (
    <AnimatePresence>
      {open && (
        <>
          <m.div
            className="absolute inset-0 z-overlay bg-foreground/40"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          />
          <m.div
            className="absolute inset-x-0 bottom-0 z-modal flex max-h-[82%] flex-col rounded-t-16 bg-surface-card shadow-overlay"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={SHEET_SPRING}
            drag="y"
            dragListener={false}
            dragControls={dragControls}
            dragConstraints={{ top: 0 }}
            dragElastic={{ top: 0, bottom: 0.3 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 120 || info.velocity.y > 700) {
                haptic();
                onClose();
              }
            }}
          >
            {/* 抓手:仅从这里发起拖拽(dragListener=false),下滑过阈值即关闭;内容区照常滚动 */}
            <div
              onPointerDown={(e) => dragControls.start(e)}
              className="flex shrink-0 cursor-grab touch-none justify-center pb-1 pt-2.5 active:cursor-grabbing"
            >
              <div className="h-1 w-9 rounded-pill bg-border-strong" />
            </div>
            <div className="flex items-center justify-between border-b border-border-soft px-4 py-3">
              <span className="text-base font-semibold text-foreground">筛选</span>
              <div className="flex items-center gap-4">
                <button
                  type="button"
                  onClick={() => onChange(DEFAULT_FILTERS)}
                  className="text-xs text-muted-foreground active:opacity-60"
                >
                  重置
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="关闭筛选"
                  className="text-muted-foreground active:opacity-60"
                >
                  <X className="size-5" />
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-2">
              <Section title="数据源">
                {SOURCE_OPTIONS.map((o) => (
                  <Chip key={o.value} active={filters.source === o.value} onClick={() => setSource(o.value)}>
                    {o.label}
                  </Chip>
                ))}
              </Section>

              <Section title="排序">
                {sorts.map((o) => (
                  <Chip key={o.value} active={filters.sort === o.value} onClick={() => set({ sort: o.value })}>
                    {o.label}
                  </Chip>
                ))}
              </Section>

              <Section title="时间范围">
                {TIME_OPTIONS.map((o) => (
                  <Chip
                    key={o.value}
                    active={filters.timeRange === o.value}
                    onClick={() => set({ timeRange: o.value })}
                  >
                    {o.label}
                  </Chip>
                ))}
              </Section>

              {sourceSupports(filters.source, 'openAccess') && (
                <div className="flex items-center justify-between border-t border-border-soft py-3">
                  <span className="text-sm font-medium text-foreground">仅开放获取</span>
                  <Switch checked={filters.openAccess} onCheckedChange={(v) => set({ openAccess: v })} />
                </div>
              )}

              {sourceSupports(filters.source, 'minCitations') && (
                <Section title="最少引用">
                  {MIN_CITE_OPTIONS.map((o) => (
                    <Chip
                      key={String(o.value)}
                      active={(filters.minCitations ?? undefined) === o.value}
                      onClick={() => set({ minCitations: o.value })}
                    >
                      {o.label}
                    </Chip>
                  ))}
                </Section>
              )}

              {subjects.length > 0 && (
                <Section title={isSubjectsSingleSelect(filters.source) ? '学科(单选)' : '学科'}>
                  {subjects.map((o) => (
                    <Chip
                      key={o.value}
                      active={filters.subjects.includes(o.value)}
                      onClick={() => toggleArr('subjects', o.value, isSubjectsSingleSelect(filters.source))}
                    >
                      {o.label}
                    </Chip>
                  ))}
                </Section>
              )}

              {types.length > 0 && (
                <Section title="文献类型">
                  {types.map((o) => (
                    <Chip
                      key={o.value}
                      active={filters.publicationTypes.includes(o.value)}
                      onClick={() => toggleArr('publicationTypes', o.value, false)}
                    >
                      {o.label}
                    </Chip>
                  ))}
                </Section>
              )}
            </div>

            <div className="border-t border-border-soft p-3">
              <button
                type="button"
                onClick={onClose}
                className="w-full rounded-pill bg-brand-red py-3 text-sm font-semibold text-on-brand active:opacity-90"
              >
                完成
              </button>
            </div>
          </m.div>
        </>
      )}
    </AnimatePresence>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-border-soft py-3 first:border-t-0">
      <p className="mb-2 text-xs font-semibold text-faint">{title}</p>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-pill border px-3 py-1.5 text-xs transition-colors',
        active
          ? 'border-brand-red bg-brand-red text-on-brand'
          : 'border-border bg-surface-card text-muted-foreground active:bg-surface-1'
      )}
    >
      {children}
    </button>
  );
}
