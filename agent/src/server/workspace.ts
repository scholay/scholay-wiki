// 会话 cwd 文件操作(详细设计 §5.2 workspace 行)。镜像 agent.Client 的
// WorkspaceFile/WorkspaceTree/PushedFile 契约。**字节级一致是硬要求**:prism 固化经
// ReadWorkspaceFileFull(?full=1)回读全文,截断会静默腐蚀 DB。全部限 cwd 内。

import { resolve, relative, basename, extname, join } from "node:path";
import { readFile, writeFile, mkdir, readdir, stat, lstat, rm } from "node:fs/promises";
import { confinePath } from "../sandbox/confine.ts";

const ONE_MB = 1024 * 1024;
const TEXT_PREVIEW_CAP = ONE_MB; // 默认预览上限(?full=1 绕过)
const RAW_CAP = 20 * ONE_MB;
const IMG_CAP = 5 * ONE_MB;

// ── 会话 cwd 入湖配额(2026-07 文件上传调研落地)─────────────────────────────
// 此前所有入湖路径(upload / 引用文献 PushSessionFile / peerreview 推稿 / prism PutWorkspaceFile)
// 在 agent 端**零校验**,会话磁盘跨请求无界累积(性能审计 P0「磁盘无界」的主敞口之一)。
// 这里是全部写入的咽喉点,统一三道帽;业界参照:Anthropic code-execution 5GiB/30d、
// Daytona 3GiB/沙箱、OpenAI CI 512MB/文件。单文件 64MB > 全链路最大合法推送(50MB 审稿稿件)。
// env 可调;设 0 = 关闭对应帽(逃生门,不作为常态)。
// envNum 防 NaN(审查发现):env 误配非数字时 Number() 得 NaN,三道帽的比较恒 false = 静默全关。
import { envNum } from "./sessions.ts";
const PUSH_FILE_MAX_BYTES = envNum("EXECUTOR_PUSH_FILE_MAX_BYTES", 64 * ONE_MB);
const SESSION_DISK_MAX_BYTES = envNum("EXECUTOR_SESSION_DISK_MAX_BYTES", 1024 * ONE_MB);
const SESSION_FILE_MAX_COUNT = envNum("EXECUTOR_SESSION_FILE_MAX_COUNT", 2000);

/** 配额拒绝(咽喉点抛出;http 层据 code 映射 413,backend 再译成用户文案)。 */
export class QuotaError extends Error {
  readonly code = "quota_exceeded";
}

// dirUsage:递归统计目录字节数与文件数。lstat 不跟符号链接(boltslides 的 node_modules 软链
// 指向 /opt 只读预装,不计入会话占用);目录本身不计。会话目录量级(≤数千条)下毫秒级。
async function dirUsage(dir: string): Promise<{ bytes: number; files: number }> {
  let bytes = 0;
  let files = 0;
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return { bytes, files };
  }
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isSymbolicLink()) {
      files++; // 链接本身算一个条目,不深入
      continue;
    }
    if (e.isDirectory()) {
      const sub = await dirUsage(full);
      bytes += sub.bytes;
      files += sub.files;
      continue;
    }
    try {
      const s = await lstat(full);
      bytes += s.size;
      files++;
    } catch {
      /* racing delete — skip */
    }
  }
  return { bytes, files };
}

/**
 * assertSessionQuota:写入前校验单文件 + 会话累计(大小/文件数)三道帽,超限抛 QuotaError。
 * targetAbs = 即将写入的目标绝对路径:目标已存在(覆盖写,如 prism 每轮重物化)时扣减其
 * 现有占用,避免「到帽后连同名覆盖都被拒」的死锁。
 */
