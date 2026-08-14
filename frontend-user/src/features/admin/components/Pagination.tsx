import { PaginationPrevNext } from '@/shared/components/PaginationPrevNext';

/**
 * Admin 列表页分页 —— 薄包装 [[PaginationPrevNext]],保留与历史调用方
 * 兼容的 API(total/page/pageSize/onPageChange);视觉统一到 shared 组件,
 * admin 列表页(Users/Feedback/Messages/UsageLogs ...)零改动迁移。
 *
 * 显示策略:**只有真的一条都没有(total ≤ 0)时才不渲染**。
 *
 * 原先是 `total <= pageSize` 就整条不渲染,看着"单页 UI 干净点",实际代价:
 *   - 筛出 3 笔待支付订单 / 搜到 3 条会话时,页面上**没有任何地方显示命中条数**,
 *     只能自己数行 —— 而命中量级正是筛完之后第一个要看的东西;
 *   - 列表在 >1 页 / =1 页之间来回切换时,这条约 56px 高的分页条时有时无,表格高度来回抖。
 * 单页时 PaginationPrevNext 的上下页按钮会自动 disabled,退化成一条只读的「显示 1–3 / 共 3」。
 */
export function Pagination({
  total,
  page,
  pageSize,
  onPageChange,
}: {
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (p: number) => void;
}) {
  if (total <= 0) return null;
  // Math.max(1, …):total < pageSize 时 ceil 得 1;total=0 已在上面挡掉,这里纯防御
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const rangeStart = (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, total);

  return (
    <PaginationPrevNext
      page={page}
      onPageChange={onPageChange}
      totalPages={totalPages}
      total={total}
      rangeStart={rangeStart}
      rangeEnd={rangeEnd}
    />
  );
}
