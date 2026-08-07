import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";
import { PER_SKILL_CAP, TOTAL_CAP } from "./loader.ts";

/**
 * 🔴 仓库里的每份 SKILL.md 都必须装得下 —— 超限**不是警告,是内容从未送达**。
 *
 * ## 它挡的是哪次事故
 *
 * `agent-skills/stat-lab-skills/workbench/SKILL.md` 长期是 8886 字,而 cap 是 8000 ——
 * **末尾 886 字被静默截掉**。丢的正好是文件最后那几段:
 *   · 隐私三句话的原文(存在哪 / 存多久 / 会不会拿去训练)
 *   · 三条法律禁语(不许说「我已帮你脱敏」「符合 GDPR/HIPAA」「你的数据不会被用于训练」)
 *   · contested(方法学有分歧时如实转达)的纪律
 *
 * E2E 的 AD-05「隐私三句话一句都没说」因此被长期误诊成「模型不听话」——
 * 真因是**那段文字从来没进过 system prompt**。
 *
 * ## 为什么护栏放在测试里而不是只调大 cap
 *
 * 调大只能治这一次。SKILL.md 的写作惯例是**越重要的约束越往后写**(红线、禁语都在末尾),
 * 所以「从尾部截断」这个行为本身就与内容组织方式正面冲突 —— 下一次超限还会丢掉最要紧的部分。
 * 这条测试让它在**代码离开本机之前**就红。
 *
 * ⚠️ 触发时**不要**直接调大 cap 了事:先问这份 SKILL 是不是可以更短
 * (2026-08-06 那次:引擎的 30 种情况改成 `statkit situations` 可查之后,
 *  SKILL 里逐条枚举的段落就是冗余的)。调大之前请照着 loader.ts 里那段注释重算一次账。
 */
describe("SKILL 体积护栏", () => {
  const ROOT = join(import.meta.dir, "../../../agent-skills");

  const skills: { path: string; label: string; len: number }[] = [];
  const walk = (dir: string): void => {
    if (!existsSync(dir)) return;
    for (const e of readdirSync(dir)) {
      const p = join(dir, e);
      if (statSync(p).isDirectory()) walk(p);
      else if (e === "SKILL.md" || e === "CLAUDE.md") {
        skills.push({ path: p, label: p.slice(ROOT.length + 1), len: readFileSync(p, "utf8").trim().length });
      }
    }
  };
  walk(ROOT);

  test("锚点:确实扫到了 SKILL 文件(否则本测试恒绿)", () => {
    expect(skills.length).toBeGreaterThan(3);
  });

  test("每份 SKILL 都在 PER_SKILL_CAP 之内(超限 = 末尾内容从未送达模型)", () => {
    const over = skills
      .filter((s) => s.len > PER_SKILL_CAP)
      .map((s) => ({ 文件: s.label, 长度: s.len, 超出: s.len - PER_SKILL_CAP }));
    expect(over).toEqual([]);
  });

  // ⚠️ **刻意不测 TOTAL_CAP**,理由值得写下来。
  //
  // TOTAL_CAP 管的是「常驻前缀」的总量,而哪些目录常驻、哪些是 `guides/` 懒加载
  // (菜单行常驻 + Skill 工具按需取正文),这个映射住在 **docker-compose 的挂载点**里
  // (`./agent-skills/prism-skills:/prism-add/.claude/skills` 是常驻,
  //   `./agent-skills/prism-lenses:/prism-add/guides` 是懒加载)。
  //
  // 在这里按目录求和,要么误伤懒加载目录(prism-lenses 单独就 147KB,一测必红),
  // 要么得在测试里再抄一份挂载映射 —— 而「同一份映射两个副本」正是本轮审计里
  // dev/prod compose 漂移两个月的那个形态。宁可不测,也不要造第二份真源。
  //
  // TOTAL_CAP 的已知陷阱(reviewer-skills 33 份 /132KB,触帽后排序在后的
  // 6 个横切质量维度被整族丢弃、日志只有一条 warn)记在 docker-compose.yml 的
  // volumes 注释里 —— 那是它唯一说得清的地方。
});
