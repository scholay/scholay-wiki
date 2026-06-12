import { useEffect, useState, type ReactNode } from 'react';
import useEmblaCarousel from 'embla-carousel-react';
import { ChevronUp, RotateCcw } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { CyclingHint } from '@/shared/components/CyclingHint';

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
  isError: boolean;
  onRetry: () => void;
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
  isError,
  onRetry,
  loadingHints,
  errorText,
  swipeHint,
  swipeHintClassName,
  slideClassName,
  renderPeek,
}: VerticalSwipeFeedProps<T>) {
  const [selected, setSelected] = useState(0);
  const [emblaRef, emblaApi] = useEmblaCarousel({ axis: 'y' });

  useEffect(() => {
    if (!emblaApi) return;
    const onSelect = () => setSelected(emblaApi.selectedScrollSnap());
    emblaApi.on('select', onSelect);
    return () => {
      emblaApi.off('select', onSelect);
    };
  }, [emblaApi]);

  // 半批预取:剩余未看 <= 半批 → 拉下一批。effect 形式,items 增长/滑动都会重估,
  // 去重导致批次缩水时会连续补拉,直到缓冲重新充足。
  const threshold = Math.ceil(pageSize / 2);
  useEffect(() => {
    if (items.length > 0 && items.length - selected <= threshold && canPrefetch) {
      onPrefetch();
    }
  }, [selected, items.length, threshold, canPrefetch, onPrefetch]);

  const next = selected + 1 < items.length ? items[selected + 1] : undefined;

  return (
    <div className="relative h-full bg-surface-1">
      {isLoading && (
        <div className="flex h-full items-center justify-center">
          <CyclingHint
            phrases={loadingHints}
            className="text-sm text-muted-foreground"
          />
        </div>
      )}

      {isError && items.length === 0 && (
        <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
          <p className="text-sm text-muted-foreground">{errorText}</p>
          <button
            type="button"
            onClick={onRetry}
            className="flex items-center gap-1.5 rounded-pill border border-border-button px-4 py-1.5 text-sm text-foreground active:bg-surface-2"
          >
            <RotateCcw className="size-3.5" />
            重试
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
                    (renderPlaceholder?.() ?? <div className="h-full" />)
                  )}
                </div>
              ))}
            </div>
          </div>

          {swipeHint && selected === 0 && (
            <div
              className={cn(
                'pointer-events-none absolute left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-pill bg-background/80 px-3 py-1',
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
