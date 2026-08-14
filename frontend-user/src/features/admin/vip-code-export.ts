import type { VipCode, VipCodeBatch } from './api/vip-codes';

export type CodeSeparatorKind =
  | 'newline'
  | 'comma'
  | 'chinese-comma'
  | 'space'
  | 'tab'
  | 'custom';

export interface CodeSeparatorInput {
  kind: CodeSeparatorKind;
  custom?: string;
}

const CODE_SEPARATORS: Record<Exclude<CodeSeparatorKind, 'custom'>, string> = {
  newline: '\n',
  comma: ',',
  'chinese-comma': '，',
  space: ' ',
  tab: '\t',
};

/** 把复制面板的分隔符选项解析成真正要写入剪贴板的字符串。 */
export function resolveCodeSeparator(input: CodeSeparatorInput): string {
  if (input.kind !== 'custom') return CODE_SEPARATORS[input.kind];
  if (!input.custom) return '\n';
  return input.custom.replace(/\\n/g, '\n').replace(/\\t/g, '\t');
}

/** 复制内容只包含可分发的码本身，顺序与批次详情接口一致。 */
export function buildVipCodeCopyText(
  codes: VipCode[],
  separator: string,
): string {
  return codes.map((item) => item.code).join(separator);
}

export const VIP_CODE_EXCEL_HEADERS = [
  '批次 ID',
  '兑换码 ID',
  '兑换码',
  '发放类型',
  '会员等级',
  '授予数量',
  '授予单位',
  '发放经费',
  '经费类型',
  '经费有效天数',
  '已兑换次数',
  '最大兑换次数',
  '剩余兑换次数',
  '状态',
  '有效期至',
  '停用时间',
  '最近兑换用户 ID',
  '最近兑换时间',
  '备注',
  '创建管理员 ID',
  '生成时间',
] as const;

export type VipCodeExcelRow = Record<
  (typeof VIP_CODE_EXCEL_HEADERS)[number],
  string | number
>;

/**
 * 防止管理员备注等文本被 Excel / WPS 当作公式执行。
 * 一些表格软件会忽略前导空白，所以连同控制字符一起检查。
 */
export function escapeExcelText(value: string): string {
  return /^[\u0000-\u0020]*[=+@-]/.test(value) ? `'${value}` : value;
}

function text(value: string | null | undefined): string {
  return escapeExcelText(value ?? '');
}

function codeStatus(code: VipCode): string {
  if (code.revoked_at) return '已停用';
  if (code.used_count >= Math.max(1, code.max_uses)) return '已用完';
  if (code.valid_until) {
    const expiresAt = new Date(code.valid_until).getTime();
    if (Number.isFinite(expiresAt) && expiresAt < Date.now()) return '已过期';
  }
  return '可兑换';
}

/** 将一张兑换码映射成 Excel 行；独立导出以便测试字段完整性与公式注入防护。 */
export function buildVipCodeExcelRow(
  batch: VipCodeBatch,
  code: VipCode,
): VipCodeExcelRow {
  // 旧单次码可能没有 max_uses，后端兑换判定一律把 0 视为 1。导出也必须同口径。
  const effectiveMaxUses = Math.max(1, code.max_uses);
  return {
    '批次 ID': text(code.batch_id || batch.batch_id),
    '兑换码 ID': code.id,
    兑换码: text(code.code),
    发放类型: text(code.grant_kind),
    会员等级: text(code.grant_tier),
    授予数量: code.grant_days,
    授予单位: text(code.grant_unit),
    发放经费: code.grant_credits,
    经费类型: text(code.credit_kind),
    经费有效天数: code.credit_validity_days,
    已兑换次数: code.used_count,
    最大兑换次数: effectiveMaxUses,
    剩余兑换次数: Math.max(0, effectiveMaxUses - code.used_count),
    状态: codeStatus(code),
    有效期至: text(code.valid_until),
    停用时间: text(code.revoked_at),
    '最近兑换用户 ID': code.redeemed_by_user_id ?? '',
    最近兑换时间: text(code.redeemed_at),
    备注: text(code.note),
    '创建管理员 ID': code.created_by ?? '',
    生成时间: text(code.created_at),
  };
}

export function buildVipCodeExcelRows(
  batch: VipCodeBatch,
  codes: VipCode[],
): VipCodeExcelRow[] {
  return codes.map((code) => buildVipCodeExcelRow(batch, code));
}

/** 清理用于下载文件名的批次标识，兼容 Windows / macOS 的保留字符与保留名。 */
export function safeExcelFilenamePart(value: string): string {
  let safe = value
    .normalize('NFKC')
    .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, '-')
    .replace(/^\.+|\.+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
  if (!safe) safe = 'batch';
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(safe))
    safe = `_${safe}`;
  return safe;
}

/** 导出完整批次。SheetJS 只在管理员真正点击导出时才加载。 */
export async function exportVipCodeBatchToExcel(
  batch: VipCodeBatch,
  codes: VipCode[],
): Promise<void> {
  const XLSX = await import('xlsx');
  const rows = buildVipCodeExcelRows(batch, codes);
  const worksheet = XLSX.utils.json_to_sheet(rows, {
    header: [...VIP_CODE_EXCEL_HEADERS],
  });
  worksheet['!cols'] = [
    { wch: 38 },
    { wch: 12 },
    { wch: 24 },
    { wch: 12 },
    { wch: 12 },
    { wch: 12 },
    { wch: 12 },
    { wch: 12 },
    { wch: 12 },
    { wch: 16 },
    { wch: 14 },
    { wch: 16 },
    { wch: 16 },
    { wch: 12 },
    { wch: 22 },
    { wch: 22 },
    { wch: 20 },
    { wch: 22 },
    { wch: 36 },
    { wch: 18 },
    { wch: 22 },
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, '兑换码');
  const batchPart = safeExcelFilenamePart(batch.batch_id);
  XLSX.writeFile(workbook, `会员兑换码批次-${batchPart}.xlsx`, {
    compression: true,
  });
}
