import { memo } from 'react';
import { BlockedTurnCard, PrismTurnView } from '@/shared/components/chat';
import type { Turn } from '@/shared/types/chat';
import { useQuotaStore } from '@/stores/quota.store';

/** Prism 用户端薄包装：展示结构在 shared，这里只注入 quota 操作。 */
export const PrismMessageTurn = memo(function PrismMessageTurn({
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
    <PrismTurnView
      turn={turn}
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
