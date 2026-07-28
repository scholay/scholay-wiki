import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { http, toApiError } from '@/shared/lib/http';
import { Button } from '@/shared/ui';
import { useAuthStore } from '@/stores/auth.store';
import type { AuthResponse } from '../types';
import { OAuthMergeConfirmDialog } from '../components/OAuthMergeConfirmDialog';
import { handleAuthSuccess } from '../api/auth';
import {
  OAUTH_MODE_KEY,
  OAUTH_BIND_PROVIDER_KEY,
  OAUTH_BIND_RETURN_KEY,
} from '@/shared/lib/oauth-bind';

/**
 * 通用 OAuth callback 中转页 —— 接收第三方平台 redirect 回来的 code + state,
 * 调后端对应 callback 拿登录态,然后落地到正常页面。
 *
 * 路由约定:
 *   /github/callback   → provider='github'
 *   /google/callback   → provider='google'
 *   /apple/callback    → provider='apple'   (form_post,但 query 仍带 code)
 *   /orcid/callback    → provider='orcid'
 *   /microsoft/callback→ provider='microsoft'
 *   /discourse/callback→ provider='discourse'
 *
 * 三种结果:
 *   1. 正常登录:setSession + toast + navigate('/')
 *   2. email 冲突 → 后端返 `requires_merge=true, merge_token=...` →
 *      本页面把 merge_token 存到 state,弹 OAuthMergeConfirmDialog 二选一
 *   3. 出错 → 显示错误 + 「返回首页」按钮
 *
 * Apple form_post 流程:Apple 把回调以 POST application/x-www-form-urlencoded
 * 发到 redirect_uri,但 redirect_uri 在我们这是后端,后端处理完 302 重定向回
 * 前端 /apple/callback?token=jwt 或 ?merge_token=xxx。所以本页面对 Apple 也只读 query。
 */

type Phase = 'loading' | 'merge_required' | 'success' | 'error';

