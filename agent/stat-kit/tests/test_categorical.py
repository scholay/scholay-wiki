"""分类资料族的数值金标与**符号方向**测试(P1 族②,2026-08-07)。

## 为什么这一族的测试必须单独写、而且必须包含「符号」

引擎里自写的三件东西 —— Newcombe 区间、Cramér's V、Cochran-Armitage —— 没有 scipy 可比对。
自写代码只有两种验证方式:① 与**独立实现**比;② 与**恒等式**比。这里两种都用。

但更值钱的是第二类断言:**方向**。落地当天做变异验证,四个变异里有三个全绿穿过:

  · `x_i = m[:, 0]` 改成 `m[:, 1]`(趋势的事件列)—— 158 条全绿。
    实测后果:30%→53%→80% 的**上升**趋势,落盘 r = −0.41,
    而 χ² 与 p **完全不变**(对调两列只是给相关系数换个符号再平方)⇒
    reports_required、有限性闸、numcheck 三道机械闸结构上无感,
    只有 Results 那句「随剂量升高疗效下降」是反的。
  · `(c − b)` 改回 `(b − c)`(McNemar 的率差)—— 158 条全绿。
    实测后果:有效率 30.0%→67.5% 的明确改善,落盘 −0.375。
  · `correction=False` 改回 scipy 默认的 `True` —— 158 条全绿。
    实测后果:同一份 60 例数据 p 从 0.0321 变成 0.0608,**跨过 0.05**,结论翻面。

三个都不会报错、都产出完好的有限值、都能通过全部既有护栏。
所以本文件的每条测试都刻意用**不对称的夹具**(率不相等、失配对不相等、趋势单调),
让符号反了就必然红 —— 对称夹具在这里等于没测。
"""

from __future__ import annotations

import math

import numpy as np
import pytest
from scipy import stats

from statkit.core.dataset import Dataset
from statkit.engines import categorical as cat
from statkit.engines import checks as chk
from statkit.engines.tests import RunCtx


def _ds(t):
    return Dataset(shape="table", table=t)


def _tbl(counts, rows=None, cols=None):
    """由 {行: {列: 计数}} 造表 —— 经 build_table 的**个体行**入口,与真实路径同一条。"""
    g, d = [], []
    for r, row in counts.items():
        for c, n in row.items():
            g += [r] * n
            d += [c] * n
    return cat.build_table(g, d, rows=rows or list(counts),
                           cols=cols or list(next(iter(counts.values()))))


# ══ 金标一:2×2 χ²(不校正)== 合并两率的 z² ═══════════════════════════════
def test_chi2_equals_pooled_two_proportion_z_squared() -> None:
    """独立路径的恒等式。**它钉的正是 `correction=False`** ——
    Yates 校正会破坏这个恒等式,所以把 scipy 的默认值放回来,这条当场红。

    ⚠️ 恒等式对**转置不变**,所以它抓不到行列放反;那由下面的符号测试负责。
    """
    t = _tbl({"试验组": {"有效": 23, "无效": 7}, "对照组": {"有效": 15, "无效": 15}})
    out = cat.chi2_pearson(_ds(t), RunCtx())

    # 独立实现:合并率的两样本比例 z 检验
    a, n1 = 23, 30
    b, n2 = 15, 30
    p_pool = (a + b) / (n1 + n2)
    se = math.sqrt(p_pool * (1 - p_pool) * (1 / n1 + 1 / n2))
    z = (a / n1 - b / n2) / se

    assert abs(out["statistic"] - z * z) < 1e-9, (
        f"χ²={out['statistic']!r} 与合并两率 z²={z * z!r} 不等 —— "
        f"多半是 correction 被改回了 scipy 的默认值 True(Yates 校正)"
    )
    assert out["df"] == 1.0


