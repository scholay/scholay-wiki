import type { Paper, UserLibraryPaper } from '@/shared/api/types';

/** 上游 / OA 直链是否可用(不含用户上传) */
export function paperHasOaPdf(paper: Paper | null | undefined): boolean {
  return Boolean(paper?.openAccessPdf?.url?.trim());
}

/** 文献集行是否已有用户上传 PDF */
export function libraryRowHasUploadedPdf(
  row: UserLibraryPaper | null | undefined,
): boolean {
  if (!row) return false;
  return Boolean(row.pdf_uploaded_at || (row.pdf_sha256 ?? '').trim());
}

/** PDF Chat / 全文阅读是否已有可读 PDF(OA 或用户上传) */
export function paperHasReadablePdf(
  paper: Paper | null | undefined,
  libRow?: UserLibraryPaper | null,
): boolean {
  return paperHasOaPdf(paper) || libraryRowHasUploadedPdf(libRow);
}
