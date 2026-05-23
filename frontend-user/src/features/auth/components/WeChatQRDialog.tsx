import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/shared/ui';
import { http, toApiError } from '@/shared/lib/http';
import { handleAuthSuccess } from '../api/auth';
import type { AuthResponse } from '../types';

/**
 * 微信扫码登录 —— 弹窗内嵌官方二维码 iframe,不跳走整页。
 *
 * 实现方式(业界主流):
 *   1. 拉 wxLogin.js (`https://res.wx.qq.com/connect/zh_CN/htmledition/js/wxLogin.js`)
 *   2. `new WxLogin({...})` 会在指定容器 id 下注入一个 iframe 指向 open.weixin.qq.com
 *   3. 给 wxLogin 传 `href` —— 一个公网可访问的 CSS URL,微信 iframe 内会 `<link>` 加载它,
 *      用 CSS 把官方默认的「微信登录 / 请使用微信扫一扫 / 底部提示」全部 display:none,
 *      只保留二维码。我们用 `data:text/css;base64,...` 内联避免托管 CSS 文件。
 *   4. `self_redirect: true` —— 扫码确认后在 iframe 内跳 redirect_uri,主页面不刷新
 *
 * redirect_uri 必须是后端配的回调地址(白名单到 open.weixin.qq.com 控制台),
 * 这里通过后端 `GET /user/wechat/qrcode-config` 获取(返回 appid + redirect_uri + state)。
 */

/** wxLogin.js 全局对象类型 —— 微信官方未发 .d.ts,自己声明 */
declare global {
  interface Window {
    WxLogin?: new (opts: {
      self_redirect?: boolean;
      id: string;
      appid: string;
      scope: string;
      redirect_uri: string;
      state: string;
      style?: 'black' | 'white';
      href?: string;
    }) => void;
  }
}

const WX_LOGIN_SCRIPT = 'https://res.wx.qq.com/connect/zh_CN/htmledition/js/wxLogin.js';
const CONTAINER_ID = 'scholay-wechat-qr-container';

/**
 * 自定义 CSS:把微信 iframe 内除了二维码以外的所有干扰元素隐藏掉。
 * `.impowerBox` 是微信官方 widget 的容器 class —— 选择器固定 5 年没变。
 *
 * 用 data: URI 内联,免去维护一份公网托管的 .css 文件 + 缓存麻烦。
 */
const INJECT_CSS = `
.impowerBox .qrcode { width: 200px; margin-top: 0; border: 0 }
.impowerBox .title { display: none }
.impowerBox .info { display: none }
.impowerBox .status_icon { display: none }
.impowerBox .status { text-align: center; margin-top: 8px; font-family: -apple-system, system-ui, sans-serif }
.wrp_code { padding: 0 }
.impowerBox { padding: 0 }
body { background: transparent }
`;
const cssDataUrl =
  'data:text/css;base64,' +
  (typeof window !== 'undefined' ? window.btoa(INJECT_CSS) : '');

// 字段严格对齐 backend/internal/wechat/handler.go GetQRCodeConfig 返回 ——
// 整套都是 snake_case (`app_id` / `redirect_uri` / `state` / `scope`),
// 不是 wxLogin SDK 用的 `appid`。早期把 `app_id` 错写成 `appid` → cfg.app_id 永远 undefined
// → if (!cfg.app_id) 提前 return → WxLogin 不实例化 → 弹窗里二维码空白。
interface QRCodeConfig {
  app_id: string;
  redirect_uri: string;
  state: string;
  scope?: string;
}

/**
 * 弹窗模式:
 *   - 'login'(默认):扫码完成后调 POST /user/wechat/callback,setSession,关弹窗
 *   - 'bind' :扫码完成后调 POST /user/bind-wechat,失效 connections query,关弹窗
 *
 * 两种模式共享同一个 iframe 二维码,差异只在 callback 派发。WeChatCallbackPage 收到
 * 扫码后会把 code+state 通过 postMessage 抛给本组件(父窗口),本组件按 mode 分发。
 */
