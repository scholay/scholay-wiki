import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  AlertCircle,
  BookOpen,
  FileText,
  Grid3x3,
  Loader2,
  MessageSquare,
  Plus,
  Share2,
  User,
  X,
} from 'lucide-react';
import { EmptyState } from '@/shared/components/EmptyState';
import { PdfViewer, type PdfSource } from '@/shared/components/PdfViewer';
import { useFetchPaperDetail } from '@/shared/api/paper-detail';
import { useLibraryPaperByUpstream } from '@/shared/api/user-library-papers';
import { useJournalDetail } from '@/shared/api/journals';
import type { Author, Journal, Paper, UpstreamSource } from '@/shared/api/types';
import { useOpenPaperDetail } from '@/shared/hooks/useOpenInSearchPanel';
import { useAuthStore } from '@/stores/auth.store';
import { QuickOpenPaperDialog } from '@/features/browser/components/QuickOpenPaperDialog';
import { PaperDetailContent } from '@/features/browser/components/paper-detail/PaperDetailContent';
import { JournalDetailContent } from '@/features/browser/components/journal-detail/JournalDetailContent';
import { AuthorDetailContent } from '@/features/browser/components/author-detail/AuthorDetailContent';
import { MatrixColumn } from './MatrixColumn';
import { PdfChatPanel } from './workspace/PdfChatPanel';
import { CitationGraphPanel } from './workspace/CitationGraphPanel';
import { useWorkspacePapers } from '../hooks/useWorkspacePapers';
import {
  useSearchRightPanelStore,
  WORKSPACE_FUNCTION_LABEL,
  WORKSPACE_FUNCTION_ORDER,
  type ActivePanel,
  type ArtifactTabPayload,
  type InfoTab,
  type PdfTabPayload,
  type RightPanelVariant,
  type WorkspaceFunctionKind,
} from '@/stores/search-right-panel.store';
import { useArtifactExportBridge } from '@/stores/artifact-export-bridge.store';
import { cn } from '@/shared/lib/utils';

const ClawArtifactPreview = lazy(() =>
  import('@/features/claw/components/preview/ClawArtifactPreview').then((m) => ({
    default: m.ClawArtifactPreview,
  })),
);

interface SearchRightPanelProps {
  /**
   * search = 检索工作区全功能 tab;
   * assistant = 智能助手:隐藏 PDF Chat / 图谱 / 矩阵,只留详情/产物壳。
   */
  variant?: RightPanelVariant;
}

export function SearchRightPanel({
  variant = 'search',
}: SearchRightPanelProps = {}) {
  const activePanel = useSearchRightPanelStore((s) => s.activePanel);
  const infoTabs = useSearchRightPanelStore((s) => s.infoTabs);
  const workspace = useWorkspacePapers();
  const assistant = variant === 'assistant';

  const activeInfoTab =
    activePanel?.group === 'info'
      ? infoTabs.find((t) => t.id === activePanel.tabId)
      : undefined;

  // 产物 / PDF 自带内部滚动(flex h-full);其它详情页走外层 overflow-auto。
  // FeatureHub 空态由页面级边缘吸附名片承载,本组件只在有 activePanel 时挂载。
  const fillHeightActive =
    activePanel?.group === 'info' &&
    (activeInfoTab?.kind === 'artifact' || activeInfoTab?.kind === 'pdf');

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <TabStrip activePanel={activePanel} variant={variant} />
      <div
        className={cn(
          'min-h-0 flex-1 min-w-0',
          fillHeightActive ? 'overflow-hidden' : 'overflow-auto',
        )}
      >
        {activePanel?.group === 'shell' && <AssistantShellEmpty />}
        {!assistant && activePanel?.group === 'function' && (
          <WorkspaceFunctionView
            kind={activePanel.kind}
            staged={workspace.papers}
          />
        )}
        {activePanel?.group === 'info' && activeInfoTab && (
          <InfoTabView tab={activeInfoTab} />
        )}
      </div>
    </div>
  );
}

function AssistantShellEmpty() {
  return (
    <div className="flex h-full min-h-0 items-center justify-center p-6">
      <EmptyState
        title="拓展区"
        description="打开的论文详情、作者、期刊、PDF 会出现在这里"
      />
    </div>
  );
}

