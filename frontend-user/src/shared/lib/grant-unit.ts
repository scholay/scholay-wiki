// 会员授予时长的「单位」——  镜像 backend/internal/vip/billing_model.go
// (GrantUnitDay/Month/Year · NormGrantUnit · GrantUnitLabel · service.go maxGrantAmount)。
//
// 存在理由:day|month|year 这三个裸值会在「后台发放会员 / 生成兑换码 / 改兑换码时长 /
// 兑换码列表 / 用户端兑换预览 / 用户兑换记录」多处同时被渲染成中文。各处自己写一份三元的
// 下场是同一个 month 在 A 处叫「月」B 处叫「个月」,而运营/用户判断「这张码到底发多久」
// 就只有这一行字 —— 不一致等于发错码。

export type GrantUnit = 'day' | 'month' | 'year';

/** 选择器的选项顺序(短 → 长)。 */
export const GRANT_UNITS: readonly GrantUnit[] = ['day', 'month', 'year'];

/** 单位中文名。与后端 vip.GrantUnitLabel 同口径 —— month 是「个月」不是「月」。 */
export const GRANT_UNIT_LABEL: Record<GrantUnit, string> = {
  day: '天',
  month: '个月',
  year: '年',
};

/**
 * 归一化,镜像后端 NormGrantUnit:未知 / 空串一律回落 day。
 *
 * 🔴 空串是**存量数据的正常值**(迁移 0110 之前生成的兑换码 grant_unit 为空),不是脏数据 ——
 * 回落成「天」正是它原本的语义,所以这里不能给占位符、更不能报错。
 */
export function normGrantUnit(u?: string | null): GrantUnit {
  return u === 'month' || u === 'year' ? u : 'day';
}

/**
 * 各单位的数量上界,与后端 service.go maxGrantAmount 一致:天 3650 / 月 120 / 年 10。
 * 前端夹取只是给个即时反馈(后端同样会夹),别把它当校验真源。
 */
export function maxGrantAmount(u?: string | null): number {
  const unit = normGrantUnit(u);
  if (unit === 'year') return 10;
  if (unit === 'month') return 120;
  return 3650;
}

/**
 * 「30天」/「3个月」/「1年」—— 数量与单位必须永远一起出现。
 * 只渲染数量的话,列表里一个孤零零的「1」既可能是 1 天也可能是 1 年。
 */
export function formatGrantDuration(amount: number, unit?: string | null): string {
  return `${amount}${GRANT_UNIT_LABEL[normGrantUnit(unit)]}`;
}
