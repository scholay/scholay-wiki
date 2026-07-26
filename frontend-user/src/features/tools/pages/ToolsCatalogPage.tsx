import { type ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { RouteSEO } from '@/shared/components/RouteSEO';
import { EmptyState } from '@/shared/components/EmptyState';
import { LoadingState } from '@/shared/components/LoadingState';
import { useUrlState, usePatchUrlState } from '@/shared/hooks';
import { useToolList, useToolCategories } from '../api/tools';
import { ToolCard } from '../components/ToolCard';

const PAGE_SIZE = 24;

/**
 * 科研能力广场 · 全网工具分段(/tools)—— 只负责内容(网格 + 分页)。
 * 顶部「分段 tab + 搜索 + 排序」由外壳 ToolsLayout 的 PlazaHeader 统一提供;
 * 分类/价格/形式/开源筛选由 ToolsSidebar 写 URL;本页只读 URL 出结果。
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
  const q = rawQ;
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
    <>
      <RouteSEO
        title="科研能力广场 · 科研工具黄页 — Scholay学术"
        description="汇聚科研常用工具:统计分析、化学材料、生物信息、绘图可视化、文献管理、学术写作、期刊评价等,分门别类快速找到适合你的工具。"
        keywords="科研工具,学术软件,统计分析,科研绘图,文献管理,LaTeX,期刊分区,生物信息"
        canonical="/tools"
      />

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
            {data.items.map((t) => (
              <ToolCard key={t.id} tool={t} />
            ))}
          </div>

          {totalPages > 1 && (
            <div className="mt-6 flex items-center justify-center gap-3">
              <PagerBtn disabled={page <= 1} onClick={() => setPage(page - 1)}>
                <ChevronLeft className="size-3.5" /> 上一页
              </PagerBtn>
              <span className="text-xs text-faint">
                第 {page} / {totalPages} 页 · 共 {listed} 个
              </span>
              <PagerBtn disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
                下一页 <ChevronRight className="size-3.5" />
              </PagerBtn>
            </div>
          )}
        </>
      )}
    </>
  );
}

function PagerBtn({ disabled, onClick, children }: { disabled: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex items-center gap-1 rounded-8 border border-border bg-surface-card px-3 py-1.5 text-xs text-subtle transition-colors hover:bg-surface-1 disabled:opacity-40"
    >
      {children}
    </button>
  );
}
