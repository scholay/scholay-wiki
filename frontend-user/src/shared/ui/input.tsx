import * as React from'react';
import { cn } from'@/shared/lib/utils';

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, autoComplete, ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      // 默认关闭浏览器自动填充: 避免在配置/搜索等非登录表单里被塞入保存的账号/密码。
      // 需要自动填充的字段(登录/注册的邮箱、密码、验证码)各自显式传 autoComplete 覆盖即可。
      autoComplete={autoComplete ??'off'}
      className={cn('flex h-8 w-full rounded-8 border border-border bg-surface-card px-3 text-12 text-foreground placeholder:text-faint','transition-colors','focus-visible:border-foreground','disabled:cursor-not-allowed disabled:opacity-50','file:border-0 file:bg-transparent file:text-12 file:font-medium',
        className
      )}
      {...props}
    />
  )
);
Input.displayName ='Input';

export { Input };
