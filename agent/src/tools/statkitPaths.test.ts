import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ANALYSIS_DIR, BUNDLE_SUFFIX } from "../sandbox/reserved.ts";

/**
 * 🔴 两条跨语言 / 跨文件不变量,都来自 2026-08-06 端到端复现过的 P0。
 *
 * ## 不变量 A · `python3 -m statkit` 必须带 `-P`
 *
 * `-m` 会把**当前工作目录**放进 `sys.path[0]`,而 spawn 的 cwd 就是会话工作目录、
 * `statkit/` 又不在 `RESERVED_DIRS` 里(模型对它有完整写权限)⇒
 * 模型 `Write("statkit/__init__.py")` + `Write("statkit/__main__.py")` 就能顶替掉真引擎。
 *
 * 三处 spawn 各有各的后果,没有一处可以省:
 *   · `StatRun`      —— 全仓唯一带 `writableReserved: [analysis]` 的 profile ⇒ 劫持后可直接伪造 bundle;
 *   · `StatReport`   —— 渲染层,劫持后可印出任意数字;
 *   · 交付闸探针      —— **不进 jail**,劫持后是执行器内任意代码执行(全量 env / 出网 / 跨租户读 sessions)。
 *
 * `-P` 是一个参数的事,而少了它整套「数字不经模型手」的物理边界都不成立。
 * 本测试扫源码而不是跑进程:它要挡的是**将来新增第四处 spawn 时忘了带**。
 *
 * ## 不变量 B · 两侧的目录常量必须一致
 *
 * TS 侧 `sandbox/reserved.ts` 用 `ANALYSIS_DIR` 构造 confinePath 的拒写判定、bwrap 的只读覆盖层、
 * 以及 `StatReport` 的 bundle 路径闸;Python 侧 `statkit/paths.py` 用同名常量判「bundle 只能从这里读」。
 * 任一侧改了值,路径闸就会指向一个不存在的目录 —— 而症状是**静默放行**,不是报错。
 */
