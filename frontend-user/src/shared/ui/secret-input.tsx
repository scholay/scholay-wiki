import * as React from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Input, type InputProps } from '@/shared/ui/input';
import { cn } from '@/shared/lib/utils';

/**
 * 密文输入框 —— 右侧带"小眼睛"按钮, 默认遮罩 (type=password), 点击切换显示原值。
 *
 * 受控用法 (推荐): 上层持有 `revealed` 状态 + `onToggleReveal`, 点眼睛时通常还要
 * **重新拉取明文** (后端 ?show_sensitive=true), 把原值同步进 value —— 即"默认脱敏,
 * 点眼睛看原值"。SecretInput 只负责呈现 (password↔text) + 提供眼睛入口, 不管数据获取。
 *
 * 注意: 仅用于单行 <input> 的密钥/secret 字段; 多行私钥 (textarea) 不走这里。
 */
export interface SecretInputProps extends Omit<InputProps, 'type'> {
  /** 是否显示明文 (受控) */
  revealed?: boolean;
  /** 点击眼睛回调 —— 上层据此翻转 revealed + 视情况重新拉取原值 */
  onToggleReveal?: () => void;
}

export const SecretInput = React.forwardRef<HTMLInputElement, SecretInputProps>(
  ({ revealed = false, onToggleReveal, className, ...props }, ref) => (
    <div className="relative">
      <Input
        ref={ref}
        type={revealed ? 'text' : 'password'}
        className={cn('pr-9', className)}
        {...props}
      />
      <button
        type="button"
        tabIndex={-1}
        onClick={onToggleReveal}
        aria-label={revealed ? '隐藏原值' : '查看原值'}
        title={revealed ? '隐藏' : '查看原值'}
        className="absolute right-1 top-1/2 inline-flex size-7 -translate-y-1/2 items-center justify-center rounded-4 text-faint transition-colors hover:bg-surface-2 hover:text-foreground"
      >
        {revealed ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  )
);
SecretInput.displayName = 'SecretInput';
