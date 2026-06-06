// 智能写作 (Prism) —— 用户端 react-query hooks。字段对齐 backend/internal/prism。
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { http } from '@/shared/lib/http';
import { getAuthToken } from '@/shared/lib/auth-token';
import type { PdfSource } from '@/shared/components/PdfViewer';

export interface PrismProject {
  id: number;
  user_id: number;
  title: string;
  main_file: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface PrismFile {
  id: number;
  project_id: number;
  rel_path: string;
  file_kind: 'tex' | 'bib' | 'sty' | 'cls' | 'asset';
  current_version_id?: number | null;
  content_sha256?: string;
  size: number;
  created_at: string;
  updated_at: string;
}

export type CompileStatus = 'queued' | 'running' | 'success' | 'error';

export interface PrismCompile {
  id: number;
  project_id: number;
  status: CompileStatus;
  engine: string;
  log_excerpt?: string;
  error_summary?: string;
  duration_ms: number;
  created_at: string;
}

// ─── 项目 ────────────────────────────────────────────────────────────────

export function useProjects() {
  return useQuery({
    queryKey: ['prism', 'projects'],
    queryFn: async () => (await http.get<{ data: { projects: PrismProject[] } }>('/user/prism/projects')).data.data.projects,
  });
}

export function useCreateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (title: string) =>
      (await http.post<{ data: { project: PrismProject; files: PrismFile[] } }>('/user/prism/projects', { title })).data.data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['prism', 'projects'] }),
  });
}

/** 重命名项目(改标题)。 */
export function useRenameProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { projectId: number; title: string }) =>
      http.patch(`/user/prism/projects/${vars.projectId}`, { title: vars.title }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['prism', 'projects'] }),
  });
}

