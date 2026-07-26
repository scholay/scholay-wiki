import { useCallback, useEffect, useMemo, useState, lazy, Suspense } from 'react';
import { useAutoAnimate } from '@formkit/auto-animate/react';
import { Loader2, Search, SquarePen } from 'lucide-react';
import { EmptyState } from '@/shared/components/EmptyState';
import { useSmartSearchSessionStore } from '@/stores/smart-search-session.store';
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
import { cn } from '@/shared/lib/utils';
// 懒加载(性能审计 fe-bundle #1):智能面板整条闭包(chat barrel → MarkdownRenderer → katex/hljs/motion/
// agent-attach 等)此前被静态 import 连坐进 /search 首屏。渲染本就由 smartPanelOpened 门控(首次开智能模式才挂),
// 改 lazy 后其代码块也仅在首次进智能模式时下载;纯关键词搜索用户永不加载。挂载后保持(display 切换,不 unmount)。
const SmartSearchPanel = lazy(() =>
  import('./smart-search/SmartSearchPanel').then((m) => ({ default: m.SmartSearchPanel })),
);
import { SearcherPagination } from './SearcherPagination';
import { useSearcherUrlState } from '../hooks/useSearcherUrlState';

/**
 * 搜索器列(col1)—— .pen `Z7juDD`:
 *   c1Head(模式切换) + searchRow(输入+按钮) + countRow + resultsList + pagination
 *
 * filters 由父 SearchPage 持有(单一来源),变更 → 自动触发 useSearchPapers 重查。
 * stagedIds / collapsedIds 来自父 (workspace state),决定每张卡的视觉变体。
 * 输入提交 → setURLSearchParam('q'),自然触发重查 + URL 可分享。
 *
 * URL 状态(page/pageSize)+ filter-change reset 抽到 useSearcherUrlState;
 * 分页器 UI 抽到 SearcherPagination,本组件作 orchestrator + 主结构。
 */

export type SearchMode = 'classic' | 'smart';

