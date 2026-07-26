import { useRef, useState } from 'react';
import { Code2, Eye, Maximize2 } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/shared/ui/dialog';
import { useSettled } from '@/shared/hooks/useSettled';
import { RenderLoader } from './RenderLoader';
import { CodeBlock } from './CodeBlock';

/**
 * AI 回答里的 ```html 代码块 —— 默认渲染成「页面样式」而非展示源码(可一键切「源码」查看/复制)。
 *
 * 安全:用 `<iframe srcDoc sandbox="allow-same-origin">` —— **不含 allow-scripts**,故页面内
 * JS 一律不执行(防 XSS / 防脚本越权),仅 HTML+CSS 渲染出视觉效果。allow-same-origin 只为
 * 让父窗口能读 scrollHeight 自适应高度(无脚本时同源不构成风险)。再加 `referrerPolicy="no-referrer"`
 * 防止 iframe 内外链资源(img / @import)把本站 URL 经 Referer 泄露到外域。样式被 iframe 隔离。
 *
 * 行内自适应高度(上限 560,超出 iframe 内部滚动);右上角「放大」→ 全屏(90vh 可滚)。
 * 流式期间(useSettled 未稳定)显示稳定 loader,避免边输出边重排抽搐。
 */

const SANDBOX = 'allow-same-origin';

function measureHeight(iframe: HTMLIFrameElement | null, cap: number): number | null {
  try {
    const doc = iframe?.contentWindow?.document;
    if (doc) return Math.min(doc.documentElement.scrollHeight + 8, cap);
  } catch {
    /* 跨源等读取失败 → 用默认高度 */
  }
  return null;
}

export function HtmlRender({ html }: { html: string }) {
  const { value: doc, settled } = useSettled(html, 350);
  const [open, setOpen] = useState(false);
  const [showSource, setShowSource] = useState(false);
  const ref = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(240);

  return (
    <>
      {!settled ? (
        <RenderLoader text="正在生成页面…" />
      ) : showSource ? (
        <div className="group relative">
          <CodeBlock>
            <code>{doc}</code>
          </CodeBlock>
          <ToolButton className="absolute right-2 top-2" label="预览" onClick={() => setShowSource(false)}>
            <Eye className="size-3" /> 预览
          </ToolButton>
        </div>
      ) : (
        <div className="group relative mb-2.5 last:mb-0 overflow-hidden rounded-md border border-border bg-surface-card">
          <iframe
            ref={ref}
            srcDoc={doc}
            sandbox={SANDBOX}
            referrerPolicy="no-referrer"
            title="HTML 预览"
            onLoad={() => {
              const h = measureHeight(ref.current, 560);
              if (h) setHeight(h);
            }}
            style={{ height }}
            className="block w-full transition-[height] duration-200"
          />
          <div className="absolute right-2 top-2 flex gap-1">
            <ToolButton label="查看源码" onClick={() => setShowSource(true)}>
              <Code2 className="size-3" /> 源码
            </ToolButton>
            <ToolButton label="放大查看" onClick={() => setOpen(true)}>
              <Maximize2 className="size-3" /> 放大
            </ToolButton>
          </div>
        </div>
      )}

      {/* Radix Root 常驻,绝不随视图切换/流式重渲卸载(否则 open 时卸载会泄漏 body pointer-events 锁) */}
      <Dialog open={open} onOpenChange={setOpen}>
        {/* 视口尺寸 arbitrary value(lightbox 本就按视口比例,无对应 token) */}
        <DialogContent dismissable className="h-[90vh] w-[95vw] max-w-[95vw] gap-0 overflow-hidden p-0">
          <DialogTitle className="sr-only">HTML 预览</DialogTitle>
          <iframe
            srcDoc={doc}
            sandbox={SANDBOX}
            referrerPolicy="no-referrer"
            title="HTML 预览(大图)"
            className="h-full w-full bg-surface-card"
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

function ToolButton({
  children,
  label,
  onClick,
  className,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={
        'inline-flex items-center gap-1 rounded-sm border border-border bg-background/90 px-1.5 py-0.5 text-2xs text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100 ' +
        (className ?? '')
      }
    >
      {children}
    </button>
  );
}
