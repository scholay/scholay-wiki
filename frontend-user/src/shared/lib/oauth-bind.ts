/**
 * OAuth 绑定流程的 sessionStorage 键名 —— auth feature 在 callback 页面读,
 * settings feature 在发起绑定时写。两边共用同一组键名,所以放在 shared/lib。
 *
 * 为什么用 sessionStorage 而非 localStorage:
 *   仅当前标签页生效,关页 / 跨页都清掉,避免跨标签的 stale state 误触发 bind。
 *
 * 为什么不能没标记:
 *   callback 页如果走默认登录分支,后端不会感知到"当前用户",会把第三方账号
 *   绑到新建 user 上,把当前用户挤出原账号(P0 安全 bug)。
 */
export const OAUTH_MODE_KEY = 'oauth_mode';
export const OAUTH_BIND_PROVIDER_KEY = 'oauth_bind_provider';
export const OAUTH_BIND_RETURN_KEY = 'oauth_bind_return_to';
