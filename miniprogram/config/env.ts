// 环境配置:只有【微信开发者工具】走本地后端,真机(体验版/正式版/审核)一律走生产域名。
//
// ⚠️ 铁律:必须用 platform==='devtools' 判断,【绝不能】用 envVersion==='develop' ——
//   微信【审核环境】上报的 envVersion 也是 'develop',若据此走 localhost,审核会报
//   "request:fail url not in domain list: localhost" 被驳回(实测踩过)。而 platform 能
//   可靠区分:开发者工具='devtools',真机='ios'/'android'/…,审核跑在真机上。
//
// 生产域名必须满足:HTTPS + 已 ICP 备案 + 已加进小程序后台「开发管理 → 服务器域名」白名单
// (request/socket/uploadFile/downloadFile 四类都填 www.scholay.com)。

// 本地联调指向整站入口(nginx,HTTP_PORT=5411)。开发者工具需勾选「不校验合法域名」。
const DEV_BASE_URL = 'http://localhost:5411'

// 生产:整站入口(nginx),/api/* 走后端、/ 走前端;小程序 API = https://www.scholay.com/api/v1/*,
// WS 自动 wss://www.scholay.com。四类白名单都填这个域名。
const PROD_BASE_URL = 'https://www.scholay.com'

// platform:devtools=开发者工具 / ios/android/mac/windows=真机。getDeviceInfo 新 API,
// 老基础库回退 getSystemInfoSync;任一异常都当作「非 devtools」→ 走生产,绝不误走 localhost。
function isDevtools(): boolean {
  try {
    if (typeof wx.getDeviceInfo === 'function') return wx.getDeviceInfo().platform === 'devtools'
  } catch {
    /* fall through */
  }
  try {
    return wx.getSystemInfoSync().platform === 'devtools'
  } catch {
    return false
  }
}

export const BASE_URL: string = isDevtools() ? DEV_BASE_URL : PROD_BASE_URL

// 后端所有业务路由前缀(与 Web 端一致)。
export const API_PREFIX = '/api/v1'
