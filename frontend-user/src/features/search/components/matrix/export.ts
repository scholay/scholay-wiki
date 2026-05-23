import type { Paper } from '@/shared/api/types';
import type { PaperAnalysisItem } from '../../api/analysis';

/**
 * 矩阵导出工具 —— 3 个用户友好格式:
 *   - CSV (.csv)  : 通用,Excel/Sheets/Numbers 都开;UTF-8 BOM 保证 Excel 中文不乱码
 *   - Markdown (.md): Notion/语雀/GitHub 直接粘贴渲染,纯字符串拼接无依赖
 *   - Excel (.xlsx): 真 xlsx 含 sheet 名 + 列宽 + bold 表头;
 *     `xlsx` 包 ~180KB,**dynamic import**(用户不点导出永不下载)
 *
 * 全部从同一 buildMatrixRows() 入手,确保 3 个格式行列一致。
 */

export interface ExportRow {
  paperTitle: string;
  // dimensionKey → value
  dims: Record<string, string>;
}

export interface DimensionMeta {
  dimensionKey: string;
  name: string;
}

/** 把暂存论文 + 分析结果合并成行级数据 —— 3 个格式共用这一份数据 */
export function buildMatrixRows(
  papers: Paper[],
  dimensions: DimensionMeta[],
  resultIndex: Map<string, PaperAnalysisItem>
): ExportRow[] {
  return papers.map((p) => {
    const r = resultIndex.get(p.paperId);
    const dims: Record<string, string> = {};
    for (const d of dimensions) {
      const raw = r?.data?.[d.dimensionKey] ?? r?.error ?? '';
      dims[d.dimensionKey] = flattenTagValue(raw);
    }
    return { paperTitle: p.title ?? p.paperId, dims };
  });
}

/**
 * 导出前的拍平:
 *   - prose + 内联 [[标签]]:去掉 [[ ]] 包裹符号(留下文字),
 *     例:"采用 [[扩散模型]] 设计" → "采用 扩散模型 设计"
 *   - 旧的 JSON 数组 `["a", "b"]` / `['a','b']`(向后兼容缓存):拍成 "a, b"
 *   - 其它 prose / 错误信息:原样返回
 */
function flattenTagValue(value: string): string {
  if (!value) return '';
  const trimmed = value.trim();
  // 数组兼容
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    const arr = tryParse(trimmed) ?? tryParse(trimmed.replace(/'/g, '"'));
    if (arr && arr.every((v) => typeof v === 'string')) {
      return arr.join(', ');
    }
  }
  // 去掉 [[xxx]] 标签包裹
  return value.replace(/\[\[([^\[\]\n]{1,40})\]\]/g, '$1');
}

function tryParse(s: string): unknown[] | null {
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}

const fileTimestamp = () => {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
};

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ============================================================================
// CSV
// ============================================================================

export function exportCsv(
  rows: ExportRow[],
  dimensions: DimensionMeta[],
  filenamePrefix = 'matrix'
) {
  const header = ['论文', ...dimensions.map((d) => d.name)];
  const lines = [header, ...rows.map((r) => [
    r.paperTitle,
    ...dimensions.map((d) => (r.dims[d.dimensionKey] ?? '').replace(/\n/g, ' ')),
  ])];
  const csv = lines
    .map((row) =>
      row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')
    )
    .join('\n');
  // U+FEFF BOM 让 Excel 识别 UTF-8,避免中文乱码
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  downloadBlob(blob, `${filenamePrefix}-${fileTimestamp()}.csv`);
}

// ============================================================================
// Markdown
// ============================================================================

/** Markdown 表格 cell 转义:管道 / 换行 都要处理 */
function mdCell(s: string): string {
  return String(s).replace(/\|/g, '\\|').replace(/\n/g, '<br>');
}

export function exportMarkdown(
  rows: ExportRow[],
  dimensions: DimensionMeta[],
  filenamePrefix = 'matrix'
) {
  const header = ['论文', ...dimensions.map((d) => d.name)];
  const sep = header.map(() => '---');
  const body = rows.map((r) => [
    mdCell(r.paperTitle),
    ...dimensions.map((d) => mdCell(r.dims[d.dimensionKey] ?? '')),
  ]);

  const lineToMd = (cells: string[]) => `| ${cells.join(' | ')} |`;
  const md =
    [lineToMd(header), lineToMd(sep), ...body.map(lineToMd)].join('\n') + '\n';

  const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
  downloadBlob(blob, `${filenamePrefix}-${fileTimestamp()}.md`);
}

// ============================================================================
// Excel (xlsx) —— dynamic import,180KB 不进首屏 chunk
// ============================================================================

export async function exportXlsx(
  rows: ExportRow[],
  dimensions: DimensionMeta[],
  filenamePrefix = 'matrix'
) {
  // 动态加载 SheetJS —— 只在用户点 Excel 导出时才下载
  const XLSX = await import('xlsx');

  const header = ['论文', ...dimensions.map((d) => d.name)];
  const aoa = [
    header,
    ...rows.map((r) => [
      r.paperTitle,
      ...dimensions.map((d) => r.dims[d.dimensionKey] ?? ''),
    ]),
  ];

  const ws = XLSX.utils.aoa_to_sheet(aoa);

  // 列宽:论文列宽一些(40 字符),其他维度列固定 25
  const colWidths = [{ wch: 40 }, ...dimensions.map(() => ({ wch: 25 }))];
  ws['!cols'] = colWidths;

  // 表头加 bold + 居中(SheetJS 社区版 cell styling 受限,这里只能改字体)
  const range = XLSX.utils.decode_range(ws['!ref']!);
  for (let c = range.s.c; c <= range.e.c; c++) {
    const addr = XLSX.utils.encode_cell({ r: 0, c });
    const cell = ws[addr];
    if (cell) {
      cell.s = { font: { bold: true } };
    }
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '矩阵分析');
  XLSX.writeFile(wb, `${filenamePrefix}-${fileTimestamp()}.xlsx`);
}