interface SearcherColumnProps {
  filters: SearchFilters;
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
  stagedIds,
  collapsedIds,
  onStage,
  onUnstage,
  onCollapse,
  onRestore,
  mode,
  onModeChange,
}: SearcherColumnProps) {
  const { params, setParams, page, setPage, pageSize, setPageSize } =
    useSearcherUrlState(filters);
  const queryFromUrl = params.get('q') ?? '';
  const [input, setInput] = useState(queryFromUrl);

  // 智能模式「新对话」按钮 —— activeSessionId 收在 store(SmartSearchPanel / SearchSidebar 消费),
  // 这里只发起「置空 = 空白新对话」;busy(回答中)时禁用避免打断当前生成。
  const activeSessionId = useSmartSearchSessionStore((s) => s.activeSessionId);
  const smartBusy = useSmartSearchSessionStore((s) => s.busy);
  const setActiveSessionId = useSmartSearchSessionStore((s) => s.setActiveSessionId);

  // 智能 panel 是否曾经被打开过 —— 一旦 true 就保持 mount, 模式切换只用 display:none
  // 隐藏。这样:
  //   - 切到传统再切回, WS 不会被 unmount cleanup 强关, AI 流式回答不中断
  //   - messages / pendingTurns / input 等 panel 局部 state 全部保留
  //   - 从未点过"智能"的用户不会被预先打开 WS (lazy first-mount)
  // 历史 bug: 之前用 `{mode === 'smart' && <Panel />}` 模式切换会 unmount,
  // useSmartSearchSocket 的 cleanup 关 WS, 局部 state 清零;
  // useSmartSearchHistory 又 staleTime:Infinity 返回老快照, 所以"对话凭空消失,
  // 必须刷新页面才出来"。
  const [smartPanelOpened, setSmartPanelOpened] = useState(mode === 'smart');
  useEffect(() => {
    if (mode === 'smart') setSmartPanelOpened(true);
  }, [mode]);

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

  const submit = useCallback(
    (e?: React.FormEvent) => {
      e?.preventDefault();
      const q = input.trim();
      const next = new URLSearchParams(params);
      if (q) next.set('q', q);
      else next.delete('q');
      // 提交新关键词 → 强制回第 1 页(避免新词 + 旧 offset 翻到空页)
      next.delete('p');
      setParams(next, { replace: true });
    },
    [input, params, setParams]
  );

  // 总页数封顶:上游 total 再大也只翻到 1000 条对应的最大页(20/页 = 50 页 / 50/页 = 20 页)
  const cappedTotal = Math.min(total, MAX_RESULTS);
  const totalPages = Math.max(1, Math.ceil(cappedTotal / pageSize));

  return (
    <div className="flex flex-col h-full min-h-0 bg-background">
      {/* c1Head — 56h header */}
      <header className="flex items-center gap-2 h-14 px-4 border-b border-border shrink-0">
        <div className="flex items-center gap-2.5">
          <Search className="size-4 text-brand-red" strokeWidth={2.5} />
          <span className="text-16 font-medium text-foreground">搜索器</span>
          {/* modeSwitch — 24h rounded-pill,active 红底白字 */}
          <div className="ml-2 inline-flex items-center h-6 rounded-pill bg-surface-2 p-0.5">
            <button
              type="button"
              onClick={() => onModeChange('classic')}
              className={cn(
                'inline-flex items-center justify-center h-5 px-2.5 rounded-pill text-12 font-medium transition-colors',
                mode === 'classic'
                  ? 'bg-brand-red text-on-brand'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              传统
            </button>
            <button
              type="button"
              onClick={() => onModeChange('smart')}
              className={cn(
                'inline-flex items-center justify-center h-5 px-2.5 rounded-pill text-12 font-medium transition-colors',
                mode === 'smart'
                  ? 'bg-brand-red text-on-brand'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              智能
            </button>
          </div>
        </div>

        {/* 智能模式:顶部右侧「新对话」按钮 —— 置空 activeSessionId 回到空白态(会话历史在左侧栏)。
            busy(回答中)或已在空白新对话时禁用。 */}
        {mode === 'smart' && (
          <button
            type="button"
            onClick={() => setActiveSessionId(null)}
            disabled={smartBusy || activeSessionId === null}
            title={
              smartBusy
                ? '回答中,请稍候'
                : activeSessionId === null
                  ? '已是新对话'
                  : '开始新对话'
            }
            className="ml-auto inline-flex items-center gap-1.5 h-7 px-2.5 rounded-pill border border-border-button text-12 font-medium text-subtle transition-colors hover:bg-surface-1 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
          >
            <SquarePen className="size-3.5" strokeWidth={2} />
            新对话
          </button>
        )}
      </header>

      {/* 智能模式 —— 通过 WS 桥接 scholar_agent 的对话式检索面板。
          首次打开后保持 mount, 模式切换走 display:none 隐藏 (见上面 smartPanelOpened
          注释), 避免 WS 断开 + 对话状态丢失。
          外层用 display:contents 让 panel 在 smart 模式下完全等价于原先的"直接子元素",
          不影响 flex 布局; hidden (display:none) 隐藏时不参与布局也不渲染。 */}
      {smartPanelOpened && (
        <div className={mode === 'smart' ? 'contents' : 'hidden'}>
          <Suspense fallback={null}>
            <SmartSearchPanel />
          </Suspense>
        </div>
      )}
      {mode === 'classic' && (
        <>
          {/* searchRow — 输入 + 红色搜索按钮 */}
          <form
            onSubmit={submit}
            className="flex items-center gap-2 px-4 pt-3.5 pb-2 shrink-0"
          >
            <div className="flex items-center gap-2 flex-1 h-9 px-3 rounded-8 border border-border-strong bg-surface-card focus-within:border-foreground focus-within:ring-2 focus-within:ring-ring transition-colors">
              <Search className="size-3.5 text-faint" />
              <input
                type="search"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="输入关键词,如 机器学习可解释性"
                className="flex-1 h-full bg-transparent text-14 outline-none placeholder:text-faint"
              />
            </div>
            <button
              type="submit"
              className="inline-flex h-9 w-[72px] items-center justify-center rounded-8 bg-destructive text-destructive-foreground text-14 font-medium hover:bg-destructive/90 transition-colors"
            >
              搜索
            </button>
          </form>

          {/* countRow —— 设计稿 12px = text-12。
              loading 中**故意留空**(不写"检索中…"):蒙层 loading 已经表达了正在查的语义,
              再叠一句文字会闪;只在出结果后写"找到 N 篇"。 */}
          {query && !showLoading && (
            <div className="px-4 pt-1 pb-2 text-12 text-subtle shrink-0">
              找到 {total.toLocaleString()} 篇相关文献
            </div>
          )}

          {/* resultsList —— 蒙层 loading:
              query/filter 变化时去掉了 placeholderData,papers 即为空数组(EmptyState
              不显示因为 showLoading=true,统一靠蒙层覆盖)。
              蒙层 absolute 在 results 容器上,bg-surface-card/70 + 中心 spinner。 */}
          <div className="flex-1 min-h-0 overflow-auto relative">
            {!query && (
              <EmptyState
                icon={Search}
                title="试试搜点什么"
                description="在上面的输入框输入关键词,马上就能看到结果"
              />
            )}
            {query && !showLoading && papers.length === 0 && (
              <EmptyState
                icon={Search}
                title="没找到相关论文"
                description={`没有匹配 "${query}" 的内容,换个关键词或者切换数据源再试试`}
              />
            )}
            {papers.length > 0 && (
              <div ref={listRef}>
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

            {/* 蒙层 loading —— absolute 覆盖整个 results 区域 */}
            {showLoading && (
              <div
                className="absolute inset-0 z-raised flex items-center justify-center bg-surface-card/70 backdrop-blur-[1px]"
                aria-live="polite"
                aria-busy="true"
              >
                <div className="flex flex-col items-center gap-3 text-faint">
                  <Loader2 className="size-6 animate-spin text-brand-red" strokeWidth={2.2} />
                  <span className="text-12">检索中…</span>
                </div>
              </div>
            )}
          </div>

          {/* pagination —— loading 中也允许显示翻页(用 disabled 状态防误触),
              避免页面在 loading 时"塌缩"导致 layout 抖动。
              有结果即显:用户可以切换 pageSize(20/50);只有 1 页且 ≤ 单页数量时也保留以便切 pageSize */}
          {query && total > 0 && (
            <SearcherPagination
              page={page}
              totalPages={totalPages}
              pageSize={pageSize}
              onChange={setPage}
              onPageSizeChange={setPageSize}
            />
          )}
        </>
      )}
    </div>
  );
}
