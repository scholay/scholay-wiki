// admission 并发准入信号量单测(性能审计 P0)。默认 MAX_CONCURRENT_TURNS=2(env 未设时)。
import { test, expect } from "bun:test";
import { tryAcquireTurn, turnSlotsInUse, maxTurnSlots } from "./admission.ts";

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
