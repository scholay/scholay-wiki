import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAutoAnimate } from '@formkit/auto-animate/react';
import {
  AlertCircle,
  Grid3x3,
  Inbox,
  Loader2,
  Lock,
  Settings2,
} from 'lucide-react';
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
import { useStageFly } from '@/stores/stage-fly.store';
import { DimensionSettingsDialog } from './DimensionSettingsDialog';
import { StagingTabs } from './StagingTabs';
import { DimensionCell } from './matrix/DimensionCell';
import { PaperCell } from './matrix/PaperCell';
import { MatrixMoreToolsMenu } from './matrix/MatrixMoreToolsMenu';
import { DIM_COL_MIN_WIDTH, PAPER_COL_WIDTH } from './matrix/constants';
// EmptyImportButton / MockMatrixPreview 仍由 WelcomeBoard(无任何 area 场景)用,
// 这里建过区后的"空 active"状态已改为纯空白(对照本文件 165-170 行)

/**
 * 工作区右栏 = 暂存区 + 矩阵分析(.pen `d3ya3` + `YMrtV`)。
 *
 * 视觉:两块独立的列(工作区 / 矩阵分析),各自有 header / sub-header / footer。
 * 结构:**只有一张 `<table>` + sticky-left 第一列**。
 *   - 行高由同行 `<td>` 共享(原生),不需要 JS sync
 *   - 横向滚动只发生在 dim 列上,sticky-left 论文列永远可见
 *   - sticky-top 让表头(dim 名字)在纵向滚动时常驻
 *
 * Header / Footer 在 scroll 容器之外,各自 flex 分成 [left:固定宽度 paper-col]
 * 与 [right:fill],与表内 sticky-left 第一列的宽度对齐 —— 任何方向滚动
 * 都不会让外层 chrome 跑位。
 */
interface MatrixColumnProps {
  /** 当前激活暂存区的论文 —— 由 SearchPage 计算后传入 */
  staged: Paper[];
}

