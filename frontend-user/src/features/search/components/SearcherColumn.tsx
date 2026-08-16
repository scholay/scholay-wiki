import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  lazy,
  Suspense,
} from 'react';
import { useAutoAnimate } from '@formkit/auto-animate/react';
import { useReducedMotion } from 'framer-motion';
import { Loader2, Search } from 'lucide-react';
import { toast } from 'sonner';
import { EmptyState } from '@/shared/components/EmptyState';
import { SearchAutocomplete } from '@/shared/components/SearchAutocomplete';
import { cn } from '@/shared/lib/utils';
import { extractPapers, useSearchPapers, type Paper, type UpstreamSource } from '../api/papers';
import { useFavoriteCheck } from '../api/library';
import { useJournalEnrichments } from '@/shared/api/journal-enrichment';
import {
  exposeAuthors,
  exposePapers,
  extractAuthorsFromPapers,
} from '@/shared/api/seo';
import { useSearchVisiblePapers } from '@/stores/search-visible-papers.store';
import { PaperResultCard } from '@/shared/components/PaperResultCard';
import { resolveYearRange, type SearchFilters } from '../types';
// 懒加载(性能审计 fe-bundle #1):智能面板整条闭包(chat barrel → MarkdownRenderer → katex/hljs/motion/
// agent-attach 等)此前被静态 import 连坐进 /search 首屏。渲染本就由 smartPanelOpened 门控(首次开智能模式才挂),
// 改 lazy 后其代码块也仅在首次进智能模式时下载;纯关键词搜索用户永不加载。挂载后保持(display 切换,不 unmount)。
const SmartSearchPanel = lazy(() =>
  import('./smart-search/SmartSearchPanel').then((m) => ({ default: m.SmartSearchPanel })),
);
import { SearchLanding } from './SearchLanding';
import { SearcherPagination } from './SearcherPagination';
import { SearchFiltersButton } from './SearchFiltersFloating';
import { useStagingActions } from '../hooks/useStagingActions';
import { useSearcherUrlState } from '../hooks/useSearcherUrlState';
import type { SearchMode } from '../search-mode';

/** 切走智能模式时多留一帧,让 composer 退场后再 hidden */
const INPUT_SWAP_MS = 320;

export type { SearchMode } from '../search-mode';

/**
 * 搜索器列(col1):
 *   resultsList + pagination + 模式切换/搜索框
 *   有检索结果时:分页在上、输入区固定在最底部。
 *
 * filters 由父 SearchPage 持有(单一来源),变更 → 自动触发 useSearchPapers 重查。
 * stagedIds / collapsedIds 来自父 (workspace state),决定每张卡的视觉变体。
 * 输入提交 → setURLSearchParam('q'),自然触发重查 + URL 可分享。
 *
 * URL 状态(page/pageSize)+ filter-change reset 抽到 useSearcherUrlState;
 * 分页器 UI 抽到 SearcherPagination,本组件作 orchestrator + 主结构。
 */

interface SearcherColumnProps {
  filters: SearchFilters;
  onFiltersChange: (next: SearchFilters) => void;
  stagedIds: Set<string>;
  collapsedIds: Set<string>;
  onStage: (p: Paper) => void;
  onUnstage: (id: string) => void;
  /** staged 行点 ⌄ —— 进一步折叠成 collapsed 灰行 */
  onCollapse: (id: string) => void;
  /** collapsed 行点 "还原" —— 取消主动折叠 */
  onRestore: (id: string) => void;
  mode: SearchMode;
  onModeChange: (m: SearchMode) => void;
  /** 已进入非首页工作区:无 q / 无对话时也不回落落地页 */
  workspacePinned?: boolean;
}

/**
 * 上游搜索结果普遍噪音大,深翻到几百页之后相关性低,
 * 限制最多翻 1000 条(覆盖 99% 实际用例);剩下让用户改关键词 / 加筛选。
 */
const MAX_RESULTS = 1000;

/** 共享空 Set 单例 —— fav 查询未返回 / 未登录时用,避免每次 re-render 新建 Set 让卡 memo 失效 */
const EMPTY_SET: ReadonlySet<string> = new Set();

