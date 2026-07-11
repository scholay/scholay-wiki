#!/usr/bin/env python3
"""
Lint the reviewer-skill <<<SCORING_PERSONA>>> sections AND the reviewer-lens <<<LENS>>> sections.

智能审稿评分轮 (scoring round) 是 **Skill/Agent/Task 关闭** 的 —— 注入评分轮的 persona / lens 文本
如果含"调用某 skill / invoke / 起子 agent"之类指令, 模型会去碰被禁工具 → 产生权限拒绝 narration
落进 SSE 缓冲、抬高冲碎 JSON 概率 (红队 blocker)。

强制:
  1. 每个 agent-skills/reviewer-skills/rv-*/SKILL.md 有一个 <<<SCORING_PERSONA>>>...<<<END_SCORING_PERSONA>>>
     段, 且段内不得出现工具/技能调用词。
  2. 每个 agent-skills/reviewer-lenses/lens-*/SKILL.md 有一个 <<<LENS>>>...<<<END_LENS>>> 段, 段内:
     - 同样不得出现工具/技能调用词;
     - **额外**不得出现输出格式语言(json/schema/输出格式…)—— lens 只加"额外查什么", 不碰"如何作答";
       评分轮的唯一输出契约是 reviewerJSONSchemaSpec, lens 若重述会与之竞争、冲碎 JSON;
     - 长度封顶 (防人格稀释, 见多技能组合设计护栏)。
(sentinel 段之外的"选择期说明 / frontmatter"不受限。)

用法: python3 scripts/lint-reviewer-skills.py   (CI 里跑; 违规 exit 1)
"""
import glob
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SKILLS = os.path.join(ROOT, "agent-skills", "reviewer-skills")
LENSES = os.path.join(ROOT, "agent-skills", "reviewer-lenses")

# 段内禁止出现的词 (大小写不敏感)。minicod/检索在评分轮是被容忍的, 不禁; 但 skill/子agent 调用会触禁用墙。
FORBIDDEN = [
    r"\bskill\b",
    r"\btask\b",
    r"\bagent\b",
    r"\bsubagent\b",
    r"\binvoke\b",
    r"mcp__",
    r"调用.{0,6}(skill|技能)",
]

# lens 段**额外**禁止的输出格式语言 —— lens 绝不能重述"如何输出", 否则与唯一 JSON 契约竞争、冲碎评分 JSON。
LENS_FORBIDDEN_EXTRA = [
    r"\bjson\b",
    r"\bschema\b",
    r"输出格式",
    r"输出要求",
    r"返回.{0,6}(对象|json)",
]

LENS_MAX_CHARS = 1500  # <<<LENS>>> 段正文长度上限(防稀释)


def check_section(text, start, end, forbidden, section_label):
    """返回 (违规信息列表, 段正文或空串)。空列表 = 通过。"""
    m = re.search(re.escape(start) + r"(.*?)" + re.escape(end), text, re.S)
    if not m:
        return [f"missing {start}...{end} section"], ""
    section = m.group(1)
    if not section.strip():
        return [f"empty {section_label} section"], ""
    problems = []
    hits = []
    for pat in forbidden:
        for mm in re.finditer(pat, section, re.I):
            hits.append(f"{pat!r}->{mm.group(0)!r}")
    if hits:
        problems.append(f"{section_label} must not reference tools/skills/output-format: {', '.join(hits)}")
    return problems, section.strip()


def main() -> int:
    bad = 0
    total = 0

    # 1) reviewer 人格
    rv_files = sorted(glob.glob(os.path.join(SKILLS, "rv-*", "SKILL.md")))
    if not rv_files:
        print(f"[lint] no rv-*/SKILL.md found under {SKILLS}", file=sys.stderr)
        return 1
    for f in rv_files:
        rel = os.path.relpath(f, ROOT)
        text = open(f, encoding="utf-8").read()
        problems, _ = check_section(text, "<<<SCORING_PERSONA>>>", "<<<END_SCORING_PERSONA>>>", FORBIDDEN, "scoring persona")
        total += 1
        if problems:
            for p in problems:
                print(f"[lint] FAIL {rel}: {p}")
            bad += 1
        else:
            print(f"[lint] ok   {rel}")

    # 2) reviewer 视角 lens (目录可不存在 → 跳过)
    lens_files = sorted(glob.glob(os.path.join(LENSES, "lens-*", "SKILL.md")))
    for f in lens_files:
        rel = os.path.relpath(f, ROOT)
        text = open(f, encoding="utf-8").read()
        problems, body = check_section(text, "<<<LENS>>>", "<<<END_LENS>>>", FORBIDDEN + LENS_FORBIDDEN_EXTRA, "lens")
        total += 1
        if body and len(body) > LENS_MAX_CHARS:
            problems.append(f"lens too long: {len(body)} chars > {LENS_MAX_CHARS} (dilution guard)")
        if problems:
            for p in problems:
                print(f"[lint] FAIL {rel}: {p}")
            bad += 1
        else:
            print(f"[lint] ok   {rel}")

    if bad:
        print(f"[lint] {bad} file(s) failed", file=sys.stderr)
        return 1
    print(f"[lint] all {total} reviewer skill(s) + lens(es) clean")
    return 0


if __name__ == "__main__":
    sys.exit(main())
