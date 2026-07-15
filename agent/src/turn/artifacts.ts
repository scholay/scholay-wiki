// 成果交付「产物即带外声明」(设计:docs/research/artifact-delivery-2026-07/DESIGN.md)。
//
// 执行器不再让前端「扫 ./out/ + 信正文 + 匹配工具名」,而是**自己从文件系统结果检测产物**:
// turnLoop 开头 snapshot ./out/,结尾 diff,新增/变更条目作为 `artifact` 帧带外声明。
// 工具无关 —— 覆盖 Write/Edit/ExportDocument/Bash/Python 全部(检测的是文件,不是工具名)。
// 一个 turn 的产物 = 该 turn 期间 ./out/ 的增量。

import { readdir, stat } from "node:fs/promises";
import { join, extname } from "node:path";
import type { EventSink } from "./types.ts";

const OUT_DIR = "out";

// 产物 mime(比 workspace.mimeOf 更全:docx/xlsx/pptx/pdf/svg/zip/csv/md…)。目录 → zip。
const ARTIFACT_MIME: Record<string, string> = {
  ".md": "text/markdown", ".markdown": "text/markdown", ".txt": "text/plain",
  ".csv": "text/csv", ".json": "application/json", ".html": "text/html", ".htm": "text/html",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".gif": "image/gif", ".webp": "image/webp", ".bmp": "image/bmp",
  ".pdf": "application/pdf",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".zip": "application/zip",
};
function mimeFor(name: string): string {
  return ARTIFACT_MIME[extname(name).toLowerCase()] || "application/octet-stream";
}

interface SnapEntry { size: number; mtimeMs: number; kind: "file" | "dir" }
export type OutSnapshot = Map<string, SnapEntry>;

/** 递归聚合一个目录的总 size + 最新 mtime(目录内任何文件变 → 签名变 → 视作产物更新)。 */
async function dirSig(dir: string): Promise<{ size: number; mtimeMs: number }> {
  let size = 0;
  let mtimeMs = 0;
  const walk = async (d: string) => {
    let ents;
    try {
      ents = await readdir(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of ents) {
      const p = join(d, e.name);
      if (e.isDirectory()) await walk(p);
      else if (e.isFile()) {
        try {
          const st = await stat(p);
          size += st.size;
          mtimeMs = Math.max(mtimeMs, st.mtimeMs);
        } catch {
          /* skip */
        }
      }
    }
  };
  await walk(dir);
  return { size, mtimeMs };
}

/** snapshotOut:列 ./out/ 顶层(文件 + 一级子目录聚合;与产物模型一致:一文件 / 一目录=一个 zip)。 */
export async function snapshotOut(workDir: string): Promise<OutSnapshot> {
  const snap: OutSnapshot = new Map();
  const outAbs = join(workDir, OUT_DIR);
  let entries;
  try {
    entries = await readdir(outAbs, { withFileTypes: true });
  } catch {
    return snap; // ./out/ 不存在 → 空快照(smart_search 等无产物 feature 自然零帧)
  }
  for (const e of entries) {
    if (e.name.startsWith(".")) continue; // 隐藏/草稿不交付
    const rel = `${OUT_DIR}/${e.name}`;
    if (e.isDirectory()) {
      const agg = await dirSig(join(outAbs, e.name));
      snap.set(rel, { ...agg, kind: "dir" });
    } else if (e.isFile()) {
      try {
        const st = await stat(join(outAbs, e.name));
        snap.set(rel, { size: st.size, mtimeMs: st.mtimeMs, kind: "file" });
      } catch {
        /* skip */
      }
    }
  }
  return snap;
}

export interface ArtifactDecl {
  name: string; // 顶层名(文件名 或 目录名)
  path: string; // 相对 cwd 的路径(out/<name>)
  kind: "file" | "dir";
  mime: string;
  size: number;
}

/** diff 出「相对基线新增/变更」的产物声明。 */
export function diffOut(baseline: OutSnapshot, current: OutSnapshot): ArtifactDecl[] {
  const decls: ArtifactDecl[] = [];
  for (const [rel, cur] of current) {
    const prev = baseline.get(rel);
    if (prev && prev.size === cur.size && prev.mtimeMs === cur.mtimeMs) continue; // 未变
    const name = rel.slice(OUT_DIR.length + 1);
    decls.push({
      name,
      path: rel,
      kind: cur.kind,
      mime: cur.kind === "dir" ? "application/zip" : mimeFor(name),
      size: cur.size,
    });
  }
  return decls;
}

/** emitArtifacts:diff ./out/ vs 基线,把新增/变更条目作为 `artifact` 帧发出(在 message_complete 之前)。 */
export async function emitArtifacts(workDir: string, baseline: OutSnapshot, sink: EventSink): Promise<void> {
  const current = await snapshotOut(workDir);
  const decls = diffOut(baseline, current);
  for (const d of decls) {
    sink.frame({ type: "artifact", name: d.name, path: d.path, kind: d.kind, mime: d.mime, size: d.size });
  }
}
