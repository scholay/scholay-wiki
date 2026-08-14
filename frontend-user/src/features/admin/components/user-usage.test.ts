import { describe, expect, it } from 'vitest';
import type { TokenBreakdownItem } from '../api/token-usage';
import type { UsageEvent } from '../api/usage-stats';
import { buildUserFeatureUsage, featureUsageLabel, usageActionLabel } from './user-usage';

const event = (feature: string, createdAt: string): UsageEvent => ({
  id: 1,
  user_id: 7,
  anon_id: '',
  feature,
  action: 'message',
  correlation_id: '',
  source: '',
  ip_address: '',
  user_agent: '',
  device_type: 'desktop',
  extra: null,
  created_at: createdAt,
});

const tokens = (key: string, calls: number, cost: number): TokenBreakdownItem => ({
  key,
  label: '',
  total_tokens: 10,
  input_tokens: 5,
  output_tokens: 5,
  cache_read_tokens: 0,
  cache_creation_tokens: 0,
  calls,
  cost_micro_yuan: cost,
  unpriced_calls: 0,
});

describe('buildUserFeatureUsage', () => {
  it('合并功能埋点和算力账本，不会丢失只存在于一侧的功能', () => {
    const rows = buildUserFeatureUsage(
      [event('paper_search', '2026-08-08T10:00:00Z'), event('claw', '2026-08-08T11:00:00Z')],
      [tokens('claw', 3, 2500), tokens('memory', 1, 100)],
    );

    expect(rows.map((row) => row.key)).toEqual(['claw', 'paper_search', 'memory']);
    expect(rows[0]).toMatchObject({ recentEvents: 1, aiCalls: 3, costMicroYuan: 2500 });
    expect(rows[2]).toMatchObject({ label: '记忆抽取', recentEvents: 0, aiCalls: 1 });
  });

  it('同一功能聚合近期记录并保留最后使用时间', () => {
    const rows = buildUserFeatureUsage([
      event('stat_lab', '2026-08-07T10:00:00Z'),
      event('stat_lab', '2026-08-08T09:00:00Z'),
    ], []);

    expect(rows[0]).toMatchObject({ label: '数据分析', recentEvents: 2, lastUsedAt: '2026-08-08T09:00:00Z' });
  });
});

describe('usage labels', () => {
  it('已知 code 显示中文，未知 code 原样回落', () => {
    expect(featureUsageLabel('journal_search')).toBe('期刊搜索');
    expect(featureUsageLabel('future_feature')).toBe('future_feature');
    expect(usageActionLabel('question')).toBe('提问');
    expect(usageActionLabel('future_action')).toBe('future_action');
  });
});
