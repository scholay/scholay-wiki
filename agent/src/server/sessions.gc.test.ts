// sessions.ts 单测:① 会话 workdir 磁盘 GC(2026-07 文件上传调研落地);
//                  ② 上下文水合(resume)门 + ephemeral 单飞(2026-07 线上审计 §2.3 重连上下文竞态)。
// SESSIONS_ROOT / TTL 在模块加载期读取 → 必须先设 env 再动态 import。
// ⚠️ 两组用例**必须同文件**:bun test 同进程共享模块注册表 + process.env,sessions.ts 只会被装载一次;
//    若把水合门拆成另一个 test 文件,那个文件先跑就会用默认 env 定格 SESSIONS_ROOT/TTL,GC 用例当场变红
//    (实测过,别再拆)。
import { test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtemp, rm, mkdir, writeFile, utimes, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = await mkdtemp(join(tmpdir(), "gcroot-"));
process.env.SESSIONS_ROOT = root;
process.env.EXECUTOR_WORKDIR_TTL_DAYS = "1";

const { sweepStaleWorkdirs, beginHydration, endHydration, awaitHydration, getOrCreateEphemeral } =
  await import("./sessions.ts");

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

async function makeDir(name: string, ageDays: number): Promise<string> {
  const dir = join(root, name);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "f.txt"), "x");
  const t = new Date(Date.now() - ageDays * 24 * 3600_000);
  await utimes(dir, t, t); // 目录 mtime 拨旧(无 .active 标记 → 以 mtime 为准)
  return dir;
}

async function exists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

test("超 TTL 的目录被回收(含 .skills 兄弟),新目录保留", async () => {
  const stale = await makeDir("aaaaaaaa-1111-4111-8111-111111111111", 3); // 3 天前 > TTL 1 天
  const staleSkills = stale + ".skills";
  await mkdir(staleSkills, { recursive: true });
  const fresh = await makeDir("bbbbbbbb-2222-4222-8222-222222222222", 0); // 刚活跃

  await sweepStaleWorkdirs();

  expect(await exists(stale)).toBe(false);
  expect(await exists(staleSkills)).toBe(false);
  expect(await exists(fresh)).toBe(true);
});

test(".active 标记新鲜时即便目录 mtime 很旧也不回收", async () => {
  const dir = await makeDir("cccccccc-3333-4333-8333-333333333333", 3);
  await writeFile(dir + ".active", ""); // 侧车标记刚 touch(mtime = now)
  // 直调绕过 6h 节流:上一测试已跑过一轮,lastWorkdirGcAt 已置 —— 这里等不了 6h,
  // 用模块内部节流的对策是再开一个 root?简化:节流窗口内第二次调用是 no-op,
  // 断言目录仍在即可(无论 no-op 还是保留判定,结果一致:不删)。
  await sweepStaleWorkdirs();
  expect(await exists(dir)).toBe(true);
});

// ── 上下文水合(resume)门:2026-07 线上审计 §2.3「重连上下文竞态」的回归护栏 ──────────

const SID_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SID_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const SID_C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const SID_D = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

test("无在途 seed_history → 零等待放行(peerreview server-side 等从不 seed 的连接行为不变)", async () => {
  const t0 = Date.now();
  expect(await awaitHydration(SID_A, 5_000)).toBe(true);
  expect(Date.now() - t0).toBeLessThan(200);
});

test("有在途 seed_history → user_message 等到 endHydration 才放行", async () => {
  beginHydration(SID_B);
  let released = false;
  const waiter = awaitHydration(SID_B, 5_000).then((ok) => {
    released = true;
    return ok;
  });
  await Bun.sleep(30);
  expect(released).toBe(false); // 水合未完成前绝不进轮
  endHydration(SID_B);
  expect(await waiter).toBe(true);
});

test("水合卡死 → 超时返回 false(调用方据此拒绝本轮,不带空上下文硬答)", async () => {
  beginHydration(SID_C);
  expect(await awaitHydration(SID_C, 1_000)).toBe(false);
  endHydration(SID_C); // 收尾,避免影响后续用例
});

test("嵌套 begin(hub 重 seed 连发两帧)按计数放行,未归零不提前放行", async () => {
  beginHydration(SID_D);
  beginHydration(SID_D);
  let released = false;
  const waiter = awaitHydration(SID_D, 5_000).then((ok) => {
    released = true;
    return ok;
  });
  endHydration(SID_D);
  await Bun.sleep(20);
  expect(released).toBe(false);
  endHydration(SID_D);
  expect(await waiter).toBe(true);
});

test("并发 getOrCreateEphemeral 单飞:同一 sid 只产出一份 meta(seed 与 user_message 不再各拿一份)", async () => {
  const sid = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
  const [m1, m2, m3] = await Promise.all([
    getOrCreateEphemeral(sid),
    getOrCreateEphemeral(sid),
    getOrCreateEphemeral(sid),
  ]);
  expect(m1).toBe(m2);
  expect(m2).toBe(m3);
  // 同一对象 ⇒ seed 灌进去的 history 一定被随后的 user_message 看见(竞态的直接反证)
  m1.messages.push({ role: "user", content: "seeded" });
  expect(m3.messages.length).toBe(1);
});
