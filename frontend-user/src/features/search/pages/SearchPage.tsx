import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Filter, FolderOpen, Loader2 } from "lucide-react";
import { RouteSEO } from "@/shared/components/RouteSEO";
import { SidebarLayout } from "@/shared/components/sidebar";
import { useLocalStorage } from "@/shared/hooks";
import { useRegisterSidebarRail } from "@/stores/sidebar.store";
import { SearchSidebar } from "../components/SearchSidebar";
import { SearcherColumn, type SearchMode } from "../components/SearcherColumn";
import { StageFlyLayer } from "../components/StageFlyLayer";
import type { Paper } from "../api/papers";

/**
 * 右侧工作区两个候选 —— lazy 拆分:
 *   - MatrixColumn 含矩阵分析表、维度编辑、暂存 tabs(~30KB), 只有暂存论文时才需要
 *   - WelcomeBoard 含模式介绍 hero, 只在首次/空区显示
 * 首屏只加载 SearcherColumn, 用户行为触发后才下载工作区代码块。
 */
const MatrixColumn = lazy(() =>
  import("../components/MatrixColumn").then((m) => ({
    default: m.MatrixColumn,
  })),
);
const WelcomeBoard = lazy(() =>
  import("../components/WelcomeBoard").then((m) => ({
    default: m.WelcomeBoard,
  })),
);
import { useStagingActions } from "../hooks/useStagingActions";
import { useStagingView } from "../hooks/useStagingView";
import { useUrlFilters } from "../hooks/useUrlFilters";

const SEARCHER_MIN_PX = 380;
const SEARCHER_MAX_PX = 900;
const SEARCHER_DEFAULT_PX = 480;
const RIGHT_MIN_PX = 480; // 右侧工作区 / 矩阵的最小可视宽,撑不下时 main 出横向滚

