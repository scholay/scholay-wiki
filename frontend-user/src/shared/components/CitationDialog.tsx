import { useMemo, useState } from 'react';
import { Copy } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog';
import {
  CITATION_FORMAT_LABELS,
  CITATION_FORMATS,
  generateCitation,
  isMonoCitation,
  readDefaultCitationFormat,
  setDefaultCitationFormat,
  stripItalic,
  type CitationFormat,
  type CitationPaper,
} from '@/shared/lib/citation';
import { CitationProse } from './CitationProse';
import { cn } from '@/shared/lib/utils';
import { copyToClipboard } from '@/shared/lib/clipboard';

/**
 * 引用格式弹窗 —— 列表 / 卡片 / 详情页等任何位置点"引用"按钮都用同一个弹窗:
 *   - 顶部 tabs:GB/T 7714 / BibTeX / APA / MLA / Chicago(集合见 [[CITATION_FORMATS]])
 *   - 主体:当前格式的全文(BibTeX 走 mono pre,其他走 prose + `<i>`)
 *   - 右上"复制"按钮 → navigator.clipboard
 *   - 双击 tab 设为默认 —— localStorage 持久化(与详情页 Footer 同 key,行为一致)
 *
 * 与 PaperDetailPane 内联的"引用本文"片段共享 [[generateCitation]] 与
 * [[CITATION_FORMAT_LABELS]],逻辑零分叉。
 */

export interface CitationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  paper: CitationPaper | null | undefined;
  /** 可选标题,默认"引用本文" */
  title?: string;
}

export function CitationDialog({
  open,
  onOpenChange,
  paper,
  title = '引用本文',
}: CitationDialogProps) {
  const [format, setFormat] = useState<CitationFormat>(() =>
    readDefaultCitationFormat('apa')
  );
  const citation = useMemo(
    () => (paper ? generateCitation(paper, format) : ''),
    [paper, format]
  );
  const isMono = isMonoCitation(format);

  const handleCopy = async () => {
    if (!citation) return;
    const ok = await copyToClipboard(stripItalic(citation));
    if (ok) toast.success(`${CITATION_FORMAT_LABELS[format]} 已复制`);
    else toast.error('复制失败,请检查浏览器剪贴板权限');
  };

  const setAsDefault = (f: CitationFormat) => {
    setDefaultCitationFormat(f);
    toast.success(`已设为默认: ${CITATION_FORMAT_LABELS[f]}`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* 移动端:留 12px 边距 + 全断点圆角 + 内边距收紧(基座小屏默认全宽贴边直角) */}
      <DialogContent className="w-[calc(100%-24px)] max-w-2xl rounded-16 p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            选择需要的引用格式,点右上「复制」即可粘贴到论文 / 笔记。双击格式名可设为默认。
          </DialogDescription>
        </DialogHeader>

        {/* 格式 tabs + 复制按钮(右端)。窄屏处理:tabs 放进可横向滚动的 min-w-0 容器,
            复制按钮 shrink-0 固定在右侧,整行不再撑破弹窗(之前 grid item min-width:auto +
            不换行的 flex 行 → 小屏溢出错位)。 */}
        <div className="flex min-w-0 items-center gap-2">
          <div className="-mx-1 flex min-w-0 flex-1 items-center gap-1 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {CITATION_FORMATS.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFormat(f)}
                onDoubleClick={() => setAsDefault(f)}
                className={cn(
                  'h-7 shrink-0 px-3 rounded-8 text-12 font-medium transition-colors',
                  format === f
                    ? 'bg-inverse text-on-inverse'
                    : 'text-muted-foreground hover:bg-surface-1 hover:text-foreground'
                )}
                title="单击切换 · 双击设为默认"
              >
                {CITATION_FORMAT_LABELS[f]}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={handleCopy}
            disabled={!citation}
            className="inline-flex h-7 shrink-0 items-center gap-1 rounded-8 border border-border bg-surface-card px-2.5 text-12 font-medium text-subtle transition-colors hover:border-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
            aria-label={`复制 ${CITATION_FORMAT_LABELS[format]}`}
          >
            <Copy className="size-3" strokeWidth={2.5} />
            复制
          </button>
        </div>

        {/* 主体 ——
            min-w-0 关键:DialogContent 是 grid 容器,grid item 默认 min-width=auto
            会被 <pre whitespace-pre> 的 min-content(最长行宽)撑爆,直接突破外层
            max-w-2xl;给本 div 加 min-w-0,长行就只在 pre 内部 overflow-x-auto 横滚 */}
        <div className="min-w-0">
          {isMono ? (
            <pre className="w-full rounded-12 bg-surface-1 border border-border px-5 py-4 font-mono text-12 leading-paragraph text-subtle overflow-x-auto whitespace-pre max-h-[360px]">
              {citation || '—'}
            </pre>
          ) : (
            <p className="rounded-12 bg-surface-1 border border-border px-5 py-4 text-14 leading-paragraph text-subtle max-h-[360px] overflow-y-auto break-words">
              {citation ? <CitationProse text={citation} /> : '—'}
            </p>
          )}
        </div>

        <p className="text-12 text-faint">
          单击切换格式 · 双击格式名设为默认
        </p>
      </DialogContent>
    </Dialog>
  );
}

// CitationProse 已抽到 shared/components/CitationProse,共享给 PaperDetailPane 等
