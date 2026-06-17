/**
 * 轻量触感反馈 —— 仅在支持 Vibration API 的设备(基本是 Android)上震动一下;
 * 桌面 / iOS Safari 上 navigator.vibrate 不存在 → 自动 no-op,调用方无需判断平台。
 */
export function haptic(pattern: number | number[] = 8): void {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* 某些浏览器在非用户手势上下文会抛错,忽略即可 */
  }
}
