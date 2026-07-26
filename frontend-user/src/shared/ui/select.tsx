import * as React from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/shared/lib/utils';

/**
 * Select —— 下拉选择原子(原生 <select> 的样式适配层)。
 *
 * 存在理由: 改造前全站 38 处裸 <select>,集中在 admin,每处自己拼边框/圆角/焦点环。
 *
 * 为什么用原生而不是 @radix-ui/react-select:
 *   1. 这 38 处全是简单单选下拉(筛选月份/状态/模型等),没有搜索、多选、分组、异步等需求
 *   2. 原生 select 在移动端调起系统选择器,交互比自绘浮层更好
 *   3. 省一个依赖 + ~15KB bundle,符合「能用成熟方案绝不自己手写」——
 *      原生 select 就是这个场景的成熟方案
 * 若将来出现需要搜索/多选的场景,再单独引入 Radix Select,不要改造这个。
 *
 * 与 input.tsx 同构: 同样的描边、圆角、焦点环、禁用态、高度。
 */
export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  /** 是否占满宽度 —— 默认 true。筛选器这类内联场景传 false 让它按内容收缩 */
  fullWidth?: boolean;
}

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, children, fullWidth = true, ...props }, ref) => (
    <div className={cn('relative inline-flex items-center', fullWidth && 'w-full')}>
      <select
        ref={ref}
        className={cn(
          // appearance-none + 自绘箭头 —— 原生箭头在各平台长得完全不一样,不可控
          'appearance-none flex h-8 rounded-8 border border-border bg-surface-card pl-3 pr-8 text-sm text-foreground',
          'transition-colors cursor-pointer',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-foreground',
          'disabled:cursor-not-allowed disabled:opacity-50',
          fullWidth && 'w-full',
          className
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute right-2.5 size-3.5 text-faint"
      />
    </div>
  )
);
Select.displayName = 'Select';

export { Select };
