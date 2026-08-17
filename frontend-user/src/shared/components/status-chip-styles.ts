/**
 * 文献集状态徽章外观(of4Xd)——检索卡 PaperPdfChip 与文献集 StatusChip 共用。
 */
export const STATUS_CHIP_SHELL =
  'group inline-flex items-center gap-1.5 h-7 px-2.5 rounded-8 border bg-surface-card shrink-0 transition-colors';

export const STATUS_CHIP_TONE = {
  complete:
    'border-brand-green/40 text-brand-green hover:bg-brand-green/[0.04] data-[state=open]:bg-brand-green/[0.06]',
  partial:
    'border-brand-amber/50 text-brand-amber hover:bg-brand-amber/[0.05] data-[state=open]:bg-brand-amber/[0.08]',
  missing:
    'border-border text-faint hover:bg-surface-1 data-[state=open]:bg-surface-2',
} as const;

export const STATUS_CHIP_RAIL_SHELL =
  'inline-flex h-7 w-full items-center justify-center gap-1 rounded-8 border bg-surface-card px-1.5 text-12 font-medium transition-colors';
