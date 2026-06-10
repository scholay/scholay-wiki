import { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { cn } from '@/shared/lib/utils';

/** 表格预览上限 —— 防超大表把 DOM 撑爆;超出截断并提示。 */
const MAX_ROWS = 500;
const MAX_COLS = 60;

/**
 * 表格预览(xlsx / xls / csv / tsv)—— SheetJS 解析成行,渲染只读表格。多 sheet 给切换条。
 * 字节由父组件拉好传入(useClawArtifactBytes)。
 */
export function SpreadsheetPreview({ bytes }: { bytes: ArrayBuffer }) {
  const wb = useMemo<XLSX.WorkBook | null>(() => {
    try {
      return XLSX.read(bytes, { type: 'array' });
    } catch {
      return null;
    }
  }, [bytes]);

  const sheetNames = wb?.SheetNames ?? [];
  const [active, setActive] = useState(0);
  const safeActive = active < sheetNames.length ? active : 0;

  const { rows, truncatedRows } = useMemo(() => {
    if (!wb || sheetNames.length === 0) return { rows: [] as unknown[][], truncatedRows: false };
    const ws = wb.Sheets[sheetNames[safeActive]];
    if (!ws) return { rows: [] as unknown[][], truncatedRows: false };
    const all = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, blankrows: false, defval: '' });
    const clipped = all.slice(0, MAX_ROWS).map((r) => (Array.isArray(r) ? r.slice(0, MAX_COLS) : []));
    return { rows: clipped, truncatedRows: all.length > MAX_ROWS };
  }, [wb, sheetNames, safeActive]);

  if (!wb) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-sm text-muted-foreground">
        无法解析表格文件
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {sheetNames.length > 1 && (
        <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-border bg-surface-1 px-2 py-1">
          {sheetNames.map((name, i) => (
            <button
              key={name}
              type="button"
              onClick={() => setActive(i)}
              className={cn(
                'inline-flex shrink-0 items-center rounded-sm px-2 py-1 text-2xs transition-colors',
                i === safeActive ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-surface-2',
              )}
            >
              {name}
            </button>
          ))}
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-auto p-3">
        <table className="w-max border-collapse text-xs tabular-nums">
          <tbody>
            {rows.map((row, ri) => (
              <tr key={ri} className={ri === 0 ? 'bg-surface-1 font-semibold' : ''}>
                <td className="sticky left-0 border border-border bg-surface-2 px-1.5 py-1 text-center text-2xs text-faint">
                  {ri + 1}
                </td>
                {row.map((cell, ci) => (
                  <td
                    key={ci}
                    className="max-w-xs whitespace-pre-wrap break-words border border-border px-2 py-1 align-top text-subtle"
                  >
                    {cell == null ? '' : String(cell)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {truncatedRows && (
          <div className="px-1 py-2 text-2xs text-faint">已截断,仅预览前 {MAX_ROWS} 行 · 完整内容请下载</div>
        )}
      </div>
    </div>
  );
}
