"""注册表加载 —— 把 cards/ 下的 YAML 读成内存中的 Registry。

## 加载期就失败,不降级

一张坏卡**静默进候选集**比加载失败危险得多:它会在真实用户的分析里被选中,
产出一个看起来正常、实际错误的结果。所以本模块的所有校验都是**抛异常**,
没有 warning-then-continue 的路径。

## 缺库的方法自动从候选集消失

`engine: "lib:scipy.stats.ttest_ind"` 声明了实现落点。加载期探测该库能不能 import:
不能 → 该方法卡 `enabled=False`,不进候选集,并在 doctor 输出里**大声列出**。
这正是 `agent/src/tools/statsEngines.ts:41-44` 注释预留的消费方 ——
「声明镜像没有的能力 = 逼模型编数字」是审计里效应量凭空出现的机械成因,
反过来「镜像有而声明没有」也是债。两边由 DECLARED_ENGINES 与本模块共同兜住。
"""

from __future__ import annotations

import importlib
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml

from ..core.facts import FactError, check_expression_names
from .schema import (
    Check,
    Effect,
    Method,
    Rule,
    SchemaError,
    parse_check,
    parse_effect,
    parse_method,
    parse_rule,
)

CARDS_DIR = Path(__file__).resolve().parent.parent / "cards"


@dataclass
class Registry:
    methods: dict[str, Method] = field(default_factory=dict)
    checks: dict[str, Check] = field(default_factory=dict)
    effects: dict[str, Effect] = field(default_factory=dict)
    rules: list[Rule] = field(default_factory=list)
    # 缺库而被禁用的方法:{method_id: 缺的模块名}。doctor 会大声列出来。
    disabled: dict[str, str] = field(default_factory=dict)

    def enabled_methods(self) -> dict[str, Method]:
        return {k: v for k, v in self.methods.items() if k not in self.disabled}

    def rule(self, rule_id: str) -> Rule:
        for r in self.rules:
            if r.id == rule_id:
                return r
        raise KeyError(rule_id)


# 🔴 YAML 1.1 的「布尔化裸词」—— 写了不生效、不报错的一整类坑。
#
# 实测(2026-08-06,S4 落地时踩到):卡片里写 `on: diff`,PyYAML 把**键** `on`
# 解析成布尔 `True`,于是字段变成 `{True: "diff"}`;`raw.get("on")` 取到 None,
# 默认值静默生效 —— 卡片上白纸黑字写着,而引擎完全没看见。
#
# 同族的裸词还有 y/yes/n/no/true/false/on/off(以及它们的大小写变体)。
# 这一族**必须在加载期拦住**:它的症状是「声明与行为不符」,而那正是本仓最贵的一类 bug。
_YAML_BOOLISH = {True, False}


def _reject_boolish_keys(obj: Any, where: str) -> None:
    """递归查有没有被 YAML 1.1 布尔化的键。"""
    if isinstance(obj, dict):
        for k, v in obj.items():
            if k in _YAML_BOOLISH and isinstance(k, bool):
                raise SchemaError(
                    f"{where}: 出现了被 YAML 解析成布尔的键(值={v!r})。\n"
                    f"原因:YAML 1.1 把裸词 on/off/yes/no/y/n/true/false 当布尔 —— "
                    f"`on: diff` 会变成 `{{True: 'diff'}}`,于是那个字段**写了不生效且不报错**。\n"
                    f"修法:给键加引号。\n"
                    f"(注:检验卡的 `on` 字段已于 2026-08-07 改名为 `target`,正是为了不必每次都加引号 ——"
                    f"本守卫保留是因为它还护着 `yes/no/off` 这类**值**被布尔化。)"
                )
            _reject_boolish_keys(v, where)
    elif isinstance(obj, (list, tuple)):
        for v in obj:
            _reject_boolish_keys(v, where)


def _load_yaml(path: Path) -> dict[str, Any]:
    with path.open(encoding="utf-8") as fh:
        data = yaml.safe_load(fh)
    if not isinstance(data, dict):
        raise SchemaError(f"{path}: 顶层必须是映射")
    _reject_boolish_keys(data, str(path))
    return data


def _engine_module(engine: str) -> str | None:
    """从 `engine` 声明里取出要探测的模块名。`own:` 是本仓自写,不探测。"""
    if engine.startswith("own:"):
        return None
    if not engine.startswith("lib:"):
        raise SchemaError(f"engine 必须以 `lib:` 或 `own:` 开头,得到 {engine!r}")
    target = engine[4:]
    # "scipy.stats.ttest_ind(equal_var=True)" → "scipy.stats"
    target = target.split("(")[0]
    parts = target.split(".")
    return ".".join(parts[:2]) if len(parts) >= 2 else parts[0]


