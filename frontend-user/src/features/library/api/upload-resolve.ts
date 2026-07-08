import { useMutation, useQueryClient } from '@tanstack/react-query';
import { http, toApiError } from '@/shared/lib/http';
import { invalidateLibrary } from '@/shared/lib/library-invalidation';
import { streamSsePost } from '@/shared/lib/sse-post';
import type { PaperSource, UserLibraryPaper } from '@/shared/api/types';

/**
 * 文献集 · 上传 PDF 智能识别 —— SSE 流式 + 同步 confirm 两段式。
 *
 * 流式协议(后端 handler_upload_resolve.go 推):
 *   event: parsed   { title, abstract, sha256, has_text }
 *   event: searched { papers: SearchHit[] }    // title 非空才推
 *   event: ready    { job_id }                 // 末尾
 *   event: error    { message }
 *
 * 然后调用 confirm:
 *   POST /user/library/papers/confirm-upload-job
 *   { job_id, decision: 'link' | 'free', link?: SearchHit }
 *
 * → 200 { paper: UserLibraryPaper, merged: bool }
 */

const UPLOAD_RESOLVE_PATH = '/user/library/papers/upload-and-resolve';

// ----------------------------------------------------------------------------
// 类型
// ----------------------------------------------------------------------------

export interface ParsedEvent {
  title: string;
  abstract: string;
  sha256: string;
  has_text: boolean;
  /** 从 PDF 全文里抽出的 DOI(Zotero 同款 regex);为空说明没找到 */
  extracted_doi?: string;
  /** 从 PDF 全文里抽出的 arXiv ID(新版 YYMM.NNNNN 格式);为空说明没找到 */
  arxiv_id?: string;
  /** 从首页 heuristic 抽出的作者列表(可能为空) */
  authors?: string[];
  /** 4 位发表年份;0 表示没抽到 */
  year?: number;
  /** 期刊 / 会议名(从页眉 / 页脚 / 引用块 heuristic 抽);为空说明没抽到 */
  venue?: string;
}

/**
 * 候选匹配类型(置信度由强到弱)——mirrors backend/internal/library/import_helpers.go
 * MatchType* 常量。前端据此展示置信度,不再盲信第一条。
 */
export type MatchType = 'doi' | 'title_match' | 'search';

export interface SearchHit {
  source: PaperSource;
  source_paper_id: string;
  title: string;
  abstract?: string;
  year?: number;
  venue?: string;
  doi?: string;
  citation_count?: number;
  pdf_url?: string;
  /** 候选怎么来的:doi 精确 / 标题精确 / 模糊搜索 */
  match_type?: MatchType;
  /** 与 PDF 抽取标题的相似度 [0,1](DOI 精确命中固定 1.0) */
  match_score?: number;
  already_saved?: boolean;
  already_paper_id?: number;
  authors?: unknown;
  raw?: unknown;
}

export type UploadResolveEvent =
  | { type: 'parsed'; payload: ParsedEvent }
  | { type: 'searched'; payload: { papers: SearchHit[] } }
  | { type: 'ready'; payload: { job_id: string } }
  | { type: 'error'; payload: { message: string } };

// ----------------------------------------------------------------------------
// SSE 调用 —— 复用 shared/lib/sse-post 通用 POST+SSE 工具
// ----------------------------------------------------------------------------

export interface UploadResolveOptions {
  file: File;
  /** 每收到一个事件触发一次,前端按 type 分发到 wizard state */
  onEvent: (e: UploadResolveEvent) => void;
  signal?: AbortSignal;
}

/**
 * 上传 PDF + 阶段事件流。Promise 在收到 ready 后 resolve;收到 error 事件 reject。
 */
export async function uploadAndResolveStream({
  file,
  onEvent,
  signal,
}: UploadResolveOptions): Promise<string /* jobId */> {
  const form = new FormData();
  form.append('file', file);

  let jobId: string | null = null;
  let sawError: string | null = null;

  await streamSsePost({
    url: UPLOAD_RESOLVE_PATH,
    body: form,
    signal,
    onEvent: ({ event, data }) => {
      let payload: unknown;
      try {
        payload = JSON.parse(data);
      } catch {
        return;
      }

      switch (event) {
        case 'parsed':
          onEvent({ type: 'parsed', payload: payload as ParsedEvent });
          break;
        case 'searched':
          onEvent({
            type: 'searched',
            payload: payload as { papers: SearchHit[] },
          });
          break;
        case 'ready': {
          const p = payload as { job_id: string };
          jobId = p.job_id;
          onEvent({ type: 'ready', payload: p });
          break;
        }
        case 'error': {
          const p = payload as { message: string };
          sawError = p.message || '解析失败';
          onEvent({ type: 'error', payload: p });
          break;
        }
        default:
          // 未知事件 —— 静默忽略以便后端可加新事件不破坏前端
          break;
      }
    },
  });

  if (sawError) throw new Error(sawError);
  if (!jobId) throw new Error('未收到任务 ID');
  return jobId;
}

// ----------------------------------------------------------------------------
// Confirm —— 把用户决策落库
// ----------------------------------------------------------------------------

export interface ConfirmLink {
  source: PaperSource;
  source_paper_id: string;
  title?: string;
  abstract?: string;
  year?: number;
  venue?: string;
  doi?: string;
  citation_count?: number;
  pdf_url?: string;
  authors?: unknown;
  raw?: unknown;
}

export interface ConfirmUploadJobVars {
  jobId: string;
  decision: 'link' | 'free';
  link?: ConfirmLink;
  folderId?: number | null;
}

export interface ConfirmUploadJobResult {
  paper: UserLibraryPaper;
  merged: boolean;
}

export function useConfirmUploadJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      jobId,
      decision,
      link,
      folderId,
    }: ConfirmUploadJobVars): Promise<ConfirmUploadJobResult> => {
      try {
        const { data } = await http.post<{ data: ConfirmUploadJobResult }>(
          '/user/library/papers/confirm-upload-job',
          {
            job_id: jobId,
            decision,
            link,
            folder_id: folderId ?? undefined,
          }
        );
        return data.data;
      } catch (err) {
        throw toApiError(err);
      }
    },
    onSuccess: () => {
      invalidateLibrary(qc);
    },
  });
}
