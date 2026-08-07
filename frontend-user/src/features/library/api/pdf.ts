import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AxiosProgressEvent } from 'axios';
import { http, toApiError } from '@/shared/lib/http';
import { invalidateLibrary } from '@/shared/lib/library-invalidation';
import type { UserLibraryPaper } from '@/shared/api/types';

/**
 * 文件夹 · 用户上传 PDF
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

/** 与后端 maxPDFSize 保持一致(handler_pdf.go 的 maxPDFSize / middleware.UploadMaxBodySize) */
export const MAX_PDF_SIZE = 50 * 1024 * 1024;

/**
 * 前端实际用的上传上限 —— 比 MAX_PDF_SIZE 少 4KB。
 *
 * 🔴 别把这 4KB 当"保守"删掉。nginx 的 client_max_body_size 卡的是**整个 multipart 请求体**
 * (boundary + 每个 part 的 Content-Disposition 头 + 文件名 + 文件本体),而这里能拿到的
 * `file.size` 是**裸文件字节数**。两者口径不同 ⇒ 文件体积落在
 * (MAX_PDF_SIZE − overhead, MAX_PDF_SIZE] 这条约 200 字节宽的缝里时,
 * 前端判"没超"放行 → nginx 判"超了"拒绝,而且返回的是 **text/html 错误页**,
 * 前端解不出 message,只能显示裸状态码。留出余量让这类文件在本地就被友好拦下。
 */
export const MAX_PDF_UPLOAD_BYTES = MAX_PDF_SIZE - 4096;

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
      // 二道兜底 —— 正经的预检在 components/shared/validate-pdf.ts 的 checkPdfFile
      // (含 magic bytes),这里只防"绕过 UI 直接调 hook"。判据必须与那边同一个常量,
      // 两处阈值不一致会造出"预检说行、发出去被拒"的假象。
      if (file.size > MAX_PDF_UPLOAD_BYTES) {
        throw new Error(
          `文件过大(${formatSize(file.size)}),上限 ${formatSize(MAX_PDF_UPLOAD_BYTES)}`
        );
      }
      const lower = file.name.trim().toLowerCase();
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
            // 🔴 这是**整个请求**的总超时(含上传耗时),不是"无响应超时"。
            // 原值 60s ⇒ 上行 3 Mbps 时天花板只有 ~22MB、1 Mbps 时只有 ~7.5MB,
            // 远低于我们对外宣称的 50MB —— 合法文件在慢网下确定性失败,且失败后
            // 前端只显示"上传失败"(排查 2026-08-07)。改为与后端对齐的 10 分钟:
            // timeout.go 的 isObjectServePath 给 `/pdf` 结尾的路由就是 10min。
            // 不设 0(永不超时)是因为真挂死时用户会一直转圈,没有任何反馈。
            timeout: 600_000,
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
      invalidateLibrary(qc);
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
      invalidateLibrary(qc);
    },
  });
}

/** 下载 / 预览 URL —— 走 backend 转发(私有 bucket,鉴权在 backend) */
export function paperPdfUrl(paperId: number): string {
  return `/api/v1/user/library/papers/${paperId}/pdf`;
}

// `openMyPdfInNewTab` 已下线 —— 之前用 blob+window.open 在原生新标签查看 PDF,
// 现在统一走 useOpenPdfInBrowser 在浏览器视图内单开 /browser/pdf/:id pdf tab。
// 入口:文件夹内论文行的"查看 PDF"按钮 + 论文详情页 ActionRow 的"查看 PDF"。

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
