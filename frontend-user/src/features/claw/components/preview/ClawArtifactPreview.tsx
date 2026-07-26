import { lazy, Suspense, useMemo, useState, type ReactNode } from 'react';
import { Code2, Download, Eye, FileDown, FileQuestion, Loader2, Presentation, X } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { cn } from '@/shared/lib/utils';
import { MarkdownRenderer, ChatStyles, SafeSvg } from '@/shared/components/chat';
import {
  agentArtifactByIdUrl,
  useAgentArtifactBytes,
  type ArtifactBasePath,
  type ClawArtifact,
} from '../../api/artifacts';
import {
  artifactCategory,
  artifactCodeLang,
  categoryNeedsBytes,
  type ArtifactCategory,
} from './artifact-format';
import { DocxPreview } from './DocxPreview';
import { parseFigureSpec } from '../figure/figure-spec';

// react-pdf + pdfjs-dist(~几百 KB)与 xlsx(~250KB gzip)只在用户真正预览 PDF / 表格
// 交付物时才需要 —— lazy 化, 别让它们静态进 Claw 路由的入口 chunk(与 BrowserPage 同款处理,
// 大多数会话从不打开这两类交付物)。DocxPreview 内部已动态 import mammoth, 无需在此再切。
const PdfViewer = lazy(() =>
  import('@/shared/components/PdfViewer').then((m) => ({ default: m.PdfViewer })),
);
const SpreadsheetPreview = lazy(() =>
  import('./SpreadsheetPreview').then((m) => ({ default: m.SpreadsheetPreview })),
);
// 细胞图配方渲染器(compose.ts + elkjs + 图标包)只在真预览 *.fig.json 时才拉 → lazy。
const FigureView = lazy(() =>
  import('../figure/FigureView').then((m) => ({ default: m.FigureView })),
);

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
  basePath = '/user/claw',
  onExportDeck,
  exportingFormat = null,
}: {
  artifact: ClawArtifact;
  onClose: () => void;
  className?: string;
  /** Sheet 模式:Sheet 自带右上角关闭 X,这里隐藏自己的 X 并给 header 右留位避免重叠。 */
  hideHeaderClose?: boolean;
  /** 交付物端点前缀:'/user/claw'(智能助手) | '/user/boltslides'(制作PPT)。默认 claw。 */
  basePath?: ArtifactBasePath;
  /** 制作PPT:对 html 演示稿显示「导出 PDF / 导出 PPT」两个按钮(pdf=矢量,pptx=图片版)。 */
  onExportDeck?: (format: 'pptx' | 'pptx-native' | 'pdf') => void;
  exportingFormat?: 'pptx' | 'pptx-native' | 'pdf' | null;
}) {
  const category = artifactCategory(artifact);
  const id = artifact.id;
  const url = id ? agentArtifactByIdUrl(id, basePath) : null;
  const needsBytes = !!id && categoryNeedsBytes(category);
  const bytesQ = useAgentArtifactBytes(id, needsBytes, basePath);

  return (
    <div className={cn('flex h-full min-h-0 flex-col bg-surface-1', className)}>
      <ChatStyles />
      <header
        className={cn(
          'flex h-12 shrink-0 items-center gap-2 border-b border-border bg-surface-card px-3',
          hideHeaderClose && 'pr-10',
        )}
      >
        <div className="min-w-0 flex-1">
          <div className="truncate text-14 font-medium text-foreground" title={artifact.title || artifact.name}>
            {artifact.title || artifact.name}
          </div>
          {(artifact.title || artifact.description) && (
            <div className="truncate text-12 text-muted-foreground" title={artifact.description || artifact.name}>
              {artifact.description || artifact.name}
            </div>
          )}
        </div>
        {onExportDeck && category === 'html' && (
          <>
            <Button
              size="sm"
              variant="outline"
              className="h-7 shrink-0 gap-1"
              onClick={() => onExportDeck('pdf')}
              disabled={!!exportingFormat}
              title="导出为 PDF(16:9 横屏,与网页完全一致,单文件通用,适合分享/投屏/打印)"
            >
              {exportingFormat === 'pdf' ? <Loader2 className="size-3.5 animate-spin" /> : <FileDown className="size-3.5" />}
              {exportingFormat === 'pdf' ? '导出中…' : '导出 PDF'}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 shrink-0 gap-1"
              onClick={() => onExportDeck('pptx-native')}
              disabled={!!exportingFormat}
              title="导出为可编辑 PPT —— 标题/要点/表格/图表在 PowerPoint 里文字可改、图表可 Edit Data;复杂图(地球/仪表盘/公式)为图片。实验版"
            >
              {exportingFormat === 'pptx-native' ? <Loader2 className="size-3.5 animate-spin" /> : <Presentation className="size-3.5" />}
              {exportingFormat === 'pptx-native' ? '导出中…' : '可编辑 PPT'}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 shrink-0 gap-1"
              onClick={() => onExportDeck('pptx')}
              disabled={!!exportingFormat}
              title="导出为 PPT(图片版 .pptx,每页整图,保真但文字不可编辑;可用 PowerPoint/WPS 打开)"
            >
              {exportingFormat === 'pptx' ? <Loader2 className="size-3.5 animate-spin" /> : <Presentation className="size-3.5" />}
              {exportingFormat === 'pptx' ? '导出中…' : '图片版 PPT'}
            </Button>
          </>
        )}
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
  bytesQ: ReturnType<typeof useAgentArtifactBytes> | null;
}) {
  if (category === 'image' && url) {
    return (
      <div className="flex h-full items-center justify-center overflow-auto bg-surface-2 p-4">
        <img src={url} alt={name} className="max-h-full max-w-full object-contain" />
      </div>
    );
  }
  if (category === 'pdf' && url) {
    return (
      <Suspense fallback={<PreviewLoading />}>
        <PdfViewer file={{ url, withCredentials: true }} className="h-full" />
      </Suspense>
    );
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
    return <PreviewLoading />;
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

  if (category === 'spreadsheet')
    return (
      <Suspense fallback={<PreviewLoading />}>
        <SpreadsheetPreview bytes={bytes} />
      </Suspense>
    );
  if (category === 'docx') return <DocxPreview bytes={bytes} />;

  // 细胞图配方:*.fig.json → composeFigure 渲染成静态 SVG(右侧面板兜底;sci_draw 的图走会话内联出图)。
  if (category === 'figure') {
    const spec = parseFigureSpec(text);
    if (spec) {
      return (
        <Suspense fallback={<PreviewLoading />}>
          <FigureView spec={spec} />
        </Suspense>
      );
    }
    return <Unavailable text="配方数据解析失败,请下载查看。" downloadUrl={null} />;
  }

  if (category === 'svg') {
    // 关键:只带 viewBox、无 width/height 的内联 SVG 在收缩容器里会塌成 0 尺寸 → 面板空白。
    // 给 SafeSvg 外壳 w-full + 强制子 svg width:100%(高度按 viewBox 比例自适应),撑开显示。
    return (
      <div className="flex h-full items-center justify-center overflow-auto bg-surface-2 p-4">
        <SafeSvg code={text} className="w-full max-h-full [&>svg]:w-full" />
      </div>
    );
  }

  if (category === 'html') {
    return <HtmlPreview html={text} name={name} />;
  }

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
    <pre className="h-full overflow-auto whitespace-pre-wrap break-words px-4 py-3 text-12 leading-paragraph text-subtle">
      {text}
    </pre>
  );
}

