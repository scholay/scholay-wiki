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
import { useFetchPaperDetail } from '@/shared/api/paper-detail';
import { useLibraryPaperByUpstream } from '@/shared/api/user-library-papers';
import { useJournalDetail } from '@/shared/api/journals';
import type { Author, Journal, Paper, UpstreamSource } from '@/shared/api/types';
import { useOpenPaperDetail } from '@/shared/hooks/useOpenInSearchPanel';
import { QuickOpenPaperDialog } from '@/features/browser/components/QuickOpenPaperDialog';
import { PaperDetailContent } from '@/features/browser/components/paper-detail/PaperDetailContent';
import { JournalDetailContent } from '@/features/browser/components/journal-detail/JournalDetailContent';
import { AuthorDetailContent } from '@/features/browser/components/author-detail/AuthorDetailContent';
import { MatrixColumn } from './MatrixColumn';
import { PdfChatPanel } from './workspace/PdfChatPanel';
import { CitationGraphPanel } from './workspace/CitationGraphPanel';
import { RightPanelFeatureHub } from './workspace/RightPanelFeatureHub';
import { useWorkspacePapers } from '../hooks/useWorkspacePapers';
import {
  useSearchRightPanelStore,
  WORKSPACE_FUNCTION_LABEL,
  WORKSPACE_FUNCTION_ORDER,
  type ActivePanel,
  type InfoTab,
  type WorkspaceFunctionKind,
} from '@/stores/search-right-panel.store';
import { cn } from '@/shared/lib/utils';

interface SearchRightPanelProps {
  /** @deprecated 论文列表改由 useWorkspacePapers 提供,保留空 props 兼容 lazy import */
}

export function SearchRightPanel(_props: SearchRightPanelProps = {}) {
  const activePanel = useSearchRightPanelStore((s) => s.activePanel);
  const infoTabs = useSearchRightPanelStore((s) => s.infoTabs);
  const workspace = useWorkspacePapers();

  const activeInfoTab =
    activePanel?.group === 'info'
      ? infoTabs.find((t) => t.id === activePanel.tabId)
      : undefined;

  const showFeatureHub = !activePanel;

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <TabStrip activePanel={activePanel} />
      <div className="min-h-0 flex-1 min-w-0 overflow-auto">
        {activePanel?.group === 'function' && (
          <WorkspaceFunctionView
            kind={activePanel.kind}
            staged={workspace.papers}
          />
        )}
        {activePanel?.group === 'info' && activeInfoTab && (
          <InfoTabView tab={activeInfoTab} />
        )}
        {showFeatureHub && <RightPanelFeatureHub />}
      </div>
    </div>
  );
}

function TabStrip({ activePanel }: { activePanel: ActivePanel | null }) {
  const infoTabs = useSearchRightPanelStore((s) => s.infoTabs);
  const setActiveFunction = useSearchRightPanelStore((s) => s.setActiveFunction);
  const setActiveInfoTab = useSearchRightPanelStore((s) => s.setActiveInfoTab);
  const closeInfoTab = useSearchRightPanelStore((s) => s.closeInfoTab);
  const closePanel = useSearchRightPanelStore((s) => s.closePanel);
  const openPaper = useOpenPaperDetail();

  const showPageGroup = infoTabs.length > 0;

  const functionGroup = (
    <div className="flex min-w-0 shrink-0 items-center gap-1">
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
          className="inline-flex size-7 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
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
      <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
        {infoTabs.map((tab) => (
          <InfoTabPill
            key={tab.id}
            tab={tab}
            active={
              activePanel?.group === 'info' && activePanel.tabId === tab.id
            }
            onSelect={() => setActiveInfoTab(tab.id)}
            onClose={() => closeInfoTab(tab.id)}
          />
        ))}
      </div>
    </>
  ) : (
    <div className="min-w-0 flex-1" />
  );

  return (
    <div className="flex h-11 shrink-0 items-center gap-1 border-b border-border bg-surface-1 px-2">
      {functionGroup}
      {pageGroup}
      <button
        type="button"
        onClick={closePanel}
        className="inline-flex size-7 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
        title="关闭拓展栏"
        aria-label="关闭拓展栏"
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
      className={cn(
        'inline-flex h-8 max-w-[160px] shrink-0 items-center gap-1.5 rounded-sm border px-2.5 text-xs font-semibold transition-colors',
        active
          ? 'border-brand-red/30 bg-brand-red/5 text-brand-red shadow-sm'
          : 'border-transparent text-subtle hover:bg-background/70 hover:text-foreground',
      )}
    >
      <Icon className="size-3.5 shrink-0" />
      <span className="truncate">{label}</span>
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
  }
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
        'group inline-flex h-8 max-w-[220px] shrink-0 items-center gap-1.5 rounded-sm border px-2 text-xs',
        active
          ? 'border-border bg-background text-foreground shadow-sm'
          : 'border-transparent text-subtle hover:bg-background/70 hover:text-foreground',
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        className="inline-flex min-w-0 flex-1 items-center gap-1.5"
        title={tab.title}
      >
        <Icon className="size-3.5 shrink-0" />
        <span className="truncate">{tab.title}</span>
      </button>
      <button
        type="button"
        onClick={onClose}
        aria-label={`关闭 ${tab.title}`}
        className="inline-flex size-5 shrink-0 items-center justify-center rounded-sm opacity-0 transition-opacity hover:bg-surface-2 group-hover:opacity-100"
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
  }
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