describe("跨文件不变量 · statkit 调用面", () => {
  const SRC = join(import.meta.dir, "..");

  /**
   * 剥掉注释再扫 —— **护栏必须只看代码**。
   *
   * 首版没剥,当场被自己咬:本文件解释「探针曾经 `{ ...process.env }`」的那段注释,
   * 被「不得出现 `...process.env`」那条规则判成违规。这是本仓已知的一类形态
   * (设计护栏那侧同款问题记在 G-207),后果有两面:
   *   · 假红 —— 写清楚为什么的注释反而让构建挂掉,逼下一个人删注释;
   *   · 假绿 —— 反过来,`// 这里没有 xxx` 这种注释能让「必须出现 xxx」的规则蒙混过关。
   */
  const stripComments = (t: string): string =>
    t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

  const files = {
    "tools/registry.ts": stripComments(readFileSync(join(SRC, "tools/registry.ts"), "utf8")),
    "turn/deliveryGate.ts": stripComments(readFileSync(join(SRC, "turn/deliveryGate.ts"), "utf8")),
  };

  // 每一处 `"python3", "-P", "-m", "statkit"` 的 argv 字面量。
  // 用 `-m", "statkit` 定位(而不是找 `python3`),因为只有 `-m` 那种调用形态才有 cwd 注入问题。
  const MODULE_CALL = /"-m",\s*"statkit"/g;
  const SAFE_CALL = /"python3",\s*"-P",\s*"-m",\s*"statkit"/g;

  test("锚点:确实存在 -m statkit 的调用(否则本测试恒绿)", () => {
    const total = Object.values(files).reduce((n, t) => n + (t.match(MODULE_CALL)?.length ?? 0), 0);
    expect(total).toBeGreaterThanOrEqual(3);
  });

  test("每一处 `-m statkit` 都带 -P(关掉 cwd 进 sys.path)", () => {
    for (const [name, text] of Object.entries(files)) {
      const all = text.match(MODULE_CALL)?.length ?? 0;
      const safe = text.match(SAFE_CALL)?.length ?? 0;
      expect({ file: name, "带 -P 的": safe, "总共": all }).toEqual({
        file: name, "带 -P 的": all, "总共": all,
      });
    }
  });

  test("交付闸探针不再全量透传 process.env(全仓唯一破例已消除)", () => {
    // `{ ...process.env }` 会把 MINICOD_API_KEY / EXECUTOR_AUTH_TOKEN 一起递给子进程。
    // registry.ts 自己的注释把这条列为 C4 红线,而探针曾是唯一违反它的地方。
    for (const [name, text] of Object.entries(files)) {
      expect({ file: name, leaks: /\.\.\.process\.env/.test(text) }).toEqual({ file: name, leaks: false });
    }
  });

  test("交付闸探针进 bwrap jail(不再是裸 spawn)", () => {
    const gate = files["turn/deliveryGate.ts"];
    expect(gate).toContain("buildBwrapArgv");
    // spawn 用的必须是包过的 argv,不是内层命令
    const spawnAt = gate.indexOf("Bun.spawn(argv");
    expect(spawnAt).toBeGreaterThan(gate.indexOf("buildBwrapArgv"));
  });

  // ── CLI 参数名的跨语言一致(2026-08-06)────────────────────────────────────
  //
  // 🔴 「造好没接线」是本仓咬过多次的形态:引擎实现好了、分流没接过去
  //    (StatReport 工具不存在而 skill 让模型调它;信号量写在注释里而代码没有;
  //     Welch 换了效应量而 tests.py 还调旧的 —— 最后这条是本轮变异抓到的)。
  //
  //    模型标识的透传链有五跳:turnLoop → runTools → ToolCtx → StatRun `--llm-model`
  //    → `software.llm_model` → ICMJE 披露句。Python 侧有一条端到端测试,
  //    但它从 CLI 参数起跑 —— **把 TS 侧那句 args.push 删掉,Python 全绿**(实测)。
  //    参数名是两种语言之间的握手,只有跨语言断言才钉得住。
  const CLI_FLAGS: { flag: string; pyKey: string; why: string }[] = [
    { flag: "--llm-model", pyKey: "llm-model", why: "ICMJE 披露句里的模型标识" },
    { flag: "--sentinel-ok", pyKey: "sentinel-ok", why: "哨兵值逃生开关" },
    { flag: "--missing-ok", pyKey: "missing-ok", why: "剔除占比逃生开关" },
    { flag: "--labels-ok", pyKey: "labels-ok", why: "幽灵组名的显式接受" },
    { flag: "--duplicates-ok", pyKey: "duplicates-ok", why: "重复配对格的显式接受" },
    { flag: "--independent-study", pyKey: "independent-study", why: "拆表的显式接受" },
    { flag: "--sheet", pyKey: "sheet", why: "多工作表时选哪一张" },
  ];

  test("StatRun 传的每个 CLI flag,Python 侧都认得(名字对不上即静默失效)", () => {
    const reg = files["tools/registry.ts"];
    const runpy = readFileSync(join(SRC, "../stat-kit/statkit/verbs/run.py"), "utf8");
    for (const { flag, pyKey, why } of CLI_FLAGS) {
      expect({ flag, why, "TS 传了": reg.includes(`"${flag}"`) })
        .toEqual({ flag, why, "TS 传了": true });
      // Python 侧:`opts.get("llm-model")` 或 `"sentinel-ok" in flags`
      expect({ flag, why, "Python 认": new RegExp(`["']${pyKey}["']`).test(runpy) })
        .toEqual({ flag, why, "Python 认": true });
    }
  });

  // ── advisory 的接受通道:跨语言的第三段(2026-08-07)────────────────────────
  //
  // 🔴 Python 侧已有一条 `test_every_advisory_accept_key_is_actually_acceptable`,
  //    但它只查到 `run_analysis` 形参与 CLI 为止 —— **模型调的是 StatRun 工具**。
  //    实测过这个断层:模型标识那条链,Python 端到端测试全绿,而把 TS 侧那句
  //    `args.push` 删掉照样全绿。accept 通道是同一个形状:
  //    情况目录 → 模型 → StatRun input_schema → argv → CLI → run_analysis,
  //    任何一跳断了,模型都会「照做然后什么都没发生」。
  test("每个 advisory 的 accept_key 都在 StatRun 的 input_schema 里且被透传", () => {
    const reg = files["tools/registry.ts"];
    const i = reg.indexOf('name: "StatRun"');
    const body = reg.slice(i, reg.indexOf('name: "StatReport"'));
    // 从 situations.py 里取 advisory 的 accept_key(单一真源,不在这里再抄一份)
    const py = readFileSync(join(SRC, "../stat-kit/statkit/situations.py"), "utf8");
    const keys = [...py.matchAll(/accept_key="([a-z_]+)"/g)].map((m) => m[1]);
    expect(keys.length).toBeGreaterThanOrEqual(5);
    for (const k of new Set(keys)) {
      expect({ key: k, "在 input_schema": new RegExp(`\\b${k}:\\s*\\{`).test(body) })
        .toEqual({ key: k, "在 input_schema": true });
      expect({ key: k, "被透传": new RegExp(`input\\.${k}`).test(body) })
        .toEqual({ key: k, "被透传": true });
    }
  });

  test("TS 与 Python 的目录常量一致(改一侧即红)", () => {
    const py = readFileSync(join(SRC, "../stat-kit/statkit/paths.py"), "utf8");
    const pick = (k: string): string | null => {
      const m = new RegExp(`^${k}\\s*=\\s*"([^"]*)"`, "m").exec(py);
      return m ? m[1] : null;
    };
    expect({
      ANALYSIS_DIR: pick("ANALYSIS_DIR"),
      BUNDLE_SUFFIX: pick("BUNDLE_SUFFIX"),
    }).toEqual({ ANALYSIS_DIR, BUNDLE_SUFFIX });
  });
});
