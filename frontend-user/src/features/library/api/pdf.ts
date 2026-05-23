import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AxiosProgressEvent } from 'axios';
import { http, toApiError } from '@/shared/lib/http';
import type { UserLibraryPaper } from '@/shared/api/types';

/**
 * 文献集 · 用户上传 PDF
 *
 * 上游接口:
 *   POST   /user/library/papers/:id/pdf   multipart/form-data,field=file
 *   GET    /user/library/papers/:id/pdf   backend stream(下载/预览)
 *   DELETE /user/library/papers/:id/pdf   清理元数据 + 异步删 MinIO 对象
 *
 * 大小上限 50 MiB,Content-Type 必须 application/pdf,服务端会再做 magic bytes 校验。
 *
 * 成功后 invalidate ['library'] 触发列表 + check 缓存刷新,文件名 / 上传时间
 * 立即可见(不需手动 setQueryData)。
 */

/** 与后端 maxPDFSize 保持一致 —— 前端先拦一道,避免无意义的 50MB+ 上传 */
export const MAX_PDF_SIZE = 50 * 1024 * 1024;

export interface UploadPdfVars {
  paperId: number;
  file: File;
  /** 上传进度回调(0-100),用于 UI 进度条 */
  onProgress?: (percent: number) => void;
  /**
   * 可选 AbortSignal —— 调用方拿一个 AbortController 把 .signal 传进来,
   * 关闭弹窗 / 点击"终止"时 controller.abort() 即可立即中断上传请求。
   * 中断后 mutation 会 reject Error('upload-cancelled')。
   */
  signal?: AbortSignal;
}

/** 用户主动取消时抛出的 sentinel —— 调用方用 message 判,不弹 toast */
export const UPLOAD_CANCELLED = 'upload-cancelled';

export function useUploadPaperPdf() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      paperId,
      file,
      onProgress,
      signal,
    }: UploadPdfVars): Promise<UserLibraryPaper> => {
      // 前置校验 —— 后端会再做 magic bytes 校验,这里只是减少无效请求
      if (file.size > MAX_PDF_SIZE) {
        throw new Error(
          `文件过大(${formatSize(file.size)}),上限 ${MAX_PDF_SIZE / 1024 / 1024} MB`
        );
      }
      const lower = file.name.toLowerCase();
      if (!lower.endsWith('.pdf')) {
        throw new Error('只支持 .pdf 文件');
      }

      const form = new FormData();
      form.append('file', file);

      try {
        const { data } = await http.post<{ data: UserLibraryPaper }>(
          `/user/library/papers/${paperId}/pdf`,
          form,
          {
            // 让 axios 自动带 boundary,不要手动设 Content-Type:multipart/form-data
            headers: { 'Content-Type': 'multipart/form-data' },
            timeout: 60_000,
            signal,
            onUploadProgress: (e: AxiosProgressEvent) => {
              if (!onProgress || !e.total) return;
              const percent = Math.round((e.loaded / e.total) * 100);
              onProgress(Math.min(percent, 99));
              // 上传完到 99,实际 100 由 mutationFn resolve 时再触发
            },
          }
        );
        onProgress?.(100);
        return data.data;
      } catch (err) {
        // axios.isCancel 在 v1 里映射成 CanceledError / AbortError
        if ((err as { code?: string })?.code === 'ERR_CANCELED') {
          throw new Error(UPLOAD_CANCELLED);
        }
        throw toApiError(err);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['library'] });
    },
  });
}

export function useDeletePaperPdf() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (paperId: number) => {
      try {
        await http.delete(`/user/library/papers/${paperId}/pdf`);
      } catch (err) {
        throw toApiError(err);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['library'] });
    },
  });
}

/** 下载 / 预览 URL —— 走 backend 转发(私有 bucket,鉴权在 backend) */
export function paperPdfUrl(paperId: number): string {
  return `/api/v1/user/library/papers/${paperId}/pdf`;
}

// `openMyPdfInNewTab` 已下线 —— 之前用 blob+window.open 在原生新标签查看 PDF,
// 现在统一走 useOpenPdfInBrowser 在浏览器视图内单开 /browser/pdf/:id pdf tab。
// 入口:文献集行的"查看 PDF"按钮 + 论文详情页 ActionRow 的"查看 PDF"。

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
