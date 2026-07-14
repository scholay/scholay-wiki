import {
  forwardRef,
  useImperativeHandle,
  useRef,
  useState,
  type ClipboardEvent,
  type DragEvent,
  type ReactNode,
} from 'react';
import { FileText, Library, Loader2, Paperclip, Upload, X } from 'lucide-react';
import { toast } from 'sonner';
import { trackEvent } from '@/shared/lib/track';
import { AttachmentLightbox } from '@/shared/components/chat/AttachmentLightbox';
import { Composer, ReferenceChipList, type ComposerHandle } from '@/shared/components/chat';
import type { TurnReference } from '@/shared/types/chat';
import { useUploadClawAttachment, useReferenceClawLibrary } from '../../api/session';
import type { AttachmentDTO, ReferenceItemDTO } from '../../api/types';
import { LibraryReferencePicker, type ReferenceSelection } from './LibraryReferencePicker';

/**
 * 输入框 + 附件管理。
 *
 * 状态:
 *   - input: 文本框内容 (本地, 提交后清空)
 *   - attachments: 已上传完毕、待发送的附件列表; 提交时一并打包发给 agent
 *
 * 上传时机: 用户选了文件 → 立即 POST /claw/upload → 拿到 DTO 放进 attachments 数组,
 * 上方出现 chip; 不是在 send 时才上传, 否则会有点击 send 后等几秒的体感。
 *
 * Enter 发送 / Shift+Enter 换行 / Ctrl+Enter 也发送 (习惯党)。
 */
// 上传大小上限 — 跟 backend internal/claw/upload.go 的 MaxImageBytes / MaxFileBytes 保持一致。
// 图片 5MB = Anthropic vision API 硬上限; 其它文件 30MB (扫描版大 PDF 留余量)。
const IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const FILE_MAX_BYTES = 30 * 1024 * 1024;

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
  /** 会话模型选择器(P2 模型目录化):ClawPage 组装 shared ModelSelector 后经此插槽注入
   *  leftActions 最左(Cursor 同位)。不传 = 不渲染(目录未配置时优雅缺席)。 */
  modelSlot?: ReactNode;
}