/** 删除项目(连同全部文件/版本/编译/对话)。 */
export function useDeleteProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (projectId: number) => http.delete(`/user/prism/projects/${projectId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['prism', 'projects'] }),
  });
}

/** 项目详情(含文件清单)。 */
export function useProject(id?: number) {
  return useQuery({
    queryKey: ['prism', 'project', id],
    enabled: !!id,
    queryFn: async () =>
      (await http.get<{ data: { project: PrismProject; files: PrismFile[] } }>(`/user/prism/projects/${id}`)).data.data,
  });
}

// ─── 上下文水位(token 占用)─────────────────────────────────────────────

/** 当前项目 agent 会话的上下文用量;footer 实时展示百分比。totalTokens=0(没说过话)时不显示。 */
export interface PrismContextSnapshot {
  totalTokens: number;
  maxTokens: number;
  percentage: number;
  model: string;
}

/** 取项目会话上下文水位。30s staleTime;每轮结束(message_complete)由 usePrismChat 主动失效刷新。 */
export function usePrismContext(projectId?: number) {
  return useQuery<PrismContextSnapshot>({
    queryKey: ['prism', 'context', projectId],
    enabled: !!projectId,
    staleTime: 30 * 1000,
    queryFn: async () => {
      const { data } = await http.get<{ data?: Partial<PrismContextSnapshot> }>(
        `/user/prism/projects/${projectId}/session/context`,
      );
      const p = data.data ?? {};
      return {
        totalTokens: p.totalTokens ?? 0,
        maxTokens: p.maxTokens ?? 0,
        percentage: p.percentage ?? 0,
        model: p.model ?? '',
      };
    },
  });
}

// ─── 文件 ────────────────────────────────────────────────────────────────

export function useFileBody(projectId?: number, fileId?: number) {
  return useQuery({
    queryKey: ['prism', 'file', projectId, fileId],
    enabled: !!projectId && !!fileId,
    queryFn: async () =>
      (await http.get<{ data: { file: PrismFile; body: string } }>(`/user/prism/projects/${projectId}/files/${fileId}`)).data.data,
  });
}

/** 保存文件正文(追加 current 版本)。
 * 不 invalidate(刷新会把正在输入的内容回灌覆盖光标 review F6);改用 setQueryData 把刚存的正文写回
 * 该文件的 body 缓存 —— 这样 30s staleTime 内切走再切回不会读到旧值(review F3)。
 * setQueryData 不触发 refetch 且只动同一文件缓存,故不会动当前 buffer。 */
export function useSaveFile(projectId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { fileId: number; body: string }) =>
      http.put(`/user/prism/projects/${projectId}/files/${vars.fileId}`, { body: vars.body }),
    onSuccess: (_res, vars) => {
      qc.setQueryData<{ file: PrismFile; body: string }>(['prism', 'file', projectId, vars.fileId], (old) =>
        old ? { ...old, body: vars.body } : old
      );
    },
  });
}

// ─── 编译 ────────────────────────────────────────────────────────────────

/** 发起编译(异步)→ 返回 compile 记录;用 useCompile 轮询状态。 */
export function useStartCompile(projectId: number) {
  return useMutation({
    mutationFn: async (engine?: string) =>
      (await http.post<{ data: { compile: PrismCompile } }>(`/user/prism/projects/${projectId}/compile`, { engine })).data.data.compile,
  });
}

/** 轮询编译状态 —— queued/running 时每 1s 刷新,终态停。 */
export function useCompile(projectId?: number, compileId?: number) {
  return useQuery({
    queryKey: ['prism', 'compile', projectId, compileId],
    enabled: !!projectId && !!compileId,
    queryFn: async () =>
      (await http.get<{ data: { compile: PrismCompile } }>(`/user/prism/projects/${projectId}/compile/${compileId}`)).data.data.compile,
    refetchInterval: (q) => {
      const s = q.state.data?.status;
      return s === 'queued' || s === 'running' ? 1000 : false;
    },
  });
}

// ─── \cite(文献库 RAG)──────────────────────────────────────────────────────

export interface CiteCandidate {
  library_paper_id: number;
  cite_key: string;
  title: string;
  authors: string;
  year: number;
  venue: string;
  doi: string;
}

/** 文献库检索(只返真实库行;空 q 返回最近收藏)。enabled 控制开面板才查。 */
export function useCiteSearch(projectId: number, q: string, enabled: boolean) {
  return useQuery({
    queryKey: ['prism', 'cite', projectId, q],
    enabled,
    queryFn: async () =>
      (
        await http.get<{ data: { candidates: CiteCandidate[] } }>(
          `/user/prism/projects/${projectId}/cite/search`,
          { params: { q } }
        )
      ).data.data.candidates,
  });
}

// ─── 文件 CRUD ─────────────────────────────────────────────────────────────

export function useCreateFile(projectId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (relPath: string) =>
      (await http.post<{ data: { file: PrismFile } }>(`/user/prism/projects/${projectId}/files`, { rel_path: relPath })).data.data.file,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['prism', 'project', projectId] }),
  });
}

export function useRenameFile(projectId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { fileId: number; relPath: string }) =>
      http.post(`/user/prism/projects/${projectId}/files/${vars.fileId}/rename`, { rel_path: vars.relPath }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['prism', 'project', projectId] }),
  });
}

export function useDeleteFile(projectId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (fileId: number) => http.delete(`/user/prism/projects/${projectId}/files/${fileId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['prism', 'project', projectId] }),
  });
}

// ─── 版本历史 ──────────────────────────────────────────────────────────────

export interface PrismVersion {
  id: number;
  version_no: number;
  author: string;
  status: string;
  content_sha256?: string;
  created_at: string;
}

export function useFileVersions(projectId: number, fileId?: number, enabled = true) {
  return useQuery({
    queryKey: ['prism', 'versions', projectId, fileId],
    enabled: !!fileId && enabled,
    queryFn: async () =>
      (await http.get<{ data: { versions: PrismVersion[] } }>(`/user/prism/projects/${projectId}/files/${fileId}/versions`)).data.data.versions,
  });
}

export function useRestoreVersion(projectId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { fileId: number; versionId: number }) =>
      http.post(`/user/prism/projects/${projectId}/files/${vars.fileId}/versions/${vars.versionId}/restore`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['prism'] }),
  });
}

// ─── 对话历史(重入恢复)────────────────────────────────────────────────────

export interface ServerChatMessage {
  id: number;
  role: 'user' | 'assistant';
  text: string;
  edit_id?: number;
  file_id?: number;
  applied_hunks: number;
  failed_hunks: number;
  created_at: string;
}

export async function fetchChatHistory(projectId: number): Promise<ServerChatMessage[]> {
  return (await http.get<{ data: { messages: ServerChatMessage[] } }>(`/user/prism/projects/${projectId}/chat`)).data.data.messages;
}

/** 应用引用:写 references.bib,返回可插入的 cite key。 */
export function useApplyCite(projectId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (libraryPaperId: number) =>
      (await http.post<{ data: { cite_key: string } }>(`/user/prism/projects/${projectId}/cite/apply`, { library_paper_id: libraryPaperId })).data.data.cite_key,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['prism', 'project', projectId] }),
  });
}

