import { RefreshCw, TriangleAlert } from 'lucide-react';
import { friendlyTurnError, sanitizeOpsText } from '@/shared/lib/friendly-tool-error';
import { Button } from '@/shared/ui/button';

/**
 * 一轮对话失败的收尾提示 —— 三 agent(claw / smart-search / prism)共用,视觉统一。
 *
 * 设计(2026-07-15 重设计,按业界规范让"失败"不惊慌):
 *   - **不用红色**。红色是系统级告警色,会让用户误以为出了严重故障而焦虑;而一轮 AI 回答
 *     没成功,通常重试/换模型即可,属"提示"而非"告警"。改用 amber(warning-soft 底 + brand-amber
 *     图标),醒目但冷静 —— 与 ChatGPT / Claude 等把 AI 侧失败呈现为温和 inline note 的做法一致。
 *   - 文案:已知 code 优先走 friendlyTurnError 的 code→文案映射(如 turn_timeout);未知 code
 *     用后端已友好化的 message。渲染前一律过 sanitizeOpsText 兜底脱敏(W5 P0-B4 双保险,
 *     backend sanitizeAgentErrorFrame 之外的前端防线,防新增错误码文案携带内部细节)。
 *   - 可选「重试」(W5 P0-C3):调用方仅在「最后一轮 + errorCode 可重试」时传 onRetry。
 */
export function TurnErrorNotice({
  message,
  code,
  onRetry,
}: {
  message: string;
  /** error 终帧的 code(turn.errorCode);已知 code 走映射文案。 */
  code?: string;
  /** 有值则渲染「重试」按钮 —— 由调用方守卫「最后一轮 + 可重试 code」再传入。 */
  onRetry?: () => void;
}) {
  const text = sanitizeOpsText(friendlyTurnError(code, message));
  return (
    <div className="flex items-start gap-2 rounded-12 border border-brand-amber/25 bg-warning-soft px-3 py-2">
      <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-brand-amber" strokeWidth={2.2} />
      <p className="min-w-0 flex-1 break-words text-12 leading-paragraph text-subtle">{text}</p>
      {onRetry && (
        <Button
          size="sm"
          variant="outline"
          className="h-7 shrink-0 gap-1"
          onClick={onRetry}
        >
          <RefreshCw className="size-3" />
          重试
        </Button>
      )}
    </div>
  );
}
