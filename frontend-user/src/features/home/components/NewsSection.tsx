import { Link } from 'react-router-dom';
import { ChevronRight, Flame } from 'lucide-react';
import { useNewsList, useNewsTrending } from '@/shared/api/news';
import { NewsListItem } from '@/shared/components/news/NewsListItem';
import { NewsHotItem } from '@/shared/components/news/NewsHotItem';

/**
 * 首页「学术情报」—— 嵌在 HomeAgentHero 主区内,与智能体入口共用背景。
 */
export function NewsSection() {
  const { data: latest, isLoading } = useNewsList('latest', 6);
  const { data: trending } = useNewsTrending(7, 8);

  if (!isLoading && (!latest || latest.length === 0)) return null;

  return (
    <div className="mx-auto w-full max-w-[960px] border-t border-border-soft/80 px-6 pb-12 pt-10">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-bold text-foreground">scholay 情报</h2>
        <Link
          to="/news"
          className="inline-flex items-center gap-0.5 text-xs text-muted-foreground transition-colors hover:text-brand-red"
        >
          全部资讯
          <ChevronRight className="size-3.5" />
        </Link>
      </div>

      <div className="flex gap-6">
        <div className="min-w-0 flex-1 space-y-3">
          {isLoading
            ? Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="h-24 animate-pulse rounded-md border border-border-soft/80 bg-background/60"
                />
              ))
            : latest?.map((it) => <NewsListItem key={it.slug} item={it} />)}
        </div>

        {trending && trending.length > 0 && (
          <aside className="hidden w-64 shrink-0 md:block">
            <div className="rounded-md border border-border-soft/80 bg-background/70 p-4 backdrop-blur-sm">
              <p className="mb-1 flex items-center gap-1.5 text-sm font-bold text-foreground">
                <Flame className="size-4 text-brand-red" />
                实时热榜
              </p>
              <div className="divide-y divide-border-soft">
                {trending.map((it, i) => (
                  <NewsHotItem key={it.slug} item={it} rank={i + 1} />
                ))}
              </div>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
