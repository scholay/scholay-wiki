import {
  useRef,
  useState,
  type ClipboardEvent,
  type DragEvent,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import { ArrowUp, FileText, Loader2, Paperclip, Square, Upload, X } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/shared/lib/utils';
import { trackEvent } from '@/shared/lib/track';
import { AttachmentLightbox } from '@/shared/components/chat/AttachmentLightbox';
import { ContextMeter } from '@/shared/components/chat';
import { useUploadClawAttachment } from '../../api/session';
import type { AttachmentDTO } from '../../api/types';

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
  onSubmit: (text: string, attachments: AttachmentDTO[]) => void;
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
}

export function ChatComposer({
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
}: ChatComposerProps) {
  const [input, setInput] = useState('');
  const [attachments, setAttachments] = useState<AttachmentDTO[]>([]);
  // 点击附件缩略图放大查看的 lightbox。
  const [lightbox, setLightbox] = useState<{ src: string; alt: string } | null>(null);
  // 拖拽悬停态: 拖文件到输入框上方时显示 "松开上传" 蒙层。用 ref 计数避免子元素
  // dragenter/dragleave 抖动 (拖过子节点会触发 leave, 计数器归零才算真正离开)。
  const [dragOver, setDragOver] = useState(false);
  const dragDepth = useRef(0);
  const upload = useUploadClawAttachment();
  const fileRef = useRef<HTMLInputElement>(null);

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    if (busy) return; // busy 时表单提交走 stop 按钮路径, 这里不走 submit
    // 未登录:不发送, 直接弹登录注册 (符合"输入内容就跳出登录")。
    if (requireAuth) {
      onRequireAuth?.();
      return;
    }
    const text = input.trim();
    if (!text && attachments.length === 0) return;
    if (disabled || upload.isPending) return;
    trackEvent('claw_query', { len: text.length, files: attachments.length });
    onSubmit(text, attachments);
    setInput('');
    // 提交后释放 compose 预览的 object URL —— 已发送气泡的缩略图改用后端代理 URL
    // (ClawPage 用 clawSessionFileUrl 拼, 与历史回放一致), 不留 blob 泄漏。
    attachments.forEach((a) => a.previewUrl && URL.revokeObjectURL(a.previewUrl));
    setAttachments([]);
  };

  const handleKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };

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
    <form
      onSubmit={submit}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className="relative flex flex-col gap-2 rounded-lg border border-border-strong bg-background p-2.5 shadow-sm focus-within:border-foreground"
    >
      {/* 拖拽蒙层 — 拖文件悬停在输入框上时显示 */}
      {dragOver && (
        <div className="absolute inset-0 z-10 flex items-center justify-center gap-2 rounded-lg border-2 border-dashed border-brand-green bg-background/90 text-sm font-medium text-brand-green">
          <Upload className="size-4" />
          松开上传图片 / 文件
        </div>
      )}

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

      {/* 文本框 */}
      <textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKey}
        onPaste={handlePaste}
        placeholder={
          requireAuth
            ? '登录后即可开始对话 · 在此输入会弹出登录注册'
            : disabled
              ? '正在等待 AI 回答…'
              : '问问智能助手 · Enter 发送 / Shift+Enter 换行 · 可直接粘贴/拖入图片文件'
        }
        rows={2}
        disabled={disabled}
        className="min-h-[44px] w-full resize-none border-0 bg-transparent px-1 py-1 text-base text-foreground placeholder:text-faint focus:outline-none focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60"
      />

      {/* 底部工具栏 */}
      <div className="flex items-center gap-1">
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

        {/* 占位撑开, 让上下文水位 + 发送按钮靠右。不再常驻文件大小提示 ——
            大小限制只在用户真的上传超限文件时 toast (见 handleFiles)。 */}
        <span className="flex-1" />

        {/* 上下文水位 — footer 右侧, 紧贴发送按钮 (Claude / Cursor 同位)。
            没有数据 (新会话还没问过话) 不显示, 避免空 0%。 */}
        {context && context.totalTokens > 0 && (
          <ContextMeter
            totalTokens={context.totalTokens}
            maxTokens={context.maxTokens}
            percentage={context.percentage}
            model={context.model}
          />
        )}

        {/* 发送/停止 切换 — busy 时按钮换成方块停止图标, 直调 onStop 走 stop_generation 协议。
            type=button 必要 — 留在 type=submit 会先触发 form onSubmit,
            而 submit handler 看到 busy=true 又会直接 return 把停止动作吞掉。
            stopping 中 spinner+disabled, 避免重复发 stop_generation。 */}
        {busy ? (
          <button
            type="button"
            onClick={onStop}
            disabled={stopping || !onStop}
            aria-label={stopping ? '正在停止' : '停止生成'}
            title={stopping ? '正在停止…' : '停止当前回答'}
            className={cn(
              'inline-flex h-9 w-9 items-center justify-center rounded-md text-background transition-colors',
              stopping
                ? 'bg-foreground/60 cursor-wait'
                : 'bg-foreground hover:bg-foreground/85',
            )}
          >
            {stopping ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Square className="h-3 w-3 fill-current" strokeWidth={0} aria-hidden="true" />
            )}
          </button>
        ) : (
          <button
            type="submit"
            disabled={
              // 未登录:只按"有没有输入"决定能否点 (无视 WS/disabled 态, 那是登录后才有的概念);
              // 点了会走 submit → requireAuth → onRequireAuth 弹登录。
              requireAuth
                ? !input.trim() && attachments.length === 0
                : disabled || upload.isPending || (!input.trim() && attachments.length === 0)
            }
            className={cn(
              'inline-flex h-9 w-9 items-center justify-center rounded-md transition-colors',
              'bg-foreground text-background hover:bg-foreground/90',
              'disabled:bg-surface-2 disabled:text-faint',
            )}
            title="发送 (Enter)"
          >
            {/* 未登录不该转圈 (没有 WS 在连接) —— 显示普通发送箭头 */}
            {disabled && !upload.isPending && !requireAuth ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ArrowUp className="h-4 w-4" strokeWidth={2.5} />
            )}
          </button>
        )}
      </div>

      {/* 附件放大预览 */}
      <AttachmentLightbox
        src={lightbox?.src ?? null}
        alt={lightbox?.alt}
        onClose={() => setLightbox(null)}
      />
    </form>
  );
}

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

