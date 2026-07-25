/**
 * 智能助手 / 制作PPT — 成果交付 (artifacts) 的 react-query hook + URL 构造。
 *
 * agent 把要交给用户的成品写进会话 ./out 目录, 后端 GET <base>/session/artifacts 列出来,
 * GET <base>/session/artifact 下载/预览单个。生命周期 = 会话生命周期 (会话删/重置即清)。
 * Workspace 在每轮 message_complete 后 invalidate [feature,'artifacts'] 让列表刷新。
 *
 * 2026-07 制作PPT(boltslides)复用:URL 构造 + hooks 全部按 basePath/feature 参数化,
 * claw 的具名导出(useClawArtifacts / clawArtifactByIdUrl …)保留为默认实例(basePath='/user/claw'),
 * 调用点/组件零改动;boltslides 用 useBoltslidesArtifacts / boltslidesArtifact* 同款一套。
 */

import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { http, toApiError } from '@/shared/lib/http';
import { useAuthStore } from '@/stores/auth.store';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api/v1';

export interface ClawArtifact {
  /** agent_artifacts 行 id —— 仅「已落 MinIO」路径有值;前端见 id>0 即走 <base>/artifact/:id
   *  (预览/下载,二进制可用)。id 缺省 = storage 未启用的实时回退,回落老的 path 直读(只文本/图)。 */
  id?: number;
  /** 相对会话 cwd: 文件 out/xxx.md, 目录 out/proj; 实时回退下载时原样回传 */
  path: string;
  name: string;
  /** "file"=单文件直下; "dir"=整目录打包 zip 下载。缺省按 file 处理(向后兼容)。 */
  kind?: 'file' | 'dir';
  /** 真实 MIME(MinIO 路径才有);前端据此 + 扩展名挑预览渲染器。 */
  mime?: string;
  /** 字节数。 */
  size?: number;
  /** 来自 agent 的 out/manifest.json (可选); 卡片优先展示 title, 缺省回退文件名。 */
  title?: string;
  description?: string;
}

interface ArtifactsResponse {
  items: ClawArtifact[];
  total: number;
}

function unwrap<T>(raw: { data?: T } & Partial<T>): T {
  return (raw.data as T) ?? (raw as unknown as T);
}

/**
 * ArtifactBasePath —— 交付物端点前缀,决定走哪个 feature 的产物路由。
 * '/user/claw'(智能助手) | '/user/boltslides'(制作PPT)。默认 claw,保旧调用点不变。
 */
export type ArtifactBasePath = '/user/claw' | '/user/boltslides' | '/user/sci_draw';

/** feature 段(queryKey 根 + bytes key 命名空间):从 basePath 末段取(claw / boltslides / sci_draw)。 */
function featureOf(basePath: ArtifactBasePath): string {
  return basePath.slice('/user/'.length);
}

/** 列出会话交付目录 ./out 下 agent 产出的成品 (可下载/预览)。无产物返回空数组。 */
export function useAgentArtifacts(
  sessionId: string | null | undefined,
  basePath: ArtifactBasePath = '/user/claw',
): UseQueryResult<ClawArtifact[]> {
  const token = useAuthStore((s) => s.token);
  const feature = featureOf(basePath);
  return useQuery<ClawArtifact[]>({
    queryKey: [feature, 'artifacts', sessionId],
    enabled: !!token && !!sessionId,
    staleTime: 30 * 1000,
    queryFn: async () => {
      try {
        const url = `${basePath}/session/artifacts?session_id=${encodeURIComponent(sessionId as string)}`;
        const { data } = await http.get<
          { data?: ArtifactsResponse } & Partial<ArtifactsResponse>
        >(url);
        const payload = unwrap<ArtifactsResponse>(data);
        return payload?.items ?? [];
      } catch (err) {
        throw toApiError(err);
      }
    },
  });
}

/**
 * 构造产物的下载/预览 URL —— 直接给 <a href> / <img src> 用, 走 scholay_token cookie 鉴权。
 * download=true → 后端加 Content-Disposition: attachment 触发下载; 否则内联 (图片预览/文本读取)。
 */
export function agentArtifactUrl(
  sessionId: string,
  path: string,
  opts?: { download?: boolean; basePath?: ArtifactBasePath },
): string {
  const base = opts?.basePath ?? '/user/claw';
  const params = new URLSearchParams({ session_id: sessionId, path });
  if (opts?.download) params.set('download', '1');
  return `${API_BASE}${base}/session/artifact?${params.toString()}`;
}

/** 目录产物打包下载 URL —— 把 out/<dir> 整目录递归打包成 zip(走 cookie 鉴权, <a href> 直接用)。 */
export function agentArtifactZipUrl(
  sessionId: string,
  dir: string,
  basePath: ArtifactBasePath = '/user/claw',
): string {
  const params = new URLSearchParams({ session_id: sessionId, dir });
  return `${API_BASE}${basePath}/session/artifact.zip?${params.toString()}`;
}

/**
 * MinIO 交付物按 id 取的 URL —— 直接给 <img src> / <a download> / pdfjs / fetch 用。
 * 同源 cookie(scholay_token)鉴权;后端一律 Content-Disposition: attachment + nosniff。
 */
export function agentArtifactByIdUrl(
  id: number,
  basePath: ArtifactBasePath = '/user/claw',
): string {
  return `${API_BASE}${basePath}/artifact/${id}`;
}

/**
 * 取交付物原始字节(ArrayBuffer)—— 预览面板对「文本 / 表格 / docx / html」客户端渲染用。
 * 仅在面板打开且 id 存在时拉。
 */
export function useAgentArtifactBytes(
  id: number | null | undefined,
  enabled: boolean,
  basePath: ArtifactBasePath = '/user/claw',
): UseQueryResult<ArrayBuffer> {
  const feature = featureOf(basePath);
  return useQuery<ArrayBuffer>({
    queryKey: [feature, 'artifact-bytes', id],
    enabled: !!id && enabled,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    retry: 1,
    queryFn: async () => {
      try {
        const r = await http.get<ArrayBuffer>(`${basePath}/artifact/${id}`, {
          responseType: 'arraybuffer',
        });
        return r.data;
      } catch (err) {
        throw toApiError(err);
      }
    },
  });
}

// ─── claw 具名实例(默认 basePath='/user/claw')——— 保旧调用点/组件签名不变 ─────────────
export function useClawArtifacts(sessionId: string | null | undefined) {
  return useAgentArtifacts(sessionId, '/user/claw');
}
export function clawArtifactUrl(sessionId: string, path: string, opts?: { download?: boolean }): string {
  return agentArtifactUrl(sessionId, path, { ...opts, basePath: '/user/claw' });
}
export function clawArtifactZipUrl(sessionId: string, dir: string): string {
  return agentArtifactZipUrl(sessionId, dir, '/user/claw');
}
export function clawArtifactByIdUrl(id: number): string {
  return agentArtifactByIdUrl(id, '/user/claw');
}
export function useClawArtifactBytes(id: number | null | undefined, enabled: boolean) {
  return useAgentArtifactBytes(id, enabled, '/user/claw');
}

// ─── boltslides 具名实例(basePath='/user/boltslides')——— 制作PPT 复用 ────────────────
export function useBoltslidesArtifacts(sessionId: string | null | undefined) {
  return useAgentArtifacts(sessionId, '/user/boltslides');
}

// ─── sci_draw 具名实例(basePath='/user/sci_draw')——— 科研绘图 复用 ────────────────
export function useSciDrawArtifacts(sessionId: string | null | undefined) {
  return useAgentArtifacts(sessionId, '/user/sci_draw');
}
