import { useLibraryPaperByUpstream } from '@/shared/api/user-library-papers';
import {
  libraryRowHasUploadedPdf,
  paperHasOaPdf,
  paperHasReadablePdf,
} from '@/shared/lib/paper-pdf';
import type { Paper } from '@/shared/api/types';

/** 判定论文是否已有可读 PDF(OA 或文献集上传) */
export function usePaperReadablePdf(paper: Paper | null | undefined) {
  const libQ = useLibraryPaperByUpstream(paper?.source, paper?.paperId);
  const libRow = libQ.data ?? null;
  const hasOa = paperHasOaPdf(paper);
  const hasUpload = libraryRowHasUploadedPdf(libRow);

  return {
    hasPdf: paperHasReadablePdf(paper, libRow),
    hasOa,
    hasUpload,
    libRow,
    isLoading: libQ.isLoading,
    isFetching: libQ.isFetching,
  };
}
