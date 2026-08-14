/** PC 弹窗、移动底部弹窗与移动整页共用的纯文案；不得反向引用任何表单 UI。 */
export const AUTH_TITLES = {
  login: { title: '欢迎回来', desc: '继续你的学术之旅' },
  register: { title: '创建账号', desc: '免费开始使用 Scholay' },
  forgot: { title: '找回密码', desc: '通过验证码重置你的密码' },
  'wechat-qr': {
    title: '使用微信扫一扫',
    desc: '打开微信,扫描下方二维码完成登录',
  },
} as const;
