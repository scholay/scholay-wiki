import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { useApiToast } from '@/shared/hooks';
import { z } from 'zod';
import {
  Button,
  Checkbox,
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
} from '@/shared/ui';
import { useRegisterEmail, useRegisterPhone } from '../api/auth';
import { useAuthDialog } from '@/stores/auth-dialog.store';
import type { AccountType } from '../types';
import { AccountTypeTabs } from './AccountTypeTabs';
import { SendCodeButton } from './SendCodeButton';
import { TurnstileField } from './TurnstileField';
import { usePublicConfig } from '../api/public-config';
import { trackEvent } from '@/shared/lib/track';

const emailRule = z.string().min(1, '请输入邮箱').email('邮箱格式有误,请检查后重新输入(如 user@example.com)');
const phoneRule = z
  .string()
  .min(1, '请输入手机号')
  .regex(/^1[3-9]\d{9}$/, '请输入 11 位中国手机号(如 13812345678)');
const codeRule = z.string().length(6, '验证码为 6 位数字').regex(/^\d{6}$/, '验证码为 6 位数字');
const passwordRule = z.string().min(8, '密码至少 8 位,建议含字母和数字').max(64, '密码长度不能超过 64 位');

// requireCode 跟随后台 system_config.require_email_verification:
//   true  → 6 位数字必填
//   false → 字段允许为空(仍允许 6 位数字,但不强制),后端会忽略
const schemaFactory = (acc: AccountType, requireCode: boolean) =>
  z.object({
    account: acc === 'email' ? emailRule : phoneRule,
    code: requireCode ? codeRule : z.string().optional().default(''),
    password: passwordRule,
    invitation_code: z.string().optional(),
    agree_terms: z.literal(true, {
      errorMap: () => ({ message: '请勾选同意用户协议和隐私政策' }),
    }),
  });

type FormShape = {
  account: string;
  code: string;
  password: string;
  invitation_code?: string;
  agree_terms: boolean;
};

interface RegisterFormProps {
  initialAccountType: AccountType;
  onSwitchMode: (m: 'login') => void;
}

export function RegisterForm({
  initialAccountType,
  onSwitchMode,
}: RegisterFormProps) {
  const [accountType, setAccountType] = useState<AccountType>(initialAccountType);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const close = useAuthDialog((s) => s.close);
  const apiToast = useApiToast();
  const { data: publicConfig } = usePublicConfig();
  const turnstileRequired = !!publicConfig?.enable_turnstile && !!publicConfig.turnstile_site_key;
  const turnstileBlocked = turnstileRequired && !turnstileToken;
  // 默认 true:配置未拉到时按"需要验证码"渲染,避免后端开着验证而前端跳过校验。
  const emailVerifyRequired = publicConfig?.require_email_verification ?? true;

  const form = useForm<FormShape>({
    resolver: zodResolver(schemaFactory(accountType, emailVerifyRequired)) as never,
    defaultValues: {
      account: '',
      code: '',
      password: '',
      invitation_code: '',
      agree_terms: false,
    },
  });

  const registerEmail = useRegisterEmail();
  const registerPhone = useRegisterPhone();
  const pending = registerEmail.isPending || registerPhone.isPending;

  const onSubmit = async (values: FormShape) => {
    try {
      const ts = turnstileToken ?? undefined;
      // 关闭验证码时,后端 handler 会把任何前端传来的 code 直接置空跳过 cache.VerifyCode;
      // 这里也对应传空字符串,语义清晰且不暴露脏 state。
      const code = emailVerifyRequired ? values.code : '';
      if (accountType === 'email') {
        await registerEmail.mutateAsync({
          email: values.account,
          password: values.password,
          code,
          invitation_code: values.invitation_code || undefined,
          turnstile_token: ts,
        });
      } else {
        await registerPhone.mutateAsync({
          phone: values.account,
          password: values.password,
          code,
          invitation_code: values.invitation_code || undefined,
          turnstile_token: ts,
        });
      }
      trackEvent('register', { method: accountType });
      toast.success('注册成功,欢迎加入 Scholay~');
      close();
    } catch (err) {
      // 抛出的是 ApiError 普通对象(非 Error 实例),用 apiToast 取后端真实文案。
      apiToast.show(err, '注册失败,请稍后重试');
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <AccountTypeTabs value={accountType} onChange={setAccountType} />

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
                  placeholder={accountType === 'email' ? 'you@example.com' : '11 位手机号'}
                  className="h-10 text-sm"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {emailVerifyRequired && (
          <FormField
            control={form.control}
            name="code"
            render={({ field }) => (
              <FormItem>
                <FormLabel>验证码</FormLabel>
                <div className="flex gap-2">
                  <FormControl>
                    <Input
                      {...field}
                      inputMode="numeric"
                      maxLength={6}
                      autoComplete="one-time-code"
                      placeholder="6 位数字"
                      className="h-10 text-sm tracking-widest"
                    />
                  </FormControl>
                  <SendCodeButton
                    accountType={accountType}
                    account={form.watch('account')}
                    purpose="register"
                    validate={() => form.trigger('account')}
                  />
                </div>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>密码</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  type="password"
                  autoComplete="new-password"
                  placeholder="至少 8 位,建议字母+数字"
                  className="h-10 text-sm"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="invitation_code"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-faint">邀请码(可选)</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  placeholder="填写邀请码可获得额度奖励"
                  className="h-10 text-sm"
                />
              </FormControl>
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="agree_terms"
          render={({ field }) => (
            <FormItem className="flex flex-row items-start gap-2 space-y-0">
              <FormControl>
                <Checkbox
                  checked={field.value}
                  onCheckedChange={(v) => field.onChange(!!v)}
                  className="mt-0.5"
                />
              </FormControl>
              <div className="space-y-1 leading-none">
                <FormLabel className="text-xs text-muted-foreground font-normal">
                  我已阅读并同意{' '}
                  <a className="text-foreground hover:underline" href="/terms" target="_blank">
                    服务条款
                  </a>{' '}
                  与{' '}
                  <a className="text-foreground hover:underline" href="/privacy" target="_blank">
                    隐私政策
                  </a>
                </FormLabel>
                <FormMessage />
              </div>
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
          {pending ? '注册中…' : '注册并登录'}
        </Button>

        <p className="text-center text-xs text-muted-foreground">
          已有账号?{' '}
          <button
            type="button"
            className="text-foreground hover:underline"
            onClick={() => onSwitchMode('login')}
          >
            返回登录
          </button>
        </p>
      </form>
    </Form>
  );
}
