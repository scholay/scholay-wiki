/**
 * 文献集 · PDF 上传/删除 —— upload re-export 自 shared,delete 仍在本文件。
 * 跨 feature 上传请 import `@/shared/api/paper-pdf-upload`。
 */
export {
  MAX_PDF_SIZE,
  UPLOAD_CANCELLED,
  formatSize,
  useUploadPaperPdf,
  type UploadPdfVars,
} from '@/shared/api/paper-pdf-upload';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { http, toApiError } from '@/shared/lib/http';
import { invalidateLibrary } from '@/shared/lib/library-invalidation';

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
