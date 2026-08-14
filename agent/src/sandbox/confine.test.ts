// 2026-07 审查([0]/[17]/[20]):/work 别名此前只在后端 pathWithin 存在(单边),执行器侧
// confinePath 仍抛 path escapes workDir → 「W0 沙箱上线后文件工具全被拒」这条回归没被真修好。
// 本测试锁住入站翻译的两条性质:① /work/** 落到会话 cwd 对应位置;② 翻译后仍受越界校验管辖。

import { test, expect } from "bun:test";
import { mkdtemp, mkdir, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { confinePath } from "./confine.ts";

async function makeWorkDir(): Promise<string> {
  const d = await mkdtemp(join(tmpdir(), "confine-"));
  await mkdir(join(d, "out"), { recursive: true });
  return await realpath(d); // canonicalize:macOS 的 /var → /private/var
}

test("/work 前缀翻译成会话 cwd", async () => {
  const workDir = await makeWorkDir();
  expect(await confinePath(workDir, "/work/out/a.md")).toBe(join(workDir, "out", "a.md"));
  expect(await confinePath(workDir, "/work")).toBe(workDir);
  expect(await confinePath(workDir, "/work/out")).toBe(join(workDir, "out"));
});

test("翻译与相对路径/真实绝对路径同解", async () => {
  const workDir = await makeWorkDir();
  expect(await confinePath(workDir, "/work/out/a.md")).toBe(await confinePath(workDir, "out/a.md"));
  expect(await confinePath(workDir, "/work/out/a.md")).toBe(await confinePath(workDir, join(workDir, "out/a.md")));
});

test("/work 别名不能借 .. 逃逸", async () => {
  const workDir = await makeWorkDir();
  await expect(confinePath(workDir, "/work/../etc/passwd")).rejects.toThrow(/escapes workDir/);
  await expect(confinePath(workDir, "/work/out/../../../etc/passwd")).rejects.toThrow(/escapes workDir/);
});

test("非 /work 的绝对路径仍一律拒", async () => {
  const workDir = await makeWorkDir();
  await expect(confinePath(workDir, "/etc/passwd")).rejects.toThrow(/escapes workDir/);
  // 前缀相近但不同的目录不得被误命中(/workspace ≠ /work)
  await expect(confinePath(workDir, "/workspace/x")).rejects.toThrow(/escapes workDir/);
});
