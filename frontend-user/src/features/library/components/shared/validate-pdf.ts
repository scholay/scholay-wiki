import { MAX_PDF_UPLOAD_BYTES, formatSize } from '../../api/pdf';

/**
 * 上传前文件校验 —— 在**本地**把可预期的问题拦下来,以可行动的提示告知用户,
 * 而不是让它变成一次失败的网络请求(用户只会看到「上传失败」)。
 *
 * 设计要点(2026-08-07 上传报错排查后重写):
 *
 *  1. **magic bytes 本地预读**。后端 handler_pdf.go / handler_upload_resolve.go 都会验
 *     `%PDF-` 首部,但那是「整份文件传完之后」才拒 —— 一个 30MB 的改名 .docx 要白传 30MB
 *     才换来一句报错。`File.slice(0,5)` 只读前 5 字节,零成本。
 *
 *  2. **体积阈值预留 multipart 开销**。nginx 的 client_max_body_size 卡的是**整个请求体**
 *     (boundary + Content-Disposition + 文件名 + 文件),而这里拿到的 `f.size` 是**裸文件**。
 *     两者口径不同 ⇒ 恰好落在差值区间的文件会被前端放行、被 nginx 以 **HTML 413** 拒,
 *     前端拿不到 JSON、只能显示裸状态码。用 MAX_PDF_UPLOAD_BYTES(已扣除余量)彻底消除这条缝。
 *
 *  3. **文件名过长只警告不拦**。后端 pdf_original_filename 是 varchar(255),超长会被
 *     truncateRunes 安全截断(不再 500),所以这不是错误 —— 但用户有权知道存下来的名字变了。
 *
 * 返回结构化结果而不是直接 setError:调用方要能区分「拦住(error)」与「放行但提醒(warn)」。
 */

/** 文件名 rune 数超过这个值,后端会截断 —— 与 handler_upload_resolve.go 的 origFilenameMaxRunes(250) 对齐 */
const FILENAME_WARN_RUNES = 250;

export type PdfCheck =
  /** 放行。warning 非空时表示「可以传,但有事要告诉用户」 */
  | { ok: true; warning?: string }
  /** 拦下。message 是给用户看的主文案,hint 是可选的下一步建议 */
  | { ok: false; message: string; hint?: string };

export async function checkPdfFile(f: File): Promise<PdfCheck> {
  const name = f.name.trim();
  if (!name.toLowerCase().endsWith('.pdf')) {
    return {
      ok: false,
      message: `这不是 PDF 文件(${f.name})`,
      hint: '请选择 .pdf 结尾的文件',
    };
  }
  if (f.size === 0) {
    return {
      ok: false,
      message: '文件为空',
      hint: '可能是云盘同步中的占位文件,请先下载到本地再上传',
    };
  }
  if (f.size > MAX_PDF_UPLOAD_BYTES) {
    return {
      ok: false,
      message: `文件过大(${formatSize(f.size)}),上限 ${formatSize(MAX_PDF_UPLOAD_BYTES)}`,
      hint: '可以先用 PDF 压缩工具减小体积,或只上传需要的章节',
    };
  }

  // magic bytes —— 读前 5 字节即可,不会把整个文件读进内存
  let head: Uint8Array;
  try {
    head = new Uint8Array(await f.slice(0, 5).arrayBuffer());
  } catch {
    // 读不出来通常是文件在选中后被移动/删除,或云盘占位文件未下载
    return {
      ok: false,
      message: '读取文件失败',
      hint: '文件可能已被移动或删除,请重新选择',
    };
  }
  if (String.fromCharCode(...head) !== '%PDF-') {
    return {
      ok: false,
      message: '这个文件不是 PDF',
      hint: '可能只是改了扩展名,或文件已损坏。请用阅读器打开确认后重试',
    };
  }

  // 放行,但文件名会被截断 → 提前告知(不拦)
  if ([...name].length > FILENAME_WARN_RUNES) {
    return { ok: true, warning: '文件名过长,保存时会自动截短(不影响文件内容)' };
  }
  return { ok: true };
}

/**
 * 把一条 failed check 拍成错误条要显示的单行文案。
 * 抽出来是因为两个上传入口(PdfPanel / PdfUploadTab)的错误条都只吃 string,
 * 各自拼一次迟早会拼得不一样。
 */
export function pdfCheckErrorText(check: Extract<PdfCheck, { ok: false }>): string {
  return check.hint ? `${check.message} —— ${check.hint}` : check.message;
}
