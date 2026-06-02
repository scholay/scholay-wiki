#!/usr/bin/env python3
"""
Lint the reviewer-skill <<<SCORING_PERSONA>>> sections.

智能审稿评分轮 (scoring round) 是 **Skill/Agent/Task 关闭** 的 —— 注入评分轮的 persona 文本
如果含"调用某 skill / invoke / 起子 agent"之类指令, 模型会去碰被禁工具 → 产生权限拒绝 narration
落进 SSE 缓冲、抬高冲碎 JSON 概率 (红队 blocker)。

本 lint 强制: 每个 agent/data/claude/skills/rv-*/SKILL.md 必须有一个
<<<SCORING_PERSONA>>> ... <<<END_SCORING_PERSONA>>> 段, 且**段内**不得出现工具/技能调用词。
(sentinel 段之外的"选择期说明"不受限 —— 它只在 Skill-开 的选择轮被读。)

用法: python3 scripts/lint-reviewer-skills.py   (CI 里跑; 违规 exit 1)
"""
import glob
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SKILLS = os.path.join(ROOT, "agent", "data", "claude", "reviewer-skills")
START = "<<<SCORING_PERSONA>>>"
END = "<<<END_SCORING_PERSONA>>>"

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


def main() -> int:
    files = sorted(glob.glob(os.path.join(SKILLS, "rv-*", "SKILL.md")))
    if not files:
        print(f"[lint] no rv-*/SKILL.md found under {SKILLS}", file=sys.stderr)
        return 1
    bad = 0
    for f in files:
        rel = os.path.relpath(f, ROOT)
        text = open(f, encoding="utf-8").read()
        m = re.search(re.escape(START) + r"(.*?)" + re.escape(END), text, re.S)
        if not m:
            print(f"[lint] FAIL {rel}: missing {START}...{END} section")
            bad += 1
            continue
        section = m.group(1)
        if not section.strip():
            print(f"[lint] FAIL {rel}: empty scoring persona section")
            bad += 1
            continue
        hits = []
        for pat in FORBIDDEN:
            for mm in re.finditer(pat, section, re.I):
                hits.append(f"{pat!r}->{mm.group(0)!r}")
        if hits:
            print(f"[lint] FAIL {rel}: scoring persona must not reference tools/skills: {', '.join(hits)}")
            bad += 1
        else:
            print(f"[lint] ok   {rel}")
    if bad:
        print(f"[lint] {bad} file(s) failed", file=sys.stderr)
        return 1
    print(f"[lint] all {len(files)} reviewer skill(s) clean")
    return 0


if __name__ == "__main__":
    sys.exit(main())
