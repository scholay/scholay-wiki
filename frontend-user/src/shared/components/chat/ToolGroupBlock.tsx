import { useState, type ReactNode } from 'react';
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleSlash,
  TriangleAlert,
} from 'lucide-react';
import { toolIconFor, toolLabel } from './tool-semantics';
import type { ToolBlock } from '@/shared/types/chat';

/**
 * 相邻同名工具调用的聚合行(chat-turn-layout 的 toolGroup 渲染;重试失败序列是主要目标)。
 * shared 消费方:claw MessageTurn + admin AdminTranscriptView claw 镜像。
 *
 * 折叠态 = 一行「icon 检索论文 ×4 | ✓2 ⚠2 未成功」;失败后最终成功的序列额外给
 * 「已自动重试成功」的绿色定性 —— 把失败叙成 agent 的自愈过程而非报警(失败色沿用
 * amber 不用红的既有拍板)。点击展开逐条 ToolCallBlock(渲染委托 renderTool,
 * minicod 品牌 chip / Skill 徽标等特化由调用方闭包提供,与未聚组的单行完全一致)。
 */
export function ToolGroupBlock({
  toolName,
  blocks,
  renderTool,
}: {
  toolName: string;
  blocks: ToolBlock[];
  renderTool: (b: ToolBlock) => ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const Icon = toolIconFor(toolName);

  const failed = blocks.filter((b) => b.isError && !b.aborted).length;
  const abortedN = blocks.filter((b) => b.aborted).length;
  const succeeded = blocks.length - failed - abortedN;
  const last = blocks[blocks.length - 1];
  // 「已自动重试成功」只认真重试链签名:除最后一次全失败 + 最后一次成功。批量检索
  // (多条不同 query,部分永久失败部分成功)不套此定性 —— 绿色定性会掩盖真实失败
  // (对抗审查 finding #4),那种组老实展示 ✓/⚠ 计数。
  const recovered =
    blocks.length >= 2 &&
    failed === blocks.length - 1 &&
    succeeded === 1 &&
    !!last &&
    last.result !== undefined &&
    !last.isError;

  return (
    <div className="min-w-0 overflow-hidden rounded-8 border border-border-soft bg-surface-1/70">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-2 px-2.5 py-2 text-left text-12 text-muted-foreground hover:bg-surface-2/60 transition-colors min-w-0"
        aria-expanded={expanded}
      >
        <span className="shrink-0">
          {expanded ? (
            <ChevronDown className="size-3" strokeWidth={2.2} />
          ) : (
            <ChevronRight className="size-3" strokeWidth={2.2} />
          )}
        </span>
        <Icon className="size-3 shrink-0 text-muted-foreground" strokeWidth={2.2} />
        <span className="font-medium text-foreground shrink-0 truncate max-w-[40%]">
          {toolLabel(toolName)}
        </span>
        <span className="text-faint shrink-0">×{blocks.length}</span>
        <span className="ml-auto shrink-0 inline-flex items-center gap-2">
          {recovered ? (
            <span className="inline-flex items-center gap-1 text-brand-green font-medium">
              <CheckCircle2 className="size-3" strokeWidth={2.2} />
              已自动重试成功
            </span>
          ) : (
            <>
              {succeeded > 0 && (
                <span className="inline-flex items-center gap-1 text-brand-green">
                  <CheckCircle2 className="size-3" strokeWidth={2.2} />
                  {succeeded}
                </span>
              )}
              {failed > 0 && (
                <span className="inline-flex items-center gap-1 text-brand-amber font-medium">
                  <TriangleAlert className="size-3" strokeWidth={2.2} />
                  {failed} 次未成功
                </span>
              )}
              {abortedN > 0 && (
                <span className="inline-flex items-center gap-1 text-faint">
                  <CircleSlash className="size-3" strokeWidth={2.2} />
                  {abortedN}
                </span>
              )}
            </>
          )}
        </span>
      </button>
      {expanded && (
        <div className="flex flex-col gap-2 border-t border-border-soft px-2.5 py-2">
          {blocks.map((b) => (
            <div key={b.id} className="min-w-0">
              {renderTool(b)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
