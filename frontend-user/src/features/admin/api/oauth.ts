import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { http } from '@/shared/lib/http';

/**
 * OAuth / SSO 8 个 provider 共用相同的 hook 形状,只是 endpoint 名不同。
 * provider 决定后端路径:`/admin/<provider>-config`(github/google/apple/orcid/microsoft/discourse)
 * 微信 OAuth 单独走 `/admin/wechat/config`(本文件归一化路径)。
 */

export type OAuthProvider =
  | 'github'
  | 'google'
  | 'apple'
  | 'orcid'
  | 'microsoft'
  | 'discourse'
  | 'wechat';

export interface OAuthConfig {
  client_id?: string;
  client_secret?: string;
  redirect_uri?: string;
  enabled: boolean;
  /** provider-specific raw JSON(Apple 的 team_id/key_id/private_key、Discourse 的 sso_url 等) */
  metadata?: string;
  updated_at?: string;
}

function endpointFor(provider: OAuthProvider): string {
  return provider === 'wechat' ? '/admin/wechat/config' : `/admin/${provider}-config`;
}

export function useOAuthConfig(provider: OAuthProvider) {
  return useQuery({
    queryKey: ['admin', 'oauth', provider],
    queryFn: async () => (await http.get<{ data: OAuthConfig }>(endpointFor(provider))).data.data,
  });
}

export function useUpdateOAuthConfig(provider: OAuthProvider) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<OAuthConfig>) => http.put(endpointFor(provider), data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'oauth', provider] }),
  });
}
