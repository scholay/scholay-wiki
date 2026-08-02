// 证据基座的**引擎独占命名空间** —— 叶子模块,零依赖(故 sandbox/confine.ts 可以安全 import 它,
// 不会与 evidence/ledger.ts → mcp/mcpTools.ts 那条链形成循环)。
//
// 🔴 这个常量为什么值得单独一个文件:它是「E 编号不可伪造」这条立论的**唯一物理边界**。
//    2026-08-01 架构评估实测:该边界当时**根本不存在** —— 账本目录就在 workDir 里,
//    而 workDir 是模型的文件工具(Write/Edit)与 jail 内 Bash 的可写面 ⇒
//    claw / prism / boltslides / sci_draw 一条 Write 就能往 ledger.jsonl 里造 E 编号,
//    `count > 0` 的交付闸与 `[[E7]]` 句柄展开**同时被抽空**。
//    (smart_search 只因禁了 Write 才幸免 —— 靠工具面收窄而不是靠边界,那是运气不是设计。)
//
//    现在这个边界由**两道**物理闸共同保证,缺任一道都等于没有:
//      ① 进程内文件工具 → sandbox/confine.ts 的保留区拒写(用 **canonical** 路径判定,
//         词法判定会被 workDir 内的 `ln -s evidence x` 绕过 —— 见该文件注释)
//      ② jail 内 Bash    → sandbox/bwrap.ts 在 `--bind cwd /work` **之后**叠一层
//         `--ro-bind <cwd>/evidence /work/evidence`(bwrap 按顺序应用,后者覆盖前者)
//
//    只堵 ① 不堵 ②:模型跑一句 `echo >> evidence/ledger.jsonl` 就绕过去了。
//    只堵 ② 不堵 ①:Write 工具不进 jail,直接写文件系统。

/** 账本目录名(相对会话 cwd)。引擎独占:模型的任何写入面都不得触及。 */
export const EVIDENCE_DIR = "evidence";
