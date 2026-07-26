import { useState, useEffect, useMemo, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  ArrowUpRight,
  BookOpen,
  Loader2,
  Search,
  Sparkles,
  TrendingUp,
  X,
} from 'lucide-react';
import { EmptyState } from '@/shared/components/EmptyState';
import { PaginationPrevNext } from '@/shared/components/PaginationPrevNext';
import { cn } from '@/shared/lib/utils';
import { useOpenJournalInBrowser } from '@/shared/hooks';
import { exposeJournals } from '@/shared/api/seo';
import { useJournalSearch, useJournalStats, type Journal } from '../api/journals';
import type { JournalFilters } from '../types';
import { JournalCover } from '@/shared/components/JournalCover';

/**
 * 期刊搜索结果主体 —— `/journals/search` 嵌入 JournalSearchPage 主区。
 *
 * 设计稿 .pen `jcYGD`(期刊搜索结果) 三段:
 *   ┌─ Hero(标题 + KPI 统计 + 搜索条 + active chips)
 *   ├─ resHdr(计数行 + 排序切换 / 视图切换)
 *   ├─ 2 列卡片网格(JournalCover 左 + info 右)
 *   └─ 分页器(显示 X-Y / 共 N · 每页 8 ▾ · 1 2 3 ...)
 *
 * 数据策略:keyword/page 走 URL,其他 filter 来自 props(由 JournalSidebar 改)。
 * keyword 为空时也展示结果(默认按 IF 降序)—— 期刊首页心智。
 */

const PAGE_SIZE = 8;

