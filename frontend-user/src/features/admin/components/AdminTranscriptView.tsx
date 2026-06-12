import { useMemo, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import {
  replayHistoryAsTurns,
  parseUserEntryWithAttachments,
} from '@/shared/lib/agent-history';
import {
  AssistantBubble,
  AttachmentChipList,
  ChatStyles,
  PausedNotice,
  PaperListReadonly,
  ProcessFold,
  ThinkingFold,
  ToolCallBlock,
  ToolHeaderExtras,
  UserBubble,
  extractToolQuery,
  extractToolSourceBrand,
} from '@/shared/components/chat';
import { MINICOD_TOOL_PREFIX } from '@/shared/lib/minicod-papers';
import { Button } from '@/shared/ui/button';
import type { Turn } from '@/shared/types/chat';
import type { TranscriptEntry } from '../api/session-monitor';

/**
 * 管理端只读 transcript 渲染 —— 按 featureKey 分流,逐 feature **镜像用户端的真实渲染**
 * (smart-search 的 AssistantTurn / claw 的 MessageTurn / prism 的 PrismMessageTurn),
 * 保证「管理员看到的 = 用户看到的」:
 *   - 折叠选项同款:claw 走 parseUserEntryWithAttachments(@"path" 附件前缀 → chip);
 *   - 附件 chips / 错误卡 / 「已暂停」标识 / 空文本块过滤 全部对齐;
 *   - smart-search:minicod 工具 chip 带「源品牌 + 搜索词」、结果渲染只读论文卡(expandable=false 同款);
 *   - prism:「处理过程 · N 步」折叠 + 末尾总结常驻(shared ProcessFold 同一份组件)。
 * 只读差异(刻意):无输入框 / 无流式光标 / 论文卡无收藏暂存交互 / claw 产物卡不展示
 * (artifacts 走用户态 API,管理端无对应端点)。
 * 长会话防卡:默认渲染最近 60 轮,「加载更早」增量展开(与用户端渲染窗口策略一致)。
 */

const RENDER_WINDOW = 60;

/** 通用尾部:错误卡(claw/prism 同款样式)+ 已暂停。 */
function TurnTail({ turn }: { turn: Turn }) {
  return (
    <>
      {turn.errorMessage && (
        <div className="flex items-start gap-2 rounded-md border border-brand-red/30 bg-danger-soft px-3 py-2">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-brand-red" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-brand-red">回答失败</p>
            <p className="text-xs text-muted-foreground break-words">{turn.errorMessage}</p>
          </div>
        </div>
      )}
      {turn.complete && turn.paused && !turn.errorMessage && <PausedNotice />}
    </>
  );
}

/** claw 镜像(MessageTurn 只读版):附件 chips + 顺序块 + 错误/暂停。 */
function ClawTurn({ turn }: { turn: Turn }) {
  return (
    <article className="flex flex-col gap-2.5 min-w-0">
      <UserBubble
        text={turn.userText}
        attachments={
          turn.userAttachments && turn.userAttachments.length > 0 ? (
            <AttachmentChipList attachments={turn.userAttachments} />
          ) : undefined
        }
      />
      {turn.thinkingText && <ThinkingFold text={turn.thinkingText} isActive={false} />}
      {turn.blocks.map((b) => {
        if (b.kind === 'text') {
          if (!b.text) return null;
          return <AssistantBubble key={b.id} text={b.text} />;
        }
        return <ToolCallBlock key={b.id} tool={b} />;
      })}
      <TurnTail turn={turn} />
    </article>
  );
}

/** smart-search 镜像(AssistantTurn 只读版):minicod 工具特化(品牌+搜索词 chip、只读论文卡)。 */
function SearchTurn({ turn }: { turn: Turn }) {
  return (
    <article className="flex flex-col gap-2.5 min-w-0">
      <UserBubble text={turn.userText} />
      {turn.thinkingText && <ThinkingFold text={turn.thinkingText} isActive={false} />}
      {turn.blocks.map((b) => {
        if (b.kind === 'text') {
          if (!b.text) return null;
          return <AssistantBubble key={b.id} text={b.text} />;
        }
        const isMinicod = b.toolName.startsWith(MINICOD_TOOL_PREFIX);
        const query = extractToolQuery(b.input);
        const brand = extractToolSourceBrand(b.input);
        if (isMinicod) {
          // 与用户端同款:结果已可视化成卡片列表,chip 不再展开 JSON(expandable=false)。
          return (
            <div key={b.id} className="space-y-2 min-w-0">
              <ToolCallBlock
                tool={b}
                expandable={false}
                renderHeaderExtras={() => <ToolHeaderExtras brand={brand} query={query} />}
              />
              {b.result !== undefined && <PaperListReadonly content={b.result} />}
            </div>
          );
        }
        return (
          <ToolCallBlock
            key={b.id}
            tool={b}
            renderHeaderExtras={() => <ToolHeaderExtras brand={brand} query={query} />}
          />
        );
      })}
      <TurnTail turn={turn} />
    </article>
  );
}

/** prism 镜像(PrismMessageTurn 只读版):「处理过程 · N 步」折叠 + 末尾总结常驻。 */
function PrismTurn({ turn }: { turn: Turn }) {
  const blocks = turn.blocks;
  const last = blocks[blocks.length - 1];
  const finalText = turn.complete && last && last.kind === 'text' && last.text ? last : null;
  const processBlocks = finalText ? blocks.slice(0, -1) : blocks;
  const toolSteps = processBlocks.filter((b) => b.kind === 'tool').length;
  const hasProcess = !!turn.thinkingText || processBlocks.length > 0;

  return (
    <article className="flex flex-col gap-2 min-w-0">
      <UserBubble text={turn.userText} />
      {hasProcess && (
        <ProcessFold streaming={false} toolSteps={toolSteps}>
          {turn.thinkingText && <ThinkingFold text={turn.thinkingText} isActive={false} />}
          {processBlocks.map((b) => {
            if (b.kind === 'text') {
              if (!b.text) return null;
              return <AssistantBubble key={b.id} text={b.text} />;
            }
            return <ToolCallBlock key={b.id} tool={b} />;
          })}
        </ProcessFold>
      )}
      {finalText && <AssistantBubble text={finalText.text} />}
      <TurnTail turn={turn} />
    </article>
  );
}

export function AdminTranscriptView({
  messages,
  featureKey,
}: {
  messages: TranscriptEntry[];
  /** 会话归属 feature(smart_search | claw | prism)—— 决定折叠选项与轮渲染镜像。 */
  featureKey?: string;
}) {
  const turns = useMemo(
    () =>
      replayHistoryAsTurns(
        messages,
        // claw 的 user 文本带 @"path" 附件前缀,必须用同款解析还原 chip,
        // 否则管理员看到的是泄漏的容器绝对路径 + UUID 文件名。
        featureKey === 'claw' ? { parseUserEntry: parseUserEntryWithAttachments } : undefined,
      ),
    [messages, featureKey],
  );
  // 渲染窗口:默认最近 60 轮,「加载更早」每次再放 60(与用户端长会话策略一致,防上千轮卡死弹窗)。
  const [limit, setLimit] = useState(RENDER_WINDOW);
  const visible = turns.length > limit ? turns.slice(turns.length - limit) : turns;

  if (turns.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-faint">
        无会话内容(用户尚未对话,或会话已被清理)
      </div>
    );
  }

  const TurnRenderer =
    featureKey === 'claw' ? ClawTurn : featureKey === 'prism' ? PrismTurn : SearchTurn;

  return (
    <div className="space-y-5">
      <ChatStyles />
      {turns.length > limit && (
        <div className="text-center">
          <Button size="sm" variant="outline" onClick={() => setLimit((l) => l + RENDER_WINDOW)}>
            加载更早(还有 {turns.length - limit} 轮)
          </Button>
        </div>
      )}
      {visible.map((t) => (
        <TurnRenderer key={t.id} turn={t} />
      ))}
    </div>
  );
}
