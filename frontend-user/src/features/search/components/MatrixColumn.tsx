import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
  type UIEvent,
} from 'react';
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { useAutoAnimate } from '@formkit/auto-animate/react';
import { AlertCircle, Loader2, Lock, Settings2 } from 'lucide-react';
import { toast } from 'sonner';
import { EmptyState } from '@/shared/components/EmptyState';
import { ConfirmPopover } from '@/shared/components/ConfirmPopover';
import { ExportMenu } from './matrix/ExportMenu';
import {
  buildMatrixRows,
  exportCsv,
  exportMarkdown,
  exportXlsx,
} from './matrix/export';
import { useAuthStore } from '@/stores/auth.store';
import { useAuthDialog } from '@/stores/auth-dialog.store';
import {
  useAnalysisDimensions,
  useMatrixAnalysis,
  type PaperAnalysisItem,
} from '../api/analysis';
import type { Paper } from '../api/papers';
import { useStagingActions } from '../hooks/useStagingActions';
import { useStagingView } from '../hooks/useStagingView';
import { useStagedFavorites } from '../hooks/useStagedFavorites';
import { useWorkspacePapers } from '../hooks/useWorkspacePapers';
import { useStageFly } from '@/stores/stage-fly.store';
import {
  folderPaperOrderKey,
  useWorkspaceFolderUi,
} from '@/stores/workspace-folder.store';
import { DimensionSettingsDialog } from './DimensionSettingsDialog';
import { WorkspaceFolderPicker } from './StagingTabs';
import { DimensionCell } from './matrix/DimensionCell';
import { PaperCell } from './matrix/PaperCell';
import { SortablePaperRow } from './matrix/SortablePaperRow';
import { MatrixMoreToolsMenu } from './matrix/MatrixMoreToolsMenu';
import { DIM_COL_MIN_WIDTH } from './matrix/constants';
import { PdfChatPanel } from './workspace/PdfChatPanel';
import { CitationGraphPanel } from './workspace/CitationGraphPanel';
import {
  AnimatedPane,
  ExpansionAreaOpenButton,
  FileAreaOpenButton,
} from './workspace/ExpansionAreaOpenDock';
import { FunctionTabGroup } from './workspace/FunctionTabGroup';
import {
  ColumnResizeHandle,
  FILE_COL_DEFAULT_PX,
  FILE_COL_MAX_PX,
  FILE_COL_MIN_PX,
  startColumnResize,
} from './workspace/ColumnResizeHandle';
import {
  useSearchRightPanelStore,
  type RightPanelVariant,
  type WorkspaceFunctionKind,
} from '@/stores/search-right-panel.store';
import { STAGING_FOLDER_LABEL } from '@/stores/workspace-folder.store';

const FILE_SWITCH_H = 44;
/** Aligns with PdfChatPanel / TabStrip `h-11` (44px). */
const HEADER_H = 44;
const FOOTER_H = 40;

function heightsEqual(
  a: Record<string, number>,
  b: Record<string, number>,
) {
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  return keys.every((k) => a[k] === b[k]);
}

/**
 * 拓展区工作台:
 *   左列 = 文献卡(自己的高度,不跟矩阵行走)
 *   右列 = PDF Chat 铺满,或矩阵单元格(行高去贴左列卡片)
 */
