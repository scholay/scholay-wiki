// mirrors backend/internal/agentattach(原 internal/claw/upload.go / references.go)
// 三 agent feature(claw / smart-search / prism)共用的附件上传 + 文献集引用 hooks:
// 端点按 feature 参数化(/user/claw/upload、/user/smart-search/upload…),响应 DTO 同契约。
// 2026-07 输入框统一上提;claw 的 useUploadClawAttachment 等旧 hook 改为此处的薄封装。
import { useMutation } from '@tanstack/react-query';
import { http, toApiError } from '@/shared/lib/http';
import type { AttachmentDTO, ReferenceResultDTO } from '@/shared/types/chat';

function unwrap<T>(data: ({ data?: T } & Partial<T>) | undefined): T | undefined {
  if (!data) return undefined;
  return (data.data ?? (data as unknown as T)) || undefined;
}

/**
 * POST multipart <uploadPath>,返回 AttachmentDTO(方案 B:backend 把原始文件推进会话隔离 cwd)。
 * sessionId 为空(新对话首次上传)→ backend 新建会话并回传,调用方必须 adopt。
 * 图片本地造 object URL 作预览(后端不回 base64);提交后由调用方 revoke。
 */
export function useUploadAgentAttachment(uploadPath: string) {
  return useMutation<AttachmentDTO, Error, { file: File; sessionId?: string | null }>({
    mutationFn: async ({ file, sessionId }) => {
      const fd = new FormData();
      fd.append('file', file);
      if (sessionId) fd.append('session_id', sessionId);
      try {
        const { data } = await http.post<{ data?: AttachmentDTO } & Partial<AttachmentDTO>>(uploadPath, fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        const payload = unwrap<AttachmentDTO>(data);
        if (!payload?.type || !payload?.path) throw new Error('后端未返回附件');
        return payload.type === 'image' ? { ...payload, previewUrl: URL.createObjectURL(file) } : payload;
      } catch (err) {
        throw toApiError(err);
      }
    },
  });
}

/**
 * POST <referencePath> 引用文献集论文/文件夹 → 后端物化进会话 cwd 的 references/,返回 chip 元数据。
 * 同上传:sessionId 为空(新对话首次引用)→ 后端新建会话并回传,调用方必须 adopt。
 */
export function useReferenceAgentLibrary(referencePath: string) {
  return useMutation<
    ReferenceResultDTO,
    Error,
    { sessionId?: string | null; paperIds?: number[]; folderIds?: number[] }
  >({
    mutationFn: async ({ sessionId, paperIds, folderIds }) => {
      try {
        const { data } = await http.post<{ data?: ReferenceResultDTO } & Partial<ReferenceResultDTO>>(referencePath, {
          session_id: sessionId ?? '',
          paper_ids: paperIds ?? [],
          folder_ids: folderIds ?? [],
        });
        const payload = unwrap<ReferenceResultDTO>(data);
        if (!payload?.items) throw new Error('后端未返回引用结果');
        return payload;
      } catch (err) {
        throw toApiError(err);
      }
    },
  });
}
