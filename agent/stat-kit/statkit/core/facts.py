"""派生事实词表 —— 决策规则 `when` 表达式唯一能引用的名字空间。

## 它是什么

`Rule.when` 写的是 `"two_groups and continuous and not levene_equal"` 这样的表达式。
表达式里每一个名字都必须在本模块的 `VOCABULARY` 里注册,并由 `derive()` 从
「数据画像 + 用户问诊答案 + 前提检验实测结果」算出来。

## 它替代了什么

方案 R 的替代品是 `gate: "py: len(df[g].unique()) == 2 and ..."` 这种内联 Python。
那种写法有三个问题:①方法学知识重新散回代码,加到第 40 个方法时无法整体审视;
②它是任意代码执行,卡片从「数据」变回「程序」;③评审人要读 Python 才能评审方法学。

## 🔴 但它也是止损点 B 的真实观察对象

逃生谓词被 schema 禁掉之后,压力会转移到**这里** —— 「加一张新卡就往词表里塞几条派生事实」
同样是把知识搬回代码,只是换了个门。所以止损判据**不是**「grep 不到 `py:`」
(schema 已禁,恒为 0,是一条永远绿的规则),而是:

  **加第二张回归卡(`ols_linear`)时,`core/` 要不要跟着改?**

要改 = 声明式内核没有真正吸收这一族,当场按预案降级为「决策表 + 薄执行器」。
本模块因此**刻意记录每条事实是被哪张卡引入的**(`introduced_by`),让增长曲线可见。
"""

from __future__ import annotations

import ast
from dataclasses import dataclass
from typing import Any, Callable


@dataclass(frozen=True)
class Fact:
    name: str
    kind: str  # "bool" | "number"
    desc_zh: str
    # 这条事实是被哪张卡 / 哪条规则引入的 —— 用于观察词表增长(止损点 B 的观察对象)。
    introduced_by: str
    # 从哪里来:profile(数据画像)/ consult(问诊答案)/ check(前提检验实测)
    source: str


# ── 词表 ────────────────────────────────────────────────────────────────────
# 排序 = 引入顺序。新增必须写清 introduced_by,**不许为了让某张卡过关而临时塞一条**。
VOCABULARY: tuple[Fact, ...] = (
    # 结构(来自问诊 + 画像)
    Fact("n_groups", "number", "分组数", "D-01 两组比较族", "consult"),
    Fact("two_groups", "bool", "恰好两组", "D-01 两组比较族", "consult"),
    Fact("paired", "bool", "配对设计(同一单元前后测 / 配对样本)", "D-04 配对", "consult"),
    # 🔴 S5(2026-08-06):`continuous` 从**问诊**改成**数据画像**。
    #    此前它在 run.py 里是字面量 `True` —— 于是任何含 `not continuous` 的规则**永不命中**,
    #    分类结局(0/1 编码的有效/无效、并发症有无)被当连续变量跑 Welch t、报 Hedges' g,
    #    Methods 段还会写「对该变量做 Shapiro-Wilk 正态性检验」——对 0/1 变量毫无意义。
    #    改成推断之后,分类资料族的规则才有可能被写出来(它是那一族的**前置**)。
    Fact("continuous", "bool", "因变量是连续型(按取值个数与类型推断,非问诊)", "D-01 两组比较族", "profile"),
    Fact("min_group_n", "number", "最小组样本量", "D-02 小样本分流", "profile"),
    # ── 多组族(P1 族①)──────────────────────────────────────────────────────
    #    `n_groups` 早就在词表里(但只有两组族的规则在用);下面两条是多组分流真正需要的。
    Fact("multi_group", "bool", "三组及以上", "D-07 多组比较族", "profile"),
    Fact("balanced", "bool", "各组样本量相等(影响事后检验的选择)", "D-09 事后比较", "profile"),
    # ── 分类资料族(P1 族②,2026-08-07)────────────────────────────────────────
    #
    # 🔴 刻意**只加 3 条**,而且**不加 `expected_min` / `expected_lt5_share` 这两个数值事实**。
    #    理由有二:
    #    ① **既有先例是反的**:`levene_equal` / `normal_by_group` 都是 bool,
    #       α=0.05 这个阈值住在**检验卡的 `alpha` 字段**里,不在 `when` 里。
    #       Cochran 规则(无格子 E<1 且 E<5 的格子 ≤20%)与它同型 —— 判据住卡片,事实是 bool。
    #    ② **数值事实是枚举器组合爆炸的真正触发源**:实测互斥性护栏当前 2304 组 /0.14s;
    #       只加 bool 到 14 个是 ~17.5s,再叠 3 个数值事实(各 4 值)≈ **18 分钟**。
    #    两个数值仍然逐个进 `assumptions[]` 与依据链 —— 审稿人问的正是那两个数。
    Fact("binary_dv", "bool", "结局恰好两个水平(2×2 ⟺ two_groups and binary_dv)",
         "D-10 分类资料族", "profile"),
    Fact("expected_ok", "bool", "期望频数满足 Cochran 准则(无格 <1 且 <5 的格 ≤20%)",
         "D-10 分类资料族", "check"),
    # 有序**判不出来**:「轻/中/重」与「A/B/C」在数据里长得一样,而顺序错会让 χ² 差 7 倍
    # (实测:分数顺序对 χ²=10.13,把中度当基线 χ²=4.50,两个结果都跑得通、都不报错)。
    Fact("ordinal_group", "bool", "分组变量有序(由调用方声明,引擎判不出来)",
         "D-14 趋势检验", "consult"),
    # 前提检验实测(来自 check 卡,**不是模型判断**)
    Fact("normal_by_group", "bool", "各组正态性均满足(Shapiro-Wilk)", "D-02", "check"),
    Fact("levene_equal", "bool", "方差齐(Levene, center=median)", "D-01/D-03", "check"),
    Fact("diff_normal", "bool", "配对差值正态", "D-04/D-05", "check"),
)

