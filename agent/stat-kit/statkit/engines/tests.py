"""检验实现 —— 方法卡 `engine: "lib:scipy.stats.*"` 的调用层。

## 这一层为什么很薄

计算本身不是瓶颈:scipy 的 API 模型本来就写得对,StatABench 的失败归因是
**工具选择 50% / 合规执行 26% / 结果解读 24%**,纯计算不在里面。
所以这里只做三件薄事:调库、把结果整成 bundle 契约的形状、把描述统计一并算出来。

真正值钱的是**外面那两层**:`assume` 决定调哪个(守门),`report` 决定怎么写(交付)。

## 🔴 `p_exact` 存 float 原值

`p=.000` / `p<.05` / `NS` 三种错误写法**全部诞生于「在 bundle 里就已经是字符串」**。
格式化只发生在 report verb 的确定性函数里(吃目标体系 + 原始 p)。本层绝不格式化。
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Callable

import numpy as np
from scipy import stats

from ..core.dataset import Dataset
from . import effects as eff


# ── 🔴 S1(2026-08-06):计算契约从 `(x, y)` 改成 `(groups, ctx)` ────────────────
#
# 旧契约是两个位置参数 —— 它把「只支持两组」焊死在**每一个实现的签名**上,
# 而那不是任何一张卡片说的,是五个函数各自的形状。后果在加多组族的当天兑现:
# 主流程 `x, y = arrays[keys[0]], arrays[keys[1]]` 只解包前两个,
# 于是 3 组数据算出 `df=22`(24 例)而 `n.by_group` 记着 36 例 —— 静默截断,零红灯。
#
# 新契约:实现拿到**完整的 groups 映射**(有序,键是真实组名),外加一个 ctx 携带
# 配对差值 / alpha / 方法 id。两组族的实现自己从 groups 里取前两个 —— 那是它们的事,
# 不是调用方的事。多组族拿全量。
#
# ⚠️ 为什么 ctx 而不是继续加位置参数:加第三、第四个位置参数会让每次扩展都改五处签名。
#    ctx 是**可加字段而不破坏既有实现**的形状(回归族要 model、生存族要 time/event)。
@dataclass(frozen=True)
class RunCtx:
    """一次计算的上下文。实现按需取,不用的忽略。"""

    paired: bool = False
    diff: np.ndarray | None = None          # 配对差值(paired=True 时由主流程算好)
    alpha: float = 0.05
    method_id: str = ""
    extra: dict[str, Any] = field(default_factory=dict)

    # 注:取前两组的助手在 `Dataset.two()` 上 —— 它属于**数据**而不是上下文。
    #    ctx 只携带「这次怎么算」的参数(alpha / paired / 方法 id),不携带数据。


def _describe(v: np.ndarray) -> dict[str, float]:
    v = np.asarray(v, float)
    v = v[~np.isnan(v)]
    q1, med, q3 = np.percentile(v, [25, 50, 75])
    return {
        "n": int(len(v)),
        "mean": float(np.mean(v)),
        "sd": float(np.std(v, ddof=1)),
        "median": float(med),
        "q1": float(q1),
        "q3": float(q3),
        "min": float(np.min(v)),
        "max": float(np.max(v)),
    }


def _mean_diff_ci(d: np.ndarray, level: float = 0.95) -> dict[str, float]:
    """配对差值均数的 95%CI —— 与配对 t 检验同源(同一个 t 分布、同一个自由度)。"""
    d = np.asarray(d, float)
    n = len(d)
    se = float(np.std(d, ddof=1)) / np.sqrt(n)
    crit = float(stats.t.ppf(0.5 + level / 2, n - 1))
    m = float(np.mean(d))
    return {"mean_ci_low": m - crit * se, "mean_ci_high": m + crit * se, "ci_level": level}


def _two_sample(x: np.ndarray, y: np.ndarray, *, equal_var: bool) -> dict[str, Any]:
    res = stats.ttest_ind(x, y, equal_var=equal_var)
    # 🔴 方差不齐时**分母也要换**(2026-08-06 修)。
    #
    # 此前这里是 `eff.hedges_g(x, y)`,而 hedges_g 底下是 cohens_d:合并 SD、df=n1+n2−2、
    # 非中心 t 反演 —— 三个量全是等方差量。蒙特卡洛实测:小样本那组方差大时,
    # 标称 95% 的区间实际只覆盖 **71%**,而那正是 Levene 判不齐、引擎改用 Welch 的典型场景。
    # 详见 effects.hedges_g_av 的文档串。
    e = eff.cohens_d(x, y) if equal_var else eff.hedges_g_av(x, y)
    return {
        "statistic": float(res.statistic),
        # ⚠️ Welch 的 df 是**小数**(Welch–Satterthwaite),模板不得四舍五入成整数。
        "df": float(res.df),
        "p_exact": float(res.pvalue),
        "effect": e.to_dict(),
    }


def student_t(data: Dataset, ctx: RunCtx) -> dict[str, Any]:
    x, y = data.two()
    return _two_sample(x, y, equal_var=True)


def welch_t(data: Dataset, ctx: RunCtx) -> dict[str, Any]:
    x, y = data.two()
    return _two_sample(x, y, equal_var=False)


def mann_whitney(data: Dataset, ctx: RunCtx) -> dict[str, Any]:
    x, y = data.two()
    res = stats.mannwhitneyu(x, y, alternative="two-sided")
    e = eff.rank_biserial(x, y)
    return {
        "statistic": float(res.statistic),
        "p_exact": float(res.pvalue),
        "effect": e.to_dict(),
        # 🔴 这里**曾经**返回 `"descriptives": {"group_1": …, "group_2": …}`,2026-08-05 删掉。
        #    组装 bundle 时 `**result` 排在字面量最后,于是它**静默覆盖**掉了
        #    上游按真实组名算好的 `describe_groups(arrays)` —— 每一份非参 bundle 的
        #    描述统计键都变成了 `group_1`/`group_2`,读的人只能靠隐式顺序猜哪个是哪个,
        #    猜反了三线表两行就对调(而两行数字都对,没有任何东西会报错)。
        #    描述统计本来就由调用方按组名算好且含 median/q1/q3,这里重复算一遍纯属有害。
        #    「非参必须报中位数而不是均数」这条约束活在方法卡的 `nonparametric` 上,不在这里。
    }


def paired_t(data: Dataset, ctx: RunCtx) -> dict[str, Any]:
    x, y = data.two()
    d = np.asarray(x, float) - np.asarray(y, float)
    res = stats.ttest_rel(x, y)
    e = eff.paired_cohens_d(d)
    return {
        "statistic": float(res.statistic),
        "df": float(res.df),
        "p_exact": float(res.pvalue),
        "effect": e.to_dict(),
        # 配对设计的三线表要有「差值」一行 —— 审稿人看的是差值及其区间,不是两个时点各自的均数。
        # 均数差的 95%CI 用与检验同一个 t 分布算,保证表里的区间与 p 值出自同一套假设
        # (拿正态近似另算一份,会出现「区间跨 0 但 p<0.05」这种自相矛盾的表)。
        "descriptives_diff": {**_describe(d), **_mean_diff_ci(d)},
    }


def wilcoxon(data: Dataset, ctx: RunCtx) -> dict[str, Any]:
    x, y = data.two()
    d = np.asarray(x, float) - np.asarray(y, float)
    res = stats.wilcoxon(x, y)
    e = eff.matched_rank_biserial(d)
    # 🔴 零差值对被 Wilcoxon 原法(zero_method="wilcox",scipy 的默认)**直接丢弃**,
    #    而三处计数此前互不一致:`n.pairs` 数全部对、`descriptives_diff` 含零差值、
    #    效应量 `matched_rank_biserial` 又把零排除。
    #
    #    实测产出(15 对里 10 对前后完全没变):两个时点中位数都是 10.000、差值行 0.000、
    #    无方向词,却断言 p=0.039 有统计学意义、r=−1.00 且 95%CI 退化成 [−1.00,−1.00];
    #    Methods 还写「分析所用数据文件中无缺失值」。**审稿人按表里 n=15 复算得不到 p=0.039**
    #    (检验实际只用了 5 对)—— 整张表既不可解释也不可复核。
    #
    #    「多数人没变化」在护理/康复/教育的前后测里是常见形态,不是边角。
    #    这里不改 zero_method(改成 Pratt 会让 p 与 SPSS 默认输出对不上,是另一个决定),
    #    而是**把丢弃如实报出来**:检验的有效 n 必须可见,并由 report 强制披露。
    _n_zero = int(np.sum(d == 0))
    _n_eff = int(len(d) - _n_zero)
    return {
        "statistic": float(res.statistic),
        "p_exact": float(res.pvalue),
        "effect": e.to_dict(),
        # 参与秩计算的对数(= 非零差值对)与被丢弃的对数。
        #
        # 走 `n_extra` 而不是往 bundle 顶层堆:这两个计数**语义上属于 `n`**
        # (它们和 `n.pairs` 是同一类东西 —— 关于分析单元的计数),而 `n` 是组装方的字段,
        # 实现不得直接触碰(见 test_engine_results_cannot_clobber_bundle_fields:
        # 字典字面量的覆盖是静默的,曾让非参 bundle 的组描述统计整个消失)。
        # `n_extra` 是一条**方法无关**的通道:任何实现都可以报自己的单元计数,
        # 由 run_analysis 合并进 `n`,而不需要组装方认识具体是哪个方法。
        "n_extra": {"pairs_effective": _n_eff, "zero_diffs": _n_zero},
        # (Wilcoxon 不给均数差的 CI:它检验的不是均数差。Hodges-Lehmann 估计量及其区间
        #  才是配套的那一个,P0 未实现 —— 宁可不给,也不给一个与检验假设不配套的区间。)
        # 差值的描述统计另立门户 —— 键名若还叫 `descriptives` 就会覆盖掉按组名算好的那份
        # (2026-08-05 实测:配对 Wilcoxon 的 bundle 里组描述统计整个消失,三线表直接 KeyError)。
        # 差值本身是**配对设计该报的东西**(中文医学期刊的配对表要有「差值(95%CI)」一行),
        # 所以不是删掉而是改名,由 report 层单独渲染成差值行。
        "descriptives_diff": _describe(d),
    }


# ── 多组族(P1 族①)──────────────────────────────────────────────────────────
#
# 三个 omnibus + 各自配套的事后比较。**事后是 omnibus 的一部分,不是另一次调用** ——
# 拆成两步会让「先看 F 显著不显著再决定要不要做事后」这个决定落到模型头上,
# 而那正是多重比较失控最常见的入口(挑显著的做事后)。一次算完、一起交付。

def _multi(groups: dict[str, np.ndarray], ctx: RunCtx, *,
           omnibus: str, posthoc_fn: Any, effect_fn: Any) -> dict[str, Any]:
    from . import posthoc as ph

    arrs = [np.asarray(v, float) for v in groups.values()]
    k, n = len(arrs), sum(len(a) for a in arrs)
    if omnibus == "kruskal":
        res = stats.kruskal(*arrs)
        stat, p, df = float(res.statistic), float(res.pvalue), float(k - 1)
        df2 = None
    elif omnibus == "welch_anova":
        # Welch's ANOVA(不假定等方差)。scipy 没有 —— 用 Welch 的原式:
        #   w_i = n_i/s²_i;  W = Σw_i;  m = Σ(w_i·x̄_i)/W
        #   A = Σ w_i(x̄_i − m)² / (k−1)
        #   B = 2(k−2)/(k²−1) · Σ (1 − w_i/W)²/(n_i−1)
        #   F = A/(1+B),  df1 = k−1,  df2 = (k²−1)/(3·Σ(1−w_i/W)²/(n_i−1))
        w = np.array([len(a) / np.var(a, ddof=1) for a in arrs])
        W = float(w.sum())
        m = float((w * np.array([a.mean() for a in arrs])).sum() / W)
        A = float((w * (np.array([a.mean() for a in arrs]) - m) ** 2).sum() / (k - 1))
        lam = float(sum((1 - wi / W) ** 2 / (len(a) - 1) for wi, a in zip(w, arrs)))
        B = 2 * (k - 2) / (k ** 2 - 1) * lam
        stat = A / (1 + B)
        df, df2 = float(k - 1), float((k ** 2 - 1) / (3 * lam))
        p = float(stats.f.sf(stat, df, df2))
    else:
        res = stats.f_oneway(*arrs)
        stat, p = float(res.statistic), float(res.pvalue)
        df, df2 = float(k - 1), float(n - k)

    post = posthoc_fn(groups)
    e = effect_fn(groups)
    return {
        "statistic": stat,
        "df": df,
        # 分母自由度:F 检验要写成 F(df1, df2),少一个数审稿人就复算不了。
        **({"df2": df2} if df2 is not None else {}),
        "p_exact": p,
        "effect": e.to_dict(),
        # 事后比较 —— 数组形态。`_dig` 的数组段(S3)正是为它补的。
        "posthoc": post.to_dict()["pairs"],
        "posthoc_method": post.method,
        # 字母标记:共享字母 = 差异不显著。农学/食品/体育论文的第一交付物。
        "cld": ph.compact_letters(post, alpha=ctx.alpha),
        "n_extra": {"total": int(n), "groups": int(k)},
    }


def oneway_anova(data: Dataset, ctx: RunCtx) -> dict[str, Any]:
    from . import posthoc as ph

    return _multi(data.groups, ctx, omnibus="f_oneway",
                  posthoc_fn=ph.tukey_hsd, effect_fn=eff.eta_squared)


def welch_anova(data: Dataset, ctx: RunCtx) -> dict[str, Any]:
    from . import posthoc as ph

    return _multi(data.groups, ctx, omnibus="welch_anova",
                  posthoc_fn=ph.games_howell, effect_fn=eff.eta_squared)


def kruskal_wallis(data: Dataset, ctx: RunCtx) -> dict[str, Any]:
    from . import posthoc as ph

    return _multi(data.groups, ctx, omnibus="kruskal",
                  posthoc_fn=ph.dunn, effect_fn=eff.epsilon_squared)


# 方法 id → 实现。**这不是决策表** —— 选哪个由 assume 按卡片决定,这里只负责「选定之后怎么算」。
# (test_no_method_names_in_core 不扫 engines/:那里方法名出现在函数名里是正当的,
#  危险的是「行为随卡片 id 分叉」,而本表是纯派发、无条件分支。)
DISPATCH: dict[str, Callable[[Dataset, RunCtx], dict[str, Any]]] = {
    "student_t": student_t,
    "welch_t": welch_t,
    "mann_whitney": mann_whitney,
    "paired_t": paired_t,
    "wilcoxon": wilcoxon,
    "oneway_anova": oneway_anova,
    "welch_anova": welch_anova,
    "kruskal_wallis": kruskal_wallis,
}


def describe_groups(groups: dict[str, np.ndarray]) -> dict[str, dict[str, float]]:
    return {k: _describe(v) for k, v in groups.items()}
