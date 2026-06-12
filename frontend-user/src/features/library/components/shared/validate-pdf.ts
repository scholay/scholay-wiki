import { MAX_PDF_SIZE, formatSize } from '../../api/pdf';

/**
 * 上传前文件校验 —— 后端有 magic bytes 二次校验,前端只拦"明显不对"的输入,
 * 防止无谓的大文件上传。
 */
export function validateFile(
  f: File,
  setError: (msg: string) => void
): boolean {
  const lower = f.name.toLowerCase();
  if (!lower.endsWith('.pdf')) {
    setError('只支持 .pdf 文件');
    return false;
  }
  if (f.size === 0) {
    setError('文件为空');
    return false;
  }
  if (f.size > MAX_PDF_SIZE) {
    setError(
      `文件过大(${formatSize(f.size)}),上限 ${MAX_PDF_SIZE / 1024 / 1024} MB`
    );
    return false;
  }
  return true;
}
