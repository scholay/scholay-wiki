import { memo, type ReactNode } from 'react';
import { MarkdownRenderer } from './MarkdownRenderer';

/**
 * 用户气泡 & AI 气泡 —— 跨 chat feature 共享的容器壳。
 *
 * 视觉契约 (AI 对话气泡的常见样式):
 *
 *   UserBubble:
 *     - 右对齐, 深色背景 (bg-foreground + text-background) 表"用户输入"
 *     - rounded-2xl + 右下小角 (rounded-br-md) 像消息气泡指向用户
 *     - max-w-[80%] 防止满屏单条消息撑全宽看着压抑
 *     - whitespace-pre-wrap 保留用户输入的换行 (Shift+Enter 换的行得保住)
 *
 *   AssistantBubble:
 *     - 左对齐, 白底 + 边框 + shadow 表"AI 回应", 视觉更"卡片化"易扫
 *     - rounded-2xl + 左上小角 (rounded-tl-md) 像消息气泡指向 AI
 *     - 不限宽 (max-w-full + min-w-0 + overflow-hidden) 让 markdown 表格 / 论文列表能用满宽,
 *       但永远不撑出横向滚动条
 *     - 流式中末尾绿色细竖线光标闪烁
 */

// ─── UserBubble ─────────────────────────────────────────────────────────

export interface UserBubbleProps {
  text: string;
  /**
   * 附件 chip 行 (可选). claw 在用户消息上方挂图/文件 chip;
   * smart-search 目前不上传, 不传这个 prop。
   * children 这里挂自定义 JSX (例如 <AttachmentChipList attachments={...} />)。
   */
  attachments?: ReactNode;
}

// memo: 流式中父级每帧重渲染, 但 text 是稳定字符串 ⇒ 已完成消息的气泡跳过重渲染。
export const UserBubble = memo(function UserBubble({ text, attachments }: UserBubbleProps) {
  return (
    <div className="flex justify-end min-w-0">
      <div className="max-w-[80%] flex flex-col items-end gap-1.5 min-w-0">
        {attachments}
        <div className="inline-flex items-center rounded-2xl rounded-br-md bg-foreground px-3.5 py-2.5 text-sm leading-relaxed text-background whitespace-pre-wrap break-words">
          {text}
        </div>
      </div>
    </div>
  );
});

// ─── AssistantBubble ─────────────────────────────────────────────────────

export interface AssistantBubbleProps {
  /** markdown 文本 (流式累积后的完整字符串). */
  text: string;
  /** true 时末尾追加闪烁竖线光标; turn 还在流且当前块在写字时传 true */
  streaming?: boolean;
}

// memo: 同上 —— text/streaming 都是标量, 非活跃气泡在流式期间不再重渲染。
export const AssistantBubble = memo(function AssistantBubble({ text, streaming }: AssistantBubbleProps) {
  return (
    <div className="rounded-2xl rounded-tl-md border border-border bg-background px-4 py-3 shadow-sm min-w-0 overflow-hidden">
      <MarkdownRenderer text={text} />
      {streaming && (
        <span
          aria-hidden
          className="ml-0.5 inline-block h-3.5 w-0.5 align-text-bottom bg-brand-green chat-cursor-blink"
        />
      )}
    </div>
  );
});
