import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Loader2, Search, SlidersHorizontal, X } from 'lucide-react';
import { m } from 'framer-motion';
import type { Journal, Paper } from '@/shared/api/types';
import { CitationDialog } from '@/shared/components/CitationDialog';
import { useShareSheet } from '@/stores/share.store';
import { useJournalEnrichments } from '@/shared/api/journal-enrichment';
import {
  SOURCE_OPTIONS,
  sortOptionsForSource,
  type SearchFilters,
} from '@/shared/lib/search-filters';
import { useMobileSearchOverlay } from '@/stores/mobile-search.store';
import { usePullToRefresh } from '@/shared/hooks';
import { MobilePaperRow } from '@/shared/components/MobilePaperRow';
import { MobilePaperRowSkeletonList } from '@/shared/components/MobilePaperRowSkeleton';
import { PullToRefreshIndicator } from '@/shared/components/PullToRefreshIndicator';
import { SEARCH_FIELD_SHELL } from '@/shared/components/search-autocomplete/search-field';
import { cn } from '@/shared/lib/utils';
import { MobileJournalResultCard } from './MobileJournalResultCard';
import { MobileSearchFilterSheet } from './MobileSearchFilterSheet';
import {
  useMobilePaperSearch,
  flattenSearchPages,
  useMobileJournalSearch,
  flattenJournalSearchPages,
} from '../api/search';

/** 计当前生效(非默认)的筛选数,给「筛选」按钮上的红点角标。 */
function activeFilterCount(f: SearchFilters): number {
  return (
    (f.timeRange !== 'all' ? 1 : 0) +
    (f.openAccess ? 1 : 0) +
    (f.minCitations != null ? 1 : 0) +
    (f.sort !== 'relevance' ? 1 : 0) +
    f.subjects.length +
    f.publicationTypes.length +
    f.venues.length
  );
}

/**
 * 移动端「悬浮搜索」浮层 —— 覆盖在刷论文 / 刷期刊 feed 之上(feed 不卸载,滚动位置保留):
 *   - 顶部:搜索导航栏(输入框 autoFocus → 自动弹键盘)
 *   - 未搜索:下方是半透明蒙层,透出底下的 feed;**点蒙层即退出**,继续刷论文
 *   - 已搜索:下方换成瀑布流结果(双列 masonry),点卡片进详情 / 可分享
 *
 * 由 MobileShell 在 <AnimatePresence> 内仅 open 时挂载 → 进退场有淡入/上滑动效。
 * 每次打开都是全新挂载,input/query 自然复位,无需手动 reset。
 */
