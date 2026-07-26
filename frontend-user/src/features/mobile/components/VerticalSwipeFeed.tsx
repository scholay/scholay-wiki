import { useEffect, useRef, useState, type ReactNode } from 'react';
import useEmblaCarousel from 'embla-carousel-react';
import { ChevronUp, RotateCcw } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { CyclingHint } from '@/shared/components/CyclingHint';
import { PullToRefreshIndicator } from '@/shared/components/PullToRefreshIndicator';
import { usePullToRefresh } from '@/shared/hooks';

/** 只渲染当前卡 ± 这个窗口的真实内容,远处的留空壳 —— 长 feed 不积累 DOM 成本 */
const RENDER_WINDOW = 3;

export interface VerticalSwipeFeedProps<T> {
  items: T[];
  itemKey: (item: T) => string | number;
  /** isActive = 该卡正是当前滑到的位置(懒加载重数据用,如期刊趋势图) */
  renderCard: (item: T, index: number, isActive: boolean) => ReactNode;
  /** 窗口外占位壳(保持滑动尺寸);不传用透明空壳 */
  renderPlaceholder?: () => ReactNode;
  /**
   * 批次大小 —— 预取策略(已拍板):一批滑过**半**就提交下一批查询,
   * 保证内容供给充足(剩余未看 <= ceil(pageSize/2) 即触发)。
   */
  pageSize: number;
  onPrefetch: () => void;
  /** hasNextPage && !isFetchingNextPage */
  canPrefetch: boolean;
  isLoading: boolean;
  /** 正在拉「下一批」(isFetchingNextPage)—— 用于区分「空但还在找内容」与「真的没内容了」。 */
  isFetchingMore?: boolean;
  isError: boolean;
  onRetry: () => void;
  /**
   * 「真的没内容了」空态(seed 已翻干所有页)的按钮动作 —— 必须**换 seed**(轮换出新一批),
   * 不能用 onRetry(refetch):feed 是 (seed,page) 的纯函数,同 seed refetch 拉到的还是同样的空页。
   * 不传则回落 onRetry。两个 feed 都传 handleRefresh(qc.removeQueries + rotateFeedSeed)。
   */
  onEmptyRetry?: () => void;
  loadingHints: string[];
  errorText: string;
  /** 首卡上滑提示文案;空 = 不渲染 */
  swipeHint?: string;
  /** 提示 pill 的定位 class(有 peek 条的 feed 要抬高避开) */
  swipeHintClassName?: string;
  /** 卡片 slide 的内边距 class(论文是留边卡片,期刊是全出血) */
  slideClassName?: string;
  /** 「下一张 peek」预览条(期刊 feed 用);点击滚到下一张 */
  renderPeek?: (next: T) => ReactNode;
  /** 下拉刷新回调(在第一张时下拉触发);不传则不启用 */
  onRefresh?: () => void | Promise<unknown>;
  /** 进入时恢复到的初始位置(二次进入接着上次往后刷);0/缺省 = 从头 */
  initialIndex?: number;
  /** 当前位置变化时回调(用于持久化停留位置) */
  onIndexChange?: (index: number) => void;
}

/**
 * 抖音式垂直滑动 feed 引擎 —— 论文/期刊两个 feed 的公共骨架:
 * embla 纵轴整屏 snap + 渲染窗口化 + 半批预取 + 加载/错误态 + 首卡提示 + peek 条。
 */