_BY_NAME = {f.name: f for f in VOCABULARY}


def vocabulary_names() -> set[str]:
    return set(_BY_NAME)


class FactError(ValueError):
    pass


# ── 表达式求值 ──────────────────────────────────────────────────────────────
# 刻意**不用** eval():那等于把 `py:` 从卡片挪进引擎。这里用 ast 白名单解释器,
# 只支持 and / or / not / 比较 / 名字 / 数字字面量 —— 够表达决策条件,且不可能执行任意代码。
_ALLOWED_NODES = (
    ast.Expression, ast.BoolOp, ast.UnaryOp, ast.Compare, ast.Name, ast.Load,
    ast.And, ast.Or, ast.Not, ast.Constant,
    ast.Eq, ast.NotEq, ast.Lt, ast.LtE, ast.Gt, ast.GtE,
)


def _eval(node: ast.AST, facts: dict[str, Any], where: str) -> Any:
    if not isinstance(node, _ALLOWED_NODES):
        raise FactError(
            f"{where}: 表达式含不允许的语法 {type(node).__name__} —— "
            f"`when` 只支持 and/or/not/比较/事实名/字面量。要表达更复杂的条件,"
            f"说明该拆成两条规则,而不是让表达式变成程序。"
        )
    if isinstance(node, ast.Expression):
        return _eval(node.body, facts, where)
    if isinstance(node, ast.Constant):
        return node.value
    if isinstance(node, ast.Name):
        if node.id not in _BY_NAME:
            raise FactError(
                f"{where}: 未注册的事实名 {node.id!r}。"
                f"新增事实必须先在 core/facts.py 的 VOCABULARY 登记并写明 introduced_by —— "
                f"这条约束是止损点 B 的观察口,不许绕过。"
            )
        if node.id not in facts:
            raise FactError(f"{where}: 事实 {node.id!r} 尚未求出(缺 profile/consult/check 输入)")
        return facts[node.id]
    if isinstance(node, ast.UnaryOp) and isinstance(node.op, ast.Not):
        return not _eval(node.operand, facts, where)
    if isinstance(node, ast.BoolOp):
        vals = [_eval(v, facts, where) for v in node.values]
        return all(vals) if isinstance(node.op, ast.And) else any(vals)
    if isinstance(node, ast.Compare):
        left = _eval(node.left, facts, where)
        for op, comp in zip(node.ops, node.comparators):
            right = _eval(comp, facts, where)
            ok = {
                ast.Eq: lambda a, b: a == b, ast.NotEq: lambda a, b: a != b,
                ast.Lt: lambda a, b: a < b, ast.LtE: lambda a, b: a <= b,
                ast.Gt: lambda a, b: a > b, ast.GtE: lambda a, b: a >= b,
            }[type(op)](left, right)
            if not ok:
                return False
            left = right
        return True
    raise FactError(f"{where}: 无法求值 {type(node).__name__}")


def evaluate(expr: str, facts: dict[str, Any], where: str = "when") -> bool:
    """求值一条 `when` 表达式。任何异常都**向上抛**,不吞 —— 求值失败必须是显式失败,
    静默判 False 会让一条规则从此永不命中,而没有任何人会发现。"""
    try:
        tree = ast.parse(expr, mode="eval")
    except SyntaxError as e:
        raise FactError(f"{where}: 表达式语法错误 {expr!r} — {e}") from e
    return bool(_eval(tree, facts, where))


def check_expression_names(expr: str, where: str = "when") -> set[str]:
    """静态提取表达式引用的事实名并校验都已注册(doctor 用,不需要真实数据)。"""
    try:
        tree = ast.parse(expr, mode="eval")
    except SyntaxError as e:
        raise FactError(f"{where}: 表达式语法错误 {expr!r} — {e}") from e
    names: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Name):
            if node.id not in _BY_NAME:
                raise FactError(f"{where}: 未注册的事实名 {node.id!r}")
            names.add(node.id)
        elif not isinstance(node, _ALLOWED_NODES):
            raise FactError(f"{where}: 表达式含不允许的语法 {type(node).__name__}")
    return names
