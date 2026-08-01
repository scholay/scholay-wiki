import { MAX_PDF_SIZE, formatPdfSize } from '@/shared/lib/validate-pdf-file';

/**
 * 上传前文件校验 —— 后端有 magic bytes 二次校验,前端只拦"明显不对"的输入,
 * 防止无谓的大文件上传。
 */
export function validateFile(
  f: File,
  setError: (msg: string) => void
): boolean {
  const msg = (() => {
    const lower = f.name.toLowerCase();
    if (!lower.endsWith('.pdf')) return '只支持 .pdf 文件';
    if (f.size === 0) return '文件为空';
    if (f.size > MAX_PDF_SIZE) {
      return `文件过大(${formatPdfSize(f.size)}),上限 ${MAX_PDF_SIZE / 1024 / 1024} MB`;
    }
    return null;
  })();
  if (msg) {
    setError(msg);
    return false;
  }
  return true;
}
