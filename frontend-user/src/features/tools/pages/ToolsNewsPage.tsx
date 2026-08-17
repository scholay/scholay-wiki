import { useEffect, useMemo, useState } from 'react';
import { RouteSEO } from '@/shared/components/RouteSEO';
import { CenteredLanding } from '@/shared/components/CenteredLanding';
import { FeatureBrandHeading } from '@/shared/components/FeatureBrandHeading';
import { FeatureGuideCards } from '@/shared/components/FeatureGuideCards';
import { SearchAutocomplete } from '@/shared/components/SearchAutocomplete';
import { cn } from '@/shared/lib/utils';
import { usePatchUrlState, useUrlState } from '@/shared/hooks';
import {
  flattenNewsPages,
  NEWS_SECTIONS,
  useNewsFeedInfinite,
  type NewsSort,
} from '@/shared/api/news';
import { NewsFeedCarousel } from '../components/NewsFeedCarousel';

const SORTS: { key: NewsSort; label: string }[] = [
  { key: 'latest', label: '最新' },
  { key: 'heat', label: '最热' },
];

/**
 * scholay广场 · 学术情报分段(/tools/news)。
 * 标题 / 搜索 / 筛选 / 单卡轮播合成一块,在主区高度居中。
 */
export function ToolsNewsPage() {
  const [sort, setSort] = useState<NewsSort>('latest');
  const [section, setSection] = useState('');
  const patch = usePatchUrlState();
  const [rawQ] = useUrlState('q', '');
  const q = rawQ.trim().toLowerCase();
  const [draft, setDraft] = useState(rawQ);
  useEffect(() => setDraft(rawQ), [rawQ]);
  const setQuery = (v: string) => patch({ q: v || null, page: null });
  const feedQ = useNewsFeedInfinite(sort, section);
  const allItems = useMemo(
    () => flattenNewsPages(feedQ.data?.pages),
    [feedQ.data],
  );
  const items = useMemo(
    () =>
      q
        ? allItems.filter((it) =>
            [it.title, it.summary, it.section_label]
              .join(' ')
              .toLowerCase()
              .includes(q),
          )
        : allItems,
    [allItems, q],
  );

  return (
    <>
      <RouteSEO
        title="scholay 情报 · 学术搜索"
        description="顶刊速递、学术界重大事件、国内科研政策等学术新闻,按热度与时间持续更新。"
        keywords="scholay 情报,学术情报,学术新闻,顶刊速递,科研政策,学术界动态,Scholay"
        canonical="/tools/news"
      />

      <CenteredLanding>
        <FeatureBrandHeading as="h1" title="scholay 情报" mark={false} />
        <div className="mt-6 w-full">
          <SearchAutocomplete
            appearance="literature"
            enableSuggestions={false}
            value={draft}
            onChange={(v) => {
              setDraft(v);
              if (!v) setQuery('');
            }}
            onSubmit={(v) => setQuery(v.trim())}
            placeholder="搜索 scholay 情报 —— 标题 / 关键词"
            autoFocus
          />
        </div>

        <div className="mt-5 flex w-full flex-wrap items-center justify-center gap-1.5">
          {SORTS.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => setSort(s.key)}
              className={cn(
                'rounded-pill px-3 py-1 text-12 font-medium transition-colors',
                sort === s.key
                  ? 'bg-inverse text-on-inverse'
                  : 'bg-surface-2 text-muted-foreground',
              )}
            >
              {s.label}
            </button>
          ))}
          <span aria-hidden className="mx-0.5 h-3 w-px bg-border" />
          {NEWS_SECTIONS.map((sec) => (
            <button
              key={sec.id || 'all'}
              type="button"
              onClick={() => setSection(sec.id)}
              className={cn(
                'rounded-pill border px-3 py-1 text-12 transition-colors',
                section === sec.id
                  ? 'border-inverse bg-inverse text-on-inverse'
                  : 'border-border-button text-muted-foreground hover:bg-surface-2',
              )}
            >
              {sec.label}
            </button>
          ))}
        </div>

        <div className="mt-5 w-full">
          {feedQ.isLoading ? (
            <div className="h-36 animate-pulse rounded-16 border border-border bg-surface-1" />
          ) : items.length === 0 ? (
            <p className="py-10 text-center text-12 text-muted-foreground">
              {feedQ.isError
                ? '加载失败,请稍后重试'
                : q
                  ? '没有匹配的情报,换个关键词试试'
                  : '暂无情报'}
            </p>
          ) : (
            <NewsFeedCarousel items={items} />
          )}
        </div>
        <FeatureGuideCards
          topic="scholay 情报"
          wikiHref="/wiki/research-news"
          scholayPath="/tools/news"
        />
      </CenteredLanding>
    </>
  );
}
