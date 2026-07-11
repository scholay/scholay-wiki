import { changePassword } from '../../services/api/user'
import { toastError } from '../../lib/feedback'

Page({
  data: {
    current: '',
    next: '',
    confirm: '',
    saving: false,
  },
  onCur(e: WechatMiniprogram.Input) {
    this.setData({ current: e.detail.value })
  },
  onNext(e: WechatMiniprogram.Input) {
    this.setData({ next: e.detail.value })
  },
  onConfirm(e: WechatMiniprogram.Input) {
    this.setData({ confirm: e.detail.value })
  },
  async onSave() {
    if (this.data.saving) return
    const { current, next, confirm } = this.data
    if (!current || !next) {
      wx.showToast({ title: '请填写完整', icon: 'none' })
      return
    }
    if (next.length < 8) {
      wx.showToast({ title: '新密码至少 8 位', icon: 'none' })
      return
    }
    if (next !== confirm) {
      wx.showToast({ title: '两次新密码不一致', icon: 'none' })
      return
    }
    this.setData({ saving: true })
    try {
      await changePassword(current, next)
      wx.showToast({ title: '已修改', icon: 'success' })
      setTimeout(() => wx.navigateBack(), 600)
    } catch (e) {
      toastError(e, '修改失败')
    }
    this.setData({ saving: false })
  },
})