export function WorkspaceStage({
  kind,
  staged,
  rightHeader,
  expansion,
  showFileArea = true,
  showExpansion = true,
  fileColWidth = FILE_COL_DEFAULT_PX,
  onFileColWidthChange,
  panelVariant = 'search',
}: {
  kind: WorkspaceFunctionKind;
  staged: Paper[];
  rightHeader?: ReactNode;
  /** Replaces the built-in function pane (info / shell). */
  expansion?: ReactNode;
  showFileArea?: boolean;
  showExpansion?: boolean;
  fileColWidth?: number;
  onFileColWidthChange?: (width: number) => void;
  panelVariant?: RightPanelVariant;
}) {
  const isMatrix = kind === 'matrix';
  const syncHeights = showFileArea && showExpansion && isMatrix;
  const paperScrollRef = useRef<HTMLDivElement>(null);
  const dimScrollRef = useRef<HTMLDivElement>(null);
  const syncingRef = useRef(false);
  const [rowHeights, setRowHeights] = useState<Record<string, number>>({});

  const measureRows = useCallback(() => {
    const root = paperScrollRef.current;
    if (!root) return;
    const next: Record<string, number> = {};
    root.querySelectorAll<HTMLElement>('[data-paper-row]').forEach((el) => {
      const id = el.dataset.paperRow;
      if (id) next[id] = el.offsetHeight;
    });
    setRowHeights((prev) => (heightsEqual(prev, next) ? prev : next));
  }, []);

  useLayoutEffect(() => {
    if (!syncHeights) return;
    const root = paperScrollRef.current;
    if (!root) return;
    const ro = new ResizeObserver(measureRows);
    ro.observe(root);
    root.querySelectorAll('[data-paper-row]').forEach((el) => ro.observe(el));
    measureRows();
    return () => ro.disconnect();
  }, [measureRows, staged, syncHeights]);

  const syncFrom = useCallback(
    (from: HTMLDivElement | null, to: HTMLDivElement | null) => {
      if (!from || !to || syncingRef.current) return;
      if (from.scrollTop === to.scrollTop) return;
      syncingRef.current = true;
      to.scrollTop = from.scrollTop;
      requestAnimationFrame(() => {
        syncingRef.current = false;
      });
    },
    [],
  );

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-1 bg-background">
      <AnimatedPane
        open={showFileArea}
        openWidth={fileColWidth}
      >
        <WorkspacePaperColumn
          staged={staged}
          width={fileColWidth}
          panelVariant={panelVariant}
          scrollRef={paperScrollRef}
          onScroll={() => {
            if (syncHeights)
              syncFrom(paperScrollRef.current, dimScrollRef.current);
          }}
        />
      </AnimatedPane>
      {showFileArea && showExpansion && onFileColWidthChange ? (
        <ColumnResizeHandle
          label="拖动调整文件区与拓展区比例"
          onPointerDown={(e) =>
            startColumnResize(
              e,
              fileColWidth,
              onFileColWidthChange,
              FILE_COL_MIN_PX,
              FILE_COL_MAX_PX,
            )
          }
        />
      ) : null}
      <AnimatedPane
        open={showExpansion}
        flexWhenOpen
      >
        {showExpansion ? (expansion ?? (
          <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
            {rightHeader}
            <div className="min-h-0 min-w-0 flex-1">
              {isMatrix ? (
                <MatrixDimPane
                  staged={staged}
                  rowHeights={rowHeights}
                  scrollRef={dimScrollRef}
                  onScroll={() =>
                    syncFrom(dimScrollRef.current, paperScrollRef.current)
                  }
                />
              ) : kind === 'pdf-chat' ? (
                <PdfChatPanel staged={staged} />
              ) : (
                <CitationGraphPanel staged={staged} />
              )}
            </div>
          </div>
        )) : null}
      </AnimatedPane>
    </div>
  );
}

