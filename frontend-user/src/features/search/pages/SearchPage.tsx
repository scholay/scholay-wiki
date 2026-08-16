import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { FolderOpen, Loader2 } from 'lucide-react';
import { FeatureHub } from '@/app/layouts/FeatureHub';
import { RouteSEO } from '@/shared/components/RouteSEO';
import { useLocalStorage } from '@/shared/hooks';
import { PAGE_TRANSITION } from '@/shared/lib/motion';
import { useRegisterSidebarRail } from '@/stores/sidebar.store';
import { SearcherColumn, type SearchMode } from '../components/SearcherColumn';
import { StageFlyLayer } from '../components/StageFlyLayer';
import { useStagingActions } from '../hooks/useStagingActions';
import { useStagingView } from '../hooks/useStagingView';
import { useUrlFilters } from '../hooks/useUrlFilters';
import type { Paper } from '../api/papers';
import { useSearchRightPanelStore } from '@/stores/search-right-panel.store';
import { usePdfChatBridge } from '@/stores/pdf-chat-bridge.store';
import { useSmartSearchSessionStore } from '@/stores/smart-search-session.store';
import { cn } from '@/shared/lib/utils';
import { ExpansionAreaOpenDock } from '../components/workspace/ExpansionAreaOpenDock';
import {
  ColumnResizeHandle,
  FILE_COL_DEFAULT_PX,
  FILE_COL_MAX_PX,
  FILE_COL_MIN_PX,
  startColumnResize,
} from '../components/workspace/ColumnResizeHandle';

/**
 * 右侧拓展面板 —— 多标签(论文 / 期刊 / 学者 / 工作区)。
 */
const SearchRightPanel = lazy(() =>
  import('../components/SearchRightPanel').then((m) => ({
    default: m.SearchRightPanel,
  }))
);

const SEARCHER_MIN_PX = 380;
const SEARCHER_MAX_PX = 900;
const SEARCHER_DEFAULT_PX = 480;
const RIGHT_MIN_PX = 480; // 功能/详情展开时右侧最小可视宽,撑不下时 main 出横向滚

/**
 * 文献搜索结果页 ——
 *
 *   [SidebarLayout(文件夹快捷+筛选)]
 *     ┌─ Searcher ─┬──────────┬───────────────────────────────┐
 *     │  搜索器    │  文件区  │  拓展区(PDF Chat / 矩阵 / 详情)│
 *     │ (px 锁定)  │  文献卡  │                                 │
 *     └────────────┴──────────┴───────────────────────────────┘
 *   主内容检索到论文后拉开文件区暂存;拓展区可独立开合,右上角各有一颗重开按钮。
 *
 * **响应式策略**(用户要求):
 *   - SidebarLayout 的 aside(240px)始终 shrink-0,viewport 窄时不缩
 *   - SearcherColumn **px 固定宽度**(默认 480,可拖手柄改,记忆到 localStorage)
 *     窄屏时也不被压缩,论文卡视觉稳定
 *   - 右侧工作区 / 矩阵:flex-1 + min-w + overflow-x-auto
 *     真撑不下时这边自己出横向滚动条,sidebar / searcher 不动
 *
 * (原 ResizablePanelGroup 按 % 分配,viewport 窄时左右都缩;放弃,改纯 flex + px。)
 *
 * 关键设计:暂存区默认以列表视图展示;矩阵分析作为可选视图,切换后才加载 AI 维度列。
 *   矩阵模式下仍为单表 —— 左列(论文卡)sticky-left,与右侧维度列共享行高。
 *
 * 暂存区数据走 useStagingView(只读)+ useStagingActions(写) —— 拆开后
 * 列表项不会因 view 更新而重渲(actions 引用稳定)。匿名 localStorage,登录后端。
 * 暂存区登录后云端同步逻辑 useStagingSync 已提到 AppShell 全局触发,
 * 这里无需重复挂载。
 */
/**
 * 上次搜索状态的 localStorage key —— 整个 location.search 字符串(含 ?)。
 * 一级 /search 是干净 Hub,不再自动恢复;有 params 时仍写入 storage。
 */
const LAST_SEARCH_KEY = 'scholay.last-search';

