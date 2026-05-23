import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  Separator,
} from '@/shared/ui';
import { useAuthDialog } from '@/stores/auth-dialog.store';
import { BrandLogo } from '@/shared/components/BrandLogo';
import { LoginForm } from './LoginForm';
import { RegisterForm } from './RegisterForm';
import { ForgotPasswordForm } from './ForgotPasswordForm';
import { OAuthRow } from './OAuthRow';

const TITLES = {
  login: { title: '欢迎回来', desc: '继续你的学术之旅' },
  register: { title: '创建账号', desc: '免费开始使用 Scholay' },
  forgot: { title: '找回密码', desc: '通过验证码重置你的密码' },
} as const;

/**
 * 鉴权弹窗 — 全局唯一,挂在 Providers 之下。
 * 任何按钮 / 引导都通过 useAuthDialog 触发,不要直接 mount 这个组件。
 */
export function AuthDialog() {
  const { open, mode, initialAccountType, setMode, close } = useAuthDialog();
  const t = TITLES[mode];

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? null : close())}>
      <DialogContent className="max-w-md p-0 gap-0 border-border">
        <div className="flex flex-col items-center gap-1 pt-7 pb-4 px-6 border-b border-border-soft">
          <BrandLogo size="md" />
          <DialogTitle className="mt-2 text-lg font-semibold">{t.title}</DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            {t.desc}
          </DialogDescription>
        </div>

        <div className="px-6 py-5">
          {mode === 'login' && (
            <LoginForm
              initialAccountType={initialAccountType}
              onSwitchMode={setMode}
            />
          )}
          {mode === 'register' && (
            <RegisterForm
              initialAccountType={initialAccountType}
              onSwitchMode={setMode}
            />
          )}
          {mode === 'forgot' && (
            <ForgotPasswordForm
              initialAccountType={initialAccountType}
              onSwitchMode={setMode}
            />
          )}
        </div>

        <div className="px-6 pb-6">
          <div className="relative flex items-center my-3">
            <Separator className="flex-1" />
            <span className="px-3 text-2xs text-faint uppercase tracking-widest">
              或继续使用
            </span>
            <Separator className="flex-1" />
          </div>
          <OAuthRow />
        </div>
      </DialogContent>
    </Dialog>
  );
}
