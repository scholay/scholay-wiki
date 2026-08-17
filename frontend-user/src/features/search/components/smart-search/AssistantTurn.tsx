import { memo } from 'react';
import { SearchTurnView } from '@/shared/components/chat';
import type { ToolBlock, Turn } from '@/shared/types/chat';
import { PaperResultIngress } from './PaperResultIngress';

function renderInteractivePaperResult(block: ToolBlock) {
  return <PaperResultIngress content={block.result} />;
}

/** smart-search 用户端薄包装:完整卡在右侧文件区,会话流留标题窄条 + 一键暂存。
 *  额度被拦轮不再在会话流里出卡片(2026-08-12 交互重做):用户气泡保留,
 *  提示与恢复动作在输入框上方的 QuotaComposerStrip(含自动重发)。 */
export const AssistantTurn = memo(function AssistantTurn({ turn }: { turn: Turn }) {
  return (
    <SearchTurnView turn={turn} renderPaperResult={renderInteractivePaperResult} />
  );
});
