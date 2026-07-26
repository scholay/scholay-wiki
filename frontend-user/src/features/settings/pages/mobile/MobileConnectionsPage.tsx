import { Loader2, Mail, Smartphone } from 'lucide-react';
import { ProviderLogo, type Provider } from '@/shared/components/ProviderLogo';
import { useEnabledProviders } from '@/shared/api/public-config';
import { useUserConnections } from '../../api/connections';
import { MeSubpageShell } from '../../components/mobile/MeSubpageShell';

const PROVIDER_LABEL: Record<string, string> = {
  email: '邮箱',
  phone: '手机号',
  github: 'GitHub',
  google: 'Google',
  wechat: '微信',
  apple: 'Apple',
  orcid: 'ORCID',
  microsoft: 'Microsoft',
  discourse: '恩特学术社区',
};

const OAUTH_PROVIDERS: ReadonlySet<string> = new Set([
  'github',
  'google',
  'wechat',
  'apple',
  'orcid',
  'microsoft',
  'discourse',
]);

/** email/phone 不是 OAuth,走 lucide 通用图标(同 PC ConnectionsPage 手法)。 */
function renderProviderIcon(provider: string, className: string) {
  if (OAUTH_PROVIDERS.has(provider)) {
    return <ProviderLogo provider={provider as Provider} className={className} />;
  }
  if (provider === 'phone') return <Smartphone className={className} />;
  return <Mail className={className} />;
}

/**
 * 移动端已连接账号 —— 绑定状态展示(数据复用 useUserConnections)。
 * 绑定/解绑涉及 OAuth 整页跳转回跳路径,移动端后续里程碑(提示去电脑端)。
 */
export function MobileConnectionsPage() {
  return (
    <MeSubpageShell title="已连接账号">
      <ConnectionsBody />
    </MeSubpageShell>
  );
}

function ConnectionsBody() {
  const connQ = useUserConnections();
  const enabledProviders = useEnabledProviders();

  if (connQ.isLoading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Loader2 className="size-5 animate-spin text-faint" />
      </div>
    );
  }

  // 与 PC ConnectionsPage 同款过滤:邮箱/手机恒显;
  // 第三方 provider 只显管理员启用的 —— 但已绑定的即使被关掉也要显(用户得知道它存在)。
  // 微信额外排除:移动端暂不提供微信登录/绑定(PC 扫码在手机上不可用,
  // 公众号网页授权 P1 落地前整端隐藏,见 wechat-mobile-login-research 调研)。
  const connections = (connQ.data?.connections ?? []).filter((c) => {
    if (c.provider === 'wechat') return false;
    if (c.provider === 'email' || c.provider === 'phone') return true;
    return enabledProviders.includes(c.provider as never) || c.bound;
  });

  return (
    <div className="space-y-3 p-3">
      <section className="overflow-hidden rounded-16 border border-border bg-surface-card">
        {connections.map((c, i) => {
          const label = PROVIDER_LABEL[c.provider] ?? c.provider;
          return (
            <div
              key={c.provider}
              className={`flex h-13 items-center gap-3 px-4 ${i === connections.length - 1 ? '' : 'border-b border-border-soft'}`}
            >
              {renderProviderIcon(c.provider, 'size-5 text-foreground')}
              <span className="flex-1 text-md text-foreground">{label}</span>
              {c.bound ? (
                <span className="max-w-32 truncate text-xs text-muted-foreground">
                  {c.display_name || '已绑定'}
                </span>
              ) : (
                <span className="text-xs text-faint">未绑定</span>
              )}
              <span
                className={`h-1.5 w-1.5 rounded-pill ${c.bound ? 'bg-brand-green' : 'bg-border-strong'}`}
              />
            </div>
          );
        })}
        {connections.length === 0 && (
          <p className="py-10 text-center text-sm text-faint">暂无连接信息</p>
        )}
      </section>
      <p className="px-1 text-xs leading-paragraph text-faint">
        绑定 / 解绑第三方账号涉及授权跳转,请在电脑端「设置 → 已连接账号」操作
      </p>
    </div>
  );
}
