import { useMemo, type ReactNode } from 'react';
import { Download, FileQuestion, Loader2, X } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { cn } from '@/shared/lib/utils';
import { MarkdownRenderer, ChatStyles } from '@/shared/components/chat';
import { PdfViewer } from '@/shared/components/PdfViewer';
import {
  clawArtifactByIdUrl,
  useClawArtifactBytes,
  type ClawArtifact,
} from '../../api/artifacts';
import {
  artifactCategory,
  artifactCodeLang,
  categoryNeedsBytes,
  type ArtifactCategory,
} from './artifact-format';
import { SpreadsheetPreview } from './SpreadsheetPreview';
import { DocxPreview } from './DocxPreview';

/**
 * 交付物预览面板 —— 按类型挑渲染器:图片 <img>、PDF pdfjs、md/txt/code/json 文本、
 * xlsx/csv 表格、docx mammoth;zip/目录/未知 → 只给下载。挂在 ClawPage 右侧(桌面分栏)
 * 或 Sheet(窄屏)。字节走 useClawArtifactBytes 拉(图片/PDF 走 URL 直读不拉)。
 */
export function ClawArtifactPreview({
  artifact,
  onClose,
  className,
  hideHeaderClose = false,
}: {
  artifact: ClawArtifact;
  onClose: () => void;
  className?: string;
  /** Sheet 模式:Sheet 自带右上角关闭 X,这里隐藏自己的 X 并给 header 右留位避免重叠。 */
  hideHeaderClose?: boolean;
}) {
  const category = artifactCategory(artifact);
  const id = artifact.id;
  const url = id ? clawArtifactByIdUrl(id) : null;
  const needsBytes = !!id && categoryNeedsBytes(category);
  const bytesQ = useClawArtifactBytes(id, needsBytes);

  return (
    <div className={cn('flex h-full min-h-0 flex-col bg-surface-1', className)}>
      <ChatStyles />
      <header
        className={cn(
          'flex h-12 shrink-0 items-center gap-2 border-b border-border bg-background px-3',
          hideHeaderClose && 'pr-10',
        )}
      >
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-foreground" title={artifact.title || artifact.name}>
            {artifact.title || artifact.name}
          </div>
          {(artifact.title || artifact.description) && (
            <div className="truncate text-2xs text-muted-foreground" title={artifact.description || artifact.name}>
              {artifact.description || artifact.name}
            </div>
          )}
        </div>
        {url && (
          <Button
            asChild
            size="sm"
            variant="ghost"
            className="h-7 shrink-0 gap-1 text-muted-foreground hover:text-foreground"
          >
            <a href={url} download={artifact.name}>
              <Download className="size-3.5" /> 下载
            </a>
          </Button>
        )}
        {!hideHeaderClose && (
          <Button
            size="icon"
            variant="ghost"
            className="size-7 shrink-0 text-muted-foreground hover:text-foreground"
            onClick={onClose}
            aria-label="关闭预览"
          >
            <X className="size-4" />
          </Button>
        )}
      </header>

      <div className="min-h-0 flex-1 overflow-hidden">
        <PreviewBody category={category} url={url} name={artifact.name} bytesQ={needsBytes ? bytesQ : null} />
      </div>
    </div>
  );
}

function PreviewBody({
  category,
  url,
  name,
  bytesQ,
}: {
  category: ArtifactCategory;
  url: string | null;
  name: string;
  bytesQ: ReturnType<typeof useClawArtifactBytes> | null;
}) {
  if (category === 'image' && url) {
    return (
      <div className="flex h-full items-center justify-center overflow-auto bg-surface-2 p-4">
        <img src={url} alt={name} className="max-h-full max-w-full object-contain" />
      </div>
    );
  }
  if (category === 'pdf' && url) {
    return <PdfViewer file={{ url, withCredentials: true }} className="h-full" />;
  }
  if (category === 'archive') {
    return <Unavailable text="压缩包 / 文件夹不支持预览,请下载查看。" downloadUrl={url} />;
  }
  if (category === 'unpreviewable' || !url) {
    return <Unavailable text="该文件类型暂不支持预览,请下载查看。" downloadUrl={url} />;
  }
  // 需要字节的:text / code / json / markdown / spreadsheet / docx
  if (!bytesQ) return null;
  if (bytesQ.isLoading) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> 加载中…
      </div>
    );
  }
  if (bytesQ.isError || !bytesQ.data) {
    return <Unavailable text="预览加载失败,请重试或下载查看。" downloadUrl={url} />;
  }
  return <BytesPreview category={category} name={name} bytes={bytesQ.data} />;
}

function BytesPreview({
  category,
  name,
  bytes,
}: {
  category: ArtifactCategory;
  name: string;
  bytes: ArrayBuffer;
}) {
  // text 类需解码;表格/docx 不解码(各自二进制解析)。useMemo 无条件先跑,守住 hook 顺序。
  const text = useMemo(() => {
    if (category === 'spreadsheet' || category === 'docx') return '';
    return new TextDecoder('utf-8').decode(new Uint8Array(bytes));
  }, [category, bytes]);

  if (category === 'spreadsheet') return <SpreadsheetPreview bytes={bytes} />;
  if (category === 'docx') return <DocxPreview bytes={bytes} />;

  if (category === 'markdown') {
    return (
      <div className="h-full overflow-auto px-4 py-3">
        <MarkdownRenderer text={text} />
      </div>
    );
  }
  if (category === 'json' || category === 'code') {
    const lang = category === 'json' ? 'json' : artifactCodeLang(name);
    const body = category === 'json' ? safePrettyJson(text) : text;
    const fenced = '```' + lang + '\n' + body + '\n```';
    return (
      <div className="h-full overflow-auto px-4 py-3">
        <MarkdownRenderer text={fenced} />
      </div>
    );
  }
  // 纯文本
  return (
    <pre className="h-full overflow-auto whitespace-pre-wrap break-words px-4 py-3 text-xs leading-relaxed text-subtle">
      {text}
    </pre>
  );
}

function Unavailable({ text, downloadUrl }: { text: string; downloadUrl: string | null }): ReactNode {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
      <div className="flex size-12 items-center justify-center rounded-pill bg-surface-2 text-faint">
        <FileQuestion className="size-6" />
      </div>
      <p className="max-w-xs text-sm text-muted-foreground">{text}</p>
      {downloadUrl && (
        <Button asChild size="sm" variant="outline">
          <a href={downloadUrl} download>
            <Download className="size-3.5" /> 下载
          </a>
        </Button>
      )}
    </div>
  );
}

function safePrettyJson(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}
