// 证据基座保留区的**两道物理闸** —— 2026-08-01 架构评估 P0 地基硬化。
//
// 🔴 被守护的立论:「E 编号由引擎独占分配、模型无工具可铸造 —— 这是结构上不可能而非检查」。
//    这句话在 2026-08-01 之前**是假的**:账本目录就在 workDir 里,而 workDir 是
//    ① 进程内文件工具(Write/Edit)与 ② jail 内 Bash 的可写面。任一条都能造 E 编号,
//    从而同时抽空「账本非空才准交付」的闸与 `[[E7]]` 句柄展开。
//
// 本文件钉死两件事:
//    A. confinePath 用 **canonical** 路径判定保留区 —— 词法判定会被 workDir 内的
//       `ln -s evidence x` 绕过,而那正是"看起来修好了其实没修"的形态(见下面第二条测试)。
//    B. bwrap 参数里保留区的只读覆盖层**在**可写 bind 之后,且用 `--ro-bind` 而非 `--ro-bind-try`。
//
// ⚠️ 为什么 A 和 B 缺一不可:只堵 A,模型 `echo >> evidence/ledger.jsonl` 就绕过去了(Bash 不走
//    confinePath);只堵 B,Write 工具根本不进 jail,直接写文件系统。**两道都在,才叫边界。**

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { RESERVED_DIRS, ANALYSIS_DIR } from "./reserved.ts";
import { mkdtemp, rm, mkdir, writeFile, symlink, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { confinePath } from "./confine.ts";
import { buildBwrapArgv } from "./bwrap.ts";
import { EVIDENCE_DIR } from "../evidence/paths.ts";

let workDir: string;
beforeEach(async () => {
  // realpath 一次:macOS 的 /var 是指向 /private/var 的符号链接,mkdtemp 给的是未解析形态。
  // 断言基准必须与 confinePath 的返回口径(canonical)一致,否则测的是平台差异不是行为。
  workDir = await realpath(await mkdtemp(join(tmpdir(), "reserved-")));
  // 建**清单里的每一个**保留区,而不是只建 evidence/ ——
  // 2026-08-05 推广成清单时这里漏了 analysis/,`analysis` 的 symlink 用例当场红:
  // symlink 指向不存在的目标 → realpath 解不出来 → canonical 判定看不到它在保留区里。
  // (这条红得好:它说明 confinePath 的保留区判定依赖目标真实存在,而 buildBwrapArgv
  //  正是为此在**用它的那一点**上自己 mkdir,不把不变式托付给远处的调用方。)
  for (const d of RESERVED_DIRS) await mkdir(join(workDir, d), { recursive: true });
});
afterEach(async () => {
  await rm(workDir, { recursive: true, force: true });
});

describe("闸A · confinePath 保留区拒写", () => {
  test("直写 evidence/ledger.jsonl 必须被拒", async () => {
    await expect(confinePath(workDir, "evidence/ledger.jsonl", true)).rejects.toThrow(/engine-reserved/);
  });

  test("保留区目录本身也不得写", async () => {
    await expect(confinePath(workDir, "evidence", true)).rejects.toThrow(/engine-reserved/);
  });

  test("🔴 经 workDir 内符号链接绕行必须被拒(词法判定在这里会放行)", async () => {
    // 这正是"加一条 evidence/ 前缀拒写"的天真修法漏掉的那一格:
    // 旧 confinePath 返回**词法**路径 `<root>/x/ledger.jsonl`,前缀不匹配 evidence/ ⇒ 放行,
    // 而写入实际落到 evidence/ledger.jsonl。forWrite 的 lstat 只查末段,查不到中间这节。
    await symlink(join(workDir, EVIDENCE_DIR), join(workDir, "x"));
    await expect(confinePath(workDir, "x/ledger.jsonl", true)).rejects.toThrow(/engine-reserved/);
  });

  test("嵌套符号链接同样拒(a→b→evidence)", async () => {
    await symlink(join(workDir, EVIDENCE_DIR), join(workDir, "b"));
    await symlink(join(workDir, "b"), join(workDir, "a"));
    await expect(confinePath(workDir, "a/passages.jsonl", true)).rejects.toThrow(/engine-reserved/);
  });

  test("/work 别名形态也拒(模型跑过 Bash 后会用这个前缀)", async () => {
    await expect(confinePath(workDir, "/work/evidence/ledger.jsonl", true)).rejects.toThrow(/engine-reserved/);
  });

  test("**读**保留区仍然允许 —— 拒的是写,不是读(EvidenceGet 要用)", async () => {
    await writeFile(join(workDir, EVIDENCE_DIR, "ledger.jsonl"), "");
    const p = await confinePath(workDir, "evidence/ledger.jsonl", false);
    expect(p).toBe(join(workDir, EVIDENCE_DIR, "ledger.jsonl"));
  });

  test("保留区之外照常可写(别把闸开太大)", async () => {
    const p = await confinePath(workDir, "out/report.md", true);
    expect(p).toBe(join(workDir, "out", "report.md"));
  });

  test("名字相近的目录不得误伤(evidence-notes / my-evidence)", async () => {
    await expect(confinePath(workDir, "evidence-notes/a.md", true)).resolves.toContain("evidence-notes");
    await expect(confinePath(workDir, "my-evidence/a.md", true)).resolves.toContain("my-evidence");
  });

  test("confinePath 返回 canonical 路径(否则下一个前缀判定又会被绕过)", async () => {
    await mkdir(join(workDir, "real"), { recursive: true });
    await symlink(join(workDir, "real"), join(workDir, "link"));
    const p = await confinePath(workDir, "link/f.txt", false);
    expect(p).toBe(join(workDir, "real", "f.txt"));
  });
});

// 2026-08-05:保留区从「单个 evidence/」推广成清单(evidence + analysis)。
// 🔴 推广时最容易的失败模式是**只测第一个** —— 新加的目录漏挂 ro-bind / 漏进 inReserved,
//    而既有测试照样全绿(「一条永远绿的规则」的又一种形态)。故本族对**清单里每一个目录**参数化。
describe("闸A · 保留区清单逐个覆盖(防「只测第一个」)", () => {
  for (const dir of RESERVED_DIRS) {
    test(`直写 ${dir}/x.json 必须被拒`, async () => {
      await expect(confinePath(workDir, `${dir}/x.json`, true)).rejects.toThrow(/engine-reserved/);
    });
    test(`${dir} 目录本身也不得写`, async () => {
      await expect(confinePath(workDir, dir, true)).rejects.toThrow(/engine-reserved/);
    });
    test(`经符号链接绕行 ${dir} 必须被拒(词法判定会放行)`, async () => {
      await symlink(join(workDir, dir), join(workDir, `alias-${dir}`)).catch(() => {});
      await expect(confinePath(workDir, `alias-${dir}/x.json`, true)).rejects.toThrow(/engine-reserved/);
    });
    test(`读 ${dir} 仍然允许 —— 拒的是写不是读`, async () => {
      await expect(confinePath(workDir, `${dir}/x.json`, false)).resolves.toBeTruthy();
    });
    test(`名字相近的目录不得误伤(${dir}-notes / my-${dir})`, async () => {
      await expect(confinePath(workDir, `${dir}-notes/x.md`, true)).resolves.toBeTruthy();
      await expect(confinePath(workDir, `my-${dir}/x.md`, true)).resolves.toBeTruthy();
    });
  }

  test("清单本身非空,且含数据分析的 bundle 目录", () => {
    // 若哪天有人把 analysis/ 从清单里摘掉,「数字不经模型手」立刻退回一句话 —— 这里当场红。
    expect(RESERVED_DIRS.length).toBeGreaterThanOrEqual(2);
    expect(RESERVED_DIRS).toContain(ANALYSIS_DIR);
  });
});

describe("闸B · jail 只读覆盖层", () => {
  const profile = () => ({ cwd: workDir, roBinds: [], net: "none" }) as never;

  test("保留区只读覆盖必须排在可写 bind 之后(bwrap 后者盖前者)", () => {
    const argv = buildBwrapArgv(profile(), ["/bin/true"]);
    const writable = argv.findIndex((a, i) => a === "--bind" && argv[i + 1] === workDir);
    const overlay = argv.findIndex(
      (a, i) => a === "--ro-bind" && argv[i + 1] === join(workDir, EVIDENCE_DIR),
    );
    expect(writable).toBeGreaterThan(-1);
    expect(
      overlay,
      "\njail 里没有保留区只读覆盖层 ⇒ 模型一句 `echo >> evidence/ledger.jsonl` 即可伪造 E 编号。\n",
    ).toBeGreaterThan(-1);
    expect(
      overlay > writable,
      "\n只读覆盖排在了可写 bind **之前** —— bwrap 按顺序应用,后者盖前者,\n" +
        "顺序反了等于覆盖层不存在(而且看起来是有的,最坏的一种)。\n",
    ).toBe(true);
  });

  test("必须用 --ro-bind 而非 --ro-bind-try(源缺失要炸,不要静默跳过)", () => {
    const argv = buildBwrapArgv(profile(), ["/bin/true"]);
    const src = join(workDir, EVIDENCE_DIR);
    const tryIdx = argv.findIndex((a, i) => a === "--ro-bind-try" && argv[i + 1] === src);
    expect(
      tryIdx,
      "\n保留区用了 --ro-bind-try:源不存在时它**静默跳过**,新会话首轮 jail 就是可写的,\n" +
        "而我们会以为闸在生效 —— 又一条永远绿的规则。\n",
    ).toBe(-1);
  });

  test("buildBwrapArgv 自己保证保留区目录存在(存量会话不能因此全挂)", async () => {
    // prod 有 ./data/agent-sessions 绑定挂载,会话跨容器重启存活 ⇒ 存量会话没有 evidence/。
    // 用非 -try 的 ro-bind 时,目录不存在 = bwrap 启动失败 = 该会话所有 Bash 全挂。
    await rm(join(workDir, EVIDENCE_DIR), { recursive: true, force: true });
    expect(() => buildBwrapArgv(profile(), ["/bin/true"])).not.toThrow();
    const { stat } = await import("node:fs/promises");
    const st = await stat(join(workDir, EVIDENCE_DIR));
    expect(st.isDirectory()).toBe(true);
  });
});
