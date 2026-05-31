import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { http, toApiError } from '@/shared/lib/http';
// TODO: 30s 没对应 STALE_* preset, 保留硬编码;若后续需要可在 query-config.ts 新增 STALE_HOT。

/**
 * 账号设置「已连接账号」相关 API。
 *
 * 后端见 `internal/user/handler_connections.go`。
 * queryKey 走 `['settings','connections']` 三段式。
 *
 * 业务关键 invariant:
 *   - login_methods_count 来自后端 Service.CountLoginMethods,与解绑保护算法一致
 *   - 解绑 mutation 成功后 invalidate connections 让 UI 立即刷新计数
 *   - 解绑保护的"最后一个不可解"逻辑在后端,前端只是把 count=1 时按钮灰掉做体验提示
 */

export interface ConnectionItem {
  provider: string;
  bound: boolean;
  display_name?: string;
  avatar_url?: string;
  provider_user_id?: string;
  created_at?: string;
}

export interface ConnectionsResp {
  connections: ConnectionItem[];
  login_methods_count: number;
}

export function useUserConnections() {
  return useQuery({
    queryKey: ['settings', 'connections'],
    queryFn: async () => {
      const { data } = await http.get<{ data: ConnectionsResp }>('/user/connections');
      return data.data;
    },
    staleTime: 30 * 1000,
  });
}

/**
 * 解绑 mutation:对 8 种 provider 通用,根据 provider 名拼接 endpoint。
 * email / phone 后端需要 verification code,这里 input 接受可选 code。
 */
export function useUnbindProvider() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { provider: string; code?: string }) => {
      try {
        await http.post(`/user/unbind-${input.provider}`, input.code ? { code: input.code } : {});
      } catch (err) {
        throw toApiError(err);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings', 'connections'] });
      qc.invalidateQueries({ queryKey: ['auth', 'profile'] });
    },
  });
}

// OAuth 绑定的 sessionStorage 键名已迁移到 shared/lib/oauth-bind —— 它们被
// auth (callback 页读)和 settings (这里 mutation 写)双向共用,放 shared 才合规。
// 这里 re-export 保持本文件历史 import 不破坏。
export {
  OAUTH_MODE_KEY,
  OAUTH_BIND_PROVIDER_KEY,
  OAUTH_BIND_RETURN_KEY,
} from '@/shared/lib/oauth-bind';
import {
  OAUTH_MODE_KEY,
  OAUTH_BIND_PROVIDER_KEY,
  OAUTH_BIND_RETURN_KEY,
} from '@/shared/lib/oauth-bind';

/**
 * 启动「绑定第三方账号」流程 —— 跟 OAuth 登录复用同一份 redirect URL,
 * 但跳走前在 sessionStorage 标记「这是绑定不是登录」,callback 页根据标记
 * 分发到 `POST /user/bind-<provider>` 而非 `/user/<provider>/callback`。
 */
export function useStartBindingProvider() {
  return useMutation({
    mutationFn: async (provider: string) => {
      try {
        // wechat 由 WeChatQRDialog mode='bind' 接管,不走本 mutation
        if (provider === 'wechat') {
          window.location.href = '#wechat-qr';
          return;
        }
        // Apple 用专门的 bind-url(protected, 颁发 bind_nonce + state="bind:<nonce>") ——
        // 因为 Apple form_post 把 POST 发到后端,我们要在 backend callback 里就地完成
        // 绑定(无法依赖前端 sessionStorage),所以由 server 端 nonce 中继。
        if (provider === 'apple') {
          const { data } = await http.get<{ data: { url?: string } }>(
            `/user/apple/bind-url`
          );
          const url = data.data?.url;
          if (!url) throw new Error('Apple 登录暂未启用');
          window.location.href = url;
          return;
        }
        // 其他 5 个 provider(GitHub/Google/Microsoft/ORCID/Discourse)走 GET callback,
        // 前端 OAuthCallbackPage 读 sessionStorage 标记后改调 POST /user/bind-<provider>
        const { data } = await http.get<{ data: { url?: string } }>(
          `/user/${provider}/login-url`
        );
        const url = data.data?.url;
        if (!url) throw new Error(`${provider} 登录暂未启用`);
        sessionStorage.setItem(OAUTH_MODE_KEY, 'bind');
        sessionStorage.setItem(OAUTH_BIND_PROVIDER_KEY, provider);
        sessionStorage.setItem(OAUTH_BIND_RETURN_KEY, '/settings/connections');
        window.location.href = url;
      } catch (err) {
        throw toApiError(err);
      }
    },
  });
}
