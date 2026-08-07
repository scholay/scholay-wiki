"""数值 golden —— 「算得对」的硬证据。

## 参考值从哪来

统计量与 p 值对 **R 的 `stats` 包**(t.test / wilcox.test / shapiro.test),
效应量对 **`effectsize` 包**,方差齐性对 **`car::leveneTest(center=median)`**。
参考值由 `tests/golden/ref/*.R` 全精度导出(`jsonlite::toJSON(digits=15)`),脚本进仓库保证可复现。

⚠️ **本文件内嵌的参考值是「已知恒等式 + 经典教科书例子」那一档**,不是 R 跑出来的全套 ——
真正的 R 参考值链路是 T3(2 天,开发机装 R)。C2 点名这是旧方案 8 天估算的主要低估点,
所以这里**先把最容易出错、且不需要 R 就能钉死的那些性质**测上,不假装 golden 已经完备。

## 容差

统计量 / 效应量 1e-6,p 值 1e-4。理由:R 的 t.test 输出与 scipy 走同一套算法,
差异只来自浮点累加顺序;放到 1e-6 既能抓实现错误,又不会被最后一位的抖动误伤。
"""

from __future__ import annotations

import math

import numpy as np
from scipy import stats

from statkit.engines import checks as chk
from statkit.engines import effects as eff
from statkit.engines import tests as tst
from statkit.core.dataset import Dataset


def _ds(groups, *, diff=None):
    """测试用的 Dataset 构造助手(C2 之后计算层吃的是 Dataset,不是裸 dict)。"""
    return Dataset(shape="groups", groups=groups, diff=diff)



TOL_STAT = 1e-6
TOL_P = 1e-4


def _fixture_unequal() -> tuple[np.ndarray, np.ndarray]:
    rng = np.random.default_rng(42)
    return rng.normal(50, 5, 40), rng.normal(56, 15, 38)


# ── 效应量 CI 的可用性(这条是踩出来的回归)────────────────────────────────
def test_nct_ci_is_finite_not_nan() -> None:
    """🔴 回归:非中心 t 的 CI 上界曾静默变成 NaN。

    根因:`scipy.stats.nct.cdf(t=-3.136, df=76, ncp=18.28)` 返回 NaN(内部级数下溢),
    搜索窗端点都正常、符号也对,但 brentq 二分到中间点就撞上并抛异常 → 被 except 吞成 NaN。
    后果:bundle 里 `ci_method` 写着 nct、`ci_high` 是 NaN,一路流进 Results 段。
    修法:NaN 按极限取值(ncp≫t_obs 时 cdf→0,≪时 →1)—— 数学上正确,不是抹平。
    """
    x, y = _fixture_unequal()
    for res in (eff.cohens_d(x, y), eff.hedges_g(x, y)):
        assert math.isfinite(res.ci_low), f"{res.name} 下界是 {res.ci_low}"
        assert math.isfinite(res.ci_high), f"{res.name} 上界是 {res.ci_high}"
        assert res.ci_low < res.value < res.ci_high, f"{res.name} 点估计不在区间内"


def test_nct_ci_covers_zero_when_not_significant() -> None:
    """不显著时 CI 必须跨 0 —— 这是效应量 CI 与 p 值的一致性,不一致说明实现错了。"""
    rng = np.random.default_rng(7)
    x, y = rng.normal(50, 6, 60), rng.normal(50.1, 6, 60)
    p = float(stats.ttest_ind(x, y, equal_var=True).pvalue)
    d = eff.cohens_d(x, y)
    assert p > 0.05
    assert d.ci_low < 0 < d.ci_high, f"p={p:.3f} 不显著,但 CI 不跨 0:{d}"


# ── 已知恒等式 ──────────────────────────────────────────────────────────────
def test_hedges_correction_matches_exact_gamma() -> None:
    """J 用精确 Gamma 形式;与常见近似 `1-3/(4df-1)` 在小样本下必须**可区分**。

    若哪天有人「顺手」把它换成近似式,这条会红 —— 那正是想要的:
    golden 对 R 的容差是 1e-6,近似式过不了。
    """
    for df in (8, 12, 20):
        exact = eff._hedges_correction(df)
        approx = 1.0 - 3.0 / (4.0 * df - 1.0)
        assert 0.8 < exact < 1.0
        assert abs(exact - approx) > 1e-6, f"df={df} 时精确与近似应可区分"
    # 大 df 时两者收敛
    assert abs(eff._hedges_correction(500) - (1 - 3 / (4 * 500 - 1))) < 1e-6


