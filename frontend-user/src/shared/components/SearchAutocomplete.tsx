import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import { ArrowUp, LogIn, Search, X } from 'lucide-react';
import { SmartSearchToggle } from '@/shared/components/SmartSearchToggle';
import { cn } from '@/shared/lib/utils';
import {
  type JournalSuggestion,
  useJournalSuggestions,
  useMultiSourceSearchSuggestions,
} from '@/shared/api/suggestions';
import type {
  AuthorSuggestion,
  PaperSuggestion,
} from '@/shared/api/types';
import {
  AuthorSection,
  JournalSearchAlternateRow,
  JournalSection,
  PaperSection,
} from './search-autocomplete/AutocompleteSections';
import { useArrivalOrdered } from './search-autocomplete/useArrivalOrdered';

/**
 * 首页搜索框 + 联想下拉 —— 对照 .pen `azjev` Search Autocomplete State:
 *
 *   - 输入框 48h,聚焦时边框变 brand-red,下边角取直与 dropdown 相接
 *   - dropdown 浮在下方:论文(多源 fan-out)+ 作者 + 期刊推荐(米黄底)
 *   - 每个论文项尾部带 D / G / M 单字母来源标识(hover 见数据源说明)
 *   - 默认行为 = 搜索论文。鼠标 hover 搜索按钮 → 弹出"论文 / 期刊"切换器,
 *     与联想 dropdown 互斥(hover 优先)
 *
 * **零 loading 态**:dropdown 只在"至少有一条 suggestion 数据"时才显示。
 * **防御 .map 崩**:接口返回字段可能是 null / 非数组,统一过 `asArray()` 兜底。
 *
 * 子组件(三个 section)+ arrival ordering hook 抽到 ./search-autocomplete/,
 * 本文件留主框 / picker / dropdown 编排逻辑。
 */

/**
 * Picker(搜索类型切换浮层)hover 离开后的"宽限延迟":
 * 鼠标从触发按钮移到浮层之间会有几像素空隙,立即 close 会误关。
 * 120ms 是经验值 —— 慢速鼠标(老人 / 触控板)能稳定过渡,无感知挂起。
 */
const PICKER_CLOSE_DELAY_MS = 120;

export type SearchAutocompleteAppearance = 'literature' | 'smart';

interface SearchAutocompleteProps {
  value: string;
  onChange: (v: string) => void;
  /** 默认提交(回车 / 点搜索按钮 / picker 论文行) */
  onSubmit: (v: string) => void;
  /** 切换到期刊检索 — picker 期刊行触发 */
  onSearchJournals?: (v: string) => void;
  /** 选中期刊联想项 → 期刊主页 */
  onPickJournal?: (j: JournalSuggestion) => void;
  /** 选中论文联想项 → 论文详情 */
  onPickPaper?: (p: PaperSuggestion) => void;
  /** 选中学者联想项 → 学者详情 */
  onPickAuthor?: (a: AuthorSuggestion) => void;
  autoFocus?: boolean;
  placeholder?: string;
  /**
   * 外观:literature = 小圆角 + 红色搜索键 + 联想;
   * smart = 大圆角 + 发送键(首页智能搜索)。同一壳原地过渡圆角/按钮,勿整块换组件。
   */
  appearance?: SearchAutocompleteAppearance;
  /** smart 空输入时的自定义 placeholder 层(如轮播示例)。 */
  placeholderOverlay?: ReactNode;
  /** smart:未登录时发送键显示登录图标(仍走 onSubmit,由父级开登录)。 */
  requireAuth?: boolean;
  /**
   * 输入框内靠右的「智能搜索」开关(首页);smart / literature 两种外观都显示。
   * 不传则不渲染(文献落地页等)。
   */
  smartToggle?: {
    checked: boolean;
    onCheckedChange: (checked: boolean) => void;
  };
  /** 发送/搜索键左侧额外操作(如检索页「筛选」)。 */
  trailingActions?: ReactNode;
  /**
   * 联想下拉展开方向。搜索器底栏输入框在视窗下方,需 `above` 向上展开;
   * 首页 / 居中空态默认 `below`。
   */
  suggestionsPlacement?: 'below' | 'above';
  /**
   * literature 默认拉论文/期刊联想,并在搜索键上挂「论文/期刊」picker。
   * 广场等目录检索传 false,只留同一只外壳。
   */
  enableSuggestions?: boolean;
  className?: string;
}

