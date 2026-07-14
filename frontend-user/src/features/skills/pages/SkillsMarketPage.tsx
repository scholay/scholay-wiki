import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, Sparkles } from 'lucide-react';
import { RouteSEO } from '@/shared/components/RouteSEO';
import { EmptyState } from '@/shared/components/EmptyState';
import { LoadingState } from '@/shared/components/LoadingState';
import { ResourceError } from '@/shared/components/ResourceError';
import { Button } from '@/shared/ui';
import { useUrlState, usePatchUrlState } from '@/shared/hooks';
import { SkillGridCard } from '@/shared/components/SkillCard';
import { useSkillMarket } from '@/shared/api/skills';

const PAGE_SIZE = 24;

/**
 * Skills 市场浏览页(/skills)。公开 skill 列表 + 搜索 + 排序 + 分页。
 * skill 的 name/tagline 是不可信用户内容 —— 这里只作纯文本渲染(React 默认转义),不注入 HTML。
 */
export function SkillsMarketPage() {
  const patch = usePatchUrlState();
  const [rawQ] = useUrlState('q', '');
  const [page] = useUrlState('page', 1, Number);
  const [sort] = useUrlState('sort', 'popular');
  const [draft, setDraft] = useState(rawQ);
  useEffect(() => setDraft(rawQ), [rawQ]);

  const { data, isLoading, isError, refetch } = useSkillMarket({
    q: rawQ || undefined,
    sort: sort === 'recent' ? 'recent' : 'popular',
    page,
    pageSize: PAGE_SIZE,
  });

  const list = data?.list ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6">
      <RouteSEO title="Skills 市场" description="浏览并使用社区分享的智能助手技能" />

      <header className="mb-5">
        <h1 className="flex items-center gap-2 text-xl font-semibold text-foreground">
          <Sparkles className="h-5 w-5 text-brand-green" />
          Skills 市场
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          社区分享的智能助手技能。安装后可在「智能助手」里按需调用。
          <Link to="/skills/mine" className="ml-2 text-brand-green hover:underline">
            管理我的 Skills →
          </Link>
        </p>
      </header>

      {/* 搜索 + 排序 */}
      <div className="mb-4 flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') patch({ q: draft || null, page: null });
            }}
            placeholder="搜索 skill 名称 / 简介…"
            className="h-9 w-full rounded-md border border-border bg-background pl-8 pr-3 text-sm outline-none focus:border-border-strong"
          />
        </div>
        <div className="flex overflow-hidden rounded-md border border-border">
          {(['popular', 'recent'] as const).map((s) => (
            <button
              key={s}
              onClick={() => patch({ sort: s === 'popular' ? null : s, page: null })}
              className={
                'px-3 text-xs h-9 ' +
                (sort === s
                  ? 'bg-surface-2 text-foreground'
                  : 'bg-background text-muted-foreground hover:bg-surface-1')
              }
            >
              {s === 'popular' ? '热门' : '最新'}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <LoadingState label="加载市场…" />
      ) : isError ? (
        <ResourceError error={undefined} resourceName="市场" onRetry={() => refetch()} />
      ) : list.length === 0 ? (
        <EmptyState
          icon={Sparkles}
          title="还没有公开的 Skill"
          description="成为第一个分享技能的人吧"
          action={
            <Button asChild variant="outline" size="sm">
              <Link to="/skills/mine">上传我的 Skill</Link>
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((s) => (
            <SkillGridCard key={s.id} skill={s} />
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => patch({ page: page - 1 <= 1 ? null : String(page - 1) })}
          >
            上一页
          </Button>
          <span className="text-xs text-muted-foreground">
            {page} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => patch({ page: String(page + 1) })}
          >
            下一页
          </Button>
        </div>
      )}
    </div>
  );
}