export function MatrixColumn({ staged }: MatrixColumnProps) {
  const token = useAuthStore((s) => s.token);
  const openAuthDialog = useAuthDialog((s) => s.openDialog);
  const dimensionsQ = useAnalysisDimensions();
  const matrixQ = useMatrixAnalysis(staged);
  const { activeArea } = useStagingView();
  const { removePaper, clearArea } = useStagingActions();
  const [settingsOpen, setSettingsOpen] = useState(false);

  // ---- 暂存飞入:滚动容器 ref + 落点注册 + 新行自动过渡 ----
  const scrollRef = useRef<HTMLDivElement>(null);
  const [tbodyRef] = useAutoAnimate<HTMLTableSectionElement>();
  const setGetTarget = useStageFly((s) => s.setGetTarget);

  // 落点 getter:即时滚到底(非 smooth,便于同步量),再算「新行将出现处」的 top。
  // 落点 = 当前最后一行的下沿,但不超出容器可视底(overflow 时新行滚到底部对齐):
  //   - 可滚动(overflow):最后一行贴容器底 → top ≈ 容器底 - 行高(新行滚到底后的位置)
  //   - 不可滚动(行少):最后一行在容器中部 → top = 最后一行下沿(新行紧接其下)
  // 空矩阵(active 区无论文,首篇)→ 落在顶部。芯片抵达即淡出,精度不敏感。
  useEffect(() => {
    const fn = () => {
      const c = scrollRef.current;
      if (!c) return null;
      c.scrollTop = c.scrollHeight;
      const cr = c.getBoundingClientRect();
      const rows = c.querySelectorAll('tbody tr');
      const lastCell = rows[rows.length - 1]?.querySelector('td');
      if (lastCell) {
        const rr = lastCell.getBoundingClientRect();
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
        width: Math.min(PAPER_COL_WIDTH, cr.width),
        height: 76,
      };
    };
    setGetTarget(fn);
    return () => setGetTarget(null);
  }, [setGetTarget]);

  // 新行落定后再滚一次到底(getTarget 那次滚的是「加行前」的底,新行需要二次对齐)。
  const prevLenRef = useRef(staged.length);
  useEffect(() => {
    if (staged.length > prevLenRef.current) {
      const c = scrollRef.current;
      if (c) {
        requestAnimationFrame(() =>
          c.scrollTo({ top: c.scrollHeight, behavior: 'smooth' })
        );
      }
    }
    prevLenRef.current = staged.length;
  }, [staged.length]);

  const dimensions = dimensionsQ.data ?? [];
  const results = matrixQ.data ?? [];

  const resultIndex = useMemo(() => {
    const m = new Map<string, PaperAnalysisItem>();
    for (const r of results) m.set(r.paperId, r);
    return m;
  }, [results]);

  // 稳定 paperId-based 回调,给 memo 化的 PaperCell 用
  const handleRemove = useCallback(
    (paperId: string) => {
      if (!activeArea) return;
      removePaper(activeArea.id, paperId);
    },
    [activeArea, removePaper]
  );

  const handleClearAll = useCallback(() => {
    if (!activeArea || staged.length === 0) return;
    // 走 batch endpoint —— 登录态一个请求清空,不再循环 N 次 DELETE
    clearArea(activeArea.id);
  }, [activeArea, staged.length, clearArea]);

  // 收藏状态:按 source 分组批量查,合并成 `{source}:{paperId}` Set,跨源不冲突
  const favoritedSet = useStagedFavorites(staged);

  const isLoading =
    dimensionsQ.isLoading || (matrixQ.isLoading && results.length === 0);
  const showLoginGate = !token;
  const showDimGrid = !showLoginGate && dimensions.length > 0;

  return (
    <div className="flex flex-col h-full min-h-0 bg-background">
      {/* ============ 顶部工具栏:两区 ============ */}
      <header className="flex h-14 shrink-0 border-b border-border bg-background">
        {/* 左区:工作区 */}
        <div
          className="flex items-center gap-2.5 px-4 border-r border-border shrink-0"
          style={{ width: PAPER_COL_WIDTH, minWidth: PAPER_COL_WIDTH }}
        >
          <Inbox className="size-4 text-brand-red" strokeWidth={2.5} />
          {/* 列标题 15px —— 设计稿 .pen `wgB2T`,Tailwind 默认 scale 无此档,
             保留 arbitrary value(token 化时同步更新此处) */}
          <span className="text-15 font-bold text-foreground">工作区</span>
        </div>
        {/* 右区:矩阵分析 + 工具 */}
        <div className="flex-1 min-w-0 flex items-center justify-between gap-2 px-4">
          {/* 标题块 —— min-w-0 + 主标 whitespace-nowrap + 副标 truncate:
              永远单行不换行。副标在窄空间内被省略号截断,而不是把标题挤成两行 */}
          <div className="flex items-center gap-2.5 min-w-0">
            <Grid3x3
              className="size-4 shrink-0 text-brand-red"
              strokeWidth={2.5}
            />
            <span className="shrink-0 text-15 font-bold text-foreground whitespace-nowrap">
              矩阵分析
            </span>
            <span className="text-xs text-faint truncate">
              {staged.length} 篇 · {dimensions.length} 维度
            </span>
            {matrixQ.isFetching && (
              <Loader2 className="size-3 shrink-0 animate-spin text-muted-foreground" />
            )}
          </div>

          {/* 工具区 —— 响应式:≥lg 平铺,<lg 折成「更多 ▾」hover dropdown
              收起态优先保证标题不被挤压换行 */}
          <div className="hidden lg:flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              disabled={!token}
              className="inline-flex items-center gap-1 h-7 px-2.5 rounded-sm border border-border text-xs text-subtle hover:bg-surface-1 disabled:opacity-50 disabled:cursor-not-allowed"
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
            className="flex lg:hidden shrink-0"
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
      </header>

      {/* ============ 主体:单滚动容器,内含 <table> ============ */}
      {/* 空态(用户刚建新区 / 切到空 active 区)—— **保留 thead**
          (StagingTabs + 维度列头),只是 tbody 没有行。"假表 + 一键导入"
           CTA 仅在 WelcomeBoard(还没有任何区的首次发现场景)展示。 */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-auto">
        {/* text-xs(11px)= 设计稿 dim cell / footer 通用文字基准 */}
        <table className="w-full border-separate border-spacing-0 text-xs">
          {/* sub-header 行(h-9):左区 = StagingTabs,右区 = dimension 名字
             整行 sticky-top;左格 sticky-left 双向冻结 */}
          <thead>
            <tr>
              <th
                className="sticky left-0 top-0 z-nav p-0 border-r border-b border-border bg-background"
                style={{
                  width: PAPER_COL_WIDTH,
                  minWidth: PAPER_COL_WIDTH,
                  // maxWidth 关键:table-layout:auto 下,光有 width/minWidth 不够 —— 单元格内容
                  // (长 DOI/URL 等无空格长 token)仍会把整列撑过 320,导致与外层固定 320 的
                  // header/footer "工作区"列错位(偶现:取决于具体暂存论文)。封死上限即对齐。
                  maxWidth: PAPER_COL_WIDTH,
                  height: 36,
                }}
              >
                <StagingTabs />
              </th>
              {/* 维度表头 —— .pen `xFPz2` h-9 bg #F8F8F8,文字 11px/700 #666 */}
              {showLoginGate ? (
                <th
                  className="sticky top-0 z-sticky bg-surface-1 px-4 text-left text-xs font-bold text-muted-foreground border-b border-border"
                  style={{ height: 36 }}
                >
                  维度
                </th>
              ) : showDimGrid ? (
                dimensions.map((d) => (
                  <th
                    key={d.dimensionKey}
                    className="sticky top-0 z-sticky bg-surface-1 px-3 text-left text-xs font-bold text-muted-foreground border-r border-b border-border last:border-r-0"
                    style={{ minWidth: DIM_COL_MIN_WIDTH, height: 36 }}
                    title={d.dimensionKey}
                  >
                    {d.name}
                  </th>
                ))
              ) : (
                <th
                  className="sticky top-0 z-sticky bg-surface-1 px-4 text-left text-xs font-bold text-muted-foreground border-b border-border"
                  style={{ height: 36 }}
                >
                  维度
                </th>
              )}
            </tr>
          </thead>

          <tbody ref={tbodyRef}>
            {matrixQ.error ? (
              <tr>
                <td
                  colSpan={
                    showDimGrid ? 1 + dimensions.length : 2
                  }
                  className="p-0"
                >
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
                return (
                  <tr key={p.paperId} className="group/row">
                    {/* 第一列 = 论文卡(sticky-left,与右侧 dim 单元格共享行高) */}
                    <td
                      className="sticky left-0 z-raised align-top border-b border-r border-border bg-background group-hover/row:bg-danger-soft transition-colors"
                      style={{
                        width: PAPER_COL_WIDTH,
                        minWidth: PAPER_COL_WIDTH,
                        // 见上方 thead 同款注释:封死 320 上限,防长 token 撑宽论文列致列错位。
                        maxWidth: PAPER_COL_WIDTH,
                      }}
                    >
                      <PaperCell
                        paper={p}
                        isFavorited={favoritedSet.has(
                          `${p.source ?? 'stc'}:${p.paperId}`
                        )}
                        onRemove={handleRemove}
                      />
                    </td>

                    {showLoginGate ? (
                      <td className="align-middle px-4 py-3 border-b border-border text-faint group-hover/row:bg-danger-soft transition-colors">
                        <button
                          type="button"
                          onClick={() => openAuthDialog('login')}
                          className="inline-flex items-center gap-1.5 text-xs hover:text-foreground transition-colors cursor-pointer"
                        >
                          <Lock className="size-3" />
                          <span className="underline-offset-2 hover:underline">登录后展开 AI 维度分析</span>
                        </button>
                      </td>
                    ) : showDimGrid ? (
                      dimensions.map((d) => (
                        <td
                          key={d.dimensionKey}
                          className="px-3 py-3 align-top text-subtle border-b border-r border-border last:border-r-0 group-hover/row:bg-danger-soft transition-colors"
                          style={{ minWidth: DIM_COL_MIN_WIDTH }}
                        >
                          <DimensionCell
                            item={r}
                            dimensionKey={d.dimensionKey}
                            // 单行 loading:用 matrixQ.loadingByPaperId 而非整体
                            // matrixQ.isFetching,这样新增一篇论文时只有该行 skeleton,
                            // 其它行依然展示缓存内容
                            isFetching={!!matrixQ.loadingByPaperId.get(p.paperId)}
                          />
                        </td>
                      ))
                    ) : (
                      <td className="align-middle px-4 py-3 border-b border-border text-faint group-hover/row:bg-danger-soft transition-colors">
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

      {/* ============ 底部状态栏:两区 —— .pen `Rc7lA` / `rr09t` 文字 11px ============ */}
      <footer className="flex h-10 shrink-0 border-t border-border bg-surface-1">
        {/* 左区:暂存计数 */}
        <div
          className="flex items-center justify-between gap-2 px-4 border-r border-border shrink-0"
          style={{ width: PAPER_COL_WIDTH, minWidth: PAPER_COL_WIDTH }}
        >
          <span className="text-xs text-muted-foreground tabular-nums">
            {staged.length} 篇
          </span>
          {staged.length > 0 && (
            <ConfirmPopover
              title={`清空当前暂存区的 ${staged.length} 篇论文?`}
              description="只清空这一个暂存区,不影响收藏与其它分区。此操作不可撤销。"
              confirmText="清空"
              cancelText="取消"
              danger
              side="top"
              align="end"
              onConfirm={handleClearAll}
            >
              <button
                type="button"
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                × 清空
              </button>
            </ConfirmPopover>
          )}
        </div>
        {/* 右区:矩阵就绪状态 */}
        <div className="flex-1 min-w-0 flex items-center px-4 text-xs text-muted-foreground">
          {showDimGrid && staged.length > 0 ? (
            `矩阵就绪 · ${staged.length} 行 × ${dimensions.length} 列`
          ) : showLoginGate ? (
            <button
              type="button"
              onClick={() => openAuthDialog('login')}
              className="hover:text-foreground hover:underline underline-offset-2 transition-colors"
            >
              登录后启用矩阵分析
            </button>
          ) : (
            '矩阵还是空的,先添加论文吧'
          )}
        </div>
      </footer>

      {/* 维度设置 dialog —— 关闭后 useDimensionSettings 已经失效 react-query,
         矩阵分析的 useAnalysisDimensions 也共享同一 queryKey 前缀,自动重 fetch */}
      <DimensionSettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
      />
    </div>
  );
}

// PaperCell / DimensionCell / MatrixMoreToolsMenu 已抽到 ./matrix/ 子目录。
// 空态(假表 + CTA)抽到 ./EmptyMatrixPreview,与 WelcomeBoard 共用。
