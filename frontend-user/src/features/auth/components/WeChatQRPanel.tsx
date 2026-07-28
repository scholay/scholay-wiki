import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { QRCodeCanvas } from 'qrcode.react';
import { toast } from 'sonner';
import { http, toApiError } from '@/shared/lib/http';
import { handleAuthSuccess } from '../api/auth';
import type { AuthResponse } from '../types';

/**
 * 微信扫码登录的纯展示 + 行为面板 —— **不含 Dialog 包裹**。
 *
 * 之所以拆出来:
 *   - AuthDialog 需要"原地切换"成扫码视图(用户期望同一个 Dialog 切换,有返回键),
 *     不能再起一层 Dialog 嵌套(双 Dialog 关闭路径混乱,扫码成功只关掉里层)
 *   - settings/ConnectionsPage 的"绑定微信"流程是从设置页触发,需要独立 Dialog,
 *     由 WeChatQRDialog 这个薄壳负责
 *
 * 实现方式(业界主流):
 *   1. 拉 wxLogin.js (`https://res.wx.qq.com/connect/zh_CN/htmledition/js/wxLogin.js`)
 *   2. `new WxLogin({...})` 在指定容器 id 下注入 iframe → open.weixin.qq.com
 *   3. 给 wxLogin 传 `href` —— 公网可访问的 CSS URL,iframe 内 `<link>` 加载,
 *      用 CSS 把官方默认的标题/提示全部 display:none,只保留二维码
 *      用 `data:text/css;base64,...` 内联避免托管 CSS 文件
 *   4. `self_redirect: true` —— 扫码确认后在 iframe 内跳 redirect_uri,主页面不刷新
 *
 * redirect_uri 由后端 `GET /user/wechat/qrcode-config` 动态算(按访问域,见
 * backend/internal/wechat/handler.go::computeRedirectURI),避免 X-Frame-Options 跨子域拦截。
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
 * 注入 iframe 的 CSS:把官方 widget 里的标题/提示/图标全部 display:none。
 * 多选择器 + !important 是因为 wxLogin SDK 几次改名(.impowerBox / .qrcode_wrap / .login_inner),
 * 单挑一个 class 不稳。这里按"标题/描述/图标"语义批量隐藏。
 *
 * QR 强制 200×200 + display:block + margin:auto,即使容器更宽也不会变形拉伸。
 * 保留 `.info`(快捷登录按钮所在),让有 WeChat web 登录态的用户能直接快捷登录。
 */
const INJECT_CSS = `
body { background: transparent; margin: 0; padding: 0 }
.impowerBox, .login_box, .qrcode_wrap { padding: 0 !important; margin: 0 !important; }
.impowerBox .title, .impowerBox .status_icon,
.title, .info_panel, .status_icon, .web_qrcode_login_title {
  display: none !important;
}
.impowerBox .qrcode, .qrcode_wrap .qrcode, .qrcode img, img.qrcode,
.qrcode, canvas.qrcode {
  width: 200px !important;
  height: 200px !important;
  margin: 0 auto !important;
  border: 0 !important;
  display: block !important;
}
.impowerBox .status, .status {
  text-align: center !important;
  margin-top: 8px !important;
  font: 12px -apple-system, system-ui, sans-serif !important;
}
`;
const cssDataUrl =
  'data:text/css;base64,' +
  (typeof window !== 'undefined' ? window.btoa(INJECT_CSS) : '');

// 字段严格对齐 backend/internal/wechat/handler.go GetQRCodeConfig 返回 ——
// 整套都是 snake_case (`app_id` / `redirect_uri` / `state` / `scope`),不是 wxLogin SDK 用的 `appid`。
interface QRCodeConfig {
  app_id: string;
  redirect_uri: string;
  state: string;
  scope?: string;
}

