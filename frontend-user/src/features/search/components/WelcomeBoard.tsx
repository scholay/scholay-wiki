import { Grid3x3, Inbox } from 'lucide-react';
import { EmptyImportButton, MockMatrixPreview } from './EmptyMatrixPreview';

/** 与 MatrixColumn 的 PAPER_COL_WIDTH 必须保持一致 —— 用户从空态切到有暂存
 *  时,左区"工作区"标签宽度不能跳变。 */
const PAPER_COL_WIDTH = 320;

/**
 * 检索工作区欢迎屏 —— 暂存区全空时显示。
 *
 * 对照 .pen `m0GrJY` / `x6H2Pf`(stagedList 空态)+ `tH03L`(matrixList 空态):
 *   - 顶部外层 header(工作区 / 矩阵分析 标签)与 MatrixColumn 双区结构一致
 *   - MockMatrixPreview:**自带 thead 里的 FakeStagingTabs**(A 3 / B 1 / +),
 *     不再外置一行 tabs(避免视觉错位)
 *   - EmptyImportButton CTA 在假表下方独立段
 */
interface WelcomeBoardProps {
  /** 暂时保留 prop 接口与 SearchPage 兼容,内部不再读 */
  onSwitchMode?: (m: 'classic' | 'smart') => void;
  currentMode?: 'classic' | 'smart';
}

export function WelcomeBoard(_props: WelcomeBoardProps) {
  return (
    <div className="flex flex-col h-full min-h-0 bg-background">
      {/* 顶栏 —— 与 MatrixColumn 双区结构完全一致,过渡零跳变 */}
      <header className="flex h-14 shrink-0 border-b border-border bg-background">
        <div
          className="flex items-center gap-2.5 px-4 border-r border-border shrink-0"
          style={{ width: PAPER_COL_WIDTH, minWidth: PAPER_COL_WIDTH }}
        >
          <Inbox className="size-4 text-brand-red" strokeWidth={2.5} />
          <span className="text-15 font-bold text-foreground">工作区</span>
        </div>
        <div className="flex-1 min-w-0 flex items-center gap-2.5 px-4">
          <Grid3x3 className="size-4 text-brand-red" strokeWidth={2.5} />
          <span className="text-15 font-bold text-foreground">矩阵分析</span>
          <span className="text-xs text-faint">等待工作区暂存论文</span>
        </div>
      </header>

      {/* body —— MockMatrixPreview 自带 FakeStagingTabs 在 thead 里;CTA 在表下方 */}
      <div className="flex-1 min-h-0 overflow-auto">
        <MockMatrixPreview />
        <EmptyImportButton />
      </div>
    </div>
  );
}
