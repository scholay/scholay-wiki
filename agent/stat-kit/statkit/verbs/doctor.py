"""`doctor` —— 注册表自检闸门。

## 它守什么

方案 R 把方法学知识搬进了 YAML。这买到了可评审性,但也引入一个新的失效模式:
**一张写错的卡会静默地污染所有用到它的分析**,而且比代码错误更难发现
(它长得像数据,不会崩,只会给出一个「看起来正常」的错误默认值)。

doctor 是这一层的机械防线。每条判据都对应一个真实踩过或识别出的坑:

- **V0-① 卡片能加载** —— loader 的所有 SchemaError 在这里汇总成人话。
- **V0-② golden 非空** —— 「一条永远绿的规则和一条不存在的规则等价」。
  没有金标参考值的方法卡,它算错了没有人会知道。schema 层已强制,这里复核。
- **V0-③ 每条规则至少一条可及的 primary** —— 评审 agent 拿不到原文就只能输出
  unverifiable,机制会在那条规则上空转。2026-08-05 已把 22 条规则的 primary 全换成 OA。
- **V0-④ convention-only 的 default 必须可被 report 披露** —— 五条规则(D-08/D-09/D-14/D-21/D-22)
  的默认值**只有学科惯例、没有一次文献**。它们可以照用,但 Methods 段必须如实说
  「本默认依学科惯例而非文献建议」。这里确保它们被标出来,不至于混进「有据可循」那一堆。
- **V0-⑤ 缺库的方法必须被大声列出** —— 而不是静默从候选集消失。
- **V0-⑥ 事实词表增长可见** —— 止损点 B 的观察口(见 core/facts.py 模块头)。

## 退出码

0 = 全绿;2 = 有硬失败(卡片坏 / 出处不可及 / golden 空)。**不设 1**:
1 留给「引擎自身崩了」,与「注册表不合格」必须可区分。
"""

from __future__ import annotations

import json
from collections import Counter
from typing import Any

from ..core.facts import VOCABULARY
from ..registry import Registry, load_registry


def run_doctor(*, as_json: bool = False, strict: bool = False) -> tuple[int, str]:
    problems: list[str] = []
    warnings: list[str] = []

    try:
        reg: Registry = load_registry()
    except Exception as e:  # noqa: BLE001
        payload = {"ok": False, "stage": "load", "error": str(e)}
        return 2, json.dumps(payload, ensure_ascii=False, indent=2) if as_json else f"🔴 注册表加载失败:\n{e}"

    # V0-② golden 非空(schema 已强制,这里是复核 —— 双保险刻意保留)
    for mid, m in reg.methods.items():
        if not m.golden:
            problems.append(f"V0-② method {mid}: golden 为空")

    # V0-③ 每条规则至少一条**可及**的 primary
    for r in reg.rules:
        readable = [c for c in r.primary_citations() if c.agent_readable()]
        if not readable:
            if r.convention_only():
                warnings.append(
                    f"V0-④ rule {r.id}: default 仅由学科惯例支撑(无 primary)。"
                    f"允许,但 report 必须在 Methods 段披露「本默认依学科惯例而非文献建议」。"
                )
            else:
                problems.append(
                    f"V0-③ rule {r.id}: 没有任何**可及**的 primary 出处 "
                    f"(评审 agent 打不开 = 该规则的方法学核对会空转)"
                )

    # V0-④ contested 规则必须真的登记了另一派
    for r in reg.rules:
        if r.contested and len(r.primary_citations()) < 2:
            warnings.append(
                f"rule {r.id}: 标了 contested 但只有 {len(r.primary_citations())} 条 primary —— "
                f"「如实披露另一派」需要另一派的出处真的在卡里"
            )

    # V0-⑤ 缺库的方法
    for mid, mod in sorted(reg.disabled.items()):
        problems.append(
            f"V0-⑤ method {mid}: 依赖模块 {mod!r} 不可 import → 已从候选集移除。"
            f"要么装上,要么把这张卡删掉 —— 声明与镜像不符是本仓踩过的事故。"
        )

    # V0-⑥ 事实词表规模(止损点 B 的观察值,不是失败判据)
    by_card = Counter(f.introduced_by for f in VOCABULARY)

    ok = not problems
    if strict and warnings:
        ok = False

    data: dict[str, Any] = {
        "ok": ok,
        "methods_total": len(reg.methods),
        "methods_enabled": len(reg.enabled_methods()),
        "checks": len(reg.checks),
        "effects": len(reg.effects),
        "rules": len(reg.rules),
        "rules_convention_only": sorted(r.id for r in reg.rules if r.convention_only()),
        "rules_contested": sorted(r.id for r in reg.rules if r.contested),
        "facts_total": len(VOCABULARY),
        "facts_by_introducer": dict(by_card),
        "problems": problems,
        "warnings": warnings,
    }
    if as_json:
        return (0 if ok else 2), json.dumps(data, ensure_ascii=False, indent=2)

    lines = [
        f"注册表:{len(reg.methods)} 方法({len(reg.enabled_methods())} 可用)/ "
        f"{len(reg.checks)} 前提检验 / {len(reg.effects)} 效应量 / {len(reg.rules)} 决策规则",
        f"事实词表:{len(VOCABULARY)} 条 —— " + ", ".join(f"{k}:{v}" for k, v in by_card.items()),
    ]
    if data["rules_convention_only"]:
        lines.append(
            "仅惯例支撑的规则(Methods 段必须披露):" + ", ".join(data["rules_convention_only"])
        )
    if data["rules_contested"]:
        lines.append("方法学有分歧、须披露另一派的规则:" + ", ".join(data["rules_contested"]))
    for w in warnings:
        lines.append(f"⚠️  {w}")
    for p in problems:
        lines.append(f"🔴 {p}")
    lines.append("✅ doctor 全绿" if ok else f"🔴 doctor 未通过({len(problems)} 项硬失败)")
    return (0 if ok else 2), "\n".join(lines)
