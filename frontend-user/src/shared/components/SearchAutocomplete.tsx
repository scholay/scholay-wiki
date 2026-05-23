import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronRight, Search, User, X } from 'lucide-react';
import { cn } from '@/shared/lib/utils';

/**
 * Picker(搜索类型切换浮层)hover 离开后的"宽限延迟":
 * 鼠标从触发按钮移到浮层之间会有几像素的空隙,如果立即 close 会被误关。
 * 120 ms 是经验值 —— 慢速鼠标(老人 / 触控板)能稳定过渡,无感知挂起。
 */
const PICKER_CLOSE_DELAY_MS = 120;
import {
  type JournalSuggestion,
  type SourceSuggestionResult,
  useJournalSuggestions,
  useMultiSourceSearchSuggestions,
} from '@/shared/api/suggestions';
import { SourceBadge } from '@/shared/components/SourceBadge';
import type {
  AuthorSuggestion,
  PaperSuggestion,
  UpstreamSource,
} from '@/shared/api/types';

/**
 * 首页搜索框 + 联想下拉 —— 对照 .pen `azjev` Search Autocomplete State:
 *
 *   - 输入框 48h,聚焦时边框变 brand-red,下边角取直与 dropdown 相接
 *   - dropdown 浮在下方:论文(多源 fan-out)+ 期刊推荐(米黄底)
 *   - 每个论文项尾部带 D / G / M 单字母来源标识(hover 见数据源说明)
 *   - 默认行为 = 搜索论文。鼠标 hover 搜索按钮 → 弹出"论文 / 期刊"切换器,
 *     与联想 dropdown 互斥(hover 优先)。
 *
 * **零 loading 态**:dropdown 只在"至少有一条 suggestion 数据"时才显示。
 * **防御 .map 崩**:接口返回字段可能是 null / 非数组,统一过 `asArray()` 兜底。
 */
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

/** 任何不是数组的输入兜底成 [],避免 .map 崩。 */
function asArray<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

