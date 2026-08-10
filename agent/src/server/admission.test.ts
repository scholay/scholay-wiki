// admission 并发准入信号量单测(性能审计 P0)。默认 MAX_CONCURRENT_TURNS=2(env 未设时)。
import { test, expect } from "bun:test";
import { tryAcquireTurn, turnSlotsInUse, maxTurnSlots, admitByMemory, parseSlots } from "./admission.ts";

test("满员即拒(返回 null),释放后可再占;release 幂等", () => {
  const cap = maxTurnSlots();
  expect(cap).toBeGreaterThanOrEqual(1);

  const releases: Array<() => void> = [];
  // 占满所有槽
  for (let i = 0; i < cap; i++) {
    const r = tryAcquireTurn();
    expect(r).not.toBeNull();
    releases.push(r!);
  }
  expect(turnSlotsInUse()).toBe(cap);

  // 满员:再占返回 null(即刻拒,不排队)
  expect(tryAcquireTurn()).toBeNull();

  // 释放一个 → 腾出一个槽
  releases[0]!();
  expect(turnSlotsInUse()).toBe(cap - 1);
  const r2 = tryAcquireTurn();
  expect(r2).not.toBeNull();
  expect(turnSlotsInUse()).toBe(cap);
  r2!();

  // release 幂等:重复调用不重复归还
  releases[0]!(); // 已释放,再调无副作用
  expect(turnSlotsInUse()).toBe(cap - 1);

  // 清理:释放其余
  for (let i = 1; i < releases.length; i++) releases[i]!();
  expect(turnSlotsInUse()).toBe(0);
});

// 内存水位闸(2026-08-10):纯函数判定 —— 未启用(limit=null)一律放行;
// 启用后 usage ≤ limit 放行、> limit 拒绝(调用方回 busy 可重试)。
test("admitByMemory gates on usage watermark", () => {
  expect(admitByMemory(999_999_999_999, null)).toBe(true); // 未启用 = 行为与旧版一致
  const limit = 2800 * 1024 * 1024;
  expect(admitByMemory(limit, limit)).toBe(true); // 等于水位:放行(<= 语义)
  expect(admitByMemory(limit + 1, limit)).toBe(false);
  expect(admitByMemory(200 * 1024 * 1024, limit)).toBe(true);
});

// env 槽位解析(2026-08-10 复审):非法值必须回落默认 2 —— Math.max(1, NaN)=NaN 会让
// 并发上限静默失效,且 /api/admission 的 max 序列化成 null 误导 backend 让路闸。
test("parseSlots falls back to 2 on malformed env", () => {
  expect(parseSlots("4")).toBe(4);
  expect(parseSlots("2.9")).toBe(2); // 向下取整
  expect(parseSlots(undefined)).toBe(2);
  for (const bad of ["8x", "unlimited", "", "0", "-3", "NaN"]) {
    expect(parseSlots(bad)).toBe(2);
  }
});
