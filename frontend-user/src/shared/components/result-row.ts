import { cn } from '@/shared/lib/utils';

/**
 * 检索结果「行卡」公共原子 —— 期刊库查询 / 数据集检索 / scholay 情报
 * 三种检索方式统一参照文献库检索的参考文献基础信息卡
 * (PaperResultCard/DefaultCard)的排版语言:
 *   平铺行(border-b 分隔,无圆角底卡)
 *   → 标题 / meta 行 / 徽章行 / 摘要 / 操作行 纵向排布。
 *
 * 刻意导出 className 常量而非组件:三种卡的内容结构差异大,
 * 强行抽公共组件会变成 props 泥球;共享的只是排版口径。
 */

/** 行壳 —— 对齐 DefaultCard 的 article 外壳(无底色,border-b 分隔)。 */
export const RESULT_ROW_CLASS =
  'group flex items-start gap-2 border-b border-border px-3 py-3';

/**
 * 标题 —— 对齐 DefaultCard 的 h3(14px 主文,hover 朱砂由调用方按可点性追加)。
 * 注:参照物 DefaultCard 写的是退休档 text-md/font-semibold(护栏存量),
 * 这里按现行 token 落地 —— 视觉同档(md=14px),权重取 medium。
 */
export const RESULT_ROW_TITLE_CLASS =
  'min-w-0 text-14 font-medium leading-sans text-foreground transition-colors';

/** meta 行 —— 对齐 MetaLine 外层(12px 灰,左侧主信息 flex-1,右侧 shrink-0)。 */
export const RESULT_ROW_META_CLASS =
  'mt-1 flex items-center gap-2 text-12 text-muted-foreground';

/** 摘要/描述 —— 对齐 DefaultCard 的摘要段(12px subtle,行数裁剪由调用方加)。 */
export const RESULT_ROW_ABSTRACT_CLASS =
  'mt-2 text-12 text-subtle leading-paragraph';

/** 操作 chip —— 对齐 DefaultCard 操作行的描边小按钮。 */
export const RESULT_ROW_ACTION_CLASS =
  'inline-flex h-6 items-center gap-1 rounded-4 border border-border px-2 text-12 text-subtle whitespace-nowrap transition-colors hover:bg-surface-1 hover:text-foreground';

export type RowChipTone =
  | 'solid-green'
  | 'solid-amber'
  | 'solid-red'
  | 'green'
  | 'amber'
  | 'red'
  | 'neutral';

/**
 * 徽章 chip —— 对齐 DefaultCard 徽章行的视觉档位:
 * 实底只留给需要打断阅读的信息(预警/头条),等级信息用软底,辅助信息中性灰。
 */
export function rowChipClass(tone: RowChipTone = 'neutral'): string {
  return cn(
    'inline-flex h-5 items-center gap-1 rounded-4 px-2 text-12 font-medium',
    tone === 'solid-green' && 'bg-brand-green text-on-brand',
    tone === 'solid-amber' && 'bg-brand-amber text-on-brand',
    tone === 'solid-red' && 'bg-brand-red text-on-brand',
    tone === 'green' && 'bg-brand-green/10 text-brand-green',
    tone === 'amber' && 'bg-brand-amber-soft text-brand-amber',
    tone === 'red' && 'bg-danger-soft text-brand-red',
    tone === 'neutral' && 'bg-surface-2 text-subtle',
  );
}
