// 会话 cwd 入湖配额单测(2026-07 文件上传调研落地):env 帽须在 import 前设好(模块加载期读取)。
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.EXECUTOR_PUSH_FILE_MAX_BYTES = "1024"; // 单文件 1KB
process.env.EXECUTOR_SESSION_DISK_MAX_BYTES = "4096"; // 会话累计 4KB
process.env.EXECUTOR_SESSION_FILE_MAX_COUNT = "3"; // 会话文件数 3

const { pushSessionFile, putWorkspaceFile, QuotaError } = await import("./workspace.ts");

let workDir: string;

beforeAll(async () => {
  workDir = await mkdtemp(join(tmpdir(), "wsquota-"));
});
afterAll(async () => {
  await rm(workDir, { recursive: true, force: true });
});

function fileOf(name: string, bytes: number): File {
  return new File([new Uint8Array(bytes)], name);
}

describe("session quota", () => {
  test("单文件超帽 → QuotaError,不落盘", async () => {
    await expect(pushSessionFile(workDir, fileOf("big.bin", 2048))).rejects.toBeInstanceOf(QuotaError);
  });

  test("帽内文件正常落盘;文件数到帽后拒绝", async () => {
    const a = await pushSessionFile(workDir, fileOf("a.txt", 100));
    expect(a.size).toBe(100);
    await pushSessionFile(workDir, fileOf("b.txt", 100));
    await pushSessionFile(workDir, fileOf("c.txt", 100));
    // 已有 3 个文件 = SESSION_FILE_MAX_COUNT → 第 4 个拒
    await expect(pushSessionFile(workDir, fileOf("d.txt", 100))).rejects.toBeInstanceOf(QuotaError);
  });

  test("putWorkspaceFile 超累计磁盘帽 → QuotaError", async () => {
    // 现有 300B,写 4KB 会越过 4096 累计帽(300+4096>4096)
    await expect(putWorkspaceFile(workDir, "big2.bin", new Uint8Array(4096))).rejects.toBeInstanceOf(QuotaError);
  });

  test("覆盖写同名小文件不受影响", async () => {
    await putWorkspaceFile(workDir, "a.txt", new Uint8Array(50));
  });
});