/** 编译产物 PDF 的 react-pdf 源(后端私有 PDF,带鉴权头)。
 * version 变化(每次编译成功后 +1)→ URL 变化 → 绕开浏览器缓存,确保重编译后取到最新 PDF
 * (否则 /pdf URL 不变,浏览器可能回旧的缓存 PDF,表现为"重编译后还是旧内容/中文空白")。 */
export function prismPdfSource(projectId: number, version?: number): PdfSource {
  const token = getAuthToken();
  const url = `/api/v1/user/prism/projects/${projectId}/pdf${version ? `?v=${version}` : ''}`;
  return token ? { url, httpHeaders: { Authorization: `Bearer ${token}` } } : { url };
}

// ─── agent-native 用户 WS 轮次(实时编辑 + 应用门 + 重入)──────────────────────

/** 待应用的一个文件改动:DB 旧正文 + cwd 新正文(前端据此渲染 diff)。 */
export interface PrismPendingFile {
  file_id: number;
  rel_path: string;
  old_body: string;
  new_body: string;
}

/** 每轮 AI 前铺源(DB current → 会话 cwd)。 */
export async function prepareRound(projectId: number): Promise<void> {
  await http.post(`/user/prism/projects/${projectId}/round/prepare`, {});
}

/** 检出 cwd 相对 DB 的待应用改动(重入时拉它渲染待应用 diff)。 */
export async function fetchPendingRound(projectId: number): Promise<PrismPendingFile[]> {
  const { data } = await http.get<{ data: { files: PrismPendingFile[] } }>(
    `/user/prism/projects/${projectId}/round/pending`,
  );
  return data.data?.files ?? [];
}

/** 应用:固化 cwd 改动进 DB,返回固化文件数。 */
// instruction:本轮干净指令,透传给后端 → 首次成功固化后用它自动给项目起名(best-effort)。
export async function applyRound(projectId: number, instruction?: string): Promise<number> {
  const { data } = await http.post<{ data: { applied: number } }>(
    `/user/prism/projects/${projectId}/round/apply`,
    instruction ? { instruction } : {},
  );
  return data.data?.applied ?? 0;
}

/** 丢弃:重铺源还原 cwd(抹掉 agent 本轮未应用改动)。 */
export async function rejectRound(projectId: number): Promise<void> {
  await http.post(`/user/prism/projects/${projectId}/round/reject`, {});
}

/** 读会话 cwd 里某文件的当前正文(流式中按 tool_result 逐个 refetch 做实时 diff)。 */
export async function readWorkspaceFile(projectId: number, relPath: string): Promise<{ found: boolean; content: string }> {
  const { data } = await http.get<{ data: { found: boolean; content: string } }>(
    `/user/prism/projects/${projectId}/workspace/file`,
    { params: { path: relPath } },
  );
  return data.data ?? { found: false, content: '' };
}

/** agent 会话历史一条(重入渲染过往对话用;content 是 Anthropic content[] 或字符串)。 */
export interface PrismHistoryMsg {
  id: string;
  type: string; // user | assistant | tool_use | tool_result | system
  content: unknown;
  timestamp?: string;
}

/** 历史分页结果(同 claw/smart-search:最近 N 轮 + 是否还有更早)。 */
export interface PrismHistoryResult {
  messages: PrismHistoryMsg[];
  totalTurns: number;
  hasMore: boolean;
}

/**
 * 取项目 agent 会话历史(重入恢复过往对话文本)。
 * limitTurns>0 时只取最近 N 个用户轮(超长会话分页,后端 sliceRecentTurns),带回 hasMore 供「加载更早」。
 */
export async function fetchWSHistory(projectId: number, limitTurns?: number): Promise<PrismHistoryResult> {
  const url =
    limitTurns && limitTurns > 0
      ? `/user/prism/projects/${projectId}/session/messages?limit=${limitTurns}`
      : `/user/prism/projects/${projectId}/session/messages`;
  const { data } = await http.get<{
    data: { messages?: PrismHistoryMsg[] | null; totalTurns?: number; hasMore?: boolean };
  }>(url);
  const d = data.data;
  return {
    messages: d?.messages ?? [],
    totalTurns: d?.totalTurns ?? 0,
    hasMore: d?.hasMore ?? false,
  };
}
