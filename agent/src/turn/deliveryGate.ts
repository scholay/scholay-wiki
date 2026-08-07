// 交付闸(D2)—— 交付物里的数字必须能在 bundle 里找到源,否则不许交付。
//
// ## 为什么「不发 artifact 帧」是假闸
//
// backend 的产物收割走 `ListWorkspaceFiles(ctx, sessionID, "out")`
// (`backend/internal/claw/artifact_harvest.go` 的 `harvestSession`)——
// 它枚举的是 `out/` 里**物理存在**的文件,与执行器发不发 artifact 帧完全无关。
// 所以压住帧只能让产物卡不出现,文件照样被收割、照样能下载。
// ⇒ 闸必须**动盘上的文件**。
//
// ## 隔离到哪:保留区里
//
// 违规文件移进 `analysis/quarantine/`。选这里不是随手挑的:
// `analysis/` 是引擎独占保留区(`sandbox/reserved.ts`),模型的 Write/Edit 被 confinePath 拒、
// jail 内 Bash 被 bwrap 只读覆盖层拒 ⇒ **模型没有任何路径能把文件挪回 out/**。
// 移到别处(如 `/tmp` 或会话根)都挡不住模型一句 `mv` 撤销。
//
// ## 🔴 默认 observe,不拦
//
// 数字匹配是启发式(舍入 / 百分比换算),是全案误拦风险最高的一块;
// 误拦的代价很具体:用户辛苦跑出来的报告被无理由扣住。
// 故默认只记录、只打日志,先采真实会话里的假阳性率,再决定何时开硬拦
// (`STATKIT_NUMCHECK_ENFORCE=1`)。这是本仓 `citation_audit` 用过的纪律。
//
// ## 覆盖边界(如实声明)
//
// 只覆盖文本类与 .docx。png / pdf / xlsx 里的数字扫不到 —— 尤其**图里的数字**。
// 一条只覆盖一半却不说的闸,比没有闸更危险,所以这句话同时出现在这里、
// statkit 的 numcheck 输出里、和给模型的回执里。

