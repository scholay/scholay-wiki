import { type ReactNode } from 'react';
import { cn } from '@/shared/lib/utils';

interface PageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  /** 右侧动作区 — 按钮 / 切换 / 筛选 */
  actions?: ReactNode;
  /** 标签条 — 通常配合 <Tabs />,放在 description 之下 */
  tabs?: ReactNode;
  /** 是否带底部 1px 分隔线(主区域常用) */
  bordered?: boolean;
  /** 紧凑模式 — 减小 padding,适合子页 */
  dense?: boolean;
  className?: string;
}

/**
 * 业务页面统一标题区 — 文献集 / 投稿 / 设置等顶部 hero 抬头。
 * 与 SidebarHeader 不同的是:这里不是 56h 固定,可承载多行 description 和 tabs。
 */
export function PageHeader({
  title,
  description,
  actions,
  tabs,
  bordered,
  dense,
  className,
}: PageHeaderProps) {
  return (
    <header
      className={cn(
        'bg-background',
        dense ? 'px-4 py-3' : 'px-6 py-4',
        bordered && 'border-b border-border-soft',
        className
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h1
            className={cn(
              'font-semibold tracking-tight text-foreground truncate',
              dense ? 'text-lg' : 'text-xl'
            )}
          >
            {title}
          </h1>
          {description && (
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          )}
        </div>
        {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
      </div>
      {tabs && <div className="mt-3">{tabs}</div>}
    </header>
  );
}
