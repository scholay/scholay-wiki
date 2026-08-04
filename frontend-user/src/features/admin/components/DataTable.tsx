import { useMemo, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronUp, ArrowUpDown } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { EmptyState } from '@/shared/components/EmptyState';
import { LoadingState } from '@/shared/components/LoadingState';
import { ResourceError } from '@/shared/components/ResourceError';
import { Checkbox } from '@/shared/ui/checkbox';

export interface Column<T> {
  /** 列头标题 */
  header: ReactNode;
  /** 单元格渲染 —— index 用于序号列、间隔色等 */
  cell: (row: T, index: number) => ReactNode;
  /** 列宽(默认自动) */
  width?: string | number;
  /** 右对齐(数字列) */
  align?: 'left' | 'right' | 'center';
  /** 列样式补丁 */
  className?: string;
  /**
   * 可排序 —— 指定一个值提取器,table 会用它做客户端排序。
   * 后端分页 + 客户端排序只对当前页有效;若需要跨页排序,改用 serverSortKey + DataTable.serverSort。
   */
  sortKey?: (row: T) => string | number | null | undefined;
  /**
   * 服务端排序键 —— 配合 DataTable 的 serverSort 使用。
   * 指定后该列表头点击会改服务端 sort 参数(跨页全量重排),并**覆盖** sortKey 的客户端排序。
   * 只有后端排序白名单内的列才该设(否则会被后端忽略)。
   */
  serverSortKey?: string;
}

/**
 * Admin 简化表格 —— 行高 h-10,1px 发丝分隔(`border-border-soft` token),无 zebra。
 * (原注释写死 `#E8E8E8`,那是 .pen 时代的值,已随 2026-07 换 Figma 真源退休。)
 * tanstack-table 装了但暂不引入(避免初版多余复杂度);
 * 排序、多选、批量操作 bar 都用最小自实现 —— 后续如需虚拟化再切。
 */