export function SearchPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [urlParams, setUrlParams] = useSearchParams();

  useEffect(() => {
    if (!(location.state as { fresh?: boolean } | null)?.fresh) return;
    navigate({ pathname: '/search', search: '' }, { replace: true, state: null });
  }, [location.state, navigate]);

  // 有内容的搜索状态仍写入 storage(二级工作区可复用);一级 Hub 不再自动读回。
  useEffect(() => {
    if (typeof localStorage === 'undefined') return;
    const s = urlParams.toString();
    if (s) localStorage.setItem(LAST_SEARCH_KEY, `?${s}`);
  }, [urlParams]);

  // filters 来源:URL search params(useUrlFilters 自带解码/编码)。
  // 这样从 /search 进入论文详情再返回时,**浏览器 history 自带 filters**,
  // SearchPage 重新挂载也能还原。同时 URL 可分享。
  const [filters, setFilters] = useUrlFilters();
  // mode 必须显式写入:缺省 /search 是一级 Hub,不能再把「无 mode」当成传统搜索。
  const mode: SearchMode =
    urlParams.get('mode') === 'smart' ? 'smart' : 'classic';
  const queryFromUrl = (urlParams.get('q') ?? '').trim();
  const setMode = useCallback(
    (next: SearchMode) => {
      setUrlParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          p.set('mode', next);
          return p;
        },
        { replace: true }
      );
    },
    [setUrlParams]
  );

  useEffect(() => {
    usePdfChatBridge.getState().registerSmartModeRequest(() => setMode('smart'));
    return () => usePdfChatBridge.getState().registerSmartModeRequest(null);
  }, [setMode]);

  useRegisterSidebarRail([
    { id: 'all', label: '工作区', icon: FolderOpen, sectionId: 'workspace' },
  ]);

  // view 只读 —— 用 stagedIds 已是稳定引用,不需要再 useMemo 一次
  const { areas, stagedIds } = useStagingView();
  const { stagePaper, removePaper } = useStagingActions();
  const setEmbedMode = useSearchRightPanelStore((s) => s.setEmbedMode);
  const resetPanel = useSearchRightPanelStore((s) => s.reset);
  const activePanel = useSearchRightPanelStore((s) => s.activePanel);
  const fileAreaOpen = useSearchRightPanelStore((s) => s.fileAreaOpen);
  const openPanel = useSearchRightPanelStore((s) => s.openPanel);
  const conversationActive = useSmartSearchSessionStore((s) => s.conversationActive);

  // 一旦进入非首页工作区(有检索词 / 有对话),钉住壳层:模式互切即使无内容也不回落落地页,
  // 右侧拓展栏保持可见。
  const [workspacePinned, setWorkspacePinned] = useState(
    () => Boolean(queryFromUrl) || conversationActive,
  );
  useEffect(() => {
    if (queryFromUrl || conversationActive) setWorkspacePinned(true);
  }, [queryFromUrl, conversationActive]);

  const showClassicLanding =
    mode === 'classic' && !queryFromUrl && !workspacePinned;
  // 智能空态用 ClawHero 居中。文件区在主内容检索到论文后拉开;
  // 空态右上角仍可手动打开工作区 / 扩展区。
  const showRightPanel = !showClassicLanding || !!activePanel || fileAreaOpen;
  const fileOnly = fileAreaOpen && !activePanel;
  const expansionOpen = Boolean(activePanel);
  const showRightChrome = showRightPanel;
  // 文件区单独打开时贴右,搜索器仍 flex-1,不进固定宽分栏。
  const showResizeHandle = fileAreaOpen || expansionOpen;
  const expandMainColumn = !activePanel;
  const [fileColWidth, setFileColWidth] = useLocalStorage<number>(
    'search.file-col-width',
    FILE_COL_DEFAULT_PX,
  );
  const collapsedRightWidth = fileAreaOpen ? fileColWidth : 0;
  const rightMinPx = fileAreaOpen
    ? fileColWidth + (expansionOpen ? 360 : 0)
    : expansionOpen
      ? RIGHT_MIN_PX
      : 0;
  const reduceMotion = !!useReducedMotion();
  // 可承载右栏时保持 panelOpen。智能搜索开关只切检索模式,不联动扩展区开/关。
  // 文件区:智能搜索出论文即开;传统搜索仅在勾选暂存时拉开。
  useEffect(() => {
    if (showRightPanel) openPanel();
  }, [showRightPanel, openPanel]);

  // 仅挂载一次。离开页面 reset。
  useEffect(() => {
    setEmbedMode(true);
    const ap = useSearchRightPanelStore.getState().activePanel;
    if (ap?.group === 'shell') {
      useSearchRightPanelStore.getState().dismissToHub();
    }
    useSearchRightPanelStore.getState().openPanel();
    return () => {
      setEmbedMode(false);
      resetPanel();
    };
  }, [setEmbedMode, resetPanel]);


  // 跨所有区一次性 unstage —— 用 stagedIds 判断,避免遍历 papers
  const unstageAcrossAreas = useCallback(
    (paperId: string) => {
      if (!stagedIds.has(paperId)) return;
      for (const a of areas) {
        if (a.papers.some((p) => p.paperId === paperId)) {
          removePaper(a.id, paperId);
        }
      }
    },
    [areas, stagedIds, removePaper]
  );

  // 折叠与暂存完全独立:仅手动「折叠」写入 collapsedIds,勾选暂存不再自动收卡。
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(() => new Set());

  const onCollapse = useCallback((id: string) => {
    setCollapsedIds((s) => {
      if (s.has(id)) return s;
      const next = new Set(s);
      next.add(id);
      return next;
    });
  }, []);

  const onRestore = useCallback((id: string) => {
    setCollapsedIds((s) => {
      if (!s.has(id)) return s;
      const next = new Set(s);
      next.delete(id);
      return next;
    });
  }, []);

  const handleStage = useCallback(
    (paper: Paper) => {
      stagePaper(paper, mode === 'smart' ? 'smart' : 'traditional');
    },
    [stagePaper, mode],
  );

  // ── 自管 split:搜索器 / 文件区 / 拓展区 各一条拖动手柄 ───────────────
  const [searcherWidth, setSearcherWidth] = useLocalStorage<number>(
    'search.searcher-width',
    SEARCHER_DEFAULT_PX
  );

  const startSearcherFileDrag = useCallback(
    (e: React.PointerEvent) => {
      if (fileOnly) {
        startColumnResize(
          e,
          fileColWidth,
          setFileColWidth,
          FILE_COL_MIN_PX,
          FILE_COL_MAX_PX,
          -1,
        );
        return;
      }
      startColumnResize(
        e,
        searcherWidth,
        setSearcherWidth,
        SEARCHER_MIN_PX,
        SEARCHER_MAX_PX,
      );
    },
    [
      fileOnly,
      fileColWidth,
      setFileColWidth,
      searcherWidth,
      setSearcherWidth,
    ],
  );

  // SEO title 反映搜索词 —— 有 q 时拼 "{q} - 文献搜索 | Scholay";空查询时回到通用文案。
  // canonical 把 q 也带上,让 Google 把每个有意义的搜索词页面索引为独立 URL。
  const seoQuery = (urlParams.get('q') ?? '').trim();
  const seoTitle = seoQuery
    ? `${seoQuery} - 学术搜索 | Scholay`
    : '学术搜索 - Scholay | AI 驱动的学术文献检索';
  const seoDesc = seoQuery
    ? `Scholay 学术搜索: ${seoQuery}。覆盖 Semantic Scholar / OpenAlex / PubMed 多源,AI 排序 + 引用图谱 + PDF 全文,一键加入文献集。`
    : 'Scholay 学术文献搜索 —— 多源融合 (Semantic Scholar / OpenAlex / PubMed),支持高级筛选、暂存矩阵分析、AI 智能筛选。覆盖 3 亿+ 学术论文。';
  const seoCanonical = seoQuery
    ? `/search?q=${encodeURIComponent(seoQuery)}`
    : '/search';

  // 一级 /search(无 query)是干净 Hub;二级 ?mode= 或带 q/筛选才进工作区。
  if (!urlParams.toString()) {
    return <FeatureHub featureId="search" />;
  }

  return (
    <>
      <RouteSEO
        title={seoTitle}
        description={seoDesc}
        keywords="学术搜索,文献搜索,论文检索,文献查找,智能搜论文,Semantic Scholar,OpenAlex,PubMed,智能搜索,高级筛选,AI 排序,Scholay"
        canonical={seoCanonical}
      />

      <div className="relative flex h-full min-h-0 bg-background">
        <div
          style={expandMainColumn ? undefined : { width: searcherWidth }}
          className={cn(
            'relative h-full min-h-0 shrink-0',
            expandMainColumn ? 'min-w-0 flex-1' : undefined,
            fileAreaOpen && 'border-r border-border',
          )}
        >
          <SearcherColumn
            filters={filters}
            onFiltersChange={setFilters}
            stagedIds={stagedIds}
            collapsedIds={collapsedIds}
            onStage={handleStage}
            onUnstage={unstageAcrossAreas}
            onCollapse={onCollapse}
            onRestore={onRestore}
            mode={mode}
            onModeChange={setMode}
            workspacePinned={workspacePinned}
          />
          <ExpansionAreaOpenDock />
        </div>

        {showRightChrome ? (
          <>
            {showResizeHandle ? (
              <ColumnResizeHandle
                label={
                  fileOnly ? '拖动调整文件区宽度' : '拖动调整搜索器宽度'
                }
                onPointerDown={startSearcherFileDrag}
              />
            ) : null}

            <motion.div
              initial={false}
              layout
              transition={reduceMotion ? { duration: 0 } : PAGE_TRANSITION}
              className={cn(
                'h-full min-h-0',
                expansionOpen
                  ? 'min-w-0 flex-1 overflow-x-auto'
                  : 'ml-auto shrink-0',
              )}
              style={
                expansionOpen
                  ? { minWidth: rightMinPx }
                  : { width: collapsedRightWidth }
              }
            >
              <div className="h-full w-full min-w-0">
                <Suspense
                  fallback={
                    <div className="flex h-full items-center justify-center text-faint">
                      <Loader2 className="size-5 animate-spin" />
                    </div>
                  }
                >
                  <SearchRightPanel
                    fileColWidth={fileColWidth}
                    onFileColWidthChange={setFileColWidth}
                  />
                </Suspense>
              </div>
            </motion.div>
          </>
        ) : null}
      </div>

      {/* 暂存飞入覆盖层 —— portal 到 body,传统/智能两种暂存共用(同一 stagePaper choke point) */}
      <StageFlyLayer />
    </>
  );
}

export default SearchPage;
