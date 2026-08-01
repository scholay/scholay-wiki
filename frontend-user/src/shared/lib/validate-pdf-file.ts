/** 与后端 maxPDFSize 保持一致 —— 前端先拦一道 */
export const MAX_PDF_SIZE = 50 * 1024 * 1024;

export function formatPdfSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function validatePdfFile(f: File): string | null {
  const lower = f.name.toLowerCase();
  if (!lower.endsWith('.pdf')) return '只支持 .pdf 文件';
  if (f.size === 0) return '文件为空';
  if (f.size > MAX_PDF_SIZE) {
    return `文件过大(${formatPdfSize(f.size)}),上限 ${MAX_PDF_SIZE / 1024 / 1024} MB`;
  }
  return null;
}
