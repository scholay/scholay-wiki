import { describe, expect, test } from "bun:test";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * 🔴 跨文件不变量:`.env*` 里的 AGENT_EXECUTOR_FEATURES 不得少于 docker-compose 的默认值。
 *
 * 实测事故(2026-08-06):三份 .env 都写着不含 `stat_lab` 的显式值,而两份 compose 的默认值
 * (`${AGENT_EXECUTOR_FEATURES:-...,stat_lab}`)是**对的** —— 显式赋值把正确的默认盖掉了。
 *
 * 后果精确而隐蔽:新建会话第一程完全正常;但 executor 侧 meta 被回收后
 * (30min 空闲 / agent 容器重启)继续聊同一会话时,历史照常显示(走 journal),
 * **模型却完全不记得前面说过什么、传过什么文件,且没有任何错误提示** —— 用户只会觉得模型犯傻。
 * system prompt 也一起丢,stat_lab 的整个安全叙事随之蒸发。
 *
 * 「默认值是对的、显式覆盖过期了」是配置类漂移最常见的形态,而且它**永远不会报错**。
 * 这条测试把两边钉在一起:加 feature 时漏改 .env 会当场红。
 */
describe("跨文件不变量 · AGENT_EXECUTOR_FEATURES", () => {
  const ROOT = join(import.meta.dir, "../../..");
  const parse = (text: string, re: RegExp): string[] | null => {
    const m = re.exec(text);
    return m ? m[1].split(",").map((s) => s.trim()).filter(Boolean) : null;
  };

  const composeDefaults = ["docker-compose.yml", "docker-compose.prod.yml"]
    .map((f) => join(ROOT, f))
    .filter(existsSync)
    .map((p) => ({
      file: p,
      feats: parse(readFileSync(p, "utf8"), /AGENT_EXECUTOR_FEATURES:\s*\$\{AGENT_EXECUTOR_FEATURES:-([^}]+)\}/),
    }))
    .filter((x) => x.feats);

  const envFiles = [".env", ".env.example", ".env.prod"]
    .map((f) => join(ROOT, f))
    .filter(existsSync)
    .map((p) => ({
      file: p,
      feats: parse(readFileSync(p, "utf8"), /^AGENT_EXECUTOR_FEATURES=(.+)$/m),
    }))
    .filter((x) => x.feats);

  test("compose 里确实声明了默认值(锚点还在)", () => {
    expect(composeDefaults.length).toBeGreaterThan(0);
  });

  test("每份 .env 的显式值都不得少于 compose 默认值", () => {
    const expected = new Set(composeDefaults.flatMap((c) => c.feats!));
    for (const e of envFiles) {
      const have = new Set(e.feats!);
      const missing = [...expected].filter((f) => !have.has(f));
      expect({ file: e.file.split("/").pop(), missing }).toEqual({
        file: e.file.split("/").pop(),
        missing: [],
      });
    }
  });

  test("stat_lab 在每一处都在(定点回归)", () => {
    for (const x of [...composeDefaults, ...envFiles]) {
      expect(x.feats).toContain("stat_lab");
    }
  });
});
