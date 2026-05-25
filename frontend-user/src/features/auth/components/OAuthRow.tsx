import { toast } from 'sonner';
import { ProviderLogo } from '@/shared/components/ProviderLogo';
import { http, toApiError } from '@/shared/lib/http';
import { useAuthDialog } from '@/stores/auth-dialog.store';
import {
  useEnabledProviders,
  type EnabledProvider,
} from '../api/public-config';
import { GoogleSignInButton } from './GoogleSignInButton';

/**
 * 第三方登录按钮组 —— 全部 8 家(GitHub / Google / WeChat / Apple / ORCID /
 * Microsoft / Discourse),按管理员后台 `enable_*` 配置 **动态显示**。
 *
 * Provider 入口策略:
 *   - GitHub / Orcid / Microsoft / Discourse: GET /user/<x>/login-url → 整页跳转
 *   - Google: 用 GIS One-Tap(暂沿用 redirect,后续单独优化)
 *   - Apple: 重定向到 Apple JS SDK 接入页
 *   - WeChat: **不另起 Dialog**,把 AuthDialog 自身切到 'wechat-qr' 模式,原地渲染
 *     WeChatQRPanel(iframe 内载 wxLogin.js,扫码后 redirect 回我们的 callback)。
 *     扫码成功一次性关掉 AuthDialog,避免双层 Dialog 关闭路径混乱。
 *
 * 未启用的 provider 不渲染按钮 —— 通过 usePublicConfig 拉的开关判定。
 */
const PROVIDER_META: Record<
  EnabledProvider,
  {
    label: string;
    /** 整页跳走的 URL endpoint */
    urlPath?: string;
  }
> = {
  github: { label: 'GitHub', urlPath: '/user/github/login-url' },
  google: { label: 'Google', urlPath: '/user/google/client-id' }, // GIS 入口由 GoogleButton 后续实装,这里占位
  wechat: { label: '微信' }, // 走 AuthDialog 内的 wechat-qr 模式
  apple: { label: 'Apple', urlPath: '/user/apple/login-url' },
  orcid: { label: 'ORCID', urlPath: '/user/orcid/login-url' },
  microsoft: { label: 'Microsoft', urlPath: '/user/microsoft/login-url' },
  discourse: { label: '恩特学术社区', urlPath: '/user/discourse/login-url' },
};

export function OAuthRow() {
  const providers = useEnabledProviders();
  const setMode = useAuthDialog((s) => s.setMode);

  const handleRedirect = async (provider: EnabledProvider) => {
    const meta = PROVIDER_META[provider];
    if (!meta.urlPath) return;
    try {
      const { data } = await http.get<{ data: { url?: string } }>(meta.urlPath);
      const url = data.data?.url;
      if (!url) {
        toast.error(`${meta.label} 登录暂未开通,请稍后再试或选择其他登录方式`);
        return;
      }
      window.location.href = url;
    } catch (err) {
      toast.error(toApiError(err).message || `${meta.label} 登录暂未开通,请稍后再试或选择其他登录方式`);
    }
  };

  if (providers.length === 0) return null;

  return (
    <div className="flex items-center justify-center gap-2 flex-wrap">
      {providers.map((p) => {
        // Google 走 GIS One-Tap,渲染官方按钮(由 GoogleSignInButton 内部处理 onClick)
        if (p === 'google') {
          return <GoogleSignInButton key={p} />;
        }
        const meta = PROVIDER_META[p];
        const onClick =
          p === 'wechat' ? () => setMode('wechat-qr') : () => handleRedirect(p);
        return (
          <button
            key={p}
            type="button"
            onClick={onClick}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border text-subtle hover:bg-surface-2 hover:text-foreground transition-colors"
            title={meta.label}
            aria-label={`使用 ${meta.label} 登录`}
          >
            <ProviderLogo provider={p} className="size-4" />
          </button>
        );
      })}
    </div>
  );
}
