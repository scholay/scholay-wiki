import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { FolderOpen, Loader2 } from 'lucide-react';
import { RouteSEO } from '@/shared/components/RouteSEO';
import { SidebarLayout } from '@/shared/components/sidebar';
import { useLocalStorage } from '@/shared/hooks';
import { useRegisterSidebarRail } from '@/stores/sidebar.store';
import { SearchSidebar } from '../components/SearchSidebar';
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
const RIGHT_MIN_PX = 480; // 右侧工作区 / 矩阵的最小可视宽,撑不下时 main 出横向滚

/**
 * 文献搜索结果页 ——
 *
 *   [SidebarLayout(文件夹快捷+筛选)]
 *     ┌─ Searcher ─┬──────────────────────────────────────────┐
 *     │  搜索器    │  详情(拓展) / 工作区(列表·矩阵)          │
 *     │ (px 锁定)  │                                           │
 *     └────────────┴──────────────────────────────────────────┘
 *   右侧拓展栏在文献检索模式下始终占位;智能助手对话态下仅在有打开的详情/功能页时展开,
 *   首屏 hero 态占满主区域(无右栏)。
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
 * 任何位置(顶栏菜单 / sidebar)点"文献搜索"跳到 /search,且 URL 无 params,
 * 自动恢复;有 params 时不动用户当前 URL,只把它写进 storage 作为新的"last"。
 */
const LAST_SEARCH_KEY = 'scholay.last-search';

