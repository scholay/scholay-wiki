import { memo } from 'react';
import {
  AssistantBubble,
  ChatStyles,
  PausedNotice,
  StreamingIndicator,
  ThinkingFold,
  ToolCallBlock,
  ToolHeaderExtras,
  extractToolQuery,
  extractToolSourceBrand,
} from '@/shared/components/chat';
import {
  hasVisibleAssistantContent,
  isLastBlockStreamingText,
  type Turn,
} from '@/shared/types/chat';
import { PaperListScroller } from './PaperListScroller';
import { MINICOD_TOOL_PREFIX } from './types';

/**
 * smart-search 单轮对话渲染 —— 走 shared/components/chat 通用渲染原子, 只在两个地方做特化:
 *
 *   1. **工具结果**:`mcp__minicod__*` 工具的 result 不走 ToolCallBlock 默认的 JSON 折叠,
 *      而是渲染成 PaperListScroller (论文卡片列表 + 暂存/收藏)
 *   2. **chip 标题**:在工具名右边追加 "Discovery" / 「query」 这种 smart-search 专属的源品牌 +
 *      搜索词预览, 让用户一眼看到"AI 在搜什么"
 *
 * 其它视觉契约 (气泡 / markdown / thinking / 流式 indicator) 全部走 shared, 跟 claw 保持一致。
 */
// memo: 长会话里历史轮 turn 引用稳定(replayHistoryAsTurns 经 useMemo 缓存)→ 跳过重渲染,
// 只有流式中那轮重渲染。配合 SmartSearchPanel 的渲染窗口压住长会话开销。
export const AssistantTurn = memo(function AssistantTurn({ turn }: { turn: Turn }) {
  const visible = hasVisibleAssistantContent(turn);
  const isThinkingActive =
    !turn.complete && turn.placeholder?.state === 'thinking';

  const isStreamingText = isLastBlockStreamingText(turn);
  const showTrailingIndicator =
    !turn.complete && !turn.errorMessage && visible && !isStreamingText;

  // 命中每日额度、未发送的那轮:agent 永不对它回事件(complete 永远 false),不能走下面的
  // 流式占位分支(否则一直转圈)。渲染一条「未发送」提示,原文已回填输入框可直接重发。
  if (turn.blocked) {
    return (
      <div className="text-xs text-muted-foreground bg-surface-2 border border-border rounded-sm px-2.5 py-1.5">
        本条未发送 —— 本周期额度已用完。可消耗经费重置、开通会员,或等周期到期后重新发送。
      </div>
    );
  }

  // turn 未完成且没产生可视内容 —— 单独占位行 (含 thinking 折叠)
  if (!turn.complete && !turn.errorMessage && !visible) {
    return (
      <div className="space-y-2 min-w-0">
        <ChatStyles />
        {turn.thinkingText && (
          <ThinkingFold text={turn.thinkingText} isActive={isThinkingActive} />
        )}
        <StreamingIndicator turn={turn} />
      </div>
    );
  }

  return (
    <div className="space-y-2.5 min-w-0">
      <ChatStyles />
      {turn.thinkingText && (
        <ThinkingFold text={turn.thinkingText} isActive={isThinkingActive} />
      )}

      {turn.blocks.map((block, idx) => {
        if (block.kind === 'text') {
          if (!block.text) return null;
          const isLastTextStreaming =
            !turn.complete &&
            idx === turn.blocks.length - 1 &&
            turn.placeholder?.state === 'streaming';
          return (
            <AssistantBubble
              key={block.id}
              text={block.text}
              streaming={isLastTextStreaming}
            />
          );
        }

        const isMinicod = block.toolName.startsWith(MINICOD_TOOL_PREFIX);
        const query = extractToolQuery(block.input);
        const sourceBrand = extractToolSourceBrand(block.input);

        // minicod 论文工具: 结果走 PaperListScroller 特化渲染.
        // 已经把结果可视化成卡片列表了, 再给它默认的 JSON 折叠就重复; 因此 expandable=false.
        if (isMinicod) {
          return (
            <div key={block.id} className="space-y-2 min-w-0">
              <ToolCallBlock
                tool={block}
                expandable={false}
                renderHeaderExtras={() => (
                  <ToolHeaderExtras brand={sourceBrand} query={query} />
                )}
              />
              {block.result !== undefined && (
                <PaperListScroller
                  content={block.result}
                  toolUseId={block.toolUseId}
                />
              )}
            </div>
          );
        }

        // 非 minicod 工具 (Read / Bash / WebFetch / 用户自配 MCP 等) 走通用展开.
        return (
          <ToolCallBlock
            key={block.id}
            tool={block}
            renderHeaderExtras={() => (
              <ToolHeaderExtras brand={sourceBrand} query={query} />
            )}
          />
        );
      })}

      {showTrailingIndicator && <StreamingIndicator turn={turn} />}

      {turn.errorMessage && (
        <div className="text-xs text-brand-red bg-danger-soft border border-brand-red/20 rounded-sm px-2.5 py-1.5">
          {turn.errorMessage}
        </div>
      )}

      {/* 整轮被用户暂停 —— 末尾收尾标识 (实时 + 重入回放都走这里) */}
      {turn.complete && turn.paused && !turn.errorMessage && <PausedNotice />}
    </div>
  );
});

// ToolHeaderExtras / extractToolQuery / extractToolSourceBrand 已提升到
// @/shared/components/chat(MinicodToolMeta)—— admin 会话监控复用同一份,chip 视觉一致。
