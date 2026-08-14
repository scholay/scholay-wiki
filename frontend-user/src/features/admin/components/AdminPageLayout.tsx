import { type ReactNode } from 'react';
import { RefreshCw } from 'lucide-react';
import { PageHeader } from '@/shared/components/PageHeader';
import { IconButton } from '@/shared/components/IconButton';

/**
 * Admin 页面统一外壳 —— PageHeader + 滚动主区。
 * 所有 admin 子页都裹一层,保证 padding / 标题层级一致。
 *
 * `onRefresh` 提供全后台统一的刷新入口。改造前 35 个页面里只有 2 个有刷新按钮,
 * 而全局 `refetchOnWindowFocus` 是关的(query-config.ts),切回窗口也不会刷 ——
 * 于是「盯着看订单有没有进来 / 会话有没有起来 / 三方账号恢复没有」这类事
 * 唯一的手段是 F5 整页,而好几个页面的筛选态不进 URL,F5 会把当前视图一起冲掉。
 */
export function AdminPageLayout({
  title,
  description,
  actions,
  tabs,
  onRefresh,
  refreshing,
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  tabs?: ReactNode;
  /** 传了就在动作区最左侧渲染刷新按钮(通常传 query.refetch) */
  onRefresh?: () => void;
  /** 正在取数(通常传 query.isFetching)—— 图标转起来,兼作"请求确实发出去了"的反馈 */
  refreshing?: boolean;
  children: ReactNode;
}) {
  const resolvedActions =
    onRefresh || actions ? (
      <>
        {onRefresh && (
          <IconButton
            aria-label="刷新"
            tooltip={refreshing ? '正在刷新…' : '刷新'}
            onClick={onRefresh}
            disabled={refreshing}
          >
            <RefreshCw className={refreshing ? 'animate-spin' : undefined} />
          </IconButton>
        )}
        {actions}
      </>
    ) : undefined;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title={title}
        description={description}
        actions={resolvedActions}
        tabs={tabs}
        bordered
      />
      <div className="flex-1 min-h-0 overflow-auto p-3 sm:p-4 lg:p-6">{children}</div>
    </div>
  );
}
