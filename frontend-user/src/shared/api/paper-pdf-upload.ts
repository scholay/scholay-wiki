import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AxiosProgressEvent } from 'axios';
import { http, toApiError } from '@/shared/lib/http';
import { invalidateLibrary } from '@/shared/lib/library-invalidation';
import { MAX_PDF_SIZE, formatPdfSize } from '@/shared/lib/validate-pdf-file';
import type { UserLibraryPaper } from '@/shared/api/types';

export { MAX_PDF_SIZE, formatPdfSize as formatSize };

export interface UploadPdfVars {
  paperId: number;
  file: File;
  onProgress?: (percent: number) => void;
  signal?: AbortSignal;
}

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
      if (file.size > MAX_PDF_SIZE) {
        throw new Error(
          `文件过大(${formatPdfSize(file.size)}),上限 ${MAX_PDF_SIZE / 1024 / 1024} MB`,
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
            headers: { 'Content-Type': 'multipart/form-data' },
            timeout: 60_000,
            signal,
            onUploadProgress: (e: AxiosProgressEvent) => {
              if (!onProgress || !e.total) return;
              const percent = Math.round((e.loaded / e.total) * 100);
              onProgress(Math.min(percent, 99));
            },
          },
        );
        onProgress?.(100);
        return data.data;
      } catch (err) {
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
