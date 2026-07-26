import {
  forwardRef,
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  ChevronDown,
  Inbox,
  LogIn,
  Lock,
  Search,
  Share2,
  UserPlus,
  X,
} from 'lucide-react';
import { RouteSEO } from '@/shared/components/RouteSEO';
import { SidebarLayout } from '@/shared/components/sidebar';
import { EmptyState } from '@/shared/components/EmptyState';
import { Button } from '@/shared/ui/button';
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/shared/ui/hover-card';
import { useRegisterSidebarRail } from '@/stores/sidebar.store';
import { useAuthStore } from '@/stores/auth.store';
import { useAuthDialog } from '@/stores/auth-dialog.store';
import { useDebounce, useScrollRestoration, useUrlState } from '@/shared/hooks';
import { LibrarySidebar } from '../components/LibrarySidebar';
import { LibraryPaperList } from '../components/LibraryPaperList';
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
import { cn } from '@/shared/lib/utils';

// 统一工作台弹窗 —— 与 LibraryPaperRow 同款 lazy + 条件 mount:静态 import 会把
// 这个大弹窗打进页面主 chunk,击穿行级入口的 lazy 拆分;type import 不影响 chunk。
const PaperWorkbenchDialog = lazy(() =>
  import('../components/PaperWorkbenchDialog').then((m) => ({
    default: m.PaperWorkbenchDialog,
  })),
);

/**
 * 我的文献集 —— 只有"我的文件夹列表 + 论文列表 + 工具栏"。
 *
 *   左:LibrarySidebar(单层文件夹列表)
 *   右:LibraryFolderView(论文列表 + 操作工具栏)
 *
 * **论文 / 期刊 / 学者详情** 已迁出到独立的 /browser/* 路由(浏览器):
 *   - useOpenPaperInBrowser / useOpenJournalInBrowser / useOpenAuthorInBrowser
 *     hook 仍然在任何位置触发,只是导航到 /browser/...
 *   - tab 仓库见 stores/browser-tabs.store
 *   - 顶部 Globe 入口由 TopNav MenuCarousel 渲染(tabs 为空时禁用)
 *
 * 未登录:主区显示 LibraryLoginPrompt(登录/注册引导),侧栏 LibrarySidebar 自身
 * 也会渲染未登录提示段。
 */
