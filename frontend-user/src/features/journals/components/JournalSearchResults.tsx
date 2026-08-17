import { useState, useEffect, type ReactNode } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { useLocalStorage } from '@/shared/hooks';
import {
  ColumnResizeHandle,
  startColumnResize,
} from '@/features/search/components/workspace/ColumnResizeHandle';
import {
  AlertCircle,
  BookOpen,
  Loader2,
  Search,
  Sparkles,
  TrendingUp,
  X,
} from 'lucide-react';
import { EmptyState } from '@/shared/components/EmptyState';
import { FeatureBrandHeading } from '@/shared/components/FeatureBrandHeading';
import { JournalResultRow } from '@/shared/components/JournalResultRow';
import { PaginationPrevNext } from '@/shared/components/PaginationPrevNext';
import { SearchAutocomplete } from '@/shared/components/SearchAutocomplete';
import { JournalDetailContent } from '@/features/browser/components/journal-detail/JournalDetailContent';
import { cn } from '@/shared/lib/utils';
import { exposeJournals } from '@/shared/api/seo';
import type { Journal } from '@/shared/api/types';
import { useJournalSearch } from '../api/journals';
import type { JournalFilters } from '../types';
import {
  JournalFiltersButton,
  buildJournalFilterChips,
} from './JournalFiltersPanel';
import { JournalLanding } from './JournalLanding';

/**
 * 期刊搜索结果主体 —— `/journals/search` 嵌入 JournalSearchPage 主区。
 * 有结果后筛选入口在结果顶栏;空态不挂筛选。
 */

const PAGE_SIZE = 8;
const DETAIL_MIN_PX = 320;
const DETAIL_MAX_PX = 720;
const DETAIL_DEFAULT_PX = 420;

interface JournalSearchResultsProps {
  filters: JournalFilters;
  onFiltersChange?: (next: JournalFilters) => void;
  /**
   * 可选 header 槽 —— 传入则**替换**默认 Hero(自带 h1 + KPI + 搜索条)。
   * 聚合 SEO 落地页用它换上针对性的 h1 + 文案,既避免双 h1,又复用结果网格/分页。
   * /journals/search 不传 → 用默认 Hero。
   */
  header?: ReactNode;
}

type SortKey = 'relevance' | 'if' | 'recent';

const SORT_OPTIONS: Array<{ key: SortKey; label: string; icon: typeof Sparkles }> = [
  { key: 'relevance', label: '相关度', icon: Sparkles },
  { key: 'if', label: '影响因子', icon: TrendingUp },
  { key: 'recent', label: '最新', icon: BookOpen },
];

const SORT_TO_BACKEND: Record<SortKey, { sortBy?: string; sortDir?: 'asc' | 'desc' }> = {
  relevance: {},
  if: { sortBy: 'jcr_impact_factor_num', sortDir: 'desc' },
  recent: { sortBy: 'openalex_works_count', sortDir: 'desc' },
};

