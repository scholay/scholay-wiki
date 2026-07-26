import { memo } from 'react';
import {
  AssistantBubble,
  ChatStyles,
  MinicodAuthorCards,
  MinicodJournalCards,
  MinicodSnippetCards,
  PausedNotice,
  StreamingIndicator,
  TurnErrorNotice,
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
import { classifyMinicodToolResult } from '@/shared/lib/minicod-results';
import { PaperListScroller } from './PaperListScroller';
import { MINICOD_TOOL_PREFIX } from './types';

/**
 * smart-search 单轮对话渲染 —— 走 shared/components/chat 通用渲染原子, 只在两个地方做特化:
 *
 *   1. **工具结果**:`mcp__minicod__*` 工具的 result 不走 ToolCallBlock 默认的 JSON 折叠,
 *      而是渲染成 PaperListScroller (论文卡片列表 + 暂存/收藏)
 *   2. **chip 标题**:在工具名右边追加 "OpenAlex" / 「query」 这种 smart-search 专属的数据源真名 +
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

  // 未发送的那轮(命中每日额度被拦 / 投递失败·连接中断):agent 永不对它回事件(complete 永远
  // false),不能走下面的流式占位分支(否则一直转圈)。渲染一条「未发送」提示,原文已回填输入框
  // 可直接重发;具体原因由各自的 toast / 全局额度弹窗告知,这里保持通用文案。
  if (turn.blocked) {
    return (
      <div className="text-xs text-muted-foreground bg-surface-2 border border-border rounded-12 px-2.5 py-1.5">
        本条未发送(额度已用完或连接中断)。原文已回填输入框,可直接重新发送。
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

        // 交互提问(AskUserQuestion,方案 B):不在对话流里渲染。待作答问题由输入框上方的
        // QuestionPrompt 分步面板承接(SmartSearchPanel);历史/已答态由用户答案气泡表达上下文。
        if (block.toolName === 'AskUserQuestion') return null;

        const isMinicod = block.toolName.startsWith(MINICOD_TOOL_PREFIX);
        const query = extractToolQuery(block.input);
        const sourceBrand = extractToolSourceBrand(block.input);

        // minicod 工具: 按 dispatcher 判定结果类型渲染对应专用卡(论文 / 期刊 / 作者 / 原文片段),
        // 并隐藏 JSON(卡片已可视化, 再给 JSON 折叠就重复)。'unknown'(无法识别)才回退默认可展开
        // 工具块, 让原始 JSON 至少可见 —— 保留安全网, 杜绝「卡片空 + JSON 也被藏」的静默隐形。
        if (isMinicod) {
          const kind =
            block.result !== undefined
              ? classifyMinicodToolResult(block.result, block.toolName)
              : 'unknown';
          return (
            <div key={block.id} className="space-y-2 min-w-0">
              <ToolCallBlock
                tool={block}
                expandable={kind === 'unknown'}
                renderHeaderExtras={() => (
                  <ToolHeaderExtras brand={sourceBrand} query={query} />
                )}
              />
              {kind === 'papers' && (
                <PaperListScroller
                  content={block.result}
                  toolUseId={block.toolUseId}
                />
              )}
              {kind === 'journals' && <MinicodJournalCards content={block.result} />}
              {kind === 'authors' && <MinicodAuthorCards content={block.result} />}
              {kind === 'snippets' && <MinicodSnippetCards content={block.result} />}
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

      {turn.errorMessage && <TurnErrorNotice message={turn.errorMessage} code={turn.errorCode} />}

      {/* 整轮被用户暂停 —— 末尾收尾标识 (实时 + 重入回放都走这里) */}
      {turn.complete && turn.paused && !turn.errorMessage && <PausedNotice />}
    </div>
  );
});

// ToolHeaderExtras / extractToolQuery / extractToolSourceBrand 已提升到
// @/shared/components/chat(MinicodToolMeta)—— admin 会话监控复用同一份,chip 视觉一致。