export function SearcherColumn({
  filters,
  onFiltersChange,
  stagedIds,
  collapsedIds,
  onStage,
  onUnstage,
  onCollapse,
  onRestore,
  mode,
  onModeChange,
  workspacePinned = false,
}: SearcherColumnProps) {
  const { params, setParams, page, setPage, pageSize, setPageSize } =
    useSearcherUrlState(filters);
  const queryFromUrl = params.get('q') ?? '';
  const [input, setInput] = useState(queryFromUrl);

  // 智能 panel 是否曾经被打开过 —— 一旦 true 就保持 mount, 模式切换只用 display:none
  // 隐藏。这样:
  //   - 切到传统再切回, WS 不会被 unmount cleanup 强关, AI 流式回答不中断
  //   - messages / pendingTurns / input 等 panel 局部 state 全部保留
  //   - 从未点过"智能"的用户不会被预先打开 WS (lazy first-mount)
  // 历史 bug: 之前用 `{mode === 'smart' && <Panel />}` 模式切换会 unmount,
  // useSmartSearchSocket 的 cleanup 关 WS, 局部 state 清零;
  // useSmartSearchHistory 又 staleTime:Infinity 返回老快照, 所以"对话凭空消失,
  // 必须刷新页面才出来"。
  const reduceMotion = useReducedMotion();
  const swapMs = reduceMotion ? 0 : INPUT_SWAP_MS;

  const [smartPanelOpened, setSmartPanelOpened] = useState(mode === 'smart');
  // 离开智能模式时多留一帧挂载,好让底部 composer 播完向上退场再 hidden。
  const [smartSlotOpen, setSmartSlotOpen] = useState(mode === 'smart');
  useEffect(() => {
    if (mode === 'smart') setSmartPanelOpened(true);
  }, [mode]);
  useEffect(() => {
    if (mode === 'smart') {
      setSmartSlotOpen(true);
      return;
    }
    const t = window.setTimeout(() => setSmartSlotOpen(false), swapMs);
    return () => window.clearTimeout(t);
  }, [mode, swapMs]);

  // URL `q` 变化时同步到输入框 —— 持久化恢复 / 浏览器后退 / 外部 navigate
  // 都会改 URL,但 useState 只在首次挂载读 URL,导致输入框跟搜索结果不同步。
  // 用户敲字时 URL 不变,这里不会反向覆写输入。
  useEffect(() => {
    setInput(queryFromUrl);
  }, [queryFromUrl]);

  const query = queryFromUrl;
  const offset = (page - 1) * pageSize;

  const { yearFrom, yearTo } = resolveYearRange(filters);
  const papersQ = useSearchPapers({
    query,
    limit: pageSize,
    offset,
    source: filters.source,
    yearFrom,
    yearTo,
    venue: filters.venues.length > 0 ? filters.venues : undefined,
    fieldsOfStudy: filters.subjects.length > 0 ? filters.subjects : undefined,
    publicationTypes:
      filters.publicationTypes.length > 0 ? filters.publicationTypes : undefined,
    openAccessPdf: filters.openAccess ? 'true' : undefined,
    minCitationCount:
      filters.minCitations != null && filters.minCitations > 0
        ? filters.minCitations
        : undefined,
    sort: filters.sort,
  });
  // 蒙层 loading 触发条件:首查 + 任何 query/filter/page 变化引发的 refetch
  const showLoading = !!query && papersQ.isFetching;
  const { papers, total } = useMemo(() => extractPapers(papersQ.data), [papersQ.data]);

  // 把当前页 papers 同步到 ephemeral store —— 让"工作区空态 CTA"(EmptyImportButton)
  // 能直接读取做"一键导入",不必把 papers 一路 prop 钻穿父级。
  //
  // **故意不在 cleanup 时清空**:React 在 papers 变化时会先跑 cleanup 再跑新 effect,
  // 中间有 setVisiblePapers([]) 的一帧;如果用户正在那一刻点 EmptyImportButton,
  // 会读到空数组(只导入 0 篇,bug)。只 set(papers),不主动 clear,保证读取一致性。
  // SearcherColumn 在 SearchPage 内常驻挂载,不会卸载到孤儿态。
  const setVisiblePapers = useSearchVisiblePapers((s) => s.setPapers);
  useEffect(() => {
    setVisiblePapers(papers);
  }, [papers, setVisiblePapers]);

  // SEO tier=2 长尾种子: papers 落定后批量曝光 papers + 去重的作者 (mirror 旧前端
  // useSearchState 的合并 expose 逻辑)。sendBeacon, best-effort, 不阻塞。
  // 依赖 [papers] 即可: react-query 缓存命中时 items 是同一引用, 不重复 POST。
  useEffect(() => {
    if (papers.length === 0) return;
    exposePapers(papers);
    const authors = extractAuthorsFromPapers(papers);
    if (authors.length > 0) exposeAuthors(authors);
  }, [papers]);

  // 当前页所有 paperId,批量查"哪些已收藏",卡片用稳定的 Set 判断
  // 引用稳定化:papers 变化才重算,memo 后避免每次父级 re-render 都重建 Set
  const pageIds = useMemo(() => papers.map((p) => p.paperId), [papers]);
  // 论文卡列表容器:暂存/折叠时卡片在「完整卡 ↔ 折叠行」间高度突变,
  // auto-animate 让高度收合 + 下方卡片上移平滑过渡,不生硬。
  const [listRef] = useAutoAnimate<HTMLDivElement>();
  // 收藏批查按「结果实际所属源」(综合/auto 会落到某个具体源,结果同源);
  // filters.source 可能是 'auto',不能直接用。
  const effectiveSource = (papers[0]?.source ?? 'stc') as UpstreamSource;
  const favQ = useFavoriteCheck(effectiveSource, pageIds);
  const favoritedIds = favQ.data ?? EMPTY_SET;

  // 当前页所有 venue,批量去后端要 JCR/IF/CCF/中科院 等增强信息(命中过的不重发)
  const pageVenues = useMemo(
    () =>
      Array.from(
        new Set(
          papers.map((p) => p.venue?.trim()).filter((v): v is string => !!v)
        )
      ),
    [papers]
  );
  const journalEnrichments = useJournalEnrichments(pageVenues);

  const { bulkStagePapers } = useStagingActions();
  const unstagedOnPage = useMemo(
    () => papers.filter((p) => !stagedIds.has(p.paperId)).length,
    [papers, stagedIds],
  );
  const allStagedOnPage = papers.length > 0 && unstagedOnPage === 0;
  const someStagedOnPage = papers.some((p) => stagedIds.has(p.paperId));
  const selectAllIndeterminate = someStagedOnPage && !allStagedOnPage;
  const [selectAllBusy, setSelectAllBusy] = useState(false);
  const handleSelectAllChange = useCallback(
    async (checked: boolean) => {
      if (selectAllBusy || papers.length === 0) return;
      setSelectAllBusy(true);
      try {
        if (checked) {
          if (unstagedOnPage === 0) return;
          const source = mode === 'smart' ? 'smart' : 'traditional';
          const { added, skipped, capped } = await bulkStagePapers(papers, source);
          const parts: string[] = [];
          if (added > 0) parts.push(`已暂存 ${added} 篇`);
          if (skipped > 0) parts.push(`${skipped} 篇已在暂存区`);
          if (capped > 0) parts.push(`${capped} 篇因暂存区已满未加入`);
          if (parts.length === 0) {
            toast.info('本页结果已全部在暂存区');
          } else {
            const total = added + skipped + capped;
            const isWarn = added === 0 && total > 0;
            if (isWarn) toast.info(parts.join(', '));
            else toast.success(parts.join(', '));
          }
        } else {
          for (const p of papers) {
            if (stagedIds.has(p.paperId)) onUnstage(p.paperId);
          }
        }
      } catch (err) {
        toast.error(`批量暂存失败:${(err as Error).message}`);
      } finally {
        setSelectAllBusy(false);
      }
    },
    [
      selectAllBusy,
      papers,
      unstagedOnPage,
      bulkStagePapers,
      mode,
      stagedIds,
      onUnstage,
    ],
  );

  const submitQuery = useCallback(
    (q: string) => {
      const trimmed = q.trim();
      if (!trimmed) return;
      setInput(trimmed);
      const next = new URLSearchParams(params);
      next.set('q', trimmed);
      next.delete('p');
      next.delete('mode');
      setParams(next, { replace: true });
    },
    [params, setParams]
  );

  /** 清空检索内容(关键词 / 结果 / 筛选),保留工作区壳与右侧拓展栏。 */
  const clearContent = useCallback(() => {
    setInput('');
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('q');
        next.delete('p');
        for (const key of [
          'src',
          'tr',
          'yf',
          'yt',
          'ven',
          'sub',
          'pt',
          'oa',
          'mc',
          's',
        ] as const) {
          next.delete(key);
        }
        return next;
      },
      { replace: true },
    );
  }, [setParams]);

  const showClassicLanding = mode === 'classic' && !query && !workspacePinned;

  // 总页数封顶:上游 total 再大也只翻到 1000 条对应的最大页(20/页 = 50 页 / 50/页 = 20 页)
  const cappedTotal = Math.min(total, MAX_RESULTS);
  const totalPages = Math.max(1, Math.ceil(cappedTotal / pageSize));

  // 与结果列表同宽同边距,底栏/分页不横向贯穿主列。
  const resultsColClass = 'w-full max-w-3xl pl-5 pr-3';

  const showClassicQueryDock =
    mode === 'classic' && !showClassicLanding && Boolean(query);

  const resultsScrollRef = useRef<HTMLDivElement>(null);

  // 与首页 SearchAutocomplete 同壳:h-12 + 内嵌智能搜索开关。
  const renderClassicInputDock = (suggestionsPlacement: 'below' | 'above' = 'below') => (
    <SearchAutocomplete
      className="max-w-none"
      appearance="literature"
      suggestionsPlacement={suggestionsPlacement}
      value={input}
      onChange={setInput}
      onSubmit={(q) => {
        const trimmed = q.trim();
        setInput(trimmed);
        const next = new URLSearchParams(params);
        if (trimmed) next.set('q', trimmed);
        else next.delete('q');
        next.delete('p');
        setParams(next, { replace: true });
      }}
      placeholder="输入关键词,如 机器学习可解释性"
      smartToggle={{
        checked: mode === 'smart',
        onCheckedChange: (on) => onModeChange(on ? 'smart' : 'classic'),
      }}
      trailingActions={
        query ? (
          <SearchFiltersButton
            filters={filters}
            onFiltersChange={onFiltersChange}
          />
        ) : null
      }
    />
  );

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden bg-background">
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
      {/* 智能模式 —— 保持 mount 以免掐 WS。切走时用 absolute 叠层多留 swapMs 播 composer 向上退场。
          有对话时会话条与 Composer 叠在 SmartSearchPanel 底部。 */}
      {smartPanelOpened && (
        <div
          className={cn(
            mode === 'smart'
              ? 'min-h-0 flex-1'
              : smartSlotOpen
                ? 'pointer-events-none absolute inset-0 z-30'
                : 'hidden',
          )}
        >
          <Suspense fallback={null}>
            <SmartSearchPanel
              mode={mode}
              onModeChange={onModeChange}
            />
          </Suspense>
        </div>
      )}
      {mode === 'classic' && showClassicLanding && (
        <SearchLanding
          mode={mode}
          onModeChange={onModeChange}
          onClassicSearch={submitQuery}
        />
      )}

      {mode === 'classic' && !showClassicLanding && (
        <>
          <div
            ref={resultsScrollRef}
            className="relative min-h-0 flex-1 overflow-auto"
          >
            {/* 无内容:Logo + 模式切换 + 搜索框居中(对齐首页 / 智能助手空态)。 */}
            {!query && (
              <SearchLanding
                mode={mode}
                onModeChange={onModeChange}
                onClassicSearch={submitQuery}
              />
            )}

            {query && !showLoading && papers.length === 0 && (
              <div className={resultsColClass}>
                <EmptyState
                  icon={Search}
                  title="没找到相关论文"
                  description={`没有匹配 "${query}" 的内容,换个关键词或者切换数据源再试试`}
                />
              </div>
            )}
            {papers.length > 0 && (
              // 结果卡限宽 + 左侧留缝、左对齐(不随主列拉满横向贯穿)。
              <div ref={listRef} className={cn(resultsColClass, 'pb-3')}>
                {papers.map((p) => (
                  <PaperResultCard
                    key={p.paperId}
                    paper={p}
                    isStaged={stagedIds.has(p.paperId)}
                    isFolded={collapsedIds.has(p.paperId)}
                    isFavorited={favoritedIds.has(p.paperId)}
                    journalEnrichment={
                      p.venue ? journalEnrichments[p.venue.trim()] : null
                    }
                    onStage={onStage}
                    onUnstage={onUnstage}
                    onCollapse={onCollapse}
                    onRestore={onRestore}
                    highlightQuery={query}
                  />
                ))}
              </div>
            )}

            {showLoading && (
              <div
                className="absolute inset-0 z-10 flex items-center justify-center bg-background/70 backdrop-blur-[1px]"
                aria-live="polite"
                aria-busy="true"
              >
                <div className="flex flex-col items-center gap-3 text-faint">
                  <Loader2 className="size-6 animate-spin text-brand-red" strokeWidth={2.2} />
                  <span className="text-sm">检索中…</span>
                </div>
              </div>
            )}
          </div>

          {query && total > 0 && (
            <div className={cn(resultsColClass, 'shrink-0 border-t border-border')}>
              <SearcherPagination
                page={page}
                totalPages={totalPages}
                totalResults={total}
                pageSize={pageSize}
                onChange={setPage}
                onPageSizeChange={setPageSize}
                onClear={clearContent}
                selectAll={{
                  checked: allStagedOnPage,
                  indeterminate: selectAllIndeterminate,
                  busy: selectAllBusy,
                  onCheckedChange: handleSelectAllChange,
                }}
              />
            </div>
          )}

          {showClassicQueryDock && (
            <div
              className={cn(
                resultsColClass,
                'shrink-0 border-t border-border bg-background pb-3 pt-2.5',
              )}
            >
              {renderClassicInputDock('above')}
            </div>
          )}
        </>
      )}
      </div>
    </div>
  );
}
