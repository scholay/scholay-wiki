"""分类资料族(P1 族②)—— 率的比较。

## 这一族为什么排在多组之后、其它之前

需求矩阵把「率的比较」排在两组均数比较之后的**第二位**:有效率 / 并发症率 / 阳性率
是中文临床论文最常见的结局类型。而引擎在 2026-08-06 之前对它是 `binary_outcome` **硬拒**。

## 边界(刻意收窄,每条都有理由)

**做**:2×2 Pearson χ²(不校正)· Yates 校正 χ²(只在 allowed,永不 default)·
Fisher 精确 · R×C Pearson χ² · McNemar(配对 2×2,**一律精确二项法**)·
Cochran-Armitage 线性趋势(有序分组 × 二分结局,自写)

**不做**,逐条理由:
- **R×C 精确检验(Fisher-Freeman-Halton)**:实测 scipy 的 R×C 分支是**蒙特卡洛**,
  同一张表连跑三次得 0.0061/0.0057/0.0056 —— 与 `software.bootstrap_seed` 承诺的
  「重跑得到同一个数」直接冲突。期望频数不足的 R×C 由 D-13 走 χ² + 强制披露,
  并把「合并类别」作为首选下一步。
- **N−1 卡方**(Campbell 2007 的首选):SPSS 无此输出,用户无法核对。记进 open question。
- **配对多分类(Bowker / Stuart-Maxwell)、有序×有序**:capability 卡诚实拒绝。

## 两个会静默出错的地方,写在最前面

1. **`correction=True` 是 scipy 的默认**。实测同一张 2×2:
   `correction=False` → p=0.0321;默认 → p=0.0608 —— **跨过 0.05**。
   所以方法卡的 engine 串必须显式写 `chi2_contingency(correction=False)`,
   而且金标恒等式(χ² == 合并两率 z²)钉的正是这一点(它对转置不变,抓不到行列放反)。
2. **零格表的 OR = inf**。实测 `odds_ratio([[10,0],[5,7]])` → `statistic=inf`,
   条件 CI = (1.818, inf)。而 `reports_required` 含 `effect.value` ⇒
   有限性闸会把**整份分析**判成 `non_finite_result` 拒收 ——
   而小样本零并发症恰恰是最需要 Fisher 的场景。故 2×2 默认效应量取**率差 RD**(有限)。
"""

from __future__ import annotations

from typing import Any

import numpy as np
from scipy import stats

from ..core.dataset import CountTable, Dataset
from .tests import RunCtx


class TrendNotEstimable(ValueError):
    """趋势检验的退化输入。单独一个类型,让 run.py 能把它翻成一张**属于这一格的**情况卡,
    而不是落进「非有限值」那条通用措辞里(那句话会把用户引去查组内变异)。"""