function TabStrip({
  activePanel,
  variant = 'search',
}: {
  activePanel: ActivePanel | null;
  variant?: RightPanelVariant;
}) {
  const infoTabs = useSearchRightPanelStore((s) => s.infoTabs);
  const setActiveFunction = useSearchRightPanelStore((s) => s.setActiveFunction);
  const setActiveInfoTab = useSearchRightPanelStore((s) => s.setActiveInfoTab);
  const closeInfoTab = useSearchRightPanelStore((s) => s.closeInfoTab);
  const dismissToHub = useSearchRightPanelStore((s) => s.dismissToHub);
  const openPaper = useOpenPaperDetail();
  const assistant = variant === 'assistant';

  const showPageGroup = infoTabs.length > 0;

  const functionGroup = assistant ? (
    <div className="flex min-w-0 shrink items-center gap-1">
      <QuickOpenPaperDialog align="start" onPickPaper={openPaper}>
        <button
          type="button"
          className="inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
          title="打开论文详情"
          aria-label="打开论文详情"
        >
          <Plus className="size-3.5" strokeWidth={2.25} />
        </button>
      </QuickOpenPaperDialog>
    </div>
  ) : (
    <div className="flex min-w-0 shrink items-center gap-1">
      {WORKSPACE_FUNCTION_ORDER.map((kind) => (
        <FunctionTabButton
          key={kind}
          kind={kind}
          active={
            activePanel?.group === 'function' && activePanel.kind === kind
          }
          onSelect={() => setActiveFunction(kind)}
        />
      ))}
      <QuickOpenPaperDialog align="start" onPickPaper={openPaper}>
        <button
          type="button"
          className="inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
          title="新建详情页签"
          aria-label="新建详情页签"
        >
          <Plus className="size-3.5" strokeWidth={2.25} />
        </button>
      </QuickOpenPaperDialog>
    </div>
  );

  const pageGroup = showPageGroup ? (
    <>
      <TabStripDivider />
      <InfoTabRail
        tabs={infoTabs}
        activeTabId={
          activePanel?.group === 'info' ? activePanel.tabId : null
        }
        onSelect={setActiveInfoTab}
        onClose={closeInfoTab}
      />
    </>
  ) : (
    <div className="min-w-0 flex-1" />
  );

  return (
    <div className="flex h-11 shrink-0 items-center gap-1 overflow-hidden border-b border-border bg-surface-1 px-2">
      {functionGroup}
      {pageGroup}
      <button
        type="button"
        onClick={dismissToHub}
        className="inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
        title="回到拓展入口"
        aria-label="回到拓展入口"
      >
        <X className="size-3.5" strokeWidth={2.25} />
      </button>
    </div>
  );
}

function TabStripDivider() {
  return (
    <span aria-hidden className="mx-0.5 h-5 w-px shrink-0 bg-border" />
  );
}

function functionIcon(kind: WorkspaceFunctionKind) {
  switch (kind) {
    case 'pdf-chat':
      return MessageSquare;
    case 'citation-graph':
      return Share2;
    case 'matrix':
      return Grid3x3;
  }
}

function FunctionTabButton({
  kind,
  active,
  onSelect,
}: {
  kind: WorkspaceFunctionKind;
  active: boolean;
  onSelect: () => void;
}) {
  const Icon = functionIcon(kind);
  const label = WORKSPACE_FUNCTION_LABEL[kind];
  return (
    <button
      type="button"
      onClick={onSelect}
      title={label}
      aria-label={label}
      className={cn(
        // 可挤:先 truncate 文案,最窄塌成 min-w-8 纯图标(overflow 吃掉文字)
        'inline-flex h-8 min-w-8 max-w-[160px] shrink items-center gap-1.5 overflow-hidden rounded-sm border px-2 text-xs font-semibold transition-colors',
        active
          ? 'border-brand-red/30 bg-brand-red/5 text-brand-red shadow-sm'
          : 'border-transparent text-subtle hover:bg-background/70 hover:text-foreground',
      )}
    >
      <Icon className="size-3.5 shrink-0" />
      <span className="min-w-0 truncate">{label}</span>
    </button>
  );
}

function infoIcon(tab: InfoTab) {
  switch (tab.kind) {
    case 'paper':
      return FileText;
    case 'journal':
      return BookOpen;
    case 'author':
      return User;
    case 'artifact':
      return FileText;
    case 'pdf':
      return FileText;
  }
}

/** 边缘 hover 自动滚速(px / frame ≈ 60fps 下 ~240px/s) */
const INFO_TAB_EDGE_SCROLL_PX = 4;

/**
 * 页面专属 info tab 轨 —— 先挤压文字到图标底线;
 * 仍溢出时隐藏滚动条,hover 左/右边缘持续向对应方向滚动。
 */