export function WorkspacePaperColumn({
  staged,
  scrollRef,
  onScroll,
  width = FILE_COL_DEFAULT_PX,
  panelVariant = 'search',
}: {
  staged: Paper[];
  scrollRef?: RefObject<HTMLDivElement | null>;
  onScroll?: () => void;
  width?: number;
  panelVariant?: RightPanelVariant;
}) {
  const expansionOpen = useSearchRightPanelStore((s) => Boolean(s.activePanel));
  const { isStaging, activeTab } = useWorkspacePapers();
  const { activeArea } = useStagingView();
  const setPaperOrder = useWorkspaceFolderUi((s) => s.setPaperOrder);
  const setActiveTab = useWorkspaceFolderUi((s) => s.setActiveTab);
  const hasUnseenStaging = useWorkspaceFolderUi((s) => s.hasUnseenStaging);
  const { removePaper, clearArea, reorderPapers } = useStagingActions();
  const selectedPaperId = useWorkspaceFolderUi((s) => s.selectedPaperId);
  const setSelectedPaperId = useWorkspaceFolderUi((s) => s.setSelectedPaperId);
  const favoritedSet = useStagedFavorites(staged);
  const [listRef] = useAutoAnimate<HTMLDivElement>();
  const setMatrixTarget = useStageFly((s) => s.setMatrixTarget);
  const activePanel = useSearchRightPanelStore((s) => s.activePanel);
  const functionTabs = useSearchRightPanelStore((s) => s.functionTabs);
  const activeFunction =
    activePanel?.group === 'function' ? activePanel.kind : functionTabs[0];
  const showCardCheckbox =
    activeFunction === 'pdf-chat' || activeFunction === 'citation-graph';
  const showDragHandle = activeFunction === 'matrix';
  const sortableIds = useMemo(
    () => staged.map((p) => p.paperId),
    [staged],
  );
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );
  const checkedPaperIds = useWorkspaceFolderUi((s) => s.checkedPaperIds);
  const togglePaperChecked = useWorkspaceFolderUi((s) => s.togglePaperChecked);
  const setCheckedPaperIds = useWorkspaceFolderUi((s) => s.setCheckedPaperIds);
  const syncCheckedPapers = useWorkspaceFolderUi((s) => s.syncCheckedPapers);
  const visibleCheckedCount = checkedPaperIds.filter((id) =>
    staged.some((p) => p.paperId === id),
  ).length;
  const allChecked =
    staged.length > 0 && visibleCheckedCount === staged.length;

  useEffect(() => {
    syncCheckedPapers(staged.map((p) => p.paperId));
  }, [staged, syncCheckedPapers]);
  const localScrollRef = useRef<HTMLDivElement>(null);
  const resolvedScrollRef = scrollRef ?? localScrollRef;

  useEffect(() => {
    const fn = () => {
      const c = resolvedScrollRef.current;
      if (!c) return null;
      c.scrollTop = c.scrollHeight;
      const cr = c.getBoundingClientRect();
      const rows = c.querySelectorAll('[data-paper-row]');
      const last = rows[rows.length - 1];
      if (last) {
        const rr = last.getBoundingClientRect();
        const H = rr.height || 76;
        return {
          top: Math.min(rr.bottom, cr.bottom - H),
          left: rr.left,
          width: rr.width,
          height: H,
        };
      }
      return {
        top: cr.top,
        left: cr.left,
        width: Math.min(width, cr.width),
        height: 76,
      };
    };
    setMatrixTarget(fn);
    return () => setMatrixTarget(null);
  }, [resolvedScrollRef, setMatrixTarget, staged.length, width]);

  const handleRemove = useCallback(
    (paperId: string) => {
      if (!activeArea) return;
      removePaper(activeArea.id, paperId);
    },
    [activeArea, removePaper],
  );

  const handleClearAll = useCallback(() => {
    if (!activeArea || staged.length === 0) return;
    clearArea(activeArea.id);
  }, [activeArea, staged.length, clearArea]);

  const handleRemoveChecked = useCallback(() => {
    if (!activeArea || !isStaging) return;
    for (const id of checkedPaperIds) {
      if (staged.some((p) => p.paperId === id)) {
        removePaper(activeArea.id, id);
      }
    }
  }, [activeArea, isStaging, checkedPaperIds, staged, removePaper]);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const oldIndex = sortableIds.indexOf(String(active.id));
      const newIndex = sortableIds.indexOf(String(over.id));
      if (oldIndex < 0 || newIndex < 0) return;
      const next = arrayMove(sortableIds, oldIndex, newIndex);
      if (isStaging && activeArea) {
        reorderPapers(activeArea.id, next);
        return;
      }
      if (typeof activeTab === 'number') {
        setPaperOrder(folderPaperOrderKey(activeTab), next);
      }
    },
    [
      sortableIds,
      isStaging,
      activeArea,
      reorderPapers,
      activeTab,
      setPaperOrder,
    ],
  );

  return (
    <aside
      aria-label="工作区文献"
      className="flex h-full min-h-0 shrink-0 flex-col bg-background"
      style={{ width, minWidth: width }}
    >
      <header
        aria-label="工作区功能"
        className="flex shrink-0 items-center gap-1 border-b border-border bg-surface-1 px-2 pr-1"
        style={{ height: FILE_SWITCH_H }}
      >
        <FunctionTabGroup className="min-w-0 flex-1" />
        <FileAreaOpenButton />
        {!expansionOpen ? (
          <ExpansionAreaOpenButton variant={panelVariant} />
        ) : null}
      </header>
      <div
        className="flex shrink-0 items-center justify-between gap-2 border-b border-border bg-surface-1 px-2"
        style={{ height: HEADER_H }}
      >
        <div className="flex min-w-0 items-center gap-2">
          <WorkspaceFolderPicker />
          {hasUnseenStaging && !isStaging ? (
            <button
              type="button"
              onClick={() => setActiveTab('staging')}
              title="左侧有新论文，回到当前对话"
              className="shrink-0 text-12 font-medium text-brand-red hover:underline"
            >
              返回当前会话
            </button>
          ) : null}
          <span className="min-w-0 truncate text-xs tabular-nums text-muted-foreground">
            {showCardCheckbox
              ? `已选 ${visibleCheckedCount} / ${staged.length} 篇`
              : `${staged.length} 篇`}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {showCardCheckbox && staged.length > 0 ? (
            <button
              type="button"
              onClick={() =>
                setCheckedPaperIds(
                  allChecked ? [] : staged.map((p) => p.paperId),
                )
              }
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              {allChecked ? '取消全选' : '全选'}
            </button>
          ) : null}
          {isStaging && showCardCheckbox && visibleCheckedCount > 0 ? (
            <button
              type="button"
              onClick={handleRemoveChecked}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              移除已选
            </button>
          ) : null}
          {isStaging && staged.length > 0 ? (
            <ConfirmPopover
              title={`清空当前「${STAGING_FOLDER_LABEL}」的 ${staged.length} 篇论文?`}
              description="只清空这一栏,不影响收藏与其它文件夹。此操作不可撤销。"
              confirmText="清空"
              cancelText="取消"
              danger
              side="bottom"
              align="end"
              onConfirm={handleClearAll}
            >
              <button
                type="button"
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                清空
              </button>
            </ConfirmPopover>
          ) : null}
        </div>
      </div>

      <div
        ref={resolvedScrollRef}
        onScroll={onScroll}
        className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden"
      >
        <div ref={showDragHandle ? undefined : listRef}>
          {staged.length === 0 ? (
            <p className="px-3 py-6 text-xs leading-relaxed text-faint">
              勾选论文即可加入暂存区,供 PDF Chat 和矩阵分析使用。
            </p>
          ) : showDragHandle ? (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={sortableIds}
                strategy={verticalListSortingStrategy}
              >
                {staged.map((paper) => (
                  <SortablePaperRow key={paper.paperId} id={paper.paperId}>
                    {({ attributes, listeners }) => (
                      <PaperCell
                        paper={paper}
                        isFavorited={favoritedSet.has(
                          `${paper.source ?? 'stc'}:${paper.paperId}`,
                        )}
                        onRemove={isStaging ? handleRemove : undefined}
                        isWorkspaceSelected={
                          selectedPaperId === paper.paperId
                        }
                        onSelect={setSelectedPaperId}
                        showDragHandle
                        dragHandleAttributes={attributes}
                        dragHandleListeners={listeners}
                      />
                    )}
                  </SortablePaperRow>
                ))}
              </SortableContext>
            </DndContext>
          ) : (
            staged.map((paper) => (
              <div
                key={paper.paperId}
                data-paper-row={paper.paperId}
                className="group/row border-b border-border bg-background"
              >
                <PaperCell
                  paper={paper}
                  isFavorited={favoritedSet.has(
                    `${paper.source ?? 'stc'}:${paper.paperId}`,
                  )}
                  onRemove={isStaging ? handleRemove : undefined}
                  isWorkspaceSelected={selectedPaperId === paper.paperId}
                  onSelect={setSelectedPaperId}
                  showCheckbox={showCardCheckbox}
                  showPdfStatus={activeFunction === 'pdf-chat'}
                  checked={checkedPaperIds.includes(paper.paperId)}
                  onCheckedChange={() => togglePaperChecked(paper.paperId)}
                />
              </div>
            ))
          )}
        </div>
      </div>

      {/* Height-only: keeps file-column rows aligned with the matrix footer. */}
      <footer
        className="shrink-0 border-t border-border bg-surface-1"
        style={{ height: FOOTER_H }}
        aria-hidden
      />
    </aside>
  );
}

