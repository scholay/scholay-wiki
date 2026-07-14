import { useRef, useState, type ClipboardEvent, type DragEvent } from 'react';
import { toast } from 'sonner';
import type { AttachmentDTO } from '@/shared/types/chat';

/**
 * useComposerAttachments —— 对话输入框的附件交互状态机(三 agent feature 共用)。
 * 2026-07 输入框统一:从 claw ChatComposer 抽出。只管业务无关的交互(选择/拖拽/粘贴 → 校验
 * → 上传 → chips 状态 → lightbox),上传动作由 feature 注入(shared/api/agent-attach 的
 * mutateAsync 包一层),会话 adopt 语义(claw「添加文件即开会话」)经 onSessionEnsured 回调。
 *
 * 大小上限与 backend internal/agentattach 保持一致:
 *   - 图片 5MB(历史上是 Anthropic vision 单图硬上限;vision 通道重建前该值保持不变)
 *   - 其它文件 30MB(扫描版大 PDF 留余量,真正瓶颈是模型 context)
 */
export const IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const FILE_MAX_BYTES = 30 * 1024 * 1024;

/** 上传入口统一的 accept 白名单(与 backend 类型白名单同步改)。 */
export const ATTACHMENT_ACCEPT =
  'image/*,.pdf,.docx,.doc,.xlsx,.xls,.pptx,.ppt,.odt,.ods,.rtf,.md,.markdown,.txt,.json,.csv,.tsv,.tex,.bib,.py,.js,.ts,.go';

export interface UseComposerAttachmentsOptions {
  /** 上传动作(feature 注入):resolve 返回 DTO;抛错时 hook 负责 toast。 */
  upload: (file: File, sessionId: string | null) => Promise<AttachmentDTO>;
  /** 当前会话 id(claw 多会话传当前值;单会话 feature 传 null 由后端 get-or-create)。 */
  sessionId?: string | null;
  /** 后端新建会话时回传(claw「添加文件即开会话」adopt;单会话 feature 可忽略)。 */
  onSessionEnsured?: (sessionId: string) => void;
  /** 等待回答/连接中:不接收新文件。 */
  disabled?: boolean;
  /** 未登录:任何上传动作拦下来改弹登录。 */
  requireAuth?: boolean;
  onRequireAuth?: () => void;
  /** 图片入口开关(vision 通道未建成时 feature 可关掉图片,只收文件)。默认开。 */
  acceptImages?: boolean;
}

export function useComposerAttachments({
  upload,
  sessionId,
  onSessionEnsured,
  disabled,
  requireAuth,
  onRequireAuth,
  acceptImages = true,
}: UseComposerAttachmentsOptions) {
  const [attachments, setAttachments] = useState<AttachmentDTO[]>([]);
  const [uploading, setUploading] = useState(0); // 在途上传数(>0 显示 pending 卡 + 禁发送)
  const [lightbox, setLightbox] = useState<{ src: string; alt: string } | null>(null);
  // 拖拽悬停态:计数器防子元素 dragenter/dragleave 抖动(拖过子节点会触发 leave)。
  const [dragOver, setDragOver] = useState(false);
  const dragDepth = useRef(0);

  // 统一的文件入口 —— 文件选择器 / 拖拽 / 粘贴 三条路都汇到这里。
  const addFiles = async (files: File[]) => {
    if (requireAuth) {
      onRequireAuth?.();
      return;
    }
    if (disabled || files.length === 0) return;
    // 多文件一次性拖入时 prop sessionId 不会在循环内更新;本地变量串起来,
    // 保证第一份文件创建的会话被后续文件复用(都落同一个 cwd)。
    let targetSession = sessionId ?? null;
    for (const file of files) {
      const isImage = file.type.startsWith('image/');
      if (isImage && !acceptImages) {
        toast.error('当前对话暂不支持上传图片');
        continue;
      }
      const limit = isImage ? IMAGE_MAX_BYTES : FILE_MAX_BYTES;
      if (file.size > limit) {
        toast.error(
          isImage
            ? `图片不能超过 ${IMAGE_MAX_BYTES / 1024 / 1024}MB`
            : `文件不能超过 ${FILE_MAX_BYTES / 1024 / 1024}MB`,
        );
        continue;
      }
      setUploading((n) => n + 1);
      try {
        const att = await upload(file, targetSession);
        if (att.sessionId && att.sessionId !== targetSession) {
          targetSession = att.sessionId;
          onSessionEnsured?.(att.sessionId);
        }
        setAttachments((prev) => [...prev, att]);
      } catch (err) {
        toast.error((err as Error).message || '上传失败');
      } finally {
        setUploading((n) => n - 1);
      }
    }
  };

  const removeAttachment = (index: number) => {
    setAttachments((prev) => {
      const target = prev[index];
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((_, i) => i !== index);
    });
  };

  /** 发送成功后调用:释放预览 object URL 并清空(已发送气泡的缩略图应改用后端代理 URL)。 */
  const clearAttachments = () => {
    setAttachments((prev) => {
      prev.forEach((a) => a.previewUrl && URL.revokeObjectURL(a.previewUrl));
      return [];
    });
  };

  // ─── 拖拽上传 ───────────────────────────────────────────────────────────
  const onDragEnter = (e: DragEvent) => {
    if (disabled || !e.dataTransfer?.types.includes('Files')) return;
    e.preventDefault();
    dragDepth.current += 1;
    setDragOver(true);
  };
  const onDragOver = (e: DragEvent) => {
    if (disabled || !e.dataTransfer?.types.includes('Files')) return;
    e.preventDefault(); // 必须 preventDefault 才能触发 drop
  };
  const onDragLeave = (e: DragEvent) => {
    e.preventDefault();
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragOver(false);
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    dragDepth.current = 0;
    setDragOver(false);
    const files = Array.from(e.dataTransfer?.files ?? []);
    if (files.length > 0) void addFiles(files);
  };

  // ─── 粘贴上传 ───────────────────────────────────────────────────────────
  // 截图(剪贴板里的 image)或复制的文件 → 直接进附件;剪贴板纯文本不拦截(正常粘贴进 textarea)。
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
      e.preventDefault(); // 有文件 → 拦截默认(否则有的浏览器会把图片也插入文本)
      void addFiles(files);
    }
  };

  return {
    attachments,
    uploading: uploading > 0,
    addFiles,
    removeAttachment,
    clearAttachments,
    lightbox,
    setLightbox,
    dragOver,
    dragHandlers: { onDragEnter, onDragOver, onDragLeave, onDrop },
    handlePaste,
  };
}