export function VerticalSwipeFeed<T>({
  items,
  itemKey,
  renderCard,
  renderPlaceholder,
  pageSize,
  onPrefetch,
  canPrefetch,
  isLoading,
  isFetchingMore,
  isError,
  onRetry,
  onEmptyRetry,
  loadingHints,
  errorText,
  swipeHint,
  swipeHintClassName,
  slideClassName,
  renderPeek,
  onRefresh,
  initialIndex,
  onIndexChange,
}: VerticalSwipeFeedProps<T>) {
  const [selected, setSelected] = useState(initialIndex ?? 0);
  // startIndex 让首批内容已就绪时 embla 直接初始化到目标位;异步到位的情况由下方 restore effect 兜底。
  const [emblaRef, emblaApi] = useEmblaCarousel({ axis: 'y', startIndex: initialIndex ?? 0 });

  // 下拉刷新:仅在第一张卡时下拉触发(被动检测,与 embla 纵向滑动共存)
  const ptr = usePullToRefresh({
    onRefresh: onRefresh ?? (() => {}),
    enabled: !!onRefresh && !isLoading,
    atTop: () => selected === 0,
  });

  useEffect(() => {
    if (!emblaApi) return;
    // 用户滑动 / 程序 scrollTo 触发的位置变更:同步渲染窗口 + 持久化停留位置。
    const onSelect = () => {
      const i = emblaApi.selectedScrollSnap();
      setSelected(i);
      onIndexChange?.(i);
    };
    // slides 增减(内容异步到位 / 预取追加)后 embla 会 reInit 并把 index 夹到有效区间,但 reInit
    // 不发 select → 这里补一次同步,确保 selected 始终等于 embla 真实位置(否则渲染窗口偏移,当前卡空白)。
    // reInit 不持久化(过渡期可能是 0),持久化只在 onSelect。
    const onReInit = () => setSelected(emblaApi.selectedScrollSnap());
    emblaApi.on('select', onSelect).on('reInit', onReInit);
    return () => {
      emblaApi.off('select', onSelect).off('reInit', onReInit);
    };
  }, [emblaApi, onIndexChange]);

  // 位置恢复(一次性):内容就绪后跳到上次停留位置,夹到可用范围内。
  // embla 的 startIndex 已覆盖「首批同步就绪」的常见情形(秒级二次进入,query 缓存完整);
  // 此处兜底「内容异步到位(仅灌前几页)」—— 夹到现有末尾,不强行深翻预取(往后滑由常规半批预取自然续上)。
  const restoredRef = useRef(false);
  useEffect(() => {
    if (restoredRef.current || !emblaApi || items.length === 0) return;
    const target = initialIndex ?? 0;
    if (target > 0) {
      const dest = Math.min(target, items.length - 1);
      if (emblaApi.selectedScrollSnap() !== dest) emblaApi.scrollTo(dest, true);
    }
    restoredRef.current = true;
  }, [emblaApi, items.length, initialIndex]);

  // 半批预取:剩余未看 <= 半批 → 拉下一批。effect 形式,items 增长/滑动都会重估,
  // 去重导致批次缩水时会连续补拉,直到缓冲重新充足。
  // items.length === 0 时也要拉:某一页(常见 page 0)上游临时空/某源故障捞干 → 自动翻到下一页
  // 找内容,而不是卡在空白死局(canPrefetch 已含 !isFetchingNextPage,空翻到 EMPTY_STOP 会自然停)。
  const threshold = Math.ceil(pageSize / 2);
  useEffect(() => {
    if (canPrefetch && (items.length === 0 || items.length - selected <= threshold)) {
      onPrefetch();
    }
  }, [selected, items.length, threshold, canPrefetch, onPrefetch]);

  const next = selected + 1 < items.length ? items[selected + 1] : undefined;

  // 空内容时的两种态:
  //   seeking = 还在加载首批 / 正翻过空页找内容(还有下一批可拉)→ 显示加载提示,别白屏
  //   empty   = 真的没内容了(无加载、无在拉、无下一批)→ 显示空态 + 重试,给用户出口
  const seeking = items.length === 0 && !isError && (isLoading || !!isFetchingMore || canPrefetch);
  const empty = items.length === 0 && !isError && !seeking;

  return (
    <div className="relative h-full bg-surface-1" {...ptr.handlers}>
      {onRefresh && <PullToRefreshIndicator pull={ptr.pull} refreshing={ptr.refreshing} />}
      {seeking && (
        <div className="flex h-full items-center justify-center">
          <CyclingHint
            phrases={loadingHints}
            className="text-sm text-muted-foreground"
          />
        </div>
      )}

      {(empty || (isError && items.length === 0)) && (
        <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
          <p className="text-sm text-muted-foreground">
            {isError ? errorText : '暂时没有更多内容,换一批试试'}
          </p>
          <button
            type="button"
            // 空态(非错误)按钮要换 seed 拉新一批;错误态用 onRetry 重试同一批。
            onClick={empty ? (onEmptyRetry ?? onRetry) : onRetry}
            className="flex items-center gap-1.5 rounded-pill border border-border-button px-4 py-1.5 text-sm text-foreground active:bg-surface-2"
          >
            <RotateCcw className="size-3.5" />
            {empty && !isError ? '换一批' : '重试'}
          </button>
        </div>
      )}

      {items.length > 0 && (
        <>
          <div ref={emblaRef} className="h-full overflow-hidden">
            <div className="flex h-full flex-col">
              {items.map((item, i) => (
                <div
                  key={itemKey(item)}
                  className={cn(
                    'min-h-0 shrink-0 grow-0 basis-full',
                    slideClassName ?? 'px-3 pt-1.5 pb-9'
                  )}
                >
                  {Math.abs(i - selected) <= RENDER_WINDOW ? (
                    renderCard(item, i, i === selected)
                  ) : (
                    /* 窗口外:空壳 + content-visibility:auto,让浏览器跳过其布局/绘制 */
                    (renderPlaceholder?.() ?? (
                      <div className="h-full [content-visibility:auto]" />
                    ))
                  )}
                </div>
              ))}
            </div>
          </div>

          {swipeHint && selected === 0 && (
            <div
              className={cn(
                'pointer-events-none absolute left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-pill bg-surface-card/80 px-3 py-1',
                swipeHintClassName ?? 'bottom-2.5'
              )}
            >
              <ChevronUp className="size-3.5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">{swipeHint}</span>
            </div>
          )}

          {renderPeek && next !== undefined && (
            <button
              type="button"
              aria-label="查看下一张"
              onClick={() => emblaApi?.scrollNext()}
              className="absolute inset-x-4 bottom-0 block text-left"
            >
              {renderPeek(next)}
            </button>
          )}
        </>
      )}
    </div>
  );
}