export async function assertSessionQuota(workDir: string, incomingBytes: number, targetAbs?: string): Promise<void> {
  if (PUSH_FILE_MAX_BYTES > 0 && incomingBytes > PUSH_FILE_MAX_BYTES) {
    throw new QuotaError(
      `file too large: ${Math.round(incomingBytes / ONE_MB)}MB > ${Math.round(PUSH_FILE_MAX_BYTES / ONE_MB)}MB limit`,
    );
  }
  if (SESSION_DISK_MAX_BYTES <= 0 && SESSION_FILE_MAX_COUNT <= 0) return;
  const usage = await dirUsage(workDir);
  if (targetAbs) {
    try {
      const s = await lstat(targetAbs);
      usage.bytes -= s.size;
      usage.files -= 1;
    } catch {
      /* 目标不存在 = 纯新增 */
    }
  }
  if (SESSION_DISK_MAX_BYTES > 0 && usage.bytes + incomingBytes > SESSION_DISK_MAX_BYTES) {
    throw new QuotaError(
      `session disk quota exceeded: ${Math.round((usage.bytes + incomingBytes) / ONE_MB)}MB > ${Math.round(SESSION_DISK_MAX_BYTES / ONE_MB)}MB limit`,
    );
  }
  if (SESSION_FILE_MAX_COUNT > 0 && usage.files >= SESSION_FILE_MAX_COUNT) {
    throw new QuotaError(`session file-count quota exceeded: ${usage.files} >= ${SESSION_FILE_MAX_COUNT} limit`);
  }
}

const IMG_MIME: Record<string, string> = {
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".gif": "image/gif", ".webp": "image/webp", ".svg": "image/svg+xml", ".bmp": "image/bmp",
};
const TEXT_MIME: Record<string, string> = {
  ".txt": "text/plain", ".md": "text/markdown", ".tex": "text/x-tex", ".bib": "text/x-bibtex",
  ".json": "application/json", ".js": "text/javascript", ".ts": "text/typescript",
  ".py": "text/x-python", ".csv": "text/csv", ".log": "text/plain", ".html": "text/html",
  ".css": "text/css", ".xml": "application/xml", ".yaml": "text/yaml", ".yml": "text/yaml",
  ".sh": "text/x-shellscript", ".cls": "text/x-tex", ".sty": "text/x-tex",
};

// 路径限制走 sandbox/confine.ts 的 realpath 版(C5:防符号链接逃逸)。

function mimeOf(p: string): string {
  const e = extname(p).toLowerCase();
  return IMG_MIME[e] || TEXT_MIME[e] || "application/octet-stream";
}

function looksText(buf: Buffer): boolean {
  const n = Math.min(buf.length, 8192);
  for (let i = 0; i < n; i++) if (buf[i] === 0) return false; // NUL → 二进制
  return true;
}

export interface WorkspaceFileResp {
  state: string; // ok | binary | too_large | missing | error
  path: string;
  previewType?: string; // text | image
  content?: string;
  truncated?: boolean;
  dataUrl?: string;
  bytesBase64?: string;
  mimeType?: string;
  size?: number;
  error?: string;
}

export async function readWorkspaceFile(
  workDir: string,
  relPath: string,
  opts: { full?: boolean; raw?: boolean },
): Promise<WorkspaceFileResp> {
  let abs: string;
  try {
    abs = await confinePath(workDir, relPath);
  } catch {
    return { state: "error", path: relPath, error: "path escapes workDir" };
  }
  let st;
  try {
    st = await stat(abs);
  } catch {
    return { state: "missing", path: relPath };
  }
  if (st.isDirectory()) return { state: "error", path: relPath, error: "is a directory" };
  const size = st.size;
  const mime = mimeOf(relPath);

  if (opts.raw) {
    if (size > RAW_CAP) return { state: "too_large", path: relPath, mimeType: mime, size };
    const buf = await readFile(abs);
    return { state: "ok", path: relPath, mimeType: mime, size, bytesBase64: buf.toString("base64") };
  }

  if (mime.startsWith("image/")) {
    if (size > IMG_CAP) return { state: "too_large", path: relPath, mimeType: mime, size };
    const buf = await readFile(abs);
    return { state: "ok", path: relPath, previewType: "image", mimeType: mime, size, dataUrl: `data:${mime};base64,${buf.toString("base64")}` };
  }

  // 文本:?full=1 读全文不截断(prism 固化);否则 1MB 预览 + truncated 标记。
  if (!opts.full && size > RAW_CAP) return { state: "too_large", path: relPath, mimeType: mime, size };
  const buf = await readFile(abs);
  if (!looksText(buf)) return { state: "binary", path: relPath, mimeType: mime, size };
  let content = buf.toString("utf8");
  let truncated = false;
  if (!opts.full && content.length > TEXT_PREVIEW_CAP) {
    content = content.slice(0, TEXT_PREVIEW_CAP);
    truncated = true;
  }
  return { state: "ok", path: relPath, previewType: "text", content, truncated, mimeType: mime, size };
}

