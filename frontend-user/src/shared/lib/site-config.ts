/**
 * 站点运行时配置 —— 由 frontend-user 容器的 `docker-entrypoint.d/50-inject-site.sh`
 * 在**容器启动时**写进 `index.html` 的 `window.__SITE_CONFIG__`。
 *
 * ── 为什么不用 `import.meta.env.VITE_*` ──
 * Vite 在**编译期**就把 `import.meta.env.VITE_*` 字面替换进 bundle,走那条路等价于
 * 「换一套部署 = 重新构建一个镜像」。本项目的目标是**同一个镜像 tag + 一份 .env**
 * 就能跑起互不干扰的多套环境,所以这类「每套部署不同」的值必须运行时注入。
 *
 * ── 谁在读 ──
 * 这里只放**必须在 React 里用到**的值。像 og:url / JSON-LD 那些纯静态 meta,
 * entrypoint 直接改 index.html 的对应属性即可,不必经过这里;而 canonical 走
 * `window.location.origin`(见 RouteSEO),连配置都不需要。
 *
 * ── 未替换的占位符 ──
 * 若 entrypoint 没跑(比如有人直接把 build 产物丢给别的静态服务器),值会是字面量
 * `__ICP_BEIAN__`。这类字符串一律当作「未配置」处理 —— 页面上宁可少一块内容,
 * 也不能把占位符渲染给用户看。
 */

interface SiteConfig {
  /** ICP 备案号;未配置为空。⚠️ 与已备案域名绑定,不可跨域名复用。 */
  icp?: string;
}

declare global {
  interface Window {
    __SITE_CONFIG__?: SiteConfig;
  }
}

/** 占位符形态:`__NAME__`。entrypoint / vite 插件漏替换时会长这样。 */
function isPlaceholder(v: string): boolean {
  return /^__[A-Z_]+__$/.test(v);
}

function read(key: keyof SiteConfig): string {
  if (typeof window === 'undefined') return '';
  const v = window.__SITE_CONFIG__?.[key];
  if (typeof v !== 'string') return '';
  const trimmed = v.trim();
  return !trimmed || isPlaceholder(trimmed) ? '' : trimmed;
}

/** ICP 备案号。空串 = 本环境未配置,调用方应整块不渲染。 */
export function icpBeian(): string {
  return read('icp');
}
