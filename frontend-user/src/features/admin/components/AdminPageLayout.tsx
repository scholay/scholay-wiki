import { type ReactNode } from 'react';
import { PageHeader } from '@/shared/components/PageHeader';

/**
 * Admin 页面统一外壳 —— PageHeader + 滚动主区。
 * 所有 admin 子页都裹一层,保证 padding / 标题层级一致。
 */
export function AdminPageLayout({
  title,
  description,
  actions,
  tabs,
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  tabs?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader title={title} description={description} actions={actions} tabs={tabs} bordered />
      <div className="flex-1 min-h-0 overflow-auto p-6">{children}</div>
    </div>
  );
}
