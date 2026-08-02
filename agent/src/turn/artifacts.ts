// 成果交付「产物即带外声明」(设计:docs/research/artifact-delivery-2026-07/DESIGN.md)。
//
// 执行器不再让前端「扫 ./out/ + 信正文 + 匹配工具名」,而是**自己从文件系统结果检测产物**:
// turnLoop 开头 snapshot ./out/,结尾 diff,新增/变更条目作为 `artifact` 帧带外声明。
// 工具无关 —— 覆盖 Write/Edit/ExportDocument/Bash/Python 全部(检测的是文件,不是工具名)。
// 一个 turn 的产物 = 该 turn 期间 ./out/ 的增量 + 会话根目录可交付扩展名文件的增量
// (2026-07 线上审计扩面:越界写入 slides/index.html 等不再丢失)。越界条目在上抛前会被
// **复制进 ./out/**(relocateStrays)—— backend 产物链路是 out/ 单一真源,详见该函数注释。

import { readdir, stat, copyFile, mkdir, writeFile } from "node:fs/promises";
import { join, extname, basename } from "node:path";
import { log } from "../obs/log.ts";
import { resolveFileForDelivery } from "../evidence/deliver.ts";
import { EVIDENCE_DIR } from "../evidence/paths.ts";
import type { EventSink } from "./types.ts";

const OUT_DIR = "out";

// 2026-07 线上审计:只认 ./out/ 让越界写入的交付物永远丢失(线上 26 条:slides/index.html、
// work/xxx.md、home/bun/... 假目录)。diff 面扩到「会话根目录下本轮新增/变更的可交付扩展名文件」,
// 沿用同一 snapshot/diff 机制;根扫描仅收**文件**、深度/数量有界防失控(模板/依赖树不扫)。
const DELIVERABLE_EXTS = new Set([".md", ".docx", ".xlsx", ".pptx", ".pdf", ".csv", ".html", ".svg"]);
// 非交付目录:out 由专列逻辑覆盖(目录=zip 语义);uploads/references 是附件与引用物料;
// node_modules/dist* / src/public 是 boltslides 模板依赖与构建产物(BuildDeck 的交付走 out/)。
const ROOT_SKIP_DIRS = new Set([OUT_DIR, "uploads", "references", "node_modules", "dist", "dist-single", "src", "public"]);
// 2026-07 审查 [8]:整棵跳过原先只在 depth===0 生效,`data/venv/**`、`repo/target/**` 这类
// 嵌套重目录会被完整走一遍,把 400 个文件预算按 readdir 顺序先到先得地吃光(真交付物反而进不了
// 快照,且无任何日志)。改成**按目录名在任意层**跳过,并补齐常见依赖/构建/缓存目录名。
// OUT_DIR 不在内:out/ 只在根层由专列逻辑覆盖,嵌套的 `foo/out/bar.md` 仍是要上抛的越界交付物。
const DEEP_SKIP_DIRS = new Set([
  ...[...ROOT_SKIP_DIRS].filter((d) => d !== OUT_DIR),
  "__pycache__", "venv", ".venv", "env", "site-packages", "target", "build", "vendor", "tmp", "cache", ".cache",
]);
// 会话根目录的工作文件(prism 主稿/引用库/术语表、boltslides 幻灯源码、模板自述):非本轮交付物。
// 只按**根目录相对路径**排除 —— 子目录同名文件(如 slides/index.html)仍是要上抛的越界交付物。
const ROOT_SKIP_FILES = new Set(["document.md", "references.bib", "terminology.md", "index.html", "README.md", "CONTRIBUTING.md"]);
const ROOT_SCAN_MAX_DEPTH = 6;
const ROOT_SCAN_MAX_FILES = 400;
// 2026-07 审查 [8]:目录数预算 —— 冷 FS / overlayfs 上「文件预算没吃满但目录极多」的长尾同样要收敛。
const ROOT_SCAN_MAX_DIRS = 2000;
// 2026-07 审查 [8]:一轮最多发多少张产物卡。400 帧会同时放大成 400 行 journal + 400 次 copyFile +
// 下次收割 400 个 MinIO 对象(harvest 是 upsert-only 永不回收),且把对话糊满。
// 截断在 relocateStrays **之前**做,复制次数一并受限。
const ARTIFACT_MAX_FRAMES = 20;

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

/** snapshotOut:列 ./out/ 顶层(文件 + 一级子目录聚合;与产物模型一致:一文件 / 一目录=一个 zip),
 *  外加会话根目录的可交付扩展名文件(2026-07 线上审计:捕获越界写入的交付物)。 */
