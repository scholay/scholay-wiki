import { forwardRef, useImperativeHandle, useRef, useState, type ReactNode } from 'react';
import { Loader2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { trackEvent } from '@/shared/lib/track';
import { AttachmentLightbox } from '@/shared/components/chat/AttachmentLightbox';
import {
  Composer,
  ComposerAttachmentRow,
  ComposerPlusMenu,
  LibraryReferencePicker,
  ReferenceChipList,
  type ComposerHandle,
  type ReferenceSelection,
} from '@/shared/components/chat';
import { useComposerAttachments, ATTACHMENT_ACCEPT } from '@/shared/hooks/useComposerAttachments';
import type { TurnReference } from '@/shared/types/chat';
import { useUploadClawAttachment, useReferenceClawLibrary } from '../../api/session';
import type { AttachmentDTO, ReferenceItemDTO } from '../../api/types';
import { ComposerSkillsButton } from './ComposerSkillsButton';

/**
 * claw 输入框 = 统一 Composer + 共享附件/引用装配(2026-07 输入框统一:交互逻辑上提
 * @/shared/hooks/useComposerAttachments + ComposerPlusMenu / ComposerAttachmentRow,
 * 本文件只剩 claw 业务:上传/引用 mutation、多会话 adopt、发送打包)。
 *
 * 上传时机:用户选了文件 → 立即 POST /claw/upload → DTO 进 attachments,上方出 chip;
 * 不是 send 时才传(否则点击 send 后要等几秒)。
 */

/** 上下文水位 — 跟 ClawContextSnapshot 子集对齐, 放输入框 footer 展示 (参考 Claude/Cursor)。 */
export interface ComposerContext {
  totalTokens: number;
  maxTokens: number;
  percentage: number;
  model: string;
}

export interface ChatComposerProps {
  /** 输入框 + 发送按钮 整体禁用 (WS 未就绪 / busy 中均传 true) */
  disabled?: boolean;
  /** 正在等 AI 回答 — true 时按钮从 send 切到 stop。跟 disabled 通常一起为 true。 */
  busy?: boolean;
  /** 用户点过 stop 后 AI 还在收尾时, 防止重复点 — 把 stop 按钮转 spinner+disabled */
  stopping?: boolean;
  /** 当前会话上下文水位; 放 footer 右下角展示。null / totalTokens=0 时不显示。 */
  context?: ComposerContext | null;
  onSubmit: (text: string, attachments: AttachmentDTO[], references: ReferenceItemDTO[]) => void;
  /** 停止生成 — busy 时点按钮调这个; 不传时 stop 按钮 disable */
  onStop?: () => void;
  /** 当前会话 id — 上传文件时透传给后端, 让文件落到正在看的这个会话 cwd (claw 多会话)。 */
  sessionId?: string | null;
  /**
   * 上传在新对话 (sessionId 为空) 下会让后端新建会话并回传 id; 此回调通知 ClawPage
   * adopt 这个新会话 ("添加文件 = 开始会话")。已有会话上传时 ensured === 当前 sessionId, 幂等。
   */
  onSessionEnsured?: (sessionId: string) => void;
  /**
   * 未登录态:输入框仍可见可输入(文案提示登录), 但任何"会打到后端"的动作
   * (发送 / 上传文件) 都拦下来改成 onRequireAuth() 弹登录, 不真的发请求。
   */
  requireAuth?: boolean;
  /** requireAuth=true 时, 用户尝试发送/上传 → 调这个弹登录注册。 */
  onRequireAuth?: () => void;
  /** 会话模型选择器(P2 模型目录化):ClawPage 组装 shared ModelSelector 后经此插槽注入。 */
  modelSlot?: ReactNode;
  /** 当前会话模型是否支持图片输入(P2 图片通道;false → 图片被拦下并提示)。 */
  acceptImages?: boolean;
  /** 「新对话」回调 —— 输入框技能面板「在新对话中应用」用(启用变更建会话时冻结)。 */
  onNewConversation?: () => void;
  /** 附件/引用/技能入口开关(默认 true = claw)。制作PPT 纯文本描述,置 false 隐藏上传+引用+技能,
   *  并关掉拖拽/粘贴(该 feature 无对应后端上传端点)。 */
  enableAttachments?: boolean;
  /** 输入框占位文案(默认 claw 文案)。 */
  placeholder?: string;
  /**
   * disabled 态占位文案。默认「正在等待 AI 回答…」只在 busy 时诚实;连接断开时也显示它会把
   * 连接故障伪装成"AI 还在回答"(线上用户误判成因)—— 调用方按真实原因传(如「连接中断,正在重连…」)。
   */
  disabledPlaceholder?: string;
}

/** 命令式句柄 —— 新对话 hero 点「示例提问」chip 时, 把文案填进输入框并聚焦(不直接发送)。 */
export interface ChatComposerHandle {
  prefill: (text: string) => void;
}

export const ChatComposer = forwardRef<ChatComposerHandle, ChatComposerProps>(function ChatComposer({
  disabled,
  busy,
  stopping,
  context,
  onSubmit,
  onStop,
  sessionId,
  onSessionEnsured,
  requireAuth,
  onRequireAuth,
  modelSlot,
  acceptImages,
  onNewConversation,
  enableAttachments = true,
  placeholder,
  disabledPlaceholder,
}, ref) {
  // 「引用文献」选中的论文/文件夹(后端已物化进会话 cwd,这里持 chip 元数据)。
  const [references, setReferences] = useState<ReferenceItemDTO[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const reference = useReferenceClawLibrary();
  const upload = useUploadClawAttachment();
  const composerRef = useRef<ComposerHandle>(null);

  // 附件交互状态机(选择/拖拽/粘贴/chips/lightbox)—— 共享 hook,上传动作注入。
  const att = useComposerAttachments({
    upload: (file, sid) => upload.mutateAsync({ file, sessionId: sid }),
    sessionId,
    onSessionEnsured,
    disabled,
    requireAuth,
    onRequireAuth,
    acceptImages,
  });

  // 暴露给 hero: 点示例提问 → 填入输入框并聚焦(转发统一 Composer 的句柄)。
  useImperativeHandle(ref, () => ({ prefill: (text: string) => composerRef.current?.prefill(text) }), []);

  const handleSend = (text: string) => {
    if (!text && att.attachments.length === 0 && references.length === 0) return;
    trackEvent('claw_query', { len: text.length, files: att.attachments.length, refs: references.length });
    onSubmit(text, att.attachments, references);
    // 提交后释放 compose 预览的 object URL —— 已发送气泡的缩略图改用后端代理 URL
    // (ClawPage 用 clawSessionFileUrl 拼, 与历史回放一致), 不留 blob 泄漏。
    att.clearAttachments();
    setReferences([]);
  };

  // 「引用文献」确认 —— 调后端把选中的论文/文件夹物化进会话 cwd,拿回 chip 元数据。
  // 同上传:后端可能新建会话(新对话首次引用),需 adopt;去重避免同一项重复加 chip。
  const handleReferenceConfirm = async (sel: ReferenceSelection) => {
    if (requireAuth) {
      onRequireAuth?.();
      return;
    }
    try {
      const res = await reference.mutateAsync({
        sessionId: sessionId ?? null,
        paperIds: sel.paperIds,
        folderIds: sel.folderIds,
      });
      if (res.sessionId && res.sessionId !== sessionId) onSessionEnsured?.(res.sessionId);
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

  const refToTurn = (r: ReferenceItemDTO): TurnReference => ({
    kind: r.kind,
    title: r.title,
    paperCount: r.paperCount,
    hasPdf: r.hasPdf,
  });

  return (
    <>
      <Composer
        ref={composerRef}
        onSend={handleSend}
        placeholder={
          requireAuth
            ? '登录后即可开始对话 · 在此输入会弹出登录注册'
            : disabled
              ? disabledPlaceholder ?? '正在等待 AI 回答…'
              : placeholder ??
                // 非视觉模型不宣传「图片」,避免用户传了图才知道看不见(审计 vision-ux-4)。
                (acceptImages === false
                  ? '问问智能助手 · Enter 发送 / Shift+Enter 换行 · 可直接粘贴/拖入文件'
                  : '问问智能助手 · Enter 发送 / Shift+Enter 换行 · 可直接粘贴/拖入图片文件')
        }
        disabled={disabled}
        sendReady={!att.uploading}
        canSendEmpty={(enableAttachments && att.attachments.length > 0) || references.length > 0}
        busy={busy}
        stopping={stopping}
        onStop={onStop}
        requireAuth={requireAuth}
        onRequireAuth={onRequireAuth}
        context={context}
        maxHeightPx={140}
        onPaste={enableAttachments ? att.handlePaste : undefined}
        containerProps={enableAttachments ? att.dragHandlers : undefined}
        overlay={
          enableAttachments && att.dragOver ? (
            <div className="absolute inset-0 z-raised flex items-center justify-center gap-2 rounded-16 border-2 border-dashed border-brand-green bg-surface-card/90 text-14 font-medium text-brand-green">
              <Upload className="size-4" />
              {acceptImages === false ? '松开上传文件' : '松开上传图片 / 文件'}
            </div>
          ) : undefined
        }
        topSlot={
          <>
            {/* 附件预览行 — 图片缩略图 + 文件卡片 (参考 GPT / Claude) */}
            <ComposerAttachmentRow
              items={att.items}
              onRemove={att.removeItem}
              onRetry={att.retryItem}
              onEnlarge={(src, alt) => att.setLightbox({ src, alt })}
            />
            {/* 引用文献 chip 行 —— 区别于附件的特有「引用」样式 */}
            {(references.length > 0 || reference.isPending) && (
              <div className="flex flex-wrap items-center gap-1.5">
                <ReferenceChipList
                  references={references.map(refToTurn)}
                  onRemove={(i) => setReferences((prev) => prev.filter((_, idx) => idx !== i))}
                />
                {reference.isPending && (
                  <span className="inline-flex items-center gap-1 text-12 text-faint">
                    <Loader2 className="size-3 animate-spin" />
                    引用中…
                  </span>
                )}
              </div>
            )}
          </>
        }
        leftActions={
          enableAttachments ? (
            <div className="flex items-center gap-0.5">
              <ComposerPlusMenu
                disabled={disabled || att.uploading}
                accept={ATTACHMENT_ACCEPT}
                onFiles={(files) => void att.addFiles(files)}
                onPickLibrary={() => {
                  if (requireAuth) {
                    onRequireAuth?.();
                    return;
                  }
                  setPickerOpen(true);
                }}
              />
              {/* 技能入口(登录后可见):事前声明本会话将启用的能力 + 内嵌启用列表(桌面/移动通用)。 */}
              {!requireAuth && onNewConversation && (
                <ComposerSkillsButton onNewConversation={onNewConversation} />
              )}
            </div>
          ) : undefined
        }
        rightActions={modelSlot}
      />

      {/* 附件放大预览 */}
      <AttachmentLightbox
        src={att.lightbox?.src ?? null}
        alt={att.lightbox?.alt}
        onClose={() => att.setLightbox(null)}
      />

      {/* 引用文献选择器(Radix Dialog,portal 渲染) */}
      <LibraryReferencePicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onConfirm={handleReferenceConfirm}
        busy={reference.isPending}
      />
    </>
  );
});
