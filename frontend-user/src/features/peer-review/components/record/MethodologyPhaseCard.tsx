import { Loader2 } from 'lucide-react';
import { CyclingHint } from '@/shared/components/CyclingHint';

/**
 * 方法论编排阶段的等待提示(compute_state='computing_methodology' 时,贴在审稿人面板上方)。
 *
 * 三位审稿人开跑前有一个间隙:系统先通读全文、制定审稿标准、遴选合适的审稿人(约 1-2 分钟)。
 * 这里不展示 agent 的原始推理(会泄露选了哪个领域审稿人,违背匿名 A/B/C),也不再用"已通读 N 字"
 * 计数器(让人盯着、交互不佳),而是用一组**预设审稿文案循环打字**(CyclingHint)做"活着、没卡死"
 * 的等待反馈,减弱等待焦虑。布局上它不是会消失的全宽卡:审稿人面板始终在(此阶段是"待评议"骨架),
 * 编排结束后原地填充成表单。
 */
const METHODOLOGY_HINTS = [
  '正在通读稿件全文',
  '正在梳理论文的核心主张与贡献',
  '正在判定论文的领域、类型与方法学',
  '正在评估实验设计与方法学严谨性',
  '正在检索相关领域的最新文献',
  '正在比对最接近的已有工作',
  '正在核对关键数据、图表与引用',
  '正在审视统计方法与可复现性',
  '正在制定本文专属的审稿标准',
  '正在为本文匹配最合适的审稿视角',
  '正在从审稿团中遴选合适的审稿人',
  '正在组建本文的审稿团',
  '即将请审稿人就位、依次评议',
];

export function MethodologyPhaseCard() {
  return (
    <section className="flex items-center gap-3 rounded-md border border-brand-amber/40 bg-warning-soft px-4 py-3">
      <Loader2 className="h-4 w-4 shrink-0 animate-spin text-brand-amber" />
      <CyclingHint
        phrases={METHODOLOGY_HINTS}
        className="min-w-0 text-sm font-semibold text-brand-amber"
      />
    </section>
  );
}
