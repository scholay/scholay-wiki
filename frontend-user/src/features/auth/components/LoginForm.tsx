import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { z } from 'zod';
import { useApiToast } from '@/shared/hooks';
import {
  Button,
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
} from '@/shared/ui';
import {
  useLoginEmailCode,
  useLoginEmailPassword,
  useLoginPhoneCode,
  useLoginPhonePassword,
} from '../api/auth';
import { useAuthDialog } from '@/stores/auth-dialog.store';
import type { AccountType, LoginCredentialType } from '../types';
import { AccountTypeTabs } from './AccountTypeTabs';
import { SendCodeButton } from './SendCodeButton';
import { TurnstileField } from './TurnstileField';
import { usePublicConfig } from '../api/public-config';
import { emailRule, phoneRule } from '@/shared/lib/account-validation';

const codeRule = z.string().length(6, '验证码为 6 位数字');

const schemaFactory = (acc: AccountType, cred: LoginCredentialType) =>
  z.object({
    account: acc === 'email' ? emailRule : phoneRule,
    secret:
      cred === 'password' ? z.string().min(1, '请输入密码') : codeRule,
  });

type FormShape = { account: string; secret: string };

interface LoginFormProps {
  initialAccountType: AccountType;
  onSwitchMode: (m: 'register' | 'forgot') => void;
}

export function LoginForm({ initialAccountType, onSwitchMode }: LoginFormProps) {
  const [accountType, setAccountType] = useState<AccountType>(initialAccountType);
  const [credType, setCredType] = useState<LoginCredentialType>('password');
  // Turnstile token —— enable_turnstile=true 时必填;关闭时父表单不会渲染 widget,token 保持 null
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const close = useAuthDialog((s) => s.close);
  const apiToast = useApiToast();
  const { data: publicConfig } = usePublicConfig();

  const form = useForm<FormShape>({
    resolver: zodResolver(schemaFactory(accountType, credType)),
    defaultValues: { account: '', secret: '' },
    mode: 'onSubmit',
  });

  const loginEmailPw = useLoginEmailPassword();
  const loginPhonePw = useLoginPhonePassword();
  const loginEmailCode = useLoginEmailCode();
  const loginPhoneCode = useLoginPhoneCode();
  const pending =
    loginEmailPw.isPending ||
    loginPhonePw.isPending ||
    loginEmailCode.isPending ||
    loginPhoneCode.isPending;

  // Turnstile 开了但 token 还没拿到 → submit 禁用
  const turnstileRequired = !!publicConfig?.enable_turnstile && !!publicConfig.turnstile_site_key;
  const turnstileBlocked = turnstileRequired && !turnstileToken;

  const onSubmit = async (values: FormShape) => {
    try {
      // 把 turnstile_token 透传给后端 4 个 login handler;关闭时传 undefined
      const ts = turnstileToken ?? undefined;
      if (accountType === 'email' && credType === 'password') {
        await loginEmailPw.mutateAsync({ email: values.account, password: values.secret, turnstile_token: ts });
      } else if (accountType === 'phone' && credType === 'password') {
        await loginPhonePw.mutateAsync({ phone: values.account, password: values.secret });
      } else if (accountType === 'email' && credType === 'code') {
        await loginEmailCode.mutateAsync({ email: values.account, code: values.secret, turnstile_token: ts });
      } else {
        await loginPhoneCode.mutateAsync({ phone: values.account, code: values.secret, turnstile_token: ts });
      }
      toast.success('登录成功');
      close();
    } catch (err) {
      // 后端会返回可读 message(如「邮箱或密码错误」),用 apiToast 取真实文案;
      // 注意不能用 `err instanceof Error` —— 抛出来的是 ApiError 普通对象,不是 Error 实例。
      apiToast.show(err, '登录失败,请稍后重试');
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <div className="flex items-center justify-between">
          <AccountTypeTabs value={accountType} onChange={setAccountType} />
          <div className="text-xs text-muted-foreground">
            <button
              type="button"
              className="hover:text-foreground"
              onClick={() => setCredType(credType === 'password' ? 'code' : 'password')}
            >
              {credType === 'password' ? '使用验证码登录' : '使用密码登录'}
            </button>
          </div>
        </div>

        <FormField
          control={form.control}
          name="account"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{accountType === 'email' ? '邮箱' : '手机号'}</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  type={accountType === 'email' ? 'email' : 'tel'}
                  autoComplete={accountType === 'email' ? 'email' : 'tel'}
                  inputMode={accountType === 'email' ? 'email' : 'tel'}
                  placeholder={accountType === 'email' ? 'you@example.com' : '11 位手机号'}
                  className="h-10 text-sm"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="secret"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{credType === 'password' ? '密码' : '验证码'}</FormLabel>
              {credType === 'password' ? (
                <FormControl>
                  <Input
                    {...field}
                    type="password"
                    autoComplete="current-password"
                    placeholder="至少 8 位"
                    className="h-10 text-sm"
                  />
                </FormControl>
              ) : (
                <div className="flex gap-2">
                  <FormControl>
                    <Input
                      {...field}
                      inputMode="numeric"
                      maxLength={6}
                      autoComplete="one-time-code"
                      placeholder="6 位数字"
                      className="h-10 text-sm tracking-code"
                    />
                  </FormControl>
                  <SendCodeButton
                    accountType={accountType}
                    account={form.watch('account')}
                    purpose="login"
                    validate={() => form.trigger('account')}
                  />
                </div>
              )}
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Cloudflare Turnstile —— 仅在管理员开启时渲染 */}
        <TurnstileField onChange={setTurnstileToken} />

        <Button
          type="submit"
          variant="primary"
          className="w-full h-10"
          disabled={pending || turnstileBlocked}
          title={turnstileBlocked ? '请先完成人机验证' : undefined}
        >
          {pending ? '登录中…' : '登录'}
        </Button>

        {/* 登录隐式同意 —— 不弹独立 checkbox(老用户每次登录还要勾不友好),
           只在按钮下放一段说明,法律意义是"通过登录确认你已经同意服务条款 / 隐私"。
           注册流程的 RegisterForm 仍然保留强制勾选 checkbox(zod required) */}
        <p className="text-2xs text-faint text-center leading-paragraph">
          登录即表示同意{' '}
          <a
            href="/terms"
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground hover:text-foreground underline underline-offset-2"
          >
            服务条款
          </a>{' '}
          与{' '}
          <a
            href="/privacy"
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground hover:text-foreground underline underline-offset-2"
          >
            隐私政策
          </a>
        </p>

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <button
            type="button"
            className="hover:text-foreground"
            onClick={() => onSwitchMode('forgot')}
          >
            忘记密码?
          </button>
          <button
            type="button"
            className="hover:text-foreground"
            onClick={() => onSwitchMode('register')}
          >
            还没有账号? 立即注册
          </button>
        </div>
      </form>
    </Form>
  );
}