/**
 * 文献搜索结果页 ——
 *
 *   [SidebarLayout(文件夹快捷+筛选)]
 *     ┌─ Searcher ─┬──────────────────────────────────────────┐
 *     │  搜索器    │  Workspace = MatrixColumn(暂存tab+表)/   │
 *     │ (px 锁定)  │              WelcomeBoard(无暂存时)       │
 *     └────────────┴──────────────────────────────────────────┘
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
 * 关键设计:暂存区 + 矩阵分析合并到一张表 —— 单个滚动容器,
 *   左列(论文卡)sticky-left,与右侧维度列共享行高(<table> 原生保障)。
 *   不再用 JS 同步滚动,无 60Hz 延迟问题。
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
const LAST_SEARCH_KEY = "scholay.last-search";

export function SearchPage() {
  // ============ "回到文献搜索" 自动恢复上次状态 ============
  // 用户从任何位置进 /search 但 URL 无 params 时,把上次保存的搜索串还原。
  // 仅首次挂载执行一次(restoredRef 守门),后续 URL 变化都是用户主动行为。
  const navigate = useNavigate();
  const [urlParams, setUrlParams] = useSearchParams();
  const restoredRef = useRef(false);

  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    // 已有 ?q=... / ?src=... 任何参数 → 用户来路自带状态,不干扰
    if (urlParams.toString()) return;
    const saved =
      typeof localStorage !== "undefined"
        ? localStorage.getItem(LAST_SEARCH_KEY)
        : null;
    if (!saved || saved.length <= 1) return;
    navigate({ pathname: "/search", search: saved }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 任意"有内容"的搜索状态都持久化 —— 用户清空 URL 不覆写,避免菜单回来一片空。
  // 想真正清空 storage 的话,清空搜索词 + 退出筛选 = URL 空,这时 effect 跳过,
  // 老 storage 还留着;实际行为是"下次回到 /search 还会恢复"。这个交互
  // 与文档中 "last meaningful search" 心智一致,后续要"全新"再手动改即可。
  useEffect(() => {
    if (typeof localStorage === "undefined") return;
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
    urlParams.get("mode") === "smart" ? "smart" : "classic";
  const setMode = useCallback(
    (next: SearchMode) => {
      setUrlParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          if (next === "smart") p.set("mode", "smart");
          else p.delete("mode");
          return p;
        },
        { replace: true },
      );
    },
    [setUrlParams],
  );

  // rail 按 mode 动态:智能模式下移除"筛选器"快捷入口 ——
  // 筛选器属于传统搜索,智能模式 sidebar 也不会渲染对应 section,
  // 留着 chip 反而会"打开 sidebar 后 flash 一个找不到的 section"。
  useRegisterSidebarRail(
    mode === "smart"
      ? [{ id: "all", label: "文件夹", icon: FolderOpen, sectionId: "library" }]
      : [
          {
            id: "all",
            label: "文件夹",
            icon: FolderOpen,
            sectionId: "library",
          },
          {
            id: "filters",
            label: "筛选器",
            icon: Filter,
            sectionId: "filters",
          },
        ],
  );

  // view 只读 —— 用 stagedIds 已是稳定引用,不需要再 useMemo 一次
  const { areas, activeArea, stagedIds } = useStagingView();
  const { stagePaper, removePaper, bulkStagePapers } = useStagingActions();
  // 判定 WelcomeBoard vs MatrixColumn 切换:**任一区有论文** 就走 MatrixColumn
  // (即使 active 区是空,用户也能切回有数据的 tab);全部区都空 → 回到 WelcomeBoard
  // 给出 mock + 一键导入 CTA 引导。**仅 areas.length>0** 不够 —— 用户可能建了空 A B C
  // 三个 tab,这时还是该引导。
  const hasAnyStaged = stagedIds.size > 0;

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
    [areas, stagedIds, removePaper],
  );

  /**
   * 整页「全选暂存 / 全部取消」—— 供 SearcherColumn 顶部那颗按钮调用。
   *
   * 作用域是**当前这一页**,不是全部 N 万条结果:暂存区单区上限 MAX_PAPERS_PER_AREA=100,
   * 而每页 20/50 条,整页恰好装得下;"全选 89,255 篇"在数据模型上根本不成立。
   *
   * 判据放在这里而不是 SearcherColumn:SearchPage 是暂存动作的唯一 owner
   * (stagePaper / unstageAcrossAreas 都在这),让展示层再算一遍等于开第二个真源。
   */
  const toggleStageAll = useCallback(
    async (papers: Paper[]) => {
      if (papers.length === 0) return;
      const allStaged = papers.every((p) => stagedIds.has(p.paperId));
      if (allStaged) {
        // 全部取消 —— 逐篇走 unstageAcrossAreas(它自带 stagedIds 守卫,不会误删)
        papers.forEach((p) => unstageAcrossAreas(p.paperId));
        toast.success(`已取消暂存 ${papers.length} 篇`);
        return;
      }
      // 批量加入 —— bulkStagePapers 内部会跳过已在区内的,并返回三类计数
      try {
        const { added, skipped, capped } = await bulkStagePapers(
          papers,
          "traditional",
        );
        const parts: string[] = [];
        if (added > 0) parts.push(`已暂存 ${added} 篇`);
        if (skipped > 0) parts.push(`${skipped} 篇已在暂存区`);
        if (capped > 0) parts.push(`${capped} 篇因暂存区已满未加入`);
        if (parts.length === 0) toast.info("本页论文已全部在暂存区");
        // added===0 但有跳过/超限 → 用 info 而非 success,别把"什么都没加成"报成成功
        else if (added === 0) toast.info(parts.join("、"));
        else toast.success(parts.join("、"));
      } catch (err) {
        toast.error(`批量暂存失败:${(err as Error).message}`);
      }
    },
    [stagedIds, unstageAcrossAreas, bulkStagePapers],
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
    new Set(),
  );
  const [expandedOverrides, setExpandedOverrides] = useState<Set<string>>(
    new Set(),
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
      stagePaper(paper, mode === "smart" ? "smart" : "traditional");
      // 加入暂存后:由 stagedIds 自动派生折叠态(不需要手动设 collapsedIds)。
      // 但要清掉本 paper 的 expandedOverrides,避免"刚暂存还展开着"的诡异态。
      setExpandedOverrides((s) => {
        if (!s.has(paper.paperId)) return s;
        const next = new Set(s);
        next.delete(paper.paperId);
        return next;
      });
    },
    [stagePaper, mode],
  );

  // ── 自管 split:SearcherColumn px 锁定 + 中间手柄 + 右侧 flex-1 ─────────────
  const [searcherWidth, setSearcherWidth] = useLocalStorage<number>(
    "search.searcher-width",
    SEARCHER_DEFAULT_PX,
  );
  const draggingRef = useRef(false);
  // 拖拽期的临时宽度:move 只走 useState 驱动渲染,释放时才持久化一次 ——
  // useLocalStorage 的 set 每次都 JSON.stringify + localStorage.setItem + 派发全局
  // CustomEvent('local-storage'),放在 pointermove 路径上是逐帧的同步 IO + 全局广播。
  const [dragWidth, setDragWidth] = useState<number | null>(null);
  const dragCleanupRef = useRef<(() => void) | null>(null);
  // 拖拽中途卸载(切路由)时把 document 级监听拆干净,否则残留到下一次全局 pointerup。
  useEffect(() => () => dragCleanupRef.current?.(), []);

  const startDrag = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      draggingRef.current = true;
      const startX = e.clientX;
      const startW = searcherWidth;
      let last = startW;
      const onMove = (ev: PointerEvent) => {
        if (!draggingRef.current) return;
        const dx = ev.clientX - startX;
        last = Math.max(
          SEARCHER_MIN_PX,
          Math.min(SEARCHER_MAX_PX, startW + dx),
        );
        setDragWidth(last);
      };
      const cleanup = () => {
        draggingRef.current = false;
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onUp);
        document.body.style.cursor = "";
        dragCleanupRef.current = null;
      };
      const onUp = () => {
        cleanup();
        setSearcherWidth(last);
        setDragWidth(null);
      };
      document.body.style.cursor = "col-resize";
      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
      dragCleanupRef.current = cleanup;
    },
    [searcherWidth, setSearcherWidth],
  );

  // SEO title 反映搜索词 —— 有 q 时拼 "{q} - 文献搜索 | Scholay";空查询时回到通用文案。
  // canonical 把 q 也带上,让 Google 把每个有意义的搜索词页面索引为独立 URL。
  const seoQuery = (urlParams.get("q") ?? "").trim();
  const seoTitle = seoQuery
    ? `${seoQuery} - 文献搜索 | Scholay 学术搜索`
    : "文献搜索 - Scholay | AI 驱动的学术文献检索";
  const seoDesc = seoQuery
    ? `Scholay 学术搜索: ${seoQuery}。覆盖 Semantic Scholar / OpenAlex / PubMed 多源,AI 排序 + 引用图谱 + PDF 全文,一键加入文件夹。`
    : "Scholay 学术搜索覆盖 2 亿+ 学术论文,支持直接检索与 AI 智能检索两种模式,可用布尔运算符(AND、OR、NOT)与精确短语提升检索精度;结果可按相关度、被引次数与发表时间排序,并按年份、领域、论文类型筛选,覆盖深度学习、大语言模型等热门研究方向。";
  // 查询词、筛选、排序和分页组合空间无界：结果态统一 noindex，并把 canonical
  // 收口到稳定的无参数入口。标题仍保留查询词，方便用户识别当前页面。
  const hasSearchState = urlParams.toString().length > 0;

  return (
    <SidebarLayout
      /* 文献搜索单独隐藏左下的浮动展开按钮:这一页左下角是结果列表的密集内容,
         悬浮胶囊会盖住卡片。侧栏仍可从顶栏 rail chip 展开,不是死路。 */
      hideExpandButton
      sidebar={
        <SearchSidebar
          filters={filters}
          onFiltersChange={setFilters}
          mode={mode}
        />
      }
    >
      <RouteSEO
        title={seoTitle}
        description={seoDesc}
        keywords="文献搜索,学术搜索,论文检索,文献查找,Semantic Scholar,OpenAlex,PubMed,智能搜索,高级筛选,AI 排序,Scholay"
        canonical="/search"
        noindex={hasSearchState}
      />

      {/* 可被爬虫读到的 H1 —— 与 HomePage 同款 sr-only 手法,不改双栏视觉。
          2026-08-13 Bing 站长后台点名「63 个页面缺 h1」:SSR 兜底正文里本来有 h1,
          但 React 接管后整块被替换,渲染型爬虫(Bing/Google 的 renderer)看到的是无 h1 的文档。 */}
      <h1 className="sr-only">学术搜索 — 论文检索与智能筛选</h1>

      <div className="flex h-full min-h-0 bg-background">
        {/* 搜索器列 —— **px 固定宽度**,viewport 窄时不缩 */}
        <div
          style={{ width: dragWidth ?? searcherWidth }}
          className="shrink-0 h-full min-h-0 border-r border-border"
        >
          <SearcherColumn
            filters={filters}
            stagedIds={stagedIds}
            collapsedIds={effectivelyCollapsed}
            onToggleStageAll={toggleStageAll}
            onStage={handleStage}
            onUnstage={unstageAcrossAreas}
            onCollapse={onCollapse}
            onRestore={onRestore}
            mode={mode}
            onModeChange={setMode}
          />
        </div>

        {/* 拖手柄 —— 1px 视觉,4px 触发命中区(便于鼠标抓) */}
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="拖动调整搜索器宽度"
          onPointerDown={startDrag}
          className="relative w-px shrink-0 bg-border cursor-col-resize hover:bg-foreground/30 transition-colors"
        >
          <span className="absolute inset-y-0 -left-1 -right-1" />
        </div>

        {/* 工作区:剩余空间 + min-w + 横向滚 —— 真撑不下时本区内部滚,
           不影响 sidebar / searcher */}
        <div className="flex-1 h-full min-h-0 overflow-x-auto">
          <div style={{ minWidth: RIGHT_MIN_PX }} className="h-full">
            <Suspense
              fallback={
                <div className="flex h-full items-center justify-center text-faint">
                  <Loader2 className="size-5 animate-spin" />
                </div>
              }
            >
              {hasAnyStaged ? (
                <MatrixColumn staged={activeArea?.papers ?? []} />
              ) : (
                <WelcomeBoard currentMode={mode} onSwitchMode={setMode} />
              )}
            </Suspense>
          </div>
        </div>
      </div>

      {/* 暂存飞入覆盖层 —— portal 到 body,传统/智能两种暂存共用(同一 stagePaper choke point) */}
      <StageFlyLayer />
    </SidebarLayout>
  );
}

export default SearchPage;
