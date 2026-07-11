#!/usr/bin/env python3
"""
Lint the Prism 写作技能体系:常驻内核 (prism-skills/*) + base 写作人格 (prism-personas/pw-*)
+ 写作 lens (prism-lenses/wl-*)。镜像 scripts/lint-reviewer-skills.py,但按写作体系的护栏调整。

强制:
  1) 常驻内核 agent-skills/prism-skills/*/SKILL.md(always-on,拼进每轮 system):
     - 每份 < PER_SKILL_CAP(loader 单份截断线,超了会被 loader 静默截断);
     - 全部之和 < CORE_TOTAL_GATE(跨通道构建期硬 gate:常驻核 + 画像块 ≤3000 + agentNativeProtocol
       都共驻在 40000 的 TOTAL_CAP 里,给核留 <12000 才有充裕余量)。
  2) base 人格 agent-skills/prism-personas/pw-*/SKILL.md:
     - slug 形如 ^pw-[a-z0-9-]+$;
     - 有一个 <<<WRITING_PERSONA>>>...<<<END_WRITING_PERSONA>>> 段;
     - 段内不得出现工具/技能调用词(它经 in-band 拼进 system,含"调用某 skill"会诱导碰工具);
     - 段正文 ≤ PERSONA_MAX_CHARS(reviewer lint 无此上限,写作人格必须有,否则撑破 seed payload)。
  3) 写作 lens agent-skills/prism-lenses/wl-*/SKILL.md:
     - slug 形如 ^wl-[a-z0-9-]+$;frontmatter 必须有 axis: craft|rigor;
     - 有一个 <<<LENS>>>...<<<END_LENS>>> 紧凑核,段内不得出现工具/技能词 + 不得出现输出格式语言
       (lens 只加"额外写什么/怎么写深",不碰"如何作答"——避免与常驻编辑纪律/输出契约竞争);
     - <<<LENS>>> 核 ≤ LENS_MAX_CHARS(可被 backend 抽进 in-band 时的稀释/预算护栏);
     - 整份 SKILL.md ≤ GUIDE_MAX_CHARS(Skill 工具懒加载正文上限 MAX_SKILL_BODY=16000)。

pw-*/wl-* 目录尚不存在时跳过(分阶段落地)。用法: python3 scripts/lint-writing-skills.py (CI, 违规 exit 1)。
"""
import glob
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CORES = os.path.join(ROOT, "agent-skills", "prism-skills")
PERSONAS = os.path.join(ROOT, "agent-skills", "prism-personas")
LENSES = os.path.join(ROOT, "agent-skills", "prism-lenses")

PER_SKILL_CAP = 8000       # loader.ts PER_SKILL_CAP(单份截断线)
CORE_TOTAL_GATE = 12000    # 常驻核之和硬 gate(跨通道:核 + 画像块3000 + protocol < 40000)
PERSONA_MAX_CHARS = 3000   # <<<WRITING_PERSONA>>> 体上限(renderProfileBlock 也 hard-truncate 到此)
LENS_MAX_CHARS = 1500      # <<<LENS>>> 核上限
GUIDE_MAX_CHARS = 16000    # registry.ts MAX_SKILL_BODY(Skill 懒加载正文上限)

FORBIDDEN = [
    r"\bskill\b", r"\btask\b", r"\bagent\b", r"\bsubagent\b", r"\binvoke\b",
    r"mcp__", r"调用.{0,6}(skill|技能)",
]
LENS_FORBIDDEN_EXTRA = [
    r"\bjson\b", r"\bschema\b", r"输出格式", r"输出要求", r"返回.{0,6}(对象|json)",
]

PW_SLUG = re.compile(r"^pw-[a-z0-9-]+$")
WL_SLUG = re.compile(r"^wl-[a-z0-9-]+$")


def check_section(text, start, end, forbidden, label):
    m = re.search(re.escape(start) + r"(.*?)" + re.escape(end), text, re.S)
    if not m:
        return [f"missing {start}...{end} section"], ""
    section = m.group(1)
    if not section.strip():
        return [f"empty {label} section"], ""
    hits = []
    for pat in forbidden:
        for mm in re.finditer(pat, section, re.I):
            hits.append(f"{pat!r}->{mm.group(0)!r}")
    problems = []
    if hits:
        problems.append(f"{label} must not reference tools/skills/output-format: {', '.join(hits)}")
    return problems, section.strip()