export function SearchAutocomplete({
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
}: SearchAutocompleteProps) {
  const [focused, setFocused] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const pickerCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // dropdown 高度上限 —— 实测主框距视窗底距离,扣 24px 安全边距,防止滚动条贴到屏幕底缘
  const [dropdownMaxHeight, setDropdownMaxHeight] = useState<string>('70vh');

  // 真并行:3 个源(stc/olx/pmd)各自独立 useQuery,先到先铺,后到的静默追加在尾部。
  // 之前用单个 fan-out 请求等所有源返回,慢的源(PMD)会卡死整个 dropdown。
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
  // 注意:只有 suggestions 与主框"无缝拼接"(共用同一色边框);
  // picker 是独立悬浮(蓝边 + 8px 间距),不影响主框边框状态。
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

  // 计算 dropdown 高度上限 —— 实测主框 bottom 距视窗底距离,扣 24px 安全垫。
  // 主框可能因为父容器布局变化(响应式 / 抽屉展开)移位,所以观察 root + window resize。
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
    // 主框自身可能因输入框 X 按钮出现/消失而移动一两 px,observe 一下
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
  // 鼠标离开 120ms 内重入则取消关闭,避免按钮 → 浮层 中间空隙误关。
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
            'flex h-12 items-center gap-3 pl-5 pr-2 bg-background border transition-colors',
            mergeBorders
              ? 'border-destructive rounded-t-sm border-b-0'
              : focused
                ? 'border-foreground rounded-sm'
                : 'border-border-strong rounded-sm focus-within:border-foreground'
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
            className="flex-1 h-auto bg-transparent text-base outline-none placeholder:text-faint"
          />
          {value && (
            <button
              type="button"
              aria-label="清空"
              tabIndex={-1}
              onClick={() => {
                onChange('');
                // 清空后聚焦回输入框,继续打字
                rootRef.current?.querySelector('input')?.focus();
              }}
              className="inline-flex size-7 items-center justify-center rounded-sm text-faint hover:bg-surface-2 hover:text-foreground transition-colors"
            >
              <X className="size-3.5" strokeWidth={2.5} />
            </button>
          )}
          <button
            type="submit"
            aria-label="搜索"
            onMouseEnter={openPickerNow}
            onMouseLeave={schedulePickerClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-sm bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors"
          >
            <Search className="size-4" strokeWidth={2.5} />
          </button>
        </div>
      </form>

      <AnimatePresence>
        {showPicker && (
          <motion.div
            key="picker"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            onMouseEnter={openPickerNow}
            onMouseLeave={schedulePickerClose}
            // 与主框留 8px 间距(top-full + mt-2),不挤压主框下边线;
            // 主框边框不会因为 picker 打开而改变(mergeBorders 只看 suggestions)
            className="absolute top-full left-0 right-0 mt-2 z-50"
          >
            <JournalSearchAlternateRow
              query={trimmed}
              onClick={() => submitJournals(trimmed)}
            />
          </motion.div>
        )}

        {showSuggestions && (
          <motion.div
            key="suggestions"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            // .pen `t3sGV`:1px #E5E5E5 边 + 下圆角 4 + 阴影 (0,8) blur 24 #00000014
            // 高度封顶:由 SearchAutocomplete 在挂载时测量 input 距视窗顶距离,
            // 算出可用余量(--autocomplete-maxh,见 useEffect 里 ResizeObserver)。
            // 内部 overflow-y-auto 让内容超出时自然滚动,不再撑爆视窗。
            className="absolute top-full left-0 right-0 z-50 flex flex-col bg-background border border-border-strong border-t-0 rounded-b-sm shadow-[0_8px_24px_rgba(0,0,0,0.08)] overflow-y-auto"
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
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ===========================================================================
// 期刊检索替代入口(hover 主搜索按钮时出现)
// ===========================================================================

/**
 * 期刊检索行 —— 视觉与主搜索框完全一致:48h、同 padding (pl-5 pr-2)、同字号。
 * 唯一区别:外边框 brand-blue + 右侧按钮文字"期刊搜索"。
 * 不放图标 / 不放说明文案,极简对齐主框形态。
 */
function JournalSearchAlternateRow({
  query,
  onClick,
}: {
  query: string;
  onClick: () => void;
}) {
  return (
    <div
      className={cn(
        // 形态完全复刻主框:48h / pl-5 pr-2 / rounded-sm
        'flex h-12 items-center gap-3 pl-5 pr-2 bg-background border border-brand-blue rounded-sm',
        // 轻微阴影,与主框区分悬浮层级
        'shadow-[0_8px_24px_rgba(0,0,0,0.06)]'
      )}
    >
      {/* 查询文字 —— 不可编辑,只是 echo 主框 query 让用户确认 */}
      <span className="flex-1 min-w-0 truncate text-base text-foreground">
        {query}
      </span>
      <button
        type="button"
        onClick={onClick}
        className={cn(
          'inline-flex h-9 items-center justify-center px-4 rounded-sm',
          'bg-brand-blue text-white text-sm font-semibold whitespace-nowrap',
          'hover:bg-brand-blue/95 transition-colors'
        )}
      >
        期刊搜索
      </button>
    </div>
  );
}

// ===========================================================================
// Papers section
// ===========================================================================

function PaperSection({
  query,
  papers,
  onPick,
}: {
  query: string;
  papers: PaperSuggestion[];
  onPick: (p: PaperSuggestion) => void;
}) {
  return (
    <div className="py-1.5">
      <SectionHeader>论文</SectionHeader>
      {papers.map((p) => (
        <button
          key={`${p.source ?? ''}-${p.id}`}
          type="button"
          onClick={() => onPick(p)}
          className="flex w-full items-center gap-3 px-5 py-2.5 text-left hover:bg-surface-1 transition-colors"
        >
          <Search className="size-3.5 shrink-0 text-faint" />
          <span className="flex-1 min-w-0 truncate text-md">
            {highlightQuery(p.title, query)}
          </span>
          <SourceBadge source={p.source} variant="letter" size="sm" />
        </button>
      ))}
    </div>
  );
}

// ===========================================================================
// Authors section
// ===========================================================================

function AuthorSection({
  query,
  authors,
  onPick,
}: {
  query: string;
  authors: AuthorSuggestion[];
  onPick: (a: AuthorSuggestion) => void;
}) {
  return (
    <div className="py-1.5">
      <SectionHeader>学者</SectionHeader>
      {authors.map((a) => {
        const aff = a.affiliations?.[0];
        return (
          <button
            key={`${a.source ?? ''}-${a.authorId ?? a.name}`}
            type="button"
            onClick={() => onPick(a)}
            className="flex w-full items-center gap-3 px-5 py-2.5 text-left hover:bg-surface-1 transition-colors"
          >
            <User className="size-3.5 shrink-0 text-faint" />
            <div className="flex-1 min-w-0">
              <div className="text-md truncate">
                {highlightQuery(a.name ?? '未知作者', query)}
              </div>
              {(aff || a.paperCount != null || a.hIndex != null) && (
                <div className="mt-0.5 text-xs text-faint truncate">
                  {aff}
                  {aff && (a.paperCount != null || a.hIndex != null) && ' · '}
                  {a.paperCount != null && <>{a.paperCount} 篇</>}
                  {a.paperCount != null && a.hIndex != null && ' · '}
                  {a.hIndex != null && <>h-index {a.hIndex}</>}
                </div>
              )}
            </div>
            <SourceBadge source={a.source} variant="letter" size="sm" />
          </button>
        );
      })}
    </div>
  );
}

// ===========================================================================
// Journals section
// ===========================================================================

/**
 * 期刊封面色系 —— .pen `hAqM6 / tk0LP / X4FWu` 三种品牌色 + 暗一档描边。
 * 这里用品牌色 + black/15 作为统一描边,视觉与 .pen 几乎无差。
 */
const COVER_PALETTE = ['bg-brand-red', 'bg-brand-green', 'bg-brand-amber'];

function JournalSection({
  journals,
  onPick,
}: {
  journals: JournalSuggestion[];
  onPick: (j: JournalSuggestion) => void;
}) {
  return (
    // .pen `a17q5P` 米黄软底,与 papers 区视觉区分(token: journal-soft)
    <div className="bg-journal-soft py-2">
      <div className="flex items-center px-5 py-1.5">
        <span className="text-xs font-bold text-brand-red">期刊推荐</span>
      </div>
      {journals.map((j, i) => (
        <button
          key={j.id}
          type="button"
          onClick={() => onPick(j)}
          className="flex w-full items-center gap-3.5 px-5 py-3 text-left hover:bg-black/[0.03] transition-colors"
        >
          <JournalCover name={j.canonical_name} index={i} />
          <div className="flex-1 min-w-0 flex flex-col gap-1">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-md font-bold text-foreground truncate">
                {j.canonical_name}
              </span>
              <span className="shrink-0 inline-flex items-center rounded-pill bg-danger-soft text-brand-red text-2xs font-semibold px-1.5 py-0.5">
                期刊
              </span>
            </div>
            <div className="text-sm text-muted-foreground truncate">
              {j.issn_l ? `ISSN ${j.issn_l} · ` : ''}
              {j.source_count ?? 0} 个来源 · {j.openalex_works_count ?? 0} 篇收录
            </div>
          </div>
          <ChevronRight className="size-5 text-faint shrink-0" />
        </button>
      ))}
    </div>
  );
}

function JournalCover({ name, index }: { name: string; index: number }) {
  const bg = COVER_PALETTE[index % COVER_PALETTE.length];
  // 取首 2-4 字符做封面文字(去掉空格 / 标点)
  const initials = name
    .replace(/[^a-zA-Z一-龥]/g, '')
    .slice(0, 4)
    .toUpperCase();
  return (
    <div
      className={cn(
        'shrink-0 inline-flex items-center justify-center w-11 h-14 rounded-sm border border-black/15 text-background font-display font-bold text-md',
        bg
      )}
    >
      {initials}
    </div>
  );
}

// ===========================================================================
// helpers
// ===========================================================================

function SectionHeader({ children }: { children: ReactNode }) {
  return (
    <div className="px-5 py-1.5 text-xs font-semibold text-faint">{children}</div>
  );
}

/**
 * 在 text 中找到 query 首次出现的位置并加粗(大小写不敏感)。
 * 对照 .pen `p1text`:命中 query 部分 bold/foreground,其余 regular/subtle。
 */
function highlightQuery(text: string, query: string): ReactNode {
  if (!query) return <span className="text-foreground">{text}</span>;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) {
    return <span className="text-subtle">{text}</span>;
  }
  const before = text.slice(0, idx);
  const hit = text.slice(idx, idx + query.length);
  const after = text.slice(idx + query.length);
  return (
    <>
      {before && <span className="text-subtle">{before}</span>}
      <span className="text-foreground font-semibold">{hit}</span>
      {after && <span className="text-subtle">{after}</span>}
    </>
  );
}

// ===========================================================================
// 到达顺序 —— 三源各自独立完成,谁先 resolve 谁的 papers/authors 先展示
// ===========================================================================

/**
 * 输入查询变化时清空 arrival,等新一轮源 resolve;每源返回后才入列。
 * 与 QuickAddDialog 的同名 hook 心智一致(两处都是 anchored 短期组件,
 * 各自一份小 hook 不必抽 shared)。
 *
 * 返回 papers/authors 已按 arrival 顺序铺好,组件可直接渲染。
 */
function useArrivalOrdered(
  sourceResults: SourceSuggestionResult[],
  query: string
): { papers: PaperSuggestion[]; authors: AuthorSuggestion[] } {
  const [arrival, setArrival] = useState<UpstreamSource[]>([]);

  useEffect(() => {
    setArrival([]);
  }, [query]);

  useEffect(() => {
    for (const r of sourceResults) {
      if (!r.isLoading) {
        setArrival((prev) =>
          prev.includes(r.source) ? prev : [...prev, r.source]
        );
      }
    }
  }, [sourceResults]);

  return useMemo(() => {
    const papers: PaperSuggestion[] = [];
    const authors: AuthorSuggestion[] = [];
    for (const src of arrival) {
      const r = sourceResults.find((x) => x.source === src);
      if (!r) continue;
      papers.push(...r.papers);
      authors.push(...r.authors);
    }
    return { papers, authors };
  }, [arrival, sourceResults]);
}
