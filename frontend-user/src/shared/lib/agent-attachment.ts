/**
 * agent 输入框附件的统一取回 URL(后端迁移 0112 耐久化)。
 *
 * 背景:附件字节此前只在 agent 会话 cwd 里,取回要靠**每个 feature 各自一条**
 * `/user/<feature>/session/file?session_id=..&path=..` 代理。那套有三个已知洞:
 *   ① stat_lab / sci_draw / boltslides 的那条后端**从没注册过** ⇒ 传了图必裂;
 *   ② claw / smart_search 只发 basename,而跨对话复用的附件落在 uploads/ ⇒ 必 404;
 *   ③ 只服务光栅图,PDF / docx / csv 用户完全取不回来。
 *
 * 现在字节在 MinIO,后端多了一条 feature 无关的 `GET /user/attachment/:uuid`,
 * 按落盘名的 UUID 前缀反查 —— 而那个前缀早就写在历史 transcript 的 @"path" 里,
 * 所以**历史会话不需要任何迁移**就能用上。
 *
 * ⚠️ 0112 之前上传的附件在后端查不到行 → 该端点回 404,调用方必须回落到老的
 * per-feature 代理(那三条路由保留不删)。所以这里返回 null 而不是抛错。
 */

/** agent 落盘名 `<uuid>-<原名>` 的 UUID 前缀。与 `agent-history.ts` 的 STORED_UUID_PREFIX
 *  和后端 `agentattach/store.go` 的 storedUUIDRe 是同一条规则的三处镜像,改一处要同步三处。 */
const STORED_UUID_PREFIX = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})-/i;

/**
 * 从附件路径(agent 容器内绝对路径,或落盘名)剥出附件身份 UUID。
 * 剥不出 → null(用户自己打的 @"..." 文本 / 存量非标路径)。
 */
export function attachmentUuidFromPath(absPath: string | null | undefined): string | null {
  if (!absPath) return null;
  const base = absPath.split('/').pop() ?? absPath;
  return STORED_UUID_PREFIX.exec(base)?.[1]?.toLowerCase() ?? null;
}

/**
 * 统一取回 URL;拿不到 UUID 时返回 null,由调用方回落各 feature 的老取图代理。
 * 走 scholay_token cookie 鉴权(`<img src>` 发不了 Bearer),与老代理同款。
 *
 * 🔴 `legacyUrl` 不是可选的锦上添花 —— **不传它就是一次线上回归**。
 * 落盘名 `<uuid>-<原名>` 的格式一直如此,0112 **之前**上传的附件同样剥得出 UUID,
 * 前端在客户端**分辨不出**这个 uuid 后端有没有行。不带 fb 时这些存量附件会指向新端点
 * → 后端查不到行 → 404 → 所有历史会话里的缩略图集体裂开(改造前它们是好的)。
 * 唯一知道答案的是后端,所以把老代理 URL 放进 `?fb=`:查得到行就直接从 MinIO 出字节,
 * 查不到就 302 交还给老代理。`<img>` / fetch / lightbox 都会自动跟随 302。
 * 后端只接受 `/api/v1/user/` 前缀 + 含 `/session/file` 形状的目标(见 serve.go redirectLegacy)。
 */
export function attachmentUrl(
  absPath: string | null | undefined,
  legacyUrl?: string,
): string | null {
  const uuid = attachmentUuidFromPath(absPath);
  if (!uuid) return null;
  const apiBase = import.meta.env.VITE_API_BASE_URL || '/api/v1';
  const base = `${apiBase}/user/attachment/${uuid}`;
  if (!legacyUrl) return base;
  return `${base}?fb=${encodeURIComponent(legacyUrl)}`;
}