def test_yates_correction_can_flip_the_conclusion_so_it_must_be_explicit() -> None:
    """校正与不校正在同一份数据上跨过 0.05 —— 这就是它不许继承库默认值的理由。

    这条不是在说哪个对(两派都有人用,规则里标了 contested),
    而是在钉「这个参数能翻结论」这个事实:能翻结论的参数必须显式声明、且被披露。
    """
    t = _tbl({"试验组": {"有效": 23, "无效": 7}, "对照组": {"有效": 15, "无效": 15}})
    p_raw = cat.chi2_pearson(_ds(t), RunCtx())["p_exact"]
    p_yates = cat.chi2_yates(_ds(t), RunCtx())["p_exact"]
    assert p_raw < 0.05 < p_yates, (
        f"这份夹具本该跨过 0.05(不校正 {p_raw:.4f} / 校正 {p_yates:.4f})—— "
        f"夹具失效了,这条测试就不再证明「参数能翻结论」"
    )


# ══ 金标二:McNemar 精确 == 失配对对子上的二项检验 ═══════════════════════════
def test_mcnemar_exact_equals_binomial_test_on_discordant_pairs() -> None:
    t = _tbl({"有效": {"有效": 10, "无效": 2}, "无效": {"有效": 17, "无效": 11}},
             rows=["有效", "无效"], cols=["有效", "无效"])
    out = cat.mcnemar_exact(_ds(t), RunCtx(paired=True))
    ref = float(stats.binomtest(2, 2 + 17, 0.5).pvalue)
    assert abs(out["p_exact"] - ref) < 1e-15
    # 一致的那两格(10 与 11)**不参与** —— 这正是它区别于 χ² 的地方
    assert out["discordant"] == {"b_lost": 2, "c_gained": 17, "n": 19}


def test_mcnemar_effect_sign_is_after_minus_before() -> None:
    """🔴 符号方向。夹具刻意**不对称**:17 人由无效转有效、只有 2 人反向 ⇒ 明确改善。

    首版写的是 `(b − c)/N`,落盘 −0.375 —— 一个完好的有限值,
    三道机械闸全部放行,而 Results 会写「治疗后有效率下降」。**结论完全相反**。
    """
    t = _tbl({"有效": {"有效": 10, "无效": 2}, "无效": {"有效": 17, "无效": 11}},
             rows=["有效", "无效"], cols=["有效", "无效"])
    out = cat.mcnemar_exact(_ds(t), RunCtx(paired=True))
    rd = out["effect"]["value"]
    # 事件率:前 = (10+2)/40 = 0.30,后 = (10+17)/40 = 0.675
    assert rd == pytest.approx(0.675 - 0.30, abs=1e-12), f"率差应为 +0.375,实得 {rd}"
    assert rd > 0, "17 人转好、2 人转差,率差必须为正 —— 符号反了"
    assert out["rates"]["before"] == pytest.approx(0.30)
    assert out["rates"]["after"] == pytest.approx(0.675)


# ══ 金标三:Cochran-Armitage == N·r²(statsmodels 给的是 (N−1)·r²)═══════════
def test_cochran_armitage_matches_an_independent_implementation() -> None:
    """两个独立实现互证。**口径差一个 (N−1)/N** 是真的,不是谁算错了:
    statsmodels 的 `test_ordinal_association` 用 Mantel-Haenszel 口径。
    把这个差异钉死,免得将来有人「顺手对齐」到另一个口径而不知道改了什么。
    """
    sm = pytest.importorskip("statsmodels.api")
    counts = {"低": {"有效": 9, "无效": 21}, "中": {"有效": 16, "无效": 14},
              "高": {"有效": 24, "无效": 6}}
    t = _tbl(counts, rows=["低", "中", "高"], cols=["有效", "无效"])
    out = cat.cochran_armitage(_ds(t), RunCtx())

    m = np.array([[counts[r][c] for c in ("有效", "无效")] for r in ("低", "中", "高")], float)
    n = m.sum()
    # ⚠️ 用 `.zscore` 而不是 `.statistic`:后者是原始的 Σ r_i c_j n_ij(这份夹具上是 26),
    #    平方出来 676,与 χ² 差三个数量级 —— 拿错字段会让这条金标变成一句噪音。
    ref = sm.stats.Table(m).test_ordinal_association()
    z2 = float(ref.zscore) ** 2
    assert abs(out["statistic"] - z2 * n / (n - 1)) < 1e-9, (
        f"CA={out['statistic']!r},statsmodels z²={z2!r} —— 两者应差 (N−1)/N 这一个因子"
    )
    assert out["df"] == 1.0
    assert abs(out["effect"]["value"] ** 2 - out["statistic"] / n) < 1e-12, "χ² == N·r² 不成立"