export async function snapshotOut(workDir: string): Promise<OutSnapshot> {
  const snap: OutSnapshot = new Map();
  const outAbs = join(workDir, OUT_DIR);
  let entries;
  try {
    entries = await readdir(outAbs, { withFileTypes: true });
  } catch {
    entries = null; // ./out/ 不存在 → 该面为空(smart_search 等无产物 feature 自然零帧)
  }
  for (const e of entries ?? []) {
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
  // 2026-07 线上审计:根目录扫描面(越界交付物)。out/ 已在上方覆盖,DEEP_SKIP_DIRS 排除。
  await scanRootDeliverables(workDir, snap);
  return snap;
}

/** 递归收集会话根目录下可交付扩展名的文件进快照(key = 相对 workDir 路径)。有界:深度/文件数/目录数三上限。 */
async function scanRootDeliverables(workDir: string, snap: OutSnapshot): Promise<void> {
  let fileBudget = ROOT_SCAN_MAX_FILES;
  let dirBudget = ROOT_SCAN_MAX_DIRS;
  const walk = async (dir: string, rel: string, depth: number): Promise<void> => {
    if (depth > ROOT_SCAN_MAX_DEPTH || fileBudget <= 0 || dirBudget <= 0) return;
    dirBudget--;
    let ents;
    try {
      ents = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of ents) {
      if (fileBudget <= 0 || dirBudget <= 0) return;
      if (e.name.startsWith(".")) continue; // 隐藏目录/文件(.git/.skills 等)不扫
      const childRel = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) {
        if (depth === 0 && e.name === OUT_DIR) continue; // out/ 由 snapshotOut 专列逻辑覆盖
        if (DEEP_SKIP_DIRS.has(e.name)) continue; // 2026-07 审查 [8]:非交付/依赖/构建目录任意层整棵跳过
        await walk(join(dir, e.name), childRel, depth + 1);
      } else if (e.isFile()) {
        if (!DELIVERABLE_EXTS.has(extname(e.name).toLowerCase())) continue;
        if (depth === 0 && ROOT_SKIP_FILES.has(e.name)) continue; // 根目录工作文件不上抛
        try {
          const st = await stat(join(dir, e.name));
          snap.set(childRel, { size: st.size, mtimeMs: st.mtimeMs, kind: "file" });
          fileBudget--;
        } catch {
          /* skip */
        }
      }
    }
  };
  await walk(workDir, "", 0);
  // 2026-07 审查 [8]:预算耗尽 = 快照按 readdir 顺序被截断,真交付物可能没进来 —— 原先完全静默。
  if (fileBudget <= 0 || dirBudget <= 0) {
    log.warn("artifact root scan budget exhausted", {
      workDir,
      maxFiles: ROOT_SCAN_MAX_FILES,
      maxDirs: ROOT_SCAN_MAX_DIRS,
      hitFileCap: fileBudget <= 0,
      hitDirCap: dirBudget <= 0,
    });
  }
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
    // out/ 顶层沿用原语义(name = 顶层名);根扫描面的文件 name = 文件名(path 保留完整相对路径)。
    const name = rel.startsWith(`${OUT_DIR}/`) ? rel.slice(OUT_DIR.length + 1) : basename(rel);
    decls.push({
      name,
      path: rel,
      kind: cur.kind,
      mime: cur.kind === "dir" ? "application/zip" : mimeFor(name),
      size: cur.size,
    });
  }
  // 2026-07 线上审计 · 中间态降噪:同轮同名 X.docx 与 X.docx.md 并存时(pandoc 转档的 markdown
  // 中间稿),.docx.md 不上抛 —— 线上一轮 4 张卡片干扰用户找文件。仅当成品同轮在列时才压。
  const paths = new Set(decls.map((d) => d.path));
  return decls.filter((d) => {
    if (!d.path.toLowerCase().endsWith(".md")) return true;
    const base = d.path.slice(0, -3); // 去掉 ".md" → 疑似成品路径(X.docx)
    const baseExt = extname(base).toLowerCase();
    return !(baseExt && baseExt !== ".md" && paths.has(base));
  });
}

