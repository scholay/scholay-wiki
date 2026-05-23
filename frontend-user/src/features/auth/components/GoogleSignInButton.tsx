import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { http, toApiError } from '@/shared/lib/http';
import type { AuthResponse } from '../types';
import { usePublicConfig } from '../api/public-config';
import { handleAuthSuccess } from '../api/auth';

/**
 * Google Sign-In 按钮(GIS / Google Identity Services 一键登录)。
 *
 * 与其他 OAuth provider 走「整页 redirect → 后端 callback → 前端二次 POST」
 * 不同 —— Google 推荐用 GIS:前端拉 https://accounts.google.com/gsi/client,
 * 用 client_id 渲染官方按钮 / 一键登录提示;用户授权后 GIS 直接把 id_token 给我们,
 * 后端 verify id_token 走 /user/google/id-token-login 完成登录。
 *
 * 视觉上嵌进 OAuthRow:GIS 的 `type:'icon'` 是 40×40 圆形按钮,与我们的
 * 36×36 边框按钮接近,不破坏 OAuth 按钮组的视觉节奏。
 *
 * Google 官方建议同一页面只 initialize 一次,所以这里用全局 promise 缓存。
 * 同时 prompt() 自动尝试 One-Tap 提示,用户点击按钮等价于 manual sign-in。
 */

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (cfg: {
            client_id: string;
            callback: (resp: { credential: string }) => void;
            auto_select?: boolean;
            cancel_on_tap_outside?: boolean;
            use_fedcm_for_prompt?: boolean;
          }) => void;
          renderButton: (
            parent: HTMLElement,
            opts: { type?: 'icon' | 'standard'; size?: 'small' | 'medium' | 'large'; shape?: 'rectangular' | 'pill' | 'circle' | 'square'; theme?: 'outline' | 'filled_blue' | 'filled_black' }
          ) => void;
          prompt: () => void;
          disableAutoSelect: () => void;
        };
      };
    };
  }
}

const GIS_SCRIPT = 'https://accounts.google.com/gsi/client';

let gisPromise: Promise<void> | null = null;
function loadGISScript(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.google?.accounts?.id) return Promise.resolve();
  if (gisPromise) return gisPromise;
  gisPromise = new Promise<void>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = GIS_SCRIPT;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => {
      gisPromise = null; // 允许下次重试
      reject(new Error('failed to load Google Identity Services'));
    };
    document.head.appendChild(s);
  });
  return gisPromise;
}

export function GoogleSignInButton() {
  const { data: config } = usePublicConfig();
  const containerRef = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();
  const clientId = config?.google_client_id;

  useEffect(() => {
    if (!clientId || !containerRef.current) return;
    let cancelled = false;

    (async () => {
      try {
        await loadGISScript();
        if (cancelled || !window.google?.accounts?.id || !containerRef.current) return;

        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: async (resp) => {
            try {
              const { data } = await http.post<{ data: AuthResponse }>(
                '/user/google/id-token-login',
                { id_token: resp.credential }
              );
              handleAuthSuccess(qc, data.data);
              toast.success('登录成功');
            } catch (err) {
              toast.error(toApiError(err).message || 'Google 登录失败,请稍后重试');
            }
          },
          // 不自动选号 + 点外面不取消 —— OAuthRow 是触发动作不是页面级提示
          auto_select: false,
          cancel_on_tap_outside: true,
        });

        window.google.accounts.id.renderButton(containerRef.current, {
          type: 'icon',
          size: 'medium',
          shape: 'square',
          theme: 'outline',
        });
      } catch {
        // GIS 加载失败 —— 按钮区域空着即可,不弹 toast 骚扰用户。
        // 用户可重试或换其他 OAuth provider。
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [clientId, qc]);

  if (!clientId) return null;

  return (
    <div
      ref={containerRef}
      title="使用 Google 登录"
      // GIS 注入的按钮尺寸固定 ~36px,与 OAuthRow 其他按钮齐平
      className="inline-flex h-9 items-center justify-center rounded-md overflow-hidden"
    />
  );
}
