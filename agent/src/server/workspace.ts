// 会话 cwd 文件操作(详细设计 §5.2 workspace 行)。镜像 agent.Client 的
// WorkspaceFile/WorkspaceTree/PushedFile 契约。**字节级一致是硬要求**:prism 固化经
// ReadWorkspaceFileFull(?full=1)回读全文,截断会静默腐蚀 DB。全部限 cwd 内。

import { resolve, relative, basename, extname, join } from "node:path";
import { readFile, writeFile, mkdir, readdir, stat, rm } from "node:fs/promises";
import { confinePath } from "../sandbox/confine.ts";

const ONE_MB = 1024 * 1024;
const TEXT_PREVIEW_CAP = ONE_MB; // 默认预览上限(?full=1 绕过)
const RAW_CAP = 20 * ONE_MB;
const IMG_CAP = 5 * ONE_MB;

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
  const buf = Buffer.from(await file.arrayBuffer());
  await writeFile(abs, buf);
  return { path: abs, name, size: buf.length };
}
