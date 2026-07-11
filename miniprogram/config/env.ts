// 环境配置。小程序无 process.env,用 envVersion 区分环境:
//   develop(开发版 / 开发者工具) → 本地后端;trial(体验版)/ release(正式版) → 生产域名。
//
// 生产域名必须满足:HTTPS + 已 ICP 备案 + 已加进小程序后台「开发管理 → 服务器域名 →
// request 合法域名」白名单(WS 走 socket 白名单,上传下载各自白名单)。
const accountInfo = wx.getAccountInfoSync()
const envVersion = accountInfo.miniProgram.envVersion // 'develop' | 'trial' | 'release'

// 本地联调指向整站入口(nginx,HTTP_PORT=5411)。开发者工具需勾选「不校验合法域名」。
const DEV_BASE_URL = 'http://localhost:5411'

// TODO(上线前必改):换成你的生产 API 域名。建议开纯 API 子域 api.scholay.com,
// 只把这一条加进 request 合法域名白名单(见 README 的「域名白名单清单」)。
const PROD_BASE_URL = 'https://api.scholay.com'

export const BASE_URL: string = envVersion === 'develop' ? DEV_BASE_URL : PROD_BASE_URL

// 后端所有业务路由前缀(与 Web 端一致)。
export const API_PREFIX = '/api/v1'
