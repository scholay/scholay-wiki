// 环境配置。小程序无 process.env,用 envVersion 区分环境:
//   develop(开发版 / 开发者工具) → 本地后端;trial(体验版)/ release(正式版) → 生产域名。
//
// 生产域名必须满足:HTTPS + 已 ICP 备案 + 已加进小程序后台「开发管理 → 服务器域名 →
// request 合法域名」白名单(WS 走 socket 白名单,上传下载各自白名单)。
const accountInfo = wx.getAccountInfoSync()
const envVersion = accountInfo.miniProgram.envVersion // 'develop' | 'trial' | 'release'

// 本地联调指向整站入口(nginx,HTTP_PORT=5411)。开发者工具需勾选「不校验合法域名」。
const DEV_BASE_URL = 'http://localhost:5411'

// 生产:整站入口(nginx),/api/* 走后端、/ 走前端;小程序 API = https://www.scholay.com/api/v1/*,
// WS 自动 wss://www.scholay.com。四类白名单(request/socket/uploadFile/downloadFile)都填这个域名。
const PROD_BASE_URL = 'https://www.scholay.com'

export const BASE_URL: string = envVersion === 'develop' ? DEV_BASE_URL : PROD_BASE_URL

// 后端所有业务路由前缀(与 Web 端一致)。
export const API_PREFIX = '/api/v1'
