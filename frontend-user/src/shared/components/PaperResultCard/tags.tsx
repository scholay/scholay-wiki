import type { Paper } from '@/shared/api/types';
import type { JournalEnrichment } from '@/shared/api/journal-enrichment';

/**
 * 论文卡标签的 tone 集合 —— 2026-07-27 重设计。
 *
 * ── 改版前的问题(照着截图逐条对) ────────────────────────────────────────────
 *   1. JCR Q1 / 中科院 1 区 / 新锐 1 区 三个都是**松青实底**,并排三块深绿,
 *      既分不出是三套不同的评价体系,又把整张卡的视觉重心全吸走了。
 *   2. 引用数用 `red`(朱砂软底)—— 朱砂在本设计系统里是 **danger / CTA** 语义,
 *      而"被引 3.8k"是彻头彻尾的**正面**信号,配色与语义相反。
 *   3. 学科用 cat-blue —— 那是给头像/期刊封面做哈希取色的**分类色**,
 *      不是品牌四色之一。结果整张卡里最跳的蓝色,给了最弱的信息。
 *   4. 一行里 6-7 个 chip 全是填充块,没有层级,眼睛无处落点。
 *
 * ── 重设计的依据(全部实测,不是感觉) ────────────────────────────────────────
 *   卡片压在**米白 #F6F4EE** 上(SearcherColumn 是 bg-background,卡本身无底色)。
 *   · 软底方案直接出局:松青/琥珀/玄墨在 ≤20% 透明度下,chip 底对页面底都 <1.5:1,
 *     根本读不出"这是一个 chip"。这也正是原作者只能用实底的原因。
 *   · 描边要 ≥70% 才够 WCAG 1.4.11 的 3:1(松青 70% = 3.94:1)。
 *   · **琥珀做描边永远不达标** —— 100% 也只有 1.92:1,它本身太浅。
 *     所以中档改用 --amber-soft-fg(#664B00),同色系但够深(7.43:1)。
 *
 * ── 现在的层级 ──────────────────────────────────────────────────────────────
 *   tier-high  Q1 / 1 区 / CCF A   松青描边 + 松青字     边 3.94:1  字 8.62:1
 *   tier-mid   Q2 / 2 区 / CCF B   深琥珀描边 + 深琥珀字  边/字 7.43:1
 *   neutral    Q3-4 / IF / 引用     faint 描边 + subtle 字 边 4.58:1  字 7.25:1
 *   alert      预警期刊             **朱砂实底白字** ← 全行唯一实底
 *   field      学科                 无描边,仅 faint 文字 ← 最弱信号给最弱形式
 *
 *   三个"1 区"仍然同色 —— 那是**对的**:三套体系一致判它顶级,本身就是信息。
 *   问题从来不是重复,是重复的**重量**。改成描边后它们轻了,但仍然连成一片可读的绿。
 *   全行只留一个实底给「预警期刊」,因为那是唯一需要打断阅读的信息。
 *
 * 形状按 Figma §4.2 用胶囊(设计稿 Badge 是 46×23 胶囊),高度 h-5 取代原先的
 * arbitrary value h-[18px]。
 *
 * ⚠️ 同一套分区徽章在仓库里还有 4 份独立副本(JournalBadges / PdfUploadDecide /
 *    MinicodJournalCards / JournalExploreOverview),各自写死"Q1=松青实底"。
 *    本次只改搜索结果卡;要全站统一得把它们收口到一处,是另一件事。
 */
export type TagTone =
  | 'tier-high'   // Q1 / 1 区 / CCF A —— 松青描边
  | 'tier-mid'    // Q2 / 2 区 / CCF B —— 深琥珀描边(原色琥珀做描边不达标)
  | 'neutral'     // Q3-4 / IF / 引用数 —— faint 描边
  | 'alert'       // 预警期刊 —— 全行唯一实底
  | 'field';      // 学科 —— 无 chip,仅 faint 文字

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
      tone: r === 'A' ? 'tier-high' : r === 'B' ? 'tier-mid' : 'neutral',
    });
  }
  if (j?.gjqk_warning) {
    // 全行唯一的实底 —— 预警是需要打断阅读的信息,值得这份重量。
    tags.push({ key: 'warn', label: '⚠ 预警期刊', tone: 'alert' });
  }

  // OA 状态由操作行的 PDF 跳转按钮表达,此处不再 chip
  if ((p.citationCount ?? 0) >= 100) {
    tags.push({
      key: 'hot',
      label: `${formatCount(p.citationCount!)} 引用`,
      // 曾经是 'red' —— 朱砂=danger,而高被引是正面信号,语义相反,已改中性。
      tone: 'neutral',
    });
  } else if ((p.citationCount ?? 0) > 0) {
    tags.push({
      key: 'cite',
      label: `${p.citationCount} 引用`,
      tone: 'neutral',
    });
  }
  for (const fos of (p.fieldsOfStudy ?? []).slice(0, 2)) {
    tags.push({ key: `fos-${fos}`, label: fos, tone: 'field' });
  }
  return tags;
}

function quartileTone(q: string): TagTone {
  const upper = q.toUpperCase();
  if (upper === 'Q1') return 'tier-high';
  if (upper === 'Q2') return 'tier-mid';
  // Q3/Q4 归中性,不再用朱砂 —— 三四区是"一般",不是"危险"。
  return 'neutral';
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
