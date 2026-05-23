import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Loader2, Search } from 'lucide-react';
import { EmptyState } from '@/shared/components/EmptyState';
import { extractPapers, useSearchPapers, type Paper } from '../api/papers';
import { useFavoriteCheck } from '../api/library';
import { useJournalEnrichments } from '@/shared/api/journal-enrichment';
import {
  exposeAuthors,
  exposePapers,
  extractAuthorsFromPapers,
} from '@/shared/api/seo';
import { useSearchVisiblePapers } from '@/stores/search-visible-papers.store';
import { PaperResultCard } from './PaperResultCard';
import { resolveYearRange, type SearchFilters } from '../types';
import { cn } from '@/shared/lib/utils';
import { SmartSearchPreview } from './SmartSearchPreview';

/**
 * 搜索器列(col1)—— .pen `Z7juDD`:
 *   c1Head(模式切换) + searchRow(输入+按钮) + countRow + resultsList + pagination
 *
 * filters 由父 SearchPage 持有(单一来源),变更 → 自动触发 useSearchPapers 重查。
 * stagedIds / collapsedIds 来自父 (workspace state),决定每张卡的视觉变体。
 * 输入提交 → setURLSearchParam('q'),自然触发重查 + URL 可分享。
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
 * 分页配置 —— 上游搜索结果普遍噪音大,且深翻到几百页之后相关性低,
 * 限制最多翻 1000 条(覆盖 99% 的实际用例);剩下的让用户改关键词 / 加筛选。
 */