interface JournalSearchResultsProps {
  filters: JournalFilters;
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
  header,
}: JournalSearchResultsProps) {
  const [params, setParams] = useSearchParams();
  const openJournal = useOpenJournalInBrowser();
  const statsQ = useJournalStats();

  const keyword = params.get('q')?.trim() ?? '';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const sortKey = (params.get('sort') as SortKey) || (keyword ? 'relevance' : 'if');

  // 搜索条本地受控,URL keyword 变化时同步
  const [input, setInput] = useState(keyword);
  useEffect(() => setInput(keyword), [keyword]);

  // 注:filter 改 → 自动回第 1 页,由 useJournalUrlFilters.setFilters 负责
  // (旧的 useEffect 已删除,改在写 URL 时一次完成,避免双写抖动)

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
  });

  const items = searchQ.data?.items ?? [];
  const hasMore = !!searchQ.data?.has_more;

  // 搜索结果落定后批量曝光为 tier=2 SEO seed (sendBeacon, best-effort, 不阻塞)。
  // 用 items 引用变化做触发器: useJournalSearch 内部 react-query 缓存命中时 items
  // 是同一对象, useEffect 不重复触发, 不会刷一次面板就重复 POST。
  useEffect(() => {
    if (items.length > 0) exposeJournals(items);
  }, [items]);

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const sp = new URLSearchParams(params);
    const trimmed = input.trim();
    if (trimmed) sp.set('q', trimmed);
    else sp.delete('q');
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

  const hasActiveFilters =
    !!filters.fqbQuartile ||
    !!filters.jcrQuartile ||
    !!filters.minImpactFactor ||
    !!filters.ccfRank ||
    !!filters.publisher;

  const stats = statsQ.data;
  const sourceTotal = useMemo(() => {
    if (!stats?.sourceCoverage) return 0;
    return Object.values(stats.sourceCoverage).reduce((sum, v) => sum + Number(v), 0);
  }, [stats]);

  return (
    <div className="h-full overflow-auto bg-background">
      <div className="max-w-6xl mx-auto px-10 py-7 space-y-6">
        {/* 落地页传 header 槽则替换默认 Hero(避免双 h1);搜索页不传 → 默认 Hero。 */}
        {header ?? (
        <section className="rounded-16 bg-surface-1 border border-border-soft p-6 space-y-[18px]">
          {/* 标题 + 右侧 KPI */}
          <div className="flex items-end justify-between gap-6">
            <div className="space-y-1.5">
              {/* .pen `vCLDh` 30/700 Playfair —— 30 不在 token 表,arbitrary */}
              <h1 className="font-display font-bold leading-none text-[30px] text-foreground">
                期刊搜索
              </h1>
              <p className="text-14 text-faint">
                Journal Search · 检索全球期刊与顶会,按学科、分区、影响因子精准筛选
              </p>
            </div>
            <div className="hidden md:flex items-end gap-[26px] shrink-0">
              <Kpi
                value={stats ? stats.totalJournals.toLocaleString() : '—'}
                label="收录期刊"
              />
              <Kpi
                value={sourceTotal ? sourceTotal.toLocaleString() : '—'}
                label="数据源覆盖"
              />
              <Kpi value="实时" label="同步状态" />
            </div>
          </div>

          {/* 搜索条 —— .pen `xBNU4` 高 52,走 token `h-13`(globals.css 新加,
              填 Tailwind h-12 / h-14 之间的空缺,与 dialog header/footer 通用) */}
          <form onSubmit={submitSearch} className="flex items-center gap-2.5 h-13">
            <div className="flex flex-1 h-13 items-center gap-3 px-[18px] rounded-12 bg-surface-card border border-border-strong focus-within:border-foreground transition-colors">
              <Search className="size-4 text-muted-foreground" strokeWidth={2} />
              <input
                type="search"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="刊名 / ISSN / 主办机构"
                className="flex-1 h-full bg-transparent text-14 outline-none placeholder:text-faint"
              />
              {input && (
                <button
                  type="button"
                  onClick={() => setInput('')}
                  className="inline-flex h-6 w-6 items-center justify-center rounded-8 text-faint hover:bg-surface-2 hover:text-foreground"
                  aria-label="清空"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </div>
            <button
              type="submit"
              className="inline-flex h-13 px-6 items-center justify-center gap-2 rounded-12 bg-foreground text-background text-14 font-medium hover:opacity-90 transition-opacity shrink-0"
            >
              <Search className="size-3.5" strokeWidth={2.5} />
              搜索期刊
            </button>
          </form>

        </section>
        )}

        {/* ───── 结果头 —— .pen `HsUQD`(不展示总数,上游不给) ───── */}
        <header className="flex items-end justify-between gap-4">
          <div className="space-y-1">
            <h2 className="font-display font-bold text-16 text-foreground leading-none">
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
            <p className="text-12 text-faint">
              按 {SORT_OPTIONS.find((o) => o.key === sortKey)?.label ?? '相关度'} 排序
              {!keyword && !hasActiveFilters && ' · 默认推荐高质量期刊'}
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            {SORT_OPTIONS.map((opt) => {
              const Icon = opt.icon;
              const active = sortKey === opt.key;
              return (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setSort(opt.key)}
                  className={cn(
                    'inline-flex items-center gap-1.5 h-7 px-3 rounded-8 text-12 transition-colors',
                    active
                      ? 'bg-foreground text-background font-medium'
                      : 'bg-surface-card border border-border text-subtle hover:border-foreground'
                  )}
                >
                  <Icon className="size-3" strokeWidth={active ? 2.5 : 2} />
                  {opt.label}
                </button>
              );
            })}
          </div>
        </header>

        {/* ───── 错误 / 空 / 列表 ───── */}
        {searchQ.error && (
          <div className="flex items-center gap-2 px-4 py-3 rounded-16 bg-danger-soft text-brand-red text-12">
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
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {items.map((j) => (
              <JournalCard
                key={j.id}
                journal={j}
                onOpen={() => openJournal(j)}
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
  );
}

// ============================================================================
// 子组件
// ============================================================================

function Kpi({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col items-end gap-1">
      <span className="font-display font-bold text-20 leading-none text-foreground tabular-nums">
        {value}
      </span>
      <span className="text-12 font-medium uppercase text-faint">
        {label}
      </span>
    </div>
  );
}

// ─── 单卡 —— .pen `AO18q` (cover 120 + info 自适应, h-192) ───────────────
function JournalCard({
  journal: j,
  onOpen,
}: {
  journal: Journal;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex h-48 items-stretch text-left gap-4 p-[18px] rounded-16 bg-surface-card border border-border hover:border-foreground hover:transition-all"
    >
      <JournalCover id={j.id} name={j.canonical_name} size="card" />

      <div className="flex-1 min-w-0 flex flex-col justify-between gap-3">
        {/* Top: 标题 + 副标题 + 收藏 icon */}
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0 space-y-1">
            <h3 className="font-display font-bold text-14 leading-display-tight text-foreground truncate group-hover:text-brand-red transition-colors">
              {j.canonical_name}
            </h3>
            <div className="text-12 text-faint truncate">
              {j.publisher ?? '出版社未知'}
              {j.country && <> · {j.country}</>}
              {j.is_oa && <> · OA</>}
            </div>
          </div>
          <div className="shrink-0 flex items-center gap-1.5">
            {j.xr_quartile && (
              <span
                className="inline-flex items-center h-6 px-2 rounded-4 bg-brand-green/10 text-brand-green text-12 font-medium"
                title="中科院新锐分区"
              >
                新锐 {j.xr_quartile} 区
              </span>
            )}
            {j.gjqk_warning && (
              <span
                className="inline-flex items-center gap-1 h-6 px-2 rounded-4 bg-warning-soft text-brand-amber text-12 font-medium"
                title="中科院预警期刊"
              >
                ⚠ 预警
              </span>
            )}
          </div>
        </div>

        {/* KPI 三栏 —— .pen `YpqvW`(rounded-8 border) */}
        <div className="flex items-stretch rounded-12 border border-border-soft">
          <KpiCell label="影响因子" value={fmtIf(j.jcr_impact_factor)} sub={j.jcr_quartile ? `JCR ${j.jcr_quartile}` : '—'} />
          <KpiCell
            label="中科院分区"
            value={j.fqb_quartile ? `${j.fqb_quartile}区` : '—'}
            sub={j.fqb_quartile === '1' ? 'Top' : j.fqb_quartile ? '—' : '—'}
            borderLeft
          />
          <KpiCell
            label="CCF 等级"
            value={j.ccf_rank ?? '—'}
            sub={j.ccf_rank ? `CCF ${j.ccf_rank}` : '—'}
            borderLeft
          />
        </div>

        {/* 底部行: tags 占位 + 查看详情 */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            {j.type && (
              <span className="inline-flex items-center h-5 px-2 rounded-4 bg-foreground text-background text-12 font-medium uppercase">
                {j.type}
              </span>
            )}
            {(j.source_count ?? 0) > 0 && (
              <span className="inline-flex items-center h-5 px-2 rounded-4 bg-surface-2 text-subtle text-12">
                {j.source_count} 个数据源
              </span>
            )}
            {j.has_submission && (
              <span
                className="inline-flex items-center h-5 px-2 rounded-4 bg-prism-badge-bg text-prism-badge-fg text-12 font-medium"
                title="提供投稿须知 / LaTeX 模板(Max 会员可下载)"
              >
                投稿资源
              </span>
            )}
          </div>
          <span className="inline-flex items-center gap-1 h-7 px-2.5 rounded-8 border border-border text-12 font-medium text-foreground group-hover:bg-surface-1 transition-colors">
            查看详情
            <ArrowUpRight className="size-3" strokeWidth={2.5} />
          </span>
        </div>
      </div>
    </button>
  );
}

function fmtIf(v: number | undefined): string {
  if (v == null) return '—';
  return v.toFixed(1);
}

function KpiCell({
  label,
  value,
  sub,
  borderLeft,
}: {
  label: string;
  value: string;
  sub: string;
  borderLeft?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex-1 min-w-0 px-3.5 py-2.5 space-y-0.5',
        borderLeft && 'border-l border-border-soft'
      )}
    >
      <div className="text-12 font-medium uppercase text-faint">
        {label}
      </div>
      <div className="font-display font-bold text-20 leading-none text-foreground tabular-nums truncate">
        {value}
      </div>
      <div className="text-12 text-faint truncate">{sub}</div>
    </div>
  );
}

// 分页已抽到 shared/components/PaginationPrevNext —— cursor / hasMore 形态
