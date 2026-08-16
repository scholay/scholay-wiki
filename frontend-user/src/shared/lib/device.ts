// 设备分流判定 —— PC 站(AppShell '/')与移动站(MobileShell '/m')之间的唯一裁决点。
//
// 规则(已拍板 2026-06):**完全以浏览器 UA 为准,双向自动分流,App 内不提供任何手动切换**。
//   - 手机 UA 落在 PC 路由:有 /m 对等页 → 跳过去;同 URL 响应式页(论文/期刊/学者/PDF 详情、
//     landing、help/blog、分享接收页)无对等 → 留在原地;暂无移动版的纯 PC 页(传统检索 /search、
//     智能写作 /prism、智能审稿 /peer-review)→ 先统一送 /m/feed,后续补齐再换专页。
//   - 桌面 UA(含手机浏览器开「请求桌面版」把 UA 改成桌面后)落在 /m/* → 自动回 PC 对等页。
//   - 不再有 localStorage 偏好标记:浏览器「请求桌面版」开/关即时改 UA,下次导航 loader 即纠正版本。
//
// 设备判定规则:**只有「确定是手机」才算移动端,pad 一律按 PC**。
//   - iPadOS 13+ Safari 发桌面 UA(与 Mac 无法区分),Apple 本意就是让 iPad 看桌面站;
//   - Android 平板 UA 带 Android 但不带 Mobile(只有 Android 手机带);
//   - 误判代价不对称:手机落 PC 端尚可读,pad 被强塞 390px 手机版式更难受。
//
// SEO 红线:移动爬虫 UA 也带 Mobile(Googlebot smartphone / 百度移动蜘蛛),BOT_RE 先排除,
// 否则同 URL 的详情页会被分流污染。
//
// 放 shared/lib(纯 TS、无依赖),router 的两个 loader(/ 与 /m)共用。

/** 爬虫特征(含 Googlebot/Baiduspider/Bytespider/PetalBot/神马等的公共子串) */
const BOT_RE =
  /bot|spider|crawl|slurp|bingpreview|petalbot|yisou|google-inspectiontool|googleother/i;

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

/**
 * 是否在微信内置浏览器(MicroMessenger)。
 * 微信内**无法唤起支付宝**(行业限制),手机网站支付会失败 —— 需提示用户「在浏览器打开后再付款」。
 */
export function isWeChatBrowser(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /micromessenger/i.test(navigator.userAgent);
}

/**
 * 路由映射条目:
 *   - exact   精确匹配某条路径
 *   - prefix  前缀匹配(含子路径);默认把剩余段拼到 target 后(深链不丢)
 *   - collapse=true  命中前缀后整段折叠到 target(不拼剩余段),用于「整棵子树都没有移动版,统一送首页」
 */
type RouteMap = { exact?: string; prefix?: string; target: string; collapse?: boolean };

function resolve(maps: RouteMap[], pathname: string): string | null {
  for (const m of maps) {
    if (m.exact !== undefined && pathname === m.exact) return m.target;
    if (
      m.prefix !== undefined &&
      (pathname === m.prefix || pathname.startsWith(`${m.prefix}/`))
    ) {
      return m.collapse ? m.target : m.target + pathname.slice(m.prefix.length);
    }
  }
  return null;
}

/**
 * PC 路由 → 移动对等页。手机 UA 命中才跳:
 *   - 有真正 /m 页:home / 期刊检索 / 助手 / 工具 / 文件夹 / 设置 → 对应 /m 页(prefix 保留子路径)
 *   - 暂无移动版的纯 PC 页:/search · /prism · /peer-review → 先统一送 /m/feed(collapse),后续补齐换专页
 * 不在表里 = 同 URL 响应式(详情 / landing / help / 分享),返回 null 即「留在原地」(保 SEO + 分享深链)。
 */
