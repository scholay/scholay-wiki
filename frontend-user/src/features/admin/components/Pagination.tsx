import { PaginationPrevNext } from '@/shared/components/PaginationPrevNext';

/**
 * Admin 列表页分页 —— 薄包装 [[PaginationPrevNext]],保留与历史调用方
 * 兼容的 API(total/page/pageSize/onPageChange);视觉统一到 shared 组件,
 * admin 列表页(Users/Feedback/Messages/UsageLogs ...)零改动迁移。
 *
 * 显示策略:total ≤ pageSize 时不渲染(单页 UI 干净点)。
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
  if (total <= pageSize) return null;
  const totalPages = Math.ceil(total / pageSize);
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
