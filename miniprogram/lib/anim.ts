// 弹层关闭动画辅助:wx:if 直接卸载会丢掉关闭动画,故先置 closing 触发反向滑出,
// 待动画结束(delay≈动画时长)再真正卸载。配 app.wxss 的 .mask-anim/.sheet-anim/.drawer-anim.closing。
type PageLike = { setData: (d: Record<string, unknown>) => void }

export function closeAnimated(page: PageLike, showKey: string, closingKey: string, delay = 220): void {
  page.setData({ [closingKey]: true })
  setTimeout(() => page.setData({ [showKey]: false, [closingKey]: false }), delay)
}
