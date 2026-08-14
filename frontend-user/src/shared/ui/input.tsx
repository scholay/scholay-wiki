import * as React from'react';
import { cn } from'@/shared/lib/utils';

/**
 * 只删除尾随数字的多余前导 0，不把输入中间态强制转成 number。
 *
 * - `010` → `10`、`000` → `0`、`000.5` → `0.5`
 * - 空串、`0`、`0.x` 保持不变
 * - 负号、小数与科学计数法的其余词法原样保留
 */
function trimRedundantIntegerLeadingZeros(value: string): string {
  return value.replace(/^([+-]?)0+(?=\d)/, '$1');
}

/**
 * Input —— 单行输入原子。
 *
 * 字号 = text-14,对应 dev.pen 搜索框 Google Sans 400 / 14px。
 * `file:` 伪元素同步到 14,避免同一控件内出现两套字号。
 */
export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, autoComplete, onChange, onWheel, ...props }, ref) => {
    const inputRef = React.useRef<HTMLInputElement>(null);
    React.useImperativeHandle(ref, () => inputRef.current as HTMLInputElement);

    React.useEffect(() => {
      const input = inputRef.current;
      if (!input || type !== 'number') return;

      // React 对 wheel 使用被动委托监听，仅在合成 onWheel 中 preventDefault
      // 不能稳定阻止浏览器原生的数值步进。因此在元素上挂非被动监听；
      // 只拦截当前聚焦的数字框，免得鼠标经过未聚焦输入框时卡住页面滚动。
      const preventFocusedNumberWheel = (event: WheelEvent) => {
        if (input.ownerDocument.activeElement === input) event.preventDefault();
      };

      input.addEventListener('wheel', preventFocusedNumberWheel, { passive: false });
      return () => input.removeEventListener('wheel', preventFocusedNumberWheel);
    }, [type]);

    const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
      if (type === 'number') {
        const normalized = trimRedundantIntegerLeadingZeros(event.currentTarget.value);
        if (normalized !== event.currentTarget.value) event.currentTarget.value = normalized;
      }
      onChange?.(event);
    };

    return (
      <input
        ref={inputRef}
        type={type}
        // 默认关闭浏览器自动填充: 避免在配置/搜索等非登录表单里被塞入保存的账号/密码。
        // 需要自动填充的字段(登录/注册的邮箱、密码、验证码)各自显式传 autoComplete 覆盖即可。
        autoComplete={autoComplete ?? 'off'}
        className={cn('flex h-8 w-full rounded-8 border border-border bg-surface-card px-3 text-14 text-foreground placeholder:text-faint', 'transition-colors', 'focus-visible:border-foreground', 'disabled:cursor-not-allowed disabled:opacity-50', 'file:border-0 file:bg-transparent file:text-14 file:font-medium',
          className
        )}
        onChange={handleChange}
        onWheel={onWheel}
        {...props}
      />
    );
  }
);
Input.displayName ='Input';

export { Input };
