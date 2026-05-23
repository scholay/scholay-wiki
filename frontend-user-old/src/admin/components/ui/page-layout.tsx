import * as React from 'react';
import { cn } from '../../lib/utils';

/**
 * PageLayout — 后台页面统一外壳
 *
 * 用法:
 *   <PageLayout title="用户管理" description="管理用户帐户、权限" actions={<Button>...</Button>}>
 *     <Card>...</Card>
 *   </PageLayout>
 *
 * 职责:
 *   - 统一顶部 Header (标题 / 描述 / 右侧操作槽)
 *   - 统一页面内边距与垂直间距
 *   - 不引入业务逻辑
 */

interface PageLayoutProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}

export function PageLayout({
  title,
  description,
  actions,
  children,
  className,
}: PageLayoutProps) {
  return (
    <div className={cn('space-y-6 p-6', className)}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {description && (
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          )}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
      {children}
    </div>
  );
}