export function DataTable<T>({
  columns,
  rows,
  loading,
  error,
  onRetry,
  emptyMessage = '这里还没有数据',
  emptyDescription,
  emptyAction,
  rowKey,
  // ---- 多选(可选)----
  selection,
  bulkActions,
  // ---- 服务端排序(可选)----
  serverSort,
}: {
  columns: Column<T>[];
  rows: T[] | undefined;
  loading?: boolean;
  /**
   * query 的 error —— **必须透传**。
   *
   * 不传的后果不是"少个提示",而是**说反话**:请求失败时 rows 是 undefined,
   * 会和"真的没有记录"一样落进下面的 EmptyState,后台于是显示
   * 「这里还没有数据」/「没有符合条件的用户」/「暂无订单」。
   * 管理员据此得出"库里没有这条记录"的结论 —— 排查支付、封号、工单时会直接判断错。
   */
  error?: unknown;
  /** 重试(通常传 query.refetch);不传则错误态只显示原因不给按钮 */
  onRetry?: () => void;
  emptyMessage?: string;
  /** 空态副文案 —— 用来区分「还没有数据」与「当前筛选没命中」 */
  emptyDescription?: ReactNode;
  /** 空态操作 —— 典型是「清除筛选」 */
  emptyAction?: ReactNode;
  rowKey?: (row: T, index: number) => string | number;
  /**
   * 服务端排序 —— 传入则带 serverSortKey 的列表头点击改服务端 sort 参数(跨页全量重排),
   * 而非客户端只排当前页;此模式下客户端 sortKey 排序被禁用(行序完全由后端决定)。
   */
  serverSort?: {
    sortBy: string;
    sortOrder: 'asc' | 'desc';
    onChange: (sortBy: string, sortOrder: 'asc' | 'desc') => void;
  };
  /** 多选状态 —— 传入则自动渲染 checkbox 列 + 头部 master checkbox + 批量 bar */
  selection?: {
    selectedKeys: Set<string | number>;
    onSelectionChange: (keys: Set<string | number>) => void;
    /** 行 key 提取器 —— 必填(用 rowKey 也可,这里冗余声明便于类型推导) */
    getKey: (row: T) => string | number;
  };
  /** 批量操作 —— 选中行 > 0 时显示顶部 bar */
  bulkActions?: (selected: T[]) => ReactNode;
}) {
  // 排序状态:列下标 + 方向。null = 不排序(后端顺序)
  const [sort, setSort] = useState<{ col: number; dir: 'asc' | 'desc' } | null>(null);

  // 防御:某些后端接口可能错误返回非数组 { list, total } 等;早期捕获,避免下游 .map 崩溃
  const safeRows: T[] | undefined = Array.isArray(rows) ? rows : undefined;

  // 行内 + 排序应用
  const sortedRows = useMemo(() => {
    if (!safeRows) return safeRows;
    if (serverSort) return safeRows; // 服务端已全量排序,前端不再二次排
    if (!sort) return safeRows;
    const col = columns[sort.col];
    if (!col?.sortKey) return safeRows;
    const getKey = col.sortKey;
    const copy = [...safeRows];
    copy.sort((a, b) => {
      const va = getKey(a);
      const vb = getKey(b);
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (va < vb) return sort.dir === 'asc' ? -1 : 1;
      if (va > vb) return sort.dir === 'asc' ? 1 : -1;
      return 0;
    });
    return copy;
  }, [safeRows, sort, columns, serverSort]);

  // 三态的**顺序**是有讲究的:
  //   error 必须先于 loading —— react-query 自动重试期间 isFetching 会再次为 true,
  //   若 loading 先判,失败会被"转圈"永久盖住,管理员看不到任何原因。
  if (error) {
    return (
      <div className="rounded-12 border border-border bg-surface-card overflow-hidden">
        <ResourceError
          error={error}
          resourceName="数据"
          onRetry={onRetry}
          autoRedirect={false}
          // 覆盖 ResourceError 面向详情页的整屏样式(h-full/bg-surface-3),让它嵌进表格卡片
          className="h-auto bg-surface-card"
        />
      </div>
    );
  }
  // loading 只在**手上一行都没有**时接管整表;翻页 / 刷新时保留旧行,
  // 否则每次换页整表卸载重建,表格高度塌陷一下再弹回来。
  //
  // 🔴 判据必须同时覆盖「rows 是 undefined」和「rows 是空数组」。只写 `!sortedRows` 不够:
  // `safeRows = Array.isArray(rows) ? rows : undefined`,所以调用方传 `[]` 时 sortedRows 是
  // truthy 的 `[]`,这个分支永远进不去,直接掉进下面的空态 —— 加载中的表格会显示
  // 「这里还没有数据」。ProviderSection 传的正是 `(models ?? []).filter(...)`,
  // 那条空态还带「点右上『添加模型』接入」的 CTA,管理员照着点就会造出重复模型。
  // 有行时 length > 0,不会误进 loading,保留旧行的意图不受影响。
  if (loading && (!sortedRows || sortedRows.length === 0)) return <LoadingState />;
  if (!sortedRows || sortedRows.length === 0)
    return (
      <EmptyState title={emptyMessage} description={emptyDescription} action={emptyAction} />
    );

  const selectedKeys = selection?.selectedKeys ?? new Set();
  const allSelected =
    selection &&
    sortedRows.length > 0 &&
    sortedRows.every((r) => selectedKeys.has(selection.getKey(r)));
  const someSelected = selection && selectedKeys.size > 0 && !allSelected;

  const toggleAll = () => {
    if (!selection) return;
    if (allSelected) {
      selection.onSelectionChange(new Set());
    } else {
      selection.onSelectionChange(new Set(sortedRows.map(selection.getKey)));
    }
  };

  const toggleRow = (row: T) => {
    if (!selection) return;
    const key = selection.getKey(row);
    const next = new Set(selectedKeys);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    selection.onSelectionChange(next);
  };

  // 算出当前所有选中行(可能跨页)—— bulkActions 需要
  const selectedRows = selection
    ? sortedRows.filter((r) => selectedKeys.has(selection.getKey(r)))
    : [];

  const toggleSort = (colIdx: number) => {
    const col = columns[colIdx];
    // 服务端排序模式:点击带 serverSortKey 的列 → 通知上层改 sort 参数(asc⇄desc 两态切换;
    // 切到别的列默认 desc)。行序完全交给后端,这里不动客户端 sort state。
    if (serverSort) {
      if (!col?.serverSortKey) return;
      const isActive = serverSort.sortBy === col.serverSortKey;
      const nextOrder: 'asc' | 'desc' = isActive && serverSort.sortOrder === 'desc' ? 'asc' : isActive ? 'desc' : 'desc';
      serverSort.onChange(col.serverSortKey, nextOrder);
      return;
    }
    if (!col?.sortKey) return;
    setSort((s) => {
      if (s?.col !== colIdx) return { col: colIdx, dir: 'asc' };
      if (s.dir === 'asc') return { col: colIdx, dir: 'desc' };
      return null; // asc → desc → 不排序 三态
    });
  };

  return (
    <div className="rounded-12 border border-border overflow-hidden bg-surface-card">
      {/* 批量操作 bar —— 选中 > 0 时叠加到顶部 */}
      {bulkActions && selectedKeys.size > 0 && (
        <div className="flex items-center justify-between gap-3 bg-surface-1 border-b border-border px-3 h-10">
          <span className="text-12 text-subtle font-medium">已选 {selectedKeys.size} 项</span>
          <div className="flex items-center gap-2">
            {bulkActions(selectedRows)}
            <button
              type="button"
              onClick={() => selection?.onSelectionChange(new Set())}
              className="text-12 text-faint hover:text-foreground"
            >
              取消选择
            </button>
          </div>
        </div>
      )}

      {/* 窄屏:表格在卡片内横向滚动,不让整页横滚(移动端后台适配的核心) */}
      <div className="overflow-x-auto">
      <table className="w-full text-12">
        <thead className="bg-surface-1 border-b border-border">
          <tr>
            {selection && (
              <th className="w-9 px-3 h-9">
                <Checkbox
                  checked={allSelected ? true : someSelected ? 'indeterminate' : false}
                  onCheckedChange={toggleAll}
                  aria-label="全选"
                />
              </th>
            )}
            {columns.map((c, i) => {
              const sortable = serverSort ? !!c.serverSortKey : !!c.sortKey;
              const sortState = serverSort
                ? c.serverSortKey && serverSort.sortBy === c.serverSortKey
                  ? serverSort.sortOrder
                  : null
                : sort?.col === i
                  ? sort.dir
                  : null;
              return (
                <th
                  key={i}
                  style={c.width ? { width: c.width } : undefined}
                  // 客户端排序与服务端排序的表头图标长得一模一样,但含义天差地别:
                  // 前者只重排**当前页**这 20 行,后者是全量重排。旁边就摆着分页条,
                  // 很容易把「本页最大」读成「全站最大」—— 用 title 把口径说明白。
                  title={
                    sortable
                      ? serverSort
                        ? '按该列全量排序'
                        : '仅对当前页排序'
                      : undefined
                  }
                  className={cn(
                    'h-9 px-3 text-faint font-medium text-12 text-left',
                    c.align === 'right' && 'text-right',
                    c.align === 'center' && 'text-center',
                    sortable && 'cursor-pointer select-none hover:text-foreground',
                    c.className
                  )}
                  onClick={() => sortable && toggleSort(i)}
                >
                  <span className="inline-flex items-center gap-1">
                    {c.header}
                    {sortable && (
                      sortState === 'asc' ? <ChevronUp className="size-3" />
                        : sortState === 'desc' ? <ChevronDown className="size-3" />
                          : <ArrowUpDown className="size-3 opacity-30" />
                    )}
                  </span>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sortedRows.map((row, i) => {
            const key = selection
              ? selection.getKey(row)
              : rowKey
              ? rowKey(row, i)
              : (row as { id?: string | number }).id ?? i;
            const isSelected = selection && selectedKeys.has(selection.getKey(row));
            return (
              <tr
                key={key}
                className={cn(
                  'border-b border-border-soft last:border-0 transition-colors',
                  isSelected ? 'bg-surface-1' : 'hover:bg-surface-1'
                )}
              >
                {selection && (
                  <td className="w-9 px-3">
                    <Checkbox
                      checked={isSelected ?? false}
                      onCheckedChange={() => toggleRow(row)}
                      aria-label="选择此行"
                    />
                  </td>
                )}
                {columns.map((c, j) => (
                  <td
                    key={j}
                    className={cn(
                      'h-10 px-3 text-subtle',
                      c.align === 'right' && 'text-right',
                      c.align === 'center' && 'text-center',
                      c.className
                    )}
                  >
                    {c.cell(row, i)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
    </div>
  );
}