const MOBILE_EQUIVALENTS: RouteMap[] = [
  { exact: '/', target: '/m/feed' },
  { exact: '/journals/search', target: '/m/feed/journals' },
  { exact: '/journals', target: '/m/feed/journals' },
  { exact: '/claw', target: '/m/claw' },
  { exact: '/tools/catalog', target: '/m/tools/all' },
  { prefix: '/tools', target: '/m/tools' }, // /tools/:idOrSlug → /m/tools/:idOrSlug
  // 桌面只有 /library 一条路由(文件夹是 ?folder= query,没有 /library/:id 路径段),
  // 文件夹深链的 query→路径段改写在 mobileEquivalentPath 里特判,这里只兜底裸 /library。
  { prefix: '/library', target: '/m/library' },
  { exact: '/settings', target: '/m/me' },
  { exact: '/settings/membership', target: '/m/me' },
  { exact: '/settings/profile', target: '/m/me/profile' },
  { exact: '/settings/security', target: '/m/me/security' },
  { exact: '/settings/connections', target: '/m/me/connections' },
  { exact: '/settings/invite', target: '/m/me/invite' },
  // 暂无移动版,先统一送移动首页(后续补齐再换成专页)
  { exact: '/search', target: '/m/feed' },
  { prefix: '/prism', target: '/m/feed', collapse: true },
  { prefix: '/peer-review', target: '/m/feed', collapse: true },
];

/**
 * 给定 PC 路径,返回移动对等路径;无对等(响应式页)返回 null = 留在原地。
 *
 * search(如 "?folder=5")必须一并传入:
 *   - /library?folder=N → /m/library/N(桌面文件夹是 query、移动是路径段,与
 *     desktopEquivalentPath 的反向改写对称;不特判的话手机打开桌面深链会丢 folder
 *     落在文件夹列表页);
 *   - 其余命中项把 query 原样拼回 target(保住 /tools 等带参深链;目标页不认识的
 *     参数自行忽略,好过静默丢失)。
 */
export function mobileEquivalentPath(pathname: string, search = ''): string | null {
  if (pathname === '/library' || pathname === '/library/') {
    const folder = new URLSearchParams(search).get('folder');
    if (folder && /^\d+$/.test(folder)) return `/m/library/${folder}`;
  }
  const target = resolve(MOBILE_EQUIVALENTS, pathname);
  if (target === null) return null;
  return search && search !== '?' ? target + search : target;
}

/**
 * 移动路由 → PC 对等页。桌面 UA(含手机浏览器「请求桌面版」)落在 /m/* 时用。
 * 无对等一律回 '/'(首页),不把桌面用户留在移动壳里。
 */
const DESKTOP_EQUIVALENTS: RouteMap[] = [
  { exact: '/m/feed', target: '/' },
  { exact: '/m/feed/journals', target: '/journals/search' },
  { exact: '/m/claw', target: '/claw' },
  { exact: '/m/tools/all', target: '/tools/catalog' },
  { prefix: '/m/tools', target: '/tools' }, // /m/tools/:id → /tools/:id
  { exact: '/m/library', target: '/library' },
  { exact: '/m/me', target: '/settings' },
  { exact: '/m/me/profile', target: '/settings/profile' },
  { exact: '/m/me/security', target: '/settings/security' },
  { exact: '/m/me/connections', target: '/settings/connections' },
  { exact: '/m/me/invite', target: '/settings/invite' },
  { exact: '/m/me/billing', target: '/settings/membership' },
  { exact: '/m/auth', target: '/' }, // PC 无独立登录页(走弹窗),回首页
];

/** 给定移动路径,返回 PC 对等路径(桌面 UA 落 /m/* 时纠正);无对等回 '/'。search 原样保留。 */
export function desktopEquivalentPath(pathname: string, search = ''): string {
  // 文件夹深链:移动是路径段 /m/library/:id,桌面文件夹是 query ?folder=:id
  // (桌面只有 /library 一条路由,文件夹靠 query state),需单独改写;其余 query 合并保留。
  const folder = /^\/m\/library\/([^/]+)\/?$/.exec(pathname);
  if (folder) {
    const params = new URLSearchParams(search);
    params.set('folder', folder[1]);
    return `/library?${params.toString()}`;
  }
  const target = resolve(DESKTOP_EQUIVALENTS, pathname) ?? '/';
  return search && search !== '?' ? target + search : target;
}
