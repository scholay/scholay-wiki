import { useRef, useState } from 'react';
import {
  ChevronDown,
  Download,
  FileSpreadsheet,
  FileText,
  Loader2,
  Table2,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import { cn } from '@/shared/lib/utils';
import type { Paper } from '@/shared/api/types';
import type { PaperAnalysisItem } from '../../api/analysis';
import {
  buildMatrixRows,
  exportCsv,
  exportMarkdown,
  exportXlsx,
  type DimensionMeta,
} from './export';

/**
 * 矩阵导出菜单 —— 触发器是 "导出 ▾" 按钮,**hover 自动展开**(也支持 click)。
 *
 * Hover 实现关键:
 *   - `modal={false}`:**不让 Radix 在 body 上挂 pointer-events:none**,避免它
 *     干扰底层 hover 检测,造成反复 enter/leave 抖动
 *   - 用 `onPointerEnter/Leave`(不是 mouseenter/leave)—— 更稳定,不接收
 *     聚焦切换 / pointer-events 改变带来的合成 mouse 事件
 *   - 开/关都用 setTimeout 防抖:openDelay 120ms 防误触,closeDelay 220ms 允许
 *     鼠标从 trigger 穿到 portal content
 *   - 防"误关后立即被 hover 再开" 抖动:用户主动 click 或 ESC 关掉后 400ms 内
 *     hover 不再开,等用户真把鼠标移走再回来才会重新触发
 *
 * Excel 走 dynamic import('xlsx') —— ~180KB 不进首屏 chunk,用户不导出就不下载。
 */

interface Props {
  papers: Paper[];
  dimensions: DimensionMeta[];
  resultIndex: Map<string, PaperAnalysisItem>;
  filenamePrefix?: string;
}

export function ExportMenu({
  papers,
  dimensions,
  resultIndex,
  filenamePrefix = 'matrix',
}: Props) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<'csv' | 'md' | 'xlsx' | null>(null);
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 主动关掉后给一个"冷静期",防止鼠标还在 trigger 上时立刻被 onPointerEnter 再开
  const reopenLockUntil = useRef<number>(0);

  const disabled = papers.length === 0 || dimensions.length === 0;

  const cancelOpen = () => {
    if (openTimer.current) {
      clearTimeout(openTimer.current);
      openTimer.current = null;
    }
  };
  const cancelClose = () => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };
  // 用户 hover trigger → 120ms 后真正打开;鼠标快速划过不触发
  const scheduleOpen = () => {
    if (disabled || pending !== null) return;
    if (Date.now() < reopenLockUntil.current) return; // 冷静期内不重开
    cancelClose();
    cancelOpen();
    openTimer.current = setTimeout(() => setOpen(true), 120);
  };
  // 鼠标离开 trigger/content → 220ms 缓冲,期间又 enter 就 cancel
  const scheduleClose = () => {
    cancelOpen();
    cancelClose();
    closeTimer.current = setTimeout(() => setOpen(false), 220);
  };
  // Radix 自己调 onOpenChange(例如点击 trigger toggle / ESC / outside click)
  // 关掉时启动冷静期,避免 hover 再开造成抖动
  const handleOpenChange = (next: boolean) => {
    if (!next) {
      reopenLockUntil.current = Date.now() + 400;
      cancelOpen();
      cancelClose();
    }
    setOpen(next);
  };

  const runExport = async (fmt: 'csv' | 'md' | 'xlsx') => {
    if (disabled) return;
    setPending(fmt);
    reopenLockUntil.current = Date.now() + 400;
    setOpen(false);
    try {
      const rows = buildMatrixRows(papers, dimensions, resultIndex);
      if (fmt === 'csv') exportCsv(rows, dimensions, filenamePrefix);
      else if (fmt === 'md') exportMarkdown(rows, dimensions, filenamePrefix);
      else if (fmt === 'xlsx') await exportXlsx(rows, dimensions, filenamePrefix);
    } catch (err) {
      toast.error(`导出失败:${(err as Error).message}`);
    } finally {
      setPending(null);
    }
  };

  return (
    <DropdownMenu open={open} onOpenChange={handleOpenChange} modal={false}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={disabled || pending !== null}
          onPointerEnter={scheduleOpen}
          onPointerLeave={scheduleClose}
          className={cn(
            'inline-flex items-center gap-1 h-7 px-2.5 rounded-8 border border-border text-xs text-subtle transition-colors',
            'hover:bg-surface-1 disabled:opacity-50 disabled:cursor-not-allowed',
            'data-[state=open]:bg-surface-1'
          )}
          title={disabled ? '暂存论文或维度为空,无法导出' : '导出矩阵分析结果'}
        >
          {pending ? (
            <Loader2 className="size-3 animate-spin" />
          ) : (
            <Download className="size-3" />
          )}
          导出
          <ChevronDown className="size-2.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={4}
        onPointerEnter={cancelClose}
        onPointerLeave={scheduleClose}
        // Radix 关闭后默认把焦点 return 给 trigger,会触发 :focus-visible ring。
        // 对 hover 触发的菜单来说,鼠标用户根本不需要这个焦点回滚 ——
        // preventDefault 跳过,trigger 不再被聚焦,不会有黑框残留。
        // 键盘用户走 Tab 来的 :focus-visible 仍正常工作,不影响 a11y。
        onCloseAutoFocus={(e) => e.preventDefault()}
        className="min-w-[200px]"
      >
        <ExportItem
          icon={FileSpreadsheet}
          label="导出 Excel"
          hint=".xlsx · 含表头格式"
          loading={pending === 'xlsx'}
          onSelect={() => runExport('xlsx')}
        />
        <ExportItem
          icon={Table2}
          label="导出 CSV"
          hint=".csv · 通用表格"
          loading={pending === 'csv'}
          onSelect={() => runExport('csv')}
        />
        <ExportItem
          icon={FileText}
          label="导出 Markdown"
          hint=".md · 粘贴到 Notion / 语雀"
          loading={pending === 'md'}
          onSelect={() => runExport('md')}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface ItemProps {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  label: string;
  hint: string;
  loading?: boolean;
  onSelect: () => void;
}

function ExportItem({ icon: Icon, label, hint, loading, onSelect }: ItemProps) {
  return (
    <DropdownMenuItem
      onSelect={(e) => {
        // 不让选中后立刻关闭再 re-open;runExport 自己会 close
        e.preventDefault();
        onSelect();
      }}
      className="flex items-start gap-2.5 px-3 py-2 cursor-pointer"
    >
      <span className="inline-flex h-7 w-7 items-center justify-center rounded-8 bg-surface-2 text-muted-foreground shrink-0 mt-px">
        {loading ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <Icon className="size-3.5" strokeWidth={2} />
        )}
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-semibold text-foreground">{label}</div>
        <div className="text-2xs text-faint mt-px">{hint}</div>
      </div>
    </DropdownMenuItem>
  );
}