def test_trend_r_sign_follows_the_dose_response_direction() -> None:
    """🔴 符号方向。剂量 低→中→高,有效率 30%→53%→80%,r **必须为正**。

    首版把事件取成第 1 列(`m[:, 1]`)而列序是「事件在前」⇒ r = −0.41。
    χ² 与 p 完全不变(对调两列只是换符号再平方),三道机械闸全绿,
    只有 Results 那句「随剂量升高疗效下降」是反的。
    """
    t = _tbl({"低": {"有效": 9, "无效": 21}, "中": {"有效": 16, "无效": 14},
              "高": {"有效": 24, "无效": 6}}, rows=["低", "中", "高"], cols=["有效", "无效"])
    out = cat.cochran_armitage(_ds(t), RunCtx())
    assert out["effect"]["value"] > 0, (
        f"有效率随剂量单调上升,趋势相关必须为正,实得 {out['effect']['value']}"
    )
    # 反向夹具:率单调下降 ⇒ r 必须为负(单侧断言会被「恒返回正值」的实现骗过)
    t2 = _tbl({"低": {"有效": 24, "无效": 6}, "中": {"有效": 16, "无效": 14},
               "高": {"有效": 9, "无效": 21}}, rows=["低", "中", "高"], cols=["有效", "无效"])
    assert cat.cochran_armitage(_ds(t2), RunCtx())["effect"]["value"] < 0


def test_trend_on_a_degenerate_table_is_refused_not_reported_as_nan() -> None:
    """结局在所有组里完全一致(总体率为 0 或 1)⇒ 趋势在算术上不可估计。

    必须抛专属异常,而不是落一个 NaN —— NaN 会被通用的有限性闸接住,
    但那句话写的是「多半是某一组组内无变异」,对趋势场景答非所问。

    ⚠️ 对照组:**各组率相同但不是 0/1** 不是退化 —— 那是一个合法且可报告的结论
    (χ²=0, p=1, r=0,「未观察到剂量-反应关系」)。首版把这两种情形搞混了。
    """
    dead = _tbl({"低": {"有效": 0, "无效": 30}, "中": {"有效": 0, "无效": 30},
                 "高": {"有效": 0, "无效": 30}}, rows=["低", "中", "高"], cols=["有效", "无效"])
    with pytest.raises(cat.TrendNotEstimable):
        cat.cochran_armitage(_ds(dead), RunCtx())

    flat = _tbl({"低": {"有效": 10, "无效": 20}, "中": {"有效": 10, "无效": 20},
                 "高": {"有效": 10, "无效": 20}}, rows=["低", "中", "高"], cols=["有效", "无效"])
    out = cat.cochran_armitage(_ds(flat), RunCtx())
    assert out["statistic"] == pytest.approx(0.0, abs=1e-12)
    assert out["effect"]["value"] == pytest.approx(0.0, abs=1e-12)


# ══ 效应量:为什么 2×2 的默认是率差而不是 OR ══════════════════════════════════
def test_zero_cell_makes_odds_ratio_infinite_but_risk_difference_stays_finite() -> None:
    """🔴 这条是「默认效应量取 RD」这个决定的**证据**,不是风格偏好。

    `reports_required` 含 `effect.value` ⇒ 有限性闸会把整份分析判成 non_finite_result 拒收。
    而零格表(某臂零并发症)恰恰是最需要 Fisher 精确检验的那一格 ——
    默认给 OR 等于把这一族最有价值的场景堵死。
    """
    t = _tbl({"甲": {"发生": 10, "未发生": 0}, "乙": {"发生": 5, "未发生": 7}},
             cols=["发生", "未发生"])
    out = cat.fisher_exact(_ds(t), RunCtx())
    eff = out["effect"]
    assert eff["name"] == "risk_difference"
    for k in ("value", "ci_low", "ci_high"):
        assert math.isfinite(eff[k]), f"{k} 非有限 —— 有限性闸会拒收整份分析"
    # OR 在这里不可估计:必须写 **null**,不能写 inf
    #（`json.dumps(inf)` 产出 `Infinity`,那是非法 JSON,前端 JSON.parse 当场抛)
    assert out["effects_extra"]["odds_ratio"] is None


