"""前提检验实现 —— 卡片 `checks/*.yaml` 声明的 `engine` 落点。

## 这是三夺权的第一条

前提检验**由引擎实测,不问模型**。依据:StatQA 实测 LLM 的首要错误类型是
applicability error(「知道该做 t 检验,但没意识到这份数据不满足前提」),
而这一类 100% 可机械判定 —— ROI 最高的一条防线。

对照竞品:JASP / jamovi 的勾选项里**有** Levene、Shapiro,但它们**只算不分流** ——
算完把数字摆给你,选哪个检验仍然是你的事。这里多做的正是那一步。

## 每个函数都返回「数字 + 判定 + 人话」

`assume` 要的是布尔事实,但 Methods 段要的是依据链
(「Levene F=6.31, p=.014 → 方差不齐 → 改用 Welch」)。所以返回结构同时带两者,
让「分流依据一起交付」这个卖点在字段层面有落点,而不是靠模型复述。
"""

from __future__ import annotations

from dataclasses import dataclass, field, asdict
from typing import Any, Callable, Mapping

import numpy as np
from scipy import stats

# scipy 明示:Shapiro-Wilk 在 n>5000 时 p 值不可靠。
# 超过就固定种子子抽样,并**在结果里如实标注** —— 悄悄换算法而不说,是另一种编数字。
SHAPIRO_MAX_N = 5000
SUBSAMPLE_SEED = 20260805


def _p_safe(p: float) -> str:
    """兜底的 p 值串 —— **绝不输出 `p=0.000`**。

    🔴 这是踩出来的:首版依据链用裸 f-string `f"p={p:.3f}"`,Levene 的 p=2e-6 被印成 `p=0.000`,
    而它恰好出现在**用户要直接粘进论文**的 Methods 段里 —— 正是 report/format.py 整层要防的错误,
    从侧门漏了进来。
    ⚠️ 真正的格式化仍在 report 层(要按目标体系决定前导零等);本函数只保证
    「即便有人直接用 narrative_zh,也不会印出一个不可能的 p 值」。"""
    return "p<0.001" if p < 0.001 else f"p={p:.3f}"


@dataclass(frozen=True)
class CheckResult:
    id: str
    name_zh: str
    statistic: float
    # 🔴 `None` 是合法值(2026-08-07 放宽):期望频数检验**不是假设检验**,
    #    它是一条计数规则(Cochran 准则),没有 p。
    #    此前写死 float 会逼实现造一个假 p —— 而那个数会进依据链、进 Methods 段。
    p_value: float | None
    alpha: float
    verdict: bool          # True = 前提满足
    produces: dict[str, bool | float]
    narrative_zh: str      # 进 Methods 段依据链的那句话
    degraded: str | None = None  # 降级说明(如子抽样),非 None 时必须进报告
    # 逐组明细(name, statistic, p),供 report 按**目标体系**重新格式化依据链。
    per_group: tuple[tuple[str, float, float], ...] = ()

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def _shapiro(v: np.ndarray) -> tuple[float, float, str | None]:
    v = np.asarray(v, float)
    v = v[~np.isnan(v)]
    degraded = None
    if len(v) > SHAPIRO_MAX_N:
        rng = np.random.default_rng(SUBSAMPLE_SEED)
        v = rng.choice(v, SHAPIRO_MAX_N, replace=False)
        degraded = (
            f"样本量超过 {SHAPIRO_MAX_N},Shapiro-Wilk 的 p 值在该量级下失真"
            f"(scipy 明示),已按固定种子子抽样 {SHAPIRO_MAX_N} 例后检验。"
        )
    res = stats.shapiro(v)
    return float(res.statistic), float(res.pvalue), degraded


def shapiro_by_group(groups: dict[str, np.ndarray], *, alpha: float = 0.05) -> CheckResult:
    """逐组正态性。**全部组 p≥α 才判满足** —— 任一组不满足即整体不满足。"""
    per: list[tuple[str, float, float]] = []
    degraded: str | None = None
    for name, v in groups.items():
        w, p, deg = _shapiro(v)
        per.append((name, w, p))
        degraded = degraded or deg
    ok = bool(all(p >= alpha for _, _, p in per))
    worst = min(per, key=lambda t: t[2])
    detail = "、".join(f"{n}:W={w:.3f}, {_p_safe(p)}" for n, w, p in per)
    return CheckResult(
        id="shapiro_by_group",
        name_zh="各组正态性(Shapiro-Wilk)",
        statistic=worst[1],
        p_value=worst[2],
        alpha=alpha,
        verdict=ok,
        produces={"normal_by_group": ok},
        per_group=tuple(per),
        narrative_zh=(
            f"Shapiro-Wilk 正态性检验({detail}),"
            + ("各组均未拒绝正态性假设。" if ok else f"其中「{worst[0]}」组 p<{alpha} → 不满足正态性。")
        ),
        degraded=degraded,
    )


