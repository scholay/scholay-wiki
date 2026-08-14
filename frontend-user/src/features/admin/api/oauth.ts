import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { http, toApiError } from '@/shared/lib/http';

/**
 * OAuth / SSO 配置。后端按 provider 区分(各自独立 endpoint + 独立请求结构体),
 * 前端也必须按 provider 渲染各自真实字段 —— 不存在统一的 client_id/secret 表单,
 * 更没有 metadata JSON 那种"万能字段"(后端没有任何 provider 读它)。
 *
 * 单配置 provider(github/google/apple/orcid/microsoft/discourse):
 *   GET/PUT `/admin/<provider>-config`
 * 微信是多配置 CRUD(app_id/app_secret/scope/is_active):
 *   GET `/admin/wechat/config`(active) · POST `/admin/wechat/config` · PUT `/admin/wechat/config/:id`
 */

export type OAuthProvider =
  | 'github'
  | 'google'
  | 'apple'
  | 'orcid'
  | 'microsoft'
  | 'discourse'
  | 'wechat';

export type OAuthFieldType = 'text' | 'secret' | 'secret-textarea' | 'checkbox';

export interface OAuthField {
  /** 与后端 JSON key 一致 */
  key: string;
  label: string;
  type: OAuthFieldType;
  placeholder?: string;
  hint?: string;
}

export interface ProviderSpec {
  id: OAuthProvider;
  label: string;
  hint: string;
  /** 该 provider 的真实字段(不含启用开关) */
  fields: OAuthField[];
  /** 启用开关对应的 JSON key(多数 provider 是 enabled,微信是 is_active) */
  enabledKey: 'enabled' | 'is_active';
  enabledLabel: string;
}

/** 每个 provider 的字段定义 —— 与 backend/internal/config/handler_oauth.go 的请求结构体一一对应。 */
export const PROVIDER_SPECS: ProviderSpec[] = [
  {
    id: 'github',
    label: 'GitHub',
    hint: 'GitHub Developer Settings · OAuth Apps',
    enabledKey: 'enabled',
    enabledLabel: '启用 GitHub 登录',
    fields: [
      { key: 'client_id', label: 'Client ID', type: 'text' },
      { key: 'client_secret', label: 'Client Secret', type: 'secret', placeholder: '留空表示不修改' },
      { key: 'redirect_uri', label: 'Redirect URI', type: 'text', placeholder: 'https://scholay.com/github/callback' },
    ],
  },
  {
    id: 'google',
    label: 'Google',
    hint: 'Google Cloud Console · OAuth 2.0(ID-Token 模式,Secret 可选)',
    enabledKey: 'enabled',
    enabledLabel: '启用 Google 登录',
    fields: [
      { key: 'client_id', label: 'Client ID', type: 'text' },
      {
        key: 'client_secret',
        label: 'Client Secret(可选)',
        type: 'secret',
        placeholder: '留空表示不修改',
        hint: 'Google ID-Token 模式下 Secret 非必填,仅 client_id 必填',
      },
    ],
  },
  {
    id: 'apple',
    label: 'Apple',
    hint: 'Sign in with Apple · 用 Service ID + 私钥签名,没有 Client Secret',
    enabledKey: 'enabled',
    enabledLabel: '启用 Apple 登录',
    fields: [
      { key: 'service_id', label: 'Service ID', type: 'text', hint: 'Apple Developer 的 Services ID(充当 client_id)' },
      { key: 'team_id', label: 'Team ID', type: 'text', placeholder: '10 位团队 ID' },
      { key: 'key_id', label: 'Key ID', type: 'text', placeholder: '10 位密钥 ID' },
      {
        key: 'private_key',
        label: 'Private Key (.p8)',
        type: 'secret-textarea',
        placeholder: '-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----',
        hint: '从 Apple Developer 下载的 .p8 私钥全文,留空表示不修改',
      },
      { key: 'redirect_uri', label: 'Redirect URI', type: 'text', placeholder: 'https://scholay.com/apple/callback' },
    ],
  },
  {
    id: 'orcid',
    label: 'ORCID',
    hint: '科研身份认证 · OAuth 2.0',
    enabledKey: 'enabled',
    enabledLabel: '启用 ORCID 登录',
    fields: [
      { key: 'client_id', label: 'Client ID', type: 'text' },
      { key: 'client_secret', label: 'Client Secret', type: 'secret', placeholder: '留空表示不修改' },
      { key: 'redirect_uri', label: 'Redirect URI', type: 'text', placeholder: 'https://scholay.com/orcid/callback' },
      { key: 'use_sandbox', label: '使用 Sandbox 测试环境', type: 'checkbox', hint: '勾选则走 sandbox.orcid.org,正式环境请取消' },
    ],
  },
  {
    id: 'microsoft',
    label: 'Microsoft',
    hint: 'Azure AD / Entra ID · 应用注册',
    enabledKey: 'enabled',
    enabledLabel: '启用 Microsoft 登录',
    fields: [
      { key: 'client_id', label: 'Client ID (Application ID)', type: 'text' },
      { key: 'client_secret', label: 'Client Secret', type: 'secret', placeholder: '留空表示不修改' },
      { key: 'redirect_uri', label: 'Redirect URI', type: 'text', placeholder: 'https://scholay.com/microsoft/callback' },
      { key: 'tenant', label: 'Tenant', type: 'text', placeholder: 'common', hint: '租户 ID;多租户应用填 common' },
    ],
  },
  {
    id: 'discourse',
    // 内部 provider key 是 discourse(部署在 Discourse 上),用户感知是「恩特学术社区」
    label: '恩特学术社区',
    hint: 'enterscholar.com · DiscourseConnect (SSO Provider) 协议,用 SSO Secret 而非 Client Secret',
    enabledKey: 'enabled',
    enabledLabel: '启用 恩特学术社区 登录',
    fields: [
      { key: 'site_url', label: 'Site URL', type: 'text', placeholder: 'https://enterscholar.com' },
      { key: 'sso_secret', label: 'SSO Secret', type: 'secret', placeholder: '留空表示不修改', hint: 'Discourse 后台的 DiscourseConnect Provider Secret' },
      { key: 'redirect_uri', label: 'Redirect URI', type: 'text', placeholder: 'https://scholay.com/discourse/callback' },
    ],
  },
  {
    id: 'wechat',
    label: '微信',
    hint: '微信开放平台 · 网页授权登录',
    enabledKey: 'is_active',
    enabledLabel: '设为启用的微信配置',
    fields: [
      { key: 'app_id', label: 'App ID', type: 'text' },
      { key: 'app_secret', label: 'App Secret', type: 'secret', placeholder: '留空表示不修改' },
      { key: 'redirect_uri', label: 'Redirect URI', type: 'text', placeholder: 'https://scholay.com/wechat/callback' },
      { key: 'scope', label: 'Scope', type: 'text', placeholder: 'snsapi_login' },
    ],
  },
];

