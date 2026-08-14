import { useRef, useState, type ClipboardEvent, type DragEvent } from 'react';
import { toast } from 'sonner';
import { useDeleteAgentAttachment } from '@/shared/api/agent-attach';
import type { AttachmentDTO } from '@/shared/types/chat';

/**
 * useComposerAttachments —— 对话输入框的附件交互状态机(三 agent feature 共用)。
 * 2026-07 输入框统一:从 claw ChatComposer 抽出;P3 打磨升级为 per-item 状态
 * (选中即出缩略图 → 上传中 spinner → 失败红边可重试/移除),不再只有整体「上传中…」。
 *
 * 对外两面:
 *   - items:渲染面(ComposerAttachmentRow 逐 chip 画状态);
 *   - attachments:发送面(仅上传成功项的 DTO,契约与旧版一致,发送打包零改动)。
 *
 * 大小上限与 backend internal/agentattach 保持一致:
 *   - 图片 5MB(Anthropic vision 单图上限口径;P2 图片通道沿用)
 *   - 其它文件 30MB(扫描版大 PDF 留余量,真正瓶颈是模型 context)
 */
export const IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const FILE_MAX_BYTES = 30 * 1024 * 1024;
/** 单条消息附件数上限(业界惯例量级;防一次拖入整个目录把会话 cwd 灌爆;后端 ws 折叠同口径截断)。 */
export const MAX_ATTACHMENTS = 10;

// ── 类型白名单(镜像 backend/internal/agentattach/upload.go 的分类谓词,两侧同步改)──
// 2026-07 文件上传调研:旧版 accept 与后端漂移(image/* 放 SVG 后端必拒;后端收的 .rs/.log 等
// 选择器里选不了;legacy doc/xls/ppt 收了 agent 读不了)。现按「收=能读」重写:
//   图片(vision 白名单,无 svg/bmp)/ PDF / Office(docx/xlsx/pptx/odt/rtf)/ 纯文本系。
const IMAGE_EXTS = ['.png', '.jpg', '.jpeg', '.webp', '.gif'];
const DOC_EXTS = ['.pdf', '.docx', '.xlsx', '.pptx', '.odt', '.rtf'];
const TEXT_EXTS = [
  '.md', '.markdown', '.txt', '.log', '.json', '.jsonl', '.xml', '.yaml', '.yml',
  '.csv', '.tsv', '.sql', '.sh', '.py', '.js', '.ts', '.tsx', '.jsx', '.go', '.rs',
  '.c', '.cpp', '.h', '.hpp', '.java', '.rb', '.php', '.tex', '.bib',
];
/** 旧版/无解析器格式:后端拒收,前端提前给同款指引(免一次 RTT)。 */
const LEGACY_OFFICE_EXTS = ['.doc', '.xls', '.ppt', '.ods', '.odp'];

/** 上传入口统一的 accept 白名单(由上面的扩展名清单拼出,与 backend 白名单同源同步)。 */
export const ATTACHMENT_ACCEPT = [...IMAGE_EXTS, ...DOC_EXTS, ...TEXT_EXTS].join(',');

// SPSS / Stata / SAS 的专有二进制格式。单列一支是为了给出**可执行的出路**,
// 而不是落进通用文案里那句「可上传图片、PDF、Office 文档」。
const STAT_DATA_EXTS = ['.sav', '.zsav', '.por', '.dta', '.sas7bdat', '.xpt', '.rdata', '.rds'];

const extOf = (name: string): string => {
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(i).toLowerCase() : '';
};

/**
 * classifyFile —— 与后端 parseAndValidateUpload 同构的前端预分类:
 * 返回 image / file(可传)或 unsupported(带与后端一致的拒绝文案)。
 * 必要性:accept 只是文件选择器的过滤建议,拖拽/粘贴完全绕过它 —— 没有这层,
 * 类型错误要等上传 RTT 才报(chip 红边),体验差且白耗一次请求。
 */
