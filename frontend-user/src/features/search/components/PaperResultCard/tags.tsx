import type { Paper } from '../../api/papers';
import type { JournalEnrichment } from '@/shared/api/journal-enrichment';

/**
 * 论文卡标签的 tone 集合:
 *   - solid-*  实色高亮(期刊分区 Q1/Q2/CCF 等强信号,white text on color bg)
 *   - red/green/blue/neutral  软底 + 主色字(辅助信息,如引用数/学科/OA)
 */
export type TagTone =
  | 'red'
  | 'green'
  | 'blue'
  | 'neutral'
  | 'solid-green'
  | 'solid-amber'
  | 'solid-red';

export interface CardTag {
  key: string;
  label: string;
  tone: TagTone;
}

/**
 * 渲染顺序(.pen `ZCVpw` 设计 → 实践扩展):
 *   1. 期刊分区:JCR Q1-Q4 / 中科院 1-4 区 / CCF A/B/C(实色,最醒目)
 *   2. IF 影响因子(浅灰)
 *   3. OA / 引用 / 学科(辅助)
 *   4. 预警(红色,警示)
 *
 * 颜色规则:Q1 / 1 区 / CCF A → 绿;Q2 / 2 区 / CCF B → 黄;其余 → 红/灰
 */
export function pickTags(
  p: Paper,
  j?: JournalEnrichment | null
): CardTag[] {
  const tags: CardTag[] = [];

  if (j?.jcr_quartile) {
    tags.push({
      key: 'jcr',
      label: `JCR ${j.jcr_quartile}`,
      tone: quartileTone(j.jcr_quartile),
    });
  }
  if (typeof j?.jcr_impact_factor === 'number' && j.jcr_impact_factor > 0) {
    tags.push({
      key: 'if',
      label: `IF ${j.jcr_impact_factor.toFixed(j.jcr_impact_factor >= 10 ? 1 : 2)}`,
      tone: 'neutral',
    });
  }
  if (j?.fqb_quartile) {
    const n = j.fqb_quartile.replace(/^Q/i, '').trim();
    if (/^[1-4]$/.test(n)) {
      tags.push({
        key: 'cas',
        label: `中科院 ${n} 区`,
        tone: quartileTone(`Q${n}`),
      });
    }
  }
  if (j?.xr_quartile) {
    const n = j.xr_quartile.replace(/^Q/i, '').trim();
    if (/^[1-4]$/.test(n)) {
      tags.push({
        key: 'xr',
        label: `新锐 ${n} 区`,
        tone: quartileTone(`Q${n}`),
      });
    }
  }
  if (j?.ccf_rank) {
    const r = j.ccf_rank.toUpperCase();
    tags.push({
      key: 'ccf',
      label: `CCF ${r}`,
      tone:
        r === 'A' ? 'solid-green' : r === 'B' ? 'solid-amber' : 'solid-red',
    });
  }
  if (j?.gjqk_warning) {
    tags.push({ key: 'warn', label: '⚠ 预警期刊', tone: 'red' });
  }

  // OA 状态由标题旁的 "OA PDF" 跳转按钮表达,此处不再 chip
  if ((p.citationCount ?? 0) >= 100) {
    tags.push({
      key: 'hot',
      label: `${formatCount(p.citationCount!)} 引用`,
      tone: 'red',
    });
  } else if ((p.citationCount ?? 0) > 0) {
    tags.push({
      key: 'cite',
      label: `${p.citationCount} 引用`,
      tone: 'neutral',
    });
  }
  for (const fos of (p.fieldsOfStudy ?? []).slice(0, 2)) {
    tags.push({ key: `fos-${fos}`, label: fos, tone: 'blue' });
  }
  return tags;
}

function quartileTone(q: string): TagTone {
  const upper = q.toUpperCase();
  if (upper === 'Q1') return 'solid-green';
  if (upper === 'Q2') return 'solid-amber';
  return 'solid-red';
}

function formatCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

/** needsTranslation 已上移到 @/shared/api/translate,这里 re-export 保兼容 */
export { needsTranslation } from '@/shared/api/translate';

/** 关键词高亮:用 <mark> 包住命中片段 */
export function renderHighlight(text: string, q: string) {
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-warning-soft text-foreground">
        {text.slice(idx, idx + q.length)}
      </mark>
      {text.slice(idx + q.length)}
    </>
  );
}
