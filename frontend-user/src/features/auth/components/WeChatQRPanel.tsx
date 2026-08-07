import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/shared/ui';
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
 *
 * ⚠️ **扫完码到登录完成之间,这个 iframe 里跑的是我们自己的 SPA** —— 微信带着 code 在 iframe 内
 * 跳到 /wechat/callback,那一整个冷启动(index.html + 分包 + lazy 路由)都发生在这个 220×240 的
 * 小框里,用户会眼睁睁看着弹窗里闪过我们自己的页面。两道处置,缺一不可:
 *   · 路由层:`/wechat/callback` 已移出 AppShell(app/router.tsx),否则闪的是整套 TopNav/首页 chrome;
 *   · 本组件:一旦探到 iframe 已跳回同源(见 watchCallbackNavigation),立刻用状态浮层**盖住**它。
 * 盖住而不是卸载 —— code 是 iframe 里那个页面 postMessage 上来的,提前卸载 = 永远登录不了。
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
/** 与后端 wechat/handler.go 的 wechatCallbackPath 对齐 —— 用来认出「iframe 已跳回我们这边」。 */
const CALLBACK_PATH = '/wechat/callback';

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

/**
 * qr      —— 正常展示二维码,等用户扫
 * pending —— 已扫码(iframe 开始跳回我们这边 / 已收到 code),正在换 session
 * done    —— 登录/绑定成功(父级通常同帧关掉弹窗,这一态只是兜住关闭前的那一帧)
 * error   —— 换 session 失败,给一条人话 + 重新扫码
 */
type Phase = 'qr' | 'pending' | 'done' | 'error';