def load_registry(cards_dir: Path | None = None) -> Registry:
    base = cards_dir or CARDS_DIR
    reg = Registry()

    for path in sorted((base / "checks").glob("*.yaml")):
        for raw in _load_yaml(path).get("checks", []):
            c = parse_check(raw)
            if c.id in reg.checks:
                raise SchemaError(f"{path}: check id 重复 {c.id!r}")
            reg.checks[c.id] = c

    for path in sorted((base / "effects").glob("*.yaml")):
        for raw in _load_yaml(path).get("effects", []):
            e = parse_effect(raw)
            if e.id in reg.effects:
                raise SchemaError(f"{path}: effect id 重复 {e.id!r}")
            reg.effects[e.id] = e

    for path in sorted((base / "methods").glob("*.yaml")):
        for raw in _load_yaml(path).get("methods", []):
            m = parse_method(raw)
            if m.id in reg.methods:
                raise SchemaError(f"{path}: method id 重复 {m.id!r}")
            for cid in m.requires:
                if cid not in reg.checks:
                    raise SchemaError(f"method {m.id}: requires 引用了不存在的 check {cid!r}")
            for eid in m.effects:
                if eid not in reg.effects:
                    raise SchemaError(f"method {m.id}: effects 引用了不存在的 effect {eid!r}")
            reg.methods[m.id] = m

    for path in sorted((base / "rules").glob("*.yaml")):
        for raw in _load_yaml(path).get("rules", []):
            r = parse_rule(raw)
            if any(x.id == r.id for x in reg.rules):
                raise SchemaError(f"{path}: rule id 重复 {r.id!r}")
            for mid in r.allowed:
                if mid not in reg.methods:
                    raise SchemaError(f"rule {r.id}: allowed 引用了不存在的 method {mid!r}")
            try:
                check_expression_names(r.when, where=f"rule {r.id}.when")
            except FactError as e:
                raise SchemaError(str(e)) from e
            reg.rules.append(r)

    # 缺库探测 —— 放在最后,因为要先知道全部方法。
    for mid, m in reg.methods.items():
        mod = _engine_module(m.engine)
        if mod is None:
            continue
        try:
            importlib.import_module(mod)
        except Exception:  # noqa: BLE001 — 任何 import 失败都算不可用
            reg.disabled[mid] = mod

    # ── 🔴 S7:方法卡声明的实现必须真的存在 ──────────────────────────────────────
    #
    # 加载期断言 `method.id ∈ engines.tests.DISPATCH`。为什么必须有它:
    #
    #   实测(2026-08-06):往注册表加一张**纯 YAML 的 ANOVA 卡**(没有任何实现)——
    #     · `doctor --strict` 输出「6 方法(6 可用)…✅ 全绿」
    #     · 全部测试 passed
    #     · 镜像照常构建出来
    #   然后真实用户第一次命中那条规则,`run.py` 的 `tst.DISPATCH[method_id]` 是**裸下标** ⇒
    #   `KeyError` + 整段 Python traceback 甩给模型。而 run.py 自己把「用户看到 Python 栈」
    #   列为一票否决项。
    #
    # 刺眼的不对称:**前提检验侧**早就有完整的 `check_not_implemented` 校验
    # (run.py,注释写着「声明与实现不符是本仓踩过的事故,加载期就该拦住」),
    # 而**方法侧**在 20 行之外,什么都没有。这里补上,措辞照抄那一侧。
    #
    # ⚠️ 放在缺库探测**之后**:因缺库而 disabled 的方法不该再报「没有实现」——
    #    那是环境问题(如 scikit-posthocs 没装),与「卡片说了一个不存在的函数」是两回事,
    #    两者的修法完全不同(装依赖 vs 写实现)。
    # ⚠️ C1 之后查的是**形状对应的**实现表(engines/dispatch.py),不再写死 tests.DISPATCH。
    #    写死那一版会在分类族落地的当天把 6 张合法卡片全判成「没有实现」。
    from ..engines import dispatch as _disp

    for mid, m in reg.methods.items():
        if mid in reg.disabled:
            continue                      # 缺库,另一档,上面已记
        try:
            tbl = _disp.table_for(m.input_shape)
        except KeyError as e:
            raise SchemaError(f"method {mid!r}: {e}") from e
        if mid not in tbl:
            raise SchemaError(
                f"method {mid!r} 声明了卡片(input_shape={m.input_shape!r})但对应的引擎 "
                f"DISPATCH 里没有实现 —— 声明与实现不符是本仓踩过的事故,加载期就该拦住。\n"
                f"没有它:doctor 全绿、测试全绿、镜像照出,而真实用户第一次命中该规则时"
                f"拿到的是 KeyError 的 Python 栈。\n"
                f"该形状当前已实现:{_disp.implemented(m.input_shape)}"
            )

    return reg