export function getProviderSpec(id: OAuthProvider): ProviderSpec {
  const spec = PROVIDER_SPECS.find((p) => p.id === id);
  if (!spec) throw new Error(`unknown oauth provider: ${id}`);
  return spec;
}

/** GET 回来的配置是 provider-specific 的松散记录;含 id(微信用于区分更新/新建)、各字段值、updated_at。 */
export type OAuthConfigRecord = Record<string, unknown> & {
  id?: number;
  updated_at?: string;
};

function getEndpoint(provider: OAuthProvider): string {
  return provider === 'wechat' ? '/admin/wechat/config' : `/admin/${provider}-config`;
}

export function useOAuthConfig(
  provider: OAuthProvider,
  { showSensitive }: { showSensitive: boolean }
) {
  return useQuery({
    queryKey: ['admin', 'oauth', provider, { showSensitive }],
    // showSensitive 进了 queryKey —— 点密钥框的「眼睛」就是换 key 重取。
    // 没有 keepPreviousData 的话新 key 无缓存 → isLoading 瞬时为 true → 上层守卫
    // (ConfigPageGuard / `if (isLoading) return <Loading/>`)会把整张表单卸载重建,
    // 管理员填了一半还没保存的内容会无声消失。保住旧值,表单始终挂载。
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<OAuthConfigRecord> => {
      try {
        const res = await http.get<{ data: OAuthConfigRecord }>(getEndpoint(provider), {
          params: showSensitive ? { show_sensitive: true } : undefined,
        });
        return res.data.data ?? {};
      } catch (e) {
        // 微信尚无 active 配置时后端回 HTTP 404 / 业务码 4404
        // (backend/internal/wechat/handler.go:114)—— 视为"还没配",给空表单(创建模式)。
        //
        // 🔴 只吞 404。原来是 `if (provider === 'wechat') return {}`,把 500 / 断网
        // 也一并当成"还没配":于是 GET 挂掉时渲染出一张正常的空表单,保存即把线上的
        // app_id / app_secret / redirect_uri 全写空,还顺手把 is_active 写成 false。
        const err = toApiError(e);
        if (provider === 'wechat' && (err.status === 404 || err.code === 4404)) return {};
        throw e;
      }
    },
  });
}

export function useUpdateOAuthConfig(provider: OAuthProvider) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ payload, id }: { payload: Record<string, unknown>; id?: number }) => {
      if (provider === 'wechat') {
        // 多配置 CRUD:有 id 走 PUT /:id,没有则 POST 新建。
        return id
          ? http.put(`/admin/wechat/config/${id}`, payload)
          : http.post('/admin/wechat/config', payload);
      }
      return http.put(getEndpoint(provider), payload);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'oauth', provider] }),
  });
}
