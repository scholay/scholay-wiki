import { ArrowUpRight } from 'lucide-react';
import { JournalCommentCarousel } from '@/features/journals/components/JournalCommentCarousel';
import { JournalCover } from '@/shared/components/JournalCover';
import { cn } from '@/shared/lib/utils';
import type { Journal } from '@/shared/api/types';
import {
  deriveRecommendScore,
  type JournalCardVariant,
  type JournalRecommendScore,
} from './JournalResultCard';
import {
  RESULT_ROW_ABSTRACT_CLASS,
  RESULT_ROW_ACTION_CLASS,
  RESULT_ROW_CLASS,
  RESULT_ROW_META_CLASS,
  RESULT_ROW_TITLE_CLASS,
  rowChipClass,
  type RowChipTone,
} from './result-row';

/**
 * 期刊检索结果「行卡」—— 期刊库查询 / scholay 选刊的列表形态。
 * 排版参照参考文献基础信息卡(PaperResultCard/DefaultCard):
 *   左侧封面位 + 刊名(可点开详情)→ 出版社 · 国家(meta)→ 分区/IF/CCF 徽章行 → 操作行。
 * 网格版大卡(JournalResultCard)保留给 FeatureHub 预览等展示位。
 */

interface JournalChip {
  key: string;
  label: string;
  tone: RowChipTone;
  title?: string;
}

/** Q1/1 区/CCF A → 松青软底;Q2/B → 琥珀软底;其余中性 —— 对齐论文卡分区徽章的档位语言。 */
function quartileTone(quartile: string): RowChipTone {
  const n = quartile.replace(/^Q/i, '').trim();
  if (n === '1') return 'green';
  if (n === '2') return 'amber';
  return 'neutral';
}

function pickJournalChips(
  j: Journal,
  score?: JournalRecommendScore,
): JournalChip[] {
  const chips: JournalChip[] = [];
  if (score) {
    chips.push({
      key: 'rec',
      label: `推荐 ${score.stars.toFixed(1)}`,
      tone: 'amber',
      title: 'scholay 选刊推荐星级(满分 5)',
    });
    chips.push({
      key: 'fit',
      label: `匹配度 ${score.percent}%`,
      tone: score.percent >= 90 ? 'green' : 'neutral',
    });
  }
  if (j.jcr_quartile) {
    chips.push({
      key: 'jcr',
      label: `JCR ${j.jcr_quartile}`,
      tone: quartileTone(j.jcr_quartile),
    });
  }
  if (j.jcr_impact_factor != null) {
    chips.push({
      key: 'if',
      label: `IF ${j.jcr_impact_factor.toFixed(1)}`,
      tone: 'neutral',
    });
  }
  if (j.fqb_quartile) {
    chips.push({
      key: 'cas',
      label: `中科院 ${j.fqb_quartile} 区`,
      tone: quartileTone(j.fqb_quartile),
    });
  }
  if (j.xr_quartile) {
    chips.push({
      key: 'xr',
      label: `新锐 ${j.xr_quartile} 区`,
      tone: quartileTone(j.xr_quartile),
      title: '中科院新锐分区',
    });
  }
  if (j.ccf_rank) {
    const r = j.ccf_rank.toUpperCase();
    chips.push({
      key: 'ccf',
      label: `CCF ${r}`,
      tone: r === 'A' ? 'green' : r === 'B' ? 'amber' : 'neutral',
    });
  }
  if (j.is_oa) {
    chips.push({ key: 'oa', label: 'OA', tone: 'neutral', title: '开放获取' });
  }
  if (j.gjqk_warning) {
    // 全行唯一实底 —— 与论文卡同口径,预警是需要打断阅读的信息。
    chips.push({
      key: 'warn',
      label: '⚠ 预警期刊',
      tone: 'solid-red',
      title: '中科院预警期刊',
    });
  }
  if (j.has_submission) {
    chips.push({
      key: 'sub',
      label: '投稿资源',
      tone: 'neutral',
      title: '提供投稿须知 / LaTeX 模板(Max 会员可下载)',
    });
  }
  return chips;
}

export function JournalResultRow({
  journal: j,
  onOpen,
  variant = 'metrics',
  recommend,
  actionLabel = '查看详情',
  selected = false,
}: {
  journal: Journal;
  onOpen?: () => void;
  variant?: JournalCardVariant;
  recommend?: JournalRecommendScore;
  actionLabel?: string;
  selected?: boolean;
}) {
  const score =
    recommend ?? (variant === 'recommend' ? deriveRecommendScore(j) : undefined);
  const chips = pickJournalChips(j, score);

  return (
    <article
      className={cn(RESULT_ROW_CLASS, selected && 'bg-brand-red/5')}
    >
      <JournalCover
        id={j.id}
        name={j.canonical_name}
        size="sm"
        className="mt-0.5"
      />
      <div className="min-w-0 flex-1">
        <h3
          onClick={onOpen}
          title={onOpen ? '查看期刊详情' : undefined}
          className={cn(
            RESULT_ROW_TITLE_CLASS,
            selected && 'text-brand-red',
            onOpen && !selected && 'cursor-pointer hover:text-brand-red',
            onOpen && selected && 'cursor-pointer',
          )}
        >
          {j.canonical_name}
        </h3>

        <div className={RESULT_ROW_META_CLASS}>
          <div className="flex min-w-0 flex-1 items-center gap-1">
            <span className="min-w-0 truncate" title={j.publisher ?? undefined}>
              {j.publisher ?? '出版社未知'}
            </span>
            {j.country && (
              <>
                <span className="shrink-0 text-faint">·</span>
                <span className="shrink-0">{j.country}</span>
              </>
            )}
          </div>
          {j.type && (
            <span className="shrink-0 uppercase text-faint">{j.type}</span>
          )}
        </div>

        {chips.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {chips.map((c) => (
              <span key={c.key} title={c.title} className={rowChipClass(c.tone)}>
                {c.label}
              </span>
            ))}
          </div>
        )}

        {score && (
          <p className={RESULT_ROW_ABSTRACT_CLASS}>
            {score.fitLabel} · {score.fitSub}
          </p>
        )}

        <div className="mt-2 flex items-center gap-2">
          {(j.source_count ?? 0) > 0 && (
            <span className="text-12 text-faint">{j.source_count} 个数据源</span>
          )}
          {onOpen && (
            <button
              type="button"
              onClick={onOpen}
              className={cn(RESULT_ROW_ACTION_CLASS, 'ml-auto')}
            >
              {actionLabel}
              <ArrowUpRight className="size-3 shrink-0" strokeWidth={2.5} />
            </button>
          )}
        </div>
        <JournalCommentCarousel journalId={j.id} />
      </div>
    </article>
  );
}
