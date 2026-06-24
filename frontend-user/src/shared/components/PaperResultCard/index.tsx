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
 *   isFolded=false  →    DefaultCard(红 CTA)   DefaultCard(绿 CTA)
 *   isFolded=true   →    CollapsedRow(灰行)    StagedRow(绿行)
 *
 *   - 暂存(stage)= 加入右侧工作区,只影响按钮颜色 / 紧凑行底色
 *   - 折叠(fold)= 在搜索结果列里把卡收成一行;独立于 stage
 *
 * 对应 .pen `CMKIx`(default)/ `Q6TEbO`(staged-folded)/ `BEXqq`(folded)。
 *
 * **memo 友好**:父组件按 paperId 自查后传入**标量** `isStaged / isFolded / isFavorited` + 4 个
 * 稳定回调(不再传整个 Set)。这样暂存/折叠一篇时只有该篇的标量变化, 其余卡 memo 命中、不重渲。
 * (早先传 Set 引用: 任一篇 stage/fold 都会让 Set 换引用, 打穿全页所有卡的 memo —— 性能审计 fe-render。)
 *
 * **文件拆分**(原 647 行 → 拆成 5 个 ≤ 200 行的子文件):
 *   - index.tsx        路由分发 + memo 入口(本文件)
 *   - DefaultCard.tsx  标准卡(最大体)
 *   - StagedRow.tsx    已暂存折叠行
 *   - CollapsedRow.tsx 未暂存折叠行
 *   - MetaLine.tsx     venue · 作者 · year 元信息
 *   - tags.tsx         pickTags / quartileTone / renderHighlight 纯函数
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
  /** 隐藏「暂存」按钮(智能助手等无暂存区语境用):收藏/翻译/折叠照常,只是不出现暂存。
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
      <StagedRow paper={paper} onUnfold={toggleFold} onUnstage={toggleStage} />
    );
  }
  if (isFolded && !isStaged) {
    return <CollapsedRow paper={paper} onUnfold={toggleFold} />;
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