const PAGE_SIZE_OPTIONS = [20, 50] as const;
const DEFAULT_PAGE_SIZE = 20;
const MAX_RESULTS = 1000;
type PageSize = (typeof PAGE_SIZE_OPTIONS)[number];

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
  const [params, setParams] = useSearchParams();
  const queryFromUrl = params.get('q') ?? '';
  const [input, setInput] = useState(queryFromUrl);

  // URL `q` 变化时同步到输入框 —— 持久化恢复 / 浏览器后退 / 外部 navigate
  // 都会改 URL,但 useState 只在首次挂载读 URL,导致输入框跟搜索结果不同步。
  // 用户敲字时 URL 不变,这里不会反向覆写输入。
  useEffect(() => {
    setInput(queryFromUrl);
  }, [queryFromUrl]);

  // page / pageSize 也走 URL —— 之前用 useState,从详情页"返回"时
  // SearcherColumn 重新挂载,page 退回 1,翻到第 5 页再点详情返回会跳回首页。
  // 现在 page=URL 的真相,returnTo 拿到的 URL 就完整还原 page+pageSize。
  // URL 形式:`?...&p=3&ps=50`(p=1 / ps=20 默认值省略,保持 URL 短)
  const pageSize = useMemo<PageSize>(() => {
    const raw = Number(params.get('ps'));
    return PAGE_SIZE_OPTIONS.includes(raw as PageSize)
      ? (raw as PageSize)
      : DEFAULT_PAGE_SIZE;
  }, [params]);
  const page = useMemo(() => {
    const raw = Number(params.get('p'));
    return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 1;
  }, [params]);

  const setPage = useCallback(
    (p: number) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (p > 1) next.set('p', String(p));
          else next.delete('p');
          return next;
        },
        { replace: false }
      );
    },
    [setParams]
  );

  const setPageSize = useCallback(
    (size: PageSize) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (size !== DEFAULT_PAGE_SIZE) next.set('ps', String(size));
          else next.delete('ps');
          // 改 pageSize 一定回第 1 页(旧 offset 在新尺寸下意义已变)
          next.delete('p');
          return next;
        },
        { replace: false }
      );
    },
    [setParams]
  );

  const query = queryFromUrl;
  const offset = (page - 1) * pageSize;

  // filters 变化时回到第 1 页(避免新筛选条件 + 旧 offset 翻到空页)。
  //
  // **重要**:`useUrlFilters` 每次 URL 变化都返回**新对象 + 新数组**(decode 重做),
  // 哪怕内容相同。直接把 `filters.venues` 等数组放 dep 数组里,翻页改 `?p=2`
  // 也会触发本 effect → 清掉 `p`,造成"分页失灵"。这里把数组拼成字符串作 dep,
  // 数组内容真变才触发。
  const venuesKey = filters.venues.join(',');
  const subjectsKey = filters.subjects.join(',');
  const typesKey = filters.publicationTypes.join(',');
  // 跳过首次挂载 —— 首次进 /search?q=xxx&p=3 或持久化恢复时,filters 才"第一次"
  // 出现,但这不算"用户改了 filter",不应清掉 p。仅当 filter 真的从一个值变到另一个值
  // 才回第 1 页。
  const filtersChangedOnceRef = useRef(false);
  useEffect(() => {
    if (!filtersChangedOnceRef.current) {
      filtersChangedOnceRef.current = true;
      return;
    }
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (next.has('p')) {
          next.delete('p');
          return next;
        }
        return prev;
      },
      { replace: true }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    filters.source,
    filters.timeRange,
    filters.yearFrom,
    filters.yearTo,
    venuesKey,
    subjectsKey,
    typesKey,
    filters.openAccess,
    filters.minCitations,
    filters.sort,
  ]);

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
  const favQ = useFavoriteCheck(filters.source, pageIds);
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
          <span className="text-15 font-bold text-foreground">搜索器</span>
          {/* modeSwitch — 24h rounded-pill,active 红底白字 */}
          <div className="ml-2 inline-flex items-center h-6 rounded-pill bg-surface-2 p-0.5">
            <button
              type="button"
              onClick={() => onModeChange('classic')}
              className={cn(
                'inline-flex items-center justify-center h-5 px-2.5 rounded-pill text-2xs font-bold transition-colors',
                mode === 'classic'
                  ? 'bg-brand-red text-white'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              传统
            </button>
            <button
              type="button"
              onClick={() => onModeChange('smart')}
              className={cn(
                'relative inline-flex items-center justify-center h-5 px-2.5 rounded-pill text-2xs font-bold transition-colors',
                mode === 'smart'
                  ? 'bg-brand-red text-white'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              智能
              {/* 即将推出 气泡 —— 绑在 智能 按钮右上角,任何模式下都展示,提示功能未上线 */}
              <span
                aria-hidden="true"
                className="absolute -top-2 -right-3 inline-flex items-center h-3.5 px-1 rounded-pill bg-brand-amber text-background text-[9px] font-bold leading-none whitespace-nowrap shadow-sm"
              >
                即将推出
              </span>
            </button>
          </div>
        </div>
      </header>

      {/* 智能模式 —— 整块换成假预览,直接 return,不再渲染搜索框/结果/分页 */}
      {mode === 'smart' && <SmartSearchPreview />}
      {mode === 'classic' && (
      <>
      {/* searchRow — 输入 + 红色搜索按钮 */}
      <form
        onSubmit={submit}
        className="flex items-center gap-2 px-4 pt-3.5 pb-2 shrink-0"
      >
        <div className="flex items-center gap-2 flex-1 h-9 px-3 rounded-sm border border-border-strong bg-background focus-within:border-foreground focus-within:ring-2 focus-within:ring-ring/20 transition-colors">
          <Search className="size-3.5 text-faint" />
          <input
            type="search"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="输入关键词,如 机器学习可解释性"
            className="flex-1 h-full bg-transparent text-base outline-none placeholder:text-faint"
          />
        </div>
        <button
          type="submit"
          className="inline-flex h-9 w-[72px] items-center justify-center rounded-sm bg-destructive text-destructive-foreground text-base font-bold hover:bg-destructive/90 transition-colors"
        >
          搜索
        </button>
      </form>

      {/* countRow —— 设计稿 12px = text-sm。
          loading 中**故意留空**(不写"检索中…"):蒙层 loading 已经表达了正在查的语义,
          再叠一句文字会闪;只在出结果后写"找到 N 篇"。 */}
      {query && !showLoading && (
        <div className="px-4 pt-1 pb-2 text-sm text-subtle shrink-0">
          找到 {total.toLocaleString()} 篇相关文献
        </div>
      )}

      {/* resultsList —— 蒙层 loading:
          query/filter 变化时去掉了 placeholderData,papers 即为空数组(EmptyState
          不显示因为 showLoading=true,统一靠蒙层覆盖)。
          蒙层 absolute 在 results 容器上,bg-background/70 + 中心 spinner。 */}
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
          <div>
            {papers.map((p) => (
              <PaperResultCard
                key={p.paperId}
                paper={p}
                stagedIds={stagedIds}
                collapsedIds={collapsedIds}
                favoritedIds={favoritedIds}
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

        {/* 蒙层 loading —— absolute 覆盖整个 results 区域,半透明背景 + 中心 spinner.
            会盖在 papers 列表或空状态之上,任何"重查"过程都看到统一的视觉。 */}
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

      {/* pagination —— loading 中也允许显示翻页(用 disabled 状态防误触),
          避免页面在 loading 时"塌缩"导致 layout 抖动。
          有结果即显:用户可以切换 pageSize(20/50);只有 1 页且 ≤ 单页数量时也保留以便切 pageSize */}
      {query && total > 0 && (
        <Pagination
          page={page}
          totalPages={totalPages}
          pageSize={pageSize}
          onChange={(p) => setPage(p)}
          onPageSizeChange={setPageSize}
        />
      )}
      </>
      )}
    </div>
  );
}

// ===========================================================================
// Pagination
// ===========================================================================

function Pagination({
  page,
  totalPages,
  pageSize,
  onChange,
  onPageSizeChange,
}: {
  page: number;
  totalPages: number;
  pageSize: PageSize;
  onChange: (page: number) => void;
  onPageSizeChange: (size: PageSize) => void;
}) {
  // 显示策略:1 (active) 2 3 ... last,如果在中段则 ... current-1 current current+1 ...
  const pages = computePages(page, totalPages);
  return (
    <nav
      aria-label="分页"
      // 响应式 3-cell grid:页码居中始终可见,两侧自然撑开,从不挤压页码。
      // 列宽 `[1fr_auto_1fr]` —— 页码 auto 取自然宽度优先,左右各占一半余量;
      // 不再用 justify-between + 右侧 88px 占位(那种做法在 ≤380px 容器宽度下
      // 会把 pageSize pill 列压窄,导致两颗胶囊重叠成右图那样)。
      className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 h-10 px-3 border-t border-border bg-surface-1 shrink-0"
    >
      {/* 左:pageSize 切换 —— 仅 20 / 50 两档,shrink-0 防被 grid 压扁
          justify-self-start 让 pill 列贴左,不被 1fr 列拉伸 */}
      <div className="justify-self-start inline-flex shrink-0 items-center gap-0.5 rounded-pill bg-background border border-border p-0.5">
        {PAGE_SIZE_OPTIONS.map((sz) => (
          <button
            key={sz}
            type="button"
            onClick={() => onPageSizeChange(sz)}
            aria-pressed={pageSize === sz}
            className={cn(
              'inline-flex items-center justify-center h-5 px-2 rounded-pill text-2xs font-bold transition-colors whitespace-nowrap',
              pageSize === sz
                ? 'bg-foreground text-background'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {sz}/页
          </button>
        ))}
      </div>

      {/* 中:页码 —— shrink-0 + justify-self-center,优先级最高,不被压缩
          ‹ 1 2 3 … 50 › 紧贴排列,无论容器多窄都完整可见 */}
      <div className="justify-self-center flex shrink-0 items-center gap-1.5">
        <button
          type="button"
          aria-label="上一页"
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
          className="inline-flex h-6 w-6 items-center justify-center text-faint hover:text-foreground disabled:opacity-30 disabled:hover:text-faint"
        >
          ‹
        </button>
        {pages.map((p, i) =>
          p === '...' ? (
            <span
              key={`dot-${i}`}
              className="inline-flex h-6 w-6 items-center justify-center text-faint text-xs"
            >
              …
            </span>
          ) : (
            <button
              key={p}
              type="button"
              onClick={() => onChange(p)}
              className={cn(
                'inline-flex h-6 min-w-6 items-center justify-center rounded-sm px-1.5 text-xs font-semibold transition-colors',
                p === page
                  ? 'bg-destructive text-white'
                  : 'text-muted-foreground hover:bg-surface-2 hover:text-foreground'
              )}
            >
              {p}
            </button>
          )
        )}
        <button
          type="button"
          aria-label="下一页"
          disabled={page >= totalPages}
          onClick={() => onChange(page + 1)}
          className="inline-flex h-6 w-6 items-center justify-center text-faint hover:text-foreground disabled:opacity-30 disabled:hover:text-faint"
        >
          ›
        </button>
      </div>

      {/* 右:利用空位放"共 X 页",窄屏自动 hidden md:flex 防止挤压页码 */}
      <span className="justify-self-end hidden md:inline-flex shrink-0 text-2xs text-faint tabular-nums whitespace-nowrap">
        共 {totalPages} 页
      </span>
    </nav>
  );
}

function computePages(current: number, total: number): (number | '...')[] {
  if (total <= 5) return Array.from({ length: total }, (_, i) => i + 1);
  if (current <= 3) return [1, 2, 3, '...', total];
  if (current >= total - 2) return [1, '...', total - 2, total - 1, total];
  return [1, '...', current - 1, current, current + 1, '...', total];
}
