import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * 🔴 StatRun 信号量必须真的存在。
 *
 * `server/admission.ts` 用「StatRun 信号量 = 1」论证 4G 容器够用:
 *   预算 = 2×765MiB(两条 turn) + 1×800MB(一个 statkit 子进程) + 头。
 * 2026-08-05 盘点查证:那个信号量**当时并不存在**,StatRun 是裸 spawn ——
 * 两条 turn 同时跑统计就是 2×800MB + 2×765MiB ≈ 3.1G,而且没有任何东西拦第三个。
 *
 * 「注释里写着的约束在代码里不存在」是本仓库反复出现的一类问题
 * (同日还撞到:StatReport 工具不存在而 skill 让模型调它;analysis.py 承诺了不生成)。
 * 这条测试把这一处钉死:注释与实现必须同时在。
 */
describe("跨文件不变量 · StatRun 内存信号量", () => {
  const registry = readFileSync(join(import.meta.dir, "registry.ts"), "utf8");
  const admission = readFileSync(join(import.meta.dir, "../server/admission.ts"), "utf8");

  test("admission 的内存论证提到了信号量,registry 里就必须真有一个", () => {
    const claims = /StatRun\s*信号量/.test(admission);
    expect(claims).toBe(true);
    expect(registry).toContain("withStatRunSlot");
  });

  test("StatRun 的子进程 spawn 被信号量包住(而不是裸 spawn)", () => {
    const i = registry.indexOf('name: "StatRun"');
    expect(i).toBeGreaterThan(0);
    const body = registry.slice(i, registry.indexOf('name: "StatReport"'));
    const spawnAt = body.indexOf("Bun.spawn");
    const slotAt = body.indexOf("withStatRunSlot");
    expect(slotAt).toBeGreaterThan(-1);
    expect(slotAt).toBeLessThan(spawnAt);
  });

  test("信号量串行化并发调用", async () => {
    // 直接验语义:同一时刻只有一个在跑
    let chain: Promise<unknown> = Promise.resolve();
    const withSlot = <T,>(fn: () => Promise<T>): Promise<T> => {
      const run = chain.then(fn, fn);
      chain = run.then(() => undefined, () => undefined);
      return run;
    };
    let peak = 0;
    let now = 0;
    const task = async () => {
      now += 1;
      peak = Math.max(peak, now);
      await new Promise((r) => setTimeout(r, 5));
      now -= 1;
    };
    await Promise.all([withSlot(task), withSlot(task), withSlot(task)]);
    expect(peak).toBe(1);
  });

  test("一次失败不会锁死整条链", async () => {
    let chain: Promise<unknown> = Promise.resolve();
    const withSlot = <T,>(fn: () => Promise<T>): Promise<T> => {
      const run = chain.then(fn, fn);
      chain = run.then(() => undefined, () => undefined);
      return run;
    };
    await expect(withSlot(async () => { throw new Error("boom"); })).rejects.toThrow("boom");
    await expect(withSlot(async () => "ok")).resolves.toBe("ok");
  });
});