export function SearchPage() {
  // ============ "回到文献搜索" 自动恢复上次状态 ============
  // 用户从任何位置进 /search 但 URL 无 params 时,把上次保存的搜索串还原。
  // 仅首次挂载执行一次(restoredRef 守门),后续 URL 变化都是用户主动行为。
  const navigate = useNavigate();
  const location = useLocation();
  const [urlParams, setUrlParams] = useSearchParams();
  const restoredRef = useRef(false);

  useEffect(() => {
    if (!(location.state as { fresh?: boolean } | null)?.fresh) return;
    navigate({ pathname: '/search', search: '' }, { replace: true, state: null });
  }, [location.state, navigate]);

  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    if ((location.state as { fresh?: boolean } | null)?.fresh) return;
    // 已有 ?q=... / ?src=... 任何参数 → 用户来路自带状态,不干扰
    if (urlParams.toString()) return;
    const saved = typeof localStorage !== 'undefined'
      ? localStorage.getItem(LAST_SEARCH_KEY)
      : null;
    if (!saved || saved.length <= 1) return;
    navigate({ pathname: '/search', search: saved }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 任意"有内容"的搜索状态都持久化 —— 用户清空 URL 不覆写,避免菜单回来一片空。
  // 想真正清空 storage 的话,清空搜索词 + 退出筛选 = URL 空,这时 effect 跳过,
  // 老 storage 还留着;实际行为是"下次回到 /search 还会恢复"。这个交互
  // 与文档中 "last meaningful search" 心智一致,后续要"全新"再手动改即可。
  useEffect(() => {
    if (typeof localStorage === 'undefined') return;
    const s = urlParams.toString();
    if (s) localStorage.setItem(LAST_SEARCH_KEY, `?${s}`);
  }, [urlParams]);

  // filters 来源:URL search params(useUrlFilters 自带解码/编码)。
  // 这样从 /search 进入论文详情再返回时,**浏览器 history 自带 filters**,
  // SearchPage 重新挂载也能还原。同时 URL 可分享。
  const [filters, setFilters] = useUrlFilters();
  // mode 持久化到 URL —— `?mode=smart` 表示智能 tab,缺省 = 文献(classic)。
  // 这样从 /search 进入论文详情再返回时,returnTo URL 自带 mode,
  // SearchPage 重新挂载能精确还原用户离开前选中的 tab。
  // setMode 用 `replace: true` 写入 —— 切 tab 不污染 history,
  // 避免 browser back/forward "嗖嗖滚 tab" 的体验问题。
  const mode: SearchMode =
    urlParams.get('mode') === 'smart' ? 'smart' : 'classic';
  const queryFromUrl = (urlParams.get('q') ?? '').trim();
  const showClassicLanding = mode === 'classic' && !queryFromUrl;
  const setMode = useCallback(
    (next: SearchMode) => {
      setUrlParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          if (next === 'smart') p.set('mode', 'smart');
          else p.delete('mode');
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
  const panelOpen = useSearchRightPanelStore((s) => s.panelOpen);
  const openPanel = useSearchRightPanelStore((s) => s.openPanel);
  const closePanel = useSearchRightPanelStore((s) => s.closePanel);
  const conversationActive = useSmartSearchSessionStore((s) => s.conversationActive);

  const showSmartHeroLayout = mode === 'smart' && !conversationActive;
  const canHostRightPanel =
    mode === 'classic' || (mode === 'smart' && conversationActive);
  const showRightPanel =
    panelOpen && canHostRightPanel && !showClassicLanding && !showSmartHeroLayout;
  const showResizeHandle = showRightPanel;
  const expandMainColumn = showClassicLanding || showSmartHeroLayout;

  // 文献检索默认展开右栏;切到智能助手时收起(被动 openPaper 等会再展开)。
  useEffect(() => {
    if (mode === 'classic') openPanel();
    else closePanel();
  }, [mode, openPanel, closePanel]);

  useEffect(() => {
    setEmbedMode(true);
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

  // 折叠态由 3 个集合派生(SearcherColumn 直接消费 effectivelyCollapsed):
  //
  //   - stagedIds            服务器持久化,刷新后还在 → 已暂存论文 auto-collapse
  //   - manuallyCollapsedIds 用户对**非暂存**论文主动点击的折叠(本页内存,刷新清)
  //   - expandedOverrides    用户主动展开"被 staged auto-collapse 的卡片",
  //                          覆盖 stagedIds 的折叠效果(本页内存,刷新清 →
  //                          下次仍是 auto-collapsed,符合"刷新后保持折叠"需求)
  //
  // 公式:effectivelyCollapsed = (stagedIds ∪ manuallyCollapsedIds) \ expandedOverrides
  const [manuallyCollapsedIds, setManuallyCollapsedIds] = useState<Set<string>>(
    new Set()
  );
  const [expandedOverrides, setExpandedOverrides] = useState<Set<string>>(
    new Set()
  );

  const effectivelyCollapsed = useMemo(() => {
    const s = new Set<string>(manuallyCollapsedIds);
    stagedIds.forEach((id) => s.add(id));
    expandedOverrides.forEach((id) => s.delete(id));
    return s;
  }, [manuallyCollapsedIds, stagedIds, expandedOverrides]);

  const onCollapse = useCallback((id: string) => {
    // 折叠 = 加入 manuallyCollapsedIds + 移出 expandedOverrides
    setExpandedOverrides((s) => {
      if (!s.has(id)) return s;
      const next = new Set(s);
      next.delete(id);
      return next;
    });
    setManuallyCollapsedIds((s) => {
      if (s.has(id)) return s;
      const next = new Set(s);
      next.add(id);
      return next;
    });
  }, []);

  const onRestore = useCallback((id: string) => {
    // 展开 = 加入 expandedOverrides + 移出 manuallyCollapsedIds
    setManuallyCollapsedIds((s) => {
      if (!s.has(id)) return s;
      const next = new Set(s);
      next.delete(id);
      return next;
    });
    setExpandedOverrides((s) => {
      if (s.has(id)) return s;
      const next = new Set(s);
      next.add(id);
      return next;
    });
  }, []);

  const handleStage = useCallback(
    (paper: Paper) => {
      stagePaper(paper, mode === 'smart' ? 'smart' : 'traditional');
      // 加入暂存后:由 stagedIds 自动派生折叠态(不需要手动设 collapsedIds)。
      // 但要清掉本 paper 的 expandedOverrides,避免"刚暂存还展开着"的诡异态。
      setExpandedOverrides((s) => {
        if (!s.has(paper.paperId)) return s;
        const next = new Set(s);
        next.delete(paper.paperId);
        return next;
      });
    },
    [stagePaper, mode]
  );

  // ── 自管 split:SearcherColumn px 锁定 + 中间手柄 + 右侧 flex-1 ─────────────
  const [searcherWidth, setSearcherWidth] = useLocalStorage<number>(
    'search.searcher-width',
    SEARCHER_DEFAULT_PX
  );
  const draggingRef = useRef(false);

  const startDrag = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      draggingRef.current = true;
      const startX = e.clientX;
      const startW = searcherWidth;
      const onMove = (ev: PointerEvent) => {
        if (!draggingRef.current) return;
        const dx = ev.clientX - startX;
        const next = Math.max(
          SEARCHER_MIN_PX,
          Math.min(SEARCHER_MAX_PX, startW + dx)
        );
        setSearcherWidth(next);
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
    [searcherWidth, setSearcherWidth]
  );

  // SEO title 反映搜索词 —— 有 q 时拼 "{q} - 文献搜索 | Scholay";空查询时回到通用文案。
  // canonical 把 q 也带上,让 Google 把每个有意义的搜索词页面索引为独立 URL。
  const seoQuery = (urlParams.get('q') ?? '').trim();
  const seoTitle = seoQuery
    ? `${seoQuery} - 文献搜索 | Scholay 学术搜索`
    : '文献搜索 - Scholay | AI 驱动的学术文献检索';
  const seoDesc = seoQuery
    ? `Scholay 学术搜索: ${seoQuery}。覆盖 Semantic Scholar / OpenAlex / PubMed 多源,AI 排序 + 引用图谱 + PDF 全文,一键加入文献集。`
    : 'Scholay 学术文献搜索 —— 多源融合 (Semantic Scholar / OpenAlex / PubMed),支持高级筛选、暂存矩阵分析、AI 智能筛选。覆盖 3 亿+ 学术论文。';
  const seoCanonical = seoQuery
    ? `/search?q=${encodeURIComponent(seoQuery)}`
    : '/search';

  return (
    <SidebarLayout
      sidebar={<SearchSidebar />}
    >
      <RouteSEO
        title={seoTitle}
        description={seoDesc}
        keywords="文献搜索,学术搜索,论文检索,文献查找,Semantic Scholar,OpenAlex,PubMed,智能搜索,高级筛选,AI 排序,Scholay"
        canonical={seoCanonical}
      />

      <div className="flex h-full min-h-0 bg-background">
        <div
          style={expandMainColumn ? undefined : { width: searcherWidth }}
          className={cn(
            'h-full min-h-0 shrink-0',
            expandMainColumn ? 'min-w-0 flex-1' : 'border-r border-border',
          )}
        >
          <SearcherColumn
            filters={filters}
            onFiltersChange={setFilters}
            stagedIds={stagedIds}
            collapsedIds={effectivelyCollapsed}
            onStage={handleStage}
            onUnstage={unstageAcrossAreas}
            onCollapse={onCollapse}
            onRestore={onRestore}
            mode={mode}
            onModeChange={setMode}
          />
        </div>

        {showResizeHandle && (
          <>
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="拖动调整搜索器宽度"
              onPointerDown={startDrag}
              className="relative w-px shrink-0 cursor-col-resize bg-border transition-colors hover:bg-foreground/30"
            >
              <span className="absolute inset-y-0 -left-1 -right-1" />
            </div>

            <div className="h-full min-h-0 flex-1 overflow-x-auto">
              <div style={{ minWidth: RIGHT_MIN_PX }} className="h-full">
                <Suspense
                  fallback={
                    <div className="flex h-full items-center justify-center text-faint">
                      <Loader2 className="size-5 animate-spin" />
                    </div>
                  }
                >
                  <SearchRightPanel />
                </Suspense>
              </div>
            </div>
          </>
        )}
      </div>

      {/* 暂存飞入覆盖层 —— portal 到 body,传统/智能两种暂存共用(同一 stagePaper choke point) */}
      <StageFlyLayer />
    </SidebarLayout>
  );
}

export default SearchPage;
