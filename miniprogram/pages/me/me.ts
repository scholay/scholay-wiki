import { syncTabBar } from '../../services/tabbar'
import { toastError } from '../../lib/feedback'
import { isLoggedIn, clearToken, getUser } from '../../store/auth'
import { getProfile, UserProfile, bindMiniProgramPhone } from '../../services/api/user'
import { getBillingOverview, BillingOverview, previewRedeemCode, redeemCode, resetQuota } from '../../services/api/membership'
import { ensureLogin } from '../../services/auth'
import { ICONS } from '../../lib/icons'

const TIER_LABEL: Record<string, string> = { free: 'Free', pro: 'Pro', max: 'Max' }

// 后端 RFC3339 串(本地时区)→ YYYY-MM-DD:优先直接截日期位,避免 Date 解析
// 在 iOS JSCore 上的兼容/时区偏移坑;非标准串再退回 Date 解析,仍失败则原样显示。
function fmtDate(iso?: string | null): string {
  if (!iso) return ''
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(iso)
  if (m) return m[1]
  const t = new Date(iso)
  if (!isFinite(t.getTime())) return iso
  const p = (n: number) => (n < 10 ? '0' + n : '' + n)
  return t.getFullYear() + '-' + p(t.getMonth() + 1) + '-' + p(t.getDate())
}

// 经费余额展示:整数直显,小数保留 2 位(0094 起经费是小数,直出会带全精度尾巴)。
function fmtCredit(n?: number): string {
  if (typeof n !== 'number' || !isFinite(n)) return '0'
  return Number.isInteger(n) ? String(n) : n.toFixed(2)
}

Page({
  data: {
    ic: ICONS,
    loggedIn: false,
    loading: false,
    error: '',
    profile: null as UserProfile | null,
    overview: null as BillingOverview | null,
    tierLabel: '',
    remaining: 0,
    expiresAt: '', // YYYY-MM-DD(由 overview.expires_at 格式化,别在 wxml 直出 RFC3339)
    creditTotal: '', // 经费余额展示串(整数直显 / 小数保留 2 位)
  },

  onShow() {
    syncTabBar(3)
    this.refresh()
  },

  refresh() {
    const loggedIn = isLoggedIn()
    this.setData({ loggedIn })
    if (!loggedIn) {
      this.setData({ profile: null, overview: null })
      return
    }
    this.loadProfile()
  },

  async loadProfile() {
    // 秒开:先用本地缓存的登录用户画头部(SWR);有缓存就不显骨架、无缓存才显。
    const cached = getUser<UserProfile>()
    if (cached) this.setData({ profile: cached })
    this.setData({ loading: !cached, error: '' })
    // 资料 + 会员资产互不依赖 → 并行;会员资产失败不影响资料展示。
    const [profileR, overviewR] = await Promise.allSettled([getProfile(), getBillingOverview()])
    if (profileR.status === 'rejected') {
      if (cached) this.setData({ loading: false }) // 有缓存则保留旧内容不落错误态
      else this.setData({ error: (profileR.reason as Error)?.message || '加载失败', loading: false })
      return
    }
    const patch: WechatMiniprogram.IAnyObject = { profile: profileR.value, loading: false }
    if (overviewR.status === 'fulfilled') {
      const o = overviewR.value
      patch.overview = o
      patch.tierLabel = TIER_LABEL[o.tier] || o.tier
      patch.remaining = o.token.unlimited ? 100 : Math.max(0, 100 - (o.token.percent || 0))
      patch.expiresAt = fmtDate(o.expires_at)
      patch.creditTotal = fmtCredit(o.credit && o.credit.total)
    }
    this.setData(patch)
  },

  async onTapLogin() {
    try {
      await ensureLogin()
      this.refresh()
    } catch (e) {
      wx.showModal({ title: '登录失败', content: (e as Error).message || '登录失败', showCancel: false })
    }
  },
  goLogin() {
    wx.navigateTo({ url: '/pages/login/login' }) // 返回后 onShow refresh 会拿到登录态
  },

  onLogout() {
    wx.showModal({
      title: '退出登录',
      content: '确定退出当前账号?',
      success: (res) => {
        if (res.confirm) {
          clearToken()
          this.setData({ loggedIn: false, profile: null, overview: null })
        }
      },
    })
  },

  goLibrary() {
    wx.navigateTo({ url: '/pages/library/library' })
  },
  goBilling() {
    wx.navigateTo({ url: '/pages/billing/billing' })
  },
  goProfileEdit() {
    wx.navigateTo({ url: '/pages/profile-edit/profile-edit' })
  },

  async onGetPhone(e: WechatMiniprogram.ButtonGetPhoneNumber) {
    const code = e.detail.code
    if (!code) return // 用户取消授权
    wx.showLoading({ title: '绑定中' })
    try {
      await bindMiniProgramPhone(code)
      wx.hideLoading()
      wx.showToast({ title: '已绑定', icon: 'success' })
      this.loadProfile()
    } catch (err) {
      wx.hideLoading()
      wx.showToast({ title: (err as Error).message || '绑定失败', icon: 'none' })
    }
  },

  onRedeem() {
    wx.showModal({
      title: '兑换码',
      editable: true,
      placeholderText: '输入兑换码',
      success: async (res) => {
        if (!res.confirm) return
        const code = (res.content || '').trim()
        if (!code) return
        wx.showLoading({ title: '校验中' })
        let preview
        try {
          preview = await previewRedeemCode(code)
        } catch (e) {
          wx.hideLoading()
          toastError(e, '兑换码无效')
          return
        }
        wx.hideLoading()
        const desc =
          preview.grant_kind === 'tier'
            ? '会员 ' + (preview.grant_tier || '') + ' ' + (preview.grant_days || 0) + ' 天'
            : '经费 ' + (preview.grant_credits || 0) // 0090:经费不分类型,不再标注(永久)/(临时)
        wx.showModal({
          title: '确认兑换',
          content: '将获得:' + desc,
          success: async (r2) => {
            if (!r2.confirm) return
            try {
              await redeemCode(code)
              wx.showToast({ title: '兑换成功', icon: 'success' })
              this.loadProfile()
            } catch (e) {
              toastError(e, '兑换失败')
            }
          },
        })
      },
    })
  },

  onReset() {
    const ov = this.data.overview
    if (!ov) return
    // 0090:重置扣的是**重置次数**不是经费。没次数时直接告知,不引导充值(经费买不到重置)。
    if (!ov.reset_passes || ov.reset_passes <= 0) {
      wx.showModal({
        title: '重置次数已用完',
        content: '你已没有可用的重置次数。可等待本周期额度自动重置,或升级会员获得更高额度。',
        showCancel: false,
      })
      return
    }
    wx.showModal({
      title: '重置本周期额度',
      content: '将使用 1 次重置次数立即恢复本周期额度(剩余 ' + ov.reset_passes + ' 次),确定?',
      success: async (r) => {
        if (!r.confirm) return
        try {
          await resetQuota()
          wx.showToast({ title: '已重置', icon: 'success' })
          this.loadProfile()
        } catch (e) {
          toastError(e, '重置失败')
        }
      },
    })
  },

  soon() {
    wx.showToast({ title: '即将上线', icon: 'none' })
  },
})