interface WeChatQRPanelProps {
  /**
   * 'login'(默认):扫码完成后 POST /user/wechat/callback,handleAuthSuccess 落 session
   * 'bind':扫码完成后 POST /user/bind-wechat,失效 connections query
   * 两种模式共享同一个 iframe 二维码,差异只在 callback 派发。
   */
  mode?: 'login' | 'bind';
  /** 扫码 + 后端处理 + (登录) setSession 全部成功后触发 —— 父级决定要不要关弹窗 */
  onSuccess?: () => void;
}

export function WeChatQRPanel({ mode = 'login', onSuccess }: WeChatQRPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();
  const mockMode =
    typeof window !== 'undefined' && window.__SCHOLAY_MOCK_MODE__ === true;

  // 监听 WeChatCallbackPage(在 iframe 内)发来的 postMessage
  useEffect(() => {
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
        onSuccess?.();
      } catch (err) {
        toast.error(
          toApiError(err).message ||
            (mode === 'bind' ? '微信绑定失败,请稍后重试' : '微信登录失败,请稍后重试')
        );
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [mode, onSuccess, qc]);

  // 拉配置 → 加载 wxLogin.js → 实例化。cancelled 防 race(用户离开时配置已拉但脚本还没加载完)
  useEffect(() => {
    if (mockMode) return;
    let cancelled = false;
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

        // 清掉上一次的 iframe(切换 mode/重渲染时旧 iframe 不会自动消失)
        if (containerRef.current) containerRef.current.innerHTML = '';

        // wxLogin SDK 字段名 `appid`(无下划线)←→ 后端响应 `app_id`(snake_case),两套命名,千万别搞混
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
        // 配置接口失败 / 脚本拉不下来 —— 不弹 toast,容器内空白,用户自行重试入口
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [mockMode]);

  const completeMockScan = async () => {
    try {
      if (mode === 'bind') {
        await http.post('/user/bind-wechat', {
          code: 'mock-wechat-code',
          state: 'mock-wechat-state',
        });
        qc.invalidateQueries({ queryKey: ['settings', 'connections'] });
        qc.invalidateQueries({ queryKey: ['auth', 'profile'] });
        toast.success('微信已成功绑定');
      } else {
        const { data } = await http.post<{ data: AuthResponse }>(
          '/user/wechat/callback',
          { code: 'mock-wechat-code', state: 'mock-wechat-state' }
        );
        handleAuthSuccess(qc, data.data);
        toast.success('登录成功');
      }
      onSuccess?.();
    } catch (err) {
      toast.error(
        toApiError(err).message ||
          (mode === 'bind' ? '微信绑定失败,请稍后重试' : '微信登录失败,请稍后重试')
      );
    }
  };

  if (mockMode) {
    return (
      <div className="flex flex-col items-center justify-center py-2">
        <div className="rounded-lg border border-border bg-white p-3">
          <QRCodeCanvas
            value={`${window.location.origin}/wechat/callback?code=mock-wechat-code&state=mock-wechat-state`}
            size={196}
            level="M"
            marginSize={1}
          />
        </div>
        <span className="mt-3 text-xs text-faint">Mock 二维码 · 不会连接微信服务</span>
        <button
          type="button"
          onClick={() => void completeMockScan()}
          className="mt-3 inline-flex h-9 items-center justify-center rounded-md bg-brand-green px-4 text-sm font-medium text-white hover:opacity-90"
        >
          模拟扫码并授权
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-2">
      {/* iframe 容器:固定 220×240,超出 hidden 兜底裁剪 ——
          即使 CSS 注入失败,也只露二维码部分,避免侧栏/标题溢出 */}
      <div
        id={CONTAINER_ID}
        ref={containerRef}
        className="w-[220px] h-[240px] flex items-start justify-center overflow-hidden bg-background"
      />
      <span className="mt-3 text-xs text-faint">扫码后请在手机端确认授权</span>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────

/** 全局缓存 wxLogin.js 加载 promise,避免连续打开 / 关闭面板时重复插 <script> */
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
