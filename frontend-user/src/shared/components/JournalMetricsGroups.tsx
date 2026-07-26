import type { JournalListUnified } from '@/shared/api/types';

/**
 * 期刊「全部指标」分组卡 —— 把 /public/journals/get full=1 返回、但详情页主区没铺开的
 * 几十个字段按数据源分组展示(JCR / 中科院 / 新锐 / SCImago / CCF / OpenAlex / 审稿 /
 * 收录 / 预警)。每组只在有数据时渲染,空组、空字段自动隐藏。
 *
 * 放 shared/components:期刊详情 pane(features/browser)与未来移动端详情共用。
 */

type Cell = readonly [label: string, value: string | null];

interface Group {
  title: string;
  items: Cell[];
}

/** 去空白 / "null" → null */
function s(v: string | number | null | undefined): string | null {
  if (v == null) return null;
  const t = String(v).trim();
  return t && t.toLowerCase() !== 'null' ? t : null;
}

/** 整数千分位;非数字(含 0)→ null */
function n(v: number | string | null | undefined): string | null {
  const num = typeof v === 'number' ? v : v != null ? Number(v) : NaN;
  if (!Number.isFinite(num) || num <= 0) return null;
  return Math.round(num).toLocaleString('en-US');
}

/** 年份:正整数年 → 字符串,否则 null */
function yr(v: number | string | null | undefined): string | null {
  const num = typeof v === 'number' ? v : v != null ? parseInt(String(v), 10) : NaN;
  return Number.isFinite(num) && num > 1800 ? String(num) : null;
}

/** "是"/true/"1" → "Top 期刊";否则 null */
function top(v: string | boolean | null | undefined): string | null {
  return v === '是' || v === true || v === '1' ? 'Top 期刊' : null;
}

export function JournalMetricsGroups({ unified }: { unified: JournalListUnified }) {
  const u = unified;
  const raw: Group[] = [
    {
      title: 'JCR · 科睿唯安',
      items: [
        ['影响因子', s(u.jcr_impact_factor)],
        ['JCR 分区', s(u.jcr_quartile)],
        ['数据年份', yr(u.jcr_year)],
      ],
    },
    {
      title: '中科院基础版分区',
      items: [
        ['大类学科', s(u.fqb_major_category)],
        ['大类分区', s(u.fqb_major_quartile)],
        ['Top 期刊', top(u.fqb_top)],
        ['数据年份', yr(u.fqb_year)],
      ],
    },
    {
      title: '中科院新锐分区',
      items: [
        ['大类学科', s(u.xr_major_category_cn) ?? s(u.xr_major_category)],
        ['新锐分区', s(u.xr_major_quartile)],
        ['Top 期刊', top(u.xr_top)],
        ['数据年份', yr(u.xr_year)],
      ],
    },
    {
      title: 'SCImago',
      items: [
        ['SJR', s(u.scimago_sjr)],
        ['最佳分区', s(u.scimago_best_quartile)],
        ['数据年份', yr(u.scimago_year)],
      ],
    },
    {
      title: 'CCF 推荐',
      items: [
        ['等级', u.ccf_rank ? `CCF ${String(u.ccf_rank).toUpperCase()}` : null],
        ['领域', s(u.ccf_field)],
        ['数据年份', yr(u.ccf_year)],
      ],
    },
    {
      title: 'OpenAlex',
      items: [
        ['发文量', n(u.openalex_works_count)],
        ['被引量', n(u.openalex_cited_by_count)],
        ['h-index', n(u.openalex_h_index)],
        ['近两年篇均被引', s(u.openalex_2yr_mean_citedness)],
      ],
    },
    {
      title: '审稿周期 · SciRev',
      items: [
        ['平均初审(月)', s(u.scirev_first_review_months)],
        ['综合评分', s(u.scirev_overall_rating)],
      ],
    },
    {
      title: '收录与标识',
      items: [
        ['DOAJ 收录', u.doaj_is_in_doaj === 1 || u.doaj_is_in_doaj === true ? '是' : null],
        ['Crossref DOI 总数', n(u.crossref_total_dois)],
        ['出版社', s(u.crossref_publisher) ?? s(u.doaj_publisher)],
        ['期刊中文名', s(u.wikidata_label_zh)],
      ],
    },
    {
      title: '国际期刊预警',
      items: [
        ['预警等级', s(u.gjqk_warning_level)],
        ['数据年份', yr(u.gjqk_year)],
      ],
    },
  ];

  // 丢掉空字段、空分组
  const groups = raw
    .map((g) => ({
      title: g.title,
      items: g.items.filter((it): it is Cell => it[1] != null),
    }))
    .filter((g) => g.items.length > 0);

  if (groups.length === 0) return null;

  return (
    <section className="space-y-3">
      <h2 className="font-display font-bold text-lg leading-none text-foreground">
        全部指标
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {groups.map((g) => (
          <div
            key={g.title}
            className="rounded-16 bg-surface-card border border-border p-4 space-y-2.5"
          >
            <div className="text-2xs font-bold uppercase text-faint">
              {g.title}
            </div>
            <dl className="space-y-1.5">
              {g.items.map(([label, value]) => (
                <div key={label} className="flex items-baseline justify-between gap-3 text-xs">
                  <dt className="shrink-0 text-muted-foreground">{label}</dt>
                  <dd className="min-w-0 truncate text-right font-medium text-foreground tabular-nums">
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
    </section>
  );
}
