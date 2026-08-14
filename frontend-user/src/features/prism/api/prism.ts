// 智能写作 (Prism) —— 用户端 react-query hooks。字段对齐 backend/internal/prism。
import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { http } from '@/shared/lib/http';
import {
  PRISM_COMPILE_STATUS_EVENT,
  type PrismCompileStatusDetail,
} from '@/shared/lib/compile-events';
import { retryDetailQuery } from '@/shared/lib/query-config';
import { getAuthToken } from '@/shared/lib/auth-token';
import { attachmentUrl } from '@/shared/lib/agent-attachment';
import type { PdfSource } from '@/shared/components/PdfViewer';

export interface PrismProject {
  id: number;
  user_id: number;
  title: string;
  main_file: string;
  status: string;
  /** 文档轨道:'legacy'(旧裸 LaTeX,cutover 后只读)/ 'struct'(新结构体)。见后端 prism.Project。 */
  schema_version: string;
  /** 后端计算:旧版编辑面是否禁用(legacy 冻结 / struct 走专用端点)。编译/导出不受影响。 */
  read_only?: boolean;
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
  // 失败分类(mirrors prism.Compile.ErrorKind):latex=真 LaTeX 语法错(才 arm auto-fix)/ infra / timeout / 空=旧行未分类。
  error_kind?: string;
  // 报错归属(mirrors prism.Compile.ErrorSource,2026-07 线上审计新增):body=正文 document.md /
  // bibliography=参考文献 bib(回喂 AI 改 document.md 结构性修不了)/ infra=基础设施;空=旧后端未分类,按 body 兼容。
  error_source?: string;
  duration_ms: number;
  page_count?: number; // 编译产物页数(mirrors prism.Compile.PageCount;V4-A3 页数对照)
  overfull_count?: number;
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
    // 不存在 / 非本人 → 后端 404,立即失败(不重试),让「项目不存在」友好态秒出。
    retry: retryDetailQuery,
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

/** 取项目会话上下文水位。30s staleTime;每轮结束(message_complete)由 usePrismChat 主动失效刷新。
 *  多对话:sessionId 进 queryKey + ?session_id= —— 切对话后取的是该对话的上下文水位(省略回落当前)。 */
export function usePrismContext(projectId?: number, sessionId?: string) {
  return useQuery<PrismContextSnapshot>({
    queryKey: ['prism', 'context', projectId, sessionId ?? ''],
    enabled: !!projectId,
    staleTime: 30 * 1000,
    queryFn: async () => {
      const { data } = await http.get<{ data?: Partial<PrismContextSnapshot> }>(
        `/user/prism/projects/${projectId}/session/context${convQuery(sessionId)}`,
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

/**
 * 编译状态 —— 推送为主、轮询兜底(2026-08-12 推送化)。
 * 后端每次状态翻转经通知 WS 下发 compile_status(帧即 GET 响应体的 compile 对象),
 * 这里监听事件桥直接 setQueryData,终态即时可见;queued/running 的轮询从 1s 降到 5s,
 * 只兜 WS 断连/丢帧(单次编译 5-60 个请求 → ~1-12 个)。
 * 注意:缓存命中路径是 queued→success 直跳,不能假设一定有 running 帧。
 */
export function useCompile(projectId?: number, compileId?: number) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!projectId || !compileId) return;
    const handler = (evt: Event) => {
      const d = (evt as CustomEvent<PrismCompileStatusDetail>).detail;
      if (d?.project_id === projectId && d?.id === compileId) {
        const key = ['prism', 'compile', projectId, compileId] as const;
        // 先杀在途轮询再写(乐观更新标准姿势):不 cancel 的话,一个读到 running 的
        // 在途 GET 会在推送帧之后 resolve,把 success/error 覆盖回 running —— 状态回翻
        // 且 workspace 的 success effect 二次触发 pdfKey+1 → PdfViewer 整树重挂、PDF 双下载。
        void qc.cancelQueries({ queryKey: key }).then(() => {
          qc.setQueryData(key, d as unknown as PrismCompile);
        });
      }
    };
    window.addEventListener(PRISM_COMPILE_STATUS_EVENT, handler);
    return () => window.removeEventListener(PRISM_COMPILE_STATUS_EVENT, handler);
  }, [projectId, compileId, qc]);
  return useQuery({
    queryKey: ['prism', 'compile', projectId, compileId],
    enabled: !!projectId && !!compileId,
    queryFn: async () =>
      (await http.get<{ data: { compile: PrismCompile } }>(`/user/prism/projects/${projectId}/compile/${compileId}`)).data.data.compile,
    refetchInterval: (q) => {
      const s = q.state.data?.status;
      return s === 'queued' || s === 'running' ? 5_000 : false;
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

// 注:struct 轨「历史版本」前端入口已下线(改动改用编辑器内原地 diff 标注,不再有版本回滚对话框)。
// 后端 /struct/versions 快照端点仍在(每次保存自动快照,作服务端恢复兜底),前端暂不消费。

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

/** 应用引用:把库论文 BibTeX 写进结构体 Bibliography(projector 据它出参考文献表),返回可插入的 cite key。
 *  mirrors backend/internal/prism/cite.go ApplyStructCite */
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

// ─── struct 轨(新版结构体文档)────────────────────────────────────────────
// mirrors backend/internal/prism/struct_model.go DocStruct
export interface DocInline {
  t: string; // text|bold|italic|cite|math
  v?: string;
  key?: string;
  latex?: string;
}
export interface DocBlock {
  id?: string;
  type: string; // heading|paragraph|displayMath|figure|list|opaque
  level?: number;
  text?: string;
  label?: string;
  inlines?: DocInline[];
  latex?: string;
  asset?: string;
  caption?: string;
  width?: string;
  ordered?: boolean;
  items?: DocInline[][];
  rows?: string[][]; // table 行(rows[0]=表头)
  rawLatex?: string;
}
export interface DocAuthor {
  id?: string;
  given?: string;
  family?: string;
  email?: string;
  orcid?: string;
  corresponding?: boolean;
  affRefs?: string[];
}
export interface DocAffiliation {
  id?: string;
  organization?: string;
  department?: string;
  city?: string;
  country?: string;
}
export interface DocFrontMatter {
  title: string;
  shortTitle?: string;
  authors?: DocAuthor[];
  affiliations?: DocAffiliation[];
  abstract?: string;
  keywords?: string[];
}
export interface DocStruct {
  structVersion: number;
  targetTemplate: string;
  frontMatter: DocFrontMatter;
  body: DocBlock[];
  bibliography?: Record<string, string>;
  assets?: Record<string, unknown>;
}
export interface PrismTemplate {
  key: string;
  name: string;
  doc_class: string;
}

/** 取 struct 项目的结构体真源。staleTime:0(切走再回来取最新,沿用 agent 历史重入铁律)。 */
export function useStruct(projectId?: number) {
  return useQuery({
    queryKey: ['prism', 'struct', projectId],
    enabled: !!projectId,
    staleTime: 0,
    queryFn: async () =>
      (await http.get<{ data: { struct: DocStruct } }>(`/user/prism/projects/${projectId}/struct`)).data.data.struct,
  });
}

/** 保存结构体(投影 + 落版本);成功后把返回的规范结构体写回缓存。 */
export function useSaveStruct(projectId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (struct: DocStruct) =>
      (await http.put<{ data: { struct: DocStruct } }>(`/user/prism/projects/${projectId}/struct`, { struct })).data.data.struct,
    onSuccess: (s) => qc.setQueryData(['prism', 'struct', projectId], s),
  });
}

/** 模板选择器元数据(「投到哪个期刊」)。 */
export function useTemplates() {
  return useQuery({
    queryKey: ['prism', 'templates'],
    queryFn: async () =>
      (await http.get<{ data: { templates: PrismTemplate[] } }>('/user/prism/templates')).data.data.templates,
  });
}

/** 目标模板合规:必填前置信息缺失(前端红点提示)。mirrors prism.ConformanceReport。 */
export interface Conformance {
  template: string;
  page_limit?: number;
  page_count?: number;
  word_limit?: number; // V4-A3:模板正文词数上限(0/缺省=不限)
  word_count?: number; // 当前正文词数(与后端同一口径,header 字数展示同源)
  missing: string[];
}

export function useConformance(projectId?: number) {
  return useQuery({
    queryKey: ['prism', 'conformance', projectId],
    enabled: !!projectId,
    staleTime: 0,
    queryFn: async () =>
      (await http.get<{ data: { conformance: Conformance } }>(`/user/prism/projects/${projectId}/conformance`)).data.data.conformance,
  });
}

// ── 写作画像(Phase 3)—— base 文体/学科人格。mirrors backend/internal/prism/writing_persona.go WritingProfile ──
export interface WritingProfile {
  base_slug: string;
  genre: string;
  source: string; // default | planner | user
  needs_refine: boolean;
}
export interface PersonaEntry {
  slug: string;
  name: string;
  kind: string; // genre | discipline
  description: string;
  scene?: string; // 适用场景一句(V4 UI:右栏图形化详情)
  traits?: string[]; // 特质短 chip
  skeleton?: string[]; // 写作骨架流程(阶段序列 → 流程图)
  sample?: string; // 成稿味道示例句
}

/** 当前写作画像 + 可选人格花名册(picker 用)。staleTime:0(改后即取最新)。 */
export function useWritingProfile(projectId?: number) {
  return useQuery({
    queryKey: ['prism', 'writing-profile', projectId],
    enabled: !!projectId,
    staleTime: 0,
    queryFn: async () =>
      (await http.get<{ data: { profile: WritingProfile; personas: PersonaEntry[] } }>(`/user/prism/projects/${projectId}/writing-profile`)).data.data,
  });
}

/** 用户覆盖 base 人格(+可选 genre)。 */
export function useSetWritingProfile(projectId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: { base_slug: string; genre?: string }) =>
      (await http.put<{ data: { profile: WritingProfile } }>(`/user/prism/projects/${projectId}/writing-profile`, body)).data.data.profile,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['prism', 'writing-profile', projectId] }),
  });
}

