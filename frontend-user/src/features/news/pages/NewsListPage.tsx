import { useMemo, useState } from 'react';
import { RouteSEO } from '@/shared/components/RouteSEO';
import { Footer } from '@/shared/components/Footer';
import { Button } from '@/shared/ui/button';
import { cn } from '@/shared/lib/utils';
import { NewsListItem } from '@/shared/components/news/NewsListItem';
import {
  flattenNewsPages,
  NEWS_SECTIONS,
  useNewsFeedInfinite,
  type NewsSort,
} from '@/shared/api/news';

const SORTS: { key: NewsSort; label: string }[] = [
  { key: 'latest', label: '最新' },
  { key: 'heat', label: '最热' },
];

/**
 * 全部学术情报列表页 —— /news(挂 AppShell)。
 * 排序(最新/最热)+ 分区 chip 筛选,复用 useNewsFeedInfinite「加载更多」。
 */
export function NewsListPage() {
  const [sort, setSort] = useState<NewsSort>('latest');
  const [section, setSection] = useState('');
  const feedQ = useNewsFeedInfinite(sort, section);
  const items = useMemo(() => flattenNewsPages(feedQ.data?.pages), [feedQ.data]);

  return (
    <>
      <RouteSEO
        title="学术情报 - 顶刊速递 · 重大事件 · 国内政策 | Scholay 学术"
        description="Scholay 学术情报:实时汇集顶级期刊论文速递、学术界重大事件、国内科研政策等学术新闻,按热度与时间持续更新。"
        keywords="学术情报,学术新闻,顶刊速递,科研政策,学术界动态,Scholay"
        canonical="/news"
      />
      <div className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="font-serif text-24 font-medium text-foreground">学术情报</h1>
        <p className="mt-2 text-12 text-muted-foreground">
          顶刊速递 · 重大事件 · 国内政策 —— 实时汇集学术界动态。
        </p>

        {/* 排序 */}
        <div className="mt-5 flex items-center gap-1.5">
          {SORTS.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => setSort(s.key)}
              className={cn(
                'rounded-pill px-3 py-1 text-12 font-medium transition-colors',
                sort === s.key ? 'bg-foreground text-on-dark' : 'bg-surface-2 text-muted-foreground',
              )}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* 分区 chip */}
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          {NEWS_SECTIONS.map((sec) => (
            <button
              key={sec.id || 'all'}
              type="button"
              onClick={() => setSection(sec.id)}
              className={cn(
                'rounded-pill border px-3 py-1 text-12 transition-colors',
                section === sec.id
                  ? 'border-foreground bg-foreground text-on-dark'
                  : 'border-border-button text-muted-foreground hover:bg-surface-2',
              )}
            >
              {sec.label}
            </button>
          ))}
        </div>

        {/* 列表 */}
        <div className="mt-6 space-y-3">
          {feedQ.isLoading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="h-24 animate-pulse rounded-16 border border-border-soft bg-surface-1"
              />
            ))
          ) : items.length === 0 ? (
            <p className="py-16 text-center text-12 text-muted-foreground">
              {feedQ.isError ? '加载失败,请稍后重试' : '暂无情报'}
            </p>
          ) : (
            items.map((it) => <NewsListItem key={it.slug} item={it} />)
          )}
        </div>

        {/* 加载更多 */}
        {feedQ.hasNextPage && (
          <div className="mt-6 flex justify-center">
            <Button
              variant="outline"
              onClick={() => void feedQ.fetchNextPage()}
              disabled={feedQ.isFetchingNextPage}
            >
              {feedQ.isFetchingNextPage ? '加载中…' : '加载更多'}
            </Button>
          </div>
        )}
      </div>
      <Footer />
    </>
  );
}
