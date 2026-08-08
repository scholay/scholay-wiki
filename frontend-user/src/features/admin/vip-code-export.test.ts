import { describe, expect, it, vi } from 'vitest';
import type { VipCode, VipCodeBatch } from './api/vip-codes';
import {
  VIP_CODE_EXCEL_HEADERS,
  buildVipCodeCopyText,
  buildVipCodeExcelRow,
  buildVipCodeExcelRows,
  escapeExcelText,
  exportVipCodeBatchToExcel,
  resolveCodeSeparator,
  safeExcelFilenamePart,
} from './vip-code-export';

const xlsx = vi.hoisted(() => ({
  jsonToSheet: vi.fn(() => ({})),
  bookNew: vi.fn(() => ({ SheetNames: [], Sheets: {} })),
  appendSheet: vi.fn(),
  writeFile: vi.fn(),
}));

vi.mock('xlsx', () => ({
  utils: {
    json_to_sheet: xlsx.jsonToSheet,
    book_new: xlsx.bookNew,
    book_append_sheet: xlsx.appendSheet,
  },
  writeFile: xlsx.writeFile,
}));

const batch = (overrides: Partial<VipCodeBatch> = {}): VipCodeBatch => ({
  batch_id: 'batch-001',
  code_count: 1,
  available_count: 1,
  exhausted_count: 0,
  expired_count: 0,
  revoked_count: 0,
  total_used_count: 1,
  total_max_uses: 3,
  grant_kind: 'tier',
  grant_tier: 'pro',
  grant_days: 1,
  grant_unit: 'month',
  grant_credits: 0,
  credit_kind: 'perm',
  credit_validity_days: 30,
  max_uses: 3,
  valid_until: '2099-09-01T00:00:00Z',
  note: '',
  created_by: 9,
  created_at: '2026-08-08T09:00:00Z',
  config_variant_count: 1,
  mixed: false,
  ...overrides,
});

const code = (overrides: Partial<VipCode> = {}): VipCode => ({
  id: 11,
  batch_id: 'batch-001',
  code: 'ABCD-EFGH-JKMP-2345',
  grant_kind: 'tier',
  grant_tier: 'pro',
  grant_days: 1,
  grant_unit: 'month',
  grant_credits: 0,
  credit_kind: 'perm',
  credit_validity_days: 30,
  max_uses: 3,
  used_count: 1,
  revoked_at: null,
  valid_until: '2099-09-01T00:00:00Z',
  redeemed_by_user_id: 42,
  redeemed_at: '2026-08-09T10:00:00Z',
  note: '暑期活动',
  created_by: 9,
  created_at: '2026-08-08T09:00:00Z',
  ...overrides,
});

describe('resolveCodeSeparator', () => {
  it.each([
    ['newline', '\n'],
    ['comma', ','],
    ['chinese-comma', '，'],
    ['space', ' '],
    ['tab', '\t'],
  ] as const)('解析 %s 预设', (kind, expected) => {
    expect(resolveCodeSeparator({ kind })).toBe(expected);
  });

  it('解析自定义文本中的字面 \\n / \\t，空值回退换行', () => {
    expect(resolveCodeSeparator({ kind: 'custom', custom: ' |\\n\\t' })).toBe(
      ' |\n\t',
    );
    expect(resolveCodeSeparator({ kind: 'custom', custom: '' })).toBe('\n');
    expect(resolveCodeSeparator({ kind: 'custom' })).toBe('\n');
  });
});

it('按详情顺序只拼接兑换码', () => {
  const codes = [code({ code: 'FIRST' }), code({ id: 12, code: 'SECOND' })];
  expect(buildVipCodeCopyText(codes, '，')).toBe('FIRST，SECOND');
  expect(buildVipCodeCopyText([], ',')).toBe('');
});

describe('Excel row mapping', () => {
  it('覆盖全部兑换码字段并保留数值类型', () => {
    const row = buildVipCodeExcelRow(batch(), code());
    expect(Object.keys(row)).toEqual([...VIP_CODE_EXCEL_HEADERS]);
    expect(row['批次 ID']).toBe('batch-001');
    expect(row['兑换码 ID']).toBe(11);
    expect(row['授予数量']).toBe(1);
    expect(row['已兑换次数']).toBe(1);
    expect(row['剩余兑换次数']).toBe(2);
    expect(row['状态']).toBe('可兑换');
    expect(row['最近兑换用户 ID']).toBe(42);
  });

  it('阻断带前导空白的 Excel 公式注入', () => {
    expect(escapeExcelText('=1+1')).toBe('\u0027=1+1');
    expect(escapeExcelText('  @SUM(A:A)')).toBe('\u0027  @SUM(A:A)');
    expect(escapeExcelText('normal')).toBe('normal');

    const row = buildVipCodeExcelRow(
      batch({ batch_id: '+batch' }),
      code({
        batch_id: '',
        code: '=CMD()',
        grant_tier: '@tier',
        note: '-danger',
      }),
    );
    expect(row['批次 ID']).toBe('\u0027+batch');
    expect(row['兑换码']).toBe('\u0027=CMD()');
    expect(row['会员等级']).toBe('\u0027@tier');
    expect(row['备注']).toBe('\u0027-danger');
  });

  it('映射批次中的每一张码', () => {
    expect(
      buildVipCodeExcelRows(batch(), [code(), code({ id: 12 })]),
    ).toHaveLength(2);
  });

  it('存量 max_uses=0 按后端口径视为单次可兑换', () => {
    const row = buildVipCodeExcelRow(
      batch(),
      code({ max_uses: 0, used_count: 0 }),
    );
    expect(row['最大兑换次数']).toBe(1);
    expect(row['剩余兑换次数']).toBe(1);
    expect(row['状态']).toBe('可兑换');
  });
});

it('清理非法文件名字符、保留名与空值', () => {
  expect(safeExcelFilenamePart('a/b:*?<>|"c')).toBe('a-b-c');
  expect(safeExcelFilenamePart('CON')).toBe('_CON');
  expect(safeExcelFilenamePart('...')).toBe('batch');
});

it('按需生成工作簿并使用安全文件名', async () => {
  xlsx.jsonToSheet.mockClear();
  xlsx.bookNew.mockClear();
  xlsx.appendSheet.mockClear();
  xlsx.writeFile.mockClear();

  await exportVipCodeBatchToExcel(batch({ batch_id: 'summer/2026' }), [code()]);

  expect(xlsx.jsonToSheet).toHaveBeenCalledWith(expect.any(Array), {
    header: [...VIP_CODE_EXCEL_HEADERS],
  });
  expect(xlsx.appendSheet).toHaveBeenCalledWith(
    expect.anything(),
    expect.anything(),
    '兑换码',
  );
  expect(xlsx.writeFile).toHaveBeenCalledWith(
    expect.anything(),
    '会员兑换码批次-summer-2026.xlsx',
    { compression: true },
  );
});
