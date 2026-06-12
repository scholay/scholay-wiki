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
import { WeChatQRPanel } from './WeChatQRPanel';

// 移动整页版(MobileAuthPage)共用同一份标题文案 —— 双端措辞永远一致
export const TITLES = {
  login: { title: '欢迎回来', desc: '继续你的学术之旅' },
  register: { title: '创建账号', desc: '免费开始使用 Scholay' },
  forgot: { title: '找回密码', desc: '通过验证码重置你的密码' },
  'wechat-qr': { title: '使用微信扫一扫', desc: '打开微信,扫描下方二维码完成登录' },
} as const;

/**
 * 鉴权弹窗 — 全局唯一,挂在 Providers 之下。
 * 任何按钮 / 引导都通过 useAuthDialog 触发,不要直接 mount 这个组件。
 *
 * mode 决定主体渲染:
 *   - login / register / forgot:对应表单 + 底部 OAuthRow
 *   - wechat-qr:**原地**切换到微信扫码视图,顶部带返回按钮回 login。
 *     这样避免双层 Dialog(老版用嵌套 WeChatQRDialog,扫码成功只关里层,
 *     主登录弹窗仍在,体验混乱)
 */
export function AuthDialog() {
  const { open, mode, initialAccountType, setMode, close } = useAuthDialog();
  const t = TITLES[mode];
  const isWeChatQR = mode === 'wechat-qr';

  // 移动端(/m/*)的登录走 /m/auth 整页(MobileShell 的桥接 effect 会立刻转跳),
  // 这里不渲染弹窗本体,避免转跳前闪一帧 PC 弹窗。扫码视图例外(移动端就用弹窗)。
  if (
    open &&
    !isWeChatQR &&
    typeof window !== 'undefined' &&
    (window.location.pathname === '/m' || window.location.pathname.startsWith('/m/'))
  ) {
    return null;
  }

  // 用户**主动关弹窗且仍未登录**(Esc / 点外面 / ×)→ 顺手丢掉 pending-action,
  // 否则之后从别处(topnav / OAuth)登录会被莫名重放(如未登录点首页「智能搜索」排了个
  // navigate,取消后又从别处登录 → 莫名跳进智能搜索)。
  // 成功登录是 LoginForm 直接调 close()(改 open prop),**不**经过这里的 onOpenChange,
  // 且此时 token 已就位,故 guard 再兜一层,绝不会误清掉要被 useReplayPendingAction 消费的动作。
  const handleClose = () => {
    close();
    if (!useAuthStore.getState().token) usePendingAction.getState().clear();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? null : handleClose())}>
      <DialogContent className="max-w-md p-0 gap-0 border-border">
        <div className="relative flex flex-col items-center gap-1 pt-7 pb-4 px-6 border-b border-border-soft">
          {/* 微信扫码模式:左上角返回箭头,回到 login;其他模式无返回(可关弹窗) */}
          {isWeChatQR && (
            <button
              type="button"
              onClick={() => setMode('login')}
              aria-label="返回登录"
              className="absolute left-3 top-3 inline-flex size-7 items-center justify-center rounded-sm text-faint hover:bg-surface-2 hover:text-foreground transition-colors"
            >
              <ArrowLeft className="size-4" />
            </button>
          )}
          <BrandLogo size="md" />
          <DialogTitle className="mt-2 text-lg font-semibold">{t.title}</DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            {t.desc}
          </DialogDescription>
        </div>

        {isWeChatQR ? (
          // 扫码模式 —— 不渲染表单/OAuthRow,只放 QR 面板
          // 扫码成功 onSuccess → 关掉整个 AuthDialog(handleAuthSuccess 已写 session)
          <div className="px-6 py-5">
            <WeChatQRPanel mode="login" onSuccess={close} />
          </div>
        ) : (
          <>
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
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
