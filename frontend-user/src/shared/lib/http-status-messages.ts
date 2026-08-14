/**
 * HTTP 状态码 → 中文兜底文案(单一真源)。
 *
 * 🔴 为什么需要这一层:网关层(nginx / 宿主机反代)的拒绝返回的是 **text/html 错误页**,
 * 不是我们的 JSON 信封 ⇒ `data.message` 恒 undefined。没有它的话:
 *   - axios 侧(`http.ts` 的 toApiError)退化成英文串 "Request failed with status code 413"
 *   - SSE 侧(`sse-post.ts`,刻意绕过 axios)退化成裸的「请求失败 (413)」
 * 413 / 408 / 504 是文件上传最容易撞上的三个网关码(2026-08-07 文献集上传排查)。
 *
 * 单独成文件而不是塞进 http.ts:`sse-post.ts` 存在的理由就是"不走 axios",
 * 让它 import 一个会在模块加载时 `axios.create()` 的文件是反向依赖。
 *
 * ⚠️ **只在后端没给 message 时用**。后端的业务文案永远优先 —— 这里的文案是通用的,
 * 覆盖不了「文献集已达上限」这类只有后端知道的原因。
 */

/** 返回 null 表示该状态码没有专属文案,调用方继续往下兜底 */
export function statusFallbackMessage(status: number): string | null {
  switch (status) {
    case 408:
      return '上传超时,网络较慢时请换个网络或先压缩文件';
    case 413:
      return '文件过大,请压缩后重试';
    case 429:
      return '操作过于频繁,请稍后再试';
    case 504:
      return '服务器处理超时,请稍后重试';
    default:
      return status >= 500 ? '服务器繁忙,请稍后重试' : null;
  }
}