export function JournalSearchResults({
  filters,
  onFiltersChange,
  header,
}: JournalSearchResultsProps) {
  const { pathname } = useLocation();
  const [params, setParams] = useSearchParams();
  const isSelect = pathname.startsWith('/journals/select');
  const pageTitle = isSelect ? 'scholay 选刊' : '期刊库搜索';
  const [selected, setSelected] = useState<Journal | null>(null);
  const [detailWidth, setDetailWidth] = useLocalStorage(
    'journals.detail-width',
    DETAIL_DEFAULT_PX,
  );

  const keyword = params.get('q')?.trim() ?? '';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const sortKey = (params.get('sort') as SortKey) || (keyword ? 'relevance' : 'if');

  const [input, setInput] = useState(keyword);
  useEffect(() => setInput(keyword), [keyword]);

  const hasActiveFilters =
    !!filters.fqbQuartile ||
    !!filters.jcrQuartile ||
    !!filters.minImpactFactor ||
    !!filters.ccfRank ||
    !!filters.publisher;
  const showResults = !!header || !!keyword || hasActiveFilters;

  const searchQ = useJournalSearch({
    keyword: keyword || undefined,
    jcrQuartile: filters.jcrQuartile,
    fqbQuartile: filters.fqbQuartile,
    ccfRank: filters.ccfRank,
    publisher: filters.publisher,
    minImpactFactor: filters.minImpactFactor,
    ...SORT_TO_BACKEND[sortKey],
    page,
    pageSize: PAGE_SIZE,
    enabled: showResults,
  });

  const items = searchQ.data?.items ?? [];
  const hasMore = !!searchQ.data?.has_more;

  // 搜索结果落定后批量曝光为 tier=2 SEO seed (sendBeacon, best-effort, 不阻塞)。
  // 用 items 引用变化做触发器: useJournalSearch 内部 react-query 缓存命中时 items
  // 是同一对象, useEffect 不重复触发, 不会刷一次面板就重复 POST。
  useEffect(() => {
    if (items.length > 0) exposeJournals(items);
  }, [items]);

  const applyQuery = (q: string) => {
    const trimmed = q.trim();
    if (!trimmed) return;
    const sp = new URLSearchParams(params);
    sp.set('q', trimmed);
    sp.delete('page');
    setParams(sp);
  };

  const setSort = (key: SortKey) => {
    const sp = new URLSearchParams(params);
    if (key === (keyword ? 'relevance' : 'if')) sp.delete('sort');
    else sp.set('sort', key);
    sp.delete('page');
    setParams(sp);
  };

  const goPage = (p: number) => {
    const next = Math.max(1, p);
    const sp = new URLSearchParams(params);
    if (next === 1) sp.delete('page');
    else sp.set('page', String(next));
    setParams(sp);
  };

  if (!showResults) {
    return (
      <div className="flex h-full min-h-0 flex-col bg-background">
        <JournalLanding
          variant={isSelect ? 'select' : 'query'}
          onSearch={applyQuery}
        />
      </div>
    );
  }

  const filterChips = onFiltersChange
    ? buildJournalFilterChips(filters, (k, v) =>
        onFiltersChange({ ...filters, [k]: v }),
      )
    : [];

  return (
    <div className="flex h-full min-h-0 bg-background">
      <div className="flex min-h-0 min-w-0 flex-1">
      <div className="min-h-0 min-w-0 flex-1 overflow-auto">
      {/* 主列对齐文献库检索:单列 max-w-3xl,结果为平铺行卡而非网格。 */}
      <div className="mx-auto w-full max-w-3xl space-y-6 px-6 py-7">
        {header ?? (
          <div className="flex flex-col items-center gap-6">
            <FeatureBrandHeading as="h1" title={pageTitle} mark={false} />
            <SearchAutocomplete
              appearance={isSelect ? 'smart' : 'literature'}
              value={input}
              onChange={setInput}
              onSubmit={applyQuery}
              placeholder={
                isSelect
                  ? '描述稿件方向、学科与目标分区…'
                  : '刊名 / ISSN / 主办机构'
              }
            />
          </div>
        )}

        <header className="flex flex-col gap-3">
          <div className="flex items-end justify-between gap-4">
          <div className="space-y-1">
            <h2 className="font-display font-bold text-lg text-foreground leading-none">
              {searchQ.isLoading || searchQ.isFetching ? (
                <span className="inline-flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="size-3.5 animate-spin" />
                  检索中…
                </span>
              ) : keyword ? (
                <>关键词 &ldquo;{keyword}&rdquo; 的搜索结果</>
              ) : (
                <>期刊列表</>
              )}
            </h2>
            <p className="text-xs text-faint">
              按 {SORT_OPTIONS.find((o) => o.key === sortKey)?.label ?? '相关度'} 排序
              {!keyword && !hasActiveFilters && ' · 默认推荐高质量期刊'}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            {onFiltersChange ? (
              <JournalFiltersButton
                filters={filters}
                onFiltersChange={onFiltersChange}
              />
            ) : null}
            {SORT_OPTIONS.map((opt) => {
              const Icon = opt.icon;
              const active = sortKey === opt.key;
              return (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setSort(opt.key)}
                  className={cn(
                    'inline-flex items-center gap-1.5 h-7 px-3 rounded-md text-xs transition-colors',
                    active
                      ? 'bg-foreground text-background font-bold'
                      : 'bg-background border border-border text-subtle hover:border-foreground'
                  )}
                >
                  <Icon className="size-3" strokeWidth={active ? 2.5 : 2} />
                  {opt.label}
                </button>
              );
            })}
          </div>
          </div>
          {filterChips.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {filterChips.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  onClick={c.remove}
                  className="inline-flex h-6 items-center gap-1 rounded-pill border border-brand-red/30 bg-danger-soft px-2 text-12 font-medium text-brand-red"
                >
                  {c.label}
                  <X className="size-2.5" strokeWidth={3} />
                </button>
              ))}
            </div>
          ) : null}
        </header>

        {/* ───── 错误 / 空 / 列表 ───── */}
        {searchQ.error && (
          <div className="flex items-center gap-2 px-4 py-3 rounded-md bg-danger-soft text-brand-red text-xs">
            <AlertCircle className="size-3.5" />
            搜索期刊出错了,请稍后重试
          </div>
        )}

        {!searchQ.isLoading && items.length === 0 && !searchQ.error && (
          <EmptyState
            icon={Search}
            title="没找到符合条件的期刊"
            description={
              keyword
                ? `没有匹配 "${keyword}" 的期刊,换个关键词或者放宽筛选试试`
                : '当前筛选条件下没有期刊,试试减少几个筛选条件'
            }
          />
        )}

        {items.length > 0 && (
          <div>
            {items.map((j) => (
              <JournalResultRow
                key={j.id}
                journal={j}
                selected={selected?.id === j.id}
                variant={isSelect ? 'recommend' : 'metrics'}
                onOpen={() => setSelected(j)}
              />
            ))}
          </div>
        )}

        {/* ───── 分页 —— 上游不给 total,改成 cursor / hasMore 形式 ───── */}
        {items.length > 0 && (
          <PaginationPrevNext
            page={page}
            onPageChange={goPage}
            hasMore={hasMore}
            disabled={searchQ.isFetching}
          />
        )}
      </div>
      </div>
      {selected ? (
        <>
        <ColumnResizeHandle
          label="拖动调整详情栏宽度"
          onPointerDown={(e) =>
            startColumnResize(
              e,
              detailWidth,
              setDetailWidth,
              DETAIL_MIN_PX,
              DETAIL_MAX_PX,
              -1,
            )
          }
        />
        <aside
          style={{ width: detailWidth }}
          className="flex h-full min-h-0 shrink-0 flex-col bg-background"
        >
          <div className="flex h-10 shrink-0 items-center justify-between border-b border-border px-4">
            <span className="truncate text-12 font-medium text-foreground">
              期刊详情
            </span>
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="inline-flex size-7 items-center justify-center rounded-4 text-faint transition-colors hover:bg-surface-1 hover:text-foreground"
              aria-label="关闭详情"
            >
              <X className="size-3.5" strokeWidth={2} />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-auto">
            <JournalDetailContent journal={selected} compact />
          </div>
        </aside>
        </>
      ) : null}
      </div>
    </div>
  );
}