# ── 列联表构造(唯一入口)────────────────────────────────────────────────────
def build_table(group_vals: list[Any], dv_vals: list[Any], *,
                rows: list[str] | None = None,
                cols: list[str] | None = None) -> CountTable:
    """从**个体行**构造列联表。

    刻意只收个体行、不收汇总频数表:引擎全部的数据体检(哨兵编码 / 剔除占比 /
    幽灵组标签 / 重复配对格 / 标识列)都建立在个体行上,汇总表进来这些闸**全部空转**——
    而空转的闸比不存在的闸危险(用户以为体检过了)。
    """
    # 🔴 缺省水平顺序取**字典序**,不取「在文件里首次出现的顺序」。
    #    首版是后者,于是同一份数据把第一行挪到末尾,行列顺序就变 ——
    #    χ² 不变(它对置换不变),但率差**变号**,而没有任何字段能让读者察觉。
    #    结论不许依赖行序;真正需要指定顺序的场合(有序分组、配对表的同一套水平)
    #    由调用方显式传 rows/cols,那是**声明**,不是数据的副作用。
    r_levels = list(rows) if rows else sorted({str(g) for g in group_vals})
    c_levels = list(cols) if cols else sorted({str(d) for d in dv_vals})
    ri = {r: i for i, r in enumerate(r_levels)}
    ci = {c: j for j, c in enumerate(c_levels)}
    m = np.zeros((len(r_levels), len(c_levels)), dtype=float)
    for g, d in zip(group_vals, dv_vals):
        m[ri[str(g)], ci[str(d)]] += 1

    total = float(m.sum())
    row_sums = m.sum(axis=1, keepdims=True)
    col_sums = m.sum(axis=0, keepdims=True)
    expected = row_sums @ col_sums / total if total else np.zeros_like(m)

    cells: list[dict[str, Any]] = []
    for i, r in enumerate(r_levels):
        rs = float(row_sums[i, 0])
        for j, c in enumerate(c_levels):
            cells.append({
                "row": r, "col": c,
                "n": int(m[i, j]),
                "expected": float(expected[i, j]),
                # 🔴 `pct` 以**比例**存(0.7667 而不是 76.67):numcheck 的候选换算只有
                #    `(s, s*100)`(÷100 那个方向已于 2026-08-06 刻意删除),
                #    只存计数的话每一份分类交付物里的 `n(%)` 会**全部判无源**。
                # 行和为 0(某个水平在这份数据里一例都没有,配对表指定同一套行列时会发生)→
                # 写 **null** 而不是 NaN:NaN 会被 json.dumps 写成字面量 `NaN`,那是非法 JSON,
                # 前端 `JSON.parse` 当场抛 —— 而报错发生在交付的最后一步,信息量最低的地方。
                "pct": (float(m[i, j] / rs) if rs else None),
            })
    lt5 = int((expected < 5).sum())
    return CountTable(
        rows=tuple(r_levels), cols=tuple(c_levels), cells=tuple(cells),
        total=int(total),
        expected_min=float(expected.min()) if total else float("nan"),
        expected_lt5_share=float(lt5 / expected.size) if expected.size else float("nan"),
    )


def describe_table(t: CountTable, event: str) -> dict[str, dict[str, Any]]:
    """分类资料的描述统计 —— **例数与率**,逐行(逐组)一条。

    与连续路径的 `describe_groups` 占同一个 bundle 位置(`descriptives`),
    形态不同但契约相同:交付层与数字锁不必为两族分叉。

    `rate` 以**比例**存(0.7667 而不是 76.67):numcheck 的候选换算只有 `(s, s*100)`,
    存百分数的话正文里的 `76.67%` 与三线表里的 `(76.67)` 会有一处判无源。
    """
    m = t.matrix()
    out: dict[str, dict[str, Any]] = {}
    j = t.cols.index(event) if event in t.cols else None
    for i, r in enumerate(t.rows):
        n = float(m[i].sum())
        row: dict[str, Any] = {"n": int(n), "counts": {c: int(m[i, k]) for k, c in enumerate(t.cols)}}
        if j is not None:
            row["event_level"] = event
            row["event_n"] = int(m[i, j])
            row["rate"] = float(m[i, j] / n) if n else None
        out[str(r)] = row
    return out


def _rd_newcombe(a: int, n1: int, b: int, n2: int, level: float = 0.95) -> tuple[float, float, float]:
    """率差及其 Newcombe(方法 10:两个 Wilson 区间的平方和)置信区间。

    选 Newcombe 而不是 Wald:Wald 在率接近 0/1 或小样本时会给出**超出 [-1,1]** 的端点,
    而零并发症正是最常用 Fisher 的那一格。Newcombe 的端点恒在定义域内。
    """
    z = float(stats.norm.ppf(0.5 + level / 2))

    def wilson(x: int, n: int) -> tuple[float, float]:
        if n == 0:
            return (float("nan"), float("nan"))
        p = x / n
        d = 1 + z * z / n
        c = p + z * z / (2 * n)
        h = z * np.sqrt(p * (1 - p) / n + z * z / (4 * n * n))
        return ((c - h) / d, (c + h) / d)

    p1, p2 = a / n1, b / n2
    l1, u1 = wilson(a, n1)
    l2, u2 = wilson(b, n2)
    d = p1 - p2
    lo = d - np.sqrt((p1 - l1) ** 2 + (u2 - p2) ** 2)
    hi = d + np.sqrt((u1 - p1) ** 2 + (p2 - l2) ** 2)
    return float(d), float(max(-1.0, lo)), float(min(1.0, hi))


