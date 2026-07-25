import { useEffect, useRef, useState } from 'react';
import { Sparkles } from 'lucide-react';
import {
  findPendingToolBlock,
  type Turn,
} from '@/shared/types/chat';
import { CyclingHint } from '@/shared/components/CyclingHint';

/**
 * 流式占位胶囊 —— turn 未完成且当前不在写 text 时, 在末尾持续显示。
 *
 * 解决的体验问题:
 *   工具结果回来 → AI 还在想下一步 (没产生新 text/tool 调用) 这段时间, 页面没有反馈,
 *   用户会以为 AI 卡住了。这个 indicator 在那段空白填一个"还活着"的视觉。
 *
 * 等待可感知(W5 P1-D2):
 *   - 组件本地每秒自计时(mount 即等待起点;placeholder.elapsedSeconds 有值时取两者较大,
 *     status 帧的 elapsed 是整轮口径、但可能长时间不更新,取 max 保证秒数持续推进);
 *   - ≥5s 显示等待秒数;≥20s 文案切 CyclingHint 轮换(复杂任务处理中…),缓解长等待焦虑。
 *   历史回放的轮 complete=true 不渲染本组件 → 无计时、天然降级。
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

const LONG_WAIT_HINTS = ['复杂任务处理中,通常需要几分钟', '仍在推进,可随时停止'];

export function StreamingIndicator({ turn }: StreamingIndicatorProps) {
  // 本地计时:组件仅在等待期挂载,mount 即等待起点。自驱动 tick 覆盖无帧间隙
  // (MessageTurn 是 memo,但流式轮引用每帧都变 → 本组件正常重渲染;计时器兜住帧停时段)。
  const startRef = useRef(Date.now());
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => setTick((v) => v + 1), 1000);
    return () => window.clearInterval(t);
  }, []);
  const localSec = Math.floor((Date.now() - startRef.current) / 1000);
  const sec = Math.max(localSec, turn.placeholder?.elapsedSeconds ?? 0);

  const text = streamingText(turn);
  return (
    <div className="inline-flex items-center gap-1.5 h-6 px-2.5 rounded-pill bg-surface-2/80 border border-border-soft/60 w-fit max-w-full min-w-0">
      <Sparkles
        className="size-3 shrink-0 text-brand-green animate-pulse"
        strokeWidth={2.2}
      />
      {sec >= 20 ? (
        <CyclingHint
          phrases={[text, ...LONG_WAIT_HINTS]}
          className="text-xs font-medium text-muted-foreground truncate min-w-0"
        />
      ) : (
        <span className="text-xs font-medium text-muted-foreground truncate min-w-0">
          {text}
        </span>
      )}
      {sec >= 5 && (
        <span className="text-2xs text-faint shrink-0 tabular-nums">{formatWait(sec)}</span>
      )}
      <span className="chat-thinking-dots shrink-0" />
    </div>
  );
}

/** 等待时长展示:60s 内按秒,之后「N 分 M 秒」。 */
function formatWait(sec: number): string {
  if (sec < 60) return `${sec} 秒`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s > 0 ? `${m} 分 ${s} 秒` : `${m} 分`;
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
  if (toolName === 'Write') return '正在撰写文档';
  if (toolName === 'Edit' || toolName === 'MultiEdit') return '正在修改文档';
  if (toolName === 'Bash') return '正在执行命令';
  if (toolName === 'WebFetch' || toolName === 'WebSearch') return '正在查询网页';
  if (toolName === 'Skill') return '正在调用技能';
  return '调用工具中';
}
