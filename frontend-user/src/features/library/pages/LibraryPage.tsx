import {
  forwardRef,
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  ChevronDown,
  Inbox,
  Grid3x3,
  Loader2,
  LogIn,
  Lock,
  MessageSquare,
  Network,
  Plus,
  Share2,
  UserPlus,
} from 'lucide-react';
import { FeatureHub } from '@/app/layouts/FeatureHub';
import { RouteSEO } from '@/shared/components/RouteSEO';
import { EmptyState } from '@/shared/components/EmptyState';
import { useFolderAppearance } from '@/shared/components/folder-appearance';
import { Button } from '@/shared/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/ui';
import { useRegisterSidebarRail } from '@/stores/sidebar.store';
import { useAuthStore } from '@/stores/auth.store';
import { useAuthDialog } from '@/stores/auth-dialog.store';
import {
  useLocalStorage,
  useMediaQuery,
  useScrollRestoration,
  useUrlState,
} from '@/shared/hooks';
import {
  libraryFolderMetaKey,
  sortLibraryFolders,
  useLibraryFolderMeta,
} from '@/stores/library-folder-meta.store';
import { LIBRARY_STAGING_FOLDER_PARAM } from '../components/LibrarySidebar';
import { ResourceCollectionView } from '../components/ResourceCollectionView';
import { ManuscriptCollectionView } from '../components/ManuscriptCollectionView';
import { useManuscriptCollections } from '@/shared/api/manuscripts';
import {
  LIBRARY_PAGE_SIZE_OPTIONS,
  LibraryPaperList,
} from '../components/LibraryPaperList';
import { PaginationPrevNext } from '@/shared/components/PaginationPrevNext';
import { libraryRowToPaper } from '@/shared/api/user-library-papers';
import { useLibraryMatrixAlign } from '../hooks/useLibraryMatrixAlign';
import {
  MatrixDimPane,
  MATRIX_FOOTER_H,
  MATRIX_HEADER_H,
} from '@/features/search/components/MatrixColumn';
import { CitationGraphPanel } from '@/features/search/components/workspace/CitationGraphPanel';
import { PdfChatPanel } from '@/features/search/components/workspace/PdfChatPanel';
import {
  collectionsForSection,
  parseResourceSection,
} from '../resource-model';
import { ShareSheet } from '@/shared/components/share/ShareSheet';
import { useShareSheetStore } from '@/shared/components/share/use-share-sheet';
import type { WorkbenchView } from '../components/PaperWorkbenchDialog';
import type { ImportTab } from '../components/library-import-dialog/types';
import { useLibraryFolders } from '../api/folders';
import {
  useLibraryPaperByUpstream,
  useLibraryPapers,
  type LibraryFolderFilter,
  type LibrarySortOrder,
} from '../api/papers';
import { useLibrarySelection } from '../hooks/useLibrarySelection';
import { LibraryBulkToolbar } from '../components/LibraryBulkToolbar';
import { useStagingActions } from '@/features/search/hooks/useStagingActions';
import { useStagingView } from '@/features/search/hooks/useStagingView';
import {
  STAGING_FOLDER_LABEL,
  useWorkspaceFolderUi,
} from '@/stores/workspace-folder.store';
import { useOpenPaperDetail } from '@/shared/hooks/useOpenInSearchPanel';
import {
  useSearchRightPanelStore,
  type WorkspaceFunctionKind,
} from '@/stores/search-right-panel.store';
import { cn } from '@/shared/lib/utils';
import type { Paper, UserLibraryPaper } from '@/shared/api/types';

const LIBRARY_HEADER_H = MATRIX_HEADER_H;

function toMatrixPaper(row: UserLibraryPaper): Paper {
  const paper = libraryRowToPaper(row);
  return {
    ...paper,
    paperId: paper.paperId || `lib:${row.id}`,
  };
}

const SearchRightPanel = lazy(() =>
  import('@/features/search/components/SearchRightPanel').then((m) => ({
    default: m.SearchRightPanel,
  })),
);

const RIGHT_MIN_PX = 480;
const LIST_MIN_PX = 360;
const LIST_MAX_PX = 900;
const LIST_DEFAULT_PX = 520;

// 统一工作台弹窗 —— 与 LibraryPaperRow 同款 lazy + 条件 mount:静态 import 会把
// 这个大弹窗打进页面主 chunk,击穿行级入口的 lazy 拆分;type import 不影响 chunk。
const PaperWorkbenchDialog = lazy(() =>
  import('../components/PaperWorkbenchDialog').then((m) => ({
    default: m.PaperWorkbenchDialog,
  })),
);