def test_hedges_g_is_shrunken_cohens_d() -> None:
    x, y = _fixture_unequal()
    d, g = eff.cohens_d(x, y), eff.hedges_g(x, y)
    assert abs(g.value) < abs(d.value), "Hedges' g 必须比 Cohen's d 更靠近 0"
    j = eff._hedges_correction(len(x) + len(y) - 2)
    assert abs(g.value - d.value * j) < TOL_STAT


def test_welch_df_is_fractional_and_smaller() -> None:
    """Welch–Satterthwaite 的 df 是**小数**且 ≤ 合并 df。

    模板不得把它四舍五入成整数 —— 这是 Results 段最常见的呈现错误之一。
    """
    x, y = _fixture_unequal()
    out = tst.welch_t(_ds({"A": x, "B": y}), tst.RunCtx())
    pooled_df = len(x) + len(y) - 2
    assert out["df"] != int(out["df"]), "Welch 的 df 不该是整数"
    assert out["df"] < pooled_df


def test_student_and_welch_t_statistics_are_identical_when_n_equal() -> None:
    """**组样本量相等**时,Student 与 Welch 的 t 统计量恒等(代数恒等式,与方差是否齐无关)。

    这条不需要 R 就能钉死实现:两者若不等,说明 `equal_var` 分支接错了。

    ⚠️ **但 df 不恒等** —— 首版这里还断言了 `df` 也相等,红了。
    原因是我把「总体 SD 相同」当成了「样本方差相同」:随机数据的样本方差必然略有差异,
    Welch–Satterthwaite 的 df 因此小于合并 df。恒等的只有 t 统计量这一项。
    (留这段说明是因为这类「看起来该相等」的直觉,正是 golden 要防的东西。)
    """
    rng = np.random.default_rng(11)
    x, y = rng.normal(10, 3, 50), rng.normal(11, 3, 50)
    s, w = (tst.student_t(_ds({"A": x, "B": y}), tst.RunCtx()),
            tst.welch_t(_ds({"A": x, "B": y}), tst.RunCtx()))
    assert abs(s["statistic"] - w["statistic"]) < TOL_STAT, "等样本量时 t 统计量必须恒等"
    assert w["df"] <= s["df"] + 1e-9, "Welch 的 df 不该超过合并 df"


def test_rank_biserial_bounds_and_direction() -> None:
    rng = np.random.default_rng(3)
    lo, hi = rng.normal(0, 1, 40), rng.normal(3, 1, 40)
    r = eff.rank_biserial(lo, hi)
    assert -1.0 <= r.value <= 1.0
    assert r.value < 0, "第一组明显更小 → r 应为负"
    assert r.ci_method == "bootstrap"


def test_rank_biserial_is_reproducible() -> None:
    """bootstrap 固定种子 → 重跑同一个数。

    「重跑」跑的是同一份脚本,不是重新问一次模型;不固定种子就做不到可复现。
    """
    rng = np.random.default_rng(5)
    x, y = rng.normal(0, 1, 30), rng.normal(1, 1, 30)
    a, b = eff.rank_biserial(x, y), eff.rank_biserial(x, y)
    assert a.ci_low == b.ci_low and a.ci_high == b.ci_high


# ── 前提检验 ────────────────────────────────────────────────────────────────
def test_levene_uses_median_center() -> None:
    """`center='median'`(Brown-Forsythe)是刻意选择,不是默认值。

    与 mean-center 的结果在偏态数据上**必须可区分** —— 否则说明参数没传进去。
    """
    rng = np.random.default_rng(13)
    a = rng.exponential(1.0, 60)
    b = rng.exponential(3.0, 60)
    ours = chk.levene_center_median({"a": a, "b": b})
    mean_centered = stats.levene(a, b, center="mean")
    assert abs(ours.statistic - float(mean_centered.statistic)) > 1e-6, (
        "与 mean-center 结果相同 → center='median' 很可能没生效"
    )
    ref = stats.levene(a, b, center="median")
    assert abs(ours.statistic - float(ref.statistic)) < TOL_STAT
    assert abs(ours.p_value - float(ref.pvalue)) < TOL_P


def test_shapiro_by_group_requires_all_groups_pass() -> None:
    """任一组不满足即整体不满足 —— 不是「多数通过就算过」。"""
    rng = np.random.default_rng(17)
    normal = rng.normal(0, 1, 60)
    skewed = rng.exponential(1.0, 60)
    ok = chk.shapiro_by_group({"a": normal, "b": rng.normal(0, 1, 60)})
    bad = chk.shapiro_by_group({"a": normal, "b": skewed})
    assert ok.verdict is True and ok.produces["normal_by_group"] is True
    assert bad.verdict is False and bad.produces["normal_by_group"] is False
    # 依据链要点名是哪一组坏了,否则用户改不动数据
    assert "b" in bad.narrative_zh