def levene_center_median(groups: dict[str, np.ndarray], *, alpha: float = 0.05) -> CheckResult:
    """方差齐性(Levene, center='median',即 Brown-Forsythe)。

    🔴 `center='median'` 是**刻意选择**而非默认值:对非正态更稳健。
    这个参数必须与 golden 的 R 参考脚本 `car::leveneTest(center=median)` 一致 ——
    但要记住红队指出的一点:卡片与 golden 共享同一个参数选择时,两者**不是独立证据**,
    golden 只能证明「这个参数下算对了」,证明不了「这个参数选对了」。后者由 primary 出处承担。
    """
    arrays = [np.asarray(v, float)[~np.isnan(np.asarray(v, float))] for v in groups.values()]
    stat, p = stats.levene(*arrays, center="median")
    # 🔴 `bool(...)` 不是多余的:scipy 返回 numpy 标量,`p >= alpha` 得到的是 **numpy.bool_**。
    #    它 json 序列化不了,曾被 `json.dumps(default=str)` 静默转成字符串 "False" ——
    #    而 Python 里 `bool("False")` 是 **True**,于是 Methods 段把「方差不齐」印成了「该前提满足」。
    #    原生类型转换必须在**产生处**做,不能指望序列化层兜底。
    ok = bool(p >= alpha)
    return CheckResult(
        id="levene_center_median",
        name_zh="方差齐性(Levene, center=median)",
        statistic=float(stat),
        p_value=float(p),
        alpha=alpha,
        verdict=ok,
        produces={"levene_equal": ok},
        narrative_zh=(
            f"Levene 方差齐性检验(以中位数为中心)F={stat:.3f}, {_p_safe(float(p))},"
            + ("方差齐性假设成立。" if ok else f"未达 {alpha} 水平 → 方差不齐。")
        ),
    )


def shapiro_diff(diff: np.ndarray, *, alpha: float = 0.05) -> CheckResult:
    """配对差值的正态性。

    ⚠️ 配对设计检验的是**差值**的正态性,不是两组各自的正态性 —— 这是最常见的误用之一,
    而且两种做法在数据上都跑得通、都不报错,只有懂行的审稿人会抓。
    """
    w, p, deg = _shapiro(diff)
    ok = bool(p >= alpha)
    return CheckResult(
        id="shapiro_diff",
        name_zh="配对差值正态性(Shapiro-Wilk)",
        statistic=w,
        p_value=p,
        alpha=alpha,
        verdict=ok,
        produces={"diff_normal": ok},
        narrative_zh=(
            f"对配对差值做 Shapiro-Wilk 检验:W={w:.3f}, {_p_safe(p)},"
            + ("差值未拒绝正态性假设。" if ok else f"未达 {alpha} 水平 → 差值不服从正态分布。")
        ),
        degraded=deg,
    )


# 检验 id → 实现。**这不是决策表**:「哪些检验适用」由卡片的 `applies_when` 决定,
# 这里只负责「选定之后怎么算」。同 engines/tests.py 的 DISPATCH,纯派发、无条件分支。
@dataclass(frozen=True)
class CheckCtx:
    """前提检验的上下文。与 `RunCtx` 分开:检验只需要 alpha 与少量参数,不需要方法 id。"""

    alpha: float = 0.05
    paired: bool = False
    params: Mapping[str, Any] = field(default_factory=dict)


# 🔴 C3(2026-08-07):第二次签名手术 —— `(groups, diff, alpha)` → `(target, ctx)`。
#
# 旧签名把「检验只可能作用在 groups 或 diff 上」写死在**每一个 lambda** 里。
# 分类族的 `expected_frequencies` 吃的是**列联表**,塞不进 `(groups, diff)`;
# 回归族的残差检验更不行。
#
# ⚠️ 与 S1 刻意**不对称**:计算层是「实现自取」(`data.two()`),检验层是
#    「主流程按卡片的 `target` 解析好对象再传进来」。理由是同一个 `_shapiro` 要被
#    by_group / diff 两张卡复用 —— 让实现自己去 data 里挑,`target` 字段就退化成装饰,
#    而它恰恰是卡片上唯一说明「这个检验检的是什么」的地方。
def expected_frequencies(table: Any, *, alpha: float = 0.05) -> CheckResult:
    """期望频数是否满足 **Cochran 准则** —— 分类资料族的分流依据。

    判据(Bewick 2004 逐字):**没有格子的期望频数 <1**,且 **期望频数 <5 的格子不超过 20%**。
    一条判据同时管住 2×2 与 R×C:2×2 里任一格 E<5 即 share=0.25>0.2,
    自动落到 Fisher 那一支,不需要为 2×2 单写规则。

    🔴 **刻意不加「N>40」那一档**:REGISTRY-OA出处 §七 R7 查实它在英文同行评议文献里
    **找不到任何出处**,是中文教科书的教学约定。留着它等于把一个没有出处的门槛
    写进用户的 Methods 段。

    ⚠️ 本检验**没有 p 值** —— 它不是假设检验,是一条计数规则。
    """
    e_min = float(table.expected_min)
    share = float(table.expected_lt5_share)
    ok = bool(e_min >= 1.0 and share <= 0.2)
    return CheckResult(
        id="expected_frequencies",
        name_zh="期望频数(Cochran 准则)",
        statistic=e_min,
        p_value=None,
        alpha=alpha,
        verdict=ok,
        produces={"expected_ok": ok},
        narrative_zh=(
            f"期望频数(Cochran 准则):最小期望频数 {e_min:.2f},"
            f"期望频数<5 的格子占 {share:.0%}"
            + ("(满足:无格子<1 且 <5 的格子≤20%)。" if ok
               else "(不满足,χ² 的近似不可靠)。")
        ),
    )


DISPATCH: dict[str, Callable[[Any, CheckCtx], CheckResult]] = {
    "expected_frequencies": lambda tgt, ctx: expected_frequencies(tgt, alpha=ctx.alpha),
    "shapiro_by_group": lambda tgt, ctx: shapiro_by_group(tgt, alpha=ctx.alpha),
    "levene_center_median": lambda tgt, ctx: levene_center_median(tgt, alpha=ctx.alpha),
    "shapiro_diff": lambda tgt, ctx: shapiro_diff(tgt, alpha=ctx.alpha),
}