/** planner 一次性轮:自动识别文体/学科并落库。 */
export function usePlanWritingProfile(projectId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () =>
      (await http.post<{ data: { profile: WritingProfile } }>(`/user/prism/projects/${projectId}/writing-profile/plan`, {})).data.data.profile,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['prism', 'writing-profile', projectId] }),
  });
}

// ── 质量回执(Phase 4)—— 当前结构体的确定性双轨检查。mirrors backend/internal/prism/quality.go QualityReceipt ──
export interface QualityReceipt {
  dangling_cites: string[]; // [@key] 无对应 references.bib 条目
  undefined_xrefs: string[]; // [@fig:x] 等无对应打锚
  missing_front: string[]; // 前置信息缺失
  long_sentences: number; // 超长句数(craft 软提示)
  // V2-A4 生成侧确定性信号(零 schema):
  stub_sections: string[]; // 骨架节(heading 下无实质正文)
  todo_count: number; // %TODO / [TODO 哨兵数
  abbrev_issues: string[]; // 缩写一致性(未定义/定义前使用)
  // V4-R1(数字地基 + 一致性扫描):
  abstract_num_issues?: string[]; // 摘要数字在正文无出处(对账)
  term_variants?: string[]; // 术语变体并用(dataset/data set)
  style_issues?: string[]; // 数字/统计风格不一致(千分位/p 大小写/百分号空格)
  issue_count: number; // A 轨硬问题总数
}