export function classifyFile(file: File): { kind: 'image' | 'file' } | { kind: 'unsupported'; reason: string } {
  const mime = (file.type || '').toLowerCase();
  const ext = extOf(file.name || '');
  if (ext === '.svg' || mime === 'image/svg+xml') {
    return { kind: 'unsupported', reason: '暂不支持 SVG 文件(安全限制)' };
  }
  if (ext === '.bmp' || mime === 'image/bmp') {
    return { kind: 'unsupported', reason: '暂不支持 BMP 图片,请转换为 PNG / JPG 后上传' };
  }
  if (LEGACY_OFFICE_EXTS.includes(ext)) {
    return { kind: 'unsupported', reason: `暂不支持旧版 Office 格式 (${ext}),请另存为 docx / xlsx / pptx 后再上传` };
  }
  // 🔴 统计软件的专有数据格式单独一支。落进下面的通用分支时,文案会变成
  //    「可上传图片、PDF、Office 文档」—— 对「数据分析」卡片是**误导**,而且
  //    **不给 SPSS 用户任何出路**。2026-08-06 实测(AG-09):用户拖进 .sav 之后
  //    模型宣称「.sav 我这边可以直接读取,不需要转成 Excel」,把用户推进无限重传的死循环。
  //    这类用户恰恰是这张卡片最想接的人(他们手里就是 SPSS 数据),给一条能走的路比拒绝本身重要。
  if (STAT_DATA_EXTS.includes(ext)) {
    return {
      kind: 'unsupported',
      reason:
        `暂不支持 ${ext} 格式(SPSS / Stata / SAS 的专有格式)。` +
        `请在原软件里「文件 → 另存为」选 CSV 或 Excel 后再上传:` +
        `SPSS 是「文件-另存为-保存类型选 CSV(*.csv)」。` +
        `⚠️ 中文 Windows 导出的 CSV 常是 GBK 编码,我们能读;若不放心可选 xlsx。`,
    };
  }
  // 图片:vision mime 白名单或扩展名任一命中(镜像后端 isImage;mime 缺失时扩展名回落,
  // 消除 5MB/30MB 档位错配)。tiff/heic/avif 等超白名单图片与后端同款拒收(agent 嵌不进模型)。
  const VISION_MIMES = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
  if (VISION_MIMES.includes(mime) || IMAGE_EXTS.includes(ext)) return { kind: 'image' };
  if (mime.startsWith('image/')) {
    return { kind: 'unsupported', reason: `暂不支持该图片格式 (${mime}),请转换为 PNG / JPG 后上传` };
  }
  if (DOC_EXTS.includes(ext) || mime === 'application/pdf') return { kind: 'file' };
  if (
    TEXT_EXTS.includes(ext) ||
    mime.startsWith('text/') ||
    ['application/json', 'application/xml', 'application/yaml', 'application/x-yaml'].includes(mime)
  ) {
    return { kind: 'file' };
  }
  // OOXML/文档 mime 但扩展名缺失/非常规 —— 精确白名单,与后端 isOffice 同构
  // (审查修正:此前 includes('officedocument') 会放行 dotx/xltx/potx 等后端必拒的模板 mime)。
  if (
    [
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/vnd.oasis.opendocument.text',
      'application/rtf',
    ].includes(mime)
  ) {
    return { kind: 'file' };
  }
  return {
    kind: 'unsupported',
    reason: `暂不支持的文件类型 (${ext || mime || '未知'});可上传图片、PDF、Office 文档 (docx/xlsx/pptx)、Markdown / 纯文本`,
  };
}

/** 渲染面的单个附件项(per-chip 状态机:uploading → done | error)。 */
export interface ComposerAttachmentItem {
  id: string;
  status: 'uploading' | 'done' | 'error';
  /** 展示名(选中即知,无需等上传返回)。 */
  name: string;
  size: number;
  kind: 'image' | 'file';
  /** 图片本地预览(选中即建 object URL,立即出缩略图);remove/clear 时统一 revoke。 */
  previewUrl?: string;
  /** 上传成功后的后端 DTO(发送面数据源)。 */
  dto?: AttachmentDTO;
  /** 失败原因(chip 上提示;点重试再来一次)。 */
  error?: string;
  /** 原始 File(失败重试用;成功后释放引用)。 */
  file?: File;
}

