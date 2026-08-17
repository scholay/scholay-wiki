import { ArrowLeft } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  Separator,
} from '@/shared/ui';
import { useAuthDialog } from '@/stores/auth-dialog.store';
import { useAuthStore } from '@/stores/auth.store';
import { usePendingAction } from '@/stores/pending-action.store';
import { BrandLogo } from '@/shared/components/BrandLogo';
import { LoginForm } from './LoginForm';
import { RegisterForm } from './RegisterForm';
import { ForgotPasswordForm } from './ForgotPasswordForm';
import { OAuthRow } from './OAuthRow';
import { OAuthConfirmPanel } from './OAuthConfirmPanel';
import { WeChatQRPanel } from './WeChatQRPanel';
import { InvitationCodeField } from './InvitationCodeField';
import { AUTH_TITLES } from './auth-titles';
import { PROVIDER_META } from './oauth-flow';

/**
 * 鉴权弹窗 — 全局唯一,挂在 Providers 之下。
 *
 * mode / pendingOAuth 决定主体渲染:
 *   - login / register / forgot:对应表单 + 底部 OAuthRow + 邀请码
 *   - pendingOAuth:表单收起,中心放大选中的第三方;邀请码整套组件仍在;
 *     底部 OAuthRow 当选项卡切换授权方式
 *   - wechat-qr:扫码视图;邀请码仍在下方。返回键回到确认层(pending 仍在)。
 */
export function AuthDialog() {
  const { open, mode, initialAccountType, pendingOAuth, setMode, setPendingOAuth, close } =
    useAuthDialog();
  const t = AUTH_TITLES[mode];
  const isWeChatQR = mode === 'wechat-qr';
  const pendingMeta = pendingOAuth ? PROVIDER_META[pendingOAuth] : null;

  const suppressOnMobile =
    !isWeChatQR &&
    typeof window !== 'undefined' &&
    (window.location.pathname === '/m' || window.location.pathname.startsWith('/m/'));

  const handleClose = () => {
    close();
    if (!useAuthStore.getState().token) usePendingAction.getState().clear();
  };

  const handleBack = () => {
    if (isWeChatQR) {
      setMode('login');
      return;
    }
    setPendingOAuth(null);
  };

  return (
    <Dialog open={open && !suppressOnMobile} onOpenChange={(v) => (v ? null : handleClose())}>
      <DialogContent className="max-w-md min-w-0 grid-cols-[minmax(0,1fr)] overflow-x-hidden p-0 gap-0 border-border">
        <div className="relative flex flex-col items-center gap-1 pt-7 pb-4 px-6 border-b border-border-soft">
          {(isWeChatQR || pendingOAuth) && (
            <button
              type="button"
              onClick={handleBack}
              aria-label={isWeChatQR ? '返回确认授权' : '返回登录'}
              className="absolute left-3 top-3 inline-flex size-7 items-center justify-center rounded-8 text-faint hover:bg-surface-2 hover:text-foreground transition-colors"
            >
              <ArrowLeft className="size-4" />
            </button>
          )}
          <BrandLogo size="md" />
          <DialogTitle className="mt-2 text-16 font-medium">
            {pendingMeta && !isWeChatQR ? `使用 ${pendingMeta.label} 继续` : t.title}
          </DialogTitle>
          <DialogDescription className="text-12 text-muted-foreground">
            {pendingMeta && !isWeChatQR
              ? '确认后将前往授权，邀请码可随时填写'
              : t.desc}
          </DialogDescription>
        </div>

        {isWeChatQR ? (
          <div className="min-w-0 px-6 py-5">
            <WeChatQRPanel mode="login" onSuccess={close} />
            <div className="mt-5">
              <InvitationCodeField />
            </div>
          </div>
        ) : (
          <>
            <div className="min-w-0 px-6 py-5">
              {pendingOAuth ? (
                <OAuthConfirmPanel />
              ) : (
                <>
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
                </>
              )}
            </div>

            <div className="min-w-0 px-6 pb-6">
              <div className="relative flex items-center my-3">
                <Separator className="flex-1" />
                <span className="px-3 text-12 text-faint uppercase">
                  {pendingOAuth ? '切换授权方式' : '或继续使用'}
                </span>
                <Separator className="flex-1" />
              </div>
              <OAuthRow />
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
