import { useMemo, useState } from 'react';
import { AlertCircle, FileText, Image as ImageIcon } from 'lucide-react';
import {
  replayHistoryAsTurns,
  parseUserEntryWithAttachments,
} from '@/shared/lib/agent-history';
import {
  AssistantBubble,
  ChatStyles,
  MinicodAuthorCards,
  MinicodJournalCards,
  MinicodSnippetCards,
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
import { classifyMinicodToolResult } from '@/shared/lib/minicod-results';
import { Button } from '@/shared/ui/button';
import type { Turn, TurnAttachment } from '@/shared/types/chat';
import type { TranscriptEntry } from '../api/session-monitor';
import type { AdminPreviewFile } from './AdminFilePreviewDialog';

/**
 * 管理端附件 chips —— 用户上传的文件在会话里点开即预览/下载(经 /admin/agent-sessions/:id/file)。
 * 有 path(claw @"path" 前缀还原)→ 可点击调 onPreview;老内联图片(仅 previewUrl)→ 直接显缩略图;
 * 都没有 → 纯文件名 chip。mime 未知,预览器用 blob.type / 文件名后缀兜底。
 */
function AdminAttachmentChips({
  attachments,
  sessionId,
  onPreview,
}: {
  attachments: TurnAttachment[];
  sessionId?: string;
  onPreview?: (f: AdminPreviewFile) => void;
}) {
  if (attachments.length === 0) return null;
  return (
    <div className="flex max-w-full flex-wrap justify-end gap-1.5">
      {attachments.map((a, i) => {
        const canOpen = !!sessionId && !!a.path && !!onPreview;
        const inner = (
          <>
            {a.type === 'image' ? (
              <ImageIcon className="size-3 shrink-0" strokeWidth={2.2} />
            ) : (
              <FileText className="size-3 shrink-0" strokeWidth={2.2} />
            )}
            <span className="min-w-0 truncate">{a.name}</span>
          </>
        );
        if (canOpen) {
          return (
            <button
              key={i}
              type="button"
              title={`${a.name} · 点击预览`}
              onClick={() =>
                onPreview!({
                  src: `/admin/agent-sessions/${sessionId}/file?path=${encodeURIComponent(a.path!)}`,
                  mime: '',
                  filename: a.name,
                })
              }
              className="inline-flex max-w-[220px] items-center gap-1 rounded-4 bg-foreground/85 px-2 py-0.5 text-12 text-background/90 transition-colors hover:bg-foreground"
            >
              {inner}
            </button>
          );
        }
        if (a.type === 'image' && a.previewUrl) {
          return (
            <img
              key={i}
              src={a.previewUrl}
              alt={a.name}
              loading="lazy"
              className="size-14 shrink-0 rounded-8 border border-border-strong object-cover"
            />
          );
        }
        return (
          <span
            key={i}
            className="inline-flex max-w-[220px] items-center gap-1 rounded-4 bg-foreground/85 px-2 py-0.5 text-12 text-background/90"
            title={a.name}
          >
            {inner}
          </span>
        );
      })}
    </div>
  );
}

/**
 * 管理端只读 transcript 渲染 —— 按 featureKey 分流,逐 feature **镜像用户端的真实渲染**
 * (smart-search 的 AssistantTurn / claw 的 MessageTurn / prism 的 PrismMessageTurn),
 * 保证「管理员看到的 = 用户看到的」:
 *   - 折叠选项同款:claw 走 parseUserEntryWithAttachments(@"path" 附件前缀 → chip);
 *   - 附件 chips / 错误卡 / 「已暂停」标识 / 空文本块过滤 全部对齐;
 *   - smart-search:minicod 工具 chip 带「源品牌 + 搜索词」、是论文列表才渲染只读论文卡并隐藏 JSON,
 *     非论文结果回退默认可展开工具块(与用户端同款安全网);
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
        <div className="flex items-start gap-2 rounded-12 border border-brand-red/30 bg-danger-soft px-3 py-2">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-brand-red" />
          <div className="flex-1 min-w-0">
            <p className="text-12 font-medium text-brand-red">回答失败</p>
            <p className="text-12 text-muted-foreground break-words">{turn.errorMessage}</p>
          </div>
        </div>
      )}
      {turn.complete && turn.paused && !turn.errorMessage && <PausedNotice />}
    </>
  );
}

/** claw 镜像(MessageTurn 只读版):附件 chips(可点开预览)+ 顺序块(minicod 工具同用户端特化成
 *  论文/期刊/作者/片段只读卡,其余工具走默认 ToolCallBlock)+ 错误/暂停。 */
function ClawTurn({
  turn,
  sessionId,
  onPreview,
}: {
  turn: Turn;
  sessionId?: string;
  onPreview?: (f: AdminPreviewFile) => void;
}) {
  return (
    <article className="flex flex-col gap-2.5 min-w-0">
      <UserBubble
        text={turn.userText}
        attachments={
          turn.userAttachments && turn.userAttachments.length > 0 ? (
            <AdminAttachmentChips attachments={turn.userAttachments} sessionId={sessionId} onPreview={onPreview} />
          ) : undefined
        }
      />
      {turn.thinkingText && <ThinkingFold text={turn.thinkingText} isActive={false} />}
      {turn.blocks.map((b) => {
        if (b.kind === 'text') {
          if (!b.text) return null;
          return <AssistantBubble key={b.id} text={b.text} />;
        }
        // minicod 工具:与用户端 claw(MessageTurn)同款 —— 按 dispatcher 判定结果类型渲成对应只读卡
        // (论文 / 期刊 / 作者 / 原文片段)并隐藏 JSON + 露出品牌/搜索词 chip;'unknown' 才回退默认可展开,
        // 让管理员至少能看到原始 JSON。非 minicod 工具(Bash / Read / 交付物等)维持默认 ToolCallBlock。
        if (b.toolName.startsWith(MINICOD_TOOL_PREFIX)) {
          const kind =
            b.result !== undefined ? classifyMinicodToolResult(b.result, b.toolName) : 'unknown';
          return (
            <div key={b.id} className="space-y-2 min-w-0">
              <ToolCallBlock
                tool={b}
                expandable={kind === 'unknown'}
                renderHeaderExtras={() => (
                  <ToolHeaderExtras brand={extractToolSourceBrand(b.input)} query={extractToolQuery(b.input)} />
                )}
              />
              {kind === 'papers' && <PaperListReadonly content={b.result} />}
              {kind === 'journals' && <MinicodJournalCards content={b.result} />}
              {kind === 'authors' && <MinicodAuthorCards content={b.result} />}
              {kind === 'snippets' && <MinicodSnippetCards content={b.result} />}
            </div>
          );
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
          // 与用户端同款:按 dispatcher 判定结果类型可视化成对应只读卡(论文 / 期刊 / 作者 / 原文片段)
          // 并隐藏 JSON;'unknown'(OpenAlex 实体/recommend 空壳等无法识别)才回退默认可展开,
          // 让管理员至少能看到原始 JSON,不再静默隐形。
          const kind =
            b.result !== undefined
              ? classifyMinicodToolResult(b.result, b.toolName)
              : 'unknown';
          return (
            <div key={b.id} className="space-y-2 min-w-0">
              <ToolCallBlock
                tool={b}
                expandable={kind === 'unknown'}
                renderHeaderExtras={() => <ToolHeaderExtras brand={brand} query={query} />}
              />
              {kind === 'papers' && <PaperListReadonly content={b.result} />}
              {kind === 'journals' && <MinicodJournalCards content={b.result} />}
              {kind === 'authors' && <MinicodAuthorCards content={b.result} />}
              {kind === 'snippets' && <MinicodSnippetCards content={b.result} />}
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
  sessionId,
  onPreview,
}: {
  messages: TranscriptEntry[];
  /** 会话归属 feature(smart_search | claw | prism)—— 决定折叠选项与轮渲染镜像。 */
  featureKey?: string;
  /** agent 会话 ID —— claw 附件构造 /admin/agent-sessions/:id/file 预览 URL 用。 */
  sessionId?: string;
  /** 点击附件 → 打开文件预览(由 ChatSessionMonitor 承接为叠层弹窗)。 */
  onPreview?: (f: AdminPreviewFile) => void;
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
      <div className="py-8 text-center text-12 text-faint">
        无会话内容(用户尚未对话,或会话已被清理)
      </div>
    );
  }

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
      {visible.map((t) =>
        featureKey === 'claw' ? (
          <ClawTurn key={t.id} turn={t} sessionId={sessionId} onPreview={onPreview} />
        ) : featureKey === 'prism' ? (
          <PrismTurn key={t.id} turn={t} />
        ) : (
          <SearchTurn key={t.id} turn={t} />
        ),
      )}
    </div>
  );
}
