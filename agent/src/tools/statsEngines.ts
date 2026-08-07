// 统计引擎可用性探测(2026-08 证据账本 P0-a「运行时诚实化」)。
//
// 动机(实测事故):agent-skills/claw-add/guides 的两份 SKILL.md 向模型声明「claw 能用 python
// (statsmodels)真算」「scipy / statsmodels 做检验与建模」,而 2026-08-01 容器实测
// statsmodels / sklearn / lifelines **全部 MISSING**、且无 R。用户要混合效应模型 / Cox 回归时,
// 模型只剩两条路:撞 ImportError,或**把数字编出来** —— 后者就是审计里效应量凭空出现的机械成因。
// Dockerfile 已把这些库装上,但「装上了」不等于「运行期真能 import」:真实链路是
// Bash → wrapBash → buildBwrapArgv 进 jail,jail 的 bind 集漏一个运行库就会 ImportError,
// 而裸 `docker exec python3` 完全看不到(2026-07-21 的 libblas.so.3 事故就是这么漏的)。
//
// 故本模块用**与生产同一条 argv 构造路径**跑一次 import 探测,把结果落进 `engineSupported`。
//
// 边界(硬纪律:guard 只能做可观测,不能做解法):
//   - 本模块**只探测、只记录、只打日志**。不注入任何提示词、不改写模型输出、不做事后纠偏。
//   - `engineSupported` 是给 P1「方法候选表」用的**真值来源** —— 缺库的方法应当从候选表里
//     消失(确定性状态转移),而不是让模型撞 ImportError 之后自己编数。P0 只负责把真值算出来。
//   - 缺库要在启动日志里**大声说**(log.error),不静默。一条永远绿的探测等于没有探测。

import { buildBwrapArgv } from "../sandbox/bwrap.ts";
import { sandboxMode } from "../sandbox/bwrap.ts";
import type { SandboxProfile } from "../sandbox/profile.ts";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { log } from "../obs/log.ts";

// 被声明的统计引擎清单 —— 这份清单就是「我们对模型承诺了什么」的机器可读副本。
// 改 SKILL.md 里的能力口径时**必须同步改这里**,否则又会长出一次「声明与镜像不符」。
// 每项:import 名 → 它在 SKILL.md 里承担的能力(仅用于日志可读性)。
export const DECLARED_ENGINES: ReadonlyArray<readonly [string, string]> = [
  ["numpy", "数值基础"],
  ["pandas", "数据清洗 / 描述统计"],
  ["scipy", "经典假设检验(t / Mann-Whitney / 卡方 / Fisher / 相关)"],
  ["matplotlib", "出版级图表"],
  ["statsmodels", "回归 / ANOVA / 混合效应模型 / 多重比较校正 / 功效与样本量"],
  ["sklearn", "预测建模 / 交叉验证"],
  ["lifelines", "生存分析(Kaplan-Meier / log-rank / Cox)"],
  ["openpyxl", "xlsx 精读(定位 sheet / 区域)"],
  // ── 2026-08-05「数据分析」能力(方案 R · 方法卡注册表)追加四项 ──
  // 前两项是方案 R 的地基:方法卡/policy/system 全是 YAML,Results/Methods 段靠模板插值。
  // 二者在 2026-08-05 之前**都没装**(容器实测 ModuleNotFoundError),属 P0 硬 DOA,已在 Dockerfile 同层补上。
  ["yaml", "方法卡 / policy / system 注册表读取(方案 R 的声明式真源)"],
  ["jinja2", "Results / Methods 段模板插值(数字从 bundle 取值,不经模型手)"],
  // seaborn 不是为画图列的:它是 scikit-posthocs 的包级依赖。显式声明 = 让 apt 标记 manually-installed,
  // 不随上游漂移(同 scipy 那条的理由);顺带它也是统计图层的实现之一。
  ["seaborn", "统计图层;并且是 scikit_posthocs 的包级依赖"],
  // ⚠️ 口径必须精确到函数级,否则又是一次「声明与镜像不符」:
  //   发布版 0.14.0 **有** compact_letter_display(a/b/c 字母标记,原生 52 字母=大小写双水平)、
  //   posthoc_dunn / conover / dscf / nemenyi / tamhane / scheffe / tukey / tukey_hsd / dunnett + Friedman 族;
  //   **没有** posthoc_duncan(农学/食品默认)与 posthoc_games_howell(方差不齐时的默认)——
  //   这两个只在 GitHub master、从未进发布版,**必须自写**(scipy.stats.studentized_range 提供 q 分布)。
  //   故 SKILL.md 里谈事后比较时不得笼统说「scikit-posthocs 全包了」。Dockerfile 有构建期断言钉死这条边界。
  ["scikit_posthocs", "事后多重比较(Dunn/Conover/DSCF/Tamhane/Scheffé/Tukey/Dunnett)+ 字母标记 CLD"],
  // statkit 是本仓自己的数据分析引擎(方法卡注册表 + 决策表守门 + 交付层),pip 装进 dist-packages,
  // 由 bwrap 的 `--ro-bind /usr /usr` 覆盖。放进本清单的理由与第三方库完全一样:
  // **它是我们对模型承诺的能力**,而承诺必须在**真 jail 内**被验证过 ——
  // `docker exec python3 -m statkit` 全绿不等于 jail 内能跑(2026-07-21 的 libblas 事故就是这么漏的)。
  // 注:探测只做 `import statkit`,不跑 verb —— 卡片加载的完整性由构建期 `doctor --strict` 负责,
  // 两道闸分工不同:这里答「jail 内能不能用」,那里答「注册表合不合格」。
  ["statkit", "数据分析引擎:前提实测 + 决策表分流 + 候选白名单(方案 R)"],
];

