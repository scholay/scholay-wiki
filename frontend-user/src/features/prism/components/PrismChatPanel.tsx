import { useEffect, useRef, useState } from 'react';
import { Loader2, Check, FileText, Quote, X, WifiOff, ListChecks } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { cn } from '@/shared/lib/utils';
import { trackEvent } from '@/shared/lib/track';
import { AttachmentLightbox } from '@/shared/components/chat/AttachmentLightbox';
import {
  Composer,
  ComposerAttachmentRow,
  ComposerPlusMenu,
  LibraryReferencePicker,
  QuestionPrompt,
  ReferenceChipList,
  findPendingQuestionBlock,
  type ComposerHandle,
  type ReferenceSelection,
} from '@/shared/components/chat';
import { Upload } from 'lucide-react';
import { toast } from 'sonner';
import { useComposerAttachments, ATTACHMENT_ACCEPT } from '@/shared/hooks/useComposerAttachments';
import { useUploadAgentAttachment, useReferenceAgentLibrary } from '@/shared/api/agent-attach';
import type { ReferenceItemDTO } from '@/shared/types/chat';
import type { PrismSendExtras } from '../hooks/usePrismChat';
import { ModelSelector } from '@/shared/components/chat/ModelSelector';
import { modelSupportsVision, useUserModels } from '@/shared/api/models';
import type { usePrismChat, PrismChangeset } from '../hooks/usePrismChat';
import { PrismMessageTurn } from './chat/PrismMessageTurn';
import { PrismChatEmptyState, PrismWritingMenuButton, type WritingMenuProps } from './PrismWritingMenu';

/**
 * Prism agent-native 对话面板(用户 WS):与 claw/smart-search 共用 shared/components/chat 渲染
 * (实时工具/思考/prose,「处理过程」可收起)+ 改动卡片(应用/丢弃门)+ claw 风格输入框。
 */
