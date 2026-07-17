import { Link } from 'react-router-dom';
import { Plus, Blocks } from 'lucide-react';
import { RouteSEO } from '@/shared/components/RouteSEO';
import { SkillMarketGrid, SKILL_MARKET_PAGE_SIZE } from '@/shared/components/SkillMarketGrid';
import { Button } from '@/shared/ui';
import { useUrlState } from '@/shared/hooks';
import { useSkillMarket } from '@/shared/api/skills';

/**
 * 科研能力广场 · 社区技能分段(/tools/skills)。
 * 顶部「分段 tab + 搜索 + 排序」由外壳 ToolsLayout 的 PlazaHeader 统一提供;本页只保留标题栏(结果数 +
 * 上传入口)与 SEO,网格/分页/状态复用 shared SkillMarketGrid(与 /skills 同源)。卡片进 /skills/:slug(分享短链)。
 */
export function ToolsSkillsPage() {
  const [rawQ] = useUrlState('q', '');
  const [page] = useUrlState('page', 1, Number);
  const [sort] = useUrlState('sort', 'popular');

  // 结果数展示用 —— 与 SkillMarketGrid 同参数同 query key,react-query 去重(不额外发请求)。
  const { data } = useSkillMarket({
    q: rawQ || undefined,
    sort: sort === 'recent' ? 'recent' : 'popular',
    page,
    pageSize: SKILL_MARKET_PAGE_SIZE,
  });
  const total = data?.total ?? 0;

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

      <SkillMarketGrid
        emptyIcon={Blocks}
        emptyAction={
          <Button asChild variant="outline" size="sm">
            <Link to="/skills/new">上传我的技能</Link>
          </Button>
        }
      />
    </>
  );
}
