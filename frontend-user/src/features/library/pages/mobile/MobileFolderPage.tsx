import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ChevronLeft, Loader2, Share2 } from 'lucide-react';
import type { Paper } from '@/shared/api/types';
import { useAuthStatus } from '@/stores/auth.store';
import { useShareSheet } from '@/stores/share.store';
import { useScrollRestoration, usePullToRefresh } from '@/shared/hooks';
import { MobilePaperRow } from '@/shared/components/MobilePaperRow';
import { MobilePaperRowSkeletonList } from '@/shared/components/MobilePaperRowSkeleton';
import { PullToRefreshIndicator } from '@/shared/components/PullToRefreshIndicator';
import { CitationDialog } from '@/shared/components/CitationDialog';
import { useJournalEnrichments } from '@/shared/api/journal-enrichment';
import { useLibraryFolders } from '../../api/folders';
import {
  useInfiniteLibraryPapers,
  flattenLibraryPages,
  libraryRowToPaper,
} from '../../api/papers';

/**
 * 移动端文件夹详情(/m/library/:folderId) —— 列出该文献集内的论文。
 *
 * 列表样式与移动端「搜索结果」完全一致(共用 shared `MobilePaperRow`,推特式连续列表)。
 * 性能:无限分页(pageSize 20)+ @tanstack/react-virtual 虚拟化,只挂载视口附近的行
 * (替代旧的「一次性 pageSize:100 + 全量 map」)。进详情→返回保留滚动位置。
 * 顶部「分享整本」= 集合分享;每行「分享」= 单篇分享(都走全局 ShareSheet)。
 */
export function MobileFolderPage() {
  const { authenticated } = useAuthStatus();
  const navigate = useNavigate();
  const { folderId } = useParams<{ folderId: string }>();
  const fid = Number(folderId);
  const foldersQ = useLibraryFolders();
  const papersQ = useInfiniteLibraryPapers(Number.isFinite(fid) ? fid : 'root', {
    pageSize: 20,
  });
  const openShare = useShareSheet((s) => s.openShare);
  const [citePaper, setCitePaper] = useState<Paper | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  // 进详情→返回时恢复滚动位置(键含 :folderId 路径,各文献集互不干扰),与桌面 LibraryPage 同款。
  useScrollRestoration(scrollRef, 'm-folder-papers');

  const rows = useMemo(
    () => flattenLibraryPages(papersQ.data?.pages),
    [papersQ.data]
  );
  const papers = useMemo(() => rows.map(libraryRowToPaper), [rows]);
  // 期刊增强批查 —— 给每行显示 JCR/中科院/CCF/IF 徽章(与搜索结果同口径)。
  const venueNames = useMemo(
    () => Array.from(new Set(papers.map((p) => p.venue).filter((v): v is string => !!v))),
    [papers]
  );
  const enrichments = useJournalEnrichments(venueNames);

  // 虚拟化:行高不定(标题/摘要行数不一)→ measureElement 动态测量,estimateSize 仅初值。
  const rowVirtualizer = useVirtualizer({
    count: papers.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 168,
    overscan: 6,
    getItemKey: (index) => `${papers[index].source}:${papers[index].paperId}`,
  });

  // 无限下拉:虚拟列表渲染到接近末尾(剩 ≤3 行)→ 取下一页。
  const { fetchNextPage, hasNextPage, isFetchingNextPage } = papersQ;
  const virtualRows = rowVirtualizer.getVirtualItems();
  useEffect(() => {
    const last = virtualRows[virtualRows.length - 1];
    if (last && last.index >= papers.length - 3 && hasNextPage && !isFetchingNextPage) {
      void fetchNextPage();
    }
  }, [virtualRows, papers.length, hasNextPage, isFetchingNextPage, fetchNextPage]);

  // 稳定回调 —— 否则每次渲染新建函数,使 memo 化的 MobilePaperRow 全量重渲染。
  const openPaper = useCallback(
    (p: Paper) => navigate(`/paper/${p.source}/${encodeURIComponent(p.paperId)}`),
    [navigate]
  );
  const sharePaper = useCallback(
    (p: Paper) => openShare({ kind: 'single', paper: p }),
    [openShare]
  );

  const ptr = usePullToRefresh({
    onRefresh: () => papersQ.refetch(),
    enabled: !papersQ.isLoading,
  });

  // 未登录:/m/auth 整页已下线,回「我的」(其 LoggedOutView 会就地弹登录)。
  if (!authenticated) return <Navigate to="/m/me" replace />;

  const folder = foldersQ.data?.folders.find((f) => f.id === fid);

  return (
    <div className="flex h-full flex-col bg-background">
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background px-3">
        <button
          type="button"
          onClick={() => navigate('/m/library')}
          className="-ml-1 p-1 text-muted-foreground transition-transform active:scale-90 active:opacity-60"
          aria-label="返回"
        >
          <ChevronLeft className="size-5" />
        </button>
        <h1 className="min-w-0 flex-1 truncate text-md font-semibold text-foreground">
          {folder?.name ?? '文献集'}
        </h1>
        {rows.length > 0 && folder && (
          <button
            type="button"
            onClick={() =>
              openShare({
                kind: 'collection',
                folderId: fid,
                folderName: folder.name,
                paperCount: folder.paper_count,
                samplePapers: rows
                  .slice(0, 5)
                  .map((r) => ({
                    title: (r.og_title || r.title) ?? '',
                    venue: r.og_venue || r.venue,
                    year: r.og_year || r.year,
                  }))
                  .filter((p) => p.title),
              })
            }
            className="flex items-center gap-1 rounded-pill border border-border px-3 py-1.5 text-xs text-muted-foreground transition-transform active:scale-95 active:bg-surface-2"
          >
            <Share2 className="size-3.5" /> 分享整本
          </button>
        )}
      </header>

      <div
        ref={scrollRef}
        className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain bg-background"
        {...ptr.handlers}
      >
        <PullToRefreshIndicator pull={ptr.pull} refreshing={ptr.refreshing} />
        {papersQ.isLoading ? (
          <MobilePaperRowSkeletonList />
        ) : papers.length === 0 ? (
          <p className="py-12 text-center text-sm text-faint">这个文献集还没有论文</p>
        ) : (
          <>
            <div style={{ height: rowVirtualizer.getTotalSize(), position: 'relative', width: '100%' }}>
              {virtualRows.map((vi) => (
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
                  <MobilePaperRow
                    paper={papers[vi.index]}
                    // 文献集里的论文必然已收藏 —— 收藏按钮显「已收藏」,点击可二次确认移出文库
                    isFavorited
                    enrichment={
                      papers[vi.index].venue ? enrichments[papers[vi.index].venue!] : null
                    }
                    onOpen={openPaper}
                    onShare={sharePaper}
                    onCite={setCitePaper}
                  />
                </div>
              ))}
            </div>
            {isFetchingNextPage && (
              <div className="flex h-12 items-center justify-center">
                <Loader2 className="size-4 animate-spin text-faint" />
              </div>
            )}
          </>
        )}
      </div>

      <CitationDialog
        open={citePaper != null}
        onOpenChange={(open) => !open && setCitePaper(null)}
        paper={citePaper}
      />
    </div>
  );
}
