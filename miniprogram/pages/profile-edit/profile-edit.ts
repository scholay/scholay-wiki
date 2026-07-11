import { getProfile, updateProfile } from '../../services/api/user'
import { toastError } from '../../lib/feedback'

Page({
  data: {
    username: '',
    bio: '',
    loading: true,
    saving: false,
  },

  async onLoad() {
    try {
      const p = await getProfile()
      this.setData({ username: p.username || '', bio: (p.bio as string) || '', loading: false })
    } catch (e) {
      this.setData({ loading: false })
      toastError(e, '加载失败')
    }
  },

  onName(e: WechatMiniprogram.Input) {
    this.setData({ username: e.detail.value })
  },
  onBio(e: WechatMiniprogram.Input) {
    this.setData({ bio: e.detail.value })
  },

  async onSave() {
    if (this.data.saving) return
    const username = this.data.username.trim()
    if (!username) {
      wx.showToast({ title: '昵称不能为空', icon: 'none' })
      return
    }
    this.setData({ saving: true })
    try {
      await updateProfile(username, this.data.bio.trim())
      wx.showToast({ title: '已保存', icon: 'success' })
      setTimeout(() => wx.navigateBack(), 600)
    } catch (e) {
      toastError(e, '保存失败')
    }
    this.setData({ saving: false })
  },

  goChangePassword() {
    wx.navigateTo({ url: '/pages/change-password/change-password' })
  },
})
