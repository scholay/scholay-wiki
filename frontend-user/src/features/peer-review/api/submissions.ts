/**
 * 智能审稿 · 投稿 API hooks —— TanStack Query 封装。
 *
 * 后端路由(挂在 /user 下):
 *   GET    /user/peer-review/submissions             列出我的投稿(草稿 + 已交)
 *   POST   /user/peer-review/submissions             新建草稿,返回 id
 *   GET    /user/peer-review/submissions/:id         获取草稿全量
 *   PATCH  /user/peer-review/submissions/:id         保存 step/title/letter/target 等
 *   POST   /user/peer-review/submissions/:id/submit  Step4 投递 → 触发 agent
 *   POST   /user/peer-review/submissions/:id/assets  上传文件(multipart)
 *   DELETE /user/peer-review/submissions/:id/assets/:assetId  删文件
 *   POST   /user/peer-review/submissions/:id/journal-recommend  agent 推荐期刊
 *   POST   /user/peer-review/submissions/:id/letter-draft       agent 起草信件
 *
 * 后端用 utils.Success 把 payload 统一包成 {code, message, data},
 * 这里所有 GET/POST/PATCH 都走 [[unwrap]] 取出 data 字段。
 *
 * queryKey 约定: ['peer-review', 'submissions', ...params]
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { http } from '@/shared/lib/http';
import type {
  AttachmentCategory,
  Submission,
  SubmissionAsset,
  SubmissionListItem,
  SubmissionMode,
  WizardStep,
} from '../types';
import { unwrap } from './_unwrap';

const KEY = (...rest: (string | number)[]) =>
  ['peer-review', 'submissions', ...rest] as const;

// ─── 查询 ──────────────────────────────────────────────────────────────────

export function useSubmissionList(mode?: SubmissionMode) {
  return useQuery({
    queryKey: KEY('list', mode ?? 'all'),
    queryFn: async () => {
      const r = await http.get<{ data?: { items: SubmissionListItem[] } } & Partial<{ items: SubmissionListItem[] }>>(
        '/user/peer-review/submissions',
        { params: mode ? { mode } : undefined }
      );
      return unwrap<{ items: SubmissionListItem[] }>(r.data).items;
    },
  });
}

export function useSubmission(id?: number) {
  return useQuery({
    queryKey: KEY('detail', id ?? 0),
    enabled: !!id,
    queryFn: async () => {
      const r = await http.get<{ data?: Submission } & Partial<Submission>>(
        `/user/peer-review/submissions/${id}`
      );
      return unwrap<Submission>(r.data);
    },
    // computing_* / reviewing 状态下 2s 一次 polling, idle / failed 后停。
    // 用 query 函数级 refetchInterval, 而不是组件层 useEffect, 自动跟着 enabled / status 走。
    refetchInterval: (q) => {
      const s = q.state.data?.computeState;
      return s === 'computing_meta' || s === 'computing_letter' || s === 'reviewing'
        ? 2000
        : false;
    },
  });
}

// ─── 草稿 CRUD ────────────────────────────────────────────────────────────

export function useCreateSubmission() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (mode: SubmissionMode) => {
      const r = await http.post<{ data?: Submission } & Partial<Submission>>(
        '/user/peer-review/submissions',
        { mode }
      );
      return unwrap<Submission>(r.data);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY('list') });
    },
  });
}

/**
 * Wizard 入口用 — 只读查询用户该 mode 下"已上传过文件"的最近草稿。
 *
 * 设计原则:**草稿不在 wizard 进入时创建,只在用户传第一个文件时 lazy 创建**。
 * 避免点了「期刊投稿」马上离开就堆一堆空草稿。
 *
 * 返回值:
 *   - 有匹配的草稿 → Submission
 *   - 没有(用户没草稿 / 草稿都空 / 草稿都被取消)→ null
 */