/** 命令式句柄 —— 新对话 hero 点「示例提问」chip 时, 把文案填进输入框并聚焦(不直接发送, 允许用户编辑)。 */
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
}, ref) {
  const [attachments, setAttachments] = useState<AttachmentDTO[]>([]);
  // 「引用文献」选中的论文/文件夹(后端已物化进会话 cwd,这里持 chip 元数据)。
  const [references, setReferences] = useState<ReferenceItemDTO[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const reference = useReferenceClawLibrary();
  // 点击附件缩略图放大查看的 lightbox。
  const [lightbox, setLightbox] = useState<{ src: string; alt: string } | null>(null);
  // 拖拽悬停态: 拖文件到输入框上方时显示 "松开上传" 蒙层。用 ref 计数避免子元素
  // dragenter/dragleave 抖动 (拖过子节点会触发 leave, 计数器归零才算真正离开)。
  const [dragOver, setDragOver] = useState(false);
  const dragDepth = useRef(0);
  const upload = useUploadClawAttachment();
  const fileRef = useRef<HTMLInputElement>(null);
  const composerRef = useRef<ComposerHandle>(null);

  // 暴露给 hero: 点示例提问 → 填入输入框并聚焦(转发统一 Composer 的句柄)。
  useImperativeHandle(ref, () => ({ prefill: (text: string) => composerRef.current?.prefill(text) }), []);

  // 统一 Composer 的 onSend(requireAuth 分支由 core 处理成 onRequireAuth,这里只管真发送)。
  const handleSend = (text: string) => {
    if (!text && attachments.length === 0 && references.length === 0) return;
    trackEvent('claw_query', { len: text.length, files: attachments.length, refs: references.length });
    onSubmit(text, attachments, references);
    // 提交后释放 compose 预览的 object URL —— 已发送气泡的缩略图改用后端代理 URL
    // (ClawPage 用 clawSessionFileUrl 拼, 与历史回放一致), 不留 blob 泄漏。
    attachments.forEach((a) => a.previewUrl && URL.revokeObjectURL(a.previewUrl));
    setAttachments([]);
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

  // 统一的文件入口 — 文件选择器 / 拖拽 / 粘贴 三条路都汇到这里。
  const addFiles = async (files: File[]) => {
    // 未登录:上传也要登录, 拦下来弹登录 (避免 401)。
    if (requireAuth) {
      onRequireAuth?.();
      return;
    }
    if (disabled) return; // 等待回答 / 连接中时不接收文件
    // 多文件一次性拖入时, prop sessionId 不会在循环内更新; 用本地变量串起来,
    // 保证第一份文件创建的会话被后续文件复用 (都落同一个 cwd)。
    let targetSession = sessionId ?? null;
    for (const file of files) {
      // 上传前按真实下游约束校验 (跟 backend internal/claw/upload.go 同值):
      //   - 图片 5MB: Anthropic vision API 单图硬上限, 超了模型拒收
      //   - 其它文件 30MB: 扫描版大 PDF 留余量, 真正瓶颈是模型 context
      // 提示在"上传时"出现 (而不是常驻输入框), 符合"用到才提示"。
      const isImage = file.type.startsWith('image/');
      const limit = isImage ? IMAGE_MAX_BYTES : FILE_MAX_BYTES;
      if (file.size > limit) {
        toast.error(
          isImage
            ? `图片不能超过 ${IMAGE_MAX_BYTES / 1024 / 1024}MB (再大模型无法识别)`
            : `文件不能超过 ${FILE_MAX_BYTES / 1024 / 1024}MB`,
        );
        continue;
      }
      try {
        const att = await upload.mutateAsync({ file, sessionId: targetSession });
        // 后端可能新建了会话 (新对话首次上传); adopt 并复用给本批后续文件。
        if (att.sessionId && att.sessionId !== targetSession) {
          targetSession = att.sessionId;
          onSessionEnsured?.(att.sessionId);
        }
        setAttachments((prev) => [...prev, att]);
      } catch (err) {
        toast.error((err as Error).message || '上传失败');
      }
    }
  };

  // ─── 拖拽上传 ───────────────────────────────────────────────────────────
  const handleDragEnter = (e: DragEvent) => {
    if (disabled || !e.dataTransfer?.types.includes('Files')) return;
    e.preventDefault();
    dragDepth.current += 1;
    setDragOver(true);
  };
  const handleDragOver = (e: DragEvent) => {
    if (disabled || !e.dataTransfer?.types.includes('Files')) return;
    e.preventDefault(); // 必须 preventDefault 才能触发 drop
  };
  const handleDragLeave = (e: DragEvent) => {
    e.preventDefault();
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragOver(false);
  };
  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    dragDepth.current = 0;
    setDragOver(false);
    const files = Array.from(e.dataTransfer?.files ?? []);
    if (files.length > 0) void addFiles(files);
  };

  // ─── 粘贴上传 ───────────────────────────────────────────────────────────
  // 截图 (剪贴板里的 image) 或复制的文件 → 直接进附件; 同时如果剪贴板里有纯文本,
  // 不拦截 (让浏览器正常粘贴文字进 textarea)。
  const handlePaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    if (disabled) return;
    const files: File[] = [];
    for (const item of Array.from(e.clipboardData.items)) {
      if (item.kind === 'file') {
        const f = item.getAsFile();
        if (f) files.push(f);
      }
    }
    if (files.length > 0) {
      e.preventDefault(); // 有文件 → 拦截默认 (否则有的浏览器会把图片也插入文本)
      void addFiles(files);
    }
  };

  return (
    <>
      <Composer
        ref={composerRef}
        onSend={handleSend}
        placeholder={
          requireAuth
            ? '登录后即可开始对话 · 在此输入会弹出登录注册'
            : disabled
              ? '正在等待 AI 回答…'
              : '问问智能助手 · Enter 发送 / Shift+Enter 换行 · 可直接粘贴/拖入图片文件'
        }
        disabled={disabled}
        sendReady={!upload.isPending}
        canSendEmpty={attachments.length > 0 || references.length > 0}
        busy={busy}
        stopping={stopping}
        onStop={onStop}
        requireAuth={requireAuth}
        onRequireAuth={onRequireAuth}
        context={context}
        maxHeightPx={140}
        onPaste={handlePaste}
        containerProps={{
          onDragEnter: handleDragEnter,
          onDragOver: handleDragOver,
          onDragLeave: handleDragLeave,
          onDrop: handleDrop,
        }}
        overlay={
          dragOver ? (
            <div className="absolute inset-0 z-10 flex items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-brand-green bg-background/90 text-sm font-medium text-brand-green">
              <Upload className="size-4" />
              松开上传图片 / 文件
            </div>
          ) : undefined
        }
        topSlot={
          <>
            {/* 附件预览行 — 图片缩略图 + 文件卡片 (参考 GPT / Claude) */}
            {(attachments.length > 0 || upload.isPending) && (
              <div className="flex flex-wrap gap-2">
                {attachments.map((a, i) => (
                  <AttachmentPreview
                    key={i}
                    attachment={a}
                    onRemove={() => {
                      if (a.previewUrl) URL.revokeObjectURL(a.previewUrl);
                      setAttachments((prev) => prev.filter((_, idx) => idx !== i));
                    }}
                    onEnlarge={
                      a.type === 'image' && a.previewUrl
                        ? () => setLightbox({ src: a.previewUrl!, alt: a.name })
                        : undefined
                    }
                  />
                ))}
                {upload.isPending && (
                  <div className="inline-flex h-14 items-center gap-1.5 rounded-md border border-dashed border-border bg-surface-1 px-3 text-xs text-faint">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    上传中…
                  </div>
                )}
              </div>
            )}
            {/* 引用文献 chip 行 —— 区别于附件的特有「引用」样式 */}
            {(references.length > 0 || reference.isPending) && (
              <div className="flex flex-wrap items-center gap-1.5">
                <ReferenceChipList
                  references={references.map(refToTurn)}
                  onRemove={(i) => setReferences((prev) => prev.filter((_, idx) => idx !== i))}
                />
                {reference.isPending && (
                  <span className="inline-flex items-center gap-1 text-2xs text-faint">
                    <Loader2 className="size-3 animate-spin" />
                    引用中…
                  </span>
                )}
              </div>
            )}
          </>
        }
        leftActions={
          <>
            {modelSlot}
            <input
              ref={fileRef}
              type="file"
              hidden
              multiple
              accept="image/*,.pdf,.docx,.doc,.xlsx,.xls,.pptx,.ppt,.odt,.ods,.rtf,.md,.markdown,.txt,.json,.csv,.tsv,.tex,.bib,.py,.js,.ts,.go"
              onChange={(e) => {
                void addFiles(Array.from(e.target.files ?? []));
                e.target.value = ''; // 允许重复选同一个文件
              }}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={disabled || upload.isPending}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground disabled:opacity-40"
              title="上传图片 / PDF / 文本文件"
            >
              <Paperclip className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => {
                if (requireAuth) {
                  onRequireAuth?.();
                  return;
                }
                setPickerOpen(true);
              }}
              disabled={disabled}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground disabled:opacity-40"
              title="引用文献集里的文献"
            >
              <Library className="h-4 w-4" />
            </button>
          </>
        }
      />

      {/* 附件放大预览 */}
      <AttachmentLightbox
        src={lightbox?.src ?? null}
        alt={lightbox?.alt}
        onClose={() => setLightbox(null)}
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

/**
 * 已上传附件预览 — 参考 GPT / Claude 的输入框附件样式:
 *   - 图片: 56×56 缩略图 (用 base64 data 直接渲染), 右上角 hover 出现移除 X
 *   - 文件: 横向卡片 = 红色文件图标块 + 文件名 + 副信息 (类型 / 字数 / 截断提示), 右上角移除 X
 * 移除按钮常驻小圆, hover 加深, 不依赖 group-hover 才出现 (移动端没 hover)。
 */
function AttachmentPreview({
  attachment,
  onRemove,
  onEnlarge,
}: {
  attachment: AttachmentDTO;
  onRemove: () => void;
  /** 图片缩略图点击放大 (仅图片附件传); 文件卡片不传。 */
  onEnlarge?: () => void;
}) {
  const removeBtn = (
    <button
      type="button"
      onClick={onRemove}
      title="移除"
      className="absolute -right-1.5 -top-1.5 z-10 inline-flex size-4 items-center justify-center rounded-full bg-foreground text-background shadow-sm transition-transform hover:scale-110"
    >
      <X className="size-2.5" strokeWidth={2.6} />
    </button>
  );

  if (attachment.type === 'image' && attachment.previewUrl) {
    return (
      <div className="relative size-14 shrink-0">
        {removeBtn}
        <button
          type="button"
          onClick={onEnlarge}
          title="点击放大"
          className="size-14 overflow-hidden rounded-md border border-border focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        >
          <img
            src={attachment.previewUrl}
            alt={attachment.name}
            className="size-14 object-cover"
          />
        </button>
      </div>
    );
  }

  // 文件卡片
  return (
    <div className="relative flex h-14 w-48 shrink-0 items-center gap-2 rounded-md border border-border bg-surface-1 px-2.5">
      {removeBtn}
      <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-danger-soft">
        <FileText className="size-4 text-brand-red" />
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-xs font-medium text-foreground" title={attachment.name}>
          {attachment.name}
        </span>
        <span className="truncate text-2xs text-faint">
          {fileExt(attachment.name)} · {formatSize(attachment.size)}
        </span>
      </span>
    </div>
  );
}

function fileExt(name: string): string {
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(i + 1).toUpperCase() : '文件';
}

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${bytes}B`;
}

