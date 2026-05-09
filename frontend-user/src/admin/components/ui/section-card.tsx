import * as React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './card';
import { cn } from '../../lib/utils';

/**
 * SectionCard — 带标题/描述/工具栏的卡片
 *
 * 用法:
 *   <SectionCard
 *     title="用户列表"
 *     description="共 X 条"
 *     toolbar={<Input/><Select/>}
 *     bodyPadded={false}  // false = 表格紧贴边
 *   >
 *     <Table>...</Table>
 *   </SectionCard>
 */

interface SectionCardProps {
  title?: React.ReactNode;
  description?: React.ReactNode;
  toolbar?: React.ReactNode;
  footer?: React.ReactNode;
  children?: React.ReactNode;
  bodyPadded?: boolean;
  className?: string;
}

export function SectionCard({
  title,
  description,
  toolbar,
  footer,
  children,
  bodyPadded = true,
  className,
}: SectionCardProps) {
  return (
    <Card className={className}>
      {(title || toolbar) && (
        <CardHeader className={cn(footer || children ? 'border-b' : '')}>
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              {title && <CardTitle>{title}</CardTitle>}
              {description && <CardDescription>{description}</CardDescription>}
            </div>
            {toolbar && (
              <div className="flex flex-wrap items-center gap-2">{toolbar}</div>
            )}
          </div>
        </CardHeader>
      )}
      {children && (
        <CardContent className={cn(bodyPadded ? 'p-6' : 'p-0')}>{children}</CardContent>
      )}
      {footer && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3">
          {footer}
        </div>
      )}
    </Card>
  );
}