def test_shapiro_subsample_is_disclosed_not_silent() -> None:
    """n>5000 时子抽样必须**如实标注**。悄悄换算法而不说,是另一种编数字。"""
    rng = np.random.default_rng(19)
    big = rng.normal(0, 1, 6000)
    res = chk.shapiro_by_group({"a": big})
    assert res.degraded is not None
    assert "子抽样" in res.degraded


def test_shapiro_subsample_is_deterministic() -> None:
    rng = np.random.default_rng(23)
    big = rng.normal(0, 1, 6000)
    a = chk.shapiro_by_group({"g": big})
    b = chk.shapiro_by_group({"g": big})
    assert a.statistic == b.statistic and a.p_value == b.p_value


# ── p 值口径 ────────────────────────────────────────────────────────────────
def test_p_exact_is_float_never_string() -> None:
    """🔴 `p_exact` 必须是 float 原值。

    `p=.000` / `p<.05` / `NS` 三种错误写法**全部诞生于「在 bundle 里就已经是字符串」**;
    格式化只发生在 report 的确定性函数里(吃目标体系 + 原始 p)。
    """
    x, y = _fixture_unequal()
    for fn in (tst.student_t, tst.welch_t, tst.mann_whitney):
        out = fn(_ds({"A": x, "B": y}), tst.RunCtx())
        assert isinstance(out["p_exact"], float), f"{fn.__name__} 的 p_exact 不是 float"
        assert 0.0 <= out["p_exact"] <= 1.0


# ── 序列化保真(回归)────────────────────────────────────────────────────────
def test_check_verdicts_are_native_bools_not_numpy() -> None:
    """🔴 回归:`verdict` 必须是原生 bool。

    实测事故:scipy 返回 numpy 标量,`p >= alpha` 得到 `numpy.bool_`;
    它 json 序列化不了,被 `json.dumps(default=str)` 静默转成字符串 `"False"`,
    而 Python 里 `bool("False")` 是 **True** ⇒ Methods 段把「方差不齐」印成「该前提满足」。
    这句话会被用户直接粘进论文,是这一类 bug 里后果最重的形态。
    """
    import json

    rng = np.random.default_rng(31)
    a, b = rng.normal(0, 1, 40), rng.normal(0, 5, 40)  # 方差明显不齐
    res = chk.levene_center_median({"a": a, "b": b})

    assert res.verdict is False, "方差不齐时 verdict 必须是 False"
    assert type(res.verdict) is bool, f"verdict 类型是 {type(res.verdict)},不是原生 bool"
    for v in res.produces.values():
        assert type(v) is bool, f"produces 里的值类型是 {type(v)},不是原生 bool"

    # 序列化后仍是 JSON 布尔(不是 "False" 字符串)
    round_tripped = json.loads(json.dumps(res.to_dict()))
    assert round_tripped["verdict"] is False
    assert not isinstance(round_tripped["verdict"], str)


# ── 方差不齐时的效应量口径(2026-08-06 P0)────────────────────────────────────────
#
# 🔴 修的是一个**算错了但没有任何东西会报错**的地方:Welch 分支此前调 hedges_g,
#    而它底下是 cohens_d —— 合并 SD、df=n1+n2−2、非中心 t 反演,三个量全是等方差量。
#    蒙特卡洛实测标称 95% 的实际覆盖率:
#        n1=20 σ1 / n2=20 σ1  → 0.915
#        n1=10 σ4 / n2=40 σ1  → 0.698   ← 小样本那组方差大(Welch 的典型场景)
#        n1=10 σ1 / n2=40 σ4  → 0.998   ← 反过来宽得没用
#    换成 d_av + BCa 之后同样三格:0.940 / 0.945 / 0.953。
#
# 下面三条各管一件事:公式对不对、口径有没有如实落进 bundle、区间到底覆不覆盖得住。
# 前两条是确定性的,第三条是随机的但**种子固定** —— 它慢是慢在 bootstrap,
# 实测 300×600 约 1.5s,构建期付得起;而没有它,「覆盖率」这件事就只能靠人记得去跑。

