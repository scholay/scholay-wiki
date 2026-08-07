// 引擎独占保留区清单 —— 会话 cwd 下**模型的任何写入面都不得触及**的目录。
//
// 叶子模块,零依赖(除 evidence/paths.ts 这个同样零依赖的常量文件),
// 故 sandbox/confine.ts 与 sandbox/bwrap.ts 都能安全 import,不形成循环。
//
// ## 为什么要有保留区(两道闸,缺一等于没有)
//
// 详见 evidence/paths.ts 的长注释。一句话:**「这个数字/编号不可伪造」是一条立论,
// 而立论需要物理边界**。边界由两道闸共同保证:
//   ① 进程内文件工具(Write/Edit)→ confine.ts 用 **canonical** 路径拒写
//      (词法判定会被 `ln -s analysis x` 绕过);
//   ② jail 内 Bash → bwrap.ts 在 `--bind cwd /work` **之后**叠 `--ro-bind`(后者盖前者)。
// 只堵①:一句 `echo >> analysis/x.json` 就绕过去。只堵②:Write 工具不进 jail,直接写盘。
//
// ## 为什么是全局而不是 per-feature
//
// 评审时提过「让 analysis/ 只对 stat_lab 生效」,权衡后**不做**:
// `buildBwrapArgv` 是四个 feature 共享的路径,做成 per-feature 要给 SandboxProfile 加字段、
// 在三个调用点各传一次 —— **多一处漏传就是一个静默敞口**,而静默敞口正是保留区要根除的东西。
// 代价是 claw/prism/boltslides/sci_draw 的会话里多一个只读空目录;
// 实测这四个 feature 对 `analysis/` 零碰撞,代价可接受。
//
// ⚠️ 往本清单加目录前先想清楚:它会**对所有 feature 生效**,且既有会话(prod 的
// ./data/agent-sessions 跨重启存活)也会立刻套上。加错一个常用目录名 = 全站 Bash 写入失败。

import { EVIDENCE_DIR } from "../evidence/paths.ts";

/** 数据分析引擎(statkit)的 bundle 目录。bundle 是报告里每个数字的唯一真源:
 *  `report` 只从它取值填模板。若模型能写它,「数字不经模型手」就只是一句话 ——
 *  它可以先伪造一份 bundle,再让确定性渲染器忠实地把伪造值印进 Results 段。 */
export const ANALYSIS_DIR = "analysis";

/** bundle 的文件名后缀。`StatReport` 的路径闸用它判「这确实是一份 bundle」而不是保留区里
 *  碰巧被放进去的别的文件。与 statkit 侧 `statkit/paths.py` 的同名常量必须一致 ——
 *  `tools/statkitPaths.test.ts` 是把两侧钉在一起的跨语言不变量。 */
export const BUNDLE_SUFFIX = ".bundle.json";

/** 全部保留区目录名(相对会话 cwd)。confine.ts 与 bwrap.ts 都以本清单为准。 */
export const RESERVED_DIRS: readonly string[] = [EVIDENCE_DIR, ANALYSIS_DIR] as const;

/** 相对路径是否落在任一保留区内(供不便做 canonical 解析的调用方使用,如产物收割)。
 *  ⚠️ 这是**词法**判定,只够用在「本进程刚生成的相对路径」这类可信输入上;
 *  写入闸必须用 confine.ts 的 canonical 版本,否则 symlink 可绕。 */
export function inReservedLexical(rel: string): boolean {
  return RESERVED_DIRS.some((d) => rel === d || rel.startsWith(`${d}/`));
}
