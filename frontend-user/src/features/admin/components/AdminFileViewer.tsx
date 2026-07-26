import { useEffect, useState } from 'react';
import { Download, FileWarning, Loader2 } from 'lucide-react';
import { http } from '@/shared/lib/http';
import { MarkdownRenderer } from '@/shared/components/chat';

/**
 * 管理端文件内联预览器 —— 会话监控 / 审稿监控里「用户上传的文件、稿件、引用文档」共用。
 *
 * 关键:后台文件端点走 AdminAuthMiddleware,直接把 URL 塞进 <img>/<iframe> 不带 Authorization 头会 401。
 * 故一律先用带鉴权的 http 实例把文件**取成 blob → object URL**,再喂给 <img>/<iframe>/<a>:
 *   - 同源 blob: URL 无需鉴权,浏览器原生渲染 PDF/图片;
 *   - 绕开服务端 Content-Disposition 差异(blob 一定内联)。
 * 按 mime/扩展名分流:图片 / PDF(iframe 原生)/ markdown(渲染)/ 纯文本(pre)/ 其余(仅下载)。
 */

/**
 * 带鉴权直接下载后台文件 —— <a href> 直连后台端点不带 Authorization 头会 401,
 * 故先用 http 取 blob 再用程序化 anchor 触发下载。
 */
export async function downloadAdminFile(src: string, filename: string): Promise<void> {
  const res = await http.get(src, { responseType: 'blob' });
  const url = URL.createObjectURL(res.data as Blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

type Kind = 'image' | 'pdf' | 'markdown' | 'text' | 'other';

const TEXT_EXTS = ['txt', 'tex', 'bib', 'csv', 'json', 'log', 'xml', 'html', 'yaml', 'yml', 'bbl', 'cls', 'sty', 'md', 'markdown'];

function kindOf(mime: string, filename: string): Kind {
  const m = (mime || '').toLowerCase();
  const ext = (filename.toLowerCase().split('.').pop() ?? '').trim();
  if (m.startsWith('image/')) return 'image';
  if (m === 'application/pdf' || ext === 'pdf') return 'pdf';
  if (ext === 'md' || ext === 'markdown') return 'markdown';
  // 严格文本判定:只认 text/*、application/json、application/xml、text/xml、tex,及已知文本后缀。
  // 绝不能用 m.includes('xml') —— OOXML(docx/xlsx/pptx)的 mime 含 "openxmlformats" 会被误判成文本,
  // 导致 blob.text() 把二进制当文本输出乱码。office 文档落到 'other' 走「仅下载」。
  const isTextMime =
    m.startsWith('text/') ||
    m === 'application/json' ||
    m === 'application/xml' ||
    m === 'text/xml' ||
    m === 'application/x-tex';
  if (isTextMime || TEXT_EXTS.includes(ext)) return 'text';
  return 'other';
}

interface State {
  loading: boolean;
  url?: string;
  text?: string;
  error?: string;
  kind?: Kind;
}

export function AdminFileViewer({
  src,
  mime,
  filename,
}: {
  /** 相对 API 路径(经 http 实例带鉴权取 blob),如 /admin/peer-review/submissions/1/assets/2 */
  src: string;
  /** 已知 mime(审稿附件有);对话上传文件 mime 未知时传 '',落到 blob.type / 文件名后缀推断。 */
  mime: string;
  filename: string;
}) {
  const [state, setState] = useState<State>({ loading: true });

  useEffect(() => {
    let objectUrl: string | undefined;
    let cancelled = false;
    setState({ loading: true });
    http
      .get(src, { responseType: 'blob' })
      .then(async (res) => {
        if (cancelled) return;
        const blob = res.data as Blob;
        objectUrl = URL.createObjectURL(blob);
        // mime 未知时用服务端回的 blob.type 兜底,再退到文件名后缀。
        const kind = kindOf(mime || blob.type || '', filename);
        if (kind === 'text' || kind === 'markdown') {
          const text = await blob.text();
          if (!cancelled) setState({ loading: false, url: objectUrl, text, kind });
        } else if (!cancelled) {
          setState({ loading: false, url: objectUrl, kind });
        }
      })
      .catch(async (e) => {
        if (cancelled) return;
        // responseType:blob 时错误响应体也是 Blob,需读出来才拿得到后端的中文 {message}
        // (太大 / 已清理 / 附件不存在 等),否则只会显示 axios 的英文「Request failed with status code…」。
        let msg = e?.message || '加载失败';
        const body = e?.response?.data;
        if (body instanceof Blob) {
          try {
            const j = JSON.parse(await body.text());
            if (j?.message) msg = j.message;
          } catch {
            /* 非 JSON 响应体,保留原始 msg */
          }
        }
        if (!cancelled) setState({ loading: false, error: msg });
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [src, mime, filename]);

  const kind = state.kind ?? 'other';

  if (state.loading) {
    return (
      <div className="flex flex-col items-center gap-2 py-10 text-12 text-faint">
        <Loader2 className="size-5 animate-spin" />
        加载文件中…
      </div>
    );
  }
  if (state.error || !state.url) {
    return (
      <div className="flex flex-col items-center gap-1 py-8 text-center text-12 text-brand-red">
        <FileWarning className="size-5" />
        <span>加载失败:{state.error || '文件不可读'}</span>
      </div>
    );
  }

  return (
    <div className="min-w-0">
      <div className="mb-2 flex items-center justify-end">
        {/* 下载走已加载的 blob object URL,即时且同步提交,安全。
            不提供「新标签打开」——顶层导航到 blob: 会以后台源执行 html/svg 脚本(XSS),且 URL 卸载即失效。 */}
        <a
          href={state.url}
          download={filename}
          className="inline-flex items-center gap-1 text-12 text-muted-foreground hover:text-foreground"
        >
          <Download className="size-3.5" /> 下载
        </a>
      </div>

      {kind === 'image' && (
        <img src={state.url} alt={filename} className="mx-auto max-h-[68vh] rounded-12 border border-border object-contain" />
      )}
      {kind === 'pdf' && (
        <iframe src={state.url} title={filename} className="h-[68vh] w-full rounded-12 border border-border" />
      )}
      {kind === 'markdown' && (
        <div className="max-h-[68vh] overflow-auto rounded-12 border border-border bg-surface-1 p-3 text-12 text-subtle">
          <MarkdownRenderer text={state.text ?? ''} />
        </div>
      )}
      {kind === 'text' && (
        <pre className="max-h-[68vh] overflow-auto whitespace-pre-wrap break-words rounded-12 border border-border bg-surface-1 p-3 text-12 text-subtle">
          {state.text}
        </pre>
      )}
      {kind === 'other' && (
        <div className="flex flex-col items-center gap-2 py-8 text-center text-12 text-faint">
          <FileWarning className="size-5" />
          <span>此类型({mime || '未知'})不支持内联预览,请下载查看。</span>
        </div>
      )}
    </div>
  );
}
