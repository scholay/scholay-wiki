import { Save, Loader2 } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/shared/ui/tabs';
import {
  ProviderLogo,
  type Provider as BrandProvider,
} from '@/shared/components/ProviderLogo';
import { AdminPageLayout } from '../components/AdminPageLayout';
import { useApiToast } from '../hooks/useApiToast';
import {
  useOAuthConfig,
  useUpdateOAuthConfig,
  type OAuthProvider,
} from '../api/oauth';

const PROVIDERS: { id: OAuthProvider; label: string; hint: string }[] = [
  { id: 'github', label: 'GitHub', hint: 'OAuth Apps · Client ID + Secret' },
  { id: 'google', label: 'Google', hint: 'Google Cloud Console · OAuth 2.0' },
  { id: 'apple', label: 'Apple', hint: '需要 team_id / key_id / private_key,放入 metadata JSON' },
  { id: 'orcid', label: 'ORCID', hint: '科研身份认证 · OAuth 2.0' },
  { id: 'microsoft', label: 'Microsoft', hint: 'Azure AD / Entra ID' },
  // 内部 provider key 是 discourse(部署在 Discourse 上),用户感知是「恩特学术社区」
  { id: 'discourse', label: '恩特学术社区', hint: '恩特学术社区(enterscholar.com)· 走 Discourse SSO Provider 协议接入' },
  { id: 'wechat', label: '微信', hint: '微信开放平台 · 网页授权' },
];

export function OAuthConfigPage() {
  return (
    <AdminPageLayout
      title="OAuth / SSO"
      description="7 个第三方登录 provider · 标准字段 + provider-specific metadata"
    >
      <Tabs defaultValue={PROVIDERS[0].id}>
        <TabsList className="flex-wrap h-auto">
          {PROVIDERS.map((p) => (
            <TabsTrigger
              key={p.id}
              value={p.id}
              className="inline-flex items-center gap-1.5"
            >
              <ProviderLogo
                provider={p.id as BrandProvider}
                className="size-3.5"
              />
              {p.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {PROVIDERS.map((p) => (
          <TabsContent key={p.id} value={p.id} className="mt-4">
            <ProviderPanel provider={p.id} label={p.label} hint={p.hint} />
          </TabsContent>
        ))}
      </Tabs>
    </AdminPageLayout>
  );
}

function ProviderPanel({
  provider,
  label,
  hint,
}: {
  provider: OAuthProvider;
  label: string;
  hint: string;
}) {
  const { data, isLoading } = useOAuthConfig(provider);
  const update = useUpdateOAuthConfig(provider);
  const apiToast = useApiToast();

  if (isLoading) {
    return (
      <div className="rounded-md border border-border bg-background p-6 flex items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        加载 {label} 配置…
      </div>
    );
  }

  return (
    <form
      className="rounded-md border border-border bg-background p-6 space-y-4 max-w-3xl"
      onSubmit={async (e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        await apiToast(
          update.mutateAsync({
            client_id: String(fd.get('client_id') || '') || undefined,
            client_secret: String(fd.get('client_secret') || '') || undefined,
            redirect_uri: String(fd.get('redirect_uri') || '') || undefined,
            metadata: String(fd.get('metadata') || '') || undefined,
            enabled: fd.get('enabled') === 'on',
          }),
          { success: `${label} 已保存`, failure: '保存失败' }
        );
      }}
    >
      <div className="pb-3 border-b border-border-soft">
        <h2 className="flex items-center gap-2 text-base font-bold text-foreground">
          <ProviderLogo provider={provider as BrandProvider} className="size-4" />
          {label}
        </h2>
        <p className="text-xs text-muted-foreground mt-1">{hint}</p>
        {data?.updated_at && (
          <p className="text-2xs text-faint mt-1">最后更新 {data.updated_at.slice(0, 19).replace('T', ' ')}</p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`${provider}-client_id`}>Client ID</Label>
        <Input id={`${provider}-client_id`} name="client_id" defaultValue={data?.client_id} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${provider}-client_secret`}>Client Secret</Label>
        <Input
          id={`${provider}-client_secret`}
          name="client_secret"
          type="password"
          placeholder="留空表示不修改"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${provider}-redirect_uri`}>Redirect URI</Label>
        <Input
          id={`${provider}-redirect_uri`}
          name="redirect_uri"
          defaultValue={data?.redirect_uri}
          placeholder="https://scholay.com/oauth/callback"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${provider}-metadata`}>Provider-specific 配置(JSON)</Label>
        <textarea
          id={`${provider}-metadata`}
          name="metadata"
          rows={6}
          defaultValue={data?.metadata}
          placeholder='{"team_id":"...", "key_id":"..."}'
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <p className="text-2xs text-faint">Apple 的 team_id/key_id/private_key、Discourse 的 sso_url 等放这里。后端按 provider 解析。</p>
      </div>

      <div className="flex items-center gap-2">
        <input id={`${provider}-enabled`} name="enabled" type="checkbox" defaultChecked={data?.enabled} className="size-4" />
        <Label htmlFor={`${provider}-enabled`} className="text-sm">启用 {label} 登录</Label>
      </div>

      <div className="pt-3 border-t border-border-soft">
        <Button type="submit" disabled={update.isPending}>
          {update.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
          保存 {label} 配置
        </Button>
      </div>
    </form>
  );
}
