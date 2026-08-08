import { login, loginPassword, sendEmailCode, loginWithCode } from '../../services/auth'
import { toastError } from '../../lib/feedback'
import { reportActivity } from '../../services/activity'

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
let codeTimer: ReturnType<typeof setInterval> | null = null

Page({
  data: {
    loading: false, // 微信登录中
    submitting: false, // 表单登录中
    mode: 'password' as 'password' | 'code',
    email: '',
    password: '',
    code: '',
    sending: false,
    countdown: 0,
  },

  onShow() {
    reportActivity()
  },

  onUserActivity() {
    reportActivity()
  },

  onWxLogin() {
    if (this.data.loading || this.data.submitting) return
    this.setData({ loading: true })
    login()
      .then((res) => this.done(res.is_new_user))
      .catch((e) => wx.showModal({ title: '微信登录失败', content: (e as Error).message || '失败', showCancel: false }))
      .then(() => this.setData({ loading: false }))
  },

  switchMode(e: WechatMiniprogram.TouchEvent) {
    this.setData({ mode: e.currentTarget.dataset.mode as 'password' | 'code' })
  },
  onEmail(e: WechatMiniprogram.Input) {
    reportActivity()
    this.setData({ email: e.detail.value.trim() })
  },
  onPassword(e: WechatMiniprogram.Input) {
    reportActivity()
    this.setData({ password: e.detail.value })
  },
  onCode(e: WechatMiniprogram.Input) {
    reportActivity()
    this.setData({ code: e.detail.value.trim() })
  },

  async onSendCode() {
    if (this.data.sending || this.data.countdown > 0) return
    if (!EMAIL_RE.test(this.data.email)) {
      wx.showToast({ title: '请输入正确邮箱', icon: 'none' })
      return
    }
    this.setData({ sending: true })
    try {
      await sendEmailCode(this.data.email)
      wx.showToast({ title: '验证码已发送(测试见后端日志)', icon: 'none' })
      this.startCountdown()
    } catch (e) {
      toastError(e, '发送失败')
    }
    this.setData({ sending: false })
  },
  startCountdown() {
    this.setData({ countdown: 60 })
    codeTimer = setInterval(() => {
      const c = this.data.countdown - 1
      if (c <= 0) {
        if (codeTimer) clearInterval(codeTimer)
        codeTimer = null
        this.setData({ countdown: 0 })
      } else {
        this.setData({ countdown: c })
      }
    }, 1000)
  },

  async onSubmit() {
    if (this.data.submitting || this.data.loading) return
    const { mode, email, password, code } = this.data
    if (!EMAIL_RE.test(email)) {
      wx.showToast({ title: '请输入正确邮箱', icon: 'none' })
      return
    }
    if (mode === 'password' && !password) {
      wx.showToast({ title: '请输入密码', icon: 'none' })
      return
    }
    if (mode === 'code' && code.length !== 6) {
      wx.showToast({ title: '请输入 6 位验证码', icon: 'none' })
      return
    }
    this.setData({ submitting: true })
    try {
      if (mode === 'password') await loginPassword(email, password)
      else await loginWithCode(email, code)
      this.done(false)
    } catch (e) {
      toastError(e, '登录失败')
    }
    this.setData({ submitting: false })
  },

  done(isNew: boolean) {
    wx.showToast({ title: isNew ? '欢迎加入' : '登录成功', icon: 'success' })
    // 登录页多为 navigateTo 进入 → 返回上一页;直接进入则回「我的」。各页 onShow 会 reconcile 登录态。
    setTimeout(() => wx.navigateBack({ fail: () => wx.switchTab({ url: '/pages/me/me' }) }), 600)
  },

  onUnload() {
    if (codeTimer) {
      clearInterval(codeTimer)
      codeTimer = null
    }
  },
})
