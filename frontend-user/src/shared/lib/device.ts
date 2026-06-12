// 设备分流判定 —— 「手机访问首页自动进 /m」的唯一裁决点。
//
// 规则(已拍板):**只有「确定是手机」才送移动端,pad 一律按 PC 处理**。
//   - iPadOS 13+ Safari 发桌面 UA(与 Mac 无法区分),Apple 本意就是让 iPad 看桌面站;
//   - Android 平板 UA 带 Android 但**不带 Mobile**(只有 Android 手机带);
//   - 误判代价不对称:手机用户落 PC 端可一键切换,pad 用户被强塞 390px 手机版式更难受。
//
// SEO 红线:移动爬虫 UA 也带 Mobile(Googlebot smartphone / 百度移动蜘蛛),
// 不排除的话搜索引擎抓 / 会被分流到 /m/feed,半成品 feed 会被当成移动首页索引。
//
// 放 shared/lib(纯 TS、无依赖),router loader 与 MobileShell 共用。
const PREFER_DESKTOP_KEY = 'scholay.prefer_desktop';
const AUTO_REDIRECT_FLAG = 'scholay.mobile_auto_redirected';

/** 爬虫特征(含 Googlebot/Baiduspider/Bytespider/PetalBot/神马等的公共子串) */
const BOT_RE = /bot|spider|crawl|slurp|bingpreview|petalbot|yisou/i;

/**
 * pad 明示特征 → 一律 PC。
 * 覆盖 iPadOS 12- 与 App 内 WebView 的 iPad UA(那些 UA 里带 Mobile/15E148,
 * 不先排除会被下面的手机正则误吞);Silk 是 Kindle Fire 平板浏览器。
 */
const PAD_RE = /iPad|Tablet|Silk|PlayBook/i;

/** 手机正向特征:iPhone/iPod、Windows Phone、泛 Mobi(Android 手机 / Opera Mobi 等) */
const PHONE_RE = /iPhone|iPod|Windows Phone|Mobi/i;

/** 当前访问是否「确定是手机」(pad / 爬虫 / 桌面一律 false) */
export function isPhoneDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  if (BOT_RE.test(ua)) return false;
  if (PAD_RE.test(ua)) return false;
  // Chromium 的 UA Client Hints:手机 true / 平板与桌面 false,正好契合「pad 跟 PC」
  const uaData = (
    navigator as Navigator & { userAgentData?: { mobile?: boolean } }
  ).userAgentData;
  if (uaData?.mobile === true) return true;
  return PHONE_RE.test(ua);
}

/** 用户是否点过「使用电脑版」(localStorage 持久,清除 = 恢复自动分流) */
export function prefersDesktop(): boolean {
  try {
    return localStorage.getItem(PREFER_DESKTOP_KEY) === '1';
  } catch {
    return false;
  }
}

export function setPrefersDesktop(value: boolean): void {
  try {
    if (value) localStorage.setItem(PREFER_DESKTOP_KEY, '1');
    else localStorage.removeItem(PREFER_DESKTOP_KEY);
  } catch {
    // 隐私模式写失败 → 本次会话内每次进首页都会再跳一次,可接受
  }
}

/** 分流裁决:本次访问是不是「该进移动版的手机用户」 */
export function shouldAutoRedirectToMobile(): boolean {
  return isPhoneDevice() && !prefersDesktop();
}

/**
 * 桌面路由 → 移动对等页映射 —— 自动分流的范围就是这张表:
 * **有对等页才跳,没有的深链(论文详情/文献集/Prism…)留在桌面版**,不丢用户意图。
 * 移动端每补齐一个功能,就在这里加一行。
 */
const MOBILE_EQUIVALENTS: Array<{
  /** 精确匹配的桌面路径 */
  exact?: string;
  /** 前缀匹配(含子路径),target 会拼上剩余段 */
  prefix?: string;
  target: string;
}> = [
  { exact: '/', target: '/m/feed' },
  { exact: '/journals/search', target: '/m/feed/journals' },
  { exact: '/claw', target: '/m/claw' },
  { prefix: '/tools', target: '/m/tools' }, // /tools/:idOrSlug → /m/tools/:idOrSlug
  { exact: '/settings', target: '/m/me' },
  { exact: '/settings/membership', target: '/m/me' },
  { exact: '/settings/profile', target: '/m/me/profile' },
  { exact: '/settings/security', target: '/m/me/security' },
  { exact: '/settings/connections', target: '/m/me/connections' },
];

/** 给定桌面路径,返回移动对等路径;没有对等页返回 null(留在桌面版) */
export function mobileEquivalentPath(pathname: string): string | null {
  for (const m of MOBILE_EQUIVALENTS) {
    if (m.exact !== undefined && pathname === m.exact) return m.target;
    if (
      m.prefix !== undefined &&
      (pathname === m.prefix || pathname.startsWith(`${m.prefix}/`))
    ) {
      return m.target + pathname.slice(m.prefix.length);
    }
  }
  return null;
}

/** 重定向前打标(sessionStorage),移动端 shell 据此弹一次性「切回电脑版」toast */
export function markAutoRedirected(): void {
  try {
    sessionStorage.setItem(AUTO_REDIRECT_FLAG, '1');
  } catch {
    /* 打不上标 → 不弹 toast,核心分流不受影响 */
  }
}

/** 消费打标(读后即清,保证 toast 每次重定向只弹一次) */
export function consumeAutoRedirectedFlag(): boolean {
  try {
    const hit = sessionStorage.getItem(AUTO_REDIRECT_FLAG) === '1';
    if (hit) sessionStorage.removeItem(AUTO_REDIRECT_FLAG);
    return hit;
  } catch {
    return false;
  }
}