/**
 * 落点纠偏(2026-07 线上审计):把检测到的**越界交付物**复制进 ./out/ 再上抛。
 *
 * 为什么不直接上抛越界路径:backend 的产物链路(claw/artifact.go `artifactRelPath` 只认
 * `out/<basename>`、`artifact_harvest.go` 只 list `out/`)是 out/ 单一真源 —— 上抛别处的路径
 * 会给用户一张点了 404 的卡,比原来「没有卡」更糟。复制进 out/ 后收割/MinIO/下载全链零改动。
 * (审计原建议即「写完后硬链一份进 out/」;这里用 copyFile,跨 bind-mount 比 link 稳。)
 *
 * 返回改写后的声明;复制失败的条目**丢弃不上抛**(宁可少一张卡,不给死链接)。
 *
 * 2026-07 审查 [4]/[18]:`taken` 原先只由**本轮 decls 里的 out/ 条目**播种,而「上一轮已交付、
 * 本轮未变」的 out/ 文件不进 diff → 不进 taken → 越界同名文件连后缀都不加地 copyFile 盖上去。
 * 下游 backend 按 `out/<basename>` 懒读、dedup anchor = sessionID+relPath,于是卡片 URL/标题不变
 * 而内容被换掉,用户上一轮的交付物被无声顶掉。修法:taken 用**当前快照的全部 out/ 键**播种,
 * 落盘前再 stat 探一次目标(防快照过期/同轮并发),两道都过才用原名;改名/覆盖各留一条 warn。
 */
async function relocateStrays(
  workDir: string,
  decls: ArtifactDecl[],
  current: OutSnapshot,
): Promise<ArtifactDecl[]> {
  // 🔴 引擎保留区(evidence/)**永远不是交付物来源**。2026-08-02 真实会话实测:
  //    evidence/INDEX.md 被当成 stray 反复复制成 out/INDEX-3.md、INDEX-4.md……每轮一份,
  //    既污染用户交付面,又让用户看到本该只属于引擎的账本内部文件。
  //    这与保留区拒写是同一条边界的两侧:模型不能写进去,引擎也不该把里面的东西当成用户产物搬出来。
  const strays = decls.filter(
    (d) => !d.path.startsWith(`${OUT_DIR}/`) && !d.path.startsWith(`${EVIDENCE_DIR}/`) && d.path !== EVIDENCE_DIR,
  );
  if (strays.length === 0) return decls;
  const outAbs = join(workDir, OUT_DIR);
  try {
    await mkdir(outAbs, { recursive: true });
  } catch {
    return decls.filter((d) => d.path.startsWith(`${OUT_DIR}/`)); // out/ 建不出来 → 只留原生 out/ 产物
  }
  // 播种 = out/ 目录当前真实存在的全部条目(含跨轮历史交付物),不是只有本轮 diff 出来的那些。
  const taken = new Set([...current.keys()].filter((k) => k.startsWith(`${OUT_DIR}/`)));
  const occupied = async (name: string): Promise<boolean> => {
    if (taken.has(`${OUT_DIR}/${name}`)) return true;
    try {
      await stat(join(outAbs, name)); // 快照可能已过期(同轮内其它写入)→ 再探一次真实盘面
      return true;
    } catch {
      return false;
    }
  };
  const out: ArtifactDecl[] = [];
  for (const d of decls) {
    if (d.path.startsWith(`${OUT_DIR}/`)) {
      out.push(d);
      continue;
    }
    // 同名占位时加数字后缀(slides/index.html 与 out/index.html 是两份东西,不能相互覆盖)。
    const ext = extname(d.name);
    const stem = ext ? d.name.slice(0, -ext.length) : d.name;
    let name = d.name;
    for (let i = 2; (await occupied(name)) && i < 50; i++) name = `${stem}-${i}${ext}`;
    if (await occupied(name)) {
      // 50 个后缀都被占满 —— 极罕见;此处 copyFile 会覆盖,必须留痕。
      log.warn("artifact relocate overwrites existing out/ file", { workDir, from: d.path, to: `${OUT_DIR}/${name}` });
    } else if (name !== d.name) {
      log.warn("artifact relocate renamed to avoid overwrite", { workDir, from: d.path, to: `${OUT_DIR}/${name}` });
    }
    try {
      await copyFile(join(workDir, d.path), join(outAbs, name));
    } catch {
      continue; // 复制失败(文件已被删/权限)→ 丢弃该声明,不给用户死链接
    }
    taken.add(`${OUT_DIR}/${name}`);
    out.push({ ...d, name, path: `${OUT_DIR}/${name}` });
  }
  return out;
}