// engineSupported —— 启动探测的结果真值。probeStatsEngines() 跑完前为空对象。
// 消费方(P1 方法候选表)读它决定某个方法能不能进候选;**不要**在这里写兜底默认值:
// 「未探测」与「探测为 false」必须可区分,填默认值会把两者抹平成同一个假绿。
export const engineSupported: Record<string, boolean> = {};

// probed —— 探测是否已完成。消费方据此区分「还没探」与「探过且不支持」。
let probed = false;
export function statsEnginesProbed(): boolean {
  return probed;
}

// probeStatsEngines:对 DECLARED_ENGINES 逐个 import,一次 python3 进程出 JSON。
// 走生产同一条路径:bwrap 探到就进真 jail,探不到就裸跑(与 wrapBash 的降级口径一致)——
// 这样两种模式下拿到的都是**该模式下的真值**,而不是像既有 smokeTest* 那样在 none 模式整体跳过。
export async function probeStatsEngines(): Promise<Record<string, boolean>> {
  const names = DECLARED_ENGINES.map(([n]) => n);
  let dir = "";
  try {
    dir = await mkdtemp(join(tmpdir(), "stats-probe-"));
    const profile: SandboxProfile = { cwd: dir, net: "none", allowBash: true, roBinds: [] };
    // importlib.util.find_spec 只查「能不能定位」,不执行模块顶层代码 —— 比真 import 快且无副作用;
    // 但它查不出「装了却因缺运行库而 import 失败」(正是 libblas 那类事故),故再真 import 一次。
    const code =
      "import json,importlib\n" +
      `names=${JSON.stringify(names)}\n` +
      "r={}\n" +
      "for n in names:\n" +
      "    try:\n" +
      "        importlib.import_module(n); r[n]=True\n" +
      "    except Exception:\n" +
      "        r[n]=False\n" +
      "print('STATS_PROBE '+json.dumps(r))";
    const inner = ["python3", "-c", code];
    const argv = sandboxMode() === "bwrap" ? buildBwrapArgv(profile, inner) : inner;
    const proc = Bun.spawn(argv, { stdout: "pipe", stderr: "pipe" });
    const out = await new Response(proc.stdout).text();
    const exit = await proc.exited;
    const line = out.split("\n").find((l) => l.startsWith("STATS_PROBE "));
    if (exit !== 0 || !line) {
      const err = await new Response(proc.stderr).text();
      // python3 本身跑不起来 = 全部统计能力不可用。这是最响的一种失败,必须 error。
      for (const n of names) engineSupported[n] = false;
      probed = true;
      log.error(
        "统计引擎探测失败:python3 在" +
          (sandboxMode() === "bwrap" ? "真实 bwrap jail" : "本进程") +
          "内跑不起来 —— claw 的「真算」能力全线不可用,模型此时给出的任何统计数值都不是算出来的。",
        { exit, stderr: err.trim().slice(0, 300) },
      );
      return engineSupported;
    }
    const parsed = JSON.parse(line.slice("STATS_PROBE ".length)) as Record<string, boolean>;
    for (const n of names) engineSupported[n] = parsed[n] === true;
    probed = true;

    const missing = DECLARED_ENGINES.filter(([n]) => !engineSupported[n]);
    if (missing.length === 0) {
      log.info("统计引擎自检通过(声明的库全部可 import)", {
        sandbox: sandboxMode(),
        engines: names.join(","),
      });
    } else {
      // 大声说:缺库 = SKILL.md 正在对模型撒谎,模型会拿编造的数字填这个洞。
      log.error(
        "统计引擎自检:声明了但**装不上/import 不了**的库 —— " +
          missing.map(([n, cap]) => `${n}(${cap})`).join("、") +
          "。这些能力在 SKILL.md 里已向模型承诺,运行期却不存在:模型只能撞 ImportError 或编造数值。" +
          "修法二选一:装进 agent/Dockerfile 的「统计建模运行时」层,或把 SKILL.md 的对应声明删掉。",
        { sandbox: sandboxMode(), missing: missing.map(([n]) => n).join(",") },
      );
    }
    return engineSupported;
  } catch (e) {
    for (const n of names) engineSupported[n] = false;
    probed = true;
    log.error("统计引擎探测异常", { err: String((e as Error)?.message ?? e) });
    return engineSupported;
  } finally {
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