export interface WorkspaceTreeResp {
  state: string;
  path: string;
  entries?: Array<{ name: string; path: string; isDirectory: boolean; size: number; mtimeMs: number }>;
  error?: string;
}

export async function listWorkspaceTree(workDir: string, relDir: string): Promise<WorkspaceTreeResp> {
  let abs: string;
  try {
    abs = await confinePath(workDir, relDir || ".");
  } catch {
    return { state: "error", path: relDir, error: "path escapes workDir" };
  }
  let entries;
  try {
    entries = await readdir(abs, { withFileTypes: true });
  } catch {
    return { state: "missing", path: relDir, entries: [] };
  }
  const out = [];
  for (const e of entries) {
    if (e.name === "node_modules" || e.name === ".git") continue;
    const full = resolve(abs, e.name);
    let s;
    try {
      s = await stat(full);
    } catch {
      continue;
    }
    out.push({
      name: e.name,
      path: relative(workDir, full),
      isDirectory: e.isDirectory(),
      size: s.size,
      mtimeMs: Math.floor(s.mtimeMs), // Go 端 int64:Bun 的 mtimeMs 是带亚毫秒小数的 float,必须取整
    });
  }
  return { state: "ok", path: relDir, entries: out };
}

export async function putWorkspaceFile(workDir: string, relPath: string, bytes: Uint8Array): Promise<void> {
  const abs = await confinePath(workDir, relPath, true);
  await assertSessionQuota(workDir, bytes.byteLength, abs);
  await mkdir(resolve(abs, ".."), { recursive: true });
  await writeFile(abs, bytes);
}

export async function deleteWorkspaceFile(workDir: string, relPath: string): Promise<boolean> {
  const abs = await confinePath(workDir, relPath, true);
  try {
    await rm(abs, { recursive: true, force: true });
    return true;
  } catch {
    return false;
  }
}

// pushSessionFile:multipart 上传(字段名 "file")→ 落 cwd → {path,name,size}。
// 文件名允许携带**至多一层**安全子目录段(如 "uploads/<uuid>-a.pdf",prism 用它把附件与
// LaTeX 工作区隔开;2026-07-14 输入框统一遗留补齐):段名白名单 [A-Za-z0-9_-]{1,32},
// 其余形态一律取 basename(防 ../ 穿越;confinePath 再兜一层符号链接逃逸)。
export async function pushSessionFile(workDir: string, file: File): Promise<{ path: string; name: string; size: number }> {
  const rawName = file.name || "upload.bin";
  const m = rawName.match(/^([A-Za-z0-9_-]{1,32})\/([^/]+)$/);
  const sub = m ? m[1] : "";
  const name = basename(m ? m[2] : rawName);
  await mkdir(sub ? join(workDir, sub) : workDir, { recursive: true });
  const abs = await confinePath(workDir, sub ? `${sub}/${name}` : name, true);
  await assertSessionQuota(workDir, file.size, abs); // 写入前校验(单文件 + 会话累计),超限抛 QuotaError
  const buf = Buffer.from(await file.arrayBuffer());
  await writeFile(abs, buf);
  return { path: abs, name, size: buf.length };
}