def _effect_2x2(t: CountTable, level: float = 0.95) -> dict[str, Any]:
    """2×2 的效应量:默认 **率差**;RR 与 OR 进 `effects_extra`(可能不可估计 → null)。

    🔴 为什么默认不是 OR:实测零格表 `[[10,0],[5,7]]` 的 OR = **inf**、CI=(1.818, inf),
    而 `reports_required` 含 `effect.value` ⇒ 有限性闸会把**整份分析**判成
    `non_finite_result` 拒收。同一张表的 RD 是 0.583,CI [0.200, 0.807],完好。
    另外 RD 与研究设计无关(RR 只适合队列/RCT,OR 只适合病例对照),而引擎不知道设计。
    """
    m = t.matrix()
    (a, b), (c, d) = m[0], m[1]
    n1, n2 = a + b, c + d
    rd, lo, hi = _rd_newcombe(int(a), int(n1), int(c), int(n2), level)

    extra: dict[str, Any] = {}
    p1 = a / n1 if n1 else float("nan")
    p2 = c / n2 if n2 else float("nan")
    # ⚠️ 不可估计时写 **null** 而不是 inf:`json.dumps(float('inf'))` 产出 `Infinity`,
    #    那是**非法 JSON**,而 `_native()` 今天不处理 inf。
    extra["risk_ratio"] = float(p1 / p2) if p2 else None
    extra["odds_ratio"] = float((a * d) / (b * c)) if b and c else None
    extra["risk_exposed"] = float(p1)
    extra["risk_reference"] = float(p2)
    return {
        "name": "risk_difference", "value": rd, "ci_low": lo, "ci_high": hi,
        "ci_method": "newcombe", "ci_level": level, "standardizer": "",
    }, extra


def _cramers_v(t: CountTable, chi2: float) -> dict[str, Any]:
    """Cramér's V = sqrt(χ²/(N·min(r-1,c-1)))。

    ⚠️ 金标提示:χ² == N·V² 这条恒等式在 V 按本式实现时是**恒等空测试**。
    真正有判别力的金标是 2×2 的 φ 走独立路径 `(ad−bc)/sqrt(行列边际积)` 再与 V 比 —— 见测试。
    """
    m = t.matrix()
    n = float(m.sum())
    k = min(m.shape) - 1
    v = float(np.sqrt(chi2 / (n * k))) if n and k else float("nan")
    return {"name": "cramers_v", "value": v, "ci_low": None, "ci_high": None,
            "ci_method": "none", "ci_level": 0.95, "standardizer": ""}


def _pack(t: CountTable, stat: float | None, df: float | None, p: float,
          effect: dict[str, Any], *, extra: dict[str, Any] | None = None,
          kind: str = "group_by_outcome", **more: Any) -> dict[str, Any]:
    # 🔴 `kind` 必须落进 bundle:独立样本的表是「分组 × 结局」,配对表是「前测水平 × 后测水平」——
    #    **两种完全不同的表**,而它们的 rows/cols/cells 结构一模一样。
    #    交付层若不知道是哪种,会把配对表当两组率去写「两组有效率分别为…」,
    #    而 McNemar 比的根本不是两组、是同一批人的两次。
    _meaning = {"group_by_outcome": ("分组", "结局水平"), "paired": ("前测水平", "后测水平")}[kind]
    out: dict[str, Any] = {
        "p_exact": float(p),
        "effect": effect,
        "table": {
            "kind": kind,
            "row_meaning_zh": _meaning[0], "col_meaning_zh": _meaning[1],
            "rows": list(t.rows), "cols": list(t.cols), "total": t.total,
            "expected_min": t.expected_min, "expected_lt5_share": t.expected_lt5_share,
            "cells": list(t.cells),
        },
        "n_extra": {"total": t.total},
    }
    # 🔴 Fisher 与 McNemar 精确法**没有 χ² 统计量**。
    #    scipy 的 `.statistic` 在 Fisher 上是 odds ratio、在 McNemar 精确上实测 = min(b,c)
    #    的失配对计数 —— 给它 `statistic_symbol: "χ²"` 会印出「χ²=3」这种**编造的统计量名**。
    #    宁可不给:交付层按方法卡的 reports_required 取,缺项渲染成体系包的占位符。
    if stat is not None:
        out["statistic"] = float(stat)
    if df is not None:
        out["df"] = float(df)
    if extra:
        out["effects_extra"] = extra
    out.update(more)
    return out


