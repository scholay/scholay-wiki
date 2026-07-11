// 复制并提示:收口 wx.setClipboardData + wx.showToast 的重复模式(见体检 R4)。
export function copyText(data: string, toast = '已复制'): void {
  wx.setClipboardData({
    data,
    success: () => wx.showToast({ title: toast, icon: 'none' }),
  })
}
