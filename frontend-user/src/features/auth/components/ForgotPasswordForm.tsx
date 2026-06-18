import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useApiToast } from '@/shared/hooks';
import { z } from 'zod';
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
  useResetPasswordEmail,
  useResetPasswordPhone,
} from '../api/auth';
import type { AccountType } from '../types';
import { AccountTypeTabs } from './AccountTypeTabs';
import { SendCodeButton } from './SendCodeButton';
import { emailRule, phoneRule } from '@/shared/lib/account-validation';

const codeRule = z.string().length(6, '验证码为 6 位数字').regex(/^\d{6}$/, '验证码为 6 位数字');
const passwordRule = z.string().min(8, '密码至少 8 位,建议含字母和数字').max(64, '密码长度不能超过 64 位');

const schemaFactory = (acc: AccountType) =>
  z.object({
    account: acc === 'email' ? emailRule : phoneRule,
    code: codeRule,
    new_password: passwordRule,
  });

type FormShape = { account: string; code: string; new_password: string };

interface ForgotPasswordFormProps {
  initialAccountType: AccountType;
  onSwitchMode: (m: 'login') => void;
}

export function ForgotPasswordForm({
  initialAccountType,
  onSwitchMode,
}: ForgotPasswordFormProps) {
  const [accountType, setAccountType] = useState<AccountType>(initialAccountType);
  const apiToast = useApiToast();

  const form = useForm<FormShape>({
    resolver: zodResolver(schemaFactory(accountType)) as never,
    defaultValues: { account: '', code: '', new_password: '' },
  });

  const resetEmail = useResetPasswordEmail();
  const resetPhone = useResetPasswordPhone();
  const pending = resetEmail.isPending || resetPhone.isPending;

  const onSubmit = async (values: FormShape) => {
    try {
      if (accountType === 'email') {
        await resetEmail.mutateAsync({
          email: values.account,
          code: values.code,
          new_password: values.new_password,
        });
      } else {
        await resetPhone.mutateAsync({
          phone: values.account,
          code: values.code,
          new_password: values.new_password,
        });
      }
      onSwitchMode('login');
    } catch (err) {
      // 抛出的是 ApiError 普通对象(非 Error 实例),用 apiToast 取后端真实文案。
      apiToast.show(err, '重置失败,请稍后重试');
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
                  className="h-10 text-sm"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

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
                    className="h-10 text-sm tracking-widest"
                  />
                </FormControl>
                <SendCodeButton
                  accountType={accountType}
                  account={form.watch('account')}
                  purpose="reset_password"
                  validate={() => form.trigger('account')}
                />
              </div>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="new_password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>新密码</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  type="password"
                  autoComplete="new-password"
                  placeholder="至少 8 位"
                  className="h-10 text-sm"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit" variant="primary" className="w-full h-10" disabled={pending}>
          {pending ? '重置中…' : '重置密码'}
        </Button>

        <p className="text-center text-xs text-muted-foreground">
          想起来了?{' '}
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