def _chi2(data: Dataset, ctx: RunCtx, *, correction: bool) -> dict[str, Any]:
    t = data.table
    assert t is not None
    m = t.matrix()
    chi2, p, df, _ = stats.chi2_contingency(m, correction=correction)
    if len(t.rows) == 2 and len(t.cols) == 2:
        eff, extra = _effect_2x2(t)
    else:
        eff, extra = _cramers_v(t, float(chi2)), None
    return _pack(t, chi2, df, p, eff, extra=extra,
                 correction=bool(correction))


def chi2_pearson(data: Dataset, ctx: RunCtx) -> dict[str, Any]:
    return _chi2(data, ctx, correction=False)


def chi2_yates(data: Dataset, ctx: RunCtx) -> dict[str, Any]:
    return _chi2(data, ctx, correction=True)


def chi2_rxc(data: Dataset, ctx: RunCtx) -> dict[str, Any]:
    return _chi2(data, ctx, correction=False)


def fisher_exact(data: Dataset, ctx: RunCtx) -> dict[str, Any]:
    t = data.table
    assert t is not None
    m = t.matrix().astype(int)
    res = stats.fisher_exact(m, alternative="two-sided")
    eff, extra = _effect_2x2(t)
    # 不给 statistic:scipy 这里的 `.statistic` 是 odds ratio,不是检验统计量。
    return _pack(t, None, None, float(res.pvalue), eff, extra=extra)


def mcnemar_exact(data: Dataset, ctx: RunCtx) -> dict[str, Any]:
    """配对 2×2 的 McNemar —— **一律精确二项法**。

    刻意不做「discordant<25 用精确、否则用 χ²」的自动切换:那是在一张卡内部
    按数据量偷偷换算法,p 值会跳(实测同一张表 exact 0.0352 / χ²校正 0.0389 /
    χ²不校正 0.0201),而这个切换点**不会出现在任何交付物里**。
    """
    t = data.table
    assert t is not None
    m = t.matrix()
    # 行 = 前测水平、列 = 后测水平,且**第 0 个水平是事件**(由 _order_outcome_levels 定序)。
    #   b = m[0,1] = 前测事件 → 后测非事件(**失去**)
    #   c = m[1,0] = 前测非事件 → 后测事件(**获得**)
    b, c = float(m[0, 1]), float(m[1, 0])
    n_disc = int(b + c)
    p = float(stats.binomtest(int(b), n_disc, 0.5).pvalue) if n_disc else 1.0
    # 🔴 符号 = **后测事件率 − 前测事件率** = (c − b)/N。
    #    首版写的是 (b − c)/N,**方向正好反了**:实测 40 例(10 一直有效 / 17 由无效转有效 /
    #    2 由有效转无效 / 11 一直无效)—— 有效率从 30.0% 升到 67.5%,是明确的**改善**,
    #    而 bundle 里落的是 −0.375。这个反号不会有任何机械闸报警(它是个完好的有限值),
    #    Results 句会照着它写出「治疗后有效率下降」——**结论完全相反**。
    total = t.total
    rd = float((c - b) / total) if total else float("nan")
    eff = {"name": "paired_risk_difference", "value": rd,
           "ci_low": None, "ci_high": None,
           "ci_method": "none", "ci_level": 0.95, "standardizer": ""}
    return _pack(t, None, None, p, eff, kind="paired",
                 discordant={"b_lost": int(b), "c_gained": int(c), "n": n_disc},
                 rates={"before": float(m[0].sum() / total) if total else None,
                        "after": float(m[:, 0].sum() / total) if total else None})