export interface UseComposerAttachmentsOptions {
  /** 上传动作(feature 注入):resolve 返回 DTO;抛错进入 error 态(chip 内重试)。 */
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
  /** 图片入口开关(P2:跟随当前会话模型 vision 能力)。默认开。 */
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
  const [items, setItems] = useState<ComposerAttachmentItem[]>([]);
  // 点 × 撤销时真删后端附件(见 removeItem 的注释:不删 = 用户以为撤销了却永久占额度)。
  const deleteAttachment = useDeleteAgentAttachment();
  const [lightbox, setLightbox] = useState<{ src: string; alt: string } | null>(null);
  // 拖拽悬停态:计数器防子元素 dragenter/dragleave 抖动(拖过子节点会触发 leave)。
  const [dragOver, setDragOver] = useState(false);
  const dragDepth = useRef(0);
  // 多文件并发/连拖两批时,后端「首个文件创建会话」须被后续复用 —— sessionId prop 在
  // 异步循环里不刷新,用 ref 串起当前目标会话(adopt 后立即可见)。
  // prop **变化**时(含变回 null = 用户切到「新对话」)同步重置(审查修正:旧实现对
  // null 变化不重置,新对话里上传会落进上一个会话的 cwd);adopt 期间 prop 未变则保留 ref。
  const targetSessionRef = useRef<string | null>(sessionId ?? null);
  const prevSessionProp = useRef<string | null>(sessionId ?? null);
  if (prevSessionProp.current !== (sessionId ?? null)) {
    prevSessionProp.current = sessionId ?? null;
    targetSessionRef.current = sessionId ?? null;
  }

