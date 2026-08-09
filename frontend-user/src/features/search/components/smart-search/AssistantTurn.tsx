import { memo } from 'react';
import { BlockedTurnCard, SearchTurnView } from '@/shared/components/chat';
import type { ToolBlock, Turn } from '@/shared/types/chat';
import { useQuotaStore } from '@/stores/quota.store';
import { PaperListScroller } from './PaperListScroller';

function renderInteractivePaperResult(block: ToolBlock) {
  return (
    <PaperListScroller content={block.result} toolUseId={block.toolUseId} />
  );
}

/** smart-search 用户端薄包装：仅注入可收藏论文卡和 quota 操作。 */
export const AssistantTurn = memo(function AssistantTurn({
  turn,
  onResendBlocked,
  onDismissBlocked,
}: {
  turn: Turn;
  onResendBlocked?: () => void;
  onDismissBlocked?: () => void;
}) {
  const openReset = useQuotaStore((state) => state.openReset);
  return (
    <SearchTurnView
      turn={turn}
      renderPaperResult={renderInteractivePaperResult}
      blockedContent={
        turn.blocked ? (
          <BlockedTurnCard
            onResend={onResendBlocked}
            onOpenReset={openReset}
            onDismiss={onDismissBlocked}
          />
        ) : undefined
      }
    />
  );
});
