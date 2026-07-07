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

// loadAddDirContext:读取 addDirs 的 CLAUDE.md + .claude/skills/*/SKILL.md,拼成 system 后缀。
export function loadAddDirContext(addDirs: string[]): string {
  if (!addDirs || addDirs.length === 0) return "";
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

  if (parts.length === 0) return "";
  return "# 加载的项目规则与 Skills\n\n" + parts.join("\n\n");
}

// hasReadableDir:探测某 addDir 是否挂载可读(用于诊断)。
export function dirReadable(dir: string): boolean {
  try {
    return statSync(dir).isDirectory();
  } catch {
    return false;
  }
}
