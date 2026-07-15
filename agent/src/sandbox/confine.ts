// 路径限制(C5 修复):纯词法 resolve()+relative() 会被符号链接绕过(workDir 内 `ln -s /etc x`
// 后读/写穿透宿主)。这里用 realpath 把「最深的已存在祖先」canonicalize 后断言落在 canonical workDir 内;
// 写操作再对末段 lstat 拒符号链接(等价 O_NOFOLLOW)。沙箱自探失败(非生产裸跑)时这是唯一防线。

import { resolve, relative, isAbsolute, dirname, basename } from "node:path";
import { realpath, lstat } from "node:fs/promises";

async function realpathOrNull(p: string): Promise<string | null> {
  try {
    return await realpath(p);
  } catch {
    return null;
  }
}

function within(root: string, p: string): boolean {
  if (p === root) return true;
  const rel = relative(root, p);
  return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
}

/**
 * 把 rel 解析成 workDir 内的绝对路径,符号链接安全。越界抛错。
 * forWrite=true 时额外拒「末段本身是符号链接」(防写穿透既有 symlink)。
 */
export async function confinePath(workDir: string, rel: string, forWrite = false): Promise<string> {
  const canonRoot = (await realpathOrNull(workDir)) ?? resolve(workDir);
  const abs = isAbsolute(rel) ? rel : resolve(canonRoot, rel);

  // 词法预检(快速拒绝明显的 ..)
  if (!within(canonRoot, abs)) throw new Error("path escapes workDir");

  // 找最深的已存在祖先(或目标本身),realpath 后断言仍在 canonical root 内 —— 抓符号链接逃逸。
  let cur = abs;
  for (;;) {
    const rp = await realpathOrNull(cur);
    if (rp) {
      if (!within(canonRoot, rp)) throw new Error("path escapes workDir (symlink)");
      break;
    }
    const parent = dirname(cur);
    if (parent === cur) break; // 到根仍不存在 → 词法预检已保证安全
    cur = parent;
  }

  // 写/建:末段若是符号链接,拒绝(不允许写穿透 symlink)。
  if (forWrite) {
    const st = await lstat(abs).catch(() => null);
    if (st && st.isSymbolicLink()) throw new Error("refusing to operate through symlink");
  }
  return abs;
}

// safeSessionDir:把 sessionId 解析成 SESSIONS_ROOT 下的子目录,断言不逃逸(H4 纵深防御)。
export function safeSessionDir(root: string, sessionId: string): string {
  const dir = resolve(root, sessionId);
  if (!within(resolve(root), dir)) throw new Error("sessionId escapes SESSIONS_ROOT");
  return dir;
}

// validSessionId:严格会话 id 校验(H4)。拒含 / . % 等,挡 `..%2f` 之类 URL 穿越。
export function validSessionId(sid: string): boolean {
  return /^[A-Za-z0-9_-]{1,128}$/.test(sid);
}
