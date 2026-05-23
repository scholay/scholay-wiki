/**
 * ============================================================================
 * Scholay 站点配置 —— 单一事实来源
 *
 * 所有 SEO / JSON-LD / 跨域链接里出现的"自己的域名 / 邮箱 / 第三方服务地址"
 * 都从这里读,不要在业务代码里硬编码。
 *
 * 配置方式:
 *   1. 优先读 process.env.REACT_APP_*  (Vite 通过 envPrefix 接收 REACT_APP_*)
 *   2. fallback 到下面的默认值
 *
 * 修改默认值 = 修改了"项目预设的品牌域名",影响 build 产物所有页面;
 * 修改环境变量 = 部署期覆盖,适合 staging / production / 私有部署的多环境复用。
 * ============================================================================
 */

// 主域(权威 host) —— 所有 canonical / og:url / sitemap loc 都用它
// 必须带 www,与后端 SEO_BASE_URL 保持一致;apex 通过反代层 301 → www
export const SITE_URL: string =
  (typeof process !== 'undefined' && process.env?.REACT_APP_SITE_URL) ||
  'https://www.scholay.com';

// 品牌名(出现在 OpenGraph / 结构化数据里)
export const SITE_NAME: string =
  (typeof process !== 'undefined' && process.env?.REACT_APP_SITE_NAME) || 'Scholay';

// 公开支持邮箱(法律页 / 联系页 / FAQ 文案里展示)
export const SUPPORT_EMAIL: string =
  (typeof process !== 'undefined' && process.env?.REACT_APP_SUPPORT_EMAIL) ||
  'support@scholay.com';

// PDF 预览代理服务,前端浏览器上传外链 PDF 时用
// 完整端点(带路径),前端拼 query 直接打它
export const PDF_PREVIEW_ENDPOINT: string =
  (typeof process !== 'undefined' && process.env?.REACT_APP_PDF_PREVIEW_ENDPOINT) ||
  'https://filepreview.scholay.com/api/preview';

// 站点 Logo URL(JSON-LD Organization.logo / Publisher.logo 用)
// 默认引用站点根下的 brand 资源
export const SITE_LOGO_URL: string = `${SITE_URL}/logo.png`;
export const SITE_BRAND_LOGO_SVG: string = `${SITE_URL}/brand-logo.svg`;

// ----- 工具函数:确保 path 与 SITE_URL 拼接产物没有重复斜杠 -----
export function siteUrl(path: string = ''): string {
  if (!path) return SITE_URL;
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${SITE_URL}${p}`;
}
