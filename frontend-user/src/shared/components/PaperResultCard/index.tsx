import { memo, useCallback } from 'react';
import type { Paper } from '@/shared/api/types';
import type { JournalEnrichment } from '@/shared/api/journal-enrichment';
import { DefaultCard } from './DefaultCard';
import { StagedRow } from './StagedRow';
import { CollapsedRow } from './CollapsedRow';

/**
 * 论文结果卡 —— 两个独立维度,4 种渲染:
 *
 *                        isStaged=false        isStaged=true
 *   isFolded=false  →    DefaultCard           DefaultCard(绿底+勾选)
 *   isFolded=true   →    CollapsedRow(灰行)    StagedRow(绿行)
 *
 *   - 暂存:左侧 Checkbox,只进/出暂存区,不改变折叠
 *   - 折叠:hover「折叠」/「还原」,不改变暂存
 *
 * **memo 友好**:父组件按 paperId 自查后传入**标量** `isStaged / isFolded / isFavorited` + 4 个
 * 稳定回调(不再传整个 Set)。
 */
interface PaperResultCardProps {
  paper: Paper;
  /** 是否已暂存(父组件按 paperId 自查后传入的标量,memo 友好) */
  isStaged: boolean;
  /** 是否折叠 */
  isFolded: boolean;
  /** 是否已收藏 */
  isFavorited: boolean;
  /** 期刊增强信息(JCR/IF/CCF/中科院)— 异步拿到,先空后有,不阻塞卡渲染 */
  journalEnrichment?: JournalEnrichment | null;
  onStage: (paper: Paper) => void;
  onUnstage: (paperId: string) => void;
  onCollapse: (paperId: string) => void;
  onRestore: (paperId: string) => void;
  highlightQuery?: string;
  /** 隐藏左侧暂存复选框(智能助手等无暂存区语境用)。
   *  此模式下调用方应恒传 isStaged=false(无暂存区→不会进 StagedRow)。 */
  hideStage?: boolean;
}

function PaperResultCardImpl({
  paper,
  isStaged,
  isFolded,
  isFavorited,
  journalEnrichment,
  onStage,
  onUnstage,
  onCollapse,
  onRestore,
  highlightQuery,
  hideStage,
}: PaperResultCardProps) {
  const id = paper.paperId;

  // 在子组件内 useCallback 绑定 paperId —— 父级稳定回调 + 稳定 id ⇒ 稳定 fn
  const toggleStage = useCallback(
    () => (isStaged ? onUnstage(id) : onStage(paper)),
    [isStaged, id, paper, onStage, onUnstage]
  );
  const toggleFold = useCallback(
    () => (isFolded ? onRestore(id) : onCollapse(id)),
    [isFolded, id, onCollapse, onRestore]
  );

  if (isFolded && isStaged) {
    return (
      <StagedRow
        paper={paper}
        onUnstage={toggleStage}
        onUnfold={toggleFold}
      />
    );
  }
  if (isFolded && !isStaged) {
    return (
      <CollapsedRow
        paper={paper}
        onUnfold={toggleFold}
        onStage={toggleStage}
        hideStage={hideStage}
      />
    );
  }
  return (
    <DefaultCard
      paper={paper}
      isStaged={isStaged}
      isFavorited={isFavorited}
      journalEnrichment={journalEnrichment}
      onToggleStage={toggleStage}
      onFold={toggleFold}
      highlightQuery={highlightQuery}
      hideStage={hideStage}
    />
  );
}

/** memo:只要 paper 引用 + 3 个标量(isStaged/isFolded/isFavorited)+ 4 个回调引用都没变,
 * 就跳过整张卡的重渲。
 * - paper 来自 useQuery 缓存,引用稳定
 * - isStaged/isFolded/isFavorited 是标量,只有本篇状态变了才变(父组件 .has 自查后传入)
 * - onStage 等 4 个回调由父组件 useCallback 稳定 */
export const PaperResultCard = memo(PaperResultCardImpl);