function InfoTabRail({
  tabs,
  activeTabId,
  onSelect,
  onClose,
}: {
  tabs: InfoTab[];
  activeTabId: string | null;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const dirRef = useRef<-1 | 0 | 1>(0);
  const rafRef = useRef(0);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  const syncEdges = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setCanLeft(max > 2 && el.scrollLeft > 2);
    setCanRight(max > 2 && el.scrollLeft < max - 2);
  }, []);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    syncEdges();
    el.addEventListener('scroll', syncEdges, { passive: true });
    const ro =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(syncEdges)
        : null;
    ro?.observe(el);
    return () => {
      el.removeEventListener('scroll', syncEdges);
      ro?.disconnect();
      dirRef.current = 0;
      cancelAnimationFrame(rafRef.current);
    };
  }, [syncEdges, tabs.length]);

  const startEdgeScroll = (dir: -1 | 1) => {
    if (dirRef.current === dir) return;
    dirRef.current = dir;
    cancelAnimationFrame(rafRef.current);
    const tick = () => {
      const el = scrollerRef.current;
      if (!el || dirRef.current === 0) return;
      el.scrollLeft += dirRef.current * INFO_TAB_EDGE_SCROLL_PX;
      const max = el.scrollWidth - el.clientWidth;
      if (
        (dirRef.current < 0 && el.scrollLeft <= 0) ||
        (dirRef.current > 0 && el.scrollLeft >= max - 0.5)
      ) {
        dirRef.current = 0;
        syncEdges();
        return;
      }
      syncEdges();
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  };

  const stopEdgeScroll = () => {
    dirRef.current = 0;
    cancelAnimationFrame(rafRef.current);
  };

  return (
    <div className="relative min-w-0 flex-1">
      <div
        ref={scrollerRef}
        className={cn(
          'flex h-full min-w-0 items-center gap-1 overflow-x-auto overflow-y-hidden',
          '[scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        )}
      >
        {tabs.map((tab) => (
          <InfoTabPill
            key={tab.id}
            tab={tab}
            active={activeTabId === tab.id}
            onSelect={() => onSelect(tab.id)}
            onClose={() => onClose(tab.id)}
          />
        ))}
      </div>

      {/* 左边缘 hover → 向左滚 */}
      <div
        aria-hidden
        onPointerEnter={() => canLeft && startEdgeScroll(-1)}
        onPointerLeave={stopEdgeScroll}
        className={cn(
          'absolute inset-y-0 left-0 z-10 w-5 transition-opacity',
          canLeft
            ? 'cursor-w-resize bg-gradient-to-r from-surface-1 via-surface-1/70 to-transparent opacity-100'
            : 'pointer-events-none opacity-0',
        )}
      />
      {/* 右边缘 hover → 向右滚 */}
      <div
        aria-hidden
        onPointerEnter={() => canRight && startEdgeScroll(1)}
        onPointerLeave={stopEdgeScroll}
        className={cn(
          'absolute inset-y-0 right-0 z-10 w-5 transition-opacity',
          canRight
            ? 'cursor-e-resize bg-gradient-to-l from-surface-1 via-surface-1/70 to-transparent opacity-100'
            : 'pointer-events-none opacity-0',
        )}
      />
    </div>
  );
}

function InfoTabPill({
  tab,
  active,
  onSelect,
  onClose,
}: {
  tab: InfoTab;
  active: boolean;
  onSelect: () => void;
  onClose: () => void;
}) {
  const Icon = infoIcon(tab);
  return (
    <div
      className={cn(
        // 偏好 ~7rem,可挤到 min-w-8;再多就进轨道横溢 + 边缘 hover 滚
        'group relative inline-flex h-8 min-w-8 max-w-[220px] flex-[1_1_7rem] items-center rounded-sm border text-xs',
        active
          ? 'border-border bg-background text-foreground shadow-sm'
          : 'border-transparent text-subtle hover:bg-background/70 hover:text-foreground',
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        className="inline-flex h-full min-w-0 flex-1 items-center gap-1.5 overflow-hidden px-2 group-hover:pr-6"
        title={tab.title}
        aria-label={tab.title}
      >
        <Icon className="size-3.5 shrink-0" />
        <span className="min-w-0 truncate">{tab.title}</span>
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        aria-label={`关闭 ${tab.title}`}
        title={`关闭 ${tab.title}`}
        className={cn(
          'absolute right-0.5 top-1/2 z-[1] inline-flex size-5 -translate-y-1/2 items-center justify-center rounded-sm',
          'bg-background/90 text-muted-foreground opacity-0 transition-opacity',
          'hover:bg-surface-2 hover:text-foreground',
          'group-hover:opacity-100 group-focus-within:opacity-100',
        )}
      >
        <X className="size-3" />
      </button>
    </div>
  );
}

function WorkspaceFunctionView({
  kind,
  staged,
}: {
  kind: WorkspaceFunctionKind;
  staged: Paper[];
}) {
  switch (kind) {
    case 'pdf-chat':
      return <PdfChatPanel staged={staged} />;
    case 'citation-graph':
      return <CitationGraphPanel staged={staged} />;
    case 'matrix':
      return <MatrixColumn staged={staged} />;
  }
}

function InfoTabView({ tab }: { tab: InfoTab }) {
  switch (tab.kind) {
    case 'paper':
      return <SearchPaperDetailView seedPaper={tab.paper} />;
    case 'journal':
      return <SearchJournalDetailView seedJournal={tab.journal} />;
    case 'author':
      return <SearchAuthorDetailView seedAuthor={tab.author} />;
    case 'artifact':
      return <SearchArtifactDetailView tabId={tab.id} artifact={tab.artifact} />;
    case 'pdf':
      return <SearchPdfDetailView pdf={tab.pdf} />;
  }
}

function SearchPdfDetailView({ pdf }: { pdf: PdfTabPayload }) {
  const token = useAuthStore((s) => s.token);
  const pdfSource = useMemo<PdfSource | null>(() => {
    if (!pdf.libPaperId) return null;
    return {
      url: `/api/v1/user/library/papers/${pdf.libPaperId}/pdf`,
      httpHeaders: token ? { Authorization: `Bearer ${token}` } : undefined,
      withCredentials: false,
    };
  }, [pdf.libPaperId, token]);

  if (!token) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <EmptyState
          icon={AlertCircle}
          title="需要登录才能查看 PDF"
          description="文献集中的 PDF 仅本人可见。"
        />
      </div>
    );
  }
  if (!pdfSource) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <EmptyState icon={AlertCircle} title="无效的 PDF" />
      </div>
    );
  }

  return (
    <article className="flex h-full min-h-0 flex-col bg-background">
      {pdf.title && (
        <header className="shrink-0 border-b border-border-soft px-4 py-2">
          <h1
            className="line-clamp-1 text-sm font-semibold text-foreground"
            title={pdf.title}
          >
            {pdf.title}
          </h1>
        </header>
      )}
      <PdfViewer file={pdfSource} className="min-h-0 flex-1" />
    </article>
  );
}

