import { X } from 'lucide-react';
import { Separator } from '@/shared/ui';
import { BrandLogo } from '@/shared/components/BrandLogo';
import { MobileBottomSheet } from '@/shared/components/MobileBottomSheet';
import { useAuthStore } from '@/stores/auth.store';
import { useAuthDialog } from '@/stores/auth-dialog.store';
import { usePendingAction } from '@/stores/pending-action.store';
import { TITLES } from './AuthDialog';
import { LoginForm } from './LoginForm';
import { RegisterForm } from './RegisterForm';
import { ForgotPasswordForm } from './ForgotPasswordForm';
import { OAuthRow } from './OAuthRow';

/**
 * 移动端登录/注册 **底部弹窗**(MobileShell 挂一份,全局 useAuthDialog 驱动)。
 *
 * 用统一的 MobileBottomSheet(Radix Dialog 保焦点陷阱/可达性 + framer 拖拽下滑关闭 + 弹簧进退场)。
 * elevated:它常叠在分享弹窗之上,需更高 z-index。表单/校验/Turnstile 复用 PC 同组件;
 * 登录成功表单自调 close() 收起,MobileShell 的 useReplayPendingAction 继续后续动作。
 * 微信扫码移动端不提供,wechat-qr 模式不渲染。
 */
export function MobileAuthSheet() {
  const open = useAuthDialog((s) => s.open);
  const mode = useAuthDialog((s) => s.mode);
  const initialAccountType = useAuthDialog((s) => s.initialAccountType);
  const setMode = useAuthDialog((s) => s.setMode);
  const close = useAuthDialog((s) => s.close);

  const visible = open && mode !== 'wechat-qr';
  const t = mode === 'wechat-qr' ? TITLES.login : TITLES[mode];

  // 关闭(点蒙层/Esc/下滑/✕)= 放弃登录 → 清掉待执行动作(与 PC AuthDialog.handleClose 一致);
  // 登录成功是表单自调 close()(token 已在),不会清。
  const handleDismiss = () => {
    close();
    if (!useAuthStore.getState().token) usePendingAction.getState().clear();
  };

  return (
    <MobileBottomSheet
      open={visible}
      onOpenChange={(v) => {
        if (!v) handleDismiss();
      }}
      title={t.title}
      elevated
    >
      {/* 品牌 + 标题(右上角关闭) */}
      <div className="relative flex flex-col items-center gap-1 px-6 pb-3 pt-1 text-center">
        <button
          type="button"
          aria-label="关闭"
          onClick={handleDismiss}
          className="absolute right-0 top-0 flex size-8 items-center justify-center rounded-pill text-muted-foreground transition-transform active:scale-90 active:bg-surface-2"
        >
          <X className="size-5" />
        </button>
        <BrandLogo size="md" />
        <h1 className="mt-1.5 text-lg font-bold text-foreground">{t.title}</h1>
        <p className="text-xs text-muted-foreground">{t.desc}</p>
      </div>

      {/* 表单(可滚)+ 第三方;放大触控目标(同整页),仅作用本弹窗。 */}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pb-8 [&_input]:h-12 [&_input]:rounded-xl [&_input]:text-base [&_button[type=submit]]:h-12 [&_button[type=submit]]:rounded-xl [&_button[type=submit]]:text-base">
        {mode === 'login' && (
          <LoginForm initialAccountType={initialAccountType} onSwitchMode={setMode} />
        )}
        {mode === 'register' && (
          <RegisterForm initialAccountType={initialAccountType} onSwitchMode={setMode} />
        )}
        {mode === 'forgot' && (
          <ForgotPasswordForm initialAccountType={initialAccountType} onSwitchMode={setMode} />
        )}

        <div className="mt-6">
          <div className="relative flex items-center">
            <Separator className="flex-1" />
            <span className="px-3 text-2xs uppercase tracking-widest text-faint">或继续使用</span>
            <Separator className="flex-1" />
          </div>
          <div className="mt-4">
            <OAuthRow exclude={['wechat']} />
          </div>
        </div>
      </div>
    </MobileBottomSheet>
  );
}
