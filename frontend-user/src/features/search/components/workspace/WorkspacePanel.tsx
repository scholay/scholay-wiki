import { useCallback, useEffect, useRef } from 'react';
import { useAutoAnimate } from '@formkit/auto-animate/react';
import { Loader2 } from 'lucide-react';
import { ConfirmPopover } from '@/shared/components/ConfirmPopover';
import { FavoriteBurst } from '@/shared/components/FavoriteBurst';
import { SidebarSection } from '@/shared/components/sidebar';
import { useStagingActions } from '../../hooks/useStagingActions';
import { useStagingView } from '../../hooks/useStagingView';
import { useStagedFavorites } from '../../hooks/useStagedFavorites';
import { useWorkspacePapers } from '../../hooks/useWorkspacePapers';
import { useStageFly } from '@/stores/stage-fly.store';
import { LeaveToLibraryLink } from '@/shared/components/LeaveToLibraryLink';
import { useWorkspaceFolderUi } from '@/stores/workspace-folder.store';
import { StagingTabs } from '../StagingTabs';
import { WorkspaceFolderTree } from './WorkspaceFolderTree';
import { PaperCell } from '../matrix/PaperCell';
import { WORKSPACE_PANEL_WIDTH } from '../matrix/constants';

interface WorkspacePanelProps {
  /** panel = 右栏独立列(已废弃,保留兼容); sidebar = 搜索页左栏 */
  variant?: 'panel' | 'sidebar';
}

/** 工作区 —— 暂存 + 文献集文件夹 + 论文列表 */
export function WorkspacePanel({ variant = 'sidebar' }: WorkspacePanelProps) {
  const isSidebar = variant === 'sidebar';
  const { papers, isLoading, isStaging } = useWorkspacePapers();
  const { activeArea } = useStagingView();
  const { removePaper, clearArea } = useStagingActions();
  const favoritedSet = useStagedFavorites(papers);
  const selectedPaperId = useWorkspaceFolderUi((s) => s.selectedPaperId);
  const setSelectedPaperId = useWorkspaceFolderUi((s) => s.setSelectedPaperId);
  const listContainerRef = useRef<HTMLDivElement>(null);
  const [animateListRef] = useAutoAnimate<HTMLDivElement>();
  const scrollRef = useRef<HTMLDivElement>(null);
  const sectionRef = useRef<HTMLDivElement>(null);
  const setGetTarget = useStageFly((s) => s.setGetTarget);

  const setListRef = useCallback(
    (node: HTMLDivElement | null) => {
      listContainerRef.current = node;
      animateListRef(node);
    },
    [animateListRef],
  );

  useEffect(() => {
    if (!isStaging) {
      setGetTarget(null);
      return;
    }
    const fn = () => {
      const rows = listContainerRef.current?.querySelectorAll('[data-workspace-row]');
      const lastRow = rows?.[rows.length - 1];
      if (lastRow) {
        const rr = lastRow.getBoundingClientRect();
        const H = rr.height || 76;
        return {
          top: rr.top,
          left: rr.left,
          width: rr.width,
          height: H,
        };
      }
      const section = sectionRef.current;
      if (!section) return null;
      const sr = section.getBoundingClientRect();
      return { top: sr.top, left: sr.left, width: sr.width, height: 76 };
    };
    setGetTarget(fn);
    return () => setGetTarget(null);
  }, [isStaging, setGetTarget]);

  const prevLenRef = useRef(papers.length);
  useEffect(() => {
    if (!isStaging) return;
    if (papers.length > prevLenRef.current) {
      const lastRow = listContainerRef.current?.querySelector(
        '[data-workspace-row]:last-child',
      );
      lastRow?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    prevLenRef.current = papers.length;
  }, [papers.length, isStaging]);

  const handleRemove = useCallback(
    (paperId: string) => {
      if (!activeArea) return;
      removePaper(activeArea.id, paperId);
    },
    [activeArea, removePaper],
  );

  const handleClearAll = useCallback(() => {
    if (!activeArea || papers.length === 0) return;
    clearArea(activeArea.id);
  }, [activeArea, papers.length, clearArea]);

  const paperList = (
    <div ref={setListRef} className="min-w-0">
      {isLoading && (
        <div className="px-4 py-8 text-center text-faint">
          <Loader2 className="mx-auto size-5 animate-spin" />
        </div>
      )}
      {!isLoading &&
        papers.map((p) => (
          <div
            key={`${p.source ?? 'stc'}:${p.paperId}`}
            data-workspace-row
            className="group/row cursor-pointer border-b border-border"
            onClick={() => setSelectedPaperId(p.paperId)}
          >
            <PaperCell
              paper={p}
              isFavorited={favoritedSet.has(
                `${p.source ?? 'stc'}:${p.paperId}`,
              )}
              isWorkspaceSelected={p.paperId === selectedPaperId}
              onRemove={isStaging ? handleRemove : undefined}
              compact={isSidebar}
            />
          </div>
        ))}
      {!isLoading && papers.length === 0 && (
        <p className="px-4 py-6 text-center text-2xs leading-relaxed text-faint">
          {isStaging
            ? '暂存区还是空的,从搜索结果加入论文'
            : '此文件夹还没有论文'}
        </p>
      )}
    </div>
  );

  const footer = (
    <footer className="flex h-9 shrink-0 items-center justify-between gap-2 border-t border-border bg-surface-1 px-4">
      <span className="text-2xs tabular-nums text-muted-foreground">
        {papers.length} 篇
      </span>
      {isStaging && papers.length > 0 && (
        <ConfirmPopover
          title={`清空暂存区的 ${papers.length} 篇论文?`}
          description="只清空暂存区,不影响文献集文件夹。此操作不可撤销。"
          confirmText="清空"
          cancelText="取消"
          danger
          side="top"
          align="end"
          onConfirm={handleClearAll}
        >
          <button
            type="button"
            className="text-2xs text-muted-foreground hover:text-foreground"
          >
            × 清空
          </button>
        </ConfirmPopover>
      )}
    </footer>
  );

  if (isSidebar) {
    return (
      <>
        <div ref={sectionRef} className="flex min-w-0 flex-col">
          <SidebarSection
            id="workspace"
            label="工作区"
            prominent
            bordered
            action={
              <LeaveToLibraryLink
                to="/library"
                className="text-2xs font-bold text-foreground hover:opacity-70"
              >
                管理
              </LeaveToLibraryLink>
            }
          >
            <WorkspaceFolderTree />
            <div className="border-t border-border-soft">{paperList}</div>
            {footer}
          </SidebarSection>
        </div>
        <FavoriteBurst anchorRef={sectionRef} />
      </>
    );
  }

  return (
    <div
      className="flex h-full min-h-0 shrink-0 flex-col overflow-hidden border-r border-border bg-background"
      style={{ width: WORKSPACE_PANEL_WIDTH }}
    >
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
        <div className="sticky top-0 z-30 border-b border-border bg-background">
          <StagingTabs />
        </div>
        {paperList}
      </div>
      {footer}
    </div>
  );
}
