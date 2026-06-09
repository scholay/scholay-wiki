/**
 * 智能助手 — 成果交付 (artifacts) 的 react-query hook + URL 构造。
 *
 * agent 把要交给用户的成品写进会话 ./out 目录, 后端 GET /claw/session/artifacts 列出来,
 * GET /claw/session/artifact 下载/预览单个。生命周期 = 会话生命周期 (会话删/重置即清)。
 * ClawPage 在每轮 message_complete 后 invalidate ['claw','artifacts'] 让列表刷新。
 */

import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { http, toApiError } from '@/shared/lib/http';
import { useAuthStore } from '@/stores/auth.store';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api/v1';

export interface ClawArtifact {
  /** 相对会话 cwd: 文件 out/xxx.md, 目录 out/proj; 下载/打包时原样回传 */
  path: string;
  name: string;
  /** "file"=单文件直下; "dir"=整目录打包 zip 下载。缺省按 file 处理(向后兼容)。 */
  kind?: 'file' | 'dir';
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

/** 列出会话交付目录 ./out 下 agent 产出的成品 (可下载/预览)。无产物返回空数组。 */
export function useClawArtifacts(
  sessionId: string | null | undefined,
): UseQueryResult<ClawArtifact[]> {
  const token = useAuthStore((s) => s.token);
  return useQuery<ClawArtifact[]>({
    queryKey: ['claw', 'artifacts', sessionId],
    enabled: !!token && !!sessionId,
    staleTime: 30 * 1000,
    queryFn: async () => {
      try {
        const url = `/user/claw/session/artifacts?session_id=${encodeURIComponent(sessionId as string)}`;
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
 * 构造产物的下载/预览 URL —— 直接给 <a href> / <img src> 用, 走 scholay_token cookie 鉴权
 * (跟历史图片代理 /claw/session/file 同款, 标签发不了 Bearer header)。
 * download=true → 后端加 Content-Disposition: attachment 触发下载; 否则内联 (图片预览/文本读取)。
 */
export function clawArtifactUrl(
  sessionId: string,
  path: string,
  opts?: { download?: boolean },
): string {
  const params = new URLSearchParams({ session_id: sessionId, path });
  if (opts?.download) params.set('download', '1');
  return `${API_BASE}/user/claw/session/artifact?${params.toString()}`;
}

/** 目录产物打包下载 URL —— 把 out/<dir> 整目录递归打包成 zip(走 cookie 鉴权, <a href> 直接用)。 */
export function clawArtifactZipUrl(sessionId: string, dir: string): string {
  const params = new URLSearchParams({ session_id: sessionId, dir });
  return `${API_BASE}/user/claw/session/artifact.zip?${params.toString()}`;
}