// ── 引用句柄 resolve 闸(2026-08 证据账本 P1)──────────────────────────────────
// 可能含 `[[E7]]` 的**文本**交付物扩展名。docx/pptx/pdf 是二进制,它们的闸在 ExportDocument/BuildDeck
// 的生成时刻(那才是唯一还能改内容的地方);走到这里的二进制产物内容已经定型,跳过。
const CITABLE_EXTS = new Set([".md", ".markdown", ".txt", ".html", ".htm", ".csv", ".svg"]);
// 单文件读盘上限。BuildDeck 的单文件 deck 可到 12MB,但它在自己的边界已经过闸(过闸后 out/ 里
// 已无句柄,这里的 includes("[[") 快路径也就直接放行),不必在这儿再吃一次十几 MB 的读。
const CITE_RESOLVE_MAX_BYTES = 8 * 1024 * 1024;

/**
 * 发帧前就地展开交付文件里的 [[E<n>]]。
 *
 * 🔴 这里用 onMissing="mark"(可见破引用标记)而**不是**"不发帧",因为不发帧在本仓库是一道**假闸**:
 *    backend 的产物收割是 on-list 的 —— `claw/artifact.go:201` GetSessionArtifacts → `artifact_harvest.go:34`
 *    harvestSession 直接 ListWorkspaceFiles(out/),**与 artifact 帧无关**。压掉帧只会让用户在产物列表里
 *    照样拿到那个文件、却少一张卡和任何解释。「一条永远绿的规则」和「一条不存在的规则」等价 ——
 *    这个边界上真正有权威的动作只有一个:改写落在盘上的那份文件本身。
 *    伪造的句柄因此绝不会变成一条看起来像真的题录,而是变成用户一眼可见的破引用。
 *    (构建型边界 ExportDocument / BuildDeck 有 tool_result 回路,那里是真的硬失败 + 自救指引。)
 */
async function resolveCitations(workDir: string, decls: ArtifactDecl[]): Promise<void> {
  for (const d of decls) {
    if (d.kind !== "file" || !CITABLE_EXTS.has(extname(d.name).toLowerCase())) continue;
    if (d.size > CITE_RESOLVE_MAX_BYTES) {
      log.warn("artifact citation resolve skipped (too large)", { workDir, path: d.path, size: d.size });
      continue;
    }
    try {
      const r = await resolveFileForDelivery(workDir, join(workDir, d.path), { onMissing: "mark" });
      if (!r || !r.changed) continue;
      await writeFile(join(workDir, d.path), r.text, "utf8");
      d.size = Buffer.byteLength(r.text, "utf8"); // 帧里的 size 必须是改写后的
      // missing > 0 = 模型试图编造一条引用(终稿 W2「resolve 闸计数器」,今天完全不可观测)。
      const fn = r.missing.length > 0 ? log.warn : log.info;
      fn("evidence_citation_resolve", {
        session: workDir.split("/").pop() ?? "",
        path: d.path,
        hits: r.hits,
        used: r.used.length,
        missing: r.missing.length,
        missing_ids: r.missing.join(","),
        ledger_total: r.ledgerTotal,
      });
    } catch (e) {
      log.warn("artifact citation resolve failed", { workDir, path: d.path, err: String((e as Error)?.message ?? e) });
    }
  }
}

/** emitArtifacts:diff ./out/ vs 基线,把新增/变更条目作为 `artifact` 帧发出(在 message_complete 之前)。 */
export async function emitArtifacts(workDir: string, baseline: OutSnapshot, sink: EventSink): Promise<void> {
  const current = await snapshotOut(workDir);
  const all = diffOut(baseline, current);
  // 2026-07 审查 [8]:帧数上限。截断先于 relocateStrays,避免 copyFile 也被放大到几百次。
  // 快照顺序天然是「out/ 原生产物在前、根扫描越界物在后」,截断优先保住真产物。
  const capped = all.slice(0, ARTIFACT_MAX_FRAMES);
  if (capped.length < all.length) {
    log.warn("artifact frames truncated", { workDir, total: all.length, emitted: capped.length, cap: ARTIFACT_MAX_FRAMES });
  }
  const decls = await relocateStrays(workDir, capped, current);
  // 2026-08 证据账本 P1:发帧前展开 [[E<n>]] —— 在 relocateStrays 之后,改写的是最终落在 out/ 的那份。
  await resolveCitations(workDir, decls);
  for (const d of decls) {
    sink.frame({ type: "artifact", name: d.name, path: d.path, kind: d.kind, mime: d.mime, size: d.size });
  }
}