export function PrismChatPanel({
  chat,
  fileId,
  quote,
  onClearQuote,
  onSend,
  prefill,
  onPrefillConsumed,
  menu,
  reviewMode,
  onToggleReviewMode,
}: {
  chat: ReturnType<typeof usePrismChat>;
  fileId: number | null;
  quote?: string;
  onClearQuote?: () => void;
  onSend: (instruction: string, extras?: PrismSendExtras) => void;
  /** 快捷按钮预填(V4-R1):把模板指令填进输入框,用户补空/确认后再发,不直接发送。 */
  prefill?: string;
  onPrefillConsumed?: () => void;
  /** 写作能力菜单(V4-R1 UI 重做):空态引导卡 + composer ✨ 弹出菜单;不传则两者都不渲染。 */
  menu?: WritingMenuProps;
  /** 逐块审阅模式开关(从头栏迁进对话框,像切模型那样跟着对话走):AI 改完是否先停在逐块 diff 确认门。 */
  reviewMode?: boolean;
  onToggleReviewMode?: () => void;
}) {
  const threadEnd = useRef<HTMLDivElement>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<ComposerHandle>(null);
  const atBottomRef = useRef(true);

  // P2 模型目录:选择器数据(目录未配置时优雅缺席)。
  const { data: userModels } = useUserModels('prism');

  // ── 附件/引用(2026-07 输入框统一;端点 per-project)────────
  // 多对话:附件必须落**当前活动对话**的 cwd —— 端点带 ?session_id=<活动对话>(后端 attachSession 据此
  // resolveConversation);省略(chat.sessionId=null,跟随后端最近活跃)则后端回落当前对话。切对话后 chat.sessionId
  // 变 → 这里 URL 重算 → 新上传落到切后的对话。
  const convQ = chat.sessionId ? `?session_id=${encodeURIComponent(chat.sessionId)}` : '';
  const uploadMutation = useUploadAgentAttachment(`/user/prism/projects/${chat.projectId}/upload${convQ}`);
  const referenceMutation = useReferenceAgentLibrary(`/user/prism/projects/${chat.projectId}/reference${convQ}`);
  const [references, setReferences] = useState<ReferenceItemDTO[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const att = useComposerAttachments({
    upload: (file) => uploadMutation.mutateAsync({ file, sessionId: null }),
    // P2 图片通道:图片入口跟随当前会话模型的视觉能力(诚实 UI)。
    acceptImages: modelSupportsVision(userModels, chat.sessionModel),
  });
  const handleReferenceConfirm = async (sel: ReferenceSelection) => {
    try {
      const res = await referenceMutation.mutateAsync({
        sessionId: null,
        paperIds: sel.paperIds,
        folderIds: sel.folderIds,
      });
      setReferences((prev) => {
        const seen = new Set(prev.map((r) => `${r.kind}:${r.refId}`));
        const add = res.items.filter((r) => !seen.has(`${r.kind}:${r.refId}`));
        return [...prev, ...add];
      });
      setPickerOpen(false);
      if (res.items.length === 0) toast.info('所选文献为空或不可用');
    } catch (err) {
      toast.error((err as Error).message || '引用失败');
    }
  };

  const hasThread = chat.turns.length > 0;

  const onThreadScroll = () => {
    const el = threadRef.current;
    if (el) atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
  };
  useEffect(() => {
    if (atBottomRef.current) threadEnd.current?.scrollIntoView({ behavior: chat.streaming ? 'auto' : 'smooth' });
  }, [chat.turns, chat.streaming]);

  useEffect(() => {
    if (quote) composerRef.current?.focus();
  }, [quote]);

  // 快捷按钮预填 → 填入输入框 + 聚焦(覆盖旧草稿是刻意的:点按钮=明确意图)。
  useEffect(() => {
    if (!prefill) return;
    composerRef.current?.prefill(prefill);
    onPrefillConsumed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefill]);

  // 不能发的情形:无文件 / 流式中 / 有待应用改动(先决定 应用/丢弃)/ WS 未连上。
  const blocked = !fileId || chat.streaming || chat.awaitingApply;
  const wsReady = chat.wsState === 'open';
  // 交互提问(AskUserQuestion,方案 B):待作答问题浮到输入框上方由 QuestionPrompt 分步承接,答案经
  // onSend 作为普通指令回传(与 claw/smart-search 同款)。答完新一轮开启 → 翻 null 面板消失。
  const pendingQuestionBlock = findPendingQuestionBlock(chat.turns);

  const placeholder = !fileId
    ? '先选一个文件'
    : chat.awaitingApply
    ? '先在上方审阅并 应用 / 丢弃 当前改动'
    : !wsReady
    ? '连接中…'
    : quote
    ? '对引用的内容做点什么…'
    : '让 AI 续写、改写、润色…(Enter 发送)';

  const showThread = hasThread || chat.streaming || chat.changeset;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
      {/* WS 状态条:重连/断开/被接管 */}
      {chat.displacedReason ? (
        <div className="flex items-center justify-between gap-2 bg-warning-soft px-3.5 py-1.5 text-2xs text-prism-badge-fg">
          <span className="flex items-center gap-1.5"><WifiOff className="size-3" /> {chat.displacedReason}</span>
          <button type="button" onClick={chat.takeOver} className="font-bold underline">切回这里</button>
        </div>
      ) : chat.wsState === 'reconnecting' || chat.wsState === 'connecting' ? (
        <div className="flex items-center gap-1.5 bg-surface-1 px-3.5 py-1 text-2xs text-faint">
          <Loader2 className="size-3 animate-spin" /> 连接中…
        </div>
      ) : chat.wsState === 'error' ? (
        <div className="flex items-center gap-1.5 bg-danger-soft px-3.5 py-1 text-2xs text-brand-red">
          <WifiOff className="size-3" /> 连接断开,正在重试…
        </div>
      ) : null}

      {showThread ? (
        <div ref={threadRef} onScroll={onThreadScroll} className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-3.5 py-3">
          {/* 超长会话:进来只拉最近 N 轮,有更早历史时给「加载更早」(避开在途/待应用轮以免覆盖) */}
          {chat.hasMoreHistory && !chat.streaming && !chat.awaitingApply && (
            <div className="flex justify-center">
              <button
                type="button"
                onClick={chat.loadEarlier}
                disabled={chat.loadingEarlier}
                className="rounded-pill border border-border-button px-3 py-1 text-2xs text-muted-foreground transition-colors hover:bg-surface-2 disabled:opacity-60"
              >
                {chat.loadingEarlier ? '加载中…' : '加载更早'}
              </button>
            </div>
          )}
          {chat.turns.map((t) => (
            <PrismMessageTurn key={t.id} turn={t} />
          ))}
          {chat.changeset && (
            <ChangesetCard cs={chat.changeset} onApply={chat.apply} onReject={chat.reject} />
          )}
          <div ref={threadEnd} />
        </div>
      ) : menu ? (
        // 空对话:引导住进留白(问候 + 智能起草卡 + 精选能力卡);开聊即让位(V4-R1 UI 重做)。
        <PrismChatEmptyState {...menu} disabled={menu.disabled || blocked} />
      ) : (
        <div className="flex-1" />
      )}

      {/* 输入框 —— 三 agent 统一 Composer(shared/components/chat;主流形态单一真源) */}
      <div className="shrink-0 p-3">
        {pendingQuestionBlock && (
          <QuestionPrompt
            key={pendingQuestionBlock.toolUseId}
            block={pendingQuestionBlock}
            onSubmit={(t) => {
              if (blocked || !wsReady) return;
              onSend(t);
            }}
          />
        )}
        <Composer
          ref={composerRef}
          onSend={(t) => {
            if (blocked || !wsReady) return;
            trackEvent('prism_edit', { len: t.length, files: att.attachments.length, refs: references.length });
            onSend(t, {
              attachments: att.attachments,
              references,
            });
            att.clearAttachments();
            setReferences([]);
          }}
          placeholder={placeholder}
          disabled={blocked}
          sendReady={wsReady}
          busy={chat.streaming}
          onStop={chat.stop}
          context={chat.context}
          maxHeightPx={180}
          topSlot={
            <>
              {quote && (
                <div className="flex items-start gap-1.5 rounded-md border-l-2 border-brand-green bg-surface-1 px-2 py-1.5">
                  <Quote className="mt-0.5 size-3 shrink-0 text-brand-green" />
                  <span className="line-clamp-2 flex-1 whitespace-pre-wrap text-2xs leading-snug text-subtle">{quote}</span>
                  <button type="button" onClick={onClearQuote} title="移除引用" className="shrink-0 text-faint transition-colors hover:text-foreground">
                    <X className="size-3" />
                  </button>
                </div>
              )}
              <ComposerAttachmentRow
                items={att.items}
                onRemove={att.removeItem}
                onRetry={att.retryItem}
                onEnlarge={(src, alt) => att.setLightbox({ src, alt })}
              />
              {references.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <ReferenceChipList
                    references={references.map((r) => ({
                      kind: r.kind, title: r.title, paperCount: r.paperCount, hasPdf: r.hasPdf,
                    }))}
                    onRemove={(i) => setReferences((prev) => prev.filter((_, idx) => idx !== i))}
                  />
                </div>
              )}
            </>
          }
          onPaste={att.handlePaste}
          containerProps={att.dragHandlers}
          overlay={
            att.dragOver ? (
              <div className="absolute inset-0 z-10 flex items-center justify-center gap-2 rounded-16 border-2 border-dashed border-brand-green bg-background/90 text-sm font-medium text-brand-green">
                <Upload className="size-4" />
                松开上传图片 / 文件
              </div>
            ) : undefined
          }
          leftActions={
            <>
              <ComposerPlusMenu
                disabled={blocked || att.uploading}
                accept={ATTACHMENT_ACCEPT}
                onFiles={(files) => void att.addFiles(files)}
                onPickLibrary={() => setPickerOpen(true)}
              />
              {/* 「新对话」已上移到顶栏(醒目);历史对话在左侧栏底部切换 —— 输入框不再放刷新/新对话按钮。 */}
              {/* ✨ 写作能力菜单:有对话后引导的常驻收纳处(空态卡片的全集) */}
              {menu && <PrismWritingMenuButton {...menu} disabled={menu.disabled || blocked} />}
              {/* 逐块审阅开关(从头栏迁来,跟着对话走,像切模型):开=AI 改完先停逐块 diff 确认门再应用 */}
              {onToggleReviewMode && (
                <button
                  type="button"
                  onClick={onToggleReviewMode}
                  disabled={blocked}
                  title="开启后 AI 改完文档先停在逐块 diff,你保留/删改后再应用(像改代码);关闭则改完直接应用"
                  className={cn(
                    'inline-flex h-8 items-center gap-1 rounded-md px-2 text-2xs transition-colors disabled:opacity-50',
                    reviewMode
                      ? 'bg-brand-green/10 text-brand-green hover:bg-brand-green/15'
                      : 'text-muted-foreground hover:bg-surface-2 hover:text-foreground',
                  )}
                >
                  <ListChecks className="size-3.5 shrink-0" />
                  逐块审阅{reviewMode ? ' · 开' : ''}
                </button>
              )}
            </>
          }
          rightActions={
            /* P2 模型目录:会话模型选择器(服务端权威,hub 广播回显)—— 右侧,与主流 AI 对话框一致 */
            userModels && userModels.length > 0 ? (
              <ModelSelector
                models={userModels}
                current={chat.sessionModel}
                currentTokens={chat.context?.totalTokens ?? 0}
                onSelect={chat.setModel}
                onUpgrade={() => { window.location.href = '/pricing'; }}
                disabled={blocked}
              />
            ) : undefined
          }
        />
      </div>

      {/* 附件放大预览 + 引用文献选择器(2026-07 输入框统一) */}
      <AttachmentLightbox
        src={att.lightbox?.src ?? null}
        alt={att.lightbox?.alt}
        onClose={() => att.setLightbox(null)}
      />
      <LibraryReferencePicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onConfirm={handleReferenceConfirm}
        busy={referenceMutation.isPending}
      />
    </div>
  );
}