  const patchItem = (id: string, patch: Partial<ComposerAttachmentItem>) =>
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));

  const runUpload = async (id: string, file: File) => {
    patchItem(id, { status: 'uploading', error: undefined });
    try {
      const dto = await upload(file, targetSessionRef.current);
      if (dto.sessionId && dto.sessionId !== targetSessionRef.current) {
        targetSessionRef.current = dto.sessionId;
        onSessionEnsured?.(dto.sessionId);
      }
      // previewUrl 归本 hook 管(选中即建);DTO 侧仅补齐,避免双 object URL 泄漏。
      setItems((prev) =>
        prev.map((it) =>
          it.id === id ? { ...it, status: 'done', dto: { ...dto, previewUrl: it.previewUrl }, file: undefined } : it,
        ),
      );
    } catch (err) {
      patchItem(id, { status: 'error', error: (err as Error).message || '上传失败' });
    }
  };

  // 统一的文件入口 —— 文件选择器 / 拖拽 / 粘贴 三条路都汇到这里。
  const addFiles = async (files: File[]) => {
    if (requireAuth) {
      onRequireAuth?.();
      return;
    }
    if (disabled || files.length === 0) return;
    let accepted: Array<{ file: File; kind: 'image' | 'file' }> = [];
    for (const file of files) {
      // 类型预校验(与后端白名单同构):拖拽/粘贴绕过 accept,这里即时拦下并给后端同款文案。
      const cls = classifyFile(file);
      if (cls.kind === 'unsupported') {
        toast.error(cls.reason);
        continue;
      }
      const isImage = cls.kind === 'image';
      if (isImage && !acceptImages) {
        toast.error('当前模型不支持识图,请切换支持视觉的模型后再传图片');
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
      accepted.push({ file, kind: cls.kind });
    }
    // 单条消息附件数上限:含已在列的;超出截断并提示(静默截断会让用户以为都传上了)。
    const room = MAX_ATTACHMENTS - itemsRef.current.length;
    if (accepted.length > room) {
      toast.error(`一条消息最多 ${MAX_ATTACHMENTS} 个附件,已忽略多出的 ${accepted.length - room} 个`);
      accepted = accepted.slice(0, Math.max(0, room));
    }
    const newItems: ComposerAttachmentItem[] = accepted.map(({ file, kind }) => ({
      id: crypto.randomUUID(),
      status: 'uploading',
      name: file.name,
      size: file.size,
      kind,
      previewUrl: kind === 'image' ? URL.createObjectURL(file) : undefined,
      file,
    }));
    if (newItems.length === 0) return;
    setItems((prev) => [...prev, ...newItems]);
    // 串行上传(与旧行为一致):首个文件可能新建会话,串行保证后续复用同一 cwd。
    for (const it of newItems) await runUpload(it.id, it.file!);
  };

  // items 的最新值(addFiles 是 async,闭包里的 items 会过期)。
  const itemsRef = useRef(items);
  itemsRef.current = items;

  /** 失败重试(chip 上的动作)。 */
  const retryItem = (id: string) => {
    const it = itemsRef.current.find((x) => x.id === id);
    if (!it || it.status !== 'error' || !it.file) return;
    void runUpload(id, it.file);
  };

  /**
   * 移除一个待发送附件(chip 右上角的 ×)。
   *
   * 🔴 **必须真的发 DELETE**。此前这里只 filter 掉本地 state:用户点 × 以为撤销了,
   * 而文件早已上传成功、并且**已经永久计入他的 2GB per-user 附件额度**。
   * 一个「取消」动作留下不可见的永久占用,是最糟的那类静默不一致。
   *
   * scope 为什么是 permanent(而不是 session):
   *   这条路径是**发送前撤销** —— 用户从没打算留下这个文件,他的心智是「我传错了 / 我不要它了」。
   *   session 只删会话 cwd 的工作副本、字节仍留在 MinIO 继续占额度,那正是要修的病。
   *   历史消息里的附件删除是另一回事(那份 chip 在 journal 里是永久的,删除走「我的附件」
   *   弹窗,同样是 permanent,但用户是在明确知道「历史里点不开了」的前提下操作的)。
   *
   * 失败处理:**UI 照常移除**。用户表达的是「别把它带进这条消息」,这一点本地就能兑现;
   * 删不掉只影响存储占用,用 toast 如实告知并指向「我的附件」,不把一个网络错误变成
   * 「× 点了没反应」。
   */
  const removeItem = (id: string) => {
    const target = itemsRef.current.find((it) => it.id === id);
    setItems((prev) => {
      const t = prev.find((it) => it.id === id);
      if (t?.previewUrl) URL.revokeObjectURL(t.previewUrl);
      return prev.filter((it) => it.id !== id);
    });
    const uuid = target?.dto?.uuid;
    // 没有 uuid = 无从指认要删哪一个,只能跳过。两种情况:
    //   ① 还在上传中 / 上传失败 —— 后端根本没有行(chip 一直是 uploading/error 态);
    //   ② 老后端(0112 之前)不返回该字段。
    // ⚠️ 注意 uuid **不能**用来判断「后端是否启用了耐久化」:降级路径(未配 MinIO)
    // 同样会返回 uuid,只是没有行。那时这次 DELETE 会拿到 404 —— mutation 按幂等成功处理,
    // 不打扰用户(见 useDeleteAgentAttachment)。
    if (!uuid) return;
    deleteAttachment.mutate(
      { uuid, scope: 'permanent' },
      {
        onError: (err) => {
          toast.error(
            `${(err as Error).message || '删除失败'} —— 该文件仍占用你的附件空间,可在输入框「+」→「我的附件」里删除`,
          );
        },
      },
    );
  };

  /** 发送成功后调用:释放预览 object URL 并清空(已发送气泡的缩略图应改用后端代理 URL)。 */
  const clearAttachments = () => {
    setItems((prev) => {
      prev.forEach((it) => it.previewUrl && URL.revokeObjectURL(it.previewUrl));
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
    /** 渲染面:逐 chip 状态(uploading/done/error)。 */
    items,
    /** 发送面:仅上传成功项的 DTO(契约与旧版一致)。 */
    attachments: items.filter((it) => it.status === 'done' && it.dto).map((it) => it.dto!),
    /** 有在途上传(发送闸置灰用)。 */
    uploading: items.some((it) => it.status === 'uploading'),
    addFiles,
    retryItem,
    removeItem,
    clearAttachments,
    lightbox,
    setLightbox,
    dragOver,
    dragHandlers: { onDragEnter, onDragOver, onDragLeave, onDrop },
    handlePaste,
  };
}