/** 任何不是数组的输入兜底成 [],避免 .map 崩 */
function asArray<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

export const SearchAutocomplete = forwardRef<HTMLDivElement, SearchAutocompleteProps>(
  (
    {
      value,
      onChange,
      onSubmit,
      onSearchJournals,
      onPickJournal,
      onPickPaper,
      onPickAuthor,
      autoFocus,
      placeholder = '搜索学术论文、期刊、作者…',
      appearance = 'literature',
      placeholderOverlay,
      requireAuth = false,
      smartToggle,
      trailingActions,
      suggestionsPlacement = 'below',
      enableSuggestions = true,
      className,
    },
    ref
  ) => {
  const smart = appearance === 'smart';
  const suggestOn = enableSuggestions && !smart;
  const suggestionsOpenUp = suggestionsPlacement === 'above';
  const [focused, setFocused] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  useImperativeHandle(ref, () => rootRef.current as HTMLDivElement);
  const pickerCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [overlayFixed, setOverlayFixed] = useState<{
    left: number;
    width: number;
    top?: number;
    bottom?: number;
    maxHeight: number;
  } | null>(null);

  // smart / 目录检索不拉联想(省请求);文献落地页才启用。
  const suggestQuery = suggestOn ? value : '';
  // 真并行:3 个源(stc/olx/pmd)各自独立 useQuery,先到先铺,后到的静默追加在尾部
  const sourceResults = useMultiSourceSearchSuggestions(suggestQuery, {
    paperLimit: 4,
    authorLimit: 3,
  });
  const journalsQ = useJournalSuggestions(suggestQuery, { limit: 3 });

  const trimmed = value.trim();
  const { papers, authors } = useArrivalOrdered(sourceResults, trimmed);
  const journals = asArray<JournalSuggestion>(journalsQ.data);

  const hasResults =
    papers.length > 0 || authors.length > 0 || journals.length > 0;
  // Picker(hover 切换器):空输入态下不出现(无内容可搜索);smart 无 picker
  const showPicker = suggestOn && pickerOpen && trimmed.length > 0;
  // 联想 dropdown:与 picker 互斥;smart / 目录检索关闭
  const showSuggestions =
    suggestOn && focused && trimmed.length >= 1 && hasResults && !showPicker;
  // 只有 suggestions 与主框"无缝拼接"(共用同一色边框);
  // picker 是独立悬浮(蓝边 + 8px 间距),不影响主框边框状态
  const mergeBorders = showSuggestions;

  // 切到 smart 时收起文献态浮层,避免圆角过渡时 dropdown 还挂着。
  useEffect(() => {
    if (!smart) return;
    setPickerOpen(false);
    setFocused(false);
  }, [smart]);

  const smartCanSend = !!trimmed;

  // 点击外部关闭
  useEffect(() => {
    if (!showSuggestions && !showPicker) return;
    const onClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setFocused(false);
        setPickerOpen(false);
      }
    };
    window.addEventListener('mousedown', onClick);
    return () => window.removeEventListener('mousedown', onClick);
  }, [showSuggestions, showPicker]);

  // 联想 / picker 一律 fixed,避免被 ClawHero / 检索列的 overflow 裁掉下沿。
  useEffect(() => {
    if (!showSuggestions && !showPicker) {
      setOverlayFixed(null);
      return;
    }
    const recalc = () => {
      const el = rootRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      if (suggestionsOpenUp) {
        setOverlayFixed({
          left: rect.left,
          width: rect.width,
          bottom: window.innerHeight - rect.top,
          maxHeight: Math.max(160, rect.top - 24),
        });
        return;
      }
      setOverlayFixed({
        left: rect.left,
        width: rect.width,
        top: rect.bottom,
        maxHeight: Math.max(160, window.innerHeight - rect.bottom - 24),
      });
    };
    recalc();
    window.addEventListener('resize', recalc);
    window.addEventListener('scroll', recalc, true);
    let ro: ResizeObserver | null = null;
    if (rootRef.current && 'ResizeObserver' in window) {
      ro = new ResizeObserver(recalc);
      ro.observe(rootRef.current);
    }
    return () => {
      window.removeEventListener('resize', recalc);
      window.removeEventListener('scroll', recalc, true);
      ro?.disconnect();
    };
  }, [showSuggestions, showPicker, suggestionsOpenUp]);

  // Hover picker 的开关 —— 给"搜索按钮 + picker 浮层"作为复合 hover 区域,
  // 鼠标离开 120ms 内重入则取消关闭,避免按钮 → 浮层 中间空隙误关
  const openPickerNow = useCallback(() => {
    if (pickerCloseTimer.current) {
      clearTimeout(pickerCloseTimer.current);
      pickerCloseTimer.current = null;
    }
    setPickerOpen(true);
  }, []);
  const schedulePickerClose = useCallback(() => {
    if (pickerCloseTimer.current) clearTimeout(pickerCloseTimer.current);
    pickerCloseTimer.current = setTimeout(() => {
      setPickerOpen(false);
      pickerCloseTimer.current = null;
    }, PICKER_CLOSE_DELAY_MS);
  }, []);
  useEffect(
    () => () => {
      if (pickerCloseTimer.current) clearTimeout(pickerCloseTimer.current);
    },
    []
  );

  const submitPapers = (q: string) => {
    setFocused(false);
    setPickerOpen(false);
    onSubmit(q);
  };
  const submitJournals = (q: string) => {
    setFocused(false);
    setPickerOpen(false);
    (onSearchJournals ?? onSubmit)(q);
  };

  const handleFormSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (smart && !smartCanSend) return;
    submitPapers(trimmed);
  };

  return (
    <div ref={rootRef} className={cn('relative mx-auto w-full max-w-[640px]', className)}>
      <form onSubmit={handleFormSubmit}>
        <div
          className={cn(
            // .pen `Z0RbcB`:48h;圆角/阴影原地过渡(首页 smart↔literature 切模式)
            'flex h-12 items-center gap-3 border bg-background pl-5 pr-2',
            'transition-[border-radius,box-shadow,border-color,background-color] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]',
            mergeBorders
              ? suggestionsOpenUp
                ? 'rounded-b-sm border-destructive border-t-0'
                : 'rounded-t-sm border-destructive border-b-0'
              : smart
                ? 'rounded-2xl border-border-strong shadow-sm focus-within:border-foreground/25 focus-within:ring-4 focus-within:ring-foreground/5'
                : focused
                  ? 'rounded-sm border-foreground'
                  : 'rounded-sm border-border-strong focus-within:border-foreground',
          )}
        >
          {smartToggle && (
            <SmartSearchToggle
              checked={smartToggle.checked}
              onCheckedChange={smartToggle.onCheckedChange}
            />
          )}
          <div className="relative min-w-0 flex-1">
            {placeholderOverlay && trimmed.length === 0 && placeholderOverlay}
            <input
              // type="text" 不是 "search" —— 后者会渲染浏览器原生清空 ×,各浏览器样式不一
              type="text"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              onFocus={() => setFocused(true)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setFocused(false);
                  setPickerOpen(false);
                }
              }}
              autoFocus={autoFocus}
              placeholder={placeholderOverlay ? '' : placeholder}
              className="h-auto w-full bg-transparent text-base outline-none placeholder:text-faint"
            />
          </div>
          {value && !smart && (
            <button
              type="button"
              aria-label="清空"
              tabIndex={-1}
              onClick={() => {
                onChange('');
                rootRef.current?.querySelector('input')?.focus();
              }}
              className="inline-flex size-7 cursor-pointer items-center justify-center rounded-sm text-faint transition-colors hover:bg-surface-2 hover:text-foreground"
            >
              <X className="size-3.5" strokeWidth={2.5} />
            </button>
          )}
          {trailingActions}
          <button
            type="submit"
            aria-label={
              smart
                ? requireAuth
                  ? '登录后开始'
                  : '发送'
                : '搜索'
            }
            disabled={smart && !smartCanSend}
            onMouseEnter={suggestOn ? openPickerNow : undefined}
            onMouseLeave={suggestOn ? schedulePickerClose : undefined}
            className={cn(
              'relative inline-flex size-9 shrink-0 items-center justify-center transition-[background-color,border-radius,color,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]',
              smart
                ? cn(
                    'rounded-lg',
                    smartCanSend
                      ? 'cursor-pointer bg-foreground text-background hover:bg-foreground/90'
                      : 'cursor-not-allowed bg-surface-2 text-faint',
                  )
                : 'cursor-pointer rounded-sm bg-destructive text-destructive-foreground hover:bg-destructive/90',
            )}
          >
            {/* 图标交叉淡入淡出,按钮壳不换节点 */}
            <Search
              className={cn(
                'absolute size-4 transition-opacity duration-300',
                smart ? 'opacity-0' : 'opacity-100',
              )}
              strokeWidth={2.5}
              aria-hidden
            />
            {requireAuth ? (
              <LogIn
                className={cn(
                  'absolute size-4 transition-opacity duration-300',
                  smart ? 'opacity-100' : 'opacity-0',
                )}
                strokeWidth={2.2}
                aria-hidden
              />
            ) : (
              <ArrowUp
                className={cn(
                  'absolute size-4 transition-opacity duration-300',
                  smart ? 'opacity-100' : 'opacity-0',
                )}
                strokeWidth={2.5}
                aria-hidden
              />
            )}
          </button>
        </div>
      </form>

      {/* 进出场用 tw-animate-css(零额外 JS)——本组件是首屏 eager 组件,
          不引 framer-motion 以免把 ~42KB gz 钉进首屏关键路径。dropdown 出场直接卸载、无需退场过渡。 */}
      <>
        {showPicker && overlayFixed && (
          <div
            onMouseEnter={openPickerNow}
            onMouseLeave={schedulePickerClose}
            className="z-50 animate-in fade-in slide-in-from-top-1 duration-150"
            style={{
              position: 'fixed',
              left: overlayFixed.left,
              width: overlayFixed.width,
              top: (overlayFixed.top ?? 0) + 8,
            }}
          >
            <JournalSearchAlternateRow
              query={trimmed}
              onClick={() => submitJournals(trimmed)}
            />
          </div>
        )}

        {showSuggestions && overlayFixed && (
          <div
            className={cn(
              'z-50 flex flex-col bg-background border border-border-strong overflow-y-auto animate-in fade-in duration-150',
              suggestionsOpenUp
                ? 'border-b-0 rounded-t-sm shadow-[0_-8px_24px_rgba(0,0,0,0.08)] slide-in-from-bottom-1'
                : 'border-t-0 rounded-b-sm shadow-[0_8px_24px_rgba(0,0,0,0.08)] slide-in-from-top-1',
            )}
            style={{
              position: 'fixed',
              left: overlayFixed.left,
              width: overlayFixed.width,
              maxHeight: overlayFixed.maxHeight,
              ...(overlayFixed.top != null
                ? { top: overlayFixed.top }
                : { bottom: overlayFixed.bottom }),
            }}
          >
            {papers.length > 0 && (
              <PaperSection
                query={trimmed}
                papers={papers}
                onPick={(p) => {
                  setFocused(false);
                  if (onPickPaper) onPickPaper(p);
                  else onSubmit(p.title);
                }}
              />
            )}

            {papers.length > 0 && authors.length > 0 && (
              <div aria-hidden className="h-px bg-border-soft" />
            )}

            {authors.length > 0 && (
              <AuthorSection
                query={trimmed}
                authors={authors}
                onPick={(a) => {
                  setFocused(false);
                  if (onPickAuthor) onPickAuthor(a);
                  else onSubmit(a.name ?? '');
                }}
              />
            )}

            {(papers.length > 0 || authors.length > 0) && journals.length > 0 && (
              <div aria-hidden className="h-px bg-border-soft" />
            )}

            {journals.length > 0 && (
              <JournalSection
                journals={journals}
                onPick={(j) => {
                  setFocused(false);
                  if (onPickJournal) onPickJournal(j);
                }}
              />
            )}
          </div>
        )}
      </>
    </div>
  );
  }
);
SearchAutocomplete.displayName = 'SearchAutocomplete';
