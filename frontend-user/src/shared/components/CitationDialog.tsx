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
  generateCitation,
  stripItalic,
  type CitationFormat,
  type CitationPaper,
} from '@/shared/lib/citation';
import { CitationProse } from './CitationProse';
import { cn } from '@/shared/lib/utils';
import { copyToClipboard } from '@/shared/lib/clipboard';

/**
 * 引用格式弹窗 —— 列表 / 卡片 / 详情页等任何位置点"引用"按钮都用同一个弹窗:
 *   - 顶部 tabs:BibTeX / APA / MLA / Chicago
 *   - 主体:当前格式的全文(BibTeX 走 mono pre,其他走 prose + `<i>`)
 *   - 右上"复制"按钮 → navigator.clipboard
 *   - 双击 tab 设为默认 —— localStorage 持久化(与详情页 Footer 同 key,行为一致)
 *
 * 与 PaperDetailPane 内联的"引用本文"片段共享 [[generateCitation]] 与
 * [[CITATION_FORMAT_LABELS]],逻辑零分叉。
 */

const CITE_FORMAT_STORAGE_KEY = 'scholay.cite-format';
const ALL_FORMATS: CitationFormat[] = ['bibtex', 'apa', 'mla', 'chicago'];

function readDefaultFormat(): CitationFormat {
  if (typeof localStorage === 'undefined') return 'apa';
  const saved = localStorage.getItem(CITE_FORMAT_STORAGE_KEY);
  if (
    saved === 'bibtex' ||
    saved === 'mla' ||
    saved === 'apa' ||
    saved === 'chicago'
  ) {
    return saved;
  }
  return 'apa';
}

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
  const [format, setFormat] = useState<CitationFormat>(readDefaultFormat);
  const citation = useMemo(
    () => (paper ? generateCitation(paper, format) : ''),
    [paper, format]
  );
  const isMono = format === 'bibtex';

  const handleCopy = async () => {
    if (!citation) return;
    const ok = await copyToClipboard(stripItalic(citation));
    if (ok) toast.success(`${CITATION_FORMAT_LABELS[format]} 已复制`);
    else toast.error('复制失败,请检查浏览器剪贴板权限');
  };

  const setAsDefault = (f: CitationFormat) => {
    localStorage.setItem(CITE_FORMAT_STORAGE_KEY, f);
    toast.success(`已设为默认: ${CITATION_FORMAT_LABELS[f]}`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* 移动端:留 12px 边距 + 全断点圆角 + 内边距收紧(基座小屏默认全宽贴边直角) */}
      <DialogContent className="w-[calc(100%-24px)] max-w-2xl rounded-lg p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            选择需要的引用格式,点右上「复制」即可粘贴到论文 / 笔记。双击格式名可设为默认。
          </DialogDescription>
        </DialogHeader>

        {/* 格式 tabs + 复制按钮(右端) —— 复制不再悬浮在正文上:
            窄屏下浮层会压住第一行引文(用户反馈遮挡),进 tabs 行任何屏宽都不遮挡 */}
        <div className="flex items-center gap-1">
          {ALL_FORMATS.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFormat(f)}
              onDoubleClick={() => setAsDefault(f)}
              className={cn(
                'h-7 px-3 rounded-md text-xs font-bold transition-colors',
                format === f
                  ? 'bg-foreground text-background'
                  : 'text-muted-foreground hover:bg-surface-1 hover:text-foreground'
              )}
              title="单击切换 · 双击设为默认"
            >
              {CITATION_FORMAT_LABELS[f]}
            </button>
          ))}
          <button
            type="button"
            onClick={handleCopy}
            disabled={!citation}
            className="ml-auto inline-flex h-7 shrink-0 items-center gap-1 rounded-sm border border-border bg-background px-2.5 text-2xs font-bold text-subtle transition-colors hover:border-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
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
            <pre className="w-full rounded-sm bg-surface-1 border border-border px-5 py-4 font-mono text-xs leading-[1.65] text-subtle overflow-x-auto whitespace-pre max-h-[360px]">
              {citation || '—'}
            </pre>
          ) : (
            <p className="rounded-sm bg-surface-1 border border-border px-5 py-4 text-sm leading-[1.7] text-subtle max-h-[360px] overflow-y-auto break-words">
              {citation ? <CitationProse text={citation} /> : '—'}
            </p>
          )}
        </div>

        <p className="text-2xs text-faint">
          单击切换格式 · 双击格式名设为默认
        </p>
      </DialogContent>
    </Dialog>
  );
}

// CitationProse 已抽到 shared/components/CitationProse,共享给 PaperDetailPane 等