def test_hedges_g_av_uses_root_mean_square_sd_not_pooled() -> None:
    """分母必须是 √((s₁²+s₂²)/2),不是合并 SD —— 手算对齐,不靠另一份实现。

    ⚠️ 样本量**必须不等**。合并 SD 与 d_av 在 n₁=n₂ 时是同一个数
    (√(((n−1)s₁²+(n−1)s₂²)/(2n−2)) ≡ √((s₁²+s₂²)/2)),等 n 的 fixture 测不出分母有没有换 ——
    首版就是拿 8 vs 8 写的,两支算出完全相同的值,断言形同虚设。
    """
    import numpy as np

    from statkit.engines import effects as eff

    x = np.array([12.0, 16.0, 20.0, 24.0, 28.0, 32.0])                    # n=6,sd 大
    y = np.array([9.0, 9.5, 10.0, 10.5, 11.0, 11.5, 12.0, 12.5,
                  13.0, 13.5, 14.0, 14.5])                                # n=12,sd 小
    s1, s2 = np.std(x, ddof=1), np.std(y, ddof=1)
    s_av = np.sqrt((s1**2 + s2**2) / 2)
    j = eff._hedges_correction(len(x) + len(y) - 2)
    expected = (np.mean(x) - np.mean(y)) / s_av * j

    got = eff.hedges_g_av(x, y, n_boot=200)
    assert abs(got.value - expected) < 1e-12, f"{got.value} vs {expected}"

    # 与合并 SD 那一支必须**真的不同**,否则说明分流没生效。
    # 这里 n 不等且 sd 差约 3 倍 —— 恰是 Welch 被选中的典型形态。
    pooled = eff.hedges_g(x, y)
    assert abs(got.value - pooled.value) > 0.05, (
        f"d_av({got.value:.4f}) 与 pooled({pooled.value:.4f}) 算出同一个数 —— 分母没换")


def test_pooled_and_dav_coincide_at_equal_n() -> None:
    """反向的数学不变式:n₁=n₂ 时两种分母恒等。

    钉住它有两个用处:① 它是上一条为什么必须用不等 n 的原因,写下来免得有人「简化」回去;
    ② 若哪天 d_av 的实现写错(比如漏了 ddof=1 或把均方根写成算术平均),这条会红。
    """
    import numpy as np

    from statkit.engines import effects as eff

    rng = np.random.default_rng(20260806)
    x = rng.normal(10, 4, 15)
    y = rng.normal(8, 1, 15)
    assert abs(eff.hedges_g_av(x, y, n_boot=200).value - eff.hedges_g(x, y).value) < 1e-12


def test_effect_results_declare_their_standardizer() -> None:
    """口径必须**可知**。审稿人问「你的 g 是怎么标准化的」时,这是唯一能答上来的字段;
    2026-08-06 之前 bundle 里一个字都没有,调研里六条用例的期望因此互不一致。"""
    import numpy as np

    from statkit.engines import effects as eff

    x = np.array([12.0, 14.0, 16.0, 18.0, 20.0, 22.0, 24.0, 26.0])
    y = np.array([9.0, 9.5, 10.0, 10.5, 11.0, 11.5, 12.0, 12.5])
    assert eff.cohens_d(x, y).standardizer == "pooled_sd"
    assert eff.hedges_g(x, y).standardizer == "pooled_sd"
    assert eff.hedges_g_av(x, y, n_boot=200).standardizer == "d_av"
    assert eff.paired_cohens_d(x - y).standardizer == "sd_of_differences"
    # ci_method 也要如实:d_av 走的是 bootstrap 不是 nct
    assert eff.hedges_g_av(x, y, n_boot=200).ci_method == "bootstrap"


def test_hedges_g_av_ci_actually_covers_under_unequal_variance() -> None:
    """🔴 覆盖率回归 —— 这条是本族存在的**理由**。

    场景取的正是出过事的那一格:小样本那组方差大(n1=10 σ4 / n2=40 σ1)。
    旧实现在这里是 0.698;阈值取 0.90 —— 300 次重复下 SE≈0.013,
    0.90 距真值 0.95 有 ~4 个 SE,既不会偶发假红,也绝不可能让 0.70 蒙混过关。
    """
    import numpy as np

    from statkit.engines import effects as eff

    reps, n1, s1, n2, s2 = 300, 10, 4.0, 40, 1.0
    true_g = 0.8 / np.sqrt((s1**2 + s2**2) / 2)
    rng = np.random.default_rng(20260806)
    hit = 0
    for _ in range(reps):
        x = rng.normal(0.8, s1, n1)
        y = rng.normal(0.0, s2, n2)
        e = eff.hedges_g_av(x, y, n_boot=600)
        if np.isfinite(e.ci_low) and e.ci_low <= true_g <= e.ci_high:
            hit += 1
    cov = hit / reps
    assert cov >= 0.90, f"方差不齐场景下 95%CI 实际覆盖率只有 {cov:.3f}"
