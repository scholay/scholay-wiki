import type { TokenBreakdownItem } from '../api/token-usage';
import type { UsageEvent } from '../api/usage-stats';

const FEATURE_LABELS: Record<string, string> = {
  paper_search: '文献库检索',
  smart_search: '智能搜论文',
  journal_search: '期刊搜索',
  staging: '暂存',
  favorite: '收藏',
  matrix: '矩阵分析',
  peer_review: '智能审稿',
  claw: '智能助手',
  translate: '论文翻译',
  prism: '智能写作',
  boltslides: '制作PPT',
  sci_draw: '科研绘图',
  stat_lab: '数据分析',
  wechat_oa: '公众号',
  memory: '记忆抽取',
};

const ACTION_LABELS: Record<string, string> = {
  search: '搜索',
  question: '提问',
  message: '发送消息',
  edit: '编辑',
  dimension_edit: '编辑维度',
  translate: '翻译',
  stage: '加入暂存',
  favorite: '收藏',
  create: '创建草稿',
  step_2: '填写元数据',
  step_3: '编辑推荐信',
  step_4: '确认投递',
  submit: '提交',
};

export interface UserFeatureUsageRow {
  key: string;
  label: string;
  /** 已加载的最近 usage_events 中的条数，不一定是窗口全量。 */
  recentEvents: number;
  aiCalls: number;
  costMicroYuan: number;
  lastUsedAt: string | null;
}

export function featureUsageLabel(feature: string): string {
  return FEATURE_LABELS[feature] ?? feature;
}

export function usageActionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action;
}

/** 把业务埋点与 LLM 账本按 feature 合并，可同时看「用了什么」与「花了多少算力」。 */
export function buildUserFeatureUsage(
  events: UsageEvent[],
  tokenFeatures: TokenBreakdownItem[],
): UserFeatureUsageRow[] {
  const rows = new Map<string, UserFeatureUsageRow>();
  const get = (key: string, label?: string) => {
    const current = rows.get(key);
    if (current) return current;
    const created: UserFeatureUsageRow = {
      key,
      label: label || featureUsageLabel(key),
      recentEvents: 0,
      aiCalls: 0,
      costMicroYuan: 0,
      lastUsedAt: null,
    };
    rows.set(key, created);
    return created;
  };

  for (const event of events) {
    const row = get(event.feature);
    row.recentEvents += 1;
    if (!row.lastUsedAt || event.created_at > row.lastUsedAt) row.lastUsedAt = event.created_at;
  }
  for (const item of tokenFeatures) {
    const row = get(item.key || '(unknown)', item.label);
    row.aiCalls += item.calls;
    row.costMicroYuan += item.cost_micro_yuan;
  }

  return [...rows.values()].sort((a, b) => {
    if (a.lastUsedAt !== b.lastUsedAt) return (b.lastUsedAt ?? '').localeCompare(a.lastUsedAt ?? '');
    if (a.costMicroYuan !== b.costMicroYuan) return b.costMicroYuan - a.costMicroYuan;
    return b.recentEvents - a.recentEvents;
  });
}
