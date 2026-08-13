// 环境配置:小程序连哪一套后端。
//
// ── 为什么需要三态(2026-08-13)────────────────────────────────────────────────
// 这里原本只有「开发者工具 → localhost / 其它一律 → 生产域名」两态,没有测试态。
// 而**体验版 / 审核版 / 真机预览一律不是 devtools** —— 也就是说,任何想在真机上
// 验证小程序的场景,都会直接打到生产:测试期的注册、登录、文献集写入、AI 会话与
// 额度消耗全部落进生产库,并消耗生产的 agent / minicod 配额。
// 加一个显式的 TARGET 常量,把「连哪一套」变成一次有意识的选择。
//
// ⚠️ 铁律:真机/生产的判断必须用 platform==='devtools',【绝不能】用
//   envVersion==='develop' —— 微信【审核环境】上报的 envVersion 也是 'develop',
//   若据此走 localhost,审核会报 "request:fail url not in domain list: localhost"
//   被驳回(实测踩过)。而 platform 能可靠区分:开发者工具='devtools',
//   真机='ios'/'android'/…,审核跑在真机上。
//
// 每个非 devtools 的目标域名都必须满足:HTTPS + 已 ICP 备案 + 已加进【对应那个小程序】
// 后台「开发管理 → 服务器域名」的 request/socket/uploadFile/downloadFile 四类白名单。
// ⚠️ 白名单是**按小程序 AppID** 配的:测试域名要么加进现有小程序(会同时对正式版生效),
//    要么给测试环境单独申请一个 AppID(推荐,同时避免上传体验版覆盖掉生产的体验版)。

/**
 * 连接目标。改这一个常量即可切换整套后端。
 *
 *   'auto' —— 开发者工具走 DEV,其余走 PROD(历史行为,发布正式版时用这个)
 *   'test' —— 无论在哪都走 TEST_BASE_URL(要在真机上验测试环境时用)
 *   'dev'  —— 无论在哪都走 DEV_BASE_URL(极少用;真机走不通,localhost 不在白名单)
 *
 * 🔴 提交正式版 / 体验版前请确认这里是 'auto'。
 */
const TARGET: 'auto' | 'test' | 'dev' = 'auto'

// 本地联调指向整站入口(nginx,HTTP_PORT=5411)。开发者工具需勾选「不校验合法域名」。
const DEV_BASE_URL = 'http://localhost:5411'

// 测试环境整站入口。留空表示「还没搭 / 不用」—— 此时 TARGET='test' 会回落 PROD 并在
// 控制台告警,而不是静默去连一个空地址(那会让所有请求报一个看不懂的 URL 错误)。
const TEST_BASE_URL = ''

// 生产:整站入口(nginx),/api/* 走后端、/ 走前端;API = <BASE_URL>/api/v1/*,
// WS 自动 wss://。
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

function resolveBaseURL(): string {
  if (TARGET === 'dev') return DEV_BASE_URL
  if (TARGET === 'test') {
    if (TEST_BASE_URL) return TEST_BASE_URL
    console.warn('[env] TARGET=test 但 TEST_BASE_URL 未填,已回落生产域名')
    return PROD_BASE_URL
  }
  return isDevtools() ? DEV_BASE_URL : PROD_BASE_URL
}

export const BASE_URL: string = resolveBaseURL()

// 后端所有业务路由前缀(与 Web 端一致)。
export const API_PREFIX = '/api/v1'
