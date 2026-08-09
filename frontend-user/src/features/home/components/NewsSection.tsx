import { Link } from 'react-router-dom';
import { ChevronRight, Flame } from 'lucide-react';
import { useNewsList, useNewsTrending } from '@/shared/api/news';
import { NewsListItem } from '@/shared/components/news/NewsListItem';
import { NewsHotItem } from '@/shared/components/news/NewsHotItem';
import { useAfterPageLoad, useMediaQuery } from '@/shared/hooks';

/**
 * 首页底部「学术情报」区(PC):左主信息流 + 右侧实时热榜两栏。
 * 数据走公开 API(shared/api/news);功能未开启 / 无内容时整块不渲染,保持首页干净。
 *
 * 【定高内部滚动区】(2026-07-27):
 *   本区必须【自己吞掉】溢出内容,不能把 Footer 顶出视口 —— 首页第一屏的契约是
 *   「hero 不被挤压 + Footer 常驻视口底部」,三段共占一屏(见 HomePage 的容器注释)。
 *   所以这里是 h-pane-news 定高 + overflow-y-auto,而不是随内容长高。
 *   标题行 sticky 吸顶:往下滚时「学术情报 / 全部资讯」始终可见,内容从它下面穿过。
 */
export function NewsSection() {
  const showTrending = useMediaQuery('(min-width: 768px)');
  // 新闻正文会命中 Noto Serif SC 的多个 CJK 分片。它是首页次要内容，等 window.load
  // 后的空闲期再取数，确保这些字体不会与首屏 AppShell/Home JS 抢慢网带宽。
  const secondaryReady = useAfterPageLoad();
  const { data: latest, isLoading } = useNewsList('latest', 6, secondaryReady);
  const { data: trending } = useNewsTrending(7, 8, showTrending && secondaryReady);
  const showSkeleton = !secondaryReady || isLoading;

  // 无内容(功能未开 / 暂无情报)→ 不渲染整块。
  // 此时 hero 的 flex-1 会自己撑满剩余空间,Footer 仍贴在视口底部。
  if (!showSkeleton && (!latest || latest.length === 0)) return null;

  return (
    // shrink-0 + 定高:不参与 flex 分配,hero 抢不走它的空间,它也挤不到 Footer。
    // 与 hero 之间【不画分隔线】—— 靠 hero 的留白与「学术情报」标题本身分段就够了。
    <section className="h-pane-news shrink-0">
      {/* 滚动容器:主区已有 sidebar,情报区在主区内再居中收口。
          max-w 取比搜索条(640)宽以容两栏;Tailwind 无 960 档位,
          保留 arbitrary value(对齐情报调研 03 方案 A)。
          scrollbar-none:隐藏滚动条但保留滚动能力(触控板/滚轮/键盘都不受影响)。
          首页是门面,一条常驻的滚动条会把「三段共占一屏」的干净版面切开。 */}
      <div
        data-news-scroll
        className="scrollbar-none mx-auto h-full w-full max-w-[960px] overflow-y-auto px-6"
      >
        {/* sticky 吸顶。
            - -mx-6 px-6:滚动容器有 px-6,负边距让吸顶条的底色铺满整宽,
              否则内容会从左右两侧的 padding 空隙里「漏」上去
            - z-sticky:sticky 元素按 DOM 顺序绘制,不给层级会被后面的兄弟节点盖住
            - bg-background:与页面同底色,内容从下面穿过时不透字 */}
        <div className="sticky top-0 z-sticky -mx-6 flex items-center justify-between bg-background px-6 pb-3 pt-4">
          <h2 className="text-16 font-medium text-foreground">学术情报</h2>
          <Link
            to="/news"
            className="inline-flex items-center gap-0.5 text-12 text-muted-foreground transition-colors hover:text-brand-red"
          >
            全部资讯
            <ChevronRight className="size-3.5" />
          </Link>
        </div>

        <div className="flex gap-6 pb-4">
        {/* 主信息流 */}
        <div className="min-w-0 flex-1 space-y-3">
          {showSkeleton
            ? Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="h-28 animate-pulse rounded-16 border border-border-soft bg-surface-1"
                />
              ))
            : latest?.map((it, index) => (
                <NewsListItem key={it.slug} item={it} deferDetails={index >= 2} />
              ))}
        </div>

        {/* 右侧实时热榜(窄屏隐藏) */}
        {trending && trending.length > 0 && (
          <aside className="hidden w-64 shrink-0 md:block">
            <div className="rounded-16 border border-border-soft bg-surface-1 p-4">
              <p className="mb-1 flex items-center gap-1.5 text-12 font-medium text-foreground">
                <Flame className="size-4 text-brand-red" />
                实时热榜
              </p>
              {/* 榜单靠序号徽标本身分行,不再画横线 —— 8 条 divide-y 在 264px 窄栏里
                  形成密集的横向条纹,与「分层靠留白与明度差」的设计方向相反。 */}
              <div>
                {trending.map((it, i) => (
                  <NewsHotItem key={it.slug} item={it} rank={i + 1} />
                ))}
              </div>
            </div>
          </aside>
        )}
        </div>
      </div>
    </section>
  );
}
