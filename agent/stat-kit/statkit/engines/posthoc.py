"""事后多重比较 + 字母标记(CLD)—— P1 族① 的核心。

## 为什么这一族值钱

调研结论:`compact_letter_display`(a/b/c 显著性字母标记)是**全场唯一竞品都没有的能力**
(SYNTHESIS-产品形态 §6.1 称之为「GraphPad Prism 留的结构性空白」),
而它恰恰是农学 / 食品 / 体育论文的**第一交付物** —— 三线表里那一列 a/ab/b 就是全部结论。

## 边界:哪些是库给的,哪些必须自写

发布版 `scikit-posthocs 0.14.0` 的实际导出面(Dockerfile 有构建期断言逐名钉死):

  ✅ `posthoc_dunn` / `posthoc_conover` / `posthoc_dscf` / `posthoc_tukey` / `posthoc_tukey_hsd`
     + `_grouping.compact_letter_display`(吃任意 posthoc 的 p 值矩阵,原生 52 字母)
  ❌ `posthoc_games_howell`(**方差不齐时的默认**)· `posthoc_duncan`(农学/食品默认)
     —— 这两个**只存在于 GitHub master,从未进发布版**,必须自写。

本模块只写 Games-Howell(方差不齐 → 事后,是分流路径上真正会走到的那一格);
Duncan 属农学惯例(D-09,convention 档),留到有真实需求再写 —— 不为「清单好看」提前写。

## Games-Howell 的公式(自写,故写清出处)

对每一对 (i, j):
    差值      d      = mean_i − mean_j
    标准误    se     = sqrt(s²_i/n_i + s²_j/n_j)          ← 不合并方差,这是它的全部意义
    Welch df  ν      = (s²_i/n_i + s²_j/n_j)² /
                       [ (s²_i/n_i)²/(n_i−1) + (s²_j/n_j)²/(n_j−1) ]
    统计量    q      = |d| / (se / sqrt(2))               ← studentized range 的尺度
    p        = studentized_range.sf(q, k, ν)              ← k = **总组数**,不是 2

⚠️ 两个容易写错的点,都在这里钉死:
  · `q` 的分母是 `se/sqrt(2)` 不是 `se` —— studentized range 的定义带 √2;
  · `k` 取**总组数**而不是 2 —— 多重性正是靠这个进入分布的,写 2 就退化成两两 Welch t
    (那会让 p 值系统性偏小,而且不报错)。
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import numpy as np
from scipy import stats


@dataclass(frozen=True)
class PairwiseResult:
    method: str
    pairs: list[dict[str, Any]]           # [{a, b, diff, p_adj, ci_low?, ci_high?}]
    p_matrix: dict[str, dict[str, float]]  # 供 CLD 用

    def to_dict(self) -> dict[str, Any]:
        return {"method": self.method, "pairs": self.pairs}


def _as_matrix(names: list[str], pairs: list[dict[str, Any]]) -> dict[str, dict[str, float]]:
    m = {a: {b: (0.0 if a == b else 1.0) for b in names} for a in names}
    for p in pairs:
        m[p["a"]][p["b"]] = m[p["b"]][p["a"]] = float(p["p_adj"])
    return m


def games_howell(groups: dict[str, np.ndarray], *, level: float = 0.95) -> PairwiseResult:
    """Games-Howell —— **方差不齐**时的事后比较。发布版 scikit-posthocs 没有,故自写。"""
    names = list(groups)
    k = len(names)
    stat = {g: (len(v), float(np.mean(v)), float(np.var(v, ddof=1))) for g, v in groups.items()}
    pairs: list[dict[str, Any]] = []
    for i in range(k):
        for j in range(i + 1, k):
            a, b = names[i], names[j]
            na, ma, va = stat[a]
            nb, mb, vb = stat[b]
            se2 = va / na + vb / nb
            se = float(np.sqrt(se2))
            if se == 0 or not np.isfinite(se):
                pairs.append({"a": a, "b": b, "diff": ma - mb, "p_adj": float("nan"),
                              "df": float("nan"), "ci_low": float("nan"), "ci_high": float("nan")})
                continue
            # Welch–Satterthwaite
            df = se2 ** 2 / ((va / na) ** 2 / (na - 1) + (vb / nb) ** 2 / (nb - 1))
            q = abs(ma - mb) / (se / np.sqrt(2.0))
            p = float(stats.studentized_range.sf(q, k, df))
            # 置信区间:临界 q 反算(与 p 同一套分布,保证区间与 p 一致)
            qcrit = float(stats.studentized_range.ppf(level, k, df))
            half = qcrit * se / np.sqrt(2.0)
            pairs.append({
                "a": a, "b": b, "diff": float(ma - mb),
                "p_adj": min(1.0, max(0.0, p)), "df": float(df),
                "ci_low": float(ma - mb - half), "ci_high": float(ma - mb + half),
            })
    return PairwiseResult("games_howell", pairs, _as_matrix(names, pairs))


def tukey_hsd(groups: dict[str, np.ndarray], *, level: float = 0.95) -> PairwiseResult:
    """Tukey HSD —— 方差齐时的事后比较。走 scipy 自带实现(有 CI,且经过上游测试)。"""
    names = list(groups)
    res = stats.tukey_hsd(*[np.asarray(groups[g], float) for g in names])
    ci = res.confidence_interval(confidence_level=level)
    pairs: list[dict[str, Any]] = []
    for i in range(len(names)):
        for j in range(i + 1, len(names)):
            pairs.append({
                "a": names[i], "b": names[j],
                "diff": float(np.mean(groups[names[i]]) - np.mean(groups[names[j]])),
                "p_adj": float(res.pvalue[i, j]),
                "ci_low": float(ci.low[i, j]), "ci_high": float(ci.high[i, j]),
            })
    return PairwiseResult("tukey_hsd", pairs, _as_matrix(names, pairs))


def dunn(groups: dict[str, np.ndarray], *, p_adjust: str = "holm") -> PairwiseResult:
    """Dunn —— Kruskal-Wallis 的配套事后比较(非参)。走 scikit-posthocs。

    校正法取 `holm` 而不是 `bonferroni`:同样控制族错误率但一致地更有功效,
    没有理由选更保守的那个。口径写进 bundle 的 `method`,Methods 段会带出去。
    """
    import scikit_posthocs as sp

    names = list(groups)
    m = sp.posthoc_dunn([np.asarray(groups[g], float) for g in names], p_adjust=p_adjust)
    pairs: list[dict[str, Any]] = []
    for i in range(len(names)):
        for j in range(i + 1, len(names)):
            pairs.append({
                "a": names[i], "b": names[j],
                # 非参:报**中位数差**而不是均数差 —— 与检验用的位置统计量保持同源
                # (2026-08-06 的方向词事故就是这两者混用造成的)。
                "diff": float(np.median(groups[names[i]]) - np.median(groups[names[j]])),
                "p_adj": float(m.iloc[i, j]),
            })
    return PairwiseResult(f"dunn_{p_adjust}", pairs, _as_matrix(names, pairs))


def compact_letters(result: PairwiseResult, alpha: float = 0.05) -> dict[str, str]:
    """字母标记(CLD):共享字母 = 差异不显著。

    走 scikit-posthocs 的 `compact_letter_display`(Piepho 2004 sweep-and-absorb 等价算法)。
    刻意不自写:CLD 的正确性判据是「共享字母 ⇔ 不显著」,自写版极易在**传递性**上出错
    (A~B、B~C 但 A≠C 时字母怎么分配),而错了不会报错 —— 只会让三线表的结论悄悄变形。

    ⚠️ 组名里若含 CLD 用到的字符不影响:字母是**另起**的,与组名无关。
    """
    import pandas as pd
    import scikit_posthocs as sp

    names = list(result.p_matrix)
    df = pd.DataFrame([[result.p_matrix[a][b] for b in names] for a in names],
                      index=names, columns=names)
    letters = sp.compact_letter_display(df, alpha=alpha)
    return {str(k): str(v) for k, v in dict(letters).items()}