/** 当前结构体质量回执。staleTime:0(每次 apply 后失效重取)。 */
export function useQualityCheck(projectId?: number) {
  return useQuery({
    queryKey: ['prism', 'quality', projectId],
    enabled: !!projectId,
    staleTime: 0,
    queryFn: async () =>
      (await http.get<{ data: { quality: QualityReceipt } }>(`/user/prism/projects/${projectId}/quality-check`)).data.data.quality,
  });
}

/** 确定性换刊(POST /template)—— 非 LLM 重写;返回新结构体 + 合规报告。 */
export function useSetTemplate(projectId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (template: string) =>
      (await http.post<{ data: { struct: DocStruct; conformance: Conformance } }>(`/user/prism/projects/${projectId}/template`, { template })).data.data,
    onSuccess: (d) => {
      qc.setQueryData(['prism', 'struct', projectId], d.struct);
      qc.setQueryData(['prism', 'conformance', projectId], d.conformance);
    },
  });
}

/** 上传图片(multipart)→ 末尾插一个 figure 块;返回新结构体。 */
export function useUploadAsset(projectId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append('file', file);
      return (await http.post<{ data: { struct: DocStruct } }>(`/user/prism/projects/${projectId}/assets`, fd)).data.data.struct;
    },
    onSuccess: (s) => qc.setQueryData(['prism', 'struct', projectId], s),
  });
}

