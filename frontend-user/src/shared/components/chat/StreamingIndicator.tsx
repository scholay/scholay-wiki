import { Sparkles } from 'lucide-react';
import {
  findPendingToolBlock,
  type Turn,
} from '@/shared/types/chat';

/**
 * 流式占位胶囊 —— turn 未完成且当前不在写 text 时, 在末尾持续显示。
 *
 * 解决的体验问题:
 *   工具结果回来 → AI 还在想下一步 (没产生新 text/tool 调用) 这段时间, 页面没有反馈,
 *   用户会以为 AI 卡住了。这个 indicator 在那段空白填一个"还活着"的视觉。
 *
 * 文案优先级:
 *   1. 有未完成的 tool 块 → 按工具名出"正在检索学者/期刊/论文…" (覆盖率最高的场景)
 *   2. placeholder.state → tool_executing / streaming / permission_pending / thinking
 *   3. placeholder.verb (agent SDK 自定义) — 后端可以下发任意动词短语
 *   4. 兜底 "AI 思考中"
 *
 * 视觉:
 *   - rounded-pill 胶囊形, brand-green pulse Sparkles + 灰文案 + 三点点点
 *   - bg-surface-2/80 + border-border-soft/60, 轻量不抢眼
 *   - w-fit / inline-flex, 不撑全宽
 */
export interface StreamingIndicatorProps {
  turn: Turn;
}

export function StreamingIndicator({ turn }: StreamingIndicatorProps) {
  const text = streamingText(turn);
  return (
    <div className="inline-flex items-center gap-1.5 h-6 px-2.5 rounded-pill bg-surface-2/80 border border-border-soft/60 w-fit max-w-full min-w-0">
      <Sparkles
        className="size-3 shrink-0 text-brand-green animate-pulse"
        strokeWidth={2.2}
      />
      <span className="text-xs font-medium text-muted-foreground truncate min-w-0">
        {text}
      </span>
      <span className="chat-thinking-dots shrink-0" />
    </div>
  );
}

function streamingText(turn: Turn): string {
  const pendingTool = findPendingToolBlock(turn);
  if (pendingTool) return toolVerb(pendingTool.toolName);

  switch (turn.placeholder?.state) {
    case 'tool_executing':
      return turn.placeholder.verb || '调用工具中';
    case 'streaming':
      return turn.placeholder.verb || '正在回复';
    case 'permission_pending':
      return turn.placeholder.verb || '等待授权';
    case 'thinking':
    case 'idle':
    default:
      return turn.placeholder?.verb || 'AI 思考中';
  }
}

function toolVerb(toolName: string): string {
  if (!toolName) return '调用工具中';
  if (toolName.startsWith('mcp__minicod__')) {
    const sub = toolName.slice('mcp__minicod__'.length);
    if (sub.includes('author')) return '正在检索学者';
    if (sub.includes('journal')) return '正在检索期刊';
    if (sub.includes('paper')) return '正在检索论文';
    if (sub.startsWith('list_')) return '正在加载学术资源';
    return '正在检索学术资源';
  }
  if (toolName === 'Read') return '正在阅读资料';
  if (toolName === 'Bash') return '正在执行命令';
  if (toolName === 'WebFetch' || toolName === 'WebSearch') return '正在查询网页';
  return '调用工具中';
}