const STATE_LABEL: Record<PrismChangeset['state'], string> = {
  awaiting_apply: '待应用',
  applied: '已应用',
  discarded: '已丢弃',
};

function ChangesetCard({
  cs,
  onApply,
  onReject,
}: {
  cs: PrismChangeset;
  onApply: () => void;
  onReject: () => void;
}) {
  const awaiting = cs.state === 'awaiting_apply';
  return (
    <div className="rounded-lg border border-border bg-surface-1">
      <div className="flex items-center gap-2.5 px-3 py-2">
        <FileText className="size-4 shrink-0 text-brand-green" />
        <div className="min-w-0 flex-1 truncate text-xs font-bold text-foreground">
          AI 改动
          <span className="ml-1.5 font-normal text-faint">{cs.applied} 个文件</span>
        </div>
        {awaiting ? (
          <div className="flex shrink-0 items-center gap-1">
            <Button size="sm" variant="ghost" data-testid="prism-reject" className="h-7 px-2 text-faint hover:text-brand-red" onClick={onReject}>
              丢弃
            </Button>
            <Button size="sm" data-testid="prism-apply" className="h-7 px-2.5" onClick={onApply}>
              <Check className="size-3.5" /> 应用
            </Button>
          </div>
        ) : (
          <span
            className={cn(
              'shrink-0 rounded-pill px-2 py-0.5 text-2xs',
              cs.state === 'applied' ? 'bg-brand-green/10 text-brand-green' : 'text-faint',
            )}
          >
            {STATE_LABEL[cs.state]}
          </span>
        )}
      </div>
      {awaiting && (
        <div className="border-t border-border-soft px-3 py-1.5 text-2xs text-faint">
          在上方编辑器审阅 diff,确认后「应用」固化,或「丢弃」还原。
        </div>
      )}
    </div>
  );
}