export function useLatestDraft(mode: SubmissionMode) {
  return useQuery({
    queryKey: KEY('latest-draft', mode),
    queryFn: async (): Promise<Submission | null> => {
      try {
        const r = await http.get<{ data?: Submission } & Partial<Submission>>(
          '/user/peer-review/submissions/latest-draft',
          { params: { mode } }
        );
        return unwrap<Submission>(r.data);
      } catch (err) {
        // 404 = 没有 active draft, 这是合法状态而不是错误
        if (
          err && typeof err === 'object' && 'response' in err &&
          (err as { response?: { status?: number } }).response?.status === 404
        ) {
          return null;
        }
        throw err;
      }
    },
    // 这条查询只在 wizard 第一次 mount 时用 — 进 wizard 之后用 id 直接访问 submission detail,
    // 不需要持续轮询。staleTime 设长一点避免重渲染时多余请求。
    staleTime: 30_000,
  });
}

/**
 * 进 wizard 入口时调:有未完成 draft 就复用 (用户继续填上次的) ,没有才新建。
 * 后端会 SELECT WHERE status='draft' ORDER BY updated_at DESC LIMIT 1。
 * 返回的 submission 自带 .step,前端用 it 决定跳哪一步。
 *
 * **DEPRECATED**: wizard 入口已改用 [[useLatestDraft]] + lazy create on first upload。
 * 保留这个 hook 给以后可能的"主动新建"按钮场景。
 */
export function useResumeOrCreateSubmission() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (mode: SubmissionMode) => {
      const r = await http.post<{ data?: Submission } & Partial<Submission>>(
        '/user/peer-review/submissions/resume-or-create',
        { mode }
      );
      return unwrap<Submission>(r.data);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY('list') });
    },
  });
}

export interface SubmissionPatch {
  step?: WizardStep;
  title?: string;
  abstract?: string;
  /** 0058: keywords/subjects/manuscriptType — 用户在 ManuscriptMetaForm 改的时候写回 */
  extraMeta?: Submission['extraMeta'];
  letterBody?: string;
  /** 期刊模式:journalTarget;毕业模式:schoolTarget */
  journalTarget?: Submission['journalTarget'];
  schoolTarget?: Submission['schoolTarget'];
}

export function usePatchSubmission(id?: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: SubmissionPatch) => {
      const r = await http.patch<{ data?: Submission } & Partial<Submission>>(
        `/user/peer-review/submissions/${id}`,
        patch
      );
      return unwrap<Submission>(r.data);
    },
    onSuccess: (data) => {
      qc.setQueryData(KEY('detail', id ?? 0), data);
      qc.invalidateQueries({ queryKey: KEY('list') });
    },
  });
}

/**
 * 删除整条投稿 (含草稿 / 进行中 / 已完成)。
 * 后端会顺带:删 agent session、删 MinIO 对象、级联删 assets/reports/step_cache。
 * 调用方常在 toast 成功后跳走 (records list / 新草稿) — 避免组件树读到已删数据。
 */
export function useDeleteSubmission() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      await http.delete(`/user/peer-review/submissions/${id}`);
    },
    onSuccess: (_, id) => {
      qc.removeQueries({ queryKey: KEY('detail', id) });
      qc.removeQueries({ queryKey: KEY('assets', id) });
      qc.invalidateQueries({ queryKey: KEY('list') });
      // 删草稿后入口探活必须重查 —— 否则 latest-draft 缓存还指着这条已删草稿
      qc.invalidateQueries({ queryKey: KEY('latest-draft') });
    },
  });
}

export function useSubmitSubmission(id?: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const r = await http.post<{ data?: Submission } & Partial<Submission>>(
        `/user/peer-review/submissions/${id}/submit`
      );
      return unwrap<Submission>(r.data);
    },
    onSuccess: (data) => {
      qc.setQueryData(KEY('detail', id ?? 0), data);
      qc.invalidateQueries({ queryKey: KEY('list') });
      // **关键**:投稿后这条不再是 draft, 入口探活 (useLatestDraft, staleTime 30s) 必须重查,
      // 否则下次进 wizard 会拿到缓存里这条"刚提交的草稿"→ 误当草稿恢复 → 操作即 400。
      qc.invalidateQueries({ queryKey: KEY('latest-draft') });
    },
  });
}

