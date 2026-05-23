import { type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { PageHeader } from '@/shared/components/PageHeader';
import { EmptyState } from '@/shared/components/EmptyState';

/**
 * 各 feature 模块尚未实现时的占位页 —— 保证 TopNav carousel 跳转后有内容,
 * 真正的页面建好后用同名组件替换路由即可。
 */
export function FeaturePlaceholderPage({
  title,
  description,
  icon,
  action,
}: {
  title: string;
  description?: string;
  icon: LucideIcon;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col h-full">
      <PageHeader title={title} description={description} bordered />
      <div className="flex-1 min-h-0 bg-surface-1">
        <EmptyState
          icon={icon}
          title={`${title} 正在打磨中`}
          description="这块功能马上就来,先把入口给你预留着,敬请期待。"
          action={action}
        />
      </div>
    </div>
  );
}
