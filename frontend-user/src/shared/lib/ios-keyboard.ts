/**
 * 移动端「软键盘」助焦工具 —— 解决 iOS Safari 的限制:
 * **只有在「用户手势的同步调用栈里」调用 input.focus(),才会弹出软键盘。**
 *
 * 典型场景:点一个按钮 → 打开浮层 / 展开一个输入框(输入框是「点完之后」才挂载的)→ 在
 * effect / requestAnimationFrame / 状态更新后再 focus() —— 此时已脱离手势栈,iOS 不弹键盘。
 *
 * 解法(focus relay):在「按钮 onClick 的同步阶段」先 focus 一个常驻的隐形输入(primer),
 * 把键盘「在手势里」唤起;随后真正的输入框挂载并 focus,焦点在两个输入间转移 —— iOS 不会因
 * 「输入框之间转移焦点」而收起键盘,于是键盘保持打开,最终停在真正的输入框上。
 *
 * 用法:在「会打开/展开输入」的按钮 onClick 里**最先**同步调用 primeMobileKeyboard(),
 * 再去 setState / openOverlay / 导航。真正的输入框照常 autoFocus 或 effect 里 focus 即可。
 *
 * 仅在触摸设备生效(桌面有硬件键盘,无此问题,直接 no-op 避免无谓的焦点转移)。
 */
let primer: HTMLInputElement | null = null;

function isTouchDevice(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(pointer: coarse)').matches || 'ontouchstart' in window;
}

export function primeMobileKeyboard(): void {
  if (typeof document === 'undefined' || !isTouchDevice()) return;
  if (!primer) {
    primer = document.createElement('input');
    primer.type = 'text';
    primer.setAttribute('aria-hidden', 'true');
    primer.tabIndex = -1;
    // 可聚焦但不可见:固定 1px 透明、压到底层不挡点击;font-size 16px 防 iOS 聚焦时缩放页面。
    primer.style.cssText =
      'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;border:0;padding:0;margin:0;font-size:16px;z-index:-1;background:transparent;color:transparent;';
    document.body.appendChild(primer);
  }
  const p = primer;
  p.focus();
  // 自愈兜底:若 ~400ms 内真正的输入框没接管焦点(下游 focus 失败 / 竞态),把停在隐形 primer 上的
  // 焦点收回 —— 否则会出现「软键盘开着、却没有可见光标、打字进不去」的卡死态。只在焦点仍停在 primer
  // 时才收(绝不抢已正常转移到真实输入框的焦点)。正常路径几十毫秒就转移,400ms 留足余量。
  window.setTimeout(() => {
    if (document.activeElement === p) p.blur();
  }, 400);
}
