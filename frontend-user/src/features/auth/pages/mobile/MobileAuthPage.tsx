import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
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
 * 移动端整页登录/注册(/m/auth) —— **移动原生**形态(不是把 PC 弹窗拉满屏):
 *   - 无顶部返回按钮、无弹窗式分隔线;靠底部 tab(浏览/AI Claw/功能/我的)导航
 *   - 大留白品牌欢迎区(logo lg + 大标题)
 *   - 表单仍**复用** PC 的 LoginForm/RegisterForm/ForgotPasswordForm(逻辑/校验/Turnstile 零分叉),
 *     仅用 scoped 变体在本页把输入框/主按钮放大到 h-12 圆角大字号(触控友好),**不影响** PC 弹窗
 *
 * 行为:
 *   - ?mode=register 控初始面板(「我的」页注册按钮带参进来)
 *   - 微信扫码仍走全局弹窗(OAuthRow 内部 openDialog('wechat-qr'))
 *   - 登录成功(token 到位)→ 回 ?from= 来源页,无则回「我的」
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
    <div className="flex h-full flex-col overflow-y-auto bg-background px-6 pb-10">
      {/* 品牌 / 欢迎区 —— 大留白,移动 app 风格(无返回按钮、无分隔线) */}
      <div className="flex flex-col items-center pt-14 pb-9 text-center">
        <BrandLogo size="lg" />
        <h1 className="mt-5 text-2xl font-bold text-foreground">{t.title}</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">{t.desc}</p>
      </div>

      {/* 表单 —— 移动端放大触控目标:输入框 / 主按钮抬到 h-12 + 圆角 + 大字号。
          用 scoped 变体只作用于本页内的共享表单,PC 弹窗里的 h-10 紧凑样式不受影响。 */}
      <div className="[&_input]:h-12 [&_input]:rounded-12 [&_input]:text-base [&_button[type=submit]]:h-12 [&_button[type=submit]]:rounded-12 [&_button[type=submit]]:text-base">
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

      {/* 第三方登录 */}
      <div className="mt-8">
        <div className="relative flex items-center">
          <Separator className="flex-1" />
          <span className="px-3 text-2xs text-faint uppercase">
            或继续使用
          </span>
          <Separator className="flex-1" />
        </div>
        {/* 微信暂不在移动端提供:PC 扫码自己扫不了自己;待公众号网页授权(P1)落地放开 */}
        <div className="mt-4">
          <OAuthRow exclude={['wechat']} />
        </div>
      </div>
    </div>
  );
}
