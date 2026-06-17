import { memo, useMemo } from 'react';
import { AlertCircle } from 'lucide-react';
import {
  AssistantBubble,
  AttachmentChipList,
  ChatStyles,
  PausedNotice,
  StreamingIndicator,
  ThinkingFold,
  ToolCallBlock,
  UserBubble,
} from '@/shared/components/chat';
import {
  hasVisibleAssistantContent,
  isLastBlockStreamingText,
  type Turn,
} from '@/shared/types/chat';
import type { ClawArtifact } from '../../api/artifacts';
import { TurnArtifacts } from './TurnArtifacts';

// 写文件类工具 —— 这一轮调用了它们且 file_path 落到当前 ./out 产物里, 即视为该轮产出的可下载文件。
const WRITE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit']);

// outTopChild: 从写入路径取它在 out/ 下的"顶层子项"名(文件名 或 一级子目录名)。
// out/report.md → "report.md";out/proj/a.md → "proj"。绝/相对路径都行(定位 out 段)。
function outTopChild(filePath: string): string | null {
  const parts = filePath.split('/').filter(Boolean);
  const i = parts.indexOf('out');
  if (i < 0 || i + 1 >= parts.length) return null;
  return parts[i + 1];
}

// extractTurnArtifacts: 从本轮 blocks 的写文件工具调用里, 取出它在 out/ 下触达的顶层产物
// (单文件 或 一级子目录), 与当前 ./out 实时列表(含 file/dir)按名匹配 → 存在才挂卡;同一产物去重。
function extractTurnArtifacts(turn: Turn, artifacts: ClawArtifact[]): ClawArtifact[] {
  const byName = new Map(artifacts.map((a) => [a.name, a]));
  const seen = new Set<string>();
  const out: ClawArtifact[] = [];
  for (const b of turn.blocks) {
    if (b.kind !== 'tool' || !WRITE_TOOLS.has(b.toolName)) continue;
    const fp = (b.input as { file_path?: unknown } | undefined)?.file_path;
    if (typeof fp !== 'string') continue;
    const top = outTopChild(fp); // 文件名 或 一级子目录名
    if (!top || seen.has(top)) continue;
    const art = byName.get(top); // artifacts 顶层既含文件也含目录, 按名匹配
    if (art) {
      seen.add(top);
      out.push(art);
    }
  }
  return out;
}

/**
 * 智能助手 (claw) 单轮对话渲染.
 *
 * 跟 smart-search 共享同一套 shared/components/chat 原子, 视觉契约一致:
 *   - <UserBubble> 右对齐深底气泡 (上方挂可选附件 chip)
 *   - <ThinkingFold> 三态折叠面板 (流式展开+滚动跟随; 完成后预览收起)
 *   - <AssistantBubble variant="plain"> 无气泡·全宽 markdown 正文 (claw 现代风;智能搜索仍是白底卡片)
 *   - <ToolCallBlock> 通用工具调用块, 默认 JSON 折叠展示 input/result
 *   - <StreamingIndicator> 末尾占位胶囊, "正在检索学者/正在执行命令…"
 *
 * 跟 smart-search 唯一的差异是:
 *   1. claw 支持 userAttachments → 通过 <AttachmentChipList> 挂在用户气泡上方
 *   2. claw 不做 minicod 论文工具特化 (ToolCallBlock 默认 JSON 展开就够用)
 */
// memo: 长会话(成百上千轮)里, 父组件每次 re-render / 流式每个 delta 都会让所有轮重渲染。
// 历史轮的 turn 对象引用稳定(replayHistoryAsTurns 被 useMemo 缓存)→ memo 直接跳过它们,
// 只有正在流式的那轮(引用每次变)才重渲染。配合下方 ClawPage 的渲染窗口一起把开销压下来。
export const MessageTurn = memo(function MessageTurn({
  turn,
  artifacts,
  sessionId,
  onPreview,
}: {
  turn: Turn;
  /** 当前会话 ./out 的产物列表(含 manifest 标题);用来认领"本轮产出的可下载文件"。 */
  artifacts?: ClawArtifact[];
  sessionId?: string | null;
  /** 点「预览」→ 打开 ClawPage 右侧预览面板(传 ClawPage 的 setPreviewArtifact,引用稳定不破 memo)。 */
  onPreview?: (a: ClawArtifact) => void;
}) {
  const visible = hasVisibleAssistantContent(turn);
  const turnFiles = useMemo(
    () => (artifacts && artifacts.length ? extractTurnArtifacts(turn, artifacts) : []),
    [turn, artifacts],
  );
  const isThinkingActive =
    !turn.complete && turn.placeholder?.state === 'thinking';
  const isStreamingText = isLastBlockStreamingText(turn);
  const showTrailingIndicator =
    !turn.complete && !turn.errorMessage && visible && !isStreamingText;

  return (
    <article className="flex flex-col gap-2.5 min-w-0">
      <ChatStyles />
      <UserBubble
        text={turn.userText}
        attachments={
          turn.userAttachments && turn.userAttachments.length > 0 ? (
            <AttachmentChipList attachments={turn.userAttachments} />
          ) : undefined
        }
      />

      {turn.thinkingText && (
        <ThinkingFold text={turn.thinkingText} isActive={isThinkingActive} />
      )}

      {!turn.complete && !turn.errorMessage && !visible && (
        <StreamingIndicator turn={turn} />
      )}

      {visible && (
        <>
          {turn.blocks.map((b, idx) => {
            if (b.kind === 'text') {
              if (!b.text) return null;
              const isLastTextStreaming =
                !turn.complete &&
                idx === turn.blocks.length - 1 &&
                turn.placeholder?.state === 'streaming';
              return (
                <AssistantBubble
                  key={b.id}
                  text={b.text}
                  streaming={isLastTextStreaming}
                  // 智能助手用「无气泡·全宽正文」现代风(智能搜索仍是默认 card)。
                  variant="plain"
                />
              );
            }
            return <ToolCallBlock key={b.id} tool={b} />;
          })}
          {showTrailingIndicator && <StreamingIndicator turn={turn} />}
        </>
      )}

      {/* 本轮产出的可下载文件 —— 挂在这条回答下面(多文件/多轮各归各回答)。 */}
      {sessionId && turnFiles.length > 0 && (
        <TurnArtifacts sessionId={sessionId} files={turnFiles} onPreview={onPreview} />
      )}

      {turn.errorMessage && (
        <div className="flex items-start gap-2 rounded-md border border-brand-red/30 bg-danger-soft px-3 py-2">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-brand-red" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-brand-red">回答失败</p>
            <p className="text-xs text-muted-foreground break-words">
              {turn.errorMessage}
            </p>
          </div>
        </div>
      )}

      {/* 整轮被用户暂停 —— 末尾收尾标识 (实时 + 重入回放都走这里) */}
      {turn.complete && turn.paused && !turn.errorMessage && <PausedNotice />}
    </article>
  );
});