/**
 * HTML 文档预览:默认渲染成网页(沙箱 iframe),可切「源码」。
 * 沙箱 sandbox="allow-scripts allow-popups" 但**不含 allow-same-origin** → iframe 为独立源,
 * 脚本能跑(图表/交互文档)但碰不到父页 cookie/DOM/凭证;安全渲染用户自己生成的 HTML。
 */
function HtmlPreview({ html, name }: { html: string; name: string }): ReactNode {
  const [showSource, setShowSource] = useState(false);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-1 border-b border-border bg-surface-1 px-2 py-1.5">
        <ToggleBtn active={!showSource} onClick={() => setShowSource(false)} Icon={Eye} label="渲染" />
        <ToggleBtn active={showSource} onClick={() => setShowSource(true)} Icon={Code2} label="源码" />
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        {showSource ? (
          <div className="h-full overflow-auto px-4 py-3">
            <MarkdownRenderer text={'```html\n' + html + '\n```'} />
          </div>
        ) : (
          <iframe
            title={name}
            sandbox="allow-scripts allow-popups"
            allow="fullscreen"
            srcDoc={html}
            className="h-full w-full border-0 bg-surface-card"
          />
        )}
      </div>
    </div>
  );
}

function ToggleBtn({
  active,
  onClick,
  Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  Icon: typeof Eye;
  label: string;
}): ReactNode {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex h-7 items-center gap-1 rounded-8 px-2.5 text-12 transition-colors',
        active ? 'bg-surface-2 font-medium text-foreground' : 'text-muted-foreground hover:text-foreground',
      )}
    >
      <Icon className="size-3.5" />
      {label}
    </button>
  );
}

function PreviewLoading(): ReactNode {
  return (
    <div className="flex h-full items-center justify-center gap-2 text-12 text-muted-foreground">
      <Loader2 className="size-4 animate-spin" /> 加载中…
    </div>
  );
}

function Unavailable({ text, downloadUrl }: { text: string; downloadUrl: string | null }): ReactNode {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
      <div className="flex size-12 items-center justify-center rounded-pill bg-surface-2 text-faint">
        <FileQuestion className="size-6" />
      </div>
      <p className="max-w-xs text-12 text-muted-foreground">{text}</p>
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
