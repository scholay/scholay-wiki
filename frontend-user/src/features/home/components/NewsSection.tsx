import { Link } from 'react-router-dom';
import { ChevronRight, Flame } from 'lucide-react';
import { useNewsList, useNewsTrending } from '@/shared/api/news';
import { NewsListItem } from '@/shared/components/news/NewsListItem';
import { NewsHotItem } from '@/shared/components/news/NewsHotItem';

/**
 * 首页底部「学术情报」区(PC):左主信息流 + 右侧实时热榜两栏。
 * 数据走公开 API(shared/api/news);功能未开启 / 无内容时整块不渲染,保持首页干净。
 */
export function NewsSection() {
  const { data: latest, isLoading } = useNewsList('latest', 6);
  const { data: trending } = useNewsTrending(7, 8);

  // 无内容(功能未开 / 暂无情报)→ 不渲染整块。
  if (!isLoading && (!latest || latest.length === 0)) return null;

  return (
    // 主区已有 sidebar,情报区在主区内再居中收口。max-w 取比搜索条(640)宽以容两栏;
    // Tailwind 无 960 档位,保留 arbitrary value(对齐情报调研 03 方案 A)。
    <section className="mx-auto w-full max-w-[960px] px-6 pb-16">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-bold text-foreground">学术情报</h2>
        <Link
          to="/news"
          className="inline-flex items-center gap-0.5 text-xs text-muted-foreground transition-colors hover:text-brand-red"
        >
          全部资讯
          <ChevronRight className="size-3.5" />
        </Link>
      </div>

      <div className="flex gap-6">
        {/* 主信息流 */}
        <div className="min-w-0 flex-1 space-y-3">
          {isLoading
            ? Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="h-24 animate-pulse rounded-16 border border-border-soft bg-surface-1"
                />
              ))
            : latest?.map((it) => <NewsListItem key={it.slug} item={it} />)}
        </div>

        {/* 右侧实时热榜(窄屏隐藏) */}
        {trending && trending.length > 0 && (
          <aside className="hidden w-64 shrink-0 md:block">
            <div className="rounded-16 border border-border-soft bg-surface-1 p-4">
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
    </section>
  );
}
