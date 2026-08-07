// 交付闸(D2)回归。
//
// 这一族守的是一个**很容易假绿**的闸:压住 artifact 帧看起来像拦住了,实际没有 ——
// backend 的收割是 on-list 的 `ListWorkspaceFiles(out/)`,与帧无关。
// 所以断言一律落在**盘上文件的位置**,不看帧、不看返回值里的 ok。

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, mkdir, writeFile, readFile, readdir, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runDeliveryGate } from "./deliveryGate.ts";
import { ANALYSIS_DIR } from "../sandbox/reserved.ts";

let workDir: string;

beforeEach(async () => {
  workDir = await realpath(await mkdtemp(join(tmpdir(), "delivery-gate-")));
  await mkdir(join(workDir, "out"), { recursive: true });
  await mkdir(join(workDir, ANALYSIS_DIR), { recursive: true });
});
afterEach(async () => {
  await rm(workDir, { recursive: true, force: true });
  delete process.env.STATKIT_NUMCHECK_ENFORCE;
});

async function writeBundle(values: Record<string, unknown>): Promise<void> {
  await writeFile(
    join(workDir, ANALYSIS_DIR, "abc123.bundle.json"),
    JSON.stringify({ schema: "statkit/bundle@1", ...values }),
    "utf8",
  );
}

/**
 * 🔴 没装 statkit 时这族测试会**整族失效** —— 而本机与常规 CI 路径上都没装。
 *
 * 2026-08-06 实测:本机跑 `bun test deliveryGate.test.ts` 是「4 pass」,
 * 但 expect 只执行了 **2 次**(4 条里 3 条在第一行就 return 了)。
 * 绿灯与「闸真的生效」之间没有任何关系 —— 这正是本仓库反复吃亏的
 * 「一条永远绿的规则等价于一条不存在的规则」。
 *
 * 跳过本身是对的(那个环境客观上跑不了),但**必须吵**:
 * 打印出来,让人一眼看见今天这轮到底验没验。
 * 真要验请在带 statkit 的镜像里跑:
 *   docker run --rm -v "$PWD/src:/app/src:ro" -w /app scholar-agent:latest bun test src/turn/deliveryGate.test.ts
 */
let skippedForNoStatkit = 0;
function skipNoStatkit(which: string): void {
  skippedForNoStatkit++;
  console.warn(
    `⚠️ [deliveryGate] 跳过「${which}」:本环境没有 statkit,交付闸探针不可用 —— ` +
      `本条**未验证**。在 scholar-agent 镜像里跑才算数。`,
  );
}

describe("交付闸 · 无 statkit / 无 bundle 时", () => {
  test("引擎不可用不得伪装成通过", async () => {
    // 关键:`ran:false` 与「跑过且没问题」必须可区分。把「没跑成」当成「通过」
    // 正是本仓反复吃亏的「一条永远绿的规则」。
    const r = await runDeliveryGate(workDir);
    expect(typeof r.ran).toBe("boolean");
    if (!r.ran) expect(r.quarantined).toEqual([]);
  });
});

describe("交付闸 · observe(默认)", () => {
  test("发现无源数字也**不隔离** —— 先采假阳性率再谈拦截", async () => {
    await writeBundle({ statistic: 1.23, p_exact: 0.045 });
    await writeFile(join(workDir, "out", "r.md"), "结论:t=9.99, p=0.0001", "utf8");

    const r = await runDeliveryGate(workDir);
    if (!r.ran) return skipNoStatkit("enforce-移出");

    expect(r.mode).toBe("observe");
    expect(r.quarantined).toEqual([]);
    // 🔴 断言落在盘上:文件必须还在 out/
    expect(await readdir(join(workDir, "out"))).toContain("r.md");
  });
});

describe("交付闸 · enforce", () => {
  test("🔴 含无源数字的交付物必须**物理移出 out/**(压帧不算数)", async () => {
    process.env.STATKIT_NUMCHECK_ENFORCE = "1";
    await writeBundle({ statistic: 1.23, p_exact: 0.045 });
    await writeFile(join(workDir, "out", "forged.md"), "两组差异显著(t=9.99, p=0.0001)", "utf8");

    const r = await runDeliveryGate(workDir);
    if (!r.ran) return skipNoStatkit("enforce-不误拦");

    expect(r.mode).toBe("enforce");
    // ① 从交付目录消失 —— backend 的 ListWorkspaceFiles(out/) 因此看不到它
    expect(await readdir(join(workDir, "out"))).not.toContain("forged.md");
    // ② 落在**保留区**里:模型的 Write/Edit 与 jail 内 Bash 都够不着,挪不回来
    const q = await readdir(join(workDir, ANALYSIS_DIR, "quarantine"));
    expect(q).toContain("forged.md");
    // ③ 🔴 用户必须看得见 —— 原断言只查 `r.noticeForModel`,而那个值
    //    从写出来那天起就**没有任何消费者**(emitArtifacts 丢掉了 runDeliveryGate 的返回值),
    //    唯一引用它的就是这一行:一条对着永远送不出去的值做的断言,永远绿。
    //    真实后果是 enforce 下文件静默消失,用户只看到报告不见了、out/ 里毫无线索。
    //    现在改断言**留在 out/ 里的那份说明** —— 它走已有的产物通道,用户一定看得到。
    const outFiles = await readdir(join(workDir, "out"));
    const notice = outFiles.find((f) => f.includes("交付闸"));
    expect(notice).toBeDefined();
    const body = await readFile(join(workDir, "out", notice!), "utf8");
    expect(body).toContain("forged.md");     // 说清是哪个文件
    expect(body).toContain("StatRun");        // 说清怎么办
    expect(body).toContain("StatReport");
    // ⚠️ 说明里不许复述被判无源的数字 —— 否则下一轮会把它自己扫出来
    expect(body).not.toContain("0.0001");
    expect(body).not.toContain("9.99");
  });

  test("数字全部有源的交付物**不得被误拦**", async () => {
    process.env.STATKIT_NUMCHECK_ENFORCE = "1";
    await writeBundle({ statistic: -3.0748, df: 46.5949, p_exact: 0.003517 });
    // 报告按显示精度舍入(-3.075 / 46.59 / 0.004)—— 这是**合法**的,不是无源
    await writeFile(
      join(workDir, "out", "ok.md"),
      "t(46.59)=-3.075,p=0.004",
      "utf8",
    );

    const r = await runDeliveryGate(workDir);
    if (!r.ran) return skipNoStatkit("observe-不移动");

    expect(r.quarantined).toEqual([]);
    expect(await readdir(join(workDir, "out"))).toContain("ok.md");
  });
});
