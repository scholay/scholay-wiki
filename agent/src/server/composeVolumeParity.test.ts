import { describe, expect, test } from "bun:test";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * 🔴 跨文件不变量:`docker-compose.yml` 与 `docker-compose.prod.yml` 的 **agent 服务 volumes 必须一致**。
 *
 * ## 它挡的是哪次事故(真的发生过,不是假想)
 *
 * `- ./data/agent-sessions:/home/bun/sessions` 这一行:
 *   · 2026-06-01 `35bf0ecc3` 加进 prod;
 *   · 2026-06-04 `250cad3a2` 加进 dev;
 *   · 2026-06-30 `a30add8d2`「优化 agent架构」把 dev 的整个 volumes 块从 `./agent/data/claude/*`
 *     整块删掉、整块重写成 `./agent-skills/*` —— **这一行被顺带删了,prod 同 commit 保住**。
 *
 * 于是 dev 与 prod 漂移了两个月。代价是实的:会话工作目录只活在容器可写层,
 * 任何 `up -d --build` 都清空,而 `analysis/*.bundle.json` 是「交付物里每个数字可溯源」的**唯一**源
 * (`statkit numcheck` 的 sources 全部来自它)。交付物本身在 MinIO 里 upsert-only 永久留存,
 * 源却随容器重建即灭 ⇒ 2026-08-06 实测:209 个 stat_lab 会话里 **203 个的 bundle 已不可复核**。
 *
 * ## 为什么光靠注释挡不住
 *
 * 同一次重写还删掉了 `/etc/localtime`,那条在 2026-07 被单独补回(容器跑 UTC,症状明显、当天就发现)。
 * **也就是说当时已经发现「整块重写有漏项」并排查过一轮,却只补回了两条里的一条。**
 * 会立刻报错的那条被发现了,静默的那条没有 —— 而恰恰是静默的那条更贵。
 * ⇒ 这类漏项的正解不是「下次小心点」,是让它当场红。
 *
 * ## 为什么比的是「集合」而不是「dev ⊇ prod」
 *
 * 两个方向都要挡:
 *   · dev 少一条 → 就是上面这次事故(本机行为与线上不一致,而 dev 正是我们跑评测、做审计的地方);
 *   · prod 少一条 → 更贵(新 feature 的 skill 挂载只加进 dev,线上那个 feature 直接哑掉,
 *     且 `--add-dir` 指向不存在的目录时 agent 不报错,只是那份 skill 不生效 —— 静默劣化)。
 *
 * 需要真差异时**显式加进 ALLOWED_DIFF 并写理由** —— 让它成为一次有记录的决定,而不是一次没人注意的删除。
 */
describe("跨文件不变量 · docker-compose 的 agent volumes", () => {
  const ROOT = join(import.meta.dir, "../../..");
  const FILES = ["docker-compose.yml", "docker-compose.prod.yml"];

  /**
   * 允许的差异。**今天是空的** —— 两份完全一致。
   * 往里加条目 = 声明「这条挂载只该出现在某一侧」,必须同时写清为什么。
   * 形如 `{ mount: "./x:/y", onlyIn: "docker-compose.prod.yml", why: "..." }`。
   */
  const ALLOWED_DIFF: { mount: string; onlyIn: string; why: string }[] = [];

  /**
   * 从 compose 文本里抽 agent 服务的 volumes 条目(去注释、去空行)。
   *
   * 刻意**逐行**解析而不用跨行正则:YAML 的块边界是缩进,而 JS 正则没有 `\Z`
   * (首版用了,被当成字面量 `Z` ⇒ 块一路吃到文件尾,解析恒失败)——
   * 那次是本文件的锚点测试当场抓到的,记一笔:锚点测试第一个抓到的是写它的人自己。
   */
  const agentVolumes = (text: string): string[] | null => {
    const lines = text.split("\n");
    const svcAt = lines.findIndex((l) => l === "  agent:");
    if (svcAt < 0) return null;
    const out: string[] = [];
    let inVolumes = false;
    for (let i = svcAt + 1; i < lines.length; i++) {
      const l = lines[i];
      if (l.trim() === "" || l.trimStart().startsWith("#")) continue;
      const indent = l.length - l.trimStart().length;
      if (indent <= 2) break;                       // 离开 agent 服务块
      if (indent === 4) inVolumes = l.trim() === "volumes:";  // 服务下的同级键
      else if (inVolumes && l.trim().startsWith("- ")) out.push(l.trim().slice(2).trim());
    }
    return out.length ? out : null;
  };

  const parsed = FILES.map((f) => join(ROOT, f))
    .filter(existsSync)
    .map((p) => ({ file: p.split("/").pop()!, vols: agentVolumes(readFileSync(p, "utf8")) }));

  // 🔴 锚点测试:解析器失效(compose 缩进/结构改了)时必须**红**,而不是静默拿到空集合然后「一致」。
  //    没有这一条,上面那个正则哪天匹配不到,本文件就变成一条永远绿的规则。
  test("两份 compose 都在场,且都能解析出 agent 的 volumes(锚点)", () => {
    expect(parsed.map((p) => p.file).sort()).toEqual([...FILES].sort());
    for (const p of parsed) {
      expect({ file: p.file, parsed: p.vols !== null }).toEqual({ file: p.file, parsed: true });
      expect(p.vols!.length).toBeGreaterThan(3);
    }
  });

  test("两份 compose 的 agent volumes 集合一致(差异须进 ALLOWED_DIFF)", () => {
    const [a, b] = parsed;
    const allowed = new Set(ALLOWED_DIFF.map((d) => `${d.onlyIn}::${d.mount}`));
    const onlyIn = (x: typeof a, y: typeof a) =>
      x.vols!
        .filter((m) => !y.vols!.includes(m))
        .filter((m) => !allowed.has(`${x.file}::${m}`));

    expect({ [`只在 ${a.file}`]: onlyIn(a, b), [`只在 ${b.file}`]: onlyIn(b, a) }).toEqual({
      [`只在 ${a.file}`]: [],
      [`只在 ${b.file}`]: [],
    });
  });

  // 定点回归:上面那条是通用规则,这条盯死出过事的那一行。
  // 通用规则哪天被 ALLOWED_DIFF 放宽了,这条仍然会红。
  test("会话工作目录挂载在两份里都在(2026-06-30 丢过一次)", () => {
    for (const p of parsed) {
      expect({ file: p.file, has: p.vols!.some((m) => m.endsWith(":/home/bun/sessions")) }).toEqual({
        file: p.file,
        has: true,
      });
    }
  });
});