export function LibraryPage() {
  const token = useAuthStore((s) => s.token);

  // 折叠侧栏时顶栏 chip 入口
  useRegisterSidebarRail([
    { id: 'library', label: '我的文献集', icon: Inbox, sectionId: 'library' },
  ]);

  return (
    <SidebarLayout sidebar={<LibrarySidebar />}>
      <div className="flex flex-col h-full min-h-0 bg-background">
        <div className="flex-1 min-w-0 min-h-0 overflow-auto">
          {!token ? <LibraryLoginPrompt /> : <LibraryFolderView />}
        </div>
      </div>
    </SidebarLayout>
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
      title="登录后查看你的文献集"
      description="登录后即可创建文件夹、收藏论文,所有数据云端同步"
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

function LibraryFolderView() {
  const [params, setParams] = useSearchParams();
  const foldersQ = useLibraryFolders();
  const openShare = useShareSheetStore((s) => s.openShare);
  const shareTarget = useShareSheetStore((s) => s.target);
  const closeShare = useShareSheetStore((s) => s.closeShare);

  const folderParam = params.get('folder') ?? '';
  const folders = foldersQ.data?.folders ?? [];

  // ─── URL-backed state ────────────────────────────────────────────────
  // 所有 filter / 分页 / 排序 / 搜索词都进 URL。这样浏览器后退能完整回到原状,
  // 也能复制链接给同事看同一视图。切文件夹 by LibrarySidebar.setActive 已经
  // 重置 URL 到 `?folder=X`(丢掉其他 param),所以"切文件夹 → 清搜索回 1 页"
  // 这条心智在 URL 层面自动满足,这里不再手动 useEffect。
  const [query, setQuery] = useUrlState('q', '');
  const debouncedQuery = useDebounce(query, 300);
  const [page, setPageRaw] = useUrlState('page', 1, Number);
  const [pageSize, setPageSizeRaw] = useUrlState('size', 20, Number);
  const [sortOrder, setSortOrderRaw] = useUrlState<LibrarySortOrder>(
    'sort',
    'asc',
    (s) => (s === 'desc' ? 'desc' : 'asc')
  );

  // 搜索词 / 排序 / 页大小变化时回 1 页(URL state 不能像 useEffect 反应链路,
  // 在 setter 里显式调一次)。注意只在用户主动改这些值时回 1 页,而不是 URL
  // 因为返回导航被还原的情况(那时 page 已经从 URL 拿到正确值,不应被覆盖)。
  const setQueryAndReset = useCallback(
    (v: string) => {
      setQuery(v);
      setPageRaw(1);
    },
    [setQuery, setPageRaw]
  );
  const setSortOrder = useCallback(
    (v: LibrarySortOrder) => {
      setSortOrderRaw(v);
      setPageRaw(1);
    },
    [setSortOrderRaw, setPageRaw]
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
  const scrollRef = useRef<HTMLDivElement>(null);
  useScrollRestoration(scrollRef, 'library-paper-list');

  // 新模型不再有"根目录论文",`?folder=` 没参数 / 非法时回落到**默认文件夹**。
  // 拿不到 default(folders 还没加载完 / 真的没有)就 fallback 'root',
  // 旧的 'root' 视图保留只为 loading 期间不报错,实际看到的就是空列表。
  const filter = useMemo<LibraryFolderFilter>(() => {
    const n = Number(folderParam);
    if (folderParam && Number.isFinite(n) && n > 0) return n;
    const def = folders.find((f) => f.is_default);
    return def ? def.id : 'root';
  }, [folderParam, folders]);

  const currentFolder =
    typeof filter === 'number' ? folders.find((f) => f.id === filter) : null;
  const title = currentFolder?.name ?? '我的文献集';
  const count = currentFolder?.paper_count ?? 0;

  // 论文数据 + 选择状态都提升到此处,这样外层 header 才能在 selection 模式下
  // 渲染左对齐的 BulkToolbar(替换面包屑/搜索/导入区)
  const papersQ = useLibraryPapers(filter, {
    q: debouncedQuery,
    page,
    pageSize,
    order: sortOrder,
  });
  const papers = papersQ.data?.items ?? [];
  const total = papersQ.data?.total ?? 0;
  const selection = useLibrarySelection(papers, filter);

  // 页码钳制:批量删除/移动使 total 缩小后,当前 page 可能超界(落在空页,且
  // 分页器因 total<=pageSize 被隐藏 → 用户无 UI 途径回第 1 页)。数据落定后若
  // page 超过最后一页就自动回退。只在真超界时 set,避免与 URL 还原/翻页打架成循环。
  useEffect(() => {
    if (papersQ.isFetching || papersQ.isPlaceholderData) return;
    // 查询失败且无缓存数据时 total=0 代表「加载失败」而非「真超界」——此时别把
    // 深链的 page 静默改写成 1(否则网络抖动后用户丢了原本请求的页码)。
    if (papersQ.isError && !papersQ.data) return;
    const lastPage = total > 0 ? Math.ceil(total / pageSize) : 1;
    if (page > lastPage) setPageRaw(lastPage);
  }, [
    papersQ.isFetching,
    papersQ.isPlaceholderData,
    papersQ.isError,
    papersQ.data,
    total,
    pageSize,
    page,
    setPageRaw,
  ]);

  return (
    <div className="flex flex-col h-full min-h-0 bg-background">
      {/* 我的文献集是登录态私域内容,noindex 防止任何意外的搜索引擎收录 */}
      <RouteSEO
        title={`我的文献集 · ${title} — Scholay`}
        description="我的文献集 —— 跨设备同步的论文收藏空间,支持文件夹分组、AI 摘要、PDF 在线预览与全文检索。"
        noindex
      />

      {/*
       * 外层 Toolbar —— 对照 .pen `EIVJm`(h-60 px-40 gap-20)
       *
       * **两种模式**:
       *   - 默认:面包屑 + 搜索框 + 导入按钮(右对齐)
       *   - 选中 ≥1 项:整条替换成 LibraryBulkToolbar(左对齐),其余隐藏
       *     —— 与设计稿"批量操作居顶,统一收纳到工具栏区域"心智一致
       */}
      <header
        className={cn(
          'flex items-center h-15 px-10 bg-background border-b border-border shrink-0',
          selection.someSelected ? 'justify-start gap-3' : 'justify-end gap-5'
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
            {/* 面包屑 + 篇数 chip(无返回按钮 —— 本就是顶级页面) */}
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-14 text-muted-foreground">我的文献集</span>
              <span className="text-14 text-faint">/</span>
              <span className="text-14 font-medium text-foreground">{title}</span>
              <span className="inline-flex items-center px-1.5 py-px rounded-4 bg-surface-2 text-12 font-medium text-muted-foreground tabular-nums">
                {count.toLocaleString()} 篇
              </span>
              {currentFolder && count > 0 && (
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
                  className="inline-flex items-center gap-1 h-7 px-2 rounded-8 text-14 font-medium text-subtle hover:bg-surface-1 hover:text-foreground transition-colors"
                >
                  <Share2 className="size-3.5" /> 分享
                </button>
              )}
            </div>

            {/* 搜索框 —— 受控输入,300ms debounce 后给 LibraryPaperList
                响应式:flex-1 自然铺满中段,最小 240px(再窄按钮组开始压缩),最大 480px */}
            <div
              className={cn(
                'flex items-center gap-2 flex-1 min-w-[240px] max-w-[480px] h-[38px] px-3 rounded-8 bg-surface-1 border border-border-strong',
                'focus-within:border-foreground focus-within:ring-2 focus-within:ring-ring transition-colors'
              )}
            >
              <Search className="size-3.5 text-muted-foreground shrink-0" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQueryAndReset(e.target.value)}
                placeholder={`在「${title}」中搜索…`}
                maxLength={64}
                className="flex-1 min-w-0 h-full bg-transparent text-14 outline-none placeholder:text-faint"
              />
              {query ? (
                <button
                  type="button"
                  onClick={() => setQueryAndReset('')}
                  aria-label="清空搜索"
                  className="inline-flex h-4 w-4 items-center justify-center rounded-4 text-faint hover:bg-surface-2 hover:text-foreground shrink-0"
                >
                  <X className="size-3" />
                </button>
              ) : null}
            </div>

            {/* 加入按钮组 —— 响应式
                ≥xl(1280px):全部按钮平铺
                <xl:折叠成单个「更多 ▾」hover dropdown
                所有按钮都打开同一个统一工作台 PaperWorkbenchDialog,仅初始 tab 不同 */}
            <div className="hidden xl:flex items-center gap-2 shrink-0">
              <ToolbarButton
                label="+ 在线搜索加入"
                onClick={() => openImport('search')}
              />
              <ToolbarButton
                label="↑ 上传 PDF"
                onClick={() => openImport('pdf')}
              />
              <ComingSoonWrap>
                <ToolbarButton
                  label="从 Zotero 导入"
                  onClick={() => openImport('zotero')}
                />
              </ComingSoonWrap>
              <ComingSoonWrap>
                <ToolbarButton
                  label="从 EndNote…"
                  onClick={() => openImport('endnote')}
                />
              </ComingSoonWrap>
            </div>

            {/* 收起态:仅一个「更多 ▾」按钮,hover 弹出所有导入入口
                openDelay 短一点(80ms),closeDelay 久一点(180ms)避免鼠标抖动误关 */}
            <div className="flex xl:hidden items-center shrink-0">
              <HoverCard openDelay={80} closeDelay={180}>
                <HoverCardTrigger asChild>
                  <ToolbarButton label="更多" trailingIcon />
                </HoverCardTrigger>
                <HoverCardContent
                  align="end"
                  sideOffset={6}
                  className="w-[200px] p-1.5"
                >
                  <div className="flex flex-col gap-1">
                    <CollapsedItem
                      label="+ 在线搜索加入"
                      onClick={() => openImport('search')}
                    />
                    <CollapsedItem
                      label="↑ 上传 PDF"
                      onClick={() => openImport('pdf')}
                    />
                    <CollapsedItem
                      label="从 Zotero 导入"
                      badge="即将推出"
                      onClick={() => openImport('zotero')}
                    />
                    <CollapsedItem
                      label="从 EndNote…"
                      badge="即将推出"
                      onClick={() => openImport('endnote')}
                    />
                  </div>
                </HoverCardContent>
              </HoverCard>
            </div>
          </>
        )}
      </header>

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

      <div ref={scrollRef} className="flex-1 min-h-0 overflow-auto">
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
          sortOrder={sortOrder}
          onToggleSortOrder={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
        />
      </div>

      {/* 分享面板(PC):工具栏分享当前文件夹 / 论文行分享单篇,共用本实例(store 驱动) */}
      <ShareSheet target={shareTarget} open={!!shareTarget} onOpenChange={(v) => !v && closeShare()} />
    </div>
  );
}

/**
 * Toolbar 上的统一描边白底按钮 —— .pen `tb1`-`tb4`
 * forwardRef + 透传所有原生按钮 props,这样可以作为 Radix `*Trigger asChild` 的子元素
 * (例如 QuickAddDialog 包它时,popover 的 onClick / aria-* / ref 需要落到这个 <button> 上)。
 */
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
        'inline-flex items-center gap-1 h-8 px-3 rounded-8 bg-surface-card border border-border text-14 font-medium text-subtle hover:bg-surface-1 hover:text-foreground transition-colors whitespace-nowrap',
        className
      )}
    >
      {label}
      {trailingIcon && <ChevronDown className="size-3.5 -mr-0.5" strokeWidth={2.25} />}
    </button>
  );
});

