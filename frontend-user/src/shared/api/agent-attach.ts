// mirrors backend/internal/agentattach(原 internal/claw/upload.go / references.go)
// 三 agent feature(claw / smart-search / prism)共用的附件上传 + 「引用文献」hooks:
// 端点按 feature 参数化(/user/claw/upload、/user/smart-search/upload…),响应 DTO 同契约。
// 2026-07 输入框统一上提;claw 的 useUploadClawAttachment 等旧 hook 改为此处的薄封装。
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { http, toApiError } from '@/shared/lib/http';
import type { AttachmentDTO, ReferenceResultDTO } from '@/shared/types/chat';

function unwrap<T>(data: ({ data?: T } & Partial<T>) | undefined): T | undefined {
  if (!data) return undefined;
  return (data.data ?? (data as unknown as T)) || undefined;
}

/**
 * POST multipart <uploadPath>,返回 AttachmentDTO(方案 B:backend 把原始文件推进会话隔离 cwd)。
 * sessionId 为空(新对话首次上传)→ backend 新建会话并回传,调用方必须 adopt。
 * 注:图片预览 object URL 的创建/回收归 useComposerAttachments(选中即建,P3);
 * 这里不再自建,避免双 URL 泄漏。
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
        return payload;
      } catch (err) {
        throw toApiError(err);
      }
    },
  });
}

/**
 * POST <referencePath> 引用收藏的论文 / 整个文件夹 → 后端物化进会话 cwd 的 references/,返回 chip 元数据。
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

// ─── 附件删除 / 「我的附件」列表(0112 耐久化的后半段)────────────────────────
//
// 🔴 这两个 hook 是**用户唯一的自救手段**。在它们存在之前:
//   · 输入框里点 × 只改 UI 不发请求 —— 用户以为撤销了,文件其实已经上传、
//     并且**已经永久计入他的 2GB 附件额度**;
//   · 撞到 2GB 之后没有任何删除入口,账号级永久卡死(「新开一个对话」只解会话 cwd 的
//     1GB 帽,对 per-user 帽毫无作用)。
// 后端的 DELETE / GET 路由早就注册了,缺的一直是调用点 —— 「引擎造好没接线」是本仓库
// 反复出现的形状,这里补的就是那根线。

/** 附件删除的作用域。 */
export type AttachmentDeleteScope = 'session' | 'permanent';

/** 「我的附件」一项 —— 一项 = 一份内容(后端按 content_sha256 聚合)。
 *  mirrors backend/internal/agentattach/serve.go AttachmentGroupDTO */
export interface AttachmentGroup {
  /** 该内容对应的全部附件 uuid(跨会话复用 / 重复上传会有多个);删除要逐个调。 */
  uuids: string[];
  name: string;
  type: 'image' | 'file';
  mimeType: string;
  /** 字节数。**各项之和 = usedBytes**(后端按内容去重),所以「删掉它能腾出多少」是真的。 */
  size: number;
  /** 被多少个会话引用。 */
  sessions: number;
  createdAt: string;
}

export interface AttachmentListResult {
  usedBytes: number;
  /** 上限由后端下发,前端不再写第二份 2GB 常量(两份常量迟早漂移)。 */
  limitBytes: number;
  items: AttachmentGroup[];
}

export const MY_ATTACHMENTS_QUERY_KEY = ['attachments', 'mine'] as const;

/** GET /user/attachments —— 「我的附件」列表 + 已用/上限。 */
export function useMyAttachments(enabled: boolean) {
  return useQuery<AttachmentListResult>({
    queryKey: MY_ATTACHMENTS_QUERY_KEY,
    enabled,
    // 弹窗每次打开都要看到**当前**占用(用户刚删完 / 刚传完),陈旧数据在这里直接误导决策。
    staleTime: 0,
    refetchOnMount: 'always',
    queryFn: async () => {
      try {
        const { data } = await http.get<{ data?: AttachmentListResult } & Partial<AttachmentListResult>>(
          '/user/attachments',
        );
        const payload = unwrap<AttachmentListResult>(data);
        return {
          usedBytes: payload?.usedBytes ?? 0,
          limitBytes: payload?.limitBytes ?? 0,
          items: payload?.items ?? [],
        };
      } catch (err) {
        throw toApiError(err);
      }
    },
  });
}

/**
 * DELETE /user/attachment/:uuid?scope=…
 *
 * scope='permanent':软删元数据 + 引用归零则删 MinIO 对象 + 删所有会话 cwd 副本。
 *   腾 per-user 额度**只有这一种**能做到。
 * scope='session':只删会话 cwd 里的工作副本(字节仍在 MinIO,历史 chip 仍点得开)。
 *   用来腾会话 cwd 的 1GB 帽。
 *
 * 幂等:「查不到行」回 404、「行已软删」回 410 —— **两者都是「它已经不在了」**,
 * 对一个删除动作来说就是成功。只放过 404 会让第二次删除弹一句红色的「该文件已被删除」,
 * 而用户想要的结果恰恰已经达成(重复点 ×、两个标签页同时删、列表数据略陈旧都会走到这里)。
 * 410 的语义价值在**取回**端点上(区分「从未存在」与「你自己删了」),不在删除端点上。
 */
export function useDeleteAgentAttachment() {
  const qc = useQueryClient();
  return useMutation<{ uuid: string }, Error, { uuid: string; scope?: AttachmentDeleteScope }>({
    mutationFn: async ({ uuid, scope = 'permanent' }) => {
      try {
        await http.delete(`/user/attachment/${encodeURIComponent(uuid)}`, { params: { scope } });
        return { uuid };
      } catch (err) {
        const apiErr = toApiError(err);
        // 404 = 从来没有这一行;410 = 已被软删。删除动作看两者是同一件事:已经不在了。
        if (apiErr.status === 404 || apiErr.status === 410) return { uuid };
        throw apiErr;
      }
    },
    onSuccess: () => {
      // 占用变了,列表与配额条必须跟着变(否则用户删完看不到空间回来,会继续狂删)。
      void qc.invalidateQueries({ queryKey: MY_ATTACHMENTS_QUERY_KEY });
    },
  });
}