def cochran_armitage(data: Dataset, ctx: RunCtx) -> dict[str, Any]:
    """线性趋势检验(Cochran-Armitage)—— 有序分组 × 二分结局。自写。

    公式:以分组分数 x_i(缺省 0,1,2,…)与结局比例做加权线性相关,
        CA 统计量 = N · r²,自由度 1(χ² 分布)。

    🔴 金标(实测):statsmodels 的 `Table2x2 / proportion` 路径给
       `.zscore² = 10.0575 = (N−1)·r²`(Mantel-Haenszel 口径),
       而手算 `N·r² = 10.125` 与 R 的 `prop.trend.test` 一致。
       **两个独立实现互证** `CA = N·r²` / `MH = (N−1)·r²` —— 这是本族最强的一条金标。
       ⚠️ 必须用 `.zscore` 而不是 `.statistic`(后者实测 85.0,是未标准化的量)。
    """
    t = data.table
    assert t is not None
    m = t.matrix()
    scores = np.asarray(ctx.extra.get("group_scores") or list(range(len(t.rows))), dtype=float)
    n_i = m.sum(axis=1)
    # 🔴 事件是**第 0 列**,不是第 1 列。
    #    列序由 `_order_outcome_levels` 定,事件排在最前(与 `_effect_2x2` 取 m[0][0] 同源)。
    #    首版这里写 `m[:, 1]` —— 实测 30/30/30 例、有效率 30%→53%→80% 的**上升**趋势,
    #    落盘 r = **−0.41**。χ² 与 p 不受影响(它对调列只是换个符号再平方),
    #    所以三道机械闸全绿,只有那个符号是反的 —— 而 Results 句会写「随剂量升高疗效下降」。
    x_i = m[:, 0]
    n = float(n_i.sum())
    p_bar = float(x_i.sum() / n)
    x_bar = float((scores * n_i).sum() / n)
    sxx = float((n_i * (scores - x_bar) ** 2).sum())
    sxy = float(((x_i - n_i * p_bar) * (scores - x_bar)).sum())
    if sxx <= 0 or p_bar in (0.0, 1.0):
        # 退化表(分组分数无变异,或所有单元结局完全相同)—— 趋势在算术上不可估计。
        # 这里**不返回 NaN 蒙混过去**:返回 NaN 会被有限性闸拦下,但闸的措辞是
        # 「多半是某一组组内无变异」,对趋势场景答非所问。显式抛,给出这一格自己的说法。
        raise TrendNotEstimable(
            "线性趋势不可估计:分组分数无变异,或阳性结局在所有组里比例完全相同"
        )
    r2 = (sxy ** 2) / (sxx * n * p_bar * (1 - p_bar))
    chi2 = n * r2
    p = float(stats.chi2.sf(chi2, 1))
    r = float(np.sign(sxy) * np.sqrt(r2))
    # 趋势相关的 CI 走 Fisher-z
    se = 1.0 / np.sqrt(max(n - 3, 1))
    zr = np.arctanh(np.clip(r, -0.999999, 0.999999))
    zc = float(stats.norm.ppf(0.975))
    eff = {"name": "trend_r", "value": r,
           "ci_low": float(np.tanh(zr - zc * se)), "ci_high": float(np.tanh(zr + zc * se)),
           "ci_method": "fisher_z", "ci_level": 0.95, "standardizer": ""}
    return _pack(t, chi2, 1.0, p, eff, group_scores=[float(s) for s in scores])


DISPATCH: dict[str, Any] = {
    "chi2_pearson": chi2_pearson,
    "chi2_yates": chi2_yates,
    "chi2_rxc": chi2_rxc,
    "fisher_exact": fisher_exact,
    "mcnemar_exact": mcnemar_exact,
    "cochran_armitage": cochran_armitage,
}
