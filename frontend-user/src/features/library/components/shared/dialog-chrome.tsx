import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { Dialog } from '@/shared/ui/dialog';

/**
 * 文献集弹窗 chrome —— 统一工作台(PaperWorkbenchDialog)与各面板共用的外壳件。
 *
 * 背景:原 LibraryImportDialog / PaperManageDialog 两个弹窗外壳 90% 同构却各自手搓,
 * tab 条 4 份、footer 条 5 份、编号状态条 4 份散落各面板。这里收编为单一真源:
 *   - WorkbenchDialogShell  Radix Portal/Overlay/Content + header(图标/标题/副标/关闭)
 *   - DialogTabBar          amber 下划线 tablist(icon / 「即将」/ 计数 badge 可选)
 *   - DialogFooterBar       左 hint + 右按钮组的标准 footer 条
 *   - StepBanner            编号 pill + 态名 + 说明 的状态条
 *   - footer*Cn             footer 按钮的三档标准样式(主操作/描边/幽灵)
 */

// ─── 外壳 ───────────────────────────────────────────────────────────────────

export interface WorkbenchDialogShellProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** header 左侧 9x9 图标容器内容 */
  icon: React.ReactNode;
  /** 图标容器底色(默认 bg-surface-2) */
  iconBg?: string;
  title: string;
  /** 副标(单行截断,hover 显全) */
  description: React.ReactNode;
  /** header 右侧、关闭按钮左边的附加动作(例:「继续添加」) */
  headerExtra?: React.ReactNode;
  children: React.ReactNode;
}

export function WorkbenchDialogShell({
  open,
  onOpenChange,
  icon,
  iconBg,
  title,
  description,
  headerExtra,
  children,
}: WorkbenchDialogShellProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className={cn(
            'fixed inset-0 z-overlay bg-foreground/30 backdrop-blur-[2px]',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0'
          )}
        />
        <DialogPrimitive.Content
          className={cn(
            'fixed left-1/2 top-1/2 z-modal w-[960px] max-w-[calc(100vw-32px)]',
            '-translate-x-1/2 -translate-y-1/2',
            'flex flex-col h-[640px] max-h-[90vh] overflow-hidden',
            'rounded-lg border border-border bg-surface-card',
            'shadow-overlay',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
            'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95'
          )}
        >
          <div className="flex items-start justify-between gap-3 px-6 pt-5 pb-3 border-b border-border-soft shrink-0">
            <div className="flex items-start gap-3 min-w-0">
              <div
                className={cn(
                  'flex h-9 w-9 items-center justify-center rounded-sm shrink-0',
                  iconBg ?? 'bg-surface-2'
                )}
              >
                {icon}
              </div>
              <div className="min-w-0">
                <DialogPrimitive.Title className="text-base font-semibold text-foreground">
                  {title}
                </DialogPrimitive.Title>
                <DialogPrimitive.Description
                  className="mt-0.5 text-xs text-muted-foreground line-clamp-1"
                  title={typeof description === 'string' ? description : undefined}
                >
                  {description}
                </DialogPrimitive.Description>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {headerExtra}
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                aria-label="关闭"
                className="inline-flex h-7 w-7 items-center justify-center rounded-sm text-faint hover:bg-surface-2 hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>
          </div>
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </Dialog>
  );
}

// ─── tab 条 ─────────────────────────────────────────────────────────────────

export interface DialogTabDef<T extends string> {
  id: T;
  label: string;
  icon?: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  /** 「即将」amber 角标 */
  comingSoon?: boolean;
  /** 命中计数 badge(>0 才显示) */
  count?: number;
}

