import { cn } from '@/shared/lib/utils';

/**
 * 期刊分区/影响因子徽章 —— 与 PC 论文卡(features/search PaperResultCard/tags.tsx)
 * 同口径、同配色,抽到 shared 供移动端搜索结果复用:
 *   JCR Q1-Q4 / 中科院 1-4 区 / CCF A/B/C(实色,最醒目)+ IF 影响因子(浅灰)+ ⚠ 预警(红)。
 * Q1·1区·CCF A → 绿;Q2·2区·CCF B → 黄;其余 → 红。
 *
 * 入参用结构化子集(只取算徽章要的字段)→ 论文结果传期刊增强 JournalEnrichment、
 * 期刊结果直接传 Journal,都满足,无需各自适配。
 */
export interface JournalBadgeInput {
  jcr_quartile?: string;
  jcr_impact_factor?: number;
  fqb_quartile?: string;
  /** 中科院「新锐分区」单数字 "1"-"4" */
  xr_quartile?: string;
  ccf_rank?: string;
  gjqk_warning?: boolean;
}

type Tone = 'solid-green' | 'solid-amber' | 'solid-red' | 'neutral' | 'red';

interface JournalBadge {
  key: string;
  label: string;
  tone: Tone;
}

function quartileTone(q: string): Tone {
  const u = q.toUpperCase();
  if (u === 'Q1') return 'solid-green';
  if (u === 'Q2') return 'solid-amber';
  return 'solid-red';
}

/** 从期刊增强 / 期刊数据算出徽章列表(无数据 → 空)。 */
export function journalBadges(j?: JournalBadgeInput | null): JournalBadge[] {
  const out: JournalBadge[] = [];
  if (!j) return out;
  if (j.jcr_quartile) {
    out.push({ key: 'jcr', label: `JCR ${j.jcr_quartile}`, tone: quartileTone(j.jcr_quartile) });
  }
  if (typeof j.jcr_impact_factor === 'number' && j.jcr_impact_factor > 0) {
    out.push({
      key: 'if',
      label: `IF ${j.jcr_impact_factor.toFixed(j.jcr_impact_factor >= 10 ? 1 : 2)}`,
      tone: 'neutral',
    });
  }
  if (j.fqb_quartile) {
    const n = j.fqb_quartile.replace(/^Q/i, '').trim();
    if (/^[1-4]$/.test(n)) {
      out.push({ key: 'cas', label: `中科院 ${n} 区`, tone: quartileTone(`Q${n}`) });
    }
  }
  if (j.xr_quartile) {
    const n = j.xr_quartile.replace(/^Q/i, '').trim();
    if (/^[1-4]$/.test(n)) {
      out.push({ key: 'xr', label: `新锐 ${n} 区`, tone: quartileTone(`Q${n}`) });
    }
  }
  if (j.ccf_rank) {
    const r = j.ccf_rank.toUpperCase();
    out.push({
      key: 'ccf',
      label: `CCF ${r}`,
      tone: r === 'A' ? 'solid-green' : r === 'B' ? 'solid-amber' : 'solid-red',
    });
  }
  if (j.gjqk_warning) {
    out.push({ key: 'warn', label: '⚠ 预警', tone: 'red' });
  }
  return out;
}

const TONE_CLS: Record<Tone, string> = {
  'solid-green' : 'bg-brand-green text-on-brand',
  'solid-amber' : 'bg-brand-amber text-on-brand',
  'solid-red' : 'bg-brand-red text-on-brand',
  neutral: 'bg-surface-2 text-subtle font-medium',
  red: 'bg-danger-soft text-brand-red',
};

/** 渲染一组期刊徽章 chip(无数据时不渲染任何东西,由调用方决定布局容器)。 */
export function JournalBadges({
  enrichment,
  className,
}: {
  enrichment?: JournalBadgeInput | null;
  className?: string;
}) {
  const badges = journalBadges(enrichment);
  if (badges.length === 0) return null;
  return (
    <>
      {badges.map((b) => (
        <span
          key={b.key}
          className={cn('rounded-pill px-2 py-0.5 text-12 font-medium', TONE_CLS[b.tone], className)}
        >
          {b.label}
        </span>
      ))}
    </>
  );
}