/**
 * 折叠态(更多 dropdown)里的菜单项 —— 行式按钮 + 可选 amber 角标。
 * 与展开态 ToolbarButton 形态不同(那是描边胶囊横排,这里是无边竖排菜单条)。
 */
const CollapsedItem = forwardRef<
  HTMLButtonElement,
  {
    label: string;
    badge?: string;
  } & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children'>
>(function CollapsedItem({ label, badge, className, type, ...rest }, ref) {
  return (
    <button
      ref={ref}
      type={type ?? 'button'}
      {...rest}
      className={cn(
        'flex items-center justify-between gap-2 w-full h-8 px-2 rounded-8 text-14 font-medium text-subtle hover:bg-surface-1 hover:text-foreground transition-colors text-left',
        className
      )}
    >
      <span className="truncate">{label}</span>
      {badge && (
        <span className="inline-flex items-center h-4 px-1.5 rounded-pill bg-brand-amber text-background text-12 font-medium leading-none whitespace-nowrap shrink-0">
          {badge}
        </span>
      )}
    </button>
  );
});

/**
 * 「即将推出」amber 角标 wrapper —— 与首页智能搜索 CTA 同款视觉,任意按钮裹一层即可。
 *
 * 角标用 `-top-2 -right-2` 半压在按钮右上角(notification-dot 模式),
 * 不再用 `bottom-full` —— 后者会让角标完全浮在按钮上方、跑出 h-15 工具栏的
 * 上边界被上层 AppShell topnav 视觉裁切。半压在按钮顶部既不被裁,也不压住
 * 按钮文字中段(badge 底距按钮顶 8px,按钮文字行高从 ~6px 开始,
 * 仅遮 2px 顶端纤细笔画,实际不影响可读性)。
 */
function ComingSoonWrap({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative inline-flex">
      {children}
      <span
        aria-hidden="true"
        className="absolute -top-2 -right-2 inline-flex items-center h-4 px-1.5 rounded-pill bg-brand-amber text-background text-12 font-medium leading-none whitespace-nowrap pointer-events-none z-raised"
      >
        即将推出
      </span>
    </div>
  );
}

export default LibraryPage;