export function DialogTabBar<T extends string>({
  tabs,
  value,
  onChange,
  ariaLabel,
  size = 'md',
}: {
  tabs: Array<DialogTabDef<T>>;
  value: T;
  onChange: (id: T) => void;
  ariaLabel: string;
  /** md=h-10(顶级)/ sm=h-9(面板内嵌) */
  size?: 'md' | 'sm';
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="flex items-center gap-1 px-6 border-b border-border shrink-0"
    >
      {tabs.map((t) => {
        const active = value === t.id;
        const Icon = t.icon;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.id)}
            className={cn(
              'relative inline-flex items-center gap-1.5 px-3 text-sm font-semibold transition-colors',
              size === 'md' ? 'h-10' : 'h-9',
              active ? 'text-brand-amber' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {Icon && <Icon className="size-4" strokeWidth={2.25} />}
            {t.label}
            {t.comingSoon && (
              <span
                aria-hidden="true"
                className="ml-0.5 inline-flex items-center h-3.5 px-1 rounded-pill bg-brand-amber text-background text-2xs font-bold leading-none whitespace-nowrap"
              >
                即将
              </span>
            )}
            {typeof t.count === 'number' && t.count > 0 && (
              <span
                className={cn(
                  'inline-flex items-center justify-center min-w-4 h-4 px-1 rounded-pill text-2xs font-bold leading-none tabular-nums',
                  active ? 'bg-brand-amber text-background' : 'bg-surface-2 text-subtle'
                )}
              >
                {t.count}
              </span>
            )}
            {active && (
              <span
                aria-hidden="true"
                className="absolute bottom-0 left-2 right-2 h-0.5 rounded-pill bg-brand-amber"
              />
            )}
          </button>
        );
      })}
    </div>
  );
}

// ─── footer 条 ──────────────────────────────────────────────────────────────

export function DialogFooterBar({
  hint,
  children,
}: {
  /** 左侧说明文字(可空) */
  hint?: React.ReactNode;
  /** 右侧按钮组 */
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-2 px-6 py-3 bg-surface-1 border-t border-border-soft shrink-0">
      <span className="text-xs text-muted-foreground flex items-center gap-1 min-w-0">
        {hint}
      </span>
      <div className="flex items-center gap-2 shrink-0">{children}</div>
    </div>
  );
}

/** footer 主操作按钮(实底)。tone 区分语义:green=保存/写入,amber=关联/匹配。 */
export function footerPrimaryCn(tone: 'green' | 'amber' = 'green'): string {
  return cn(
    'inline-flex items-center gap-1.5 h-8 px-3.5 rounded-sm text-sm font-bold text-background transition-colors',
    'disabled:opacity-60 disabled:cursor-not-allowed',
    tone === 'green'
      ? 'bg-brand-green hover:bg-brand-green/90'
      : 'bg-brand-amber hover:bg-brand-amber/90'
  );
}

/** footer 描边按钮(白底 border)。 */
export const footerOutlineCn = cn(
  'inline-flex items-center gap-1 h-8 px-3 rounded-sm bg-surface-card border border-border text-sm font-semibold text-subtle',
  'hover:bg-surface-2 hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed transition-colors'
);

/** footer 幽灵按钮(取消等)。 */
export const footerGhostCn = cn(
  'inline-flex items-center gap-1 h-8 px-3 rounded-sm text-sm font-semibold text-subtle',
  'hover:bg-surface-2 hover:text-foreground disabled:opacity-60 transition-colors'
);

// ─── 编号状态条 ─────────────────────────────────────────────────────────────

export function StepBanner({
  step,
  active = true,
  title,
  desc,
}: {
  /** 编号 pill 内容(0/1/2/3…) */
  step: number | string;
  /** active=amber 底 / 否则前景黑底(起点态) */
  active?: boolean;
  title: string;
  desc?: React.ReactNode;
}) {
  return (
    <div className="rounded-md border border-border-soft bg-surface-1 px-4 py-2.5">
      <div className="flex items-center gap-2.5">
        <span
          className={cn(
            'inline-flex h-5 w-5 items-center justify-center rounded-pill text-background text-2xs font-bold tabular-nums shrink-0',
            active ? 'bg-brand-amber' : 'bg-foreground'
          )}
        >
          {step}
        </span>
        <span className="text-sm font-semibold text-foreground">{title}</span>
        {desc && (
          <>
            <span className="text-faint">·</span>
            <span className="text-xs text-muted-foreground min-w-0 truncate">{desc}</span>
          </>
        )}
      </div>
    </div>
  );
}