function MatrixDimPane({
  staged,
  rowHeights,
  scrollRef,
  onScroll,
}: {
  staged: Paper[];
  rowHeights: Record<string, number>;
  scrollRef: RefObject<HTMLDivElement | null>;
  onScroll: (e: UIEvent<HTMLDivElement>) => void;
}) {
  const token = useAuthStore((s) => s.token);
  const openAuthDialog = useAuthDialog((s) => s.openDialog);
  const dimensionsQ = useAnalysisDimensions();
  const matrixQ = useMatrixAnalysis(staged);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const dimensions = dimensionsQ.data ?? [];
  const results = matrixQ.data ?? [];
  const resultIndex = useMemo(() => {
    const m = new Map<string, PaperAnalysisItem>();
    for (const r of results) m.set(r.paperId, r);
    return m;
  }, [results]);

  const isLoading =
    dimensionsQ.isLoading || (matrixQ.isLoading && results.length === 0);
  const showLoginGate = !token;
  const showDimGrid = !showLoginGate && dimensions.length > 0;

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="min-h-0 flex-1 overflow-auto"
      >
        <table className="w-full border-separate border-spacing-0 text-xs">
          <thead>
            <tr>
              {showLoginGate ? (
                <th
                  className="sticky top-0 z-20 border-b border-border bg-surface-1 px-4 text-left text-xs font-bold text-muted-foreground"
                  style={{ height: HEADER_H }}
                >
                  维度
                </th>
              ) : showDimGrid ? (
                dimensions.map((d) => (
                  <th
                    key={d.dimensionKey}
                    className="sticky top-0 z-20 border-b border-r border-border bg-surface-1 px-3 text-left text-xs font-bold text-muted-foreground last:border-r-0"
                    style={{ minWidth: DIM_COL_MIN_WIDTH, height: HEADER_H }}
                    title={d.dimensionKey}
                  >
                    {d.name}
                  </th>
                ))
              ) : (
                <th
                  className="sticky top-0 z-20 border-b border-border bg-surface-1 px-4 text-left text-xs font-bold text-muted-foreground"
                  style={{ height: HEADER_H }}
                >
                  维度
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {matrixQ.error ? (
              <tr>
                <td colSpan={Math.max(dimensions.length, 1)} className="p-0">
                  <EmptyState
                    icon={AlertCircle}
                    title="分析失败"
                    description={
                      (matrixQ.error as Error).message || '请稍后重试'
                    }
                  />
                </td>
              </tr>
            ) : (
              staged.map((p) => {
                const r = resultIndex.get(p.paperId);
                const h = rowHeights[p.paperId];
                return (
                  <tr key={p.paperId}>
                    {showLoginGate ? (
                      <td
                        className="overflow-hidden border-b border-border px-4 align-middle text-faint"
                        style={h ? { height: h, maxHeight: h } : undefined}
                      >
                        <button
                          type="button"
                          onClick={() => openAuthDialog('login')}
                          className="inline-flex cursor-pointer items-center gap-1.5 text-xs transition-colors hover:text-foreground"
                        >
                          <Lock className="size-3" />
                          <span className="underline-offset-2 hover:underline">
                            登录后展开 AI 维度分析
                          </span>
                        </button>
                      </td>
                    ) : showDimGrid ? (
                      dimensions.map((d) => (
                        <td
                          key={d.dimensionKey}
                          className="overflow-hidden border-b border-r border-border px-3 align-top text-subtle last:border-r-0"
                          style={{
                            minWidth: DIM_COL_MIN_WIDTH,
                            ...(h ? { height: h, maxHeight: h } : {}),
                          }}
                        >
                          <div className="h-full min-h-0 overflow-auto py-3">
                            <DimensionCell
                              item={r}
                              dimensionKey={d.dimensionKey}
                              isFetching={
                                !!matrixQ.loadingByPaperId.get(p.paperId)
                              }
                            />
                          </div>
                        </td>
                      ))
                    ) : (
                      <td
                        className="overflow-hidden border-b border-border px-4 align-middle text-faint"
                        style={h ? { height: h, maxHeight: h } : undefined}
                      >
                        <span className="inline-flex items-center gap-1.5 text-xs">
                          {isLoading ? (
                            <>
                              <Loader2 className="size-3 animate-spin" />
                              加载维度配置…
                            </>
                          ) : (
                            '维度未配置'
                          )}
                        </span>
                      </td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <footer
        className="flex shrink-0 items-center justify-between gap-2 border-t border-border bg-surface-1 px-4 text-xs text-muted-foreground"
        style={{ height: FOOTER_H }}
      >
        <span className="min-w-0 truncate">
          {showDimGrid && staged.length > 0 ? (
            `矩阵就绪 · ${staged.length} 行 × ${dimensions.length} 列`
          ) : showLoginGate ? (
            <button
              type="button"
              onClick={() => openAuthDialog('login')}
              className="underline-offset-2 transition-colors hover:text-foreground hover:underline"
            >
              登录后启用矩阵分析
            </button>
          ) : (
            '矩阵还是空的,先添加论文吧'
          )}
        </span>
        <div className="flex shrink-0 items-center gap-1.5">
          {matrixQ.isFetching && (
            <Loader2 className="size-3 shrink-0 animate-spin text-muted-foreground" />
          )}
          <div className="hidden items-center gap-1.5 lg:flex">
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              disabled={!token}
              className="inline-flex h-7 items-center gap-1 rounded-sm border border-border px-2.5 text-xs text-subtle hover:bg-surface-1 disabled:cursor-not-allowed disabled:opacity-50"
              title={token ? '设置维度列' : '登录后可设置'}
            >
              <Settings2 className="size-3" />
              设置列
            </button>
            <ExportMenu
              papers={staged}
              dimensions={dimensions}
              resultIndex={resultIndex}
            />
          </div>
          <MatrixMoreToolsMenu
            className="flex lg:hidden"
            disabled={!token}
            exportDisabled={
              staged.length === 0 || dimensions.length === 0 || !token
            }
            onOpenSettings={() => setSettingsOpen(true)}
            onExport={async (fmt) => {
              try {
                const rows = buildMatrixRows(staged, dimensions, resultIndex);
                if (fmt === 'csv') exportCsv(rows, dimensions, 'matrix');
                else if (fmt === 'md')
                  exportMarkdown(rows, dimensions, 'matrix');
                else await exportXlsx(rows, dimensions, 'matrix');
              } catch (err) {
                toast.error(`导出失败:${(err as Error).message}`);
              }
            }}
          />
        </div>
      </footer>

      <DimensionSettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
      />
    </div>
  );
}

export function MatrixColumn({ staged }: { staged: Paper[] }) {
  return <WorkspaceStage kind="matrix" staged={staged} />;
}
