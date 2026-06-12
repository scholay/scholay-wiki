import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Separator } from '@/shared/ui';
import { BrandLogo } from '@/shared/components/BrandLogo';
import { useAuthStore } from '@/stores/auth.store';
import { useAuthDialog } from '@/stores/auth-dialog.store';
import { TITLES } from '../../components/AuthDialog';
import { LoginForm } from '../../components/LoginForm';
import { RegisterForm } from '../../components/RegisterForm';
import { ForgotPasswordForm } from '../../components/ForgotPasswordForm';
import { OAuthRow } from '../../components/OAuthRow';

type PageMode = 'login' | 'register' | 'forgot';

/**
 * 移动端整页登录/注册(/m/auth) —— PC AuthDialog 的整页形态:
 * 头部品牌区 + LoginForm/RegisterForm/ForgotPasswordForm + OAuthRow
 * **全部直接复用弹窗里的同一批组件**,样式/文案/Turnstile/验证码逻辑零分叉。
 *
 * 与弹窗的差异只有壳:
 *   - ?mode=register 控初始面板(「我的」页注册按钮带参进来)
 *   - 微信扫码仍走全局弹窗(OAuthRow 内部 openDialog('wechat-qr'),整页无需自渲染)
 *   - 登录成功(token 到位)→ 自动回「我的」
 */
export function MobileAuthPage() {
  const [searchParams] = useSearchParams();
  const initialMode: PageMode =
    searchParams.get('mode') === 'register' ? 'register' : 'login';
  const [mode, setMode] = useState<PageMode>(initialMode);

  const token = useAuthStore((s) => s.token);
  const navigate = useNavigate();

  // 登录/注册成功(或本来就已登录)→ 回触发位置(?from=,由 MobileShell 桥接带入),
  // 没有合法 from 则回「我的」。只认 /m 内路径,防开放跳转。
  const from = searchParams.get('from');
  const target =
    from && from.startsWith('/m') && !from.startsWith('/m/auth')
      ? from
      : '/m/me';
  useEffect(() => {
    if (token) void navigate(target, { replace: true });
  }, [token, navigate, target]);

  // 表单的 onSwitchMode 可能给出 wechat-qr(理论上微信只走 OAuthRow,防御处理):
  // 整页不渲染扫码视图,转交全局弹窗。
  const handleSwitchMode = (m: PageMode | 'wechat-qr') => {
    if (m === 'wechat-qr') {
      useAuthDialog.getState().openDialog('wechat-qr');
      return;
    }
    setMode(m);
  };

  const t = TITLES[mode];

  return (
    <div className="h-full overflow-y-auto bg-background">
      <header className="flex h-12 items-center px-2">
        <button
          type="button"
          aria-label="返回"
          onClick={() => void navigate('/m/feed')}
          className="flex h-9 w-9 items-center justify-center rounded-pill active:bg-surface-2"
        >
          <ArrowLeft className="size-5 text-foreground" />
        </button>
      </header>

      {/* 品牌区 —— 与 AuthDialog 头部同构 */}
      <div className="flex flex-col items-center gap-1 border-b border-border-soft px-6 pb-4">
        <BrandLogo size="md" />
        <h1 className="mt-2 text-lg font-semibold text-foreground">{t.title}</h1>
        <p className="text-xs text-muted-foreground">{t.desc}</p>
      </div>

      <div className="px-6 py-5">
        {mode === 'login' && (
          <LoginForm initialAccountType="email" onSwitchMode={handleSwitchMode} />
        )}
        {mode === 'register' && (
          <RegisterForm initialAccountType="email" onSwitchMode={handleSwitchMode} />
        )}
        {mode === 'forgot' && (
          <ForgotPasswordForm
            initialAccountType="email"
            onSwitchMode={handleSwitchMode}
          />
        )}
      </div>

      <div className="px-6 pb-10">
        <div className="relative my-3 flex items-center">
          <Separator className="flex-1" />
          <span className="px-3 text-2xs tracking-widest text-faint uppercase">
            或继续使用
          </span>
          <Separator className="flex-1" />
        </div>
        {/* 微信暂不在移动端提供:PC 扫码自己扫不了自己;待公众号网页授权(P1)落地放开 */}
        <OAuthRow exclude={['wechat']} />
      </div>
    </div>
  );
}
