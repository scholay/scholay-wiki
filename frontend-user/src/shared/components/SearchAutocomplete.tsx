import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
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
      className,
    },
    ref
  ) => {
  const [focused, setFocused] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  useImperativeHandle(ref, () => rootRef.current as HTMLDivElement);
  const pickerCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // dropdown 高度上限 —— 实测主框距视窗底距离,扣 24px 安全边距,防止滚动条贴到屏幕底缘
  // 首帧兜底用 dvh(测量前只有这一帧会用到它;裸 vh 在 iOS 地址栏展开时偏大)
  const [dropdownMaxHeight, setDropdownMaxHeight] = useState<string>('70dvh');

  // 真并行:3 个源(stc/olx/pmd)各自独立 useQuery,先到先铺,后到的静默追加在尾部
  const sourceResults = useMultiSourceSearchSuggestions(value, {
    paperLimit: 4,
    authorLimit: 3,
  });
  const journalsQ = useJournalSuggestions(value, { limit: 3 });

  const trimmed = value.trim();
  const { papers, authors } = useArrivalOrdered(sourceResults, trimmed);
  const journals = asArray<JournalSuggestion>(journalsQ.data);

  const hasResults =
    papers.length > 0 || authors.length > 0 || journals.length > 0;
  // Picker(hover 切换器):空输入态下不出现(无内容可搜索)
  const showPicker = pickerOpen && trimmed.length > 0;
  // 联想 dropdown:与 picker 互斥
  const showSuggestions = focused && trimmed.length >= 1 && hasResults && !showPicker;
  // 只有 suggestions 与主框"无缝拼接"(共用同一色边框);
  // picker 是独立悬浮(蓝边 + 8px 间距),不影响主框边框状态
  const mergeBorders = showSuggestions;

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

  // 计算 dropdown 高度上限 —— 实测主框 bottom 距视窗底距离,扣 24px 安全垫
  // 主框可能因父容器布局变化(响应式 / 抽屉展开)移位,所以观察 root + window resize
  useEffect(() => {
    if (!showSuggestions) return;
    const recalc = () => {
      const el = rootRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const available = window.innerHeight - rect.bottom - 24;
      // 至少留 160px(放得下 2-3 行联想),否则与无 dropdown 等效
      setDropdownMaxHeight(`${Math.max(160, available)}px`);
    };
    recalc();
    window.addEventListener('resize', recalc);
    let ro: ResizeObserver | null = null;
    if (rootRef.current && 'ResizeObserver' in window) {
      ro = new ResizeObserver(recalc);
      ro.observe(rootRef.current);
    }
    return () => {
      window.removeEventListener('resize', recalc);
      ro?.disconnect();
    };
  }, [showSuggestions]);

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

  return (
    <div ref={rootRef} className={cn('relative w-full max-w-[640px]', className)}>
      <form onSubmit={(e) => { e.preventDefault(); submitPapers(trimmed); }}>
        <div
          className={cn(
            // .pen `Z0RbcB`:48h,与联想 dropdown 拼接时下边变直
            'flex h-12 items-center gap-3 pl-5 pr-2 bg-surface-card border transition-colors',
            mergeBorders
              ? 'border-destructive rounded-t-16 border-b-0'
              : focused
                ? 'border-foreground rounded-16'
                : 'border-border-strong rounded-16 focus-within:border-foreground'
          )}
        >
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
            placeholder={placeholder}
            // 「outline-none」:焦点可供性由外层搜索条承担 —— 它有 focus-within:border-foreground
            // (以及 focused 态的 `border-foreground`),整条框变深比裸 input 画环更贴 Figma §4.5。
            className="flex-1 h-auto bg-transparent text-14 outline-none placeholder:text-faint"
          />
          {value && (
            <button
              type="button"
              aria-label="清空"
              tabIndex={-1}
              onClick={() => {
                onChange('');
                rootRef.current?.querySelector('input')?.focus();
              }}
              className="inline-flex size-7 items-center justify-center rounded-8 text-faint hover:bg-surface-2 hover:text-foreground transition-colors"
            >
              <X className="size-3.5" strokeWidth={2.5} />
            </button>
          )}
          <button
            type="submit"
            aria-label="搜索"
            onMouseEnter={openPickerNow}
            onMouseLeave={schedulePickerClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-8 bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors"
          >
            <Search className="size-4" strokeWidth={2.5} />
          </button>
        </div>
      </form>

      {/* 进出场用 tw-animate-css(零额外 JS)——本组件是首屏 eager 组件,
          不引 framer-motion 以免把 ~42KB gz 钉进首屏关键路径。dropdown 出场直接卸载、无需退场过渡。 */}
      <>
        {showPicker && (
          <div
            onMouseEnter={openPickerNow}
            onMouseLeave={schedulePickerClose}
            // 与主框留 8px 间距(top-full + mt-2),不挤压主框下边线;
            // 主框边框不会因为 picker 打开而改变(mergeBorders 只看 suggestions)
            className="absolute top-full left-0 right-0 mt-2 z-popover animate-in fade-in slide-in-from-top-1 duration-150"
          >
            <JournalSearchAlternateRow
              query={trimmed}
              onClick={() => submitJournals(trimmed)}
            />
          </div>
        )}

        {showSuggestions && (
          <div
            // .pen `t3sGV`:1px #E5E5E5 边 + 下圆角 4 + 阴影 (0,8) blur 24
            // 高度封顶由上面 ResizeObserver 算出 --dropdownMaxHeight
            className="absolute top-full left-0 right-0 z-popover flex flex-col bg-surface-card border border-border-strong border-t-0 rounded-b-16 overflow-y-auto animate-in fade-in slide-in-from-top-1 duration-150"
            style={{ maxHeight: dropdownMaxHeight }}
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
