import { toast } from 'sonner';
import { Button } from '@/shared/ui/button';
import {
  useSendEmailCode,
  useSendPhoneCode,
} from '../api/auth';
import { useCountdown } from '../hooks/useCountdown';
import type { AccountType, CodePurpose } from '../types';

interface SendCodeButtonProps {
  accountType: AccountType;
  /** email or phone 值,由父表单 watch 提供 */
  account: string;
  purpose: CodePurpose;
  /** 父表单校验通过才允许发送,避免空值打后端 */
  validate?: () => boolean | Promise<boolean>;
  disabled?: boolean;
}

/**
 * 验证码发送按钮 — 60s 倒计时 + loading。
 * 上层只需告诉它"邮箱/手机" + "干什么用",其余自洽。
 */
export function SendCodeButton({
  accountType,
  account,
  purpose,
  validate,
  disabled,
}: SendCodeButtonProps) {
  const { seconds, isCounting, start } = useCountdown(60);
  const sendEmail = useSendEmailCode();
  const sendPhone = useSendPhoneCode();
  const pending = sendEmail.isPending || sendPhone.isPending;

  const handleClick = async () => {
    if (validate) {
      const ok = await validate();
      if (!ok) return;
    }
    if (!account) {
      toast.error(accountType === 'email' ? '请先输入邮箱后再获取验证码' : '请先输入手机号后再获取验证码');
      return;
    }
    try {
      if (accountType === 'email') {
        await sendEmail.mutateAsync({ email: account, purpose });
      } else {
        await sendPhone.mutateAsync({ phone: account, purpose });
      }
      toast.success('验证码已发送');
      start();
    } catch (err) {
      const msg = err instanceof Error ? err.message : '发送失败,请稍后重试';
      toast.error(msg);
    }
  };

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={disabled || pending || isCounting}
      onClick={handleClick}
      className="shrink-0 h-10"
    >
      {isCounting ? `${seconds}s` : pending ? '发送中…' : '获取验证码'}
    </Button>
  );
}