export function OAuthCallbackPage() {
  // 路由约定 /<provider>/callback,通过 useParams 抓出 provider 名(也支持显式 :provider)
  const { provider: providerParam } = useParams<{ provider?: string }>();
  const provider = providerParam ?? guessProviderFromPath();
  const [params] = useSearchParams();
  const navigate = useNavigate();

  const [phase, setPhase] = useState<Phase>('loading');
  const [mergeToken, setMergeToken] = useState<string | null>(null);
  const [errMsg, setErrMsg] = useState('');
  const qc = useQueryClient();

  // 启动时一次性读 bind 上下文(读完立即清掉,避免后续 race / 跨标签污染)。
  // useState 初始化函数保证只在 mount 时执行一次。
  const [bindCtx] = useState(() => {
    if (typeof window === 'undefined') return null;
    const mode = sessionStorage.getItem(OAUTH_MODE_KEY);
    if (mode !== 'bind') return null;
    const bindProvider = sessionStorage.getItem(OAUTH_BIND_PROVIDER_KEY);
    const returnTo = sessionStorage.getItem(OAUTH_BIND_RETURN_KEY) ?? '/';
    sessionStorage.removeItem(OAUTH_MODE_KEY);
    sessionStorage.removeItem(OAUTH_BIND_PROVIDER_KEY);
    sessionStorage.removeItem(OAUTH_BIND_RETURN_KEY);
    return { provider: bindProvider, returnTo };
  });

  useEffect(() => {
    // 0. Apple 绑定回程:后端 handleAppleBindCallback 完成绑定后会 302 重定向到
    //    /apple/callback?bind=success(或 ?bind=error&msg=...) —— 不带 code/token。
    const bindResult = params.get('bind');
    if (bindResult) {
      if (bindResult === 'success') {
        qc.invalidateQueries({ queryKey: ['settings', 'connections'] });
        qc.invalidateQueries({ queryKey: ['auth', 'profile'] });
        setPhase('success');
        toast.success(`${provider} 已绑定`);
        setTimeout(() => navigate('/settings/connections', { replace: true }), 400);
      } else {
        setPhase('error');
        setErrMsg(params.get('msg') || `${provider} 绑定失败`);
      }
      return;
    }

    // 1. Apple 风格:后端已签好 token,直接落 session
    const directToken = params.get('token');
    if (directToken) {
      const userJson = params.get('user');
      try {
        const user = userJson
          ? JSON.parse(userJson)
          : { id: 0, email: '', role: 'user' };
        handleAuthSuccess(qc, { token: directToken, user } as AuthResponse);
        setPhase('success');
        toast.success('登录成功');
        setTimeout(() => navigate('/', { replace: true }), 400);
      } catch {
        setPhase('error');
        setErrMsg('登录响应解析失败');
      }
      return;
    }

    // 2. Apple 风格:后端已发现冲突,直接带 merge_token 重定向回来
    const directMergeToken = params.get('merge_token');
    if (directMergeToken) {
      setMergeToken(directMergeToken);
      setPhase('merge_required');
      return;
    }

    // 3a. Discourse SSO 走 DiscourseConnect 协议 —— 不是 OAuth code-grant,
    //     回调参数是 sso(base64 payload)+ sig(HMAC-SHA256),不是 code+state。
    //     登录:GET /user/discourse/callback?sso=&sig=
    //     绑定:POST /user/bind-discourse {sso, sig}
    if (provider === 'discourse') {
      const sso = params.get('sso');
      const sig = params.get('sig');
      if (!sso || !sig) {
        setPhase('error');
        setErrMsg('回调参数不完整');
        return;
      }
      (async () => {
        try {
          const isAuthed = !!useAuthStore.getState().token;
          if (bindCtx && bindCtx.provider === 'discourse' && isAuthed) {
            try {
              await http.post('/user/bind-discourse', { sso, sig });
              qc.invalidateQueries({ queryKey: ['settings', 'connections'] });
              qc.invalidateQueries({ queryKey: ['auth', 'profile'] });
              setPhase('success');
              toast.success('恩特学术社区 已绑定');
              setTimeout(() => navigate(bindCtx.returnTo, { replace: true }), 400);
            } catch (e) {
              setPhase('error');
              setErrMsg(toApiError(e).message || '恩特学术社区 绑定失败');
            }
            return;
          }
          const qs = new URLSearchParams({ sso, sig }).toString();
          const { data } = await http.get<{
            code: number;
            message: string;
            data: AuthResponse | {
              requires_merge: true;
              merge_token: string;
              provider: string;
              target_email: string;
            };
          }>(`/user/discourse/callback?${qs}`);
          const payload = data.data;
          if ('requires_merge' in payload && payload.requires_merge) {
            setMergeToken(payload.merge_token);
            setPhase('merge_required');
            return;
          }
          handleAuthSuccess(qc, payload as AuthResponse);
          setPhase('success');
          toast.success('登录成功');
          setTimeout(() => navigate('/', { replace: true }), 400);
        } catch (e) {
          setPhase('error');
          setErrMsg(toApiError(e).message || '登录失败');
        }
      })();
      return;
    }

    // 3. 标准 GET callback:code + state 转发给后端
    const code = params.get('code');
    const state = params.get('state') ?? '';
    const err = params.get('error');
    if (err) {
      setPhase('error');
      setErrMsg(params.get('error_description') || err);
      return;
    }
    if (!code || !provider) {
      setPhase('error');
      setErrMsg('回调参数不完整');
      return;
    }

    (async () => {
      try {
        // 分支:bind 模式 —— 标签页之前从 /settings/connections 点过「绑定 GitHub」
        // 调 bind-* 受保护端点(JWT 验当前用户)绑到当前账号,不走 login callback
        // 兜底:用户在 OAuth 跳转中途登出 / token 过期 → 降级走登录分支,
        // 避免拿到 401 报错弹窗,体验更顺。
        const isAuthed = !!useAuthStore.getState().token;
        if (bindCtx && bindCtx.provider === provider && isAuthed) {
          try {
            await http.post(`/user/bind-${provider}`, { code, state });
            // bind 成功 → 失效 connections + auth profile,跳回设置页
            qc.invalidateQueries({ queryKey: ['settings', 'connections'] });
            qc.invalidateQueries({ queryKey: ['auth', 'profile'] });
            setPhase('success');
            toast.success(`${provider} 已绑定`);
            setTimeout(() => navigate(bindCtx.returnTo, { replace: true }), 400);
          } catch (e) {
            setPhase('error');
            setErrMsg(toApiError(e).message || `${provider} 绑定失败`);
          }
          return;
        }

        // 默认分支:登录 / 注册 / 合并确认
        const qs = new URLSearchParams({ code, state }).toString();
        type MergeRequired = {
          requires_merge: true;
          merge_token: string;
          provider: string;
          target_email: string;
        };
        const { data } = await http.get<{
          code: number;
          message: string;
          data: AuthResponse | MergeRequired;
        }>(`/user/${provider}/callback?${qs}`);
        const payload = data.data;
        // discriminated union 守门:有 requires_merge 走合并分支,否则走登录
        if ('requires_merge' in payload && payload.requires_merge) {
          setMergeToken(payload.merge_token);
          setPhase('merge_required');
          return;
        }
        // 正常登录
        handleAuthSuccess(qc, payload as AuthResponse);
        setPhase('success');
        toast.success('登录成功');
        setTimeout(() => navigate('/', { replace: true }), 400);
      } catch (e) {
        setPhase('error');
        setErrMsg(toApiError(e).message || '登录失败');
      }
    })();
  }, [provider, params, navigate, bindCtx, qc]);

  return (
    // min-h-dvh 不是 min-h-screen —— 后者是裸 100vh,iOS 地址栏会盖住居中内容(项目铁律:视口高度用 dvh)。
    <div className="flex min-h-dvh items-center justify-center bg-background px-6">
      <div className="flex flex-col items-center gap-4 text-center max-w-md">
        {phase === 'loading' && (
          <>
            <Loader2 className="size-8 animate-spin text-muted-foreground" />
            <p className="text-12 text-muted-foreground">正在完成 {provider} 登录…</p>
          </>
        )}
        {phase === 'success' && (
          <>
            <CheckCircle2 className="size-8 text-brand-green" />
            <p className="text-12 text-foreground">登录成功,正在跳转…</p>
          </>
        )}
        {phase === 'error' && (
          <>
            <AlertCircle className="size-8 text-brand-red" />
            <p className="text-14 font-medium text-foreground">登录失败</p>
            <p className="text-12 text-muted-foreground">{errMsg}</p>
            <Button
              type="button"
              onClick={() => navigate('/', { replace: true })}
              className="mt-2 h-9 px-4"
            >
              返回首页
            </Button>
          </>
        )}
        {phase === 'merge_required' && mergeToken && (
          <OAuthMergeConfirmDialog
            token={mergeToken}
            onDone={() => {
              toast.success('登录成功');
              navigate('/', { replace: true });
            }}
          />
        )}
      </div>
    </div>
  );
}

/** 兜底:从 location.pathname 推断 provider —— 路由用 /:provider/callback */
function guessProviderFromPath(): string {
  const m = window.location.pathname.match(/^\/([\w-]+)\/callback/);
  return m?.[1] ?? '';
}

export default OAuthCallbackPage;