import { mkdir, rename, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { log } from "../obs/log.ts";
import { ANALYSIS_DIR } from "../sandbox/reserved.ts";
import { buildBwrapArgv, sandboxMode } from "../sandbox/bwrap.ts";
import { profileFor } from "../sandbox/profile.ts";
import { childEnv } from "../sandbox/childEnv.ts";

const OUT_DIR = "out";

const QUARANTINE_SUBDIR = "quarantine";

export interface NumcheckFinding {
  file: string;
  unsourced: { raw: string; value: number }[];
  unsourced_total: number;
}

export interface DeliveryGateResult {
  ran: boolean;
  mode: "observe" | "enforce";
  findings: NumcheckFinding[];
  quarantined: string[];
  /** 给模型的可行动回执(为空表示无需告知)。 */
  noticeForModel?: string;
}

/** 调 statkit 的 numcheck 取证。引擎不可用(未装 / 无 analysis 目录)时返回 null ——
 *  **不把「没跑成」伪装成「通过」**:那正是「一条永远绿的规则」。
 *
 *  ## 🔴 这个 spawn 曾经是全仓最危险的一处(2026-08-06 修)
 *
 *  它此前 **① 不进 bwrap jail ② `env: { ...process.env }` ③ `cwd` = 会话工作目录
 *  ④ 用 `python3 -m statkit`**。四条凑在一起是一条完整的攻击链:
 *  `-m` 把 cwd 放进 `sys.path[0]`,而 `statkit/` 不在 RESERVED_DIRS 里 ⇒
 *  模型(或上传文件里的一句提示注入)`Write("statkit/__init__.py")` + `Write("statkit/__main__.py")`,
 *  本轮 `emitArtifacts` 收尾时那段 payload 就在**未沙箱**的执行器里以 bun 用户执行:
 *  拿到 MINICOD_API_KEY / EXECUTOR_AUTH_TOKEN、可出网、可 `os.listdir("/home/bun/sessions")`
 *  读**全部租户**上传的 PHI 级数据。
 *
 *  而且它对**所有 feature 每一轮**都跑(挂在 emitArtifacts 上),不只是数据分析会话。
 *
 *  四条现在逐条堵上:`-P` 关掉 cwd 进 sys.path;进 bwrap;env 走共享白名单;
 *  enforce 档位改由 CLI flag 传(那本是 `{...process.env}` 的唯一借口 —— 而 bwrap 是
 *  `--clearenv`,env 本来也传不进去)。
 */
async function probe(workDir: string): Promise<{ mode: string; findings: NumcheckFinding[] } | null> {
  // 档位由执行器读自己的 env 决定,再以 flag 传进去:jail 内 env 被清空,flag 传得进去;
  // 而且档位会出现在 argv 里 —— 日志能看出这次到底跑的是哪一档。
  const enforce = process.env.STATKIT_NUMCHECK_ENFORCE === "1";
  const inner = ["python3", "-P", "-m", "statkit", "numcheck", "--workdir", ".",
    ...(enforce ? ["--enforce"] : [])];
  // net:none —— 取证是纯本地文件扫描,没有任何出网理由。
  const profile = profileFor({ workDir, net: "none", allowBash: true });
  const argv = sandboxMode() === "bwrap" ? buildBwrapArgv(profile, inner) : inner;
  try {
    const proc = Bun.spawn(argv, {
      cwd: workDir,
      stdout: "pipe",
      stderr: "pipe",
      env: childEnv(),
    });
    const out = await new Response(proc.stdout).text();
    await proc.exited;
    const parsed = JSON.parse(out) as { mode: string; findings: NumcheckFinding[] };
    if (!Array.isArray(parsed.findings)) return null;
    return parsed;
  } catch {
    return null; // statkit 未安装 / 非数据分析会话 —— 静默跳过是对的(不是所有 feature 都有 bundle)
  }
}

/**
 * 跑交付闸。**必须在产物快照/发帧之前调用** —— 被隔离的文件要在 diff 看到之前就离开 out/。
 *
 * @param workDir 会话 cwd(执行器侧真实路径,不是 jail 内的 /work)
 */
export async function runDeliveryGate(workDir: string): Promise<DeliveryGateResult> {
  const res = await probe(workDir);
  // 没有 bundle 的会话(claw / prism / boltslides / sci_draw,以及还没跑过分析的
  // stat_lab 首轮)—— numcheck 显式声明「未做校验」。**不能当成通过**,更不能当成全无源。
  if (res && (res as { skipped_reason?: string }).skipped_reason) {
    log.debug("delivery_gate: 本会话无分析结果,跳过校验", { workDir });
    return { ran: false, mode: "observe", findings: [], quarantined: [] };
  }
  if (!res) {
    // 🔴 「没跑成」必须与「跑了且通过」在日志上可分辨。
    //    此前两者都是**零输出** ⇒ `docker logs | grep delivery_gate` 对二者给出完全相同的空结果,
    //    而模块顶上写死的上线路径是「默认 observe → 采真实会话假阳性率 → 再开 enforce」——
    //    连「闸有没有在跑」都答不出来时,那条路径在证据上是走不通的。
    //    刻意用 debug 档:非 stat_lab 会话每轮都会走到这里(statkit 装在全局,probe 恒能跑,
    //    但那些会话没有 bundle),warn 会把日志刷爆。
    log.debug("delivery_gate: 未取到证据(statkit 不可用 / 输出不可解析),本轮未校验", { workDir });
    return { ran: false, mode: "observe", findings: [], quarantined: [] };
  }

  const enforce = res.mode === "enforce";
  const findings = res.findings ?? [];
  if (findings.length === 0) {
    log.debug("delivery_gate: 通过", {
      workDir, mode: enforce ? "enforce" : "observe",
      scanned: (res as { scanned?: string[] }).scanned?.length ?? 0,
      sources: (res as { sources_count?: number }).sources_count ?? 0,
    });
    return { ran: true, mode: enforce ? "enforce" : "observe", findings: [], quarantined: [] };
  }

  // observe:只记录。**刻意不隔离** —— 先采假阳性率再谈拦截。
  if (!enforce) {
    log.warn("交付闸(observe):交付物含无源数字,本次**不拦截**", {
      workDir,
      files: findings.map((f) => f.file),
      sample: findings[0]?.unsourced?.slice(0, 5),
      hint: "开硬拦设 STATKIT_NUMCHECK_ENFORCE=1;开之前应先看这条日志的假阳性率",
    });
    return { ran: true, mode: "observe", findings, quarantined: [] };
  }

  const quarantined: string[] = [];
  for (const f of findings) {
    const src = join(workDir, f.file);
    // 隔离进保留区:模型无法把它挪回来(analysis/ 对模型两道闸皆拒)。
    const dest = join(workDir, ANALYSIS_DIR, QUARANTINE_SUBDIR, f.file.replace(/^out\//, ""));
    try {
      await mkdir(dirname(dest), { recursive: true });
      await rename(src, dest);
      quarantined.push(f.file);
    } catch (e) {
      // 移不动就**大声说**,不静默放行 —— 静默放行等于闸没生效而没人知道。
      log.error("交付闸:隔离失败,该文件仍会被交付", {
        workDir, file: f.file, err: String((e as Error)?.message ?? e),
      });
    }
  }

  log.warn("交付闸(enforce):已隔离含无源数字的交付物", { workDir, quarantined });

  // 🔴 隔离之后必须在 out/ 里留一份说明。
  //    2026-08-06 查实:`noticeForModel` 从写出来那天起就**没有任何消费者**
  //    (`emitArtifacts` 里 `await runDeliveryGate(...).catch(...)` 丢掉了返回值),
  //    唯一引用它的是它自己的单测 —— 一条对着永远送不出去的值做的断言。
  //    后果:enforce 模式下文件被静默移走,模型不知道、**用户也不知道**,
  //    用户只会看到自己的报告凭空消失,而 out/ 里什么线索都没有。
  //
  //    这里走**已有的产物通道**:闸拿走坏文件的同时,在原地留一份说明,
  //    用户在本该出现报告的位置看到解释。不另开帧类型(那要动 agent/backend/前端三个包),
  //    也不注入纠偏文本给模型(本仓已删除该机制,理由见 verifyClaims.ts 模块注释)。
  //
  //    ⚠️ 说明里**只写文件名不写具体数字** —— 那些数字正是被判无源的,
  //    写进去会在下一轮被自己扫出来,变成自我引用的噪音。
  if (quarantined.length) {
    const noticePath = join(workDir, OUT_DIR, "⚠️交付闸拦截说明.md");
    const body = [
      "# 交付闸拦截说明",
      "",
      "以下文件含有**无法在本次分析结果里找到来源**的数字,已被移出交付目录:",
      "",
      ...quarantined.map((f) => `- \`${f.replace(/^out\//, "")}\``),
      "",
      "## 为什么",
      "",
      "这张卡片的核心承诺是:交付物里的每一个统计量都由确定性引擎算出,并可逐个追溯到分析结果。",
      "上面这些文件里的数字对不上任何一次分析的输出 —— 可能是手工誊写时抄错,",
      "也可能是在引擎之外另行计算的。两种情况都无法向审稿人交代。",
      "",
      "## 怎么办",
      "",
      "请让助手用 `StatRun` 重新跑一次分析,再用 `StatReport` 生成交付物 ——",
      "那条路径产出的报告,每个数字都从分析结果直接取值,不经模型的手。",
      "",
      "> 注:本闸只覆盖文本类与 .docx。图片与 PDF 里的数字扫不到,",
      "> 这不代表那些一定有来源。",
      "",
    ].join("\n");
    try {
      await mkdir(dirname(noticePath), { recursive: true });
      await writeFile(noticePath, body, "utf8");
    } catch (e) {
      log.error("交付闸:拦截说明写入失败,用户将看不到任何解释", {
        workDir, err: String((e as Error)?.message ?? e),
      });
    }
  }

  const detail = findings
    .map((f) => `- ${f.file}:${f.unsourced.slice(0, 6).map((u) => u.raw).join("、")}` +
      (f.unsourced_total > 6 ? ` 等 ${f.unsourced_total} 处` : ""))
    .join("\n");
  return {
    ran: true,
    mode: "enforce",
    findings,
    quarantined,
    noticeForModel:
      "⚠️ 交付闸拦下了以下文件:它们含有**无法在分析结果里找到来源**的数字,已移出交付目录。\n" +
      detail +
      "\n\n请不要自己书写统计数字。正确做法是调用 StatRun 得到结果后,用引擎的报告产出交付物 —— " +
      "报告里的每个数字都从分析结果取值,不经你的手。\n" +
      "(注:本闸只覆盖文本类与 .docx;图片与 pdf 里的数字扫不到,不代表那些一定有源。)",
  };
}