def test_newcombe_interval_stays_inside_the_definition_domain() -> None:
    """Newcombe 而不是 Wald:Wald 在率贴近 0/1 时会给出**超出 [−1,1]** 的端点。"""
    t = _tbl({"甲": {"发生": 1, "未发生": 19}, "乙": {"发生": 19, "未发生": 1}},
             cols=["发生", "未发生"])
    eff = cat.fisher_exact(_ds(t), RunCtx())["effect"]
    assert -1.0 <= eff["ci_low"] < eff["value"] < eff["ci_high"] <= 1.0
    # 方向:甲组发生率 5%、乙组 95% ⇒ 率差(甲 − 乙)必须为负
    assert eff["value"] == pytest.approx(0.05 - 0.95)


def test_cramers_v_matches_phi_computed_along_an_independent_path() -> None:
    """2×2 时 V == |φ|,而 φ 走 `(ad−bc)/√(四个边际之积)` 这条完全独立的路。

    (V = √(χ²/(N·k)) 与 χ² 互为定义,直接比是恒等空测试 —— 那种测试通不过变异验证。)
    """
    a, b, c, d = 23, 7, 15, 15
    t = _tbl({"甲": {"有效": a, "无效": b}, "乙": {"有效": c, "无效": d}}, cols=["有效", "无效"])
    # ⚠️ 直接调 `_cramers_v`:2×2 走公开入口时默认效应量是**率差**(见零格表那条测试的理由),
    #    拿不到 V。这里要验的是 V 的算法本身,不是路由。
    chi2 = float(cat.chi2_pearson(_ds(t), RunCtx())["statistic"])
    v = cat._cramers_v(t, chi2)["value"]
    phi = abs(a * d - b * c) / math.sqrt((a + b) * (c + d) * (a + c) * (b + d))
    assert abs(v - phi) < 1e-12, f"V={v!r} φ={phi!r}"


# ══ 构表:结论不许依赖行序 ════════════════════════════════════════════════════
def test_table_is_invariant_to_the_order_of_rows_in_the_file() -> None:
    """同一份数据换个行序,列联表必须一模一样。

    首版的水平定序按「值在文件里首次出现的顺序」——
    那等于让率差的符号取决于数据行序,而没有任何字段能让读者察觉。
    """
    g = ["甲"] * 5 + ["乙"] * 5
    d = ["有效"] * 3 + ["无效"] * 2 + ["有效"] * 1 + ["无效"] * 4
    t1 = cat.build_table(g, d)
    idx = list(range(10))[::-1]
    t2 = cat.build_table([g[i] for i in idx], [d[i] for i in idx])
    assert t1.rows == t2.rows and t1.cols == t2.cols
    assert t1.cells == t2.cells


def test_percentages_are_stored_as_proportions_so_numcheck_can_source_them() -> None:
    """`pct` 存比例(0.6)而不是百分数(60)。

    numcheck 的候选换算只有 `(s, s*100)` —— 存百分数的话,交付物里的
    `60.00%` 与三线表里的 `(60.00)` 会有一处判无源,而那是「每个数都可溯源」的地基。
    """
    t = _tbl({"甲": {"有效": 3, "无效": 2}}, cols=["有效", "无效"])
    pcts = {c["col"]: c["pct"] for c in t.cells}
    assert pcts["有效"] == pytest.approx(0.6)
    assert pcts["无效"] == pytest.approx(0.4)


# ══ 期望频数:Cochran 准则 ═══════════════════════════════════════════════════
def test_expected_frequencies_follows_cochran_rule() -> None:
    ok = _tbl({"甲": {"有效": 23, "无效": 7}, "乙": {"有效": 15, "无效": 15}}, cols=["有效", "无效"])
    bad = _tbl({"甲": {"有效": 9, "无效": 1}, "乙": {"有效": 2, "无效": 8}}, cols=["有效", "无效"])
    assert chk.DISPATCH["expected_frequencies"](ok, chk.CheckCtx()).verdict is True
    assert chk.DISPATCH["expected_frequencies"](bad, chk.CheckCtx()).verdict is False


