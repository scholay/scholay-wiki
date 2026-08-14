import { useState } from 'react';
import {
  ChevronDown,
  Download,
  FileSpreadsheet,
  FileText,
  Loader2,
  Settings2,
  Table2,
} from 'lucide-react';
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/shared/ui/hover-card';
import { cn } from '@/shared/lib/utils';

/**
 * 窄宽度下(<lg)的「更多」hover 下拉 —— 折叠 设置列 + 导出 3 种格式 到一颗按钮。
 *
 * 不复用 ExportMenu(自带 DropdownMenu hover-trigger),嵌进 HoverCard 会有
 * 两套 pointer 状态打架(HoverCard 鼠标移出 content bbox 即关,DropdownMenu
 * 的 portal content 不在 bbox 内,会触发 HoverCard 误关)。这里直接接收
 * onExport / onOpenSettings 回调,UI 用扁平菜单条,4 项一字排开。
 */
export function MatrixMoreToolsMenu({
  className,
  disabled,
  exportDisabled,
  onOpenSettings,
  onExport,
}: {
  className?: string;
  /** 设置列按钮 disabled(未登录时) */
  disabled: boolean;
  /** 导出按钮 disabled(暂存或维度为空 / 未登录) */
  exportDisabled: boolean;
  onOpenSettings: () => void;
  onExport: (fmt: 'csv' | 'md' | 'xlsx') => Promise<void> | void;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<'csv' | 'md' | 'xlsx' | null>(null);

  const handleExport = async (fmt: 'csv' | 'md' | 'xlsx') => {
    if (exportDisabled || pending) return;
    setPending(fmt);
    setOpen(false); // 点击后立即关菜单,反馈用 spinner + toast
    try {
      await onExport(fmt);
    } finally {
      setPending(null);
    }
  };

  return (
    <div className={className}>
      <HoverCard openDelay={80} closeDelay={180} open={open} onOpenChange={setOpen}>
        <HoverCardTrigger asChild>
          <button
            type="button"
            className="inline-flex items-center gap-1 h-7 px-2.5 rounded-8 border border-border text-12 text-subtle hover:bg-surface-1 transition-colors whitespace-nowrap"
          >
            {pending ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <Download className="size-3" />
            )}
            更多
            <ChevronDown className="size-3 -mr-0.5" strokeWidth={2.25} />
          </button>
        </HoverCardTrigger>
        <HoverCardContent align="end" sideOffset={6} className="w-[180px] p-1.5">
          <div className="flex flex-col gap-0.5">
            <MenuRow
              icon={<Settings2 className="size-3.5" />}
              label="设置列"
              disabled={disabled}
              onClick={() => {
                setOpen(false);
                onOpenSettings();
              }}
            />
            <div aria-hidden className="my-1 h-px bg-border-soft" />
            <MenuRow
              icon={<FileText className="size-3.5" />}
              label="导出 CSV"
              disabled={exportDisabled}
              loading={pending === 'csv'}
              onClick={() => handleExport('csv')}
            />
            <MenuRow
              icon={<Table2 className="size-3.5" />}
              label="导出 Markdown"
              disabled={exportDisabled}
              loading={pending === 'md'}
              onClick={() => handleExport('md')}
            />
            <MenuRow
              icon={<FileSpreadsheet className="size-3.5" />}
              label="导出 Excel"
              disabled={exportDisabled}
              loading={pending === 'xlsx'}
              onClick={() => handleExport('xlsx')}
            />
          </div>
        </HoverCardContent>
      </HoverCard>
    </div>
  );
}

function MenuRow({
  icon,
  label,
  disabled,
  loading,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  disabled?: boolean;
  loading?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      className={cn(
        'flex items-center gap-2 h-8 px-2 rounded-8 text-12 text-subtle text-left transition-colors',
        'hover:bg-surface-1 hover:text-foreground',
        'disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-subtle'
      )}
    >
      <span className="shrink-0 text-muted-foreground">
        {loading ? <Loader2 className="size-3.5 animate-spin" /> : icon}
      </span>
      <span className="flex-1 truncate">{label}</span>
    </button>
  );
}
