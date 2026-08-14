import { describe, expect, it } from 'vitest';
import { normalizeMoneyDraft } from './numeric-input';

describe('normalizeMoneyDraft', () => {
  it.each([
    ['', ''],
    ['010', '10'],
    ['000', '0'],
    ['000.5', '0.5'],
    ['.5', '0.5'],
  ])('保留合法编辑态并规范前导零：%s → %s', (raw, expected) => {
    expect(normalizeMoneyDraft(raw)).toBe(expected);
  });

  it.each([
    ['12.3', '12.3'],
    ['12.34', '12.34'],
    ['12.345', '12.34'],
  ])('默认最多保留两位小数：%s → %s', (raw, expected) => {
    expect(normalizeMoneyDraft(raw)).toBe(expected);
  });

  it.each(['-1', '1e2', '1.2.3'])(
    '拒绝负数、科学计数法和多个小数点：%s',
    (raw) => {
      expect(normalizeMoneyDraft(raw)).toBeNull();
    },
  );
});
