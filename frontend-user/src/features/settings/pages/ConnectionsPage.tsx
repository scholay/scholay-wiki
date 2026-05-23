import { useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import {
  Mail,
  Smartphone,
  Loader2,
  CheckCircle2,
  Plus,
} from 'lucide-react';
import { Button } from '@/shared/ui';
import { useConfirm } from '@/shared/components/ConfirmDialog';
import {
  ProviderLogo,
  type Provider as OAuthProvider,
} from '@/shared/components/ProviderLogo';
import {
  useUserConnections,
  useUnbindProvider,
  useStartBindingProvider,
  type ConnectionItem,
} from '../api/connections';
import { useEnabledProviders } from '@/features/auth/api/public-config';
import { WeChatQRDialog } from '@/features/auth/components/WeChatQRDialog';
import { cn } from '@/shared/lib/utils';

/**
 * 账号设置 → 已连接账号:
 *   每个 provider 一行,显示绑定状态 + display name + 绑定时间。
 *   未绑定 → 「绑定」按钮(走 OAuth redirect / 微信弹窗)
 *   已绑定 → 「解绑」按钮(login_methods_count == 1 时禁用 + 提示)
 *
 * 业务约束:
 *   - 最后一个登录方式不允许解绑(后端 ensureNotLastLoginMethod 守卫,前端按钮灰态提示)
 *   - email / phone 解绑需要验证码 —— 暂时只支持点开「换绑」用 SendCodeButton 走 prompt
 *     现在简化:email/phone 不在本页解绑,引导用户去 Security 页面
 */

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

/**
 * 渲染绑定行的图标:OAuth provider 走 ProviderLogo(品牌正确);
 * email / phone 不是 OAuth,走 lucide 通用图标。
 */
function renderProviderIcon(provider: string, className: string): ReactNode {
  if (OAUTH_PROVIDERS.has(provider)) {
    return (
      <ProviderLogo provider={provider as OAuthProvider} className={className} />
    );
  }
  if (provider === 'phone') return <Smartphone className={className} />;
  return <Mail className={className} />;
}

export function ConnectionsPage() {
  const { data, isLoading } = useUserConnections();
  const unbindMut = useUnbindProvider();
  const startBind = useStartBindingProvider();
  const enabledProviders = useEnabledProviders();
  const confirm = useConfirm();
  const [wechatBindOpen, setWechatBindOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!data) return null;

  const lastMethod = data.login_methods_count <= 1;
  // 第三方 provider:只有管理员开了的才显示
  const visibleConnections = data.connections.filter((c) => {
    if (c.provider === 'email' || c.provider === 'phone') return true;
    return enabledProviders.includes(c.provider as never) || c.bound;
  });

  const onBind = async (provider: string, alreadyBound: boolean) => {
    // 防御性:已绑 provider 不允许再点「绑定」(后端 UNIQUE 也会阻挡,但 UI 先拦更友好)
    if (alreadyBound) {
      toast.info(`${PROVIDER_LABEL[provider] ?? provider} 已经绑定过了,想换一个的话先解绑`);
      return;
    }
    if (provider === 'email' || provider === 'phone') {
      toast.info('邮箱和手机号请到「安全设置」里修改');
      return;
    }
    if (provider === 'wechat') {
      // 微信走二维码弹窗,WeChatQRDialog mode='bind' 内部接 postMessage + bind-wechat
      setWechatBindOpen(true);
      return;
    }
    // Apple 走 backend bind-url(state nonce 中继),其余 5 个走 sessionStorage 标记
    try {
      await startBind.mutateAsync(provider);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '启动绑定失败,请稍后重试');
    }
  };

  const onUnbind = async (item: ConnectionItem) => {
    if (item.provider === 'email' || item.provider === 'phone') {
      toast.info('邮箱和手机号请到「安全设置」里解绑(需要验证码)');
      return;
    }
    if (lastMethod) {
      toast.error('这是你最后一种登录方式,先绑定一个其他方式(邮箱 / 手机号 / 第三方账号)再解绑');
      return;
    }
    const label = PROVIDER_LABEL[item.provider] ?? item.provider;
    const ok = await confirm({
      title: `解绑${label}?`,
      description: `解绑后将无法用${label}登录这个账号,你随时可以再次绑定。`,
      confirmText: '解绑',
      cancelText: '再想想',
      danger: true,
    });
    if (!ok) return;
    try {
      await unbindMut.mutateAsync({ provider: item.provider });
      toast.success(`${label} 已解绑`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '解绑失败,请稍后重试');
    }
  };

  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold text-foreground">已连接的账号</h2>
        <p className="text-sm text-muted-foreground leading-[1.6]">
          管理你登录这个账号的方式。为了安全,至少要保留 1 种,避免下次登不进来。
          目前共有{' '}
          <span className="font-semibold text-foreground">{data.login_methods_count}</span>{' '}
          种登录方式。
        </p>
      </div>

      <div className="flex flex-col gap-2">
        {visibleConnections.map((c) => {
          const label = PROVIDER_LABEL[c.provider] ?? c.provider;
          return (
            <div
              key={c.provider}
              className="flex items-center gap-4 p-4 rounded-md border border-border bg-background"
            >
              <div
                className={cn(
                  'inline-flex h-10 w-10 items-center justify-center rounded-sm shrink-0',
                  c.bound ? 'bg-prism-badge-bg' : 'bg-surface-1'
                )}
              >
                {renderProviderIcon(
                  c.provider,
                  cn(
                    'size-4',
                    c.bound ? 'text-foreground' : 'text-muted-foreground'
                  )
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-foreground">{label}</span>
                  {c.bound && (
                    <CheckCircle2 className="size-3.5 text-brand-green" strokeWidth={2.5} />
                  )}
                </div>
                <div className="text-xs text-muted-foreground truncate">
                  {c.bound
                    ? c.display_name || c.provider_user_id || '已绑定'
                    : '未绑定'}
                  {c.created_at && (
                    <span className="ml-2 text-faint">· 绑定于 {c.created_at}</span>
                  )}
                </div>
              </div>
              {c.bound ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => onUnbind(c)}
                  disabled={lastMethod || unbindMut.isPending}
                  title={lastMethod ? '这是你最后一种登录方式,不能解绑' : undefined}
                >
                  {unbindMut.isPending ? '处理中…' : '解绑'}
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="default"
                  size="sm"
                  onClick={() => onBind(c.provider, c.bound)}
                  disabled={startBind.isPending}
                >
                  <Plus className="size-3.5 mr-1" />
                  绑定
                </Button>
              )}
            </div>
          );
        })}
      </div>

      <WeChatQRDialog
        open={wechatBindOpen}
        onOpenChange={setWechatBindOpen}
        mode="bind"
      />
    </div>
  );
}

export default ConnectionsPage;