def test_expected_frequencies_has_no_p_value_because_it_is_not_a_hypothesis_test() -> None:
    """它是一条**计数规则**,不是假设检验。

    逼实现造一个假 p 的代价不是抽象的:那个数会进 `assumptions[]`,
    进依据链,最后印在 Methods 段里 ——「期望频数检验 p=0.34」是一句彻底的胡话。
    """
    t = _tbl({"甲": {"有效": 23, "无效": 7}, "乙": {"有效": 15, "无效": 15}}, cols=["有效", "无效"])
    assert chk.DISPATCH["expected_frequencies"](t, chk.CheckCtx()).p_value is None


# ══ 事件水平定序:必须有依据,且依据要能被披露 ═════════════════════════════════
def test_event_level_is_chosen_by_a_disclosable_rule_not_by_file_order() -> None:
    from statkit.verbs.run import _order_outcome_levels

    # ① 否定前缀:无效 / 未复发 / 不满意 —— 中文里最规整的那条线索
    assert _order_outcome_levels(["无效", "有效"])[:2] == (["有效", "无效"], "有效")
    assert _order_outcome_levels(["复发", "未复发"])[:2] == (["复发", "未复发"], "复发")
    # ② 两边都没有否定前缀 → 正面词表
    assert _order_outcome_levels(["阳性", "阴性"])[1] == "阳性"
    # ③ 都判不出来 → 排序末位兜底,但**依据如实标出来**,由交付层强制披露
    lv, ev, basis = _order_outcome_levels(["A", "B"])
    assert (ev, basis) == ("B", "fallback_last")
    # ④ 调用方显式指定优先于一切
    assert _order_outcome_levels(["无效", "有效"], positive="无效")[:2] == (["无效", "有效"], "无效")


def test_unknown_positive_level_is_refused_with_the_available_levels() -> None:
    from statkit.verbs.run import RunError, _order_outcome_levels

    with pytest.raises(RunError) as ei:
        _order_outcome_levels(["有效", "无效"], positive="显效")
    assert ei.value.payload["reason"] == "positive_level_unknown"
    assert ei.value.payload["levels"] == ["无效", "有效"]


# ══ 精确检验没有统计量 —— 不许编一个出来 ══════════════════════════════════════
def test_exact_tests_omit_the_statistic_instead_of_inventing_one() -> None:
    """scipy 在这两处的 `.statistic` 分别是**优势比**与**失配对计数**。

    把它们当 χ² 报出去,交付物里会出现「χ²=0.152」这种编造的统计量 ——
    数值是真的(scipy 确实返回了它),含义是假的,而没有任何机械闸看得出来。
    """
    t = _tbl({"甲": {"发生": 1, "未发生": 11}, "乙": {"发生": 6, "未发生": 6}},
             cols=["发生", "未发生"])
    assert "statistic" not in cat.fisher_exact(_ds(t), RunCtx())
    tp = _tbl({"有效": {"有效": 10, "无效": 2}, "无效": {"有效": 17, "无效": 11}},
              rows=["有效", "无效"], cols=["有效", "无效"])
    assert "statistic" not in cat.mcnemar_exact(_ds(tp), RunCtx(paired=True))


def test_paired_and_independent_tables_are_labelled_differently() -> None:
    """两种表的 rows/cols/cells 结构一模一样,含义完全不同 —— 必须靠 `kind` 分。

    不分的话交付层会把配对表当两组率去写「两组有效率分别为…」,
    而 McNemar 比的根本不是两组、是同一批人的两次。
    """
    ind = _tbl({"甲": {"有效": 8, "无效": 4}, "乙": {"有效": 3, "无效": 9}}, cols=["有效", "无效"])
    par = _tbl({"有效": {"有效": 10, "无效": 2}, "无效": {"有效": 17, "无效": 11}},
               rows=["有效", "无效"], cols=["有效", "无效"])
    assert cat.chi2_pearson(_ds(ind), RunCtx())["table"]["kind"] == "group_by_outcome"
    assert cat.mcnemar_exact(_ds(par), RunCtx(paired=True))["table"]["kind"] == "paired"
