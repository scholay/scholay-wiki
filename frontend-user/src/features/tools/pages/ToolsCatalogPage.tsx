import { useEffect, useState, type ReactNode } from 'react';
import { Search, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { RouteSEO } from '@/shared/components/RouteSEO';
import { EmptyState } from '@/shared/components/EmptyState';
import { LoadingState } from '@/shared/components/LoadingState';
import { useUrlState, usePatchUrlState } from '@/shared/hooks';
import { useToolList, useToolCategories } from '../api/tools';
import { ToolCard } from '../components/ToolCard';

const PAGE_SIZE = 24;
const SORT_OPTS: [string, string][] = [
  ['hot', '热度排序'],
  ['new', '最新收录'],
  ['name', '名称 A–Z'],
];

/**
 * 功能广场目录页 —— 只负责主区(侧栏由 ToolsLayout 挂)。
 * 筛选/分类全部读 URL(由侧栏 navigate 写入),顶部只留一个搜索框 + 排序。
 */
export function ToolsCatalogPage() {
  const patch = usePatchUrlState();
  const [category] = useUrlState('category', '');
  const [price] = useUrlState('price', '');
  const [access] = useUrlState('access', '');
  const [openSource] = useUrlState('os', '');
  const [rawQ] = useUrlState('q', '');
  const [page] = useUrlState('page', 1, Number);
  const [sort] = useUrlState('sort', 'hot');
  const q = rawQ; // q 只在提交时写入 URL,无需再 debounce

  // 顶部搜索框:草稿态本地维护,仅回车 / 点搜索按钮 / 清空才落 URL(不随每次输入联动)。
  const [draft, setDraft] = useState(rawQ);
  useEffect(() => {
    setDraft(rawQ);
  }, [rawQ]);

  const setQuery = (v: string) => patch({ q: v || null, page: null });
  const setSort = (v: string) => patch({ sort: v === 'hot' ? null : v });
  const setPage = (p: number) => patch({ page: p <= 1 ? null : String(p) });

  const { data: catData } = useToolCategories();
  const { data, isLoading, isFetching } = useToolList({
    category: category || undefined,
    price_type: price || undefined,
    access_type: access || undefined,
    open_source: (openSource as '' | 'open' | 'closed') || undefined,
    q: q || undefined,
    page,
    page_size: PAGE_SIZE,
    sort_by: sort === 'new' ? 'created_at' : sort === 'name' ? 'name' : 'view_count',
    sort_order: sort === 'name' ? 'asc' : 'desc',
  });

  const listed = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(listed / PAGE_SIZE));
  const activeCatLabel = catData?.categories.find((c) => c.slug === category)?.label;
  const heading = q ? `“${q}” 的结果` : activeCatLabel ?? '全部工具';

  return (
    <div className="flex h-full min-h-0 flex-col bg-surface-1">
      <RouteSEO
        title="功能广场 · 科研工具黄页 — Scholay学术"
        description="汇聚科研常用工具:统计分析、化学材料、生物信息、绘图可视化、文献管理、学术写作、期刊评价等,分门别类快速找到适合你的工具。"
        keywords="科研工具,学术软件,统计分析,科研绘图,文献管理,LaTeX,期刊分区,生物信息"
        canonical="/tools"
      />

      {/* 顶部:首页同款搜索条(.pen `Z0RbcB` 48h + 红色提交按钮),仅回车 / 点按钮 / 清空才搜索 */}
      <header className="shrink-0 border-b border-border bg-background px-6 py-4">
        <div className="mx-auto flex max-w-3xl items-center gap-2.5">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setQuery(draft.trim());
            }}
            className="flex h-12 flex-1 items-center gap-3 rounded-sm border border-border-strong bg-background pl-5 pr-2 transition-colors focus-within:border-foreground"
          >
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="搜索科研工具 —— 名称 / 关键词 / 用途"
              className="h-auto flex-1 bg-transparent text-base outline-none placeholder:text-faint"
            />
            {draft && (
              <button
                type="button"
                aria-label="清空"
                tabIndex={-1}
                onClick={() => {
                  setDraft('');
                  setQuery('');
                }}
                className="inline-flex size-7 items-center justify-center rounded-sm text-faint transition-colors hover:bg-surface-2 hover:text-foreground"
              >
                <X className="size-3.5" strokeWidth={2.5} />
              </button>
            )}
            <button
              type="submit"
              aria-label="搜索"
              className="inline-flex size-9 items-center justify-center rounded-sm bg-destructive text-destructive-foreground transition-colors hover:bg-destructive/90"
            >
              <Search className="size-4" strokeWidth={2.5} />
            </button>
          </form>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="h-12 shrink-0 rounded-sm border border-border-strong bg-background px-3 text-xs font-bold text-subtle outline-none"
          >
            {SORT_OPTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-auto px-6 py-5">
        <div className="mx-auto max-w-6xl">
          <div className="mb-3 flex items-end justify-between">
            <h2 className="text-base font-bold text-foreground">{heading}</h2>
            <span className="text-xs text-faint">共 {listed} 个</span>
          </div>

          {isLoading ? (
            <LoadingState />
          ) : !data || data.items.length === 0 ? (
            <EmptyState title="没有匹配的工具" description="换个分类、筛选或关键词试试" />
          ) : (
            <>
              <div className={cn('grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3', isFetching && 'opacity-60')}>
                {data.items.map((t) => <ToolCard key={t.id} tool={t} />)}
              </div>

              {totalPages > 1 && (
                <div className="mt-6 flex items-center justify-center gap-3">
                  <PagerBtn disabled={page <= 1} onClick={() => setPage(page - 1)}>
                    <ChevronLeft className="size-3.5" /> 上一页
                  </PagerBtn>
                  <span className="text-xs text-faint">第 {page} / {totalPages} 页 · 共 {listed} 个</span>
                  <PagerBtn disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
                    下一页 <ChevronRight className="size-3.5" />
                  </PagerBtn>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function PagerBtn({ disabled, onClick, children }: { disabled: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex items-center gap-1 rounded-md border border-border bg-background px-3 py-1.5 text-xs text-subtle transition-colors hover:bg-surface-1 disabled:opacity-40"
    >
      {children}
    </button>
  );
}