export function WeChatQRDialog({
  open,
  onOpenChange,
  mode = 'login',
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  mode?: 'login' | 'bind';
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();

  // 监听 WeChatCallbackPage(在 iframe 内)发来的 postMessage
  useEffect(() => {
    if (!open) return;
    const handler = async (e: MessageEvent) => {
      // 严格校验来源(同源) + payload 形状,防外部页面伪造消息
      if (e.origin !== window.location.origin) return;
      const data = e.data as { type?: string; code?: string; state?: string };
      if (data?.type !== 'scholay-wechat-callback' || !data.code) return;

      try {
        if (mode === 'bind') {
          await http.post('/user/bind-wechat', { code: data.code, state: data.state });
          qc.invalidateQueries({ queryKey: ['settings', 'connections'] });
          qc.invalidateQueries({ queryKey: ['auth', 'profile'] });
          toast.success('微信已成功绑定');
        } else {
          const { data: resp } = await http.post<{ data: AuthResponse }>(
            '/user/wechat/callback',
            { code: data.code, state: data.state }
          );
          handleAuthSuccess(qc, resp.data);
          toast.success('登录成功');
        }
        onOpenChange(false);
      } catch (err) {
        toast.error(toApiError(err).message || (mode === 'bind' ? '微信绑定失败,请稍后重试' : '微信登录失败,请稍后重试'));
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [open, mode, onOpenChange, qc]);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;

    /**
     * 单次「拉配置 → 加载 wxLogin.js → 实例化」的全过程。
     * cancelled 标志位防止用户关弹窗时 race(配置已拉但脚本还没加载完)。
     */
    const run = async () => {
      try {
        const { data } = await http.get<{ data: QRCodeConfig }>(
          '/user/wechat/qrcode-config'
        );
        if (cancelled) return;
        const cfg = data.data;
        if (!cfg.app_id) return;

        await loadWxLoginScript();
        if (cancelled || !window.WxLogin) return;

        // 清掉上一次的 iframe(切换弹窗时旧 iframe 不会自动消失)
        if (containerRef.current) {
          containerRef.current.innerHTML = '';
        }

        // wxLogin SDK 字段名 `appid` (无下划线) ←→ 后端响应 `app_id` (snake_case),
        // 两套命名,千万不能搞混。
        new window.WxLogin({
          self_redirect: true,
          id: CONTAINER_ID,
          appid: cfg.app_id,
          scope: cfg.scope || 'snsapi_login',
          redirect_uri: encodeURIComponent(cfg.redirect_uri),
          state: cfg.state,
          style: 'white',
          href: cssDataUrl,
        });
      } catch {
        // 配置接口失败 / 脚本拉不下来 —— 不弹 toast,弹窗内有「重试」可手动重开
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm p-0 gap-0 border-border">
        <div className="flex flex-col items-center gap-1 pt-6 pb-3 px-6 border-b border-border-soft">
          <DialogTitle className="text-base font-semibold">使用微信扫一扫</DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            打开微信,扫描下方二维码完成登录
          </DialogDescription>
        </div>

        <div className="flex flex-col items-center justify-center py-6">
          {/* iframe 容器:固定 220×220,超出 hidden 兜底裁剪
              —— 即使 CSS 注入失败,也只露二维码部分,避免侧栏 / 标题溢出 */}
          <div
            id={CONTAINER_ID}
            ref={containerRef}
            className="w-[220px] h-[220px] flex items-center justify-center overflow-hidden bg-background"
          />
          <span className="mt-3 text-xs text-faint">扫码后请在手机端确认授权</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ──────────────────────────────────────────────────────────────────────────────

/**
 * 全局缓存 wxLogin.js 加载 promise,避免连续打开 / 关闭弹窗时重复插 <script>。
 */
let wxLoginPromise: Promise<void> | null = null;

function loadWxLoginScript(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.WxLogin) return Promise.resolve();
  if (wxLoginPromise) return wxLoginPromise;

  wxLoginPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = WX_LOGIN_SCRIPT;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      wxLoginPromise = null; // 失败后允许下次重试
      reject(new Error('failed to load wxLogin.js'));
    };
    document.head.appendChild(script);
  });
  return wxLoginPromise;
}