export function WeChatQRPanel({ mode = 'login', onSuccess }: WeChatQRPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();
  const [phase, setPhase] = useState<Phase>('qr');
  const [errMsg, setErrMsg] = useState('');
  // 重新扫码:自增即让下面的 init effect 重跑(重新拉 config → 新 state → 新二维码)
  const [attempt, setAttempt] = useState(0);
  // 微信授权 code **单次有效**(换过 access_token 再用必报 40163 code been used)。
  // postMessage 可能被送达两次(StrictMode 双调 / iframe 重渲染 / 微信侧重复回调),
  // 第二次必然失败并把已经成功的登录覆盖成一条错误。用 ref 不用 state:跨消息稳定、
  // 不触发重渲染、不受 effect 重订阅影响。
  const processedCodeRef = useRef<string | null>(null);

  // 监听 WeChatCallbackPage(在 iframe 内)发来的 postMessage
  useEffect(() => {
    const handler = async (e: MessageEvent) => {
      // 严格校验来源(同源) + payload 形状,防外部页面伪造消息
      if (e.origin !== window.location.origin) return;
      const data = e.data as { type?: string; code?: string; state?: string };
      if (data?.type !== 'scholay-wechat-callback' || !data.code) return;
      if (processedCodeRef.current === data.code) return; // 同一个 code 只认第一次
      processedCodeRef.current = data.code;

      setPhase('pending'); // 兜底:万一 iframe 导航探针没生效,收到 code 这一刻也必须盖住 iframe
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
        setPhase('done');
        onSuccess?.();
      } catch (err) {
        // 就地显示,不弹 toast —— 用户此刻正盯着这块面板,而且这里还挂着「重新扫码」
        setErrMsg(
          toApiError(err).message ||
            (mode === 'bind' ? '微信绑定失败,请稍后重试' : '微信登录失败,请稍后重试')
        );
        setPhase('error');
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [mode, onSuccess, qc]);

  // 拉配置 → 加载 wxLogin.js → 实例化。cancelled 防 race(用户离开时配置已拉但脚本还没加载完)
  useEffect(() => {
    let cancelled = false;
    let detach: (() => void) | undefined;
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

        if (containerRef.current) {
          detach = watchCallbackNavigation(containerRef.current, () => {
            if (!cancelled) setPhase('pending');
          });
        }
      } catch {
        // 配置接口失败 / 脚本拉不下来 —— 不弹 toast,容器内空白,用户自行重试入口
      }
    };
    run();
    return () => {
      cancelled = true;
      detach?.();
    };
  }, [attempt]);

  const retry = () => {
    setErrMsg('');
    setPhase('qr');
    setAttempt((n) => n + 1);
  };

  const doneText = mode === 'bind' ? '绑定成功' : '登录成功';
  const hint =
    phase === 'qr' ? '扫码后请在手机端确认授权' : phase === 'pending' ? '请稍候,不要关闭窗口' : '';

  return (
    <div className="flex flex-col items-center justify-center py-2">
      {/* 固定 220×240 的取景框:二维码 iframe 与状态浮层同尺寸叠放,切换状态时不跳布局。 */}
      <div className="relative w-[220px] h-[240px]">
        {/* iframe 容器:超出 hidden 兜底裁剪 —— 即使 CSS 注入失败,也只露二维码部分,
            避免侧栏/标题溢出 */}
        <div
          id={CONTAINER_ID}
          ref={containerRef}
          className="absolute inset-0 flex items-start justify-center overflow-hidden bg-surface-card"
        />
        {/* 状态浮层:**盖住**而不是卸载 iframe —— code 要靠 iframe 里那个页面 postMessage 上来,
            提前卸载就永远登录不了。不透明底色负责挡掉 iframe 里正在冷启动的我们自己的 SPA。 */}
        {phase !== 'qr' && (
          <div className="absolute inset-0 z-raised flex flex-col items-center justify-center gap-3 bg-surface-card px-4 text-center">
            {phase === 'pending' && (
              <>
                <Loader2 className="size-8 animate-spin text-muted-foreground" />
                <p className="text-12 text-muted-foreground">扫码成功,正在{mode === 'bind' ? '绑定' : '登录'}…</p>
              </>
            )}
            {phase === 'done' && (
              <>
                <CheckCircle2 className="size-8 text-brand-green" />
                <p className="text-12 text-foreground">{doneText}</p>
              </>
            )}
            {phase === 'error' && (
              <>
                <AlertCircle className="size-8 text-brand-red" />
                <p className="text-12 text-foreground">{errMsg}</p>
                <Button variant="outline" size="sm" onClick={retry}>
                  重新扫码
                </Button>
              </>
            )}
          </div>
        )}
      </div>
      {/* 高度恒定,避免文案切换时把弹窗抖一下 */}
      <span className="mt-3 block h-4 text-12 text-faint">{hint}</span>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────

/**
 * 盯住 wxLogin 注入的那个 iframe:**它一跳回我们自己的域就回调**。
 *
 * 这是「用户已经在手机上确认完了」的**最早**信号 —— 比 postMessage 早整整一个 SPA 冷启动
 * (iframe 里要重新下 index.html + 分包 + lazy 路由才轮到 WeChatCallbackPage 发消息)。
 * 那段时间正是用户看得见的窗口期:弹窗里明晃晃地闪一段我们自己的页面。
 *
 * 判据用「同源 + 路径是 /wechat/callback」两条,而不是「load 事件来了就算」:
 *   · 还在微信二维码页时读 contentWindow.location 会抛 SecurityError(跨域)→ catch 掉当没发生,
 *     所以二维码过期后的**刷新**不会被误判成扫码成功;
 *   · about:blank 虽然同源,但 pathname 对不上,同样不会误触发。
 *
 * 拿不到 iframe(SDK 改了注入方式 / 网络没起来)就安静地什么都不做 —— 上层还有 postMessage
 * 那一道兜底,只是浮层晚一点盖上,不影响能不能登录。
 */
function watchCallbackNavigation(container: HTMLElement, onArrive: () => void): () => void {
  let iframe: HTMLIFrameElement | null = null;

  const onLoad = () => {
    try {
      const loc = iframe?.contentWindow?.location;
      if (loc && loc.origin === window.location.origin && loc.pathname.startsWith(CALLBACK_PATH)) {
        onArrive();
      }
    } catch {
      // 跨域 = 还在微信那边,正常
    }
  };

  const attach = (el: HTMLIFrameElement) => {
    iframe = el;
    el.addEventListener('load', onLoad);
  };

  const found = container.querySelector('iframe');
  // wxLogin 目前是同步注入的,但别把这当契约:没查到就用 observer 等它出现(SDK 换过好几次实现)。
  let obs: MutationObserver | undefined;
  if (found) {
    attach(found);
  } else {
    obs = new MutationObserver(() => {
      const el = container.querySelector('iframe');
      if (el) {
        attach(el);
        obs?.disconnect();
      }
    });
    obs.observe(container, { childList: true, subtree: true });
  }

  return () => {
    obs?.disconnect();
    iframe?.removeEventListener('load', onLoad);
  };
}

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
