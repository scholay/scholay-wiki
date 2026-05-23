import { useQuery } from '@tanstack/react-query';
import { http } from '@/shared/lib/http';

/**
 * 公开系统配置 —— 没有 auth 也能读,供登录 / 注册 / 设置页用:
 *
 *   - require_email_verification:注册 / 换邮箱是否要走验证码(后端开关)
 *   - enable_turnstile + turnstile_site_key:是否渲染 Cloudflare Turnstile
 *   - github_client_id / google_client_id / discourse_site_url:provider 启用 + 公钥
 *   - apple_enabled / microsoft_enabled / orcid_enabled / wechat_enabled:provider 启用布尔
 *
 * queryKey 第一段用 'public-config' 与 'auth' 区分 —— 这个数据不挂在 user 上,
 * 全站共享,谁登录都不会让它变,所以 staleTime 给 5min。
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
    // 失败时给个安全 fallback,登录页才不至于因为配置接口挂掉就完全不显示按钮。
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
  // Google 走 GIS One-Tap 模式(见 GoogleSignInButton),不走 redirect 流程。
  // OAuthRow 检到 'google' 时会跳过通用 redirect 按钮,改 render GoogleSignInButton。
  if (data.google_client_id) list.push('google');
  if (data.wechat_enabled) list.push('wechat');
  if (data.apple_enabled) list.push('apple');
  if (data.microsoft_enabled) list.push('microsoft');
  if (data.orcid_enabled) list.push('orcid');
  if (data.discourse_site_url) list.push('discourse');
  return list;
}
