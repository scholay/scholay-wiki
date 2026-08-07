"""`assume` —— 前提实测 + 决策表分流。这是「方法学守门」这个卖点的实际承担者。

## 为什么这一步必须是确定性的

调研结论(REGISTRY-OA出处.md / SYNTHESIS-竞品与行业做法.md §〇):
**全行业只有活人在做方法学守门** —— L0/L1(ChatGPT / Julius)是模型静默选,
L2/L3(JASP / jamovi)的 Levene、Shapiro **只算不分流**(算完给你看,选哪个仍是你的事)。
而实证侧:模型在真实数据上**选错方法 38.4%**(JCO CCI 2025-12);
StatQA 进一步指出主错型是 applicability error —— 恰恰是 100% 可机械判定的那一类。

所以这里做三件事,一件都不交给模型:
1. **实测前提**(不是问模型「你觉得方差齐吗」);
2. **按决策表分流**,产出候选白名单 `allowed[]` + 默认 `chosen`;
3. **把依据链一起交付** —— 「Levene F=6.31, p=.014 → 方差不齐 → 改用 Welch」。
   审稿人问的是依据链,不是结论(小木虫一手原声:"How did you test normality?")。

## 模型还剩什么

模型可以在 `allowed[]` 里**改选**(它在方法选择上其实不差,StatQA 64.83% > 有统计背景者开卷 53.45%,
⚠️ 该人类基线仅 n=6,弱证据)。但**不能越过白名单** —— 这是「放手」与「夺权」的边界线。

## 输出契约

stdout 只出 JSON(≤8KB),退出码:0 正常 / 2 守门拒绝(无规则命中或请求的方法不在白名单)。
错误信息面向模型可行动 —— 直接告诉它「你要的 X 不在候选里,候选是 [...],因为 <理由>」。
"""

from __future__ import annotations

import json
from typing import Any

from ..core.facts import FactError, evaluate
from ..registry import Registry, Rule, load_registry


class GateRejection(Exception):
    """守门拒绝。带上可行动的理由 —— 打哑谜会让模型重试到轮次耗尽。"""

    def __init__(self, message: str, payload: dict[str, Any]):
        super().__init__(message)
        self.payload = payload


def _match(reg: Registry, facts: dict[str, Any]) -> list[Rule]:
    hits: list[Rule] = []
    for r in reg.rules:
        try:
            if evaluate(r.when, facts, where=f"rule {r.id}.when"):
                hits.append(r)
        except FactError:
            # 事实缺失 = 该规则**在当前信息量下无法判定**,不是不命中。
            # 静默跳过是对的(问诊还没问到那一项),但绝不能把它当成「判 False」——
            # 后者会让规则永久沉默且无人察觉。缺哪一项由下面的 unresolved 汇报。
            continue
    return hits


def run_assume(
    facts: dict[str, Any],
    *,
    requested: str | None = None,
    reg: Registry | None = None,
) -> dict[str, Any]:
    reg = reg or load_registry()
    hits = _match(reg, facts)

    if not hits:
        # 无规则命中:多半是问诊没问全。把「还缺哪些事实」如实告诉模型,让它去问用户,
        # 而不是让它自己猜一个检验。
        unresolved: list[str] = []
        for r in reg.rules:
            try:
                evaluate(r.when, facts, where=f"rule {r.id}.when")
            except FactError as e:
                unresolved.append(f"{r.id}: {e}")
        raise GateRejection(
            "没有决策规则命中当前数据结构",
            {
                "ok": False,
                "reason": "no_rule_matched",
                "hint_zh": "问诊信息不足以定位检验。先用 AskUserQuestion 补齐设计信息,再重跑 assume。",
                "unresolved": unresolved[:10],
            },
        )

    # 多条命中时取**最具体**的那条(条件里引用的事实最多)。
    # 例:D-01(两组+连续+非配对+n≥30+方差齐)比一条泛化规则更具体。
    hits.sort(key=lambda r: len(r.when.split()), reverse=True)
    rule = hits[0]

    enabled = reg.enabled_methods()
    allowed = [m for m in rule.allowed if m in enabled]
    dropped = [m for m in rule.allowed if m not in enabled]
    if not allowed:
        raise GateRejection(
            f"规则 {rule.id} 的候选方法全部因缺库不可用",
            {"ok": False, "reason": "all_methods_disabled", "rule": rule.id, "dropped": dropped},
        )

    chosen = rule.default if rule.default in allowed else allowed[0]
    if requested is not None:
        if requested not in allowed:
            raise GateRejection(
                f"请求的方法 {requested!r} 不在候选白名单内",
                {
                    "ok": False,
                    "reason": "not_in_allowlist",
                    "requested": requested,
                    "allowed": allowed,
                    "rule": rule.id,
                    "why_zh": rule.reason,
                    "hint_zh": (
                        "候选白名单由前提检验实测结果决定,不接受越过。"
                        "若确有理由用别的方法,应先说明前提为何可以放宽,而不是直接指定。"
                    ),
                },
            )
        chosen = requested

    method = enabled[chosen]
    out: dict[str, Any] = {
        "ok": True,
        "rule": rule.id,
        "allowed": allowed,
        "chosen": chosen,
        "reason_zh": rule.reason,
        "doctrine": rule.doctrine,
        "reports_required": method.reports_required,
        "requires_checks": method.requires,
        "effects": method.effects,
    }
    if dropped:
        out["dropped_unavailable"] = dropped
    # 依据链:进 Methods 段的那句话。
    out["evidence_chain"] = [
        {"fact": k, "value": v} for k, v in sorted(facts.items()) if k in rule.when
    ]
    # 仅惯例支撑 / 有学派分歧 → report 必须如实披露,这里把标记透出去。
    if rule.convention_only():
        out["disclosure_required_zh"] = (
            "本默认依学科惯例而非文献建议,Methods 段须如实说明。"
        )
    if rule.contested:
        others = [
            {"cite": c.cite, "url": c.url}
            for c in rule.primary_citations()
        ]
        out["contested_zh"] = "该规则存在方法学分歧,Methods 段须披露另一派。"
        out["positions"] = others
    return out


def cli(argv: list[str]) -> tuple[int, str]:
    """`python3 -m statkit assume --facts '<json>' [--requested <method>]`"""
    facts_json: str | None = None
    requested: str | None = None
    i = 0
    while i < len(argv):
        if argv[i] == "--facts" and i + 1 < len(argv):
            facts_json, i = argv[i + 1], i + 2
        elif argv[i] == "--requested" and i + 1 < len(argv):
            requested, i = argv[i + 1], i + 2
        else:
            i += 1
    if not facts_json:
        return 2, json.dumps(
            {"ok": False, "reason": "usage", "hint_zh": "用法:assume --facts '<json>' [--requested <method_id>]"},
            ensure_ascii=False,
        )
    try:
        facts = json.loads(facts_json)
    except json.JSONDecodeError as e:
        return 2, json.dumps({"ok": False, "reason": "bad_json", "error": str(e)}, ensure_ascii=False)
    try:
        return 0, json.dumps(run_assume(facts, requested=requested), ensure_ascii=False, indent=2)
    except GateRejection as e:
        return 2, json.dumps(e.payload, ensure_ascii=False, indent=2)