/** 导出 Word(.docx)—— struct→Pandoc。走 blob(端点需 Bearer)。 */
export async function exportPrismDocx(projectId: number, filename: string): Promise<void> {
  const res = await http.get(`/user/prism/projects/${projectId}/export/docx`, { responseType: 'blob' });
  const url = URL.createObjectURL(res.data as Blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** 逃生口:从旧项目克隆一个新版(struct)项目。 */
export function useCloneToStruct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (projectId: number) =>
      (await http.post<{ data: { project: PrismProject } }>(`/user/prism/projects/${projectId}/clone-to-struct`, {})).data.data.project,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['prism', 'projects'] }),
  });
}

// ─── agent-native 用户 WS 轮次(实时编辑 + 应用门 + 重入)──────────────────────

/** 待应用的一个文件改动:DB 旧正文 + cwd 新正文(前端据此渲染 diff)。
 * is_new=true 表示 agent 本轮新建的文件(DB 还没有,old_body 为空,渲染为全新增)。 */
export interface PrismPendingFile {
  file_id: number;
  rel_path: string;
  old_body: string;
  new_body: string;
  is_new?: boolean;
  // struct 轨:改动前后的结构体(渲染 Word 式痕迹 diff 用,替代 markdown 代码 diff)。
  old_struct?: DocStruct;
  new_struct?: DocStruct;
}

// 多对话:round/session 端点带 ?session_id=<当前对话> —— 一项目多条对话共享同一份论文,后端按此把
// 本对话的 cwd 铺源/回读。省略(空)时后端回落「当前/最近活跃对话」(兼容存量单会话项目)。
function convQuery(sessionId?: string): string {
  return sessionId ? `?session_id=${encodeURIComponent(sessionId)}` : '';
}

/** 每轮 AI 前铺源(DB current → 会话 cwd)。返回轮次世代号 epoch(V3-4.4-1;apply 时带回校验)。
 *  AI 回答进行中后端返回 409(ErrRoundBusy)。 */
export async function prepareRound(projectId: number, sessionId?: string): Promise<string> {
  const { data } = await http.post<{ data: { ok: boolean; epoch?: string } }>(
    `/user/prism/projects/${projectId}/round/prepare${convQuery(sessionId)}`,
    {},
  );
  return data.data?.epoch ?? '';
}

/** 检出 cwd 相对 DB 的待应用改动(重入时拉它渲染待应用 diff)。
 *  响应携带服务端当前 epoch:重入 tab 没调过 prepare,据此才能 commit 而不必 409。 */
export async function fetchPendingRound(
  projectId: number,
  sessionId?: string,
): Promise<{ files: PrismPendingFile[]; epoch: string }> {
  const { data } = await http.get<{ data: { files: PrismPendingFile[]; epoch?: string } }>(
    `/user/prism/projects/${projectId}/round/pending${convQuery(sessionId)}`,
  );
  return { files: data.data?.files ?? [], epoch: data.data?.epoch ?? '' };
}

/** 应用:固化 cwd 改动进 DB,返回固化文件数。
 * instruction:本轮干净指令,透传给后端 → 首次成功固化后用它自动给项目起名(best-effort)。
 * overrides(可选,per-file/per-hunk):relPath→最终正文(以 files 字段发)。legacy 轨逐文件固化;
 *   struct 轨(P2)= overrides[document.md] 作「逐块审阅」合并正文替代 cwd(旧「假门」已拆)。
 * epoch:prepare/pending 拿到的轮次世代号;与服务端当前不符后端返回 409(基线已被其它窗口推进)。 */
