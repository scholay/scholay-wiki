// --add-dir skill / CLAUDE.md 加载(H6)。镜像 fork 的 per-feature skill 作用域:
//   claw → /claw-add(含 CLAUDE.md 渲染约束 + .claude/skills/library-reference)
//   prism → /prism-add/.claude/skills(写作格式 skill)
//   peerreview → /peerreview-add/.claude/skills(reviewer-roster + rv-* 评审人格)
//
// clean-room 实现:不复刻 fork 的「按需调用 skill」机制,而是把这些目录的 CLAUDE.md(始终生效规则)
// + 各 skill 的 SKILL.md(指南正文)读出来拼成 system prompt 后缀,使指南始终在场。对 claw 渲染约束
// 与 peerreview 评审人格这类「始终应生效」的内容,效果等价;够用且无血统。

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { log } from "../obs/log.ts";

const PER_SKILL_CAP = 8000; // 单个 SKILL.md 截断上限(防超长)
const TOTAL_CAP = 40000; // 总后缀上限

function safeRead(path: string): string {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return "";
  }
}

function listSkillDirs(skillsRoot: string): string[] {
  try {
    return readdirSync(skillsRoot, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => join(skillsRoot, e.name))
      .sort(); // 确定性顺序:readdir 目录序随文件系统而变,触帽时「丢哪一半」不能是不确定的
  } catch {
    return [];
  }
}

// ── 按需技能菜单(guides/)──────────────────────────────────────────────────
// 常驻只注入「有哪些技能可按需加载 + 何时用」,正文不常驻(避免每轮为所有 skill 付 token /
// 稀释注意力)。正文由模型经 Skill 工具按 name 加载(registry.ts skillTool)。
const GUIDES_SUBDIR = "guides";

// frontmatterField:从 SKILL.md 顶部 YAML frontmatter(--- 之间)抓 "key: value" 的 value。
function frontmatterField(text: string, key: string): string {
  const t = text.replace(/^﻿?\s*/, "");
  if (!t.startsWith("---")) return "";
  const end = t.indexOf("\n---", 3);
  if (end < 0) return "";
  for (const line of t.slice(3, end).split("\n")) {
    const s = line.trim();
    if (s.startsWith(key + ":")) return s.slice(key.length + 1).trim();
  }
  return "";
}

// buildSkillMenu:扫每个 addDir 的 guides/*/SKILL.md,读 frontmatter 的 when_to_use(退回 description),
// 拼成一份轻量菜单。空则返回 ""。
// V3-B1:菜单块此前在 TOTAL_CAP 之外**无界线性膨胀**(唯一随 lens 数增长的常驻块)→ 加显式帽 + 计量。
//   触帽 = 被丢 lens 静默不可发现/不可加载(比 token 膨胀更糟)→ 大声 warn 点名,这是「该合并/分层」的硬信号,不是终态。
// V3-B2 层一:按 frontmatter `axis`(craft/rigor)分组输出 —— 平铺几十条近义列表是选择退化主因,
//   分组给导航护栏(domain-organization 手法),零新机制、内容仍随 :ro 挂载静态 → 缓存友好。
const MENU_CAP_CHARS = Number(process.env.EXECUTOR_SKILL_MENU_CAP || 2500);

