// 路径限制(C5 修复):纯词法 resolve()+relative() 会被符号链接绕过(workDir 内 `ln -s /etc x`
// 后读/写穿透宿主)。这里用 realpath 把「最深的已存在祖先」canonicalize 后断言落在 canonical workDir 内;
// 写操作再对末段 lstat 拒符号链接(等价 O_NOFOLLOW)。沙箱自探失败(非生产裸跑)时这是唯一防线。

import { resolve, relative, isAbsolute, dirname, basename, join } from "node:path";
import { realpath, lstat } from "node:fs/promises";

import { RESERVED_DIRS } from "./reserved.ts";

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

// 2026-07 审查([0]/[17]/[20]):bwrap 沙箱把会话 cwd bind 到 /work(sandbox/bwrap.ts:104),
// 模型跑过一次 Bash 就会从 pwd/ls 学到 /work 前缀,之后对**执行器进程内**的文件工具
// (Read/Write/Edit/Glob/Grep/ReadDocument/ExportDocument,均不进 jail)也发 /work/... 绝对路径。
// 此前这里走 isAbsolute 分支直接判越界 → 后端已放行、工具自己抛 path escapes workDir。
// 这里做**入站**翻译:/work ≡ 会话 cwd(与后端 pathWithin 的别名同语义,两侧一份常量)。
// 翻译后照常走 resolve + within + realpath 校验,故 /work/../etc/passwd 折算后仍被拒。
const SANDBOX_WORK_ALIAS = "/work";

function aliasSandboxWork(canonRoot: string, p: string): string {
  // workDir 自身若就在 /work 子树内(理论部署形态),别名会双重前缀 → 不翻译,按真实路径处理。
  if (canonRoot === SANDBOX_WORK_ALIAS || canonRoot.startsWith(SANDBOX_WORK_ALIAS + "/")) return p;
  if (p === SANDBOX_WORK_ALIAS) return canonRoot;
  if (p.startsWith(SANDBOX_WORK_ALIAS + "/")) return canonRoot + p.slice(SANDBOX_WORK_ALIAS.length);
  return p;
}

/**
 * canonicalize:把 abs 解析成**真实**绝对路径 —— realpath 最深的已存在祖先,再把尚不存在的
 * 尾段原样接回。目标不存在时 realpath 会整条失败,所以必须这样分段做。
 *
 * 🔴 为什么必须有它:此前本文件只把 realpath **用于越界断言**,断言完就丢弃、返回的是**词法**路径。
 *    对「有没有逃出 workDir」那个问题,词法/真实两者等价,所以旧代码没错;
 *    但对任何**基于路径前缀的策略判定**(如保留区拒写),词法路径是可以被绕过的:
 *      workDir 内 `ln -s evidence x`,再 `Write x/ledger.jsonl`
 *      → 词法路径是 `<root>/x/ledger.jsonl`,前缀不匹配 `evidence/` ⇒ 放行
 *      → 实际落到 `<root>/evidence/ledger.jsonl`,账本被改写。
 *    (forWrite 的 lstat 只查**末段**,中间那一节符号链接查不到。)
 *    所以策略判定一律用 canonical,且本函数**返回 canonical** —— 不把这个陷阱留给下一个人。
 */
async function canonicalize(abs: string): Promise<string> {
  const tail: string[] = [];
  let cur = abs;
  for (;;) {
    const rp = await realpathOrNull(cur);
    if (rp) return tail.length > 0 ? join(rp, ...tail) : rp;
    const parent = dirname(cur);
    if (parent === cur) return abs; // 一路到根都不存在 → 词法值即真实值
    tail.unshift(basename(cur));
    cur = parent;
  }
}

/** canonical 路径是否落在会话 cwd 的**任一**引擎独占保留区内(清单见 sandbox/reserved.ts)。
 *  2026-08-05 从单个 evidence/ 推广到清单:数据分析的 analysis/(bundle 目录)是第二个 ——
 *  bundle 是报告里每个数字的唯一真源,模型能写它就等于能伪造报告里的数字。 */
function inReserved(canonRoot: string, canonAbs: string): boolean {
  return RESERVED_DIRS.some((d) => {
    const reservedRoot = join(canonRoot, d);
    return canonAbs === reservedRoot || within(reservedRoot, canonAbs);
  });
}

/**
 * 把 rel 解析成 workDir 内的绝对路径,符号链接安全。越界抛错。
 * forWrite=true 时额外:① 拒写引擎保留区(evidence/);② 拒「末段本身是符号链接」。
 *
 * 返回值是 **canonical** 路径(符号链接已解),调用方可安全地对它做前缀判定。
 */
export async function confinePath(workDir: string, rel: string, forWrite = false): Promise<string> {
  const canonRoot = (await realpathOrNull(workDir)) ?? resolve(workDir);
  const target = aliasSandboxWork(canonRoot, rel);
  // 绝对路径也过一次 resolve():把翻译后残留的 `..` 折算掉,再交给 within 判定。
  const abs = isAbsolute(target) ? resolve(target) : resolve(canonRoot, target);

  // 词法预检(快速拒绝明显的 ..)
  if (!within(canonRoot, abs)) throw new Error("path escapes workDir");

  // 解真实路径后再断言 —— 抓符号链接逃逸(旧行为,保持)。
  const canonAbs = await canonicalize(abs);
  if (!within(canonRoot, canonAbs)) throw new Error("path escapes workDir (symlink)");

  if (forWrite) {
    // 引擎独占保留区:模型的任何写入面都不得触及。用 canonical 判定,故 `ln -s evidence x` 无效。
    // ⚠️ 这只是**两道闸中的一道**:jail 内的 Bash 不走本函数,由 bwrap 的 ro-bind 覆盖层负责。
    if (inReserved(canonRoot, canonAbs)) {
      throw new Error(
        "refusing to write into engine-reserved directory (one of: " +
          RESERVED_DIRS.map((d) => d + "/").join(", ") + ")",
      );
    }
    // 末段若是符号链接,拒绝(不允许写穿透 symlink)。
    const st = await lstat(abs).catch(() => null);
    if (st && st.isSymbolicLink()) throw new Error("refusing to operate through symlink");
  }
  return canonAbs;
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
