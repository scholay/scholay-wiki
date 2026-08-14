import type { ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Circle, Eye, EyeOff, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { Label } from '@/shared/ui/label';
import { Textarea } from '@/shared/ui/textarea';
import { cn } from '@/shared/lib/utils';
import type { Column } from './DataTable';

/**
 * 支付配置(支付宝 / 微信)两个 panel 共用的小件。
 *
 * 从 PaymentConfigPage.tsx 原样搬出 —— 那个文件在微信支付重做后超过了 500 行硬上限。
 * **搬而不是复制**:这几个小件里带着 `gap-1.5` / `space-y-1.5`,而半档间距在
 * tests/design-system-guard.test.ts 里是零余量棘轮,复制一份就等于新增违规。
 */

/**
 * disabled 控件的 hover 提示外壳。
 *
 * 🔴 Chrome / Safari **不对 disabled 的表单控件派发指针事件**,挂在
 * `<button disabled title="...">` 上的原生 tooltip 在这两个浏览器里根本不会弹 ——
 * 于是「为什么这个按钮点不了」这句最需要说清的话,在最常用的浏览器里等于不存在。
 * 套一层能接 hover 的 span,提示才真的可见。
 *
 * hint 为空时**不包壳**,DOM 与不用它时完全一致。
 */
export function DisabledHint({
  hint,
  children,
  className,
}: {
  hint?: string | null;
  children: ReactNode;
  className?: string;
}) {
  if (!hint) return <>{children}</>;
  return (
    <span title={hint} className={cn('inline-flex', className)}>
      {children}
    </span>
  );
}

/**
 * 「活动」列 —— 点一下把该行切成当前活动配置。
 *
 * blockedReason 是微信支付加的:后端硬性要求 validation_status='valid' 才允许激活,
 * 客户端先 disable 掉并把原因说清楚,比让人点了再吃一个 400 好。
 * 支付宝不传这个参数,行为与搬家前逐字一致。
 */
export function ActiveCell<T extends { is_active: boolean; id: number }>(
  onActivate: (r: T) => void,
  blockedReason?: (r: T) => string | null,
): Column<T> {
  return {
    header: '活动',
    width: 130,
    cell: (r) => {
      const blocked = r.is_active ? null : (blockedReason?.(r) ?? null);
      return (
        <DisabledHint hint={blocked}>
          <button
            type="button"
            onClick={() => onActivate(r)}
            disabled={r.is_active || !!blocked}
            className={cn(
              'inline-flex items-center gap-1.5 text-12',
              r.is_active
                ? 'font-medium text-brand-green'
                : blocked
                  ? 'cursor-not-allowed text-faint'
                  : 'text-subtle hover:text-foreground',
            )}
          >
            {r.is_active ? (
              <>
                <CheckCircle2 className="size-3.5" />
                当前活动
              </>
            ) : (
              <>
                <Circle className="size-3.5" />
                切换为活动
              </>
            )}
          </button>
        </DisabledHint>
      );
    },
  };
}

/**
 * 面板顶部的「用户端现在到底能不能用这个支付方式」状态条。
 *
 * 🔴 为什么需要它:后端 `vip.Service.PaymentMethods()` 才是用户端支付入口的判据 ——
 * 支付宝要 `is_active`,微信支付还额外要 `validation_status='valid'`。
 * 只看一张「三行配置都在、每行都有徽章」的表,完全可能对应
 * 「用户端一个微信支付按钮都没有」。半夜排查支付故障时这是第一个要回答的问题。
 *
 * `status='down'` 是**结论**,所以只在列表真的取到数据后才渲染 —— 请求还在飞
 * 或直接失败时下这个结论,和后台自己说反话没有区别。
 */
export function PaymentLiveBanner({
  status,
  title,
  detail,
}: {
  status: 'ok' | 'warn' | 'down';
  title: string;
  detail?: ReactNode;
}) {
  const tone =
    status === 'ok'
      ? { box: 'bg-brand-green-soft', fg: 'text-brand-green' }
      : status === 'warn'
        ? { box: 'bg-warning-soft', fg: 'text-brand-amber' }
        : { box: 'bg-brand-red-soft', fg: 'text-brand-red' };
  const Icon = status === 'ok' ? CheckCircle2 : AlertTriangle;
  return (
    <div className={cn('mb-3 flex items-start gap-2 rounded-12 border border-border px-3 py-2', tone.box)}>
      <Icon className={cn('size-4 shrink-0', tone.fg)} />
      <div className="min-w-0 flex-1 space-y-1">
        <p className={cn('text-12 font-medium', tone.fg)}>{title}</p>
        {detail && <p className="text-12 text-subtle">{detail}</p>}
      </div>
    </div>
  );
}

export function EditDeleteCell<T>(
  onEdit: (r: T) => void,
  onDelete: (r: T) => void,
): Column<T> {
  return {
    header: '',
    width: 90,
    align: 'right',
    cell: (r) => (
      <div className="flex justify-end gap-1">
        <Button variant="ghost" size="icon" className="size-7" onClick={() => onEdit(r)}>
          <Pencil className="size-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="size-7 text-destructive" onClick={() => onDelete(r)}>
          <Trash2 className="size-3.5" />
        </Button>
      </div>
    ),
  };
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  /** 字段下方的一行说明(可选)。支付宝侧不传,渲染结果与搬家前一致。 */
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
      {hint && <p className="text-12 text-muted-foreground">{hint}</p>}
    </div>
  );
}

/**
 * 多行私钥密文字段 —— textarea 不能用 SecretInput, 改在 Label 旁放眼睛按钮:
 * value 直接来自后端 (脱敏时是 ********, reveal 后是明文), 受控并随该行字段值同步,
 * 不做 type 切换。提交走受控 value, 后端对脱敏占位做「保持原值」兜底。
 */
export function SecretTextareaField({
  label,
  name,
  rows,
  value,
  onChange,
  revealed,
  onToggleReveal,
  required,
  placeholder,
  hint,
}: {
  label: string;
  name: string;
  rows: number;
  value: string;
  onChange: (v: string) => void;
  revealed: boolean;
  onToggleReveal: () => void;
  required?: boolean;
  placeholder?: string;
  hint?: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label htmlFor={name}>{label}</Label>
        <button
          type="button"
          tabIndex={-1}
          onClick={onToggleReveal}
          aria-label={revealed ? '隐藏原值' : '查看原值'}
          title={revealed ? '隐藏' : '查看原值'}
          className="inline-flex size-7 items-center justify-center rounded-8 text-faint transition-colors hover:bg-surface-2 hover:text-foreground"
        >
          {revealed ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>
      <Textarea
        id={name}
        name={name}
        rows={rows}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        placeholder={placeholder}
        className="font-mono"
      />
      {hint && <p className="text-12 text-muted-foreground">{hint}</p>}
    </div>
  );
}