function SearchArtifactDetailView({
  tabId,
  artifact,
}: {
  tabId: string;
  artifact: ArtifactTabPayload;
}) {
  const closeInfoTab = useSearchRightPanelStore((s) => s.closeInfoTab);
  const onExportDeck = useArtifactExportBridge((s) => s.onExportDeck);
  const exportingFormat = useArtifactExportBridge((s) => s.exportingFormat);

  return (
    <Suspense fallback={<PanelLoading />}>
      <ClawArtifactPreview
        artifact={artifact}
        basePath={artifact.basePath}
        onClose={() => closeInfoTab(tabId)}
        hideHeaderClose
        onExportDeck={
          onExportDeck ? (fmt) => onExportDeck(artifact, fmt) : undefined
        }
        exportingFormat={exportingFormat}
      />
    </Suspense>
  );
}

function SearchPaperDetailView({ seedPaper }: { seedPaper: Paper }) {
  const source: UpstreamSource =
    seedPaper.source && seedPaper.source !== 'local'
      ? seedPaper.source
      : 'stc';
  const needsFetch = !(seedPaper.abstract ?? '').trim();
  const detailQ = useFetchPaperDetail({
    source,
    paperId: seedPaper.paperId,
    enabled: needsFetch,
  });
  const libRowQ = useLibraryPaperByUpstream(source, seedPaper.paperId);
  const paper = detailQ.data ?? seedPaper;

  if (needsFetch && detailQ.isLoading) {
    return <PanelLoading />;
  }
  if (detailQ.error) {
    return (
      <EmptyState
        icon={AlertCircle}
        title="论文加载失败"
        description={(detailQ.error as Error).message || '请稍后重试'}
      />
    );
  }

  return (
    <PaperDetailContent paper={paper} libRow={libRowQ.data ?? null} compact />
  );
}

function SearchJournalDetailView({ seedJournal }: { seedJournal: Journal }) {
  const needsFetch = !seedJournal.canonical_name?.trim();
  const detailQ = useJournalDetail(needsFetch ? seedJournal.id : null, needsFetch);
  const journal = detailQ.data ?? seedJournal;

  if (needsFetch && detailQ.isLoading) {
    return <PanelLoading />;
  }
  if (detailQ.error) {
    return (
      <EmptyState
        icon={AlertCircle}
        title="期刊加载失败"
        description={(detailQ.error as Error).message || '请稍后重试'}
      />
    );
  }

  return <JournalDetailContent journal={journal} compact />;
}

function SearchAuthorDetailView({ seedAuthor }: { seedAuthor: Author }) {
  return <AuthorDetailContent seedAuthor={seedAuthor} compact />;
}

function PanelLoading() {
  return (
    <div className="flex items-center justify-center py-16 text-faint">
      <Loader2 className="size-5 animate-spin" />
    </div>
  );
}
