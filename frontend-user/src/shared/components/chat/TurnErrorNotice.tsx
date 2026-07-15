import { TriangleAlert } from 'lucide-react';

/**
 * 一轮对话失败的收尾提示 —— 三 agent(claw / smart-search / prism)共用,视觉统一。
 *
 * 设计(2026-07-15 重设计,按业界规范让"失败"不惊慌):
 *   - **不用红色**。红色是系统级告警色,会让用户误以为出了严重故障而焦虑;而一轮 AI 回答
 *     没成功,通常重试/换模型即可,属"提示"而非"告警"。改用 amber(warning-soft 底 + brand-amber
 *     图标),醒目但冷静 —— 与 ChatGPT / Claude 等把 AI 侧失败呈现为温和 inline note 的做法一致。
 *   - 文案直接展示后端已友好化的 message(如"模型服务响应异常,请稍后重试或更换模型"),
 *     不再叠加醒目的"回答失败"红标题。
 */
export function TurnErrorNotice({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-brand-amber/25 bg-warning-soft px-3 py-2">
      <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-brand-amber" strokeWidth={2.2} />
      <p className="min-w-0 flex-1 break-words text-xs leading-relaxed text-subtle">{message}</p>
    </div>
  );
}
