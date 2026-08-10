// /api/agents 注册表(2026-08-10):backend skill sync 的对端。
// 钉住:name 契约、upsert 幂等(同内容不换时间戳)、落盘/重载 roundtrip、prompt 上限。
import { describe, expect, test, beforeEach } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { upsertAgent, getAgent, listAgents, isValidAgentName, resetAgentsForTest } from "./agents.ts";

function useTempStore(): string {
  const file = join(mkdtempSync(join(tmpdir(), "agents-test-")), "agents.json");
  process.env.EXECUTOR_AGENTS_FILE = file;
  resetAgentsForTest();
  return file;
}

beforeEach(() => {
  useTempStore();
});

describe("isValidAgentName", () => {
  test("accepts backend feature slugs", () => {
    for (const n of ["scholay-smart-search", "scholay-claw", "a", "A9._-x"]) {
      expect(isValidAgentName(n)).toBe(true);
    }
  });
  test("rejects traversal / separators / empty / oversize", () => {
    for (const n of ["", "../etc", "a/b", ".hidden", "-lead", "x".repeat(200)]) {
      expect(isValidAgentName(n)).toBe(false);
    }
  });
});

describe("upsert + get + list", () => {
  test("create then read back", async () => {
    const r = await upsertAgent("scholay-smart-search", {
      description: "智能搜索",
      systemPrompt: "you are a search agent",
      color: "green",
    });
    expect(r.ok).toBe(true);
    const def = await getAgent("scholay-smart-search");
    expect(def?.systemPrompt).toBe("you are a search agent");
    expect((await listAgents()).length).toBe(1);
  });

  test("idempotent re-push keeps updatedAt (no churn on backend restarts)", async () => {
    const first = await upsertAgent("a1", { systemPrompt: "p" });
    if (!first.ok) throw new Error(first.error);
    const again = await upsertAgent("a1", { systemPrompt: "p" });
    if (!again.ok) throw new Error(again.error);
    expect(again.def.updatedAt).toBe(first.def.updatedAt);
    const changed = await upsertAgent("a1", { systemPrompt: "p2" });
    if (!changed.ok) throw new Error(changed.error);
    expect(changed.def.systemPrompt).toBe("p2");
  });

  test("persists across in-memory reset (container restart survival)", async () => {
    await upsertAgent("scholay-claw", { systemPrompt: "claw prompt", description: "d" });
    resetAgentsForTest(); // 模拟进程重启:内存清空,仅剩磁盘文件
    const def = await getAgent("scholay-claw");
    expect(def?.systemPrompt).toBe("claw prompt");
  });

  test("rejects invalid name and oversized prompt", async () => {
    expect((await upsertAgent("../bad", {})).ok).toBe(false);
    const big = await upsertAgent("ok-name", { systemPrompt: "x".repeat(300 * 1024) });
    expect(big.ok).toBe(false);
  });

  // 并发落盘(复审):backend 启动会并发推多个 feature。写入必须串行化 ——
  // 共享 tmp 路径的并发 writeFile+rename 会把半截 JSON 装进正式文件,
  // 重启加载时被静默吞成空注册表。断言:并发 upsert 后磁盘文件是合法 JSON 且全员在场。
  test("concurrent upserts persist a valid complete file", async () => {
    await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        upsertAgent(`feature-${i}`, { systemPrompt: `prompt-${i}`.repeat(50) }),
      ),
    );
    resetAgentsForTest(); // 只留磁盘文件,重新加载
    const defs = await listAgents();
    expect(defs.length).toBe(10);
    for (let i = 0; i < 10; i++) {
      expect((await getAgent(`feature-${i}`))?.systemPrompt).toContain(`prompt-${i}`);
    }
  });
});
