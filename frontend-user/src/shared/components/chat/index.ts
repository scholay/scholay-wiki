/**
 * shared/components/chat — 跨 feature 共享的 AI 对话渲染原子。
 *
 * 设计原则:
 *   - 数据模型 (Turn / Block) 走 shared/types/chat, 这里只管渲染
 *   - 每个组件单一职责: bubble / markdown / thinking / tool / indicator / attachment
 *   - 都不感知具体 feature (smart-search / claw / latex 都能用); 特化在 feature 自己内部组合
 *
 * 在 feature 顶层把 <ChatStyles /> 挂一次 (单例), 后续所有 chat 组件就能用 CSS 动画 + ol 序号 chip。
 *
 * 例 (claw / smart-search 都长这样):
 *
 *   <article>
 *     <ChatStyles />
 *     <UserBubble text={turn.userText}
 *       attachments={turn.userAttachments && <AttachmentChipList ... />} />
 *     {turn.thinkingText && (
 *       <ThinkingFold text={turn.thinkingText} isActive={!turn.complete} />
 *     )}
 *     {turn.blocks.map(b =>
 *       b.kind === 'text'
 *         ? <AssistantBubble text={b.text} streaming={...} />
 *         : <ToolCallBlock tool={b} renderResultPreview={...} />
 *     )}
 *     {showIndicator && <StreamingIndicator turn={turn} />}
 *   </article>
 */

export { ChatStyles } from './styles';
export { ThinkingFold, type ThinkingFoldProps } from './ThinkingFold';
export {
  MarkdownRenderer,
  type MarkdownRendererProps,
} from './MarkdownRenderer';
export { CodeBlock } from './CodeBlock';
export {
  UserBubble,
  AssistantBubble,
  type UserBubbleProps,
  type AssistantBubbleProps,
} from './Bubbles';
export {
  ToolCallBlock,
  type ToolCallBlockProps,
} from './ToolCallBlock';
export {
  StreamingIndicator,
  type StreamingIndicatorProps,
} from './StreamingIndicator';
export {
  AttachmentChipList,
  type AttachmentChipListProps,
} from './AttachmentChipList';
export { PausedNotice } from './PausedNotice';
export { ContextMeter, type ContextMeterProps } from './ContextMeter';