export async function applyRound(
  projectId: number,
  instruction?: string,
  overrides?: Record<string, string>,
  epoch?: string,
  sessionId?: string,
): Promise<number> {
  const body: Record<string, unknown> = {};
  if (instruction) body.instruction = instruction;
  if (overrides && Object.keys(overrides).length > 0) body.files = overrides;
  if (epoch) body.epoch = epoch;
  const { data } = await http.post<{ data: { applied: number } }>(
    `/user/prism/projects/${projectId}/round/apply${convQuery(sessionId)}`,
    body,
  );
  return data.data?.applied ?? 0;
}

// ── 多对话:一项目多条对话,共享同一份论文(每轮 prepare 铺源把当前文档注入该对话 cwd)──
// mirrors backend agentbridge.SessionListItem
export interface PrismConversation {
  sessionId: string;
  title: string;
  messageCount: number;
  lastAccessedAt: string;
  createdAt: string;
}

/** 列本项目的对话列表(侧栏)。按最近活跃排序。 */
export async function listPrismConversations(projectId: number): Promise<PrismConversation[]> {
  const { data } = await http.get<{ data: { sessions: PrismConversation[] } }>(
    `/user/prism/projects/${projectId}/conversations`,
  );
  return data.data?.sessions ?? [];
}

/** 新建一条对话(「新对话」按钮)。返回新对话 sessionId(切过去后 WS 重连即用它)。 */
export async function createPrismConversation(projectId: number): Promise<string> {
  const { data } = await http.post<{ data: { sessionId: string } }>(
    `/user/prism/projects/${projectId}/conversations`,
    {},
  );
  return data.data?.sessionId ?? '';
}

/** 本项目对话列表(侧栏「会话历史」)。refetchOnMount:'always' 修「新建对话后列表不刷」同 makeAgentSessionApi。 */
export function useProjectConversations(projectId?: number) {
  return useQuery({
    queryKey: ['prism', 'conversations', projectId],
    enabled: !!projectId,
    staleTime: 30 * 1000,
    refetchOnMount: 'always',
    queryFn: () => listPrismConversations(projectId as number),
  });
}

/** 「新对话」mutation:建一条对话(不删任何已有对话),成功后失效对话列表。返回新 sessionId。 */
export function useCreateConversation(projectId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => createPrismConversation(projectId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['prism', 'conversations', projectId] }),
  });
}

// ── 修改意见回应工作流(V4-③)。mirrors backend/internal/prism/revision.go RevisionItem ──
export interface RevisionItem {
  id: number;
  project_id: number;
  seq: number;
  reviewer: string;
  quote: string;
  interpretation: string;
  severity: string; // major | minor
  action: string; // concede_revise | clarify | refute | partial | needs_author_input
  anchor: string;
  status: string; // pending | applied | rejected | needs_author_input
  response: string;
}

export async function parseRevision(projectId: number, text: string): Promise<RevisionItem[]> {
  const { data } = await http.post<{ data: { items: RevisionItem[] } }>(
    `/user/prism/projects/${projectId}/revision/parse`,
    { text },
  );
  return data.data?.items ?? [];
}

export async function listRevision(projectId: number): Promise<RevisionItem[]> {
  const { data } = await http.get<{ data: { items: RevisionItem[] } }>(`/user/prism/projects/${projectId}/revision`);
  return data.data?.items ?? [];
}

export async function updateRevisionItem(
  projectId: number,
  itemId: number,
  patch: Partial<Pick<RevisionItem, 'action' | 'status' | 'response' | 'interpretation' | 'severity' | 'reviewer' | 'anchor'>>,
): Promise<RevisionItem | undefined> {
  const { data } = await http.patch<{ data: { item: RevisionItem } }>(
    `/user/prism/projects/${projectId}/revision/${itemId}`,
    patch,
  );
  return data.data?.item;
}

export async function fetchRevisionLetter(projectId: number): Promise<string> {
  const { data } = await http.get<{ data: { letter: string } }>(`/user/prism/projects/${projectId}/revision/letter`);
  return data.data?.letter ?? '';
}