export function MobileSearchOverlay() {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  // 搜索态放 store(跨「进详情→返回」保留);仅瞬时 UI 态(分享/引用/筛选抽屉开关)留本地。
  const close = useMobileSearchOverlay((s) => s.closeSearch);
  const suspendForDetail = useMobileSearchOverlay((s) => s.suspendForDetail);
  const mode = useMobileSearchOverlay((s) => s.mode);
  const input = useMobileSearchOverlay((s) => s.input);
  const query = useMobileSearchOverlay((s) => s.query);
  const filters = useMobileSearchOverlay((s) => s.filters);
  const setInput = useMobileSearchOverlay((s) => s.setInput);
  const setQuery = useMobileSearchOverlay((s) => s.setQuery);
  const setFilters = useMobileSearchOverlay((s) => s.setFilters);
  const openShare = useShareSheet((s) => s.openShare);
  const [citePaper, setCitePaper] = useState<Paper | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const isPapers = mode === 'papers';

  // 论文 / 期刊两条搜索链路都按 hooks 规则无条件调用;非当前 mode 的传空 query → disabled。
  const paperQ = useMobilePaperSearch(isPapers ? query : '', filters);
  const journalQ = useMobileJournalSearch(isPapers ? '' : query);
  const papers = flattenSearchPages(paperQ.data?.pages);
  const journals = flattenJournalSearchPages(journalQ.data?.pages);
  const activeQ = isPapers ? paperQ : journalQ;
  const resultCount = isPapers ? papers.length : journals.length;

  // 收藏态:后端已在已登录的搜索响应里逐篇标注 paper.isFavorited(省掉额外 /library/check 往返)。
  // 本地 override 记录用户在结果里现场收藏/取消的翻转(无需重拉),优先于服务端初值。
  const [favOverrides, setFavOverrides] = useState<Map<string, boolean>>(() => new Map());
  const handleFavToggle = useCallback((id: string, fav: boolean) => {
    setFavOverrides((prev) => {
      const next = new Map(prev);
      next.set(id, fav);
      return next;
    });
  }, []);
  // 期刊增强批查:给论文结果卡显示 JCR/中科院/CCF/IF 徽章(与 PC 同口径)。
  const venueNames = useMemo(
    () => Array.from(new Set(papers.map((p) => p.venue).filter((v): v is string => !!v))),
    [papers],
  );
  const enrichments = useJournalEnrichments(venueNames);
  const activeCount = activeFilterCount(filters);
  const sortLabel =
    sortOptionsForSource(filters.source).find((o) => o.value === filters.sort)?.label ?? '相关度';
  const sourceLabel =
    SOURCE_OPTIONS.find((o) => o.value === filters.source)?.label ?? 'Graph';

  // 挂载时读 resume(从详情返回的恢复态):恢复滚动条 + 不抢焦点;否则全新打开 → 聚焦弹键盘。
  // 读后即清 resume。useLayoutEffect 在 paint 前定位滚动(结果已缓存同步渲染 → 无跳动)。
  const wasResumeRef = useRef(false);
  useLayoutEffect(() => {
    const st = useMobileSearchOverlay.getState();
    wasResumeRef.current = st.resume;
    if (st.resume && scrollRef.current) {
      scrollRef.current.scrollTop = st.scrollTop;
    }
    if (st.resume) useMobileSearchOverlay.setState({ resume: false });
    // 仅挂载一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (wasResumeRef.current) return; // 恢复态:不自动弹键盘
    // 同步聚焦(effect 跑时输入框已在 DOM):尽快从 primer 接管焦点,缩短 iOS 保活窗口,
    // 与其它 primed 站点(autoFocus,挂载 commit 时即聚焦)的时序对齐。不再多隔一帧 rAF。
    inputRef.current?.focus();
  }, []);

  // 列表虚拟化 —— 只挂载视口附近的行,避免无限下拉后 DOM 无上限堆积(低端机滚动卡顿)。
  // 行高不定(标题/摘要行数不一)→ measureElement 动态测量,estimateSize 仅作初值。
  const listCount = isPapers ? papers.length : journals.length;
  const rowVirtualizer = useVirtualizer({
    count: listCount,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => (isPapers ? 168 : 150),
    overscan: 6,
    getItemKey: (index) =>
      isPapers
        ? papers[index]
          ? `${papers[index].source}:${papers[index].paperId}`
          : index
        : (journals[index]?.id ?? index),
  });

  // 无限下拉:虚拟列表渲染到接近末尾(剩 ≤3 行)→ 取下一页(替代原 IntersectionObserver 哨兵)。
  const virtualRows = rowVirtualizer.getVirtualItems();
  useEffect(() => {
    const last = virtualRows[virtualRows.length - 1];
    if (last && last.index >= listCount - 3 && activeQ.hasNextPage && !activeQ.isFetchingNextPage) {
      void activeQ.fetchNextPage();
    }
  }, [virtualRows, listCount, activeQ.hasNextPage, activeQ.isFetchingNextPage, activeQ.fetchNextPage]);

  const submit = () => setQuery(input.trim());
  // 稳定回调(useCallback)—— 否则每次渲染都新建函数,使 memo 化的结果行全量重渲染。
  // 进详情前不关闭浮层:存滚动位置 + 标记 resume,返回 feed 时浮层复原结果与位置。
  // 论文行导航已由 MobilePaperRow 内的真实 <Link href> 承担(SEO 硬约束),
  // 这里只保留进详情前副作用:存滚动位置 + 标记 resume,返回 feed 时浮层复原。
  const beforeOpenPaper = useCallback(() => {
    suspendForDetail(scrollRef.current?.scrollTop ?? 0);
  }, [suspendForDetail]);
  const openJournal = useCallback(
    (j: Journal) => {
      suspendForDetail(scrollRef.current?.scrollTop ?? 0);
      navigate(`/journal/${j.id}`);
    },
    [navigate, suspendForDetail]
  );
  const sharePaper = useCallback((paper: Paper) => openShare({ kind: 'single', paper }), [openShare]);
  const shareJournal = useCallback(
    (journal: Journal) => openShare({ kind: 'journal', journal }),
    [openShare]
  );
  const ptr = usePullToRefresh({
    onRefresh: () => activeQ.refetch(),
    enabled: !activeQ.isLoading,
  });

  return (
    <m.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
      className="absolute inset-0 z-modal flex flex-col"
    >
      {/* 搜索导航栏(顶,从上方轻微滑入) */}
      <m.header
        initial={{ y: -14 }}
        animate={{ y: 0 }}
        transition={{ duration: 0.22, ease: 'easeOut' }}
        className="flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background px-3"
      >
        <button
          type="button"
          onClick={close}
          className="-ml-1 p-1 text-muted-foreground active:opacity-60"
          aria-label="关闭搜索"
        >
          <X className="size-5" />
        </button>
        {/* 走 SEARCH_FIELD_SHELL(Figma §4.5)。⏪ 此前是 h-9(36)+ rounded-pill +
            border(ink@12%)+ bg-surface-1,焦点 `focus-within:border-brand-red`。
            **这是 2026-07-28 搜索框收口时漏掉的第 9 个框** —— 它是移动端论文/期刊检索的
            主输入(和已收口的 MobileToolsPage 那个 pill 同族),不是菜单里的过滤条;
            两个移动端搜索框各留一套规格,正是这轮收口要消灭的分叉。
            外层 header 是 h-14(56),44 + items-center 仍居中,不撑高。 */}
        <div className={cn('flex min-w-0 flex-1 items-center gap-2 px-3', SEARCH_FIELD_SHELL)}>
          <Search className="size-4 shrink-0 text-faint" />
          <input
            ref={inputRef}
            /* type=search + enterKeyHint:本框不在 <form> 内(靠 onKeyDown 提交),
               不给这两个属性时 iOS 软键盘的回车键渲染成「换行」,用户看到「换行」就不会按 ——
               而这里的回车其实是有效的。一行属性换回一条被隐藏的提交路径。 */
            type="search"
            enterKeyHint="search"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            placeholder={isPapers ? '搜索论文 / 关键词 / 作者' : '搜索期刊名 / 出版社'}
            /* outline-none 合法: 焦点由外层容器的 focus-within:border-brand-red 提示 */
            className="min-w-0 flex-1 bg-transparent text-14 outline-none placeholder:text-faint"
          />
          {input && (
            <button
              type="button"
              onClick={() => {
                setInput('');
                setQuery('');
                inputRef.current?.focus();
              }}
              className="shrink-0 text-faint active:opacity-60"
              aria-label="清空"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={submit}
          className="shrink-0 rounded-pill bg-brand-red px-3.5 py-1.5 text-12 font-medium text-on-brand active:opacity-90"
        >
          搜索
        </button>
      </m.header>

      {/* 筛选条(论文搜索专用,与 PC 侧边栏同筛选逻辑;期刊搜索无此套筛选,不展示) */}
      {isPapers && (
        <div className="flex shrink-0 items-center gap-2 overflow-x-auto border-b border-border bg-background px-3 py-2">
          <button
            type="button"
            onClick={() => setFilterOpen(true)}
            className="inline-flex shrink-0 items-center gap-1 rounded-pill border border-border px-2.5 py-1 text-12 text-foreground active:bg-surface-1"
          >
            <SlidersHorizontal className="size-3.5" />
            筛选
            {activeCount > 0 && (
              <span className="ml-0.5 inline-flex min-w-4 items-center justify-center rounded-pill bg-brand-red px-1 text-12 font-medium text-on-brand">
                {activeCount}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setFilterOpen(true)}
            className="shrink-0 rounded-pill bg-surface-2 px-2.5 py-1 text-12 text-muted-foreground active:opacity-80"
          >
            来源 · {sourceLabel}
          </button>
          <button
            type="button"
            onClick={() => setFilterOpen(true)}
            className="shrink-0 rounded-pill bg-surface-2 px-2.5 py-1 text-12 text-muted-foreground active:opacity-80"
          >
            排序 · {sortLabel}
          </button>
        </div>
      )}

      {/* 未搜索:蒙层(透出底下 feed,点击即退出);已搜索:结果列表(论文 / 期刊按 mode) */}
      {!query ? (
        <button
          type="button"
          aria-label="关闭搜索,继续浏览"
          onClick={close}
          className="min-h-0 flex-1 bg-foreground/30 backdrop-blur-[1px]"
        />
      ) : (
        <div
          ref={scrollRef}
          /* 浮层是 absolute inset-0(盖住底部 Tab)→ 这个滚动列表的底边就是**屏幕底边**,
             最后一行会压在全面屏 home indicator 下。pb 走 --safe-bottom:
             无刘海/桌面 16px、iPhone X+ 34px。(render-audit-2026-07-28 P1-6) */
          className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain bg-surface-card pb-[var(--safe-bottom)]"
          {...ptr.handlers}
        >
          <PullToRefreshIndicator pull={ptr.pull} refreshing={ptr.refreshing} />
          {activeQ.isLoading ? (
            <MobilePaperRowSkeletonList />
          ) : activeQ.isError ? (
            <p className="py-12 text-center text-12 text-muted-foreground">搜索失败,请稍后重试</p>
          ) : resultCount === 0 ? (
            <p className="py-12 text-center text-12 text-faint">没有找到「{query}」相关结果</p>
          ) : (
            <>
              {/* 虚拟化容器:撑满总高,逐行 absolute + translateY 定位,只挂载视口附近行 */}
              <div style={{ height: rowVirtualizer.getTotalSize(), position: 'relative', width: '100%' }}>
                {virtualRows.map((vi) => {
                  // mode/count 切换瞬间的越界保护:取不到 item 就跳过这一行
                  const paper = isPapers ? papers[vi.index] : undefined;
                  const journal = isPapers ? undefined : journals[vi.index];
                  if (!paper && !journal) return null;
                  return (
                    <div
                      key={vi.key}
                      data-index={vi.index}
                      ref={rowVirtualizer.measureElement}
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        transform: `translateY(${vi.start}px)`,
                      }}
                    >
                      {paper ? (
                        <MobilePaperRow
                          paper={paper}
                          isFavorited={favOverrides.get(paper.paperId) ?? paper.isFavorited ?? false}
                          enrichment={paper.venue ? enrichments[paper.venue] : null}
                          onBeforeOpen={beforeOpenPaper}
                          onShare={sharePaper}
                          onCite={setCitePaper}
                          onFavoriteToggle={handleFavToggle}
                        />
                      ) : journal ? (
                        <MobileJournalResultCard
                          journal={journal}
                          onOpen={openJournal}
                          onShare={shareJournal}
                        />
                      ) : null}
                    </div>
                  );
                })}
              </div>
              <div className="flex h-12 items-center justify-center">
                {activeQ.isFetchingNextPage ? (
                  <Loader2 className="size-4 animate-spin text-faint" />
                ) : !activeQ.hasNextPage ? (
                  <span className="text-12 text-faint">没有更多了</span>
                ) : null}
              </div>
            </>
          )}
        </div>
      )}

      {/* 筛选底部抽屉(渲染在浮层内,留在移动列内) */}
      <MobileSearchFilterSheet
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        filters={filters}
        onChange={setFilters}
      />

      <CitationDialog
        open={citePaper != null}
        onOpenChange={(open) => !open && setCitePaper(null)}
        paper={citePaper}
      />
    </m.div>
  );
}
