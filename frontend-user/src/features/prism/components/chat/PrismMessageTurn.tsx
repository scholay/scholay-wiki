import { memo } from 'react';
import { PrismTurnView } from '@/shared/components/chat';
import type { Turn } from '@/shared/types/chat';

/** Prism 用户端薄包装:展示结构在 shared。
 *  额度被拦轮不再在会话流里出卡片(2026-08-12 交互重做):用户气泡保留,
 *  提示与恢复动作在输入框上方的 QuotaComposerStrip(含自动重发)。 */
export const PrismMessageTurn = memo(function PrismMessageTurn({ turn }: { turn: Turn }) {
  return <PrismTurnView turn={turn} />;
});
