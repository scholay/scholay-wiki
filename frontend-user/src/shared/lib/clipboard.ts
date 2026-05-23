/**
 * 跨浏览器复制到剪贴板。
 *
 * 为什么要包一层而不直接 `navigator.clipboard.writeText`?
 *   - `navigator.clipboard` 在**非安全上下文**(HTTP / 部分 file:// / 部分内嵌 iframe)
 *     里直接是 `undefined`,裸调会抛 `Cannot read properties of undefined`。
 *   - 一些老 Safari / 内嵌 webview / 企业浏览器加固版也禁用该 API。
 *
 * 策略:
 *   1) 优先 `navigator.clipboard.writeText`(异步,权限明确)
 *   2) 失败 / API 不存在 → 兜底用 `document.execCommand('copy')` + 临时 textarea
 *      (已废弃但 99% 浏览器仍然支持,无权限弹窗)
 *
 * 返回布尔值,调用方据此 toast 成功 / 失败。**不抛异常**。
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  // Path 1: 现代浏览器在安全上下文里的标准 API
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // 落到 fallback —— 用户拒绝授权 / 焦点丢失 / 某些 iframe 限制
    }
  }

  // Path 2: textarea + execCommand 兜底
  if (typeof document === 'undefined') return false;
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    // 不影响布局 / 不被屏幕阅读器朗读
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '0';
    ta.style.left = '-99999px';
    ta.style.opacity = '0';
    ta.style.pointerEvents = 'none';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