// ─── 文件上传 / 删除 ───────────────────────────────────────────────────────

export interface UploadAssetParams {
  file: File;
  role: 'manuscript' | 'attachment';
  category?: AttachmentCategory;
}

export function useUploadAsset(id?: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ file, role, category }: UploadAssetParams) => {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('role', role);
      if (category) fd.append('category', category);
      // 必须显式设 'multipart/form-data' 覆盖 http client 全局默认的 'application/json'
      // (否则 axios 把 FormData 当 JSON 发,后端 ParseMultipartForm 直接 400)。
      // axios 1.x 收到 FormData + 这个 Content-Type 会自动补 boundary 参数。
      const r = await http.post<{ data?: SubmissionAsset } & Partial<SubmissionAsset>>(
        `/user/peer-review/submissions/${id}/assets`,
        fd,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      );
      return unwrap<SubmissionAsset>(r.data);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY('detail', id ?? 0) });
      qc.invalidateQueries({ queryKey: KEY('assets', id ?? 0) });
    },
  });
}

export function useDeleteAsset(id?: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (assetId: number) => {
      await http.delete(`/user/peer-review/submissions/${id}/assets/${assetId}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY('detail', id ?? 0) });
      qc.invalidateQueries({ queryKey: KEY('assets', id ?? 0) });
    },
  });
}

export function useSubmissionAssets(id?: number) {
  return useQuery({
    queryKey: KEY('assets', id ?? 0),
    enabled: !!id,
    queryFn: async () => {
      const r = await http.get<{ data?: { items: SubmissionAsset[] } } & Partial<{ items: SubmissionAsset[] }>>(
        `/user/peer-review/submissions/${id}/assets`
      );
      return unwrap<{ items: SubmissionAsset[] }>(r.data).items;
    },
  });
}

// ─── Wizard 下一步 (0058 统一入口) ─────────────────────────────────────
//
// 替代旧的 useExtractMeta / useDraftLetter / useRecommendJournals。后端走单 session
// + fingerprint cache + 异步 goroutine, 详见 [[backend/internal/peerreview/service.go]]
// AdvanceStep。
//
// 调用后 submission.computeState 会变成 computing_meta / computing_letter,
// useSubmission 的 refetchInterval 自动开始 2s polling, computing 结束转 idle 时停。
// 组件层只需 watch submission.computeState + step + extraMeta 渲染。

export function useAdvanceStep(id?: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (fromStep: 1 | 2 | 3) => {
      const r = await http.post<{ data?: Submission } & Partial<Submission>>(
        `/user/peer-review/submissions/${id}/advance`,
        { from: fromStep }
      );
      return unwrap<Submission>(r.data);
    },
    onSuccess: (data) => {
      // 立刻把返回的 submission(可能带 computeState=computing_*)写进 cache,
      // 让 refetchInterval 紧接着接管 polling
      qc.setQueryData(KEY('detail', id ?? 0), data);
    },
  });
}

/**
 * 下载该投稿的原始稿件 + 附件 (后端打包成 zip)。
 * 走 axios http 实例 (带 Bearer 鉴权), responseType blob; 拿到后在浏览器触发下载。
 * 文件名优先用后端 Content-Disposition 里的 filename*=UTF-8'' (支持中文标题)。
 */
export function useDownloadSubmissionAssets() {
  return useMutation<void, Error, number>({
    mutationFn: async (id: number) => {
      const resp = await http.get(`/user/peer-review/submissions/${id}/download`, {
        responseType: 'blob',
      });
      const blob = resp.data as Blob;
      const cd = (resp.headers['content-disposition'] as string) || '';
      const filename = filenameFromContentDisposition(cd) || `submission-${id}.zip`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    },
  });
}

function filenameFromContentDisposition(cd: string): string | null {
  const star = /filename\*=UTF-8''([^;]+)/i.exec(cd);
  if (star) {
    try {
      return decodeURIComponent(star[1].trim());
    } catch {
      /* fall through */
    }
  }
  const plain = /filename="?([^";]+)"?/i.exec(cd);
  return plain ? plain[1].trim() : null;
}