function buildSkillMenu(addDirs: string[]): string {
  const entries: { name: string; when: string; axis: string }[] = [];
  for (const dir of addDirs) {
    let subs: string[];
    try {
      subs = readdirSync(join(dir, GUIDES_SUBDIR), { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => e.name)
        .sort(); // 确定性顺序
    } catch {
      continue; // 该 addDir 无 guides/
    }
    for (const name of subs) {
      const body = safeRead(join(dir, GUIDES_SUBDIR, name, "SKILL.md"));
      if (!body) continue;
      entries.push({
        name,
        // 菜单行是路由指针,不是完整边界说明:优先用短 `menu:` 字段(≤60 字符,lint 强制),
        // when_to_use 的完整互斥边界文本留在文件里、Skill 加载正文时才付 token(V4-B1 菜单经济)。
        when: (frontmatterField(body, "menu") || frontmatterField(body, "when_to_use") || frontmatterField(body, "description")).trim(),
        axis: frontmatterField(body, "axis").trim(),
      });
    }
  }
  if (entries.length === 0) return "";

  // axis 分组(组内保持字典序;无 axis 的通用指南归「其它」,兼容 claw 等非写作 guides)。
  const groups: { title: string; match: (a: string) => boolean }[] = [
    { title: "### craft · 把内容写好(结构/清晰/论证/起草…)", match: (a) => a === "craft" },
    { title: "### rigor · 严谨与诚实(统计/因果/可复现/报告…)", match: (a) => a === "rigor" },
    { title: "### 其它", match: (a) => a !== "craft" && a !== "rigor" },
  ];
  const sections: string[] = [];
  let total = 0;
  const dropped: string[] = [];
  let capped = false;
  for (const g of groups) {
    const lines: string[] = [];
    for (const e of entries.filter((x) => g.match(x.axis))) {
      const line = `- \`${e.name}\`${e.when ? ":" + e.when : ""}`;
      if (capped || total + line.length > MENU_CAP_CHARS) {
        capped = true;
        dropped.push(e.name);
        continue;
      }
      lines.push(line);
      total += line.length;
    }
    if (lines.length > 0) sections.push(g.title + "\n" + lines.join("\n"));
  }
  if (dropped.length > 0) {
    log.warn("skill menu hit cap; entries dropped — merge/split lenses, cap is a signal not a fix", {
      cap: MENU_CAP_CHARS, entries: entries.length, dropped: dropped.join(","),
    });
  }
  // B1 计量:每会话组合首次装载记一行(docker logs grep skill_menu_built 看常驻菜单规模走势)。
  log.info("skill_menu_built", { entries: entries.length - dropped.length, chars: total, dropped: dropped.length });
  return (
    "## 技能菜单(按需加载 / Skill menu)\n" +
    "下面是可**按需加载**的深度技能指南,按用途分组。遇到对应症状/任务时,**先调用 Skill 工具按名字把完整指南读进来、再动手**" +
    '(例:`Skill({"name":"wl-structure"})`)。不确定就先加载最贴近的那个;这些指南给的是做该类任务的流程/方法/门道。\n' +
    sections.join("\n")
  );
}

// addDirs 挂载是 :ro、容器内永不变 → 首轮读一次后按 addDirs 组合缓存,省掉每轮 ~8 次阻塞 readFileSync(评审 low)。
// 容器重启即清空,天然拿到重新部署后的新内容。
//
// ⚠️ 有界 LRU(不是无界 Map):per-user skill 市场引入后,claw 会话的 addDirs 里含 per-session 目录
// (路径含 sid,如 <SESSIONS_ROOT>/<sid>.skills)→ 每会话唯一 cacheKey。若无界缓存,dead session 的
// 条目永不回收 → 进程生命期内存泄漏。用插入序 Map 做 LRU:命中即刷新到队尾,超帽淘汰队首。
// per-session 目录内容在建会话时物化后不再变、sid 不复用,故缓存仍有效(同会话多轮命中),过期会话被自然挤出;
// 静态一方目录(/claw-add 等)因反复命中常驻队尾不被淘汰。
const ADDDIR_CACHE_CAP = Number(process.env.EXECUTOR_ADDDIR_CACHE_CAP || 256);
const addDirContextCache = new Map<string, string>();

// loadAddDirContext:读取 addDirs 的 CLAUDE.md + .claude/skills/*/SKILL.md(常驻)+ guides/ 技能菜单,拼成 system 后缀。
export function loadAddDirContext(addDirs: string[]): string {
  if (!addDirs || addDirs.length === 0) return "";
  const cacheKey = addDirs.join("|");
  const cached = addDirContextCache.get(cacheKey);
  if (cached !== undefined) {
    // LRU 命中:删后重插到队尾,使热键(静态一方目录)不被淘汰。
    addDirContextCache.delete(cacheKey);
    addDirContextCache.set(cacheKey, cached);
    return cached;
  }
  const parts: string[] = [];
  let total = 0;
  let cappedWarned = false;
  const push = (label: string, body: string) => {
    const trimmed = body.trim();
    if (!trimmed) return;
    if (total >= TOTAL_CAP) {
      // 触总量帽 → 静默丢弃会让「system 里少了半份指南」无从察觉;至少 warn 一次点名被丢的段。
      if (!cappedWarned) {
        log.warn("addDir context hit total cap; dropping remaining skills/rules", { total_cap: TOTAL_CAP, dropped_from: label });
        cappedWarned = true;
      }
      return;
    }
    if (trimmed.length > PER_SKILL_CAP) {
      log.warn("addDir skill truncated to per-skill cap", { per_skill_cap: PER_SKILL_CAP, label, orig_len: trimmed.length });
    }
    const chunk = `## ${label}\n${trimmed.slice(0, PER_SKILL_CAP)}`;
    parts.push(chunk);
    total += chunk.length;
  };

  for (const dir of addDirs) {
    // 始终生效规则:<dir>/CLAUDE.md(claw 渲染约束)
    push(`项目规则 (${dir}/CLAUDE.md)`, safeRead(join(dir, "CLAUDE.md")));
    // skills:<dir>/.claude/skills/<name>/SKILL.md
    for (const skillDir of listSkillDirs(join(dir, ".claude", "skills"))) {
      let body = safeRead(join(skillDir, "SKILL.md"));
      if (!body) {
        // 兼容大小写 / 备用文件名
        body = safeRead(join(skillDir, "skill.md")) || safeRead(join(skillDir, "README.md"));
      }
      if (body) push(`Skill: ${skillDir.split("/").pop()}`, body);
    }
  }

  // 按需技能菜单:直接 push(不过 push() 的容量帽)—— 它是「有哪些技能可加载」的路由,绝不能被丢。
  const menu = buildSkillMenu(addDirs);
  if (menu) parts.push(menu);

  const result = parts.length === 0 ? "" : "# 加载的项目规则与 Skills\n\n" + parts.join("\n\n");
  addDirContextCache.set(cacheKey, result);
  // LRU 淘汰:超帽时删队首(最久未命中)。Map 迭代序 = 插入序,命中已 delete+re-set 到队尾。
  while (addDirContextCache.size > ADDDIR_CACHE_CAP) {
    const oldest = addDirContextCache.keys().next().value;
    if (oldest === undefined) break;
    addDirContextCache.delete(oldest);
  }
  return result;
}

// hasReadableDir:探测某 addDir 是否挂载可读(用于诊断)。
export function dirReadable(dir: string): boolean {
  try {
    return statSync(dir).isDirectory();
  } catch {
    return false;
  }
}
