import { useState } from 'react';
import { Loader2, Plus, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { useAuthStore } from '@/stores/auth.store';
import { useAuthDialog } from '@/stores/auth-dialog.store';
import { usePendingAction } from '@/stores/pending-action.store';
import { useSearchVisiblePapers } from '@/stores/search-visible-papers.store';
import { cn } from '@/shared/lib/utils';
import { useStagingActions } from '../hooks/useStagingActions';
import { PAPER_COL_WIDTH } from './matrix/constants';

/**
 * 工作区 / 矩阵分析的"空态预览" —— 对照 .pen `m0GrJY` (`x6H2Pf` + `tH03L`)
 *
 * 内容:
 *   1. <MockMatrixPreview> 一张完整假表 + opacity-20 蒙层,
 *      让用户看到"暂存论文后会长这样";按容器宽度自适应,不出横滚条 ——
 *      毕竟是假数据,溢出查看没有意义
 *   2. <EmptyImportButton> 红色 ⚡「从搜索器一键导入」CTA,放在假表底部
 *
 * WelcomeBoard(无任何 area)与 MatrixColumn(有 area 但 staged=0)
 * 共用这套预览,保证两种空态视觉一致。
 */

export type MockTagTone = 'red' | 'amber' | 'green' | 'gray' | 'blue';

export interface MockCell {
  tag: string;
  tone: MockTagTone;
  content: string;
}

export interface MockRow {
  title: string;
  abstract: string;
  paperTag: { label: string; tone: MockTagTone };
  cells: MockCell[];
}

export const MOCK_DIMENSIONS = [
  '研究方法',
  '数据集',
  '关键指标',
  '结论',
  '局限',
] as const;

export const MOCK_ROWS: MockRow[] = [
  {
    title: 'A Survey on Local Interpretability of Deep Learning Models with LIME and SHAP',
    abstract:
      '系统综述了 LIME / SHAP 在 CNN、RNN、Transformer 三类深度网络上的 12 个变种实现,构建统一基准并在 4 个公开数据集上量化稳定性、忠实性与计算开销,最终提出场景化选型矩阵。',
    paperTag: { label: '可解释性', tone: 'red' },
    cells: [
      { tag: '综述/基准', tone: 'gray', content: 'LIME、KernelSHAP、TreeSHAP、DeepSHAP — 12 个变种纳入统一基准评估框架。' },
      { tag: '4 数据集', tone: 'gray', content: 'MIMIC-III、ImageNet-Med、Lending Club、SST-2' },
      { tag: '忠实性 +14%', tone: 'red', content: 'Faithfulness 0.81 / Stability 0.79 / 计算开销 1.0× 基线' },
      { tag: '选型矩阵', tone: 'green', content: '应根据任务模态与时延约束差异化选用 SHAP / LIME 变种,给出 12 项推荐组合。' },
      { tag: '样本规模', tone: 'amber', content: '未在大规模生成模型上验证;解释一致性受随机种子影响仍待研究。' },
    ],
  },
  {
    title: 'Diffusion Model Interpretability via Latent Space Probing',
    abstract:
      '针对扩散模型生成过程不可解释的痛点,提出潜空间探针方法。在 Stable Diffusion XL、DiT-3D 上验证可对去噪步进行语义级追踪,并通过 6 项人因学指标证明用户对生成结果的信任度提升 31%。',
    paperTag: { label: '扩散模型', tone: 'amber' },
    cells: [
      { tag: '潜空间探针', tone: 'gray', content: '对去噪步进行语义级追踪;使用线性探针解码隐藏状态。' },
      { tag: 'SDXL + DiT-3D', tone: 'gray', content: 'Stable Diffusion XL、DiT-3D 各 50K 样本 + 用户研究 320 人。' },
      { tag: '信任 +31%', tone: 'red', content: '语义可分性 0.87;用户对生成结果信任度 +31%;解码延迟 +6%' },
      { tag: '通用框架', tone: 'green', content: '潜空间探针可作为扩散模型解释性的通用框架,向 DiT-3D 等架构迁移性强。' },
      { tag: '未审稿', tone: 'amber', content: 'arXiv 预印本,未经过同行评议;视频扩散模型适配尚需验证。' },
    ],
  },
  {
    title: 'Counterfactual Explanations for Transformer-based Text Classification',
    abstract:
      '以 BERT 文本分类为例,构造反事实样本并对比 SHAP / LIME / Counterfactual 三种解释方法在忠实性、可读性与用户接受度上的差异。结论支持将反事实解释纳入 NLP 系统的默认产出,并提供开源工具 CFExplain。',
    paperTag: { label: 'NLP', tone: 'blue' },
    cells: [
      { tag: 'Counterfactual', tone: 'gray', content: '基于 BERT,构造最小扰动反事实样本并对比 SHAP / LIME 表现。' },
      { tag: '3 文本基准', tone: 'gray', content: 'SST-2、AG News、Yelp Review;用户研究 N=180' },
      { tag: '接受度 +18%', tone: 'red', content: '忠实性 0.74 / 可读性 4.5(5 分制)/ 用户接受度 +18%' },
      { tag: '建议默认', tone: 'green', content: '反事实解释在用户接受度上显著优于 SHAP / LIME,建议作为 NLP 默认输出。' },
      { tag: '中文支持', tone: 'amber', content: '主要面向英文任务;中文长文本生成与代码任务尚未覆盖。' },
    ],
  },
];

export const MOCK_TONE_CLS: Record<MockTagTone, string> = {
  red: 'bg-danger-soft text-brand-red',
  amber: 'bg-warning-soft text-brand-amber',
  green: 'bg-brand-green/10 text-brand-green',
  gray: 'bg-surface-2 text-muted-foreground',
  blue: 'bg-brand-blue-soft text-brand-blue',
};

/**
 * 渲染 3 行假矩阵 —— `table-fixed + w-full` 按容器宽度自适应,不出横滚条。
 * 整体 opacity-20 + pointer-events-none + select-none,用户能看到形状但不能交互。
 */
export function MockMatrixPreview() {
  return (
    <div
      aria-hidden="true"
      className="opacity-20 pointer-events-none select-none"
    >
      <table className="w-full table-fixed border-separate border-spacing-0 text-xs">
        <colgroup>
          {/* 论文列 = 上方 header 的 "工作区" 区固定宽度 (PAPER_COL_WIDTH),
              与 MatrixColumn / WelcomeBoard header 中"工作区"框宽度对齐。
              剩余 5 个维度列由 browser 等分剩余宽度。 */}
          <col style={{ width: PAPER_COL_WIDTH }} />
          {MOCK_DIMENSIONS.map((d) => (
            <col key={d} />
          ))}
        </colgroup>
        <thead>
          <tr>
            {/* 工作区列(最左)—— 与真实 MatrixColumn 的 <thead> 一致:
                这里放 StagingTabs(A/B/+ 标签),而不是再起一个 "论文" 列头。
                数据行的左格仍然是论文卡(暂存区里的论文展示)—— 这种 tabs-as-header
                + cards-as-body 的二层结构和真实矩阵完全对齐。 */}
            <th className="bg-background border-b border-r border-border p-0 h-9">
              <FakeStagingTabs />
            </th>
            {MOCK_DIMENSIONS.map((d) => (
              <th
                key={d}
                className="bg-surface-1 border-b border-r border-border last:border-r-0 text-left px-3 h-9 text-xs font-bold text-muted-foreground"
              >
                {d}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {MOCK_ROWS.map((row, i) => (
            <tr key={i}>
              <td className="align-top bg-background border-b border-r border-border p-3.5">
                <div className="flex flex-col gap-2">
                  <span
                    className={cn(
                      'inline-flex w-fit items-center px-1.5 py-0.5 rounded-sm text-2xs font-bold',
                      MOCK_TONE_CLS[row.paperTag.tone]
                    )}
                  >
                    {row.paperTag.label}
                  </span>
                  <p className="text-sm font-bold text-foreground leading-snug">
                    {row.title}
                  </p>
                  <p className="text-xs text-subtle leading-relaxed line-clamp-3">
                    {row.abstract}
                  </p>
                </div>
              </td>
              {row.cells.map((c, j) => (
                <td
                  key={j}
                  className="align-top bg-background border-b border-r border-border last:border-r-0 p-3"
                >
                  <div className="flex flex-col gap-1.5">
                    <span
                      className={cn(
                        'inline-flex w-fit items-center px-1.5 py-0.5 rounded-sm text-2xs font-bold',
                        MOCK_TONE_CLS[c.tone]
                      )}
                    >
                      {c.tag}
                    </span>
                    <p className="text-xs text-subtle leading-relaxed">
                      {c.content}
                    </p>
                  </div>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ============================================================================
// 假 StagingTabs —— 渲染 A:3 / B:1 / + 占位,只在 MockMatrixPreview 表头里用,
// 不导出。视觉与真实 StagingTabs 对齐(对照 features/search/components/StagingTabs.tsx),
// 父级 <th> 已 opacity-20 + pointer-events-none,这里不再重复处理。
// ============================================================================

function FakeStagingTabs() {
  return (
    <div className="flex items-center h-9 px-3 gap-1">
      <FakeStagingTab label="A" count={3} active />
      <FakeStagingTab label="B" count={1} />
      <button
        type="button"
        tabIndex={-1}
        aria-hidden="true"
        className="inline-flex h-6 w-6 items-center justify-center rounded-sm text-muted-foreground ml-1"
      >
        <Plus className="size-3" strokeWidth={2.5} />
      </button>
    </div>
  );
}

function FakeStagingTab({
  label,
  count,
  active,
}: {
  label: string;
  count: number;
  active?: boolean;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 h-7 px-2.5 rounded-sm text-xs font-bold',
        active
          ? 'text-foreground border-b-2 border-brand-red'
          : 'text-muted-foreground'
      )}
    >
      {label}
      <span
        className={cn(
          'inline-flex h-4 min-w-4 items-center justify-center px-1 rounded-pill text-2xs font-bold tabular-nums',
          active
            ? 'bg-brand-red text-background'
            : 'bg-surface-2 text-muted-foreground'
        )}
      >
        {count}
      </span>
    </span>
  );
}

/**
 * "从搜索器一键导入" CTA —— 把当前搜索结果页的全部论文一次性加入 active 暂存区。
 *
 * 数据来源:[[useSearchVisiblePapers]] —— SearcherColumn 把当前页 papers 同步到
 * 该 ephemeral store。本组件读取后调 [[useStagingActions.bulkStagePapers]],
 * 一次性 dedup + 加入 + 单条汇总 toast。
 *
 * 行为分支:
 *   - 未登录 → pending action `bulk-import-search` + 弹登录 dialog
 *     (登录后由 useReplayPendingAction 提示用户再点一次 —— 自动重放本批
 *     不可靠,因为登录前后搜索状态可能已变化)
 *   - 已登录 + 当前页无 papers → toast 提示去做搜索
 *   - 已登录 + 有 papers → bulkStagePapers + 汇总 toast(added / skipped / capped)
 */
export function EmptyImportButton() {
  const token = useAuthStore((s) => s.token);
  const openAuthDialog = useAuthDialog((s) => s.openDialog);
  const visiblePapers = useSearchVisiblePapers((s) => s.papers);
  const { bulkStagePapers } = useStagingActions();
  const [busy, setBusy] = useState(false);

  const handleClick = async () => {
    if (busy) return;
    if (!token) {
      usePendingAction.getState().set({ type: 'bulk-import-search' });
      openAuthDialog('login');
      toast.info('登录后再点一次即可一键导入');
      return;
    }
    if (visiblePapers.length === 0) {
      toast.info('先在左侧搜索一下,再点一键导入');
      return;
    }
    setBusy(true);
    try {
      const { added, skipped, capped } =
        await bulkStagePapers(visiblePapers);
      const parts: string[] = [];
      if (added > 0) parts.push(`已导入 ${added} 篇`);
      if (skipped > 0) parts.push(`${skipped} 篇已在暂存区跳过`);
      if (capped > 0) parts.push(`${capped} 篇因暂存区已满未加入`);
      if (added > 0) toast.success(parts.join(' · '));
      else if (parts.length > 0) toast.info(parts.join(' · '));
      else toast.info('没有可导入的论文');
    } finally {
      setBusy(false);
    }
  };

  const disabled = busy;

  return (
    <div className="flex items-center justify-center py-7 px-4">
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled}
        className={cn(
          'inline-flex items-center gap-1.5 h-9 px-5 rounded-pill bg-brand-red text-background text-xs font-bold transition-colors shadow-sm',
          'hover:bg-brand-red/90 disabled:opacity-70 disabled:cursor-not-allowed'
        )}
      >
        {busy ? (
          <Loader2 className="size-3.5 animate-spin" strokeWidth={2.5} />
        ) : (
          <Zap className="size-3.5" strokeWidth={2.5} />
        )}
        {busy ? '导入中…' : '从搜索器一键导入'}
      </button>
    </div>
  );
}