/**
 * 我的资源 —— 四分：文献集 / 期刊集 / 稿件集 / 文件夹。
 *
 *   左:LibrarySidebar
 *   中:列表主区(文献集本身就是工作区,不再另挂一列工作区文献卡)
 *   右:仅文献集挂工作区功能(矩阵分析 / 图谱 / PDF Chat);点开论文详情时让位给详情页。
 *      期刊集 / 稿件集 / 资源集只要列表。
 */
export function LibraryPage() {
  const [params] = useSearchParams();
  if (!params.get('section')) {
    return <FeatureHub featureId="library" />;
  }
  return <LibraryWorkspace />;
}

function LibraryWorkspace() {
  const token = useAuthStore((s) => s.token);
  const [params] = useSearchParams();
  const section = parseResourceSection(params.get('section'));
  const isPapers = section === 'papers';
  const isNarrow = useMediaQuery('(max-width: 1024px)');

  const activePanel = useSearchRightPanelStore((s) => s.activePanel);
  const setEmbedMode = useSearchRightPanelStore((s) => s.setEmbedMode);
  const closeFileArea = useSearchRightPanelStore((s) => s.closeFileArea);
  const resetPanel = useSearchRightPanelStore((s) => s.reset);

  useRegisterSidebarRail([
    {
      id: 'library-papers',
      label: '文献集',
      icon: Inbox,
      sectionId: 'library-papers',
    },
  ]);

  useEffect(() => {
    if (!isPapers) {
      setEmbedMode(false);
      resetPanel();
      return;
    }
    setEmbedMode(true);
    closeFileArea();
    return () => {
      setEmbedMode(false);
      resetPanel();
    };
  }, [isPapers, setEmbedMode, closeFileArea, resetPanel]);

  const showingInfo = activePanel?.group === 'info';
  const [workspaceToolRaw, setWorkspaceTool] = useLocalStorage<
    WorkspaceFunctionKind | null
  >('library.workspace-tool', 'matrix');
  const workspaceTool =
    workspaceToolRaw === 'matrix' ||
    workspaceToolRaw === 'citation-graph' ||
    workspaceToolRaw === 'pdf-chat'
      ? workspaceToolRaw
      : null;
  const [matrixPapers, setMatrixPapers] = useState<Paper[]>([]);
  const setVisibleMatrixPapers = useCallback((next: Paper[]) => {
    setMatrixPapers((prev) => {
      if (
        prev.length === next.length &&
        prev.every((paper, index) => paper.paperId === next[index]?.paperId)
      ) {
        return prev;
      }
      return next;
    });
  }, []);
  const toggleWorkspaceTool = useCallback(
    (kind: WorkspaceFunctionKind) => {
      const panel = useSearchRightPanelStore.getState().activePanel;
      if (panel?.group === 'info') {
        useSearchRightPanelStore.setState({ activePanel: null });
        setWorkspaceTool(kind);
        return;
      }
      setWorkspaceTool((cur) => (cur === kind ? null : kind));
    },
    [setWorkspaceTool],
  );
  const showRightPanel = isPapers && !!token && !isNarrow;
  const showTool = showRightPanel && !!workspaceTool && !showingInfo;
  const showMatrix = showTool && workspaceTool === 'matrix';
  const showInfo = showRightPanel && showingInfo;
  const showRightChrome = showTool || showInfo;

  useEffect(() => {
    if (
      workspaceTool !== 'pdf-chat' &&
      workspaceTool !== 'citation-graph'
    ) {
      return;
    }
    useWorkspaceFolderUi
      .getState()
      .setCheckedPaperIds(matrixPapers.map((paper) => paper.paperId));
  }, [workspaceTool, matrixPapers]);
  const align = useLibraryMatrixAlign(showMatrix, matrixPapers);

  // 列表列宽可拖:展开矩阵 / 详情时中线分配比例,记忆到 localStorage
  const [listWidth, setListWidth] = useLocalStorage<number>(
    'library.list-width',
    LIST_DEFAULT_PX,
  );
  const draggingRef = useRef(false);
  const startDrag = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      draggingRef.current = true;
      const startX = e.clientX;
      const startList = listWidth;
      const onMove = (ev: PointerEvent) => {
        if (!draggingRef.current) return;
        const dx = ev.clientX - startX;
        const next = Math.max(
          LIST_MIN_PX,
          Math.min(LIST_MAX_PX, startList + dx),
        );
        setListWidth(next);
      };
      const onUp = () => {
        draggingRef.current = false;
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
        document.body.style.cursor = '';
      };
      document.body.style.cursor = 'col-resize';
      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onUp);
    },
    [listWidth, setListWidth],
  );

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="relative flex min-h-0 flex-1 bg-background">
        <div
          style={showRightChrome ? { width: listWidth } : undefined}
          className={cn(
            'flex h-full min-h-0 flex-col bg-background',
            showRightChrome ? 'shrink-0' : 'min-w-0 flex-1',
          )}
        >
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            {!token ? (
              <LibraryLoginPrompt />
            ) : section === 'papers' ? (
              <LibraryFolderView
                listScrollRef={align.listScrollRef}
                onListScroll={
                  showMatrix
                    ? () =>
                        align.syncFrom(
                          align.listScrollRef.current,
                          align.matrixScrollRef.current,
                        )
                    : undefined
                }
                hidePagination={showMatrix}
                onVisiblePapers={setVisibleMatrixPapers}
                workspaceTool={workspaceTool}
                onToggleTool={toggleWorkspaceTool}
                showWorkspaceTools={showRightPanel}
              />
            ) : section === 'manuscripts' ? (
              <ManuscriptSectionView />
            ) : (
              <LibraryMockSectionView section={section} />
            )}
          </div>
        </div>

        {showRightChrome && (
          <>
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="拖动调整列表与工作区宽度"
              onPointerDown={startDrag}
              className="relative w-px shrink-0 cursor-col-resize bg-border transition-colors hover:bg-foreground/30"
            >
              <span className="absolute inset-y-0 -left-1 -right-1" />
            </div>

            <div
              className="h-full min-h-0 min-w-0 flex-1 overflow-x-auto"
              style={{ minWidth: RIGHT_MIN_PX }}
            >
              <div className="h-full w-full min-w-0">
                {showInfo ? (
                  <Suspense
                    fallback={
                      <div className="flex h-full items-center justify-center text-faint">
                        <Loader2 className="size-5 animate-spin" />
                      </div>
                    }
                  >
                    <SearchRightPanel variant="assistant" />
                  </Suspense>
                ) : workspaceTool === 'pdf-chat' ? (
                  <PdfChatPanel staged={matrixPapers} />
                ) : workspaceTool === 'citation-graph' ? (
                  <CitationGraphPanel staged={matrixPapers} />
                ) : (
                  <MatrixDimPane
                    staged={matrixPapers}
                    rowHeights={align.rowHeights}
                    scrollRef={align.matrixScrollRef}
                    onScroll={() =>
                      align.syncFrom(
                        align.matrixScrollRef.current,
                        align.listScrollRef.current,
                      )
                    }
                    headerHeight={LIBRARY_HEADER_H}
                    headerInScroll={false}
                  />
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * 稿件集 section —— 接稿件共享资源层的真数据(集合来自 API,不再用静态 mock)。
 * URL `?folder=<collectionId>` 与默认集合回落逻辑与 LibraryMockSectionView 同构。
 */
function ManuscriptSectionView() {
  const [params, setParams] = useSearchParams();
  const collectionsQ = useManuscriptCollections();
  const collections = collectionsQ.data ?? [];
  const folderParam = params.get('folder') ?? '';
  const collection =
    collections.find((c) => c.id === folderParam) ??
    collections.find((c) => c.isDefault) ??
    collections[0] ??
    null;

  useEffect(() => {
    if (!collection) return;
    if (folderParam === collection.id) return;
    setParams(
      (p) => {
        p.set('section', 'manuscripts');
        p.set('folder', collection.id);
        return p;
      },
      { replace: true },
    );
  }, [collection, folderParam, setParams]);

  return (
    <ManuscriptCollectionView
      collection={collection}
      loading={collectionsQ.isLoading}
    />
  );
}

function LibraryMockSectionView({
  section,
}: {
  section: Exclude<ReturnType<typeof parseResourceSection>, 'papers'>;
}) {
  const [params, setParams] = useSearchParams();
  const collections = collectionsForSection(section);
  const folderParam = params.get('folder') ?? '';
  const collection =
    collections.find((c) => c.id === folderParam) ??
    collections.find((c) => c.isDefault) ??
    collections[0] ??
    null;

  // 无 folder 时落到默认集合，保证侧栏高亮与 URL 一致
  useEffect(() => {
    if (!collection) return;
    if (folderParam === collection.id) return;
    setParams(
      (p) => {
        p.set('section', section);
        p.set('folder', collection.id);
        return p;
      },
      { replace: true },
    );
  }, [collection, folderParam, section, setParams]);

  return (
    <ResourceCollectionView section={section} collection={collection} />
  );
}

// ============================================================================
// 未登录访问 /library 主区:登录引导卡(带"登录""注册"双按钮)
// ============================================================================

function LibraryLoginPrompt() {
  const openDialog = useAuthDialog((s) => s.openDialog);
  return (
    <EmptyState
      icon={Lock}
      title="登录后查看你的资源"
      description="文献集、期刊集、稿件集与通用文件夹，登录后云端同步"
      action={
        <div className="flex items-center gap-3">
          <Button onClick={() => openDialog('login')} variant="primary">
            <LogIn className="size-4" />
            登录
          </Button>
          <Button onClick={() => openDialog('register')} variant="outline">
            <UserPlus className="size-4" />
            注册
          </Button>
        </div>
      }
    />
  );
}

// ============================================================================
// 文件夹视图(原 LibraryPage body) —— shell 路由 / 时渲染
// ============================================================================

function LibraryFolderView({
  listScrollRef,
  onListScroll,
  hidePagination = false,
  onVisiblePapers,
  workspaceTool = null,
  onToggleTool,
  showWorkspaceTools = false,
}: {
  listScrollRef?: RefObject<HTMLDivElement | null>;
  onListScroll?: () => void;
  hidePagination?: boolean;
  onVisiblePapers?: (papers: Paper[]) => void;
  workspaceTool?: WorkspaceFunctionKind | null;
  onToggleTool?: (kind: WorkspaceFunctionKind) => void;
  showWorkspaceTools?: boolean;
}) {
  const [params, setParams] = useSearchParams();
  const foldersQ = useLibraryFolders();
  const openShare = useShareSheetStore((s) => s.openShare);
  const shareTarget = useShareSheetStore((s) => s.target);
  const closeShare = useShareSheetStore((s) => s.closeShare);

  const folderParam = params.get('folder') ?? '';
  const folders = foldersQ.data?.folders ?? [];
  const isStagingView = folderParam === LIBRARY_STAGING_FOLDER_PARAM;
  const { activeArea } = useStagingView();
  const { removePaper } = useStagingActions();
  const stagingPapers = activeArea?.papers ?? [];

  // ─── URL-backed state ────────────────────────────────────────────────
  // 分页 / 排序进 URL。切文件夹会改 `?folder=`,页码在 setter 里回 1。
  const [page, setPageRaw] = useUrlState('page', 1, Number);
  const [pageSize, setPageSizeRaw] = useUrlState('size', 20, Number);
  const [sortOrder] = useUrlState<LibrarySortOrder>(
    'sort',
    'asc',
    (s) => (s === 'desc' ? 'desc' : 'asc')
  );

  const setPageSize = useCallback(
    (v: number) => {
      setPageSizeRaw(v);
      setPageRaw(1);
    },
    [setPageSizeRaw, setPageRaw]
  );
  const setPage = setPageRaw;

  // 统一工作台弹窗 —— 4 个工具栏按钮(在线搜索 / PDF / Zotero / EndNote)开同一个
  // PaperWorkbenchDialog 的「添加」语境,只是 initialTab 不同;行级 chip 入口在
  // LibraryPaperRow 内部各自挂「管理」语境。
  //
  // ⚠️ Radix 铁律(见 frontend CLAUDE.md):Dialog 绝不能在 open 仍为 true 时被
  // unmount(否则 body pointer-events:none 锁泄漏 → 全站点击失灵)。这里用「先关再卸」:
  //   - open 由独立 workbenchOpen 控制;关闭先把它置 false 让 Radix 跑完清理,
  //   - 延一拍再清 workbench 数据(卸载 lazy 组件)。
  //   - openSeq 作 key:即便在延迟窗口内重开,也强制 remount 拿到新 initial。
  const [workbench, setWorkbench] = useState<WorkbenchView | null>(null);
  const [workbenchOpen, setWorkbenchOpen] = useState(false);
  const [workbenchSeq, setWorkbenchSeq] = useState(0);
  const workbenchCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const openWorkbench = useCallback((view: WorkbenchView) => {
    if (workbenchCloseTimer.current) {
      clearTimeout(workbenchCloseTimer.current);
      workbenchCloseTimer.current = null;
    }
    setWorkbench(view);
    setWorkbenchSeq((n) => n + 1);
    setWorkbenchOpen(true);
  }, []);
  const closeImport = useCallback(() => {
    setWorkbenchOpen(false); // 先关:让 Radix 跑 open→false 的清理(还原 body 锁)
    if (workbenchCloseTimer.current) clearTimeout(workbenchCloseTimer.current);
    workbenchCloseTimer.current = setTimeout(() => setWorkbench(null), 250); // 再卸
  }, []);
  const openImport = useCallback(
    (t: ImportTab) => openWorkbench({ mode: 'add', tab: t }),
    [openWorkbench]
  );
  const goFolder = useCallback(
    (folderId: number) => {
      setParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set('section', 'papers');
        next.set('folder', String(folderId));
        next.delete('page');
        next.delete('q');
        return next;
      });
    },
    [setParams],
  );
  useEffect(
    () => () => {
      if (workbenchCloseTimer.current) clearTimeout(workbenchCloseTimer.current);
    },
    []
  );

  // 深链 ?manage=<source>:<sourcePaperId> —— 库外收藏成功 toast 的「完善信息」
  // action 跳转到这里:等 by-upstream 查到行后打开管理语境,并清掉 param
  // (避免刷新 / 后退重复弹)。
  const manageParam = params.get('manage') ?? '';
  const manageKey = useMemo(() => {
    const i = manageParam.indexOf(':');
    if (i <= 0) return null;
    return {
      source: manageParam.slice(0, i) as import('@/shared/api/types').PaperSource,
      id: manageParam.slice(i + 1),
    };
  }, [manageParam]);
  const deepRowQ = useLibraryPaperByUpstream(manageKey?.source, manageKey?.id);
  const clearManageParam = useCallback(() => {
    setParams(
      (p) => {
        p.delete('manage');
        return p;
      },
      { replace: true }
    );
  }, [setParams]);
  useEffect(() => {
    // 新鲜度门槛:挂载瞬间缓存里可能躺着上次深链的陈旧 null(行其实已重新收藏),
    // 等本次 refetch 落定再消费,避免按陈旧缓存误判。
    if (deepRowQ.isFetching) return;
    if (!manageKey) return;
    if (deepRowQ.isSuccess) {
      if (deepRowQ.data) {
        openWorkbench({ mode: 'manage', paper: deepRowQ.data, tab: 'metadata' });
      } else {
        // 行真不存在(已被删除/取消收藏)→ 给出明确反馈,不再完全静默
        toast.error('该论文已不在文献集中');
      }
      clearManageParam();
    } else if (deepRowQ.isError) {
      clearManageParam();
    }
  }, [
    manageKey,
    deepRowQ.isFetching,
    deepRowQ.isSuccess,
    deepRowQ.isError,
    deepRowQ.data,
    clearManageParam,
    openWorkbench,
  ]);

  // 列表滚动位置恢复 —— 点击论文进详情页 → 浏览器后退,自动滚回原位
  // 键 = URL(包含 folder/q/page/sort/size 所有过滤),不同视图各自独立
  const localScrollRef = useRef<HTMLDivElement>(null);
  const scrollRef = listScrollRef ?? localScrollRef;
  useScrollRestoration(scrollRef, 'library-paper-list');

  // 新模型不再有"根目录论文",`?folder=` 没参数 / 非法时回落到**默认文件夹**。
  // `?folder=staging` 走暂存区视图(不查文献集 papers API)。
  const filter = useMemo<LibraryFolderFilter>(() => {
    if (isStagingView) return 'root';
    const n = Number(folderParam);
    if (folderParam && Number.isFinite(n) && n > 0) return n;
    const def = folders.find((f) => f.is_default);
    return def ? def.id : 'root';
  }, [folderParam, folders, isStagingView]);

  const currentFolder =
    typeof filter === 'number' ? folders.find((f) => f.id === filter) : null;
  const title = isStagingView
    ? STAGING_FOLDER_LABEL
    : (currentFolder?.name ?? '文献集');
  const count = isStagingView
    ? stagingPapers.length
    : (currentFolder?.paper_count ?? 0);

  // 论文数据 + 选择状态都提升到此处,这样底栏才能在 selection 模式下
  // 渲染 BulkToolbar(替换搜索/导入区)
  const papersQ = useLibraryPapers(filter, {
    page,
    pageSize,
    order: sortOrder,
    enabled: !isStagingView,
  });
  const papers = papersQ.data?.items ?? [];
  const total = isStagingView ? stagingPapers.length : (papersQ.data?.total ?? 0);
  const selection = useLibrarySelection(papers, filter);
  const showPager =
    !isStagingView &&
    !(total <= LIBRARY_PAGE_SIZE_OPTIONS[0] && total <= pageSize);

  useEffect(() => {
    if (!onVisiblePapers) return;
    onVisiblePapers(
      isStagingView ? stagingPapers : papers.map(toMatrixPaper),
    );
  }, [isStagingView, onVisiblePapers, papers, stagingPapers]);

  // 页码钳制:批量删除/移动使 total 缩小后,当前 page 可能超界(落在空页,且
  // 分页器因 total<=pageSize 被隐藏 → 用户无 UI 途径回第 1 页)。数据落定后若
  // page 超过最后一页就自动回退。只在真超界时 set,避免与 URL 还原/翻页打架成循环。
  useEffect(() => {
    if (isStagingView) return;
    if (papersQ.isFetching || papersQ.isPlaceholderData) return;
    // 查询失败且无缓存数据时 total=0 代表「加载失败」而非「真超界」——此时别把
    // 深链的 page 静默改写成 1(否则网络抖动后用户丢了原本请求的页码)。
    if (papersQ.isError && !papersQ.data) return;
    const lastPage = total > 0 ? Math.ceil(total / pageSize) : 1;
    if (page > lastPage) setPageRaw(lastPage);
  }, [
    isStagingView,
    papersQ.isFetching,
    papersQ.isPlaceholderData,
    papersQ.isError,
    papersQ.data,
    total,
    pageSize,
    page,
    setPageRaw,
  ]);

  if (isStagingView) {
    return (
      <div className="flex h-full min-h-0 flex-col bg-background">
        <RouteSEO
          title={`文献集 · ${STAGING_FOLDER_LABEL} — Scholay`}
          description="暂存区 —— 检索工作区的临时文献篮。"
          noindex
        />
        <header className="flex h-11 shrink-0 items-center gap-2 border-b border-border bg-background px-10">
          <span className="text-14 font-medium text-foreground">
            {STAGING_FOLDER_LABEL}
          </span>
          <span className="inline-flex items-center rounded-sm bg-surface-2 px-1.5 py-px text-xs font-semibold tabular-nums text-muted-foreground">
            {count.toLocaleString()} 篇
          </span>
          <span className="ml-2 text-2xs text-faint">
            检索时勾选加入的临时篮,不会自动进文献集
          </span>
          {showWorkspaceTools && onToggleTool ? (
            <LibraryWorkspaceTools
              className="ml-auto"
              active={workspaceTool}
              onToggle={onToggleTool}
            />
          ) : null}
        </header>
        <div
          ref={scrollRef}
          onScroll={onListScroll}
          className="min-h-0 flex-1 overflow-auto"
        >
          <LibraryStagingPaperList
            papers={stagingPapers}
            areaId={activeArea?.id ?? null}
            onRemove={(paperId) => {
              if (!activeArea) return;
              removePaper(activeArea.id, paperId);
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0 bg-background">
      <RouteSEO
        title={`文献集 · ${title} — Scholay`}
        description="文献集 —— 以论文为单元的收藏空间，支持文件夹分组、AI 摘要、PDF 预览与全文检索。"
        noindex
      />

      {/* 统一工作台弹窗 —— 「添加」语境(在线搜索 / 本地上传 / Zotero / EndNote)
          + 深链打开的「管理」语境共用。open 由 workbenchOpen 控制(先关再卸,见上),
          workbenchSeq 作 key 保证重开拿到新 initial。 */}
      {workbench && (
        <Suspense fallback={null}>
          <PaperWorkbenchDialog
            key={workbenchSeq}
            open={workbenchOpen}
            onOpenChange={(v) => !v && closeImport()}
            initial={workbench}
            currentFilter={filter}
            currentFolderName={title}
          />
        </Suspense>
      )}

      <header
        className={cn(
          '@container flex h-11 shrink-0 items-center border-b border-border bg-background',
          'px-4 @3xl:px-6 @5xl:px-10',
          selection.someSelected ? 'justify-start gap-2' : 'justify-between gap-2',
        )}
      >
        {selection.someSelected ? (
          <LibraryBulkToolbar
            selectedCount={selection.selected.size}
            totalCount={papers.length}
            allSelected={selection.allSelected}
            folders={folders}
            currentFilter={filter}
            ids={selection.selectedIds}
            onToggleAll={selection.toggleAll}
            onClear={selection.clear}
          />
        ) : (
          <>
            <LibraryFolderSwitcher
              folders={folders}
              currentId={currentFolder?.id ?? null}
              currentLabel={title}
              onSelect={goFolder}
            />
            <div className="flex shrink-0 items-center gap-2">
              {showWorkspaceTools && onToggleTool ? (
                <LibraryWorkspaceTools
                  active={workspaceTool}
                  onToggle={onToggleTool}
                />
              ) : null}
              <LibraryImportMenu onImport={openImport} />
              {currentFolder && count > 0 ? (
                <button
                  type="button"
                  onClick={() =>
                    openShare({
                      kind: 'collection',
                      folderId: currentFolder.id,
                      folderName: title,
                      paperCount: count,
                      samplePapers: papers
                        .slice(0, 5)
                        .map((r) => ({
                          title: (r.og_title || r.title) ?? '',
                          venue: r.og_venue || r.venue,
                          year: r.og_year || r.year,
                        }))
                        .filter((p) => p.title),
                    })
                  }
                  className="inline-flex h-8 shrink-0 items-center gap-1 rounded-8 px-2 text-14 font-medium text-subtle transition-colors hover:bg-surface-1 hover:text-foreground"
                >
                  <Share2 className="size-3.5" />
                  分享
                </button>
              ) : null}
            </div>
          </>
        )}
      </header>

      <div
        ref={scrollRef}
        onScroll={onListScroll}
        className="min-h-0 flex-1 overflow-auto"
      >
        <LibraryPaperList
          papers={papers}
          filter={filter}
          isLoading={papersQ.isLoading}
          error={(papersQ.error as Error | null) ?? null}
          selection={selection}
          total={total}
          page={page}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
          hidePagination={hidePagination}
        />
      </div>
      {hidePagination && showPager ? (
        <footer
          className="flex shrink-0 items-center border-t border-border bg-surface-1 px-4"
          style={{ height: MATRIX_FOOTER_H }}
        >
          <PaginationPrevNext
            page={page}
            onPageChange={setPage}
            totalPages={Math.max(1, Math.ceil(total / pageSize))}
            total={total}
            rangeStart={total === 0 ? 0 : (page - 1) * pageSize + 1}
            rangeEnd={Math.min(page * pageSize, total)}
            pageSize={pageSize}
            pageSizeOptions={LIBRARY_PAGE_SIZE_OPTIONS}
            onPageSizeChange={setPageSize}
            className="w-full py-0"
          />
        </footer>
      ) : null}

      {/* 分享面板(PC):工具栏分享当前文件夹 / 论文行分享单篇,共用本实例(store 驱动) */}
      <ShareSheet target={shareTarget} open={!!shareTarget} onOpenChange={(v) => !v && closeShare()} />
    </div>
  );
}

/** 文献集内打开暂存区时的简易论文列表(与文献集行模型不同,不走 LibraryPaperRow) */
function LibraryStagingPaperList({
  papers,
  areaId,
  onRemove,
}: {
  papers: Paper[];
  areaId: string | null;
  onRemove: (paperId: string) => void;
}) {
  const openDetail = useOpenPaperDetail();

  if (papers.length === 0) {
    return (
      <EmptyState
        icon={Inbox}
        title="暂存区还是空的"
        description="在检索结果里勾选论文即可加入暂存区,方便矩阵分析与批量整理。"
      />
    );
  }

  return (
    <ul className="mx-auto flex w-full max-w-3xl flex-col px-10 py-4">
      {papers.map((p) => (
        <li
          key={`${p.source ?? 'x'}:${p.paperId}`}
          data-paper-row={p.paperId}
          className="group flex items-start gap-3 border-b border-border px-1 py-3"
        >
          <button
            type="button"
            onClick={() => openDetail(p)}
            className="min-w-0 flex-1 text-left"
          >
            <div className="text-sm font-semibold leading-snug text-foreground hover:text-brand-red">
              {p.title || '无标题'}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 text-2xs text-faint">
              {p.year != null && (
                <span className="tabular-nums">{p.year}</span>
              )}
              {p.venue && (
                <span className="min-w-0 truncate italic">{p.venue}</span>
              )}
            </div>
          </button>
          {areaId && (
            <button
              type="button"
              onClick={() => onRemove(p.paperId)}
              className="inline-flex h-7 shrink-0 items-center rounded-sm px-2 text-2xs font-semibold text-faint opacity-0 transition-opacity hover:bg-danger-soft hover:text-brand-red group-hover:opacity-100"
              title="移出暂存区"
            >
              移出
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

/**
 * Toolbar 上的统一描边白底按钮 —— .pen `tb1`-`tb4`
 * forwardRef + 透传所有原生按钮 props,这样可以作为 Radix `*Trigger asChild` 的子元素
 * (例如 QuickAddDialog 包它时,popover 的 onClick / aria-* / ref 需要落到这个 <button> 上)。
 */
function LibraryFolderSwitcher({
  folders,
  currentId,
  currentLabel,
  onSelect,
}: {
  folders: { id: number; name: string }[];
  currentId: number | null;
  currentLabel: string;
  onSelect: (id: number) => void;
}) {
  const aliases = useLibraryFolderMeta((s) => s.aliases);
  const pinned = useLibraryFolderMeta((s) => s.pinned);
  const { Icon, hasColor, iconShellClass } = useFolderAppearance(
    currentId != null ? String(currentId) : 'folder',
    'folder',
  );
  const rows = sortLibraryFolders(
    folders.map((f) => ({
      ...f,
      metaKey: libraryFolderMetaKey('papers', String(f.id)),
      label: aliases[libraryFolderMetaKey('papers', String(f.id))] || f.name,
    })),
    pinned,
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          title="切换文献集"
          className={cn(
            'flex h-8 min-w-0 max-w-[16rem] items-center gap-2 rounded-8 border border-border-strong bg-surface-1 px-2.5 text-left',
            '@3xl:h-[38px] @3xl:max-w-[20rem] @3xl:px-3',
            'transition-colors hover:border-foreground',
          )}
        >
          <span
            className={cn(iconShellClass, 'size-5', !hasColor && 'text-faint')}
            aria-hidden
          >
            <Icon className="size-3.5" strokeWidth={2} />
          </span>
          <span className="min-w-0 flex-1 truncate text-14 font-medium text-foreground">
            {currentId != null
              ? aliases[libraryFolderMetaKey('papers', String(currentId))] ||
                currentLabel
              : currentLabel}
          </span>
          <ChevronDown className="size-3.5 shrink-0 text-faint" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        {rows.map((row) => (
          <FolderSwitchItem
            key={row.id}
            id={row.id}
            label={row.label}
            active={row.id === currentId}
            onSelect={() => onSelect(row.id)}
          />
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function FolderSwitchItem({
  id,
  label,
  active,
  onSelect,
}: {
  id: number;
  label: string;
  active: boolean;
  onSelect: () => void;
}) {
  const { Icon, hasColor, iconShellClass } = useFolderAppearance(
    String(id),
    'folder',
  );
  return (
    <DropdownMenuItem
      onSelect={onSelect}
      className={cn(active && 'bg-surface-2 font-medium')}
    >
      <span
        className={cn(iconShellClass, 'size-5', !hasColor && 'text-faint')}
        aria-hidden
      >
        <Icon className="size-3.5" strokeWidth={2} />
      </span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </DropdownMenuItem>
  );
}

function LibraryImportMenu({
  onImport,
}: {
  onImport: (tab: ImportTab) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <ToolbarButton label="加入" trailingIcon />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem onSelect={() => onImport('search')}>
          <Plus className="size-3.5" />
          在线搜索加入
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onImport('pdf')}>
          上传 PDF
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onImport('zotero')}>
          从 Zotero 导入
          <span className="ml-auto text-12 text-faint">即将推出</span>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onImport('endnote')}>
          从 EndNote 导入
          <span className="ml-auto text-12 text-faint">即将推出</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const LIBRARY_WORKSPACE_TOOLS: Array<{
  kind: WorkspaceFunctionKind;
  label: string;
  icon: typeof Grid3x3;
}> = [
  { kind: 'matrix', label: '矩阵分析', icon: Grid3x3 },
  { kind: 'citation-graph', label: '图谱', icon: Network },
  { kind: 'pdf-chat', label: 'PDF Chat', icon: MessageSquare },
];

function LibraryWorkspaceTools({
  active,
  onToggle,
  className,
}: {
  active: WorkspaceFunctionKind | null;
  onToggle: (kind: WorkspaceFunctionKind) => void;
  className?: string;
}) {
  return (
    <div
      className={cn('flex shrink-0 items-center gap-1', className)}
      role="radiogroup"
      aria-label="工作区功能"
    >
      {LIBRARY_WORKSPACE_TOOLS.map(({ kind, label, icon: Icon }) => {
        const pressed = active === kind;
        return (
          <button
            key={kind}
            type="button"
            role="radio"
            aria-checked={pressed}
            onClick={() => onToggle(kind)}
            className={cn(
              'inline-flex h-8 shrink-0 items-center gap-1 rounded-8 px-2 text-14 font-medium transition-colors',
              pressed
                ? 'bg-foreground text-background'
                : 'text-subtle hover:bg-surface-1 hover:text-foreground',
            )}
          >
            <Icon className="size-3.5" />
            {label}
          </button>
        );
      })}
    </div>
  );
}

const ToolbarButton = forwardRef<
  HTMLButtonElement,
  {
    label: string;
    /** 右侧追加 ChevronDown(用于「更多」hover dropdown 触发器) */
    trailingIcon?: boolean;
  } & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children'>
>(function ToolbarButton({ label, trailingIcon, className, type, ...rest }, ref) {
  return (
    <button
      ref={ref}
      type={type ?? 'button'}
      {...rest}
      className={cn(
        'inline-flex items-center gap-1 h-8 px-3 rounded-sm bg-background border border-border text-sm font-semibold text-subtle hover:bg-surface-1 hover:text-foreground transition-colors whitespace-nowrap',
        className
      )}
    >
      {label}
      {trailingIcon && <ChevronDown className="size-3.5 -mr-0.5" strokeWidth={2.25} />}
    </button>
  );
});

export default LibraryPage;
