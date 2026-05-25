import { useQuery } from '@tanstack/react-query';
import { http } from '@/shared/lib/http';

/**
 * 公开系统配置 —— 跨 feature 资源(登录页、注册页、设置页都要读)。
 *
 * 放 shared/api 而非 features/auth:settings/connections 也要按 enabled
 * provider 列表渲染绑定按钮,放在 auth 下会让 settings → auth 形成
 * 跨 feature 反向依赖(违反 §一)。这份配置本身也是全站常量,跟 auth feature
 * 的私有性质不符。
 *
 * 字段对照:
 *   - require_email_verification: 注册/换邮箱是否走验证码
 *   - enable_turnstile + turnstile_site_key: 是否渲染 Cloudflare Turnstile
 *   - github_client_id / google_client_id / discourse_site_url: provider 启用 + 公钥
 *   - apple_enabled / microsoft_enabled / orcid_enabled / wechat_enabled: provider 启用
 *
 * queryKey 用 'public-config' 区分 'auth' —— 这个跟谁登录无关,staleTime 5min。
 */

export interface PublicSystemConfig {
  id: number;
  require_email_verification: boolean;
  enable_turnstile: boolean;
  turnstile_site_key: string;
  github_client_id?: string;
  google_client_id?: string;
  discourse_site_url?: string;
  apple_enabled?: boolean;
  microsoft_enabled?: boolean;
  orcid_enabled?: boolean;
  wechat_enabled?: boolean;
}

export function usePublicConfig() {
  return useQuery({
    queryKey: ['public-config', 'system'],
    queryFn: async () => {
      const { data } = await http.get<{ data: PublicSystemConfig }>(
        '/config/system'
      );
      return data.data;
    },
    staleTime: 5 * 60 * 1000,
    // 失败兜底:登录页才不至于因为配置挂掉就完全不显示按钮。
    retry: 1,
  });
}

/**
 * 已启用 provider 列表 —— 把 publicConfig 的 enabled 布尔展平成数组,
 * 供 OAuth 按钮组按这个序排版渲染。
 */
export type EnabledProvider =
  | 'github'
  | 'google'
  | 'wechat'
  | 'apple'
  | 'microsoft'
  | 'orcid'
  | 'discourse';

export function useEnabledProviders(): EnabledProvider[] {
  const { data } = usePublicConfig();
  if (!data) return [];
  const list: EnabledProvider[] = [];
  if (data.github_client_id) list.push('github');
  // Google 走 GIS One-Tap(GoogleSignInButton),OAuthRow 检到 'google' 时跳过通用
  // redirect 按钮改 render One-Tap;但仍要 push 进列表占位以保持排序。
  if (data.google_client_id) list.push('google');
  if (data.wechat_enabled) list.push('wechat');
  if (data.apple_enabled) list.push('apple');
  if (data.microsoft_enabled) list.push('microsoft');
  if (data.orcid_enabled) list.push('orcid');
  if (data.discourse_site_url) list.push('discourse');
  return list;
}
