import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Sparkles } from 'lucide-react';

/**
 * 思考过程折叠面板 —— 跨 chat feature 共享。参考 cc-haha (agent) demo client 的 ThinkingBlock:
 *
 * 三态:
 *   - **流式中** (isActive=true): 默认 **展开**, 内容区自动滚到底跟随累积,
 *     展开时末尾有闪烁竖线光标 (chat-cursor-blink)
 *   - **完成后** (isActive=false): 默认 **收起**, 标题旁显示第一行预览 (60 字截断)
 *   - **用户 override**: 一旦点过标题, 不再受 isActive 影响, 维持用户的选择
 *
 * 视觉 token:
 *   - 容器: rounded-md + bg-surface-2/40 + border-border-soft/40 (低对比, 视觉退后)
 *   - 标题: text-2xs + text-muted-foreground (扫读时不抢眼)
 *   - 内容: monospace + text-2xs + max-h-72 + overflow-y-auto (累积多了不撑外层)
 *
 * 跟传统"全文展开"相比的优势:
 *   1. 预览能给用户"知道 AI 在想什么"的反馈, 又不喧宾夺主
 *   2. 流式中自动展开让用户感受到推理流, 完成后自动收起释放视觉空间
 *   3. 用户 override 让"我要看完整思考"的细查场景也支持
 */
export interface ThinkingFoldProps {
  /** 累积的思考文本 (英文推理草稿) */
  text: string;
  /** 当前是否还在累积流式 thinking; true 时默认展开 + 滚动跟随 + 光标 */
  isActive: boolean;
  /** 可选 className 用于外层定位调整 (e.g. mb-2) */
  className?: string;
}

const PREVIEW_MAX = 60;

export function ThinkingFold({ text, isActive, className }: ThinkingFoldProps) {
  // undefined = 跟随 isActive 默认; true/false = 用户显式 override
  const [override, setOverride] = useState<boolean | undefined>(undefined);
  const expanded = override ?? isActive;

  const contentRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (expanded && isActive && contentRef.current) {
      contentRef.current.scrollTop = contentRef.current.scrollHeight;
    }
  }, [text, expanded, isActive]);

  // 「已思考 N 秒」摘要(2026-07-15 重设计,业界规范):组件内本地计时 —— isActive 首次 true 记开始,
  // 转 false 时算耗时并定住。历史回放(isActive 一直 false)无开始时间 → 不显示秒数,退回「思考过程」。
  const startRef = useRef<number | null>(null);
  const [durationSec, setDurationSec] = useState<number | null>(null);
  useEffect(() => {
    if (isActive && startRef.current === null) {
      startRef.current = Date.now();
    } else if (!isActive && startRef.current !== null) {
      setDurationSec(Math.max(1, Math.round((Date.now() - startRef.current) / 1000)));
      startRef.current = null;
    }
  }, [isActive]);

  // 思考中实时秒数(W5 P1-D3):流式思考期每秒推进,「黑盒等待」变「可见推进」——52% 轮
  // 思考字数>正文,思考期是最长的等待段。历史回放 isActive 恒 false → 计时器不挂、无秒数。
  const [liveSec, setLiveSec] = useState(0);
  useEffect(() => {
    if (!isActive) {
      setLiveSec(0);
      return;
    }
    const t = window.setInterval(() => {
      if (startRef.current !== null) {
        setLiveSec(Math.floor((Date.now() - startRef.current) / 1000));
      }
    }, 1000);
    return () => window.clearInterval(t);
  }, [isActive]);

  // 第一行非空 + 截断 60 字符
  const firstLine =
    text
      .split('\n')
      .map((l) => l.trim())
      .find(Boolean) ?? '';
  const preview =
    firstLine.length > PREVIEW_MAX
      ? firstLine.slice(0, PREVIEW_MAX) + '…'
      : firstLine;

  return (
    <div
      className={
        // 更轻的容器(2026-07-15 重设计):去边框、更淡的底 —— 思考过程是次要信息,视觉退到最后,
        // 与 Claude/ChatGPT 把推理呈现为低调可折叠区块的做法一致。
        'rounded-md bg-surface-1/60 ' +
        (className ?? '')
      }
    >
      <button
        type="button"
        onClick={() => setOverride(!expanded)}
        className="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left text-2xs text-muted-foreground hover:text-foreground transition-colors min-w-0"
        aria-expanded={expanded}
      >
        {expanded ? (
          <ChevronDown className="size-3 shrink-0" strokeWidth={2.2} />
        ) : (
          <ChevronRight className="size-3 shrink-0" strokeWidth={2.2} />
        )}
        <Sparkles
          className={
            'size-3 shrink-0 ' +
            (isActive ? 'text-brand-green' : 'text-faint')
          }
          strokeWidth={2.2}
        />
        <span className="shrink-0 font-medium">
          {isActive ? (
            <>
              思考中
              {liveSec >= 3 && <span className="tabular-nums">{` · ${liveSec} 秒`}</span>}
              <span className="chat-thinking-dots ml-0.5" />
            </>
          ) : durationSec != null ? (
            formatThinkDuration(durationSec)
          ) : (
            '思考过程'
          )}
        </span>
        {!expanded && preview && (
          <span className="min-w-0 flex-1 truncate font-mono text-2xs text-faint">
            {preview}
          </span>
        )}
      </button>
      {expanded && (
        <div
          ref={contentRef}
          className="max-h-72 overflow-y-auto px-2.5 pb-2 text-2xs font-mono leading-paragraph text-muted-foreground whitespace-pre-wrap break-words"
        >
          {text}
          {isActive && (
            <span
              aria-hidden
              className="ml-0.5 inline-block h-3 w-0.5 align-text-bottom bg-muted-foreground chat-cursor-blink"
            />
          )}
        </div>
      )}
    </div>
  );
}

/** 「已思考 N 秒」摘要文案 —— 与 ChatGPT「Thought for Ns」同款,给完成后的思考块一个收尾摘要。 */
function formatThinkDuration(sec: number): string {
  if (sec < 60) return `已思考 ${sec} 秒`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s > 0 ? `已思考 ${m} 分 ${s} 秒` : `已思考 ${m} 分`;
}