def frontmatter_field(text, key):
    t = text.lstrip("﻿ \n\t")
    if not t.startswith("---"):
        return ""
    end = t.find("\n---", 3)
    if end < 0:
        return ""
    for line in t[3:end].split("\n"):
        s = line.strip()
        if s.startswith(key + ":"):
            return s[len(key) + 1:].strip()
    return ""


def main() -> int:
    bad = 0
    total = 0

    # 1) 常驻内核:大小 + 跨通道 gate
    core_files = sorted(glob.glob(os.path.join(CORES, "*", "SKILL.md")))
    if not core_files:
        print(f"[lint] no core SKILL.md under {CORES}", file=sys.stderr)
        return 1
    core_total = 0
    for f in core_files:
        rel = os.path.relpath(f, ROOT)
        n = len(open(f, encoding="utf-8").read())
        core_total += n
        total += 1
        if n > PER_SKILL_CAP:
            print(f"[lint] FAIL {rel}: core {n} chars > PER_SKILL_CAP {PER_SKILL_CAP} (loader would truncate)")
            bad += 1
        else:
            print(f"[lint] ok   {rel} ({n} chars, always-on)")
    if core_total >= CORE_TOTAL_GATE:
        print(f"[lint] FAIL always-on core total {core_total} chars >= gate {CORE_TOTAL_GATE} "
              f"(cross-channel budget: cores + profile-block(3000) + protocol must fit 40000)")
        bad += 1
    else:
        print(f"[lint] ok   always-on core total {core_total} chars < gate {CORE_TOTAL_GATE}")

    # 2) base 人格 pw-*(目录可不存在)
    for f in sorted(glob.glob(os.path.join(PERSONAS, "pw-*", "SKILL.md"))):
        rel = os.path.relpath(f, ROOT)
        slug = os.path.basename(os.path.dirname(f))
        text = open(f, encoding="utf-8").read()
        problems, body = check_section(text, "<<<WRITING_PERSONA>>>", "<<<END_WRITING_PERSONA>>>", FORBIDDEN, "writing persona")
        if not PW_SLUG.match(slug):
            problems.append(f"slug {slug!r} must match ^pw-[a-z0-9-]+$")
        if body and len(body) > PERSONA_MAX_CHARS:
            problems.append(f"persona too long: {len(body)} chars > {PERSONA_MAX_CHARS}")
        # V4 UI:选择器展示字段强制 —— name 必须是短净名(非 slug、≤16 字符),scene/traits 供右栏图形化详情。
        pname = frontmatter_field(text, "name")
        if not pname or pname == slug:
            problems.append("frontmatter `name:` must be a clean display name (not the slug)")
        elif len(pname) > 16:
            problems.append(f"name too long: {len(pname)} chars > 16 (picker 左列短名)")
        if not frontmatter_field(text, "scene"):
            problems.append("missing frontmatter `scene:` (适用场景一句,picker 右栏)")
        traits = [t.strip() for t in frontmatter_field(text, "traits").split("、") if t.strip()]
        if not (3 <= len(traits) <= 7):
            problems.append(f"frontmatter `traits:` must have 3-7 顿号-separated chips, got {len(traits)}")
        elif any(len(t) > 14 for t in traits):
            problems.append("traits chip too long (>14 chars) — chips 是短语不是句子")
        # V4 UI v3:骨架流程图 + 成稿味道示例句(picker 右栏「脑补成稿」的两件套)。
        skeleton = [s.strip() for s in frontmatter_field(text, "skeleton").split("→") if s.strip()]
        if not (3 <= len(skeleton) <= 7):
            problems.append(f"frontmatter `skeleton:` must have 3-7 →-separated stages, got {len(skeleton)}")
        sample = frontmatter_field(text, "sample")
        if not sample:
            problems.append("missing frontmatter `sample:` (成稿味道示例句)")
        elif len(sample) > 90:
            problems.append(f"sample too long: {len(sample)} chars > 90(一句话,不是段落)")
        total += 1
        if problems:
            for p in problems:
                print(f"[lint] FAIL {rel}: {p}")
            bad += 1
        else:
            print(f"[lint] ok   {rel} (persona {len(body)} chars)")

    # 3) 写作 lens wl-*(目录可不存在)
    lens_whens = {}  # slug -> when_to_use(近重复检测用)
    for f in sorted(glob.glob(os.path.join(LENSES, "wl-*", "SKILL.md"))):
        rel = os.path.relpath(f, ROOT)
        slug = os.path.basename(os.path.dirname(f))
        text = open(f, encoding="utf-8").read()
        problems, body = check_section(text, "<<<LENS>>>", "<<<END_LENS>>>", FORBIDDEN + LENS_FORBIDDEN_EXTRA, "lens")
        if not WL_SLUG.match(slug):
            problems.append(f"slug {slug!r} must match ^wl-[a-z0-9-]+$")
        axis = frontmatter_field(text, "axis")
        if axis not in ("craft", "rigor"):
            problems.append(f"frontmatter axis must be craft|rigor, got {axis!r}")
        # V4-B1 菜单经济:菜单行是路由指针 —— 必须有短 `menu:` 字段(≤60 字符),
        # 完整互斥边界留在 when_to_use(文件内,Skill 加载才付 token)。
        menu = frontmatter_field(text, "menu")
        if not menu:
            problems.append("missing frontmatter `menu:` (short routing pointer, ≤60 chars)")
        elif len(menu) > 60:
            problems.append(f"menu too long: {len(menu)} chars > 60 (menu is a pointer, not the boundary spec)")
        # V2-A3 四件套:craft lens 核必须以「生成动作」开宗明义(生成式非评审清单)。
        if axis == "craft" and body and "生成动作" not in body:
            problems.append("craft lens core must contain 「生成动作:」 (V2-A3 four-piece format)")
        if body and len(body) > LENS_MAX_CHARS:
            problems.append(f"lens core too long: {len(body)} chars > {LENS_MAX_CHARS}")
        if len(text) > GUIDE_MAX_CHARS:
            problems.append(f"guide too long: {len(text)} chars > {GUIDE_MAX_CHARS} (Skill would truncate)")
        lens_whens[slug] = frontmatter_field(text, "when_to_use")
        total += 1
        if problems:
            for p in problems:
                print(f"[lint] FAIL {rel}: {p}")
            bad += 1
        else:
            print(f"[lint] ok   {rel} (lens core {len(body)} / guide {len(text)} chars, axis={axis})")

    # 3.5) V4-P0:悬空路由检测 —— 所有 skill/persona/lens 文本里引用的 wl-*/pw-* slug 必须能在
    #      目录实名单解析(合并/改名 lens 后忘改引用 = agent 被路由到不存在的技能,静默失效)。
    valid_slugs = set()
    for f in glob.glob(os.path.join(LENSES, "wl-*", "SKILL.md")):
        valid_slugs.add(os.path.basename(os.path.dirname(f)))
    for f in glob.glob(os.path.join(PERSONAS, "pw-*", "SKILL.md")):
        valid_slugs.add(os.path.basename(os.path.dirname(f)))
    ref_re = re.compile(r"\b(wl-[a-z0-9-]+|pw-[a-z0-9-]+)\b")
    for f in sorted(
        glob.glob(os.path.join(CORES, "*", "SKILL.md"))
        + glob.glob(os.path.join(PERSONAS, "pw-*", "SKILL.md"))
        + glob.glob(os.path.join(LENSES, "wl-*", "SKILL.md"))
    ):
        rel = os.path.relpath(f, ROOT)
        self_slug = os.path.basename(os.path.dirname(f))
        text = open(f, encoding="utf-8").read()
        for i, line in enumerate(text.split("\n"), 1):
            for m in ref_re.finditer(line):
                slug = m.group(1)
                if slug not in valid_slugs and slug != self_slug:
                    print(f"[lint] FAIL {rel}:L{i}: dangling reference {slug!r} (no such lens/persona dir)")
                    bad += 1

    # 4) V2-C4:when_to_use 近重复检测(字符 bigram Jaccard;近义描述比条数更伤路由准确率)。
    #    刻意不上 embedding(阈值错调反而把该区分的两条误合并成盲区);>0.55 视为近重复。
    def bigrams(s):
        s = re.sub(r"\s+", "", s)
        return {s[i:i + 2] for i in range(len(s) - 1)} if len(s) > 1 else set()

    slugs = sorted(lens_whens)
    for i in range(len(slugs)):
        for j in range(i + 1, len(slugs)):
            a, b = bigrams(lens_whens[slugs[i]]), bigrams(lens_whens[slugs[j]])
            if not a or not b:
                continue
            jac = len(a & b) / len(a | b)
            if jac > 0.55:
                print(f"[lint] FAIL near-duplicate when_to_use: {slugs[i]} ~ {slugs[j]} (jaccard={jac:.2f}) — 描述必须互斥,合并或改写")
                bad += 1

    if bad:
        print(f"[lint] {bad} check(s) failed", file=sys.stderr)
        return 1
    print(f"[lint] all {total} writing skill(s)/persona(s)/lens(es) clean")
    return 0


if __name__ == "__main__":
    sys.exit(main())
