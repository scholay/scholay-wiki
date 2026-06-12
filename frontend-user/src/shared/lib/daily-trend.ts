/**
 * 时间序列图表共用工具 —— 统一两件事:
 *   1)「今日(最后一桶)是进行中数据」→ 折线/面积用**虚线段**画出来,提示"还没结束、非最终值";
 *   2) 上游已把缺口补 0(后端 fillDailyGaps),这里只负责把序列拆成 solid+live 两套字段给 recharts。
 *
 * 用法(每个 metric key 调一次):buildDailyTrend(rows, { valueKeys:['value'] }) → { data, isLive }。
 * 图里每个 metric 画两条:`<Area/Line dataKey="k__main">`(实线,到昨天)+
 * `<Line dataKey="k__live" strokeDasharray>`(虚线,昨天→今天)。原 key 保留供自定义 Tooltip 读真值。
 *
 * 柱状图不能虚线 → 用 todayFadeOpacity + isLiveBar 给"今天那根柱"降透明度(见各 Bar 图)。
 */

/** 本地(容器=北京)日期 YYYY-MM-DD。不能用 toISOString()(那是 UTC,跨日会错一天)。 */
export function localDateKey(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export interface BuildDailyTrendOptions {
  /** 日期字段名,默认 'date' */
  dateKey?: string;
  /** 要拆 solid/live 的数值字段 */
  valueKeys: string[];
  /** 覆盖"今天"(默认本地今天);桶值需与 dateKey 同格式(YYYY-MM-DD) */
  today?: string;
}

export interface DailyTrendResult<T> {
  data: Array<T & Record<string, number | null>>;
  /** 最后一桶 = 今天(存在进行中数据)→ 图里画虚线段 / 柱降透明度 */
  isLive: boolean;
}

/**
 * 把日序列拆成:
 *   `${k}__main` —— 实线/面积,画到**昨天**(今天那点置 null,让实线停住);非 live 时即完整序列。
 *   `${k}__live` —— 虚线,只在 [昨天, 今天] 两点有值(连出"进行中"那一段);非 live 时全 null。
 * 原始 `${k}` 不动(自定义 Tooltip 读它显示真值)。
 */
export function buildDailyTrend<T>(
  rows: readonly T[],
  opts: BuildDailyTrendOptions,
): DailyTrendResult<T> {
  const dateKey = opts.dateKey ?? 'date';
  const today = opts.today ?? localDateKey();
  // 内部按字典访问;调用方传具名接口数组即可(不要求 index signature)。
  const list = rows as ReadonlyArray<Record<string, unknown>>;
  const n = list.length;
  // 取桶日期前 10 位比对,兼容 "YYYY-MM-DD" 与 "YYYY-MM-DD HH:mm:ss"(umami)两种形态。
  const liveIdx = n > 0 && String(list[n - 1][dateKey] ?? '').slice(0, 10) === today ? n - 1 : -1;

  const data = list.map((r, i) => {
    const out: Record<string, unknown> = { ...r };
    for (const k of opts.valueKeys) {
      const v = (r[k] as number) ?? 0;
      if (liveIdx < 0) {
        out[`${k}__main`] = v;
        out[`${k}__live`] = null;
      } else {
        out[`${k}__main`] = i < liveIdx ? v : null;
        out[`${k}__live`] = i === liveIdx - 1 || i === liveIdx ? v : null;
      }
    }
    return out;
  });

  return { data: data as Array<T & Record<string, number | null>>, isLive: liveIdx >= 0 };
}

/** 柱状图:某行是否是"今天那根"(降透明度用)。 */
export function isTodayBucket(dateValue: string, today: string = localDateKey()): boolean {
  return dateValue === today;
}
