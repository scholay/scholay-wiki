import { cn } from '@/shared/lib/utils';

export function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'animate-pulse rounded-4 bg-surface-2',
        className
      )}
      {...props}
    />
  );
}