// ── 数字成员校验(V4-⑤ 轻版)+ 术语表(V4-④)──
export interface NumberCheck {
  number: string;
  found: boolean;
}

export async function verifyNumbers(projectId: number, source: string, text: string): Promise<NumberCheck[]> {
  const { data } = await http.post<{ data: { checks: NumberCheck[] } }>(
    `/user/prism/projects/${projectId}/verify-numbers`,
    { source, text },
  );
  return data.data?.checks ?? [];
}

export async function getTerminology(projectId: number): Promise<string> {
  const { data } = await http.get<{ data: { terminology: string } }>(`/user/prism/projects/${projectId}/terminology`);
  return data.data?.terminology ?? '';
}

export async function putTerminology(projectId: number, terminology: string): Promise<void> {
  await http.put(`/user/prism/projects/${projectId}/terminology`, { terminology });
}

/** 丢弃:重铺源还原 cwd(抹掉 agent 本轮未应用改动)。多对话:带 ?session_id= 只还原该对话 cwd。 */
export async function rejectRound(projectId: number, sessionId?: string): Promise<void> {
  await http.post(`/user/prism/projects/${projectId}/round/reject${convQuery(sessionId)}`, {});
}

/** 读会话 cwd 里某文件的当前正文(流式中按 tool_result 逐个 refetch 做实时 diff)。多对话:按 session_id 定位该对话 cwd。 */
export async function readWorkspaceFile(
  projectId: number,
  relPath: string,
  sessionId?: string,
): Promise<{ found: boolean; content: string }> {
  const { data } = await http.get<{ data: { found: boolean; content: string } }>(
    `/user/prism/projects/${projectId}/workspace/file`,
    { params: { path: relPath, ...(sessionId ? { session_id: sessionId } : {}) } },
  );
  return data.data ?? { found: false, content: '' };
}

/** agent 会话历史一条(重入渲染过往对话用;content 是 Anthropic content[] 或字符串)。 */
export interface PrismHistoryMsg {
  id: string;
  // user | assistant | tool_use | tool_result | system | artifact | error
  // (宽类型刻意保留;'error' 是失败轮终态合成 entry,content = {code, message},
  //  由 shared replayHistoryAsTurns 回放成与实时同构的失败轮收口;未知 type 安全跳过)
  type: string;
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
export async function fetchWSHistory(
  projectId: number,
  limitTurns?: number,
  sessionId?: string,
): Promise<PrismHistoryResult> {
  const params = new URLSearchParams();
  if (limitTurns && limitTurns > 0) params.set('limit', String(limitTurns));
  if (sessionId) params.set('session_id', sessionId);
  const qs = params.toString();
  const url = `/user/prism/projects/${projectId}/session/messages${qs ? `?${qs}` : ''}`;
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

/** prism 历史回放/已发送气泡里图片取图代理 URL(cookie 鉴权,<img src> 直接用)。
 *  端点 per-project(会话由 :id 解析);path 取 basename。 */
export function prismSessionFileUrl(projectId: number, absPath: string): string {
  // 0112 起优先走统一附件端点(见 shared/lib/agent-attachment.ts);老代理 URL 随 ?fb=
  // 一起送,由后端在查不到行(0112 之前的存量附件)时 302 交还 —— 前端分辨不了新旧。
  const apiBase = import.meta.env.VITE_API_BASE_URL || '/api/v1';
  // prism 附件落会话 cwd 的 uploads/ 子目录 —— 取「相对会话 cwd」的路径(而非 basename),
  // 否则后端按根目录找不到。绝对路径形如 /home/bun/sessions/<uuid>/uploads/<file>。
  const parts = absPath.split('/');
  const i = parts.indexOf('sessions');
  const rel = i >= 0 && parts.length > i + 2 ? parts.slice(i + 2).join('/') : parts.pop() || absPath;
  const qs = new URLSearchParams({ path: rel });
  const legacy = `${apiBase}/user/prism/projects/${projectId}/session/file?${qs.toString()}`;
  return attachmentUrl(absPath, legacy) ?? legacy;
}
