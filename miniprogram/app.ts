import { reportActivity } from './services/activity'

// 全局 App。冷启动不强制登录 —— 进入受保护操作时按需 ensureLogin()(见 services/auth.ts)。
App({
  onLaunch() {
    // 预留:全局初始化(埋点、版本更新检查等)。
  },
  onShow() {
    // 冷启动/从后台返回前台是真实进入；页面挂着时不会周期上报。
    reportActivity()
  },
})
