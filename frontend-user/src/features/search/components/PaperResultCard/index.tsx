import { memo, useCallback } from 'react';
import type { Paper } from '../../api/papers';
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
 * **memo 友好**:父组件传 `stagedIds / collapsedIds`(稳定引用)+ 4 个稳定回调,
 * 卡片内部通过 paper.paperId 自查 + 闭包绑定 —— 父级 setState 不会让全部卡片重渲。
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
  /** 跨所有暂存区合并的 paperId 集合;有 paper.paperId 即为已暂存 */
  stagedIds: Set<string>;
  /** 主动折叠的 paperId 集合 */
  collapsedIds: Set<string>;
  /** 本页所有已收藏的 paperId(SearcherColumn 调 /library/check 拿到) */
  favoritedIds: ReadonlySet<string>;
  /** 期刊增强信息(JCR/IF/CCF/中科院)— 异步拿到,先空后有,不阻塞卡渲染 */
  journalEnrichment?: JournalEnrichment | null;
  onStage: (paper: Paper) => void;
  onUnstage: (paperId: string) => void;
  onCollapse: (paperId: string) => void;
  onRestore: (paperId: string) => void;
  highlightQuery?: string;
}

function PaperResultCardImpl({
  paper,
  stagedIds,
  collapsedIds,
  favoritedIds,
  journalEnrichment,
  onStage,
  onUnstage,
  onCollapse,
  onRestore,
  highlightQuery,
}: PaperResultCardProps) {
  const id = paper.paperId;
  const isStaged = stagedIds.has(id);
  const isFolded = collapsedIds.has(id);
  const isFavorited = favoritedIds.has(id);

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
    />
  );
}

/** memo:只要 paper / Set 引用 + 4 个回调引用都没变,就跳过整张卡的重渲。
 * - paper 来自 useQuery 缓存,引用稳定
 * - stagedIds / collapsedIds 父组件 useMemo 稳定
 * - onStage 等 4 个回调由 SearchPage useCallback 稳定 */
export const PaperResultCard = memo(PaperResultCardImpl);
