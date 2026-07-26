import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { EmptyState } from './EmptyState';
import { LoadingState } from './LoadingState';
import { ResourceError } from './ResourceError';
import { SkillGridCard } from './SkillCard';
import { Button } from '@/shared/ui';
import { useUrlState, usePatchUrlState } from '@/shared/hooks';
import { useSkillMarket } from '@/shared/api/skills';

/** 社区技能市场每页条数(两个入口共用,单一真源防分页参数漂移)。 */
export const SKILL_MARKET_PAGE_SIZE = 24;

/**
 * 社区技能市场网格(公开列表 + 分页)—— 科研能力广场·社区技能段(/tools/skills · ToolsSkillsPage)使用。
 * 承载「数据拉取 + 网格 + 分页 + 加载/错误/空态」;页头(搜索/排序/SEO/外壳)由 ToolsLayout 提供。
 * 参数(q/sort/page)从 URL state 读、分页写回 URL —— 与页头的搜索/排序同走 URL,天然联动。
 * (裸 /skills 浏览页已下线并重定向到此;/skills/:slug 分享短链等功能子路由仍保留。)
 *
 * skill 的 name/tagline 是**不可信用户内容** → SkillGridCard 纯文本渲染(React 默认转义),不注入 HTML。
 */
export function SkillMarketGrid({
  emptyIcon,
  emptyAction,
}: {
  emptyIcon: LucideIcon;
  emptyAction?: ReactNode;
}) {
  const patch = usePatchUrlState();
  const [rawQ] = useUrlState('q', '');
  const [page] = useUrlState('page', 1, Number);
  const [sort] = useUrlState('sort', 'popular');

  const { data, isLoading, isError, refetch } = useSkillMarket({
    q: rawQ || undefined,
    sort: sort === 'recent' ? 'recent' : 'popular',
    page,
    pageSize: SKILL_MARKET_PAGE_SIZE,
  });
  const list = data?.list ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / SKILL_MARKET_PAGE_SIZE));
  const setPage = (p: number) => patch({ page: p <= 1 ? null : String(p) });

  if (isLoading) return <LoadingState label="加载技能…" />;
  if (isError) {
    return <ResourceError error={undefined} resourceName="社区技能" onRetry={() => refetch()} />;
  }
  if (list.length === 0) {
    return (
      <EmptyState
        icon={emptyIcon}
        title="还没有公开的技能"
        description="成为第一个分享技能的人吧"
        action={emptyAction}
      />
    );
  }
  return (
    <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((s) => (
          <SkillGridCard key={s.id} skill={s} />
        ))}
      </div>

      {totalPages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            上一页
          </Button>
          <span className="text-12 text-muted-foreground">
            {page} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage(page + 1)}
          >
            下一页
          </Button>
        </div>
      )}
    </>
  );
}
