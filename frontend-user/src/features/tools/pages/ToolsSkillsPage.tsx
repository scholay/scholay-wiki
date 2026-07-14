import { Link } from 'react-router-dom';
import { Plus, Blocks } from 'lucide-react';
import { RouteSEO } from '@/shared/components/RouteSEO';
import { EmptyState } from '@/shared/components/EmptyState';
import { LoadingState } from '@/shared/components/LoadingState';
import { ResourceError } from '@/shared/components/ResourceError';
import { SkillGridCard } from '@/shared/components/SkillCard';
import { Button } from '@/shared/ui';
import { useUrlState, usePatchUrlState } from '@/shared/hooks';
import { useSkillMarket } from '@/shared/api/skills';

const PAGE_SIZE = 24;

/**
 * 科研能力广场 · 社区技能分段(/tools/skills)—— 只负责内容(网格 + 分页)。
 * 顶部「分段 tab + 搜索 + 排序」由外壳 ToolsLayout 的 PlazaHeader 统一提供,与全网工具段一致。
 * 公开列表(useSkillMarket→/public/skills,匿名可浏览);卡片进 /skills/:slug(详情/分享短链)。
 */
export function ToolsSkillsPage() {
  const patch = usePatchUrlState();
  const [rawQ] = useUrlState('q', '');
  const [page] = useUrlState('page', 1, Number);
  const [sort] = useUrlState('sort', 'popular');

  const { data, isLoading, isError, refetch } = useSkillMarket({
    q: rawQ || undefined,
    sort: sort === 'recent' ? 'recent' : 'popular',
    page,
    pageSize: PAGE_SIZE,
  });
  const list = data?.list ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const setPage = (p: number) => patch({ page: p <= 1 ? null : String(p) });

  return (
    <>
      <RouteSEO
        title="社区技能 · 科研能力广场"
        description="社区分享的智能体技能,可装进智能助手或其他 agent"
        canonical="/tools/skills"
      />

      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-base font-bold text-foreground">
          {rawQ ? `“${rawQ}” 的结果` : '社区技能'}
        </h2>
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-xs text-faint">共 {total} 个</span>
          <Button asChild variant="outline" size="sm">
            <Link to="/skills/new">
              <Plus className="mr-1 h-4 w-4" />
              上传技能
            </Link>
          </Button>
        </div>
      </div>

      {isLoading ? (
        <LoadingState label="加载技能…" />
      ) : isError ? (
        <ResourceError error={undefined} resourceName="社区技能" onRetry={() => refetch()} />
      ) : list.length === 0 ? (
        <EmptyState
          icon={Blocks}
          title="还没有公开的技能"
          description="成为第一个分享技能的人吧"
          action={
            <Button asChild variant="outline" size="sm">
              <Link to="/skills/new">上传我的技能</Link>
            </Button>
          }
        />
      ) : (
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
              <span className="text-xs text-muted-foreground">
                {page} / {totalPages}
              </span>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
                下一页
              </Button>
            </div>
          )}
        </>
      )}
    </>
  );
}
