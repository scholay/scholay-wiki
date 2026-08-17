import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { http, toApiError } from '@/shared/lib/http';
import {
  consumeInvitationCode,
  peekInvitationCode,
} from '@/shared/lib/auth-invitation';
import { handleAuthSuccess } from '../api/auth';
import type { AuthResponse } from '../types';

/**
 * 微信扫码 callback 中转页 —— wxLogin self_redirect=true 时,iframe 内会从
 * WeChat 的二维码页跳到我们配置的 redirect_uri(=本页)。
 *
 * 两种运行场景:
 *   1. 在 iframe 内(WeChatQRDialog 打开的二维码弹窗):postMessage 把 code+state
 *      抛给父窗口(WeChatQRDialog 监听后按 mode 走 login 或 bind 分支),本页只
 *      显示「扫码成功」过渡态
 *   2. 独立访问(用户直接打开 URL,极少见):本页自行 POST 给后端 login callback
 *      完成登录,跳首页
 *
 * 这样一个回调地址同时承载「登录」和「绑定」两种场景,不需要后端区分,也不需要
 * bind_nonce —— bind 的鉴权在父窗口拿到 code+state 后调 protected `bind-wechat`
 * 时由 JWT 验证。
 */

export function WeChatCallbackPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [phase, setPhase] = useState<'loading' | 'success' | 'error'>('loading');
  const [errMsg, setErrMsg] = useState('');

  useEffect(() => {
    const code = params.get('code');
    const state = params.get('state') ?? '';
    if (!code) {
      setPhase('error');
      setErrMsg('未收到微信授权码,请重试扫码');
      return;
    }

    const inIframe = typeof window !== 'undefined' && window.parent !== window;
    if (inIframe) {
      // 场景 1:在 WeChatQRDialog 的 iframe 内 —— 不动手处理,把数据抛给父窗口
      window.parent.postMessage(
        { type: 'scholay-wechat-callback', code, state },
        window.location.origin
      );
      setPhase('success');
      return;
    }

    // 场景 2:独立打开本页(冷启动 / 复制链接)—— 按登录处理
    (async () => {
      try {
        const invitation_code = peekInvitationCode();
        const { data } = await http.post<{ data: AuthResponse }>(
          '/user/wechat/callback',
          { code, state, invitation_code }
        );
        consumeInvitationCode();
        handleAuthSuccess(qc, data.data, {
          usedInvitationCode: !!invitation_code,
        });
        setPhase('success');
        toast.success('登录成功');
        setTimeout(() => navigate('/', { replace: true }), 400);
      } catch (e) {
        setPhase('error');
        setErrMsg(toApiError(e).message || '微信登录失败');
      }
    })();
  }, [params, navigate, qc]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="flex flex-col items-center gap-4 text-center max-w-md">
        {phase === 'loading' && (
          <>
            <Loader2 className="size-8 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">正在完成微信扫码…</p>
          </>
        )}
        {phase === 'success' && (
          <>
            <CheckCircle2 className="size-8 text-brand-green" />
            <p className="text-sm text-foreground">扫码成功</p>
          </>
        )}
        {phase === 'error' && (
          <>
            <AlertCircle className="size-8 text-brand-red" />
            <p className="text-sm text-foreground">{errMsg}</p>
          </>
        )}
      </div>
    </div>
  );
}

export default WeChatCallbackPage;
