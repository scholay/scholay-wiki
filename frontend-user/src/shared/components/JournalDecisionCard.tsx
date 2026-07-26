import { CalendarClock, CheckCircle2, TriangleAlert, Unlock } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import type { Journal, JournalListUnified } from '@/shared/api/types';

/**
 * 投稿决策卡 —— 期刊详情页顶部的「该不该投 / 安不安全」TL;DR。
 *
 * 把分散在下方 IndexCards / MetricsGroups 里的关键投稿信号(影响因子、分区、
 * 开放获取与 DOAJ 正规性、初审周期、国际期刊预警)一句话综合 + 信号 chip,
 * 让用户不滚动就拿到选刊判断。数据全部复用详情页已取的 journal(规整态)+ unified
 * (full=1 原始态),零新增请求。
 *
 * SEO:直接回答「XX期刊几区 / 好发吗 / 审稿周期 / 是否开放获取」类高意图查询。
 */

function fmtIf(v: number | undefined): string | null {
  return v == null ? null : v.toFixed(1);
}

/** 优先级:中科院新锐 → JCR → 中科院基础。返回一句可读分区。 */
function bestQuartile(j: Journal): string | null {
  if (j.xr_quartile) {
    return `中科院新锐 ${j.xr_quartile} 区${j.xr_top ? ' · Top' : ''}`;
  }
  if (j.jcr_quartile) return `JCR ${j.jcr_quartile}`;
  if (j.fqb_quartile) return `中科院 ${j.fqb_quartile} 区`;
  return null;
}

/** SciRev 平均初审月数(原始字符串数值)→ 可读串。 */
function reviewMonths(u: JournalListUnified | undefined): string | null {
  const raw = u?.scirev_first_review_months;
  if (!raw) return null;
  const n = parseFloat(String(raw));
  if (!Number.isFinite(n) || n <= 0) return null;
  return `初审约 ${Number.isInteger(n) ? n : n.toFixed(1)} 个月`;
}

function inDoaj(u: JournalListUnified | undefined): boolean {
  const v = u?.doaj_is_in_doaj;
  return v === 1 || v === true;
}

export function JournalDecisionCard({
  journal,
  unified,
}: {
  journal: Journal;
  unified?: JournalListUnified;
}) {
  const ifStr = fmtIf(journal.jcr_impact_factor);
  const quartile = bestQuartile(journal);
  const review = reviewMonths(unified);
  const doaj = inDoaj(unified);
  const warned = !!journal.gjqk_warning;

  // 一句话综合 —— 只串有值的信号
  const parts: string[] = [];
  if (ifStr) parts.push(`影响因子 ${ifStr}`);
  if (quartile) parts.push(quartile);
  if (journal.ccf_rank) parts.push(`CCF ${journal.ccf_rank}`);
  parts.push(
    journal.is_oa ? (doaj ? '开放获取 · DOAJ 收录' : '开放获取') : '订阅期刊'
  );
  if (review) parts.push(review);

  // 没有任何可综合的信号就不渲染(避免空卡)
  if (parts.length <= 1 && !journal.is_oa && !warned) return null;

  return (
    <section
      className={cn(
        'rounded-16 border p-4 sm:p-5 space-y-3',
        warned
          ? 'border-brand-amber/40 bg-warning-soft'
          : 'border-border bg-surface-card'
      )}
    >
      <div className="flex items-center gap-2">
        <span className="text-12 font-medium uppercase text-faint">
          投稿决策
        </span>
      </div>

      {/* 一句话综合 */}
      <p className="text-14 leading-paragraph text-foreground">
        {parts.join(' · ')}。
      </p>

      {/* 信号 chip 行 */}
      <div className="flex items-center flex-wrap gap-2">
        {journal.is_oa && (
          <Signal
            icon={Unlock}
            tone="green"
            text={doaj ? '正规 OA(DOAJ)' : '开放获取'}
          />
        )}
        {review && (
          <Signal icon={CalendarClock} tone="neutral" text={review} />
        )}
        {!warned && !journal.is_oa && quartile && (
          <Signal icon={CheckCircle2} tone="neutral" text={quartile} />
        )}
        {warned && (
          <Signal
            icon={TriangleAlert}
            tone="amber"
            text="列入国际期刊预警名单"
          />
        )}
      </div>

      {warned && (
        <p className="text-12 leading-paragraph text-brand-amber">
          该刊出现在中科院《国际期刊预警名单》,投稿前请结合学科、最新名单与导师意见审慎评估。
        </p>
      )}

      <p className="text-12 text-faint">
        数据综合自 JCR、中科院分区、SciRev、DOAJ 等来源,仅供选刊参考。
      </p>
    </section>
  );
}

function Signal({
  icon: Icon,
  text,
  tone,
}: {
  icon: typeof Unlock;
  text: string;
  tone: 'green' | 'amber' | 'neutral';
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 h-7 px-2.5 rounded-pill text-12 font-medium',
        tone === 'green' && 'bg-brand-green/10 text-brand-green',
        tone === 'amber' && 'bg-brand-amber/10 text-brand-amber',
        tone === 'neutral' && 'bg-surface-2 text-subtle'
      )}
    >
      <Icon className="size-3.5" strokeWidth={2.4} />
      {text}
    </span>
  );
}
