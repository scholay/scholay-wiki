"""守门行为测试 —— 每条对应一个「竞品做不到 / 做错」的具体点。

对照(SYNTHESIS-竞品与行业做法.md §〇):JASP / jamovi 的 Levene、Shapiro **只算不分流**;
ChatGPT / Julius 是模型静默选。这里测的正是那一格:算完之后**替用户做出有依据的分流**,
并且**不接受越过白名单**。
"""

from __future__ import annotations

import ast
import json

from pathlib import Path

import pytest

from statkit.core.facts import FactError, evaluate
from statkit.registry import SchemaError, load_registry, parse_rule
from statkit.verbs.assume import GateRejection, run_assume

BASE = {
    "n_groups": 2,
    "two_groups": True,
    "continuous": True,
    "paired": False,
    "min_group_n": 42,
    "normal_by_group": True,
    "levene_equal": True,
    "diff_normal": True,
}


def test_variance_equal_picks_student() -> None:
    out = run_assume(dict(BASE))
    assert out["rule"] == "D-01"
    assert out["chosen"] == "student_t"


def test_variance_unequal_auto_switches_to_welch() -> None:
    """方差不齐自动转 Welch —— 这是「前提检验守门」最常被引用的那一格。"""
    out = run_assume({**BASE, "levene_equal": False})
    assert out["rule"] == "D-03"
    assert out["chosen"] == "welch_t"
    # 依据链必须带出来:审稿人问的是依据不是结论
    facts_in_chain = {e["fact"] for e in out["evidence_chain"]}
    assert "levene_equal" in facts_in_chain


def test_non_normal_small_sample_picks_nonparametric() -> None:
    out = run_assume({**BASE, "normal_by_group": False, "min_group_n": 12})
    assert out["rule"] == "D-02"
    assert out["chosen"] == "mann_whitney"


def test_paired_normal_picks_paired_t() -> None:
    out = run_assume({**BASE, "paired": True})
    assert out["rule"] == "D-04"
    assert out["chosen"] == "paired_t"


def test_paired_non_normal_picks_wilcoxon() -> None:
    out = run_assume({**BASE, "paired": True, "diff_normal": False})
    assert out["rule"] == "D-05"
    assert out["chosen"] == "wilcoxon"


def test_model_cannot_escape_the_allowlist() -> None:
    """🔴 边界线:模型可以在 allowed[] 里改选,但不能越过。

    「放手给模型」的是**在候选里挑**(StatQA 显示它在这件事上不差);
    「夺权给引擎」的是**候选集本身由实测前提决定**。这条测试守的就是那条线。
    """
    with pytest.raises(GateRejection) as ei:
        run_assume({**BASE, "levene_equal": False}, requested="student_t")
    payload = ei.value.payload
    assert payload["reason"] == "not_in_allowlist"
    assert payload["allowed"] == ["welch_t", "mann_whitney"]
    # 拒绝必须可行动:告诉模型候选是什么、为什么
    assert payload["why_zh"]
    assert payload["hint_zh"]


def test_model_may_switch_within_allowlist() -> None:
    out = run_assume({**BASE, "levene_equal": False}, requested="mann_whitney")
    assert out["chosen"] == "mann_whitney"


def test_missing_consult_answer_is_rejected_not_guessed() -> None:
    """信息不足时**拒绝并说明缺什么**,而不是猜一个检验。

    这正是「全场没有一家在做」的那一步:把研究设计问出来。
    模型在给定完整场景描述时选得很好,给定原始数据却选错 38.4% —— 差的就是这一步。
    """
    with pytest.raises(GateRejection) as ei:
        run_assume({"two_groups": True, "continuous": True})
    payload = ei.value.payload
    assert payload["reason"] == "no_rule_matched"
    assert any("paired" in u for u in payload["unresolved"])


def test_contested_rule_exposes_the_other_camp() -> None:
    """有学派分歧的规则必须把另一派也交出去,不替用户悄悄选边。"""
    out = run_assume(dict(BASE))  # D-01
    assert out.get("contested_zh")
    assert len(out.get("positions", [])) >= 2


def test_uncontested_rule_does_not_fabricate_a_dispute() -> None:
    """D-03 两派结论一致,不得披露一个并不存在的分歧。"""
    out = run_assume({**BASE, "levene_equal": False})
    assert "contested_zh" not in out


# ── schema 硬约束 ──────────────────────────────────────────────────────────
def test_py_escape_predicate_is_rejected() -> None:
    with pytest.raises(SchemaError, match="py:"):
        parse_rule({
            "id": "D-99", "when": "py: len(df) > 2",
            "allowed": ["welch_t"], "default": "welch_t", "reason": "x",
        })


def test_default_must_be_inside_allowed() -> None:
    with pytest.raises(SchemaError, match="不在 allowed"):
        parse_rule({
            "id": "D-98", "when": "two_groups",
            "allowed": ["welch_t"], "default": "student_t", "reason": "x",
        })


def test_primary_citation_cannot_be_print() -> None:
    """纸质教科书不得作 primary —— 评审 agent 拿不到原文,机制会空转。"""
    with pytest.raises(SchemaError, match="primary 不得是纸质"):
        parse_rule({
            "id": "D-97", "when": "two_groups",
            "allowed": ["welch_t"], "default": "welch_t", "reason": "x",
            "citations": [{"id": "altman", "role": "primary", "access": "print", "cite": "Altman ch.9"}],
        })


def test_unregistered_fact_name_is_rejected() -> None:
    with pytest.raises(FactError, match="未注册的事实名"):
        evaluate("wishful_thinking", {"wishful_thinking": True})


def test_expression_cannot_smuggle_code() -> None:
    """`when` 只支持 and/or/not/比较 —— 不许把表达式变成程序。"""
    with pytest.raises(FactError, match="不允许的语法"):
        evaluate("__import__('os').system('ls')", {})


def test_registry_loads_and_is_consistent() -> None:
    reg = load_registry()
    assert reg.rules and reg.methods
    for r in reg.rules:
        for mid in r.allowed:
            assert mid in reg.methods
    for m in reg.methods.values():
        assert m.golden, f"{m.id} 缺 golden"


# ── 决策表完备性(这条是端到端实测逼出来的)────────────────────────────────
# 🔴 C7:**刻意留白**登记表 —— 决策表覆盖不到、且我们知道为什么的事实组合。
#
# 没有这张表时只有两个选择,都不可接受:
#   ① 断言「整个事实空间零洞」—— 分类族落地当天就会红,而红的那些格子
#      (配对多分类、R×C 期望频数不足)是**真的没实现**,不是规则写漏了;
#   ② 把枚举维度缩回去躲开它们 —— 那正是上一版的形态,结果是「新族整族沉默」。
#
# 每条留白必须写明**由哪张 capability 情况卡兜底**。判据不是「我们承认它没覆盖」,
# 而是「用户撞上它时会拿到一句说人话的解释和替代路径」——
# 一个没有情况卡兜底的洞,用户看到的是 no_rule_matched(「问诊信息不足」,而其实什么都不缺)。
#
# ⚠️ 本表**同时被反向校验**:登记了却其实已经被规则覆盖的条目会红。
#    否则它会退化成豁免清单,把新写出来的洞一并盖住。
INTENTIONAL_HOLES: list[dict] = [
    {
        "id": "paired_multi_level",
        "match": lambda f: (not f["continuous"]) and f["paired"] and not f["binary_dv"],
        "why": "配对 + 多分类结局需要 Bowker / Stuart-Maxwell,尚未实现;"
               "run.py 在分流前抛 capability 卡 paired_multi_level。",
    },
    {
        "id": "not_two_levels",
        "match": lambda f: f["continuous"] and f["paired"] and f["n_groups"] > 2,
        "why": "三个及以上时点的配对设计需要重复测量方差分析(RM-ANOVA),尚未实现;"
               "run.py 在 pivot 后按 `wide.shape[1] != 2` 抛 capability 卡 not_two_levels。"
               "⚠️ 拆成多次两两配对 t 是**不行**的(α 会失控),卡片里明写了这一条。",
    },
    {
        "id": "rxc_expected_too_small",
        "match": lambda f: ((not f["continuous"]) and not f["paired"]
                            and not f["expected_ok"]
                            and not (f["two_groups"] and f["binary_dv"])),
        "why": "R×C 期望频数不足需要 Fisher-Freeman-Halton,而 scipy 那条分支是蒙特卡洛"
               "(同一张表连跑三次三个 p),与「重跑得到同一个数」冲突;"
               "run.py 在分流前抛 capability 卡 rxc_expected_too_small。",
    },
]


def test_decision_table_is_exhaustive_over_fact_space() -> None:
    """🔴 决策表必须覆盖**整个事实空间**,洞只能出现在 INTENTIONAL_HOLES 里。

    实测事故(2026-08-05 真实浏览器会话):陶瓷弯曲强度 n=12/12、两组 SD 均 42、正态 ——
    教科书级的 Student t 场景,引擎却回 `no_rule_matched` 且 `unresolved` 为空
    (事实全求出来了,就是没有规则要它)。根因是 D-01 写了 `min_group_n >= 30`,
    把「小样本 + 正态 + 方差齐」整块漏在外面 —— 而那正是目标用户最常见的样本量。

    ## C7(2026-08-07):枚举改成 shape-major,并引入刻意留白

    上一版写死 `continuous: True` + 4 个 bool + 两组。分类族落地后它**整族看不见** ——
    与互斥性护栏当初的毛病一模一样(那条已于 2026-08-06 改成从 VOCABULARY 生成)。
    实测:D-13 曾把「两组 × 三水平结局」(治愈/好转/无效,临床极常见)漏在外面,
    而全部测试仍然全绿 —— 正是这次改写把它挑出来的。

    现在按 `continuous` 分两片各自穷举,布尔维度从 VOCABULARY 自动生成:
    加事实 = 自动进枚举;加规则 = 自动被覆盖性检查覆盖。
    """
    import itertools

    from statkit.core.facts import VOCABULARY

    reg = load_registry()
    bool_facts = [f.name for f in VOCABULARY
                  if f.kind == "bool" and f.name not in ("two_groups", "multi_group", "continuous")]
    holes: list[dict] = []
    hole_hits = {h["id"]: 0 for h in INTENTIONAL_HOLES}

    for continuous in (True, False):
        for combo in itertools.product([True, False], repeat=len(bool_facts)):
            base = dict(zip(bool_facts, combo))
            for k in (2, 3):
                # 样本量只在连续片扫两侧(它只被 D-01/D-02/D-06 的 n>=30 用到);
                # 分类片与它无关,扫一个值即可 —— 否则组合数白涨三倍。
                for n in ((5, 12, 29, 30, 200) if continuous else (12,)):
                    facts = {
                        **base, "continuous": continuous,
                        "n_groups": k, "two_groups": k == 2, "multi_group": k >= 3,
                        "min_group_n": n,
                    }
                    try:
                        run_assume(facts, reg=reg)
                    except GateRejection as e:
                        if e.payload.get("reason") != "no_rule_matched":
                            continue
                        _covered = [h for h in INTENTIONAL_HOLES if h["match"](facts)]
                        if _covered:
                            for h in _covered:
                                hole_hits[h["id"]] += 1
                            continue
                        holes.append(facts)

    _show = ["continuous", "paired", "binary_dv", "ordinal_group", "expected_ok",
             "normal_by_group", "levene_equal", "diff_normal", "n_groups", "min_group_n"]
    assert not holes, (
        f"决策表有 {len(holes)} 个**未登记**的洞 —— 这些事实组合不命中任何规则,"
        f"引擎会回 no_rule_matched 而 unresolved 为空(用户看到「问诊信息不足」但其实什么都不缺)。"
        f"要么补规则,要么登记进 INTENTIONAL_HOLES 并写明由哪张 capability 卡兜底:\n  "
        + "\n  ".join(str({k: h[k] for k in _show if k in h}) for h in holes[:8])
        + ("\n  …" if len(holes) > 8 else "")
    )

    # 反向:登记了却其实已被规则覆盖的条目 —— 留着它等于给未来真出现的洞发免死金牌。
    dead = [hid for hid, c in hole_hits.items() if c == 0]
    assert not dead, (
        f"INTENTIONAL_HOLES 里这些条目已经不是洞了(规则已覆盖):{dead} —— 请删掉。"
        f"一条永远不触发的豁免会在下次真出现洞时把它一起盖住。"
    )


def test_every_intentional_hole_has_a_capability_card() -> None:
    """刻意留白必须**有情况卡兜底** —— 否则用户撞上时看到的是 no_rule_matched。

    这条与上一条是一对:那条守「洞必须登记」,这条守「登记的洞必须有话可说」。
    """
    from statkit import situations as S

    for h in INTENTIONAL_HOLES:
        card = S.CATALOG.get(h["id"])
        assert card is not None, f"留白 {h['id']!r} 在情况目录里没有对应的卡"
        assert card.severity == "capability", (
            f"{h['id']} 应当是 capability 档(我们的缺口),实得 {card.severity}"
        )
        assert card.next_zh.strip(), f"{h['id']} 的卡没写替代路径"


def test_small_sample_normal_equal_variance_picks_student_t() -> None:
    """上面那个洞的定点回归:n=12、正态、方差齐 → Student t(不是拒绝)。

    n≥30 从来不是 t 检验的前提 —— 它的本意是**非正态时靠中心极限定理**兜底;
    数据正态时 t 检验对小样本本来就成立(这正是 t 分布相对 z 的存在理由)。
    """
    out = run_assume({
        "n_groups": 2, "two_groups": True, "continuous": True, "paired": False,
        "min_group_n": 12, "normal_by_group": True, "levene_equal": True, "diff_normal": True,
    })
    assert out["rule"] == "D-01"
    assert out["chosen"] == "student_t"


# ── 多重比较记账(D5,端到端实测逼出来的)──────────────────────────────────
def test_multiplicity_is_tracked_across_a_session() -> None:
    """🔴 同一会话跑多次检验必须记账并给出校正阈值。

    实测事故(2026-08-05,AD-08):用户拿三组数据来,引擎不支持多组比较,模型很诚实地
    **没有编造 F 值**,却把它拆成三次两两 t 检验分别跑 —— 三份 bundle、零记账、全程未提校正。
    其中 `p=0.02857` 在 α=.05 下被当作「显著」,而三次比较的 Bonferroni 阈值是 α'=.0167,
    ⇒ 它其实**不显著**。这个数字会被用户当显著写进论文,是最严重的一类静默错误。

    红队在开工评审时就点名过这个缺口(「多重比较记账在 R 的结构里无处安放」,列为必装项 D5),
    这条测试把它钉死。
    """
    import json
    import tempfile

    from statkit.verbs.run import _multiplicity

    with tempfile.TemporaryDirectory() as d:
        out = Path(d)
        first = _multiplicity(out)
        assert first["tests_in_session"] == 1
        assert first["method"] == "none", "首次检验不该声称做了校正"

        # 模拟已落两份 bundle,再来第三次
        for i in range(2):
            (out / f"h{i}.bundle.json").write_text(json.dumps({"schema": "x"}), encoding="utf-8")
        third = _multiplicity(out)
        assert third["tests_in_session"] == 3
        # 阈值刻意 round 到 6 位(可读且够精),故容差取 1e-6 而非 1e-9 ——
        # 这是给人看的判据数字,不是参与计算的中间量。
        assert abs(third["alpha_bonferroni"] - 0.05 / 3) < 1e-6
        # 披露文本必须给出**可执行的判据**(阈值数字),不能只说「注意多重比较」
        assert "0.0167" in third["note_zh"] or "α'" in third["note_zh"]


def test_multiplicity_does_not_silently_rewrite_p() -> None:
    """引擎只披露阈值,**不自动改判显著性**。

    自动改判会让用户看到一个与他手里 SPSS 输出对不上的 p 值 —— 那是另一种不可复核。
    正确做法是把「第几次检验 + 校正后阈值」如实交给用户与审稿人。
    """
    from statkit.verbs.run import _multiplicity
    import tempfile

    with tempfile.TemporaryDirectory() as d:
        m = _multiplicity(Path(d))
        assert "p_adjusted" not in m and "p_corrected" not in m


# ── 缺失哨兵编码(D5 之后,MED-03 端到端实测逼出来的)────────────────────────
def test_missing_sentinel_is_blocked_not_silently_computed() -> None:
    """🔴 因变量里的 999 必须拦下,不许静默算过去。

    实测事故(2026-08-05,MED-03 真实浏览器会话):糖尿病护理数据里一例 HbA1c 写作 `999`
    (漏填「未测」备注,伪装成正常数字)。带着它跑不报错,但极端值打崩差值正态性 →
    Shapiro 拒绝 → 分流从 D-04 走到 D-05,方法 paired t → Wilcoxon,
    p 从 4.2e-06 变 3.6e-04(**差 84 倍**)。两条路都跑得通、都出得了图、结论量级不同 ——
    这类静默分歧人工复核最难发现,正是本卡片相对「让 AI 跑段 Python」的核心差异化。

    那次是模型自己把 999 挑出来了,属运气:引擎侧当时零防线。这条把它钉死。
    """
    import tempfile

    import pandas as pd

    from statkit.verbs.run import RunError, run_analysis

    with tempfile.TemporaryDirectory() as d:
        p = Path(d) / "s.csv"
        pre = [8.5, 9.1, 8.8, 9.4, 8.2, 9.0, 8.7, 9.3, 8.9, 8.6]
        post = [7.2, 7.9, 7.5, 8.1, 7.0, 7.8, 7.4, 999.0, 7.6, 7.3]  # ← 一个哨兵
        pd.DataFrame({
            "id": [f"N{i}" for i in range(10)] * 2,
            "时点": ["前"] * 10 + ["后"] * 10,
            "v": pre + post,
        }).to_csv(p, index=False, encoding="utf-8")

        try:
            run_analysis(data_path=p, dv="v", group="时点", subject="id",
                         paired=True, workdir=Path(d))
        except RunError as e:
            assert e.payload["reason"] == "sentinel_values"
            assert e.payload["hits"][0]["value"] == 999.0
            # 拦截必须可行动:说清是什么、后果是什么、怎么继续
            assert e.payload["why_zh"] and e.payload["impact_zh"] and e.payload["hint_zh"]
            assert e.payload["severity"] == "advisory"
            assert e.payload["accept_key"] == "sentinel_ok", (
                "回执要给的是**工具参数名**(模型调的是 StatRun,不是命令行)")
        else:
            raise AssertionError("999 穿过了引擎 —— 静默换方法的口子又开了")

        # 用户明确声明那是真值时才放行(判断权交回用户,但不许静默)
        out = run_analysis(data_path=p, dv="v", group="时点", subject="id",
                           paired=True, workdir=Path(d), sentinel_ok=True)
        assert out["ok"]


def test_sentinel_scan_does_not_cry_wolf_on_ordinary_values() -> None:
    """0 / -1 / 99 这类在真实数据里当值用太常见,不许拦 —— 狼来了比不拦更糟。"""
    import numpy as np

    from statkit.verbs.run import _sentinel_scan

    assert _sentinel_scan({"a": np.array([0.0, -1.0, 99.0, 100.0, 1000.0])}) == []
    assert _sentinel_scan({"a": np.array([1.0, 999.0])})[0]["count"] == 1


def test_cli_output_carries_no_stringified_numbers() -> None:
    """🔴 模型读的是 CLI stdout,不是 bundle —— 这份输出的类型必须干净。

    `json.dumps(..., default=str)` 会把 numpy.bool_(False) 变成字符串 "False"(真值!),
    Methods 段于是写出「该前提满足」而实际不满足。这个坑在 bundle 那侧炸过一次,
    CLI 这侧当时还留着同一行代码。宁可当场 TypeError 也不要一份类型被污染的输出。
    """
    import json
    import tempfile

    import pandas as pd

    from statkit.verbs.run import cli

    with tempfile.TemporaryDirectory() as d:
        p = Path(d) / "s.csv"
        pd.DataFrame({
            "g": ["A"] * 8 + ["B"] * 8,
            "v": [5.1, 5.4, 4.9, 5.3, 5.0, 5.2, 5.5, 4.8,
                  6.2, 6.5, 6.0, 6.4, 6.1, 6.3, 6.6, 5.9],
        }).to_csv(p, index=False, encoding="utf-8")
        code, text = cli(["--data", str(p), "--dv", "v", "--group", "g", "--workdir", d])
        assert code == 0, text
        out = json.loads(text)
        for k in ("statistic", "df", "p_exact"):
            assert isinstance(out[k], (int, float)), f"{k} 被字符串化了:{out[k]!r}"
        eff = out["effect"]
        for k in ("value", "ci_low", "ci_high"):
            assert isinstance(eff[k], (int, float)), f"effect.{k} 被字符串化了:{eff[k]!r}"


def test_non_numeric_dv_gives_classified_rejection_not_a_python_traceback() -> None:
    """🔴 因变量混文本时,给的必须是分类过的拒绝,不是 `ValueError` 的堆栈。

    实测(2026-08-05):`<0.01` 让引擎抛出
    `ValueError: could not convert string to float: '<0.01'` —— 用户看到 Python 栈是
    AD-07 的一票否决项。而且栈里什么都没说清:哪一列、几个、是删失还是缺失,全无。

    **删失 ≠ 缺失**,这是本条真正守的东西:
      · `<0.01` 是测了的(值存在,低于检出限)。当缺失丢掉 → 低端数据被系统性丢光 → 均值高估;
        替换成 0 → 把正数说成零;替换成 0.01 → 把上界当点估计。三种都是静默地编数字。
      · `未测` 才是真缺失。
    """
    import pandas as pd

    from statkit.verbs.run import RunError, _numeric_or_reject

    s = pd.Series([1.0, 2.0, "<0.01", "未测", "ND", "呵呵"])
    try:
        _numeric_or_reject(s, "浓度")
    except RunError as e:
        p = e.payload
        assert p["reason"] == "non_numeric_values"
        assert "<0.01" in p["censored"] and "ND" in p["censored"], "删失值没被识别成删失"
        assert "未测" in p["missing_like"], "真缺失没被识别"
        assert "呵呵" in p["unknown"], "无法归类的值必须单列出来,不许猜"
        assert "删失" in p["why_zh"] and "LOD" in p["why_zh"], "必须讲清删失该怎么处理"
    else:
        raise AssertionError("脏文本穿过了引擎")


def test_clean_numeric_column_passes_through_untouched() -> None:
    """纯数值列(哪怕是字符串形式的数字)不许被这道闸拦住。"""
    import pandas as pd

    from statkit.verbs.run import _numeric_or_reject

    assert list(_numeric_or_reject(pd.Series([1.0, 2.5, 3.0]), "v")) == [1.0, 2.5, 3.0]
    assert list(_numeric_or_reject(pd.Series(["1", "2.5"]), "v")) == [1.0, 2.5]


def test_rule_reason_text_does_not_contradict_its_condition() -> None:
    """🔴 规则的 `reason` 是**交付物文本**(原样进 Methods),不是注释 —— 不许与 `when` 矛盾。

    实测(2026-08-05):把 D-01 的条件从 `min_group_n >= 30` 放宽成
    「方差齐 且(正态 或 大样本)」之后,忘了改 reason,于是 n=12 的数据跑出来
    Methods 段照写「样本量充足」—— **一句会原样印进论文的假话**,而且没有任何东西会发现它。

    这条钉的是那一类:改判据时把随判据一起走的文案落下。
    """
    reg = load_registry()
    # 「样本量充足」这类断言,只有当 when 里真的**无条件**要求大样本时才成立。
    for r in reg.rules:
        claims_big_n = any(w in r.reason for w in ("样本量充足", "大样本", "样本量足够"))
        if not claims_big_n:
            continue
        cond = r.when
        # 条件里出现 `or` 就意味着存在一条不经大样本的通路 → 断言不成立
        assert "min_group_n >=" in cond and " or " not in cond, (
            f"{r.id} 的 reason 声称「样本量充足」,但 when 里有不依赖样本量的通路:\n"
            f"  when   = {cond}\n  reason = {r.reason}\n"
            f"这句话会原样进 Methods。"
        )


def test_rerunning_the_same_analysis_does_not_inflate_the_test_count() -> None:
    """🔴 重跑同一份分析是**覆盖**,不是「又做了一次检验」。

    实测事故(2026-08-05,盘点 agent 发现后复现):`multiplicity` 原先先塞进 bundle 再一起
    算 spec_hash ⇒ 自我喂养的环 —— 完全相同的输入每跑一次哈希都不同,落一个新文件,
    下一次数到的 bundle 又多一个。同一份数据跑三次得到三份 bundle,
    检验次数 1→2→3,Bonferroni 阈值 0.05→0.025→0.0167 **越跑越严**。
    用户只是刷新页面重跑,Methods 段就会写「本会话已进行 3 次统计检验」。

    spec_hash 的语义是「这份分析规格的指纹」:只由**输入与方法**决定,
    不由「跑过几次」决定 —— 后者是环境状态,不是规格。
    """
    import tempfile

    import pandas as pd

    from statkit.verbs.run import run_analysis

    with tempfile.TemporaryDirectory() as d:
        wd = Path(d)
        p = wd / "x.csv"
        pd.DataFrame({
            "g": ["A"] * 10 + ["B"] * 10,
            "v": [5.1, 5.4, 4.9, 5.3, 5.0, 5.2, 5.5, 4.8, 5.6, 5.05,
                  6.2, 6.5, 6.0, 6.4, 6.1, 6.3, 6.6, 5.9, 6.7, 6.15],
        }).to_csv(p, index=False, encoding="utf-8")

        hashes = []
        for _ in range(3):
            out = run_analysis(data_path=p, dv="v", group="g", workdir=wd)
            hashes.append(out["spec_hash"])

        assert len(set(hashes)) == 1, f"同一份输入产出了不同的 spec_hash:{hashes}"
        files = list((wd / "analysis").glob("*.bundle.json"))
        assert len(files) == 1, f"重跑落了 {len(files)} 份 bundle,应当只有 1 份"

        import json as _json
        m = _json.loads(files[0].read_text(encoding="utf-8"))["multiplicity"]
        assert m["tests_in_session"] == 1, f"重跑把检验次数灌到了 {m['tests_in_session']}"
        assert m["alpha_bonferroni"] == 0.05, "阈值不该因为重跑而收紧"


def test_a_genuinely_different_analysis_still_counts() -> None:
    """但**不同**的分析仍要计入 —— 别为了修上面那条把 D5 整个关掉。"""
    import json as _json
    import tempfile

    import pandas as pd

    from statkit.verbs.run import run_analysis

    with tempfile.TemporaryDirectory() as d:
        wd = Path(d)
        for name, shift in (("a.csv", 0.0), ("b.csv", 0.3)):
            pd.DataFrame({
                "g": ["A"] * 10 + ["B"] * 10,
                "v": [5.1, 5.4, 4.9, 5.3, 5.0, 5.2, 5.5, 4.8, 5.6, 5.05]
                     + [6.2 + shift, 6.5 + shift, 6.0 + shift, 6.4 + shift, 6.1 + shift,
                        6.3 + shift, 6.6 + shift, 5.9 + shift, 6.7 + shift, 6.15 + shift],
            }).to_csv(wd / name, index=False, encoding="utf-8")

        run_analysis(data_path=wd / "a.csv", dv="v", group="g", workdir=wd)
        out2 = run_analysis(data_path=wd / "b.csv", dv="v", group="g", workdir=wd)

        second = _json.loads(
            (wd / "analysis" / (out2["spec_hash"].split(":")[1] + ".bundle.json")).read_text(encoding="utf-8")
        )
        assert second["multiplicity"]["tests_in_session"] == 2


def test_no_two_rules_can_ever_match_the_same_facts() -> None:
    """🔴 决策表必须**互斥**:任意一组事实最多命中一条规则。

    实测事故(2026-08-05,盘点 agent 发现后复现):「非正态 + 方差不齐 + n<30」同时命中
    D-02(→ mann_whitney)与 D-03(→ welch_t)。谁赢取决于 when 表达式的 token 数 ——
    **一个实现细节在替用户做方法学决定**。

    真正的伤害不在选了哪个方法(两个都有人用),而在**依据链**:判给 D-02 后
    evidence_chain 里根本不出现 levene_equal,用户的 Methods 会写「正态性不满足 → Mann-Whitney」
    而只字不提方差也不齐 —— 审稿人问「方差齐吗」时,交付物答不上来。

    这条与 test_decision_table_is_exhaustive_over_fact_space 是一对:
    那条守「不许有洞」,这条守「不许有重叠」。合起来 = 决策表是事实空间的一个**划分**。
    """
    import itertools

    reg = load_registry()
    from statkit.core.facts import evaluate as _ev

    # 🔴 枚举维度**从词表自动生成**,不再手写(2026-08-06)。
    #
    #    上一版把事实空间写死成 `n_groups: 2, two_groups: True, continuous: True` +
    #    四个 bool。审计(T-6)当时就指出:「新族整族沉默」—— 实测加两条在 n_groups=3 处
    #    真重叠的规则,全部测试仍然全绿。
    #    P1 族①落地当天这个预言兑现了两次:
    #      ① 新规则引用 `multi_group` / `balanced`,而枚举器不提供 ⇒ 求值直接抛;
    #      ② 即便补上那两个名字,写死的 `n_groups: 2` 也让 D-07~D-09 一条都枚举不到。
    #
    #    从 VOCABULARY 生成之后:加事实 = 自动进枚举;加规则 = 自动被互斥性检查覆盖。
    from statkit.core.facts import VOCABULARY

    bool_facts = [f.name for f in VOCABULARY if f.kind == "bool" and f.name != "two_groups"]
    overlaps: list[tuple] = []

    for combo in itertools.product([True, False], repeat=len(bool_facts)):
        base = dict(zip(bool_facts, combo))
        for k in (2, 3, 5):
            for n in (3, 5, 12, 29, 30, 200):
                facts = {
                    **base,
                    "n_groups": k,
                    # 派生事实必须与 n_groups **自洽** —— 枚举出「两组且多组」这种
                    # 现实中不可能的组合,只会制造假红。
                    "two_groups": k == 2,
                    "multi_group": k >= 3,
                    "min_group_n": n,
                }
                hit = [r.id for r in reg.rules if _ev(r.when, facts)]
                if len(hit) > 1:
                    overlaps.append((hit, {**{b: facts[b] for b in bool_facts},
                                           "n_groups": k, "min_group_n": n}))

    assert not overlaps, (
        f"决策表有 {len(overlaps)} 处重叠 —— 这些事实组合同时命中多条规则,"
        f"谁赢由实现细节决定,且落选那条的事实不会进依据链:\n  "
        + "\n  ".join(f"{h} ← {f}" for h, f in overlaps[:8])
        + ("\n  …" if len(overlaps) > 8 else "")
    )


def test_both_failed_assumptions_names_both_in_its_evidence_chain() -> None:
    """两个前提同时不满足时,依据链必须**两个都提** —— 这是上一条真正要保护的东西。"""
    out = run_assume({
        "n_groups": 2, "two_groups": True, "continuous": True, "paired": False,
        "min_group_n": 12, "normal_by_group": False, "levene_equal": False, "diff_normal": True,
    })
    assert out["rule"] == "D-06", f"应命中 D-06,实得 {out['rule']}"
    facts_in_chain = {e["fact"] for e in out["evidence_chain"]}
    assert "normal_by_group" in facts_in_chain
    assert "levene_equal" in facts_in_chain, (
        "方差齐性没进依据链 —— 用户的 Methods 就不会提它,审稿人问起时答不上来"
    )


# ── 体系口径必须真的分流(盘点 agent 发现 + 实测坐实)────────────────────────
def test_table_labels_come_from_the_system_not_hardcoded_chinese() -> None:
    """🔴 选 APA 时,三线表的**表题与表头**必须是 APA 口径,不能是中文核心的。

    实测事故(2026-08-05):verbs/report.py 把「表 1 两组均数±标准差比较」「x̄±s」「P 值」
    硬编码,与 system 参数无关。于是选 APA 得到的表:
      表题「表 1 两组**均数±标准差**比较」、表头「**x̄±s**」,
      而单元格里是 `52.62 (4.99)` —— **表头与数据自相矛盾**,审稿人一眼看得出。
    p 值那格还被 `.replace("p","P")` 无条件大写化,而 APA 要求小写斜体 p。

    体系口径属于**体系包**不属于代码:加第三套体系时不该再改 report.py。
    """
    from statkit.report.format import SYSTEMS

    cn, apa = SYSTEMS["cn-core"], SYSTEMS["apa"]
    assert cn.label_desc_param == "x̄±s" and apa.label_desc_param == "M (SD)"
    assert cn.p_symbol == "P" and apa.p_symbol == "p", "APA 必须小写 p"
    assert apa.italic_stats and not cn.italic_stats
    assert "表" in cn.table_caption and "Table" in apa.table_caption
    # 🔴 表头声明的形态必须与实际产出的形态一致 —— 这才是「自相矛盾」的根。
    #    对**每一套**体系都查(不只这两套):加第三套时漏改形态,这条会当场红。
    from statkit.report.format import fmt_mean_sd, fmt_median_iqr

    for sid, s in SYSTEMS.items():
        got = fmt_mean_sd(1.0, 2.0, s)
        sep = "±" if "±" in s.label_desc_param else "("
        assert sep in got, f"体系 {sid}:表头写 {s.label_desc_param!r} 但数据排成 {got!r}"
        gotn = fmt_median_iqr(1.0, 0.5, 1.5, s)
        sepn = "[" if "[" in s.label_desc_nonparam else "("
        assert sepn in gotn, f"体系 {sid}:非参表头 {s.label_desc_nonparam!r} 与数据 {gotn!r} 形态不一致"


def test_no_system_field_is_a_dead_knob() -> None:
    """🔴 SystemSpec 的每一个字段都必须**真的被读**。

    盘点实测(2026-08-05):`dispersion` 与 `star_thresholds` 声明了却从不读 ——
    体系差异实际靠 `if sys.id == "cn-core"` 散在代码里。死旋钮比没有旋钮更糟:
    它让人以为「改这里就能换体系」,改完没反应,再去代码里找那个 if,
    于是体系知识继续沉在代码里,加第三套体系时还得改 report.py。

    这条测试要求:声明即被读。加字段就必须接上,不许先占位。
    """
    import re
    from dataclasses import fields

    from statkit.report.format import SYSTEMS

    src = ""
    for f in Path(__file__).resolve().parent.parent.joinpath("statkit").rglob("*.py"):
        src += f.read_text(encoding="utf-8")

    dead = []
    for f in fields(next(iter(SYSTEMS.values()))):
        if f.name == "id":
            continue  # id 用于报错文案与文件名,读法不走属性访问
        if not re.search(rf"\.{re.escape(f.name)}\b", src):
            dead.append(f.name)
    assert not dead, (
        f"SystemSpec 有 {len(dead)} 个死旋钮(声明了但代码里从不读):{dead}\n"
        f"要么接上,要么删掉 —— 留着会让人以为改它有用。"
    )


def test_docx_table_actually_renders_the_system_labels() -> None:
    """不止 SystemSpec 里声明对了,**产出的 docx 里**也要真的是那些字。"""
    import re
    import tempfile
    import zipfile

    import pandas as pd

    from statkit.verbs.report import run_report
    from statkit.verbs.run import run_analysis

    with tempfile.TemporaryDirectory() as d:
        wd = Path(d)
        p = wd / "x.csv"
        pd.DataFrame({
            "g": ["A"] * 10 + ["B"] * 10,
            "v": [5.1, 5.4, 4.9, 5.3, 5.0, 5.2, 5.5, 4.8, 5.6, 5.05,
                  6.2, 6.5, 6.0, 6.4, 6.1, 6.3, 6.6, 5.9, 6.7, 6.15],
        }).to_csv(p, index=False, encoding="utf-8")
        out = run_analysis(data_path=p, dv="v", group="g", workdir=wd)
        bundle_path = wd / out["bundle_path"]

        seen = {}
        for sid in ("cn-core", "apa"):
            r = run_report(bundle_path=bundle_path, system_id=sid, workdir=wd)
            x = zipfile.ZipFile(wd / r["table_docx"]).read("word/document.xml").decode("utf-8")
            seen[sid] = re.sub(r"<[^>]+>", " ", x)

        assert "x̄±s" in seen["cn-core"] and "P" in seen["cn-core"]
        assert "M (SD)" in seen["apa"], "APA 的 docx 表头仍不是 M (SD)"
        assert "x̄±s" not in seen["apa"], "APA 的 docx 里还留着中文核心的 x̄±s 表头"
        assert "Table 1" in seen["apa"], "APA 的表题还是中文"


# ── 可复现脚本(盘点 agent 发现「承诺了但不存在」)──────────────────────────
def test_reproduction_script_is_generated_and_actually_reproduces() -> None:
    """🔴 生成的 analysis.py 必须**真的能跑出同样的数**。

    实测事故(2026-08-05):`interpret/SKILL.md:55` 让模型这样回答审稿人的
    「数据和代码能提供吗」——「报告附带的 analysis.py 就是答案(固定随机种子,可原样重跑)」,
    而 report 只产 docx 与 md,**analysis.py 从来不存在**。
    承诺一个不存在的交付物比不承诺更糟:用户按图索骥找不到文件。

    更根本的一层:bundle 当时**不记录数据来源与列名** —— `spec_hash` 自称
    「分析规格的指纹」,而规格(哪个文件、哪两列、配不配对)一个字都没存,
    拿到 bundle 的审稿人无从知道分析的是哪两列,脚本也无从生成。

    这条测试**真的执行**那个脚本。只检查「文件生成了」等于没测:
    一份跑不通、或跑出别的数的脚本,比没有脚本更糟。
    """
    import subprocess
    import sys as _sys
    import tempfile

    import pandas as pd

    from statkit.verbs.report import run_report
    from statkit.verbs.run import run_analysis

    for paired in (False, True):
        with tempfile.TemporaryDirectory() as d:
            wd = Path(d)
            p = wd / "data.csv"
            a = [5.1, 5.4, 4.9, 5.3, 5.0, 5.2, 5.5, 4.8, 5.6, 5.05, 5.25, 5.35]
            b = [6.2, 6.5, 6.0, 6.4, 6.1, 6.3, 6.6, 5.9, 6.7, 6.15, 6.35, 6.45]
            if paired:
                pd.DataFrame({
                    "id": [f"S{i}" for i in range(12)] * 2,
                    "时点": ["前"] * 12 + ["后"] * 12,
                    "v": a + b,
                }).to_csv(p, index=False, encoding="utf-8")
                out = run_analysis(data_path=p, dv="v", group="时点", subject="id",
                                   paired=True, workdir=wd)
            else:
                pd.DataFrame({"g": ["A"] * 12 + ["B"] * 12, "v": a + b}).to_csv(
                    p, index=False, encoding="utf-8")
                out = run_analysis(data_path=p, dv="v", group="g", workdir=wd)

            bundle_path = wd / out["bundle_path"]
            r = run_report(bundle_path=bundle_path, system_id="cn-core", workdir=wd)
            assert "analysis_py" in r, f"paired={paired}:没有生成 analysis.py"

            script = wd / r["analysis_py"]
            body = script.read_text(encoding="utf-8")
            assert "assert abs(p" in body, "脚本必须自带与报告核对的断言"
            assert "statkit" not in body.split('"""')[2], "脚本不得依赖 statkit —— 审稿人手里没有它"

            # 🔴 真的跑一遍。脚本里的断言若不成立,这里会非零退出。
            proc = subprocess.run(
                [_sys.executable, r["analysis_py"]],
                cwd=str(wd), capture_output=True, text=True, timeout=120,
            )
            assert proc.returncode == 0, (
                f"paired={paired}:生成的复算脚本跑不通或与报告不一致\n"
                f"stdout: {proc.stdout}\nstderr: {proc.stderr[-1500:]}"
            )
            assert "✅" in proc.stdout, f"脚本没有确认一致:{proc.stdout}"


def test_bundle_records_the_analysis_spec() -> None:
    """bundle 必须自描述:哪个文件、哪两列、配不配对。只记列名与文件名,**不记数据行**。"""
    import json as _json
    import tempfile

    import pandas as pd

    from statkit.verbs.run import run_analysis

    with tempfile.TemporaryDirectory() as d:
        wd = Path(d)
        p = wd / "秘密数据.csv"
        pd.DataFrame({"组": ["A"] * 10 + ["B"] * 10,
                      "值": list(range(10)) + list(range(5, 15))}).to_csv(
            p, index=False, encoding="utf-8")
        out = run_analysis(data_path=p, dv="值", group="组", workdir=wd)
        b = _json.loads((wd / out["bundle_path"]).read_text(encoding="utf-8"))
        assert b["spec"]["data_file"] == "秘密数据.csv"
        assert b["spec"]["dv"] == "值" and b["spec"]["group"] == "组"
        assert b["spec"]["paired"] is False
        # PHI 边界:绝不把数据行写进 bundle
        assert "rows" not in b["spec"] and "data" not in b["spec"]


# ── 检验实现不得覆盖 bundle 的公共字段(根因级护栏)────────────────────────
def test_engine_results_cannot_clobber_bundle_fields() -> None:
    """🔴 检验实现返回的键,不许与 bundle 自己设的公共字段撞名。

    实测事故(2026-08-05):`run_analysis` 组装 bundle 时把 `**result` 放在字面量**最后**,
    于是检验实现返回的 `descriptives` 静默覆盖掉了上游按**真实组名**算好的那份:
      · Mann-Whitney 返回 `{"group_1": …, "group_2": …}` ⇒ 每份非参 bundle 的描述统计
        都失去组名,读的人只能靠隐式顺序猜谁是谁 —— 猜反了三线表两行对调,而两行数字都对,
        没有任何东西会报错;
      · Wilcoxon 返回 `{"diff": …}` ⇒ 组描述统计**整个消失**,三线表渲染直接 KeyError。
    两者都不报错、都落了 bundle,是最难发现的那一类。

    根因不是某个实现写错,而是**字典字面量的覆盖是静默的**。这条把根因钉死:
    实现只许返回自己那几项(统计量/自由度/p/效应量/差值描述统计),公共字段归组装方。
    """
    import inspect

    import numpy as np

    from statkit.engines import tests as tst
from statkit.core.dataset import Dataset


def _ds(groups, *, diff=None):
    """测试用的 Dataset 构造助手(C2 之后计算层吃的是 Dataset,不是裸 dict)。"""
    return Dataset(shape="groups", groups=groups, diff=diff)


def _ds_table(table):
    """列联表形状的 Dataset(C1)。分类族的实现只认这个形状。"""
    return Dataset(shape="table", table=table)



    # bundle 里由 run_analysis 显式设置、实现不得触碰的键
    reserved = {
        "schema", "method", "rule", "n", "groups", "descriptives",
        "assumptions", "decision", "software", "spec", "multiplicity", "spec_hash",
    }
    # `n_extra`:实现报自己的**分析单元计数**(如 Wilcoxon 丢弃的零差值对),
    # 由 run_analysis 合并进 `n`。刻意不让实现直接写 `n` —— 那是组装方的字段,
    # 而字典字面量的覆盖是静默的(本测试存在的理由)。
    # 多组族(P1 族①)新增四个键,归属都想清楚了:
    #   df2            —— F 检验的分母自由度。F(df1,df2) 少一个数审稿人就复算不了,
    #                     而顶层已有 df(分子);两者是同一个统计量的两半,故并列在顶层。
    #   posthoc[]      —— 事后比较的配对结果。数组形态,`_dig` 的 `a[].b` 段(S3)正是为它补的。
    #   posthoc_method —— 用了哪种事后 + 哪种校正(如 dunn_holm)。必须可知:
    #                     Tukey / Games-Howell / Dunn 的适用前提不同,Methods 段要写明。
    #   cld            —— 字母标记 {组名: 字母}。农学/食品/体育论文的第一交付物。
    # 仍然不许碰 `n`(组装方的字段)—— 多组族报的 total/groups 走 n_extra 通道。
    allowed = {"statistic", "df", "df2", "p_exact", "effect", "descriptives_diff",
               "degraded", "n_extra", "posthoc", "posthoc_method", "cld"}

    x = np.array([5.1, 5.4, 4.9, 5.3, 5.0, 5.2, 5.5, 4.8, 5.6, 5.05])
    y = np.array([6.2, 6.5, 6.0, 6.4, 6.1, 6.3, 6.6, 5.9, 6.7, 6.15])

    for mid, fn in tst.DISPATCH.items():
        out = fn(_ds({"甲": x, "乙": y}), tst.RunCtx())
        clobber = reserved & set(out)
        assert not clobber, (
            f"{mid} 返回了 bundle 的公共字段 {sorted(clobber)} —— "
            f"`**result` 在字面量最后,它会**静默覆盖**上游算好的那份。"
        )
        extra = set(out) - allowed
        assert not extra, f"{mid} 返回了未登记的键 {sorted(extra)};要加请先扩 allowed 并想清楚归属"
    assert inspect.isfunction(tst.describe_groups)


def test_nonparametric_bundle_keeps_real_group_names() -> None:
    """非参分析的 bundle 必须仍按**真实组名**索引描述统计,不能变成 group_1/group_2。"""
    import json as _json
    import tempfile

    import pandas as pd

    from statkit.verbs.run import run_analysis

    with tempfile.TemporaryDirectory() as d:
        wd = Path(d)
        p = wd / "x.csv"
        # 刻意做成非正态(强偏态)以命中非参路径
        pd.DataFrame({
            "处理": ["甲"] * 12 + ["乙"] * 12,
            "值": [1, 1, 1, 1, 2, 2, 2, 3, 3, 4, 9, 40]
                 + [2, 2, 2, 3, 3, 3, 4, 4, 5, 6, 15, 60],
        }).to_csv(p, index=False, encoding="utf-8")
        out = run_analysis(data_path=p, dv="值", group="处理", workdir=wd)
        b = _json.loads((wd / out["bundle_path"]).read_text(encoding="utf-8"))
        assert set(b["descriptives"]) == {"甲", "乙"}, (
            f"描述统计的键变成了 {sorted(b['descriptives'])} —— 组名丢了"
        )
        for g in ("甲", "乙"):
            assert "median" in b["descriptives"][g], "非参必须有中位数与四分位"


def test_paired_bundle_has_both_group_and_diff_descriptives() -> None:
    """配对设计:两个时点各自的描述统计 **与** 差值的描述统计,都要在。

    差值行是中文医学期刊配对表的必备项(审稿人看的是差值及其区间);
    而两个时点各自的均数±标准差同样要报 —— 二者不是二选一。
    """
    import json as _json
    import tempfile

    import pandas as pd

    from statkit.verbs.run import run_analysis

    with tempfile.TemporaryDirectory() as d:
        wd = Path(d)
        p = wd / "x.csv"
        a = [5.1, 5.4, 4.9, 5.3, 5.0, 5.2, 5.5, 4.8, 5.6, 5.05, 5.25, 5.35]
        b_ = [6.2, 6.5, 6.0, 6.4, 6.1, 6.3, 6.6, 5.9, 6.7, 6.15, 6.35, 6.45]
        pd.DataFrame({
            "id": [f"S{i}" for i in range(12)] * 2,
            "时点": ["前"] * 12 + ["后"] * 12,
            "v": a + b_,
        }).to_csv(p, index=False, encoding="utf-8")
        out = run_analysis(data_path=p, dv="v", group="时点", subject="id",
                           paired=True, workdir=wd)
        bd = _json.loads((wd / out["bundle_path"]).read_text(encoding="utf-8"))
        assert set(bd["descriptives"]) == {"前", "后"}, (
            f"配对 bundle 的组描述统计是 {sorted(bd['descriptives'])} —— 被差值覆盖了"
        )
        assert "median" in bd["descriptives_diff"], "缺差值的描述统计"


def test_missing_excluded_counts_in_the_same_unit_as_the_analysis() -> None:
    """🔴 「排除了几例」必须与分析单元同单位,不能拿行数减对数。

    实测事故(2026-08-05,MED-03):配对分支里 `n_before` 数长表**行数**、
    `n_used` 数**配对数**,相减得到 72−34=38。Methods 段于是原样印出
    「共 38 条记录因关键变量缺失被剔除」—— 而真相是 36 个受试者里 2 个不完整。
    **这句话会进论文**,审稿人拿总样本量一算就对不上。

    配对设计的分析单元是受试者,不是行。计数单位必须跟着分析单元走。
    """
    import json as _json
    import tempfile

    import pandas as pd

    from statkit.verbs.run import run_analysis

    with tempfile.TemporaryDirectory() as d:
        wd = Path(d)
        p = wd / "x.csv"
        # 12 个受试者,其中 2 个「后」缺失 → 应当报「排除 2」,而不是 22(行数 22 − 对数 10)
        ids = [f"S{i}" for i in range(12)]
        rows = []
        for i, sid in enumerate(ids):
            # 差值刻意做成有变异 —— 首版 前=5.0+0.1i / 后=6.0+0.1i 让差值恒为 -1.0,
            # 被「差值零方差」闸拦下(那道闸本身是对的,是这份测试数据不真实)。
            rows.append({"id": sid, "时点": "前", "v": 5.0 + i * 0.1})
            if i < 10:
                rows.append({"id": sid, "时点": "后", "v": 6.0 + i * 0.17 + (0.2 if i % 3 else 0)})
        pd.DataFrame(rows).to_csv(p, index=False, encoding="utf-8")

        out = run_analysis(data_path=p, dv="v", group="时点", subject="id",
                           paired=True, workdir=wd)
        n = _json.loads((wd / out["bundle_path"]).read_text(encoding="utf-8"))["n"]
        assert n["pairs"] == 10
        assert n["unit"] == "pair"
        assert n["missing_excluded"] == 2, (
            f"排除数是 {n['missing_excluded']},应为 2(12 个受试者 − 10 对完整)。"
            f"若是 12 说明又在拿行数减对数了。"
        )


def test_independent_design_still_counts_rows() -> None:
    """独立样本设计里一行就是一例 —— 修配对那条不许把这条弄坏。"""
    import json as _json
    import tempfile

    import pandas as pd

    from statkit.verbs.run import run_analysis

    with tempfile.TemporaryDirectory() as d:
        wd = Path(d)
        p = wd / "x.csv"
        v = [5.1, 5.4, 4.9, 5.3, 5.0, 5.2, 5.5, 4.8, 5.6, 5.05,
             6.2, 6.5, 6.0, 6.4, 6.1, 6.3, 6.6, 5.9, 6.7, 6.15]
        pd.DataFrame({"g": ["A"] * 10 + ["B"] * 10, "v": v + [None, None]}
                     if False else {"g": ["A"] * 10 + ["B"] * 10 + ["A", "B"],
                                    "v": v + [None, None]}).to_csv(
            p, index=False, encoding="utf-8")
        out = run_analysis(data_path=p, dv="v", group="g", workdir=wd)
        n = _json.loads((wd / out["bundle_path"]).read_text(encoding="utf-8"))["n"]
        assert n["unit"] == "case"
        assert n["missing_excluded"] == 2, f"应排除 2 行缺失,实得 {n['missing_excluded']}"


def test_paired_table_uses_timepoint_wording_and_has_a_difference_row() -> None:
    """🔴 配对表不是「两组比较」,而且必须有差值行。

    实测(2026-08-05):配对设计的三线表表题写「表 1 两组中位数(四分位数)比较」、
    行标题写「组别」—— 干预前/干预后是**同一批人的两个时点**,不是两组人。
    更要紧的是没有**差值行**:中文医学期刊的配对表,审稿人看的就是
    「差值(95%CI)」那一行,两个时点各自的均数反而是次要的。

    参数检验给均数差 + 95%CI;Wilcoxon 刻意**不给**均数差的 CI ——
    它检验的不是均数差,配套的是 Hodges-Lehmann 估计量(P0 未实现)。
    宁可不给,也不给一个与检验假设不配套的区间(会出现「区间跨 0 但 p<0.05」的自相矛盾表)。
    """
    import re
    import tempfile
    import zipfile

    import pandas as pd

    from statkit.verbs.report import run_report
    from statkit.verbs.run import run_analysis

    with tempfile.TemporaryDirectory() as d:
        wd = Path(d)
        p = wd / "x.csv"
        # 差值要**连续且近似正态**才会命中 paired_t;首版差值只有 0.6/0.7/0.8 三个离散值,
        # Shapiro 直接拒 → 走了 Wilcoxon(按设计不给均数差 CI),测试因此红。
        pre = [8.52, 9.13, 8.81, 9.44, 8.23, 9.02, 8.75, 9.31, 8.94, 8.61, 9.20, 8.40]
        post = [7.61, 8.55, 8.02, 8.31, 7.88, 8.10, 7.94, 8.72, 8.03, 7.55, 8.44, 7.72]
        rows = []
        for i, (a, b) in enumerate(zip(pre, post)):
            rows += [{"id": f"S{i}", "时点": "干预前", "v": a},
                     {"id": f"S{i}", "时点": "干预后", "v": b}]
        pd.DataFrame(rows).to_csv(p, index=False, encoding="utf-8")

        out = run_analysis(data_path=p, dv="v", group="时点", subject="id",
                           paired=True, workdir=wd)
        r = run_report(bundle_path=wd / out["bundle_path"], system_id="cn-core", workdir=wd)
        x = zipfile.ZipFile(wd / r["table_docx"]).read("word/document.xml").decode("utf-8")
        txt = re.sub(r"<[^>]+>", " ", x)

        assert "时点" in txt, "配对表的行标题仍是「组别」"
        assert "两组" not in txt, "配对表的表题仍写着「两组」"
        assert "差值" in txt, "配对表缺差值行 —— 审稿人看的就是这一行"
        assert "95%CI" in txt, "差值行缺 95% 置信区间"


def test_wilcoxon_difference_row_has_no_mean_ci() -> None:
    """Wilcoxon 的差值行不给均数差 CI —— 它检验的不是均数差。"""
    import tempfile

    import numpy as np

    from statkit.engines.tests import wilcoxon, paired_t

    x = np.array([8.5, 9.1, 8.8, 9.4, 8.2, 9.0, 8.7, 9.3, 8.9, 8.6])
    y = np.array([7.9, 8.4, 8.1, 8.8, 7.6, 8.3, 8.0, 8.6, 8.2, 7.8])
    from statkit.engines.tests import RunCtx
    g, c = {"前": x, "后": y}, RunCtx(paired=True, diff=x - y)
    assert "mean_ci_low" not in wilcoxon(_ds(g, diff=x - y), c)["descriptives_diff"]
    assert "mean_ci_low" in paired_t(_ds(g, diff=x - y), c)["descriptives_diff"]
    del tempfile


# ── PHI 边界:拒绝载荷不得倾泻原始数据(盘点 agent 发现,是本轮自己写的代码引入的)──
def test_rejection_payload_never_dumps_free_text_cell_values() -> None:
    """🔴 因变量选错列时,拒绝信息**不得**把该列的原始值倾泻出去。

    实测(2026-08-05):用户把 `--dv` 指到姓名列,10 个患者姓名被原样写进 stdout,
    而且重复两遍(payload 一次、why_zh 一次)。真实数据 500 例就是 500 个姓名进 LLM 上下文 ——
    直接违反 run.py 顶部自己声明的「原始数据行永远不出现在 stdout」。
    这条是本轮新写的 `_numeric_or_reject` 引入的,属于自伤。

    判据是**像编码还是像数据**:少数几个反复出现的值(阴性/阳性)是编码,回显安全且有用;
    大量互不相同的值是标识列/自由文本 —— 这时该说的是「你多半选错列了」,那比列出姓名更有用。
    """
    import pandas as pd

    from statkit.verbs.run import RunError, _numeric_or_reject

    names = ["张三", "李四", "王五", "赵六", "孙七", "周八", "吴九", "郑十"]
    try:
        _numeric_or_reject(pd.Series(names), "姓名")
    except RunError as e:
        blob = json.dumps(e.payload, ensure_ascii=False)
        for n in names:
            assert n not in blob, f"患者姓名 {n!r} 泄漏进了拒绝载荷"
        assert "选错" in e.payload["why_zh"] or "标识列" in e.payload["why_zh"], (
            "既然不回显内容,就必须给出更有用的指引(多半是列选错了)"
        )
        assert str(len(names)) in e.payload["why_zh"], "至少要给出计数,否则不可行动"
    else:
        raise AssertionError("文本列没被拒")


def test_coded_values_are_still_echoed_because_they_are_actionable() -> None:
    """少数反复出现的编码值(阴性/阳性/未查)照常回显 —— 它们不是数据,是词表。"""
    import pandas as pd

    from statkit.verbs.run import RunError, _numeric_or_reject

    s = pd.Series(["阴性"] * 5 + ["阳性"] * 4 + ["未查"] * 3)
    try:
        _numeric_or_reject(s, "结果")
    except RunError as e:
        blob = e.payload["why_zh"]
        assert "阴性" in blob and "阳性" in blob, "编码值该回显却没回显,提示变得不可行动"
    else:
        raise AssertionError("文本列没被拒")


def test_censored_and_missing_markers_stay_verbatim() -> None:
    """删失/缺失标记是封闭词表,必须原样回显 —— 用户要靠它判断怎么处理。"""
    import pandas as pd

    from statkit.verbs.run import RunError, _numeric_or_reject

    try:
        _numeric_or_reject(pd.Series([1.0, "<0.01", "未测", "<0.01"]), "浓度")
    except RunError as e:
        assert "<0.01" in e.payload["why_zh"] and "未测" in e.payload["why_zh"]
    else:
        raise AssertionError("没被拒")


# ── 退化数据与有限性(盘点 agent 发现,最严重的一条)────────────────────────
def test_zero_variance_group_is_rejected_not_published_as_infinity() -> None:
    """🔴 组内无变异必须拒收,不能产出 `t=-inf, p=0` 的「合格」bundle。

    实测(2026-08-05):A 组整列常数时引擎给出 `ok: true`,里面装着
      statistic=-inf · p_exact=0.0 · effect=-Infinity · CI=NaN
    而且两条前提判定都是**编造的**:
      · Shapiro 对常数列回 W=1.000, p=1.000 → 依据链写「各组均未拒绝正态性假设」;
      · Levene 回 F=nan, p=nan,而 `nan >= 0.05` 是 False ⇒ 静默读成「方差不齐」——
        一个**从未有效发生过的判定**,却会原样进 Methods。
    最终 Results 句是「差异有统计学意义(t(1)=-inf, p<0.001)」。

    这是全轮审计里最严重的一条:引擎**自信地发表了不可能的数字**。
    """
    import tempfile

    import pandas as pd

    from statkit.verbs.run import RunError, run_analysis

    with tempfile.TemporaryDirectory() as d:
        wd = Path(d)
        p = wd / "x.csv"
        pd.DataFrame({"g": ["A"] * 10 + ["B"] * 10,
                      "v": [5.0] * 10 + [6.0, 6.1, 5.9, 6.2, 6.0, 6.3, 5.8, 6.1, 6.0, 6.2]}
                     ).to_csv(p, index=False, encoding="utf-8")
        try:
            run_analysis(data_path=p, dv="v", group="g", workdir=wd)
        except RunError as e:
            assert e.payload["reason"] == "zero_variance"
            assert e.payload["group"] == "A"
            assert e.payload["why_zh"] and e.payload["hint_zh"]
        else:
            raise AssertionError("常数列穿过了引擎 —— t=-inf 会印进论文")
        assert not list((wd / "analysis").glob("*.bundle.json")), "拒收了却还是落了 bundle"


def test_too_few_observations_is_rejected_with_a_reason() -> None:
    """n<3 时任何正态性判定都没有依据 —— 拒收并说清,而不是跑一个空洞的检验。"""
    import tempfile

    import pandas as pd

    from statkit.verbs.run import RunError, run_analysis

    with tempfile.TemporaryDirectory() as d:
        wd = Path(d)
        p = wd / "x.csv"
        pd.DataFrame({"g": ["A", "A", "B", "B", "B", "B", "B", "B"],
                      "v": [5.0, 5.2, 6.0, 6.1, 5.9, 6.2, 6.0, 6.3]}
                     ).to_csv(p, index=False, encoding="utf-8")
        try:
            run_analysis(data_path=p, dv="v", group="g", workdir=wd)
        except RunError as e:
            assert e.payload["reason"] == "too_few_observations"
            assert e.payload["n"] == 2
        else:
            raise AssertionError("n=2 的组穿过了引擎")


def _tiny_two_group_csv(tmp_path: Path) -> Path:
    """一份干干净净、必然跑得通的两组数据 —— 给「数字锁」类测试当载体。"""
    import pandas as pd

    p = tmp_path / "d.csv"
    pd.DataFrame({
        "组别": ["甲"] * 12 + ["乙"] * 12,
        "评分": [5.1, 5.4, 4.9, 5.3, 5.0, 5.2, 5.5, 4.8, 5.6, 5.05, 5.25, 5.35,
                 6.2, 6.5, 6.0, 6.4, 6.1, 6.3, 6.6, 5.9, 6.7, 6.15, 6.35, 6.45],
    }).to_csv(p, index=False, encoding="utf-8")
    return p


def test_no_non_finite_number_can_reach_a_bundle(tmp_path: Path) -> None:
    """纵深防御:任何 inf/NaN 走到落盘前都要当场拒收,**且不许落盘**。

    🔴 这条测试 2026-08-06 被重写过一次,原因值得记下来。

    原版做的是 `inspect.getsource(run_analysis)` 然后断言
    `src.index("non_finite_result") < src.index("reports_required")` ——
    **断言的是两个字符串在源码里的先后**。它有两面都坏:

      · 假绿:把 `if _nonfinite:` 改成 `if False:`(字符串原样留在 payload 里)⇒ 全绿。
        整道闸禁用掉都测不出来 —— 审计实测过。
      · 假红:本次给 run_analysis 加剔除占比闸时,**注释里**出现了 `reports_required`
        这个词,索引顺序就翻了,测试当场红 —— 而代码一行没错。
        (同一形态在 statkitPaths.test.ts 上也撞到过:护栏扫源码必须先剥注释。)

    现在改成驱动真实调用:monkeypatch 计算层让它吐一个 inf,断言引擎拒收、
    reason 与 fields 都对、**而且 analysis/ 里一个 bundle 都没有**。
    最后一条是关键 —— 「拒收」如果发生在落盘之后,backend 的产物收割照样会把它交给用户。
    """
    from statkit.engines import tests as tst
    from statkit.paths import ANALYSIS_DIR
    from statkit.verbs.run import RunError, run_analysis

    p = _tiny_two_group_csv(tmp_path)
    real = tst.DISPATCH["student_t"]

    def poisoned(x, y):  # noqa: ANN001, ANN202
        out = dict(real(x, y))
        out["effect"] = {**out["effect"], "ci_high": float("inf")}
        return out

    tst.DISPATCH["student_t"] = poisoned
    try:
        try:
            run_analysis(data_path=p, dv="评分", group="组别", workdir=tmp_path)
        except RunError as e:
            assert e.payload["reason"] == "non_finite_result", e.payload["reason"]
            assert "effect.ci_high" in e.payload["fields"], e.payload["fields"]
        else:
            raise AssertionError("inf 混进 effect.ci_high 却照常落盘了")
    finally:
        tst.DISPATCH["student_t"] = real

    assert not list((tmp_path / ANALYSIS_DIR).glob("*.bundle.json")), \
        "拒收发生在落盘之后 —— backend 的产物收割走盘上文件,那等于没拦"


def test_missing_required_field_is_refused_not_shipped(tmp_path: Path) -> None:
    """🔴 数字锁本体(`reports_required`)的**行为**测试 —— 此前一条都没有。

    方法卡的注释写着「`reports_required` 是数字锁唯一真正的执行点」,而审计实测:
    把 `missing = [p for p in required if ...]` 改成 `missing = []`,**93 条全绿**。
    全仓关于 `incomplete_bundle` 的引用只有 run.py 自己一处,没有任何测试触发过它。

    这里给方法卡临时加一个引擎不可能产出的必报项,断言引擎当场拒收且不落盘。
    """
    import dataclasses

    from statkit.paths import ANALYSIS_DIR
    from statkit.registry import load_registry
    from statkit.verbs.run import RunError, run_analysis

    reg = load_registry()
    card = reg.methods["student_t"]
    reg.methods["student_t"] = dataclasses.replace(
        card, reports_required=[*card.reports_required, "effect.this_field_cannot_exist"]
    )

    p = _tiny_two_group_csv(tmp_path)
    try:
        run_analysis(data_path=p, dv="评分", group="组别", workdir=tmp_path, reg=reg)
    except RunError as e:
        assert e.payload["reason"] == "incomplete_bundle", e.payload["reason"]
        assert "effect.this_field_cannot_exist" in e.payload["missing"]
    else:
        raise AssertionError("缺必报项的 bundle 照常落盘了 —— 数字锁没有执行点")

    assert not list((tmp_path / ANALYSIS_DIR).glob("*.bundle.json"))


def test_number_lock_rejects_present_but_null_fields(tmp_path: Path) -> None:
    """`_dig` 只查「键在不在」,`None` / `NaN` / `{}` 一律算「存在」—— 这是数字锁的真实边界。

    审计实测:`effect.ci_low = None` 过锁、`n.by_group = {}` 过锁,
    而 `_nonfinite` 的清单是字面量且 `isinstance(None, float)` 为 False ⇒ **None 两道锁都躲过**。
    多条修法建立在「加进 reports_required 数字锁就会强制它」之上,而那个前提不成立。

    ✅ **数组段已于 S3(2026-08-06)补上** —— 上一版这条测试如实钉住「不支持」的现状,
    注释里写着「改完请把本测试反转」。现在反转了。

    ⚠️ 仍然如实钉住的是 `None` / `{}` 能过锁这件事:`_dig` 判的是「键在不在」。
       但**有限性检查已改成从 reports_required 派生**,所以数值型的 NaN/inf 现在被第二道锁抓住;
       剩下的缺口是「值是 None 而路径存在」——那是引擎自身缺陷才会出现的形态,
       目前没有已知触发路径。记在这里,不假装它不存在。
    """
    from statkit.verbs.run import _MISSING, _dig

    assert _dig({"a": {"b": None}}, "a.b") is None            # 「存在」(已知缺口,见上)
    assert _dig({"a": {"b": {}}}, "a.b") == {}                 # 「存在」
    assert _dig({"a": {}}, "a.b") is _MISSING                  # 只有真缺键才判缺

    # ── 数组段(S3)——多组族的必报项天然是列表 ────────────────────────────
    assert _dig({"a": [{"b": 1}, {"b": 2}]}, "a[].b") == [1, 2]
    # 语义是「**每一项**都要有」:有一项缺了就报不全
    assert _dig({"a": [{"b": 1}, {"c": 2}]}, "a[].b") is _MISSING
    # 空列表 = 一项都没报,不算「有」
    assert _dig({"a": []}, "a[].b") is _MISSING
    assert _dig({"a": {"b": 1}}, "a[].b") is _MISSING          # 不是列表
    # 嵌套:terms[].effect.ci_low(回归族的形态)
    assert _dig({"terms": [{"effect": {"ci_low": 0.1}}, {"effect": {"ci_low": 0.2}}]},
                "terms[].effect.ci_low") == [0.1, 0.2]


def test_results_sentence_uses_the_corrected_alpha_not_a_hardcoded_005() -> None:
    """🔴 Results 句的显著性判据必须与 Methods 的多重比较披露一致。

    实测事故(2026-08-05 盘点):Methods 段已按 D5 披露「本会话共 3 次检验,α'=0.0167,
    大于该阈值不应按显著报告」,而 Results 成句里写死 `p < 0.05` ——
    于是**同一份交付物**里 Methods 说不该算显著、Results 说「差异有统计学意义」。
    用户照抄的是 Results 那一句,D5 整段披露等于白做。

    p=0.03、本会话第 3 次检验:名义显著但过不了 α'=0.0167,
    这一格必须明说「未达校正后水平」,而不是含糊写成「无统计学意义」
    (那会让读者以为原始 p 就不显著)。
    """
    from statkit.registry import load_registry
    from statkit.report import results_sentence
    from statkit.report.format import get_system

    reg = load_registry()
    base = {
        "method": "student_t", "groups": ["甲", "乙"],
        "descriptives": {"甲": {"n": 20, "mean": 5.0, "sd": 1.0, "median": 5.0, "q1": 4.5, "q3": 5.5},
                         "乙": {"n": 20, "mean": 5.6, "sd": 1.0, "median": 5.6, "q1": 5.1, "q3": 6.1}},
        "statistic": 2.2, "df": 38.0, "p_exact": 0.03,
        "effect": {"name": "cohens_d", "value": 0.6, "ci_low": 0.1, "ci_high": 1.1},
        "n": {"by_group": {"甲": 20, "乙": 20}},
    }
    sysspec = get_system("cn-core")
    m = reg.methods["student_t"]

    single = results_sentence({**base, "multiplicity": {
        "tests_in_session": 1, "alpha_nominal": 0.05, "alpha_bonferroni": 0.05}}, sysspec, m)
    assert "有统计学意义" in single, "单次检验 p=.03 应当是显著的"

    third = results_sentence({**base, "multiplicity": {
        "tests_in_session": 3, "alpha_nominal": 0.05, "alpha_bonferroni": 0.016667}}, sysspec, m)
    assert "有统计学意义" not in third, (
        "第 3 次检验、p=.03 > α'=.0167,Results 却仍写「有统计学意义」—— 与 Methods 正面矛盾"
    )
    assert "校正" in third and "0.0167" in third, (
        "必须说清是「未达校正后水平」,含糊写成「无统计学意义」会让读者以为原始 p 就不显著"
    )


def test_contrast_direction_is_recorded_and_stated_in_words() -> None:
    """🔴 「谁减谁」必须记录在 bundle 里并写进 Results 句。

    实测事故(2026-08-05 盘点):符号由 `groupby` 的字典序决定,也就是由**组名的 Unicode 顺序**
    决定。同一份数据把「治疗组/对照组」换成组名顺序相反的写法,t 从 +9.37 变 -9.37、
    效应量同步变号,而 bundle 里没有任何字段说明方向、Results 句也不提 ——
    读者拿到 d=-4.19 无从判断哪一组更高。那个符号进论文就是一个**随机的方向断言**。

    修法不是去改排序(排序本身无所谓),而是把方向**记下来并说出来**:
    符号仍由排序决定,但方向变成可读、可核对的。
    """
    import json as _json
    import tempfile

    import pandas as pd

    from statkit.verbs.run import run_analysis

    lo = [5.1, 5.4, 4.9, 5.3, 5.0, 5.2, 5.5, 4.8, 5.6, 5.05]
    hi = [6.2, 6.5, 6.0, 6.4, 6.1, 6.3, 6.6, 5.9, 6.7, 6.15]

    with tempfile.TemporaryDirectory() as d:
        wd = Path(d)
        p = wd / "x.csv"
        pd.DataFrame({"组": ["甲"] * 10 + ["乙"] * 10, "v": lo + hi}).to_csv(
            p, index=False, encoding="utf-8")
        out = run_analysis(data_path=p, dv="v", group="组", workdir=wd)
        b = _json.loads((wd / out["bundle_path"]).read_text(encoding="utf-8"))

        c = b["contrast"]
        assert c["minuend"] in ("甲", "乙") and c["subtrahend"] in ("甲", "乙")
        assert c["minuend"] != c["subtrahend"]
        assert "mean_difference" in c and c["note_zh"]

        # 方向必须与实际均数关系一致
        m1 = b["descriptives"][c["minuend"]]["mean"]
        m2 = b["descriptives"][c["subtrahend"]]["mean"]
        assert (c["mean_difference"] > 0) == (m1 > m2), "记录的方向与实际均数关系相反"

        from statkit.registry import load_registry
        from statkit.report import results_sentence
        from statkit.report.format import get_system

        sent = results_sentence(b, get_system("cn-core"), load_registry().methods[b["method"]])
        assert ("高于" in sent or "低于" in sent), f"Results 句没说方向:{sent}"
        hi_group = c["minuend"] if m1 > m2 else c["subtrahend"]
        lo_group = c["subtrahend"] if m1 > m2 else c["minuend"]
        assert f"{hi_group}高于{lo_group}" in sent, f"方向说反了:{sent}"


def test_binary_outcome_routes_to_the_categorical_family_not_a_t_test() -> None:
    """🔴 0/1 分类结局必须走**卡方族**,不能拿 t 检验糊过去。

    这条测试的判据换过一次,而**它保护的东西一次都没变**:
    「有效率这类 0/1 结局绝不能跑出 t 检验的 p 值」。

    · 2026-08-05:分类族还没实现 ⇒ 正确处置是**诚实拒绝**(reason=binary_outcome),
      判据是「抛 RunError 且给出替代路径」。
    · 2026-08-07:分类族(D-10~D-14)落地 ⇒ 正确处置变成**算对**,
      判据改成「命中卡方族、效应量是率差而不是 Hedges' g」。

    留着上一版的判据会把整族重新堵死 —— 那正是 situations 目录里
    `binary_outcome` 那张退役卡的碑文在说的事。
    """
    import tempfile

    import pandas as pd

    from statkit.verbs.run import run_analysis

    with tempfile.TemporaryDirectory() as d:
        wd = Path(d)
        p = wd / "x.csv"
        pd.DataFrame({
            "组别": ["治疗组"] * 30 + ["对照组"] * 30,
            "有效": [1] * 24 + [0] * 6 + [1] * 15 + [0] * 15,
        }).to_csv(p, index=False, encoding="utf-8")
        out = run_analysis(data_path=p, dv="有效", group="组别", workdir=wd)

    assert out["method"] in {"chi2_pearson", "chi2_yates", "fisher_exact"}, out["method"]
    assert out["rule"] in {"D-10", "D-11"}, out["rule"]
    # 效应量必须是率的效应量,不是均数的
    assert out["effect"]["name"] == "risk_difference", out["effect"]
    # 🔴 反向断言:t 检验族的任何一张都不许出现在这条路上
    assert out["method"] not in {"student_t", "welch_t", "mann_whitney"}


def test_continuous_outcome_with_many_values_is_unaffected() -> None:
    """连续变量不许被这道闸误伤。"""
    import tempfile

    import pandas as pd

    from statkit.verbs.run import run_analysis

    with tempfile.TemporaryDirectory() as d:
        wd = Path(d)
        p = wd / "x.csv"
        pd.DataFrame({
            "g": ["A"] * 10 + ["B"] * 10,
            "v": [5.1, 5.4, 4.9, 5.3, 5.0, 5.2, 5.5, 4.8, 5.6, 5.05,
                  6.2, 6.5, 6.0, 6.4, 6.1, 6.3, 6.6, 5.9, 6.7, 6.15],
        }).to_csv(p, index=False, encoding="utf-8")
        assert run_analysis(data_path=p, dv="v", group="g", workdir=wd)["ok"]


def test_labels_differing_only_by_whitespace_are_refused() -> None:
    """🔴 只差空白/大小写/全半角的两个组名必须拦下。

    实测事故(2026-08-05):分组列写成「对照组」与「对照组 」(尾随空格)时,
    引擎当两个组照常分析,三线表渲染出**两行都叫「对照组」**——
    读者无从分辨哪行是哪组,而真实原因只是多打了一个空格。
    三组以上会被 unsupported_design 拦住,**恰好两组时完全静默**。

    这类脏法在真实数据里极常见:AD-01 的分组列就有「干预组 / 对照组 / 对照 / control」四种写法。
    仍是拦不删 —— 引擎能确定「只差不可见字符」,不能确定该不该合并。
    """
    import tempfile

    import pandas as pd

    from statkit.verbs.run import RunError, run_analysis

    for a, b in (("对照组", "对照组 "), ("Control", "control"), ("ＡＢ组", "AB组")):
        with tempfile.TemporaryDirectory() as d:
            wd = Path(d)
            p = wd / "x.csv"
            pd.DataFrame({
                "组别": [a] * 10 + [b] * 10,
                "v": [5.1, 5.4, 4.9, 5.3, 5.0, 5.2, 5.5, 4.8, 5.6, 5.05,
                      6.2, 6.5, 6.0, 6.4, 6.1, 6.3, 6.6, 5.9, 6.7, 6.15],
            }).to_csv(p, index=False, encoding="utf-8")
            try:
                run_analysis(data_path=p, dv="v", group="组别", workdir=wd)
            except RunError as e:
                assert e.payload["reason"] == "ambiguous_group_labels", f"{a!r} vs {b!r}"
                assert e.payload["why_zh"] and e.payload["hint_zh"]
            else:
                raise AssertionError(f"{a!r} 与 {b!r} 没被拦下 —— 三线表会出两行同名的组")


def test_genuinely_different_labels_pass() -> None:
    """真正不同的组名不许被误伤。"""
    import tempfile

    import pandas as pd

    from statkit.verbs.run import run_analysis

    with tempfile.TemporaryDirectory() as d:
        wd = Path(d)
        p = wd / "x.csv"
        pd.DataFrame({
            "组别": ["干预组"] * 10 + ["对照组"] * 10,
            "v": [5.1, 5.4, 4.9, 5.3, 5.0, 5.2, 5.5, 4.8, 5.6, 5.05,
                  6.2, 6.5, 6.0, 6.4, 6.1, 6.3, 6.6, 5.9, 6.7, 6.15],
        }).to_csv(p, index=False, encoding="utf-8")
        assert run_analysis(data_path=p, dv="v", group="组别", workdir=wd)["ok"]


# ── 读表:编码与工作表(盘点发现,两条都命中用例的一票否决项)────────────────
def test_gbk_and_bom_csv_are_read_not_crashed_on() -> None:
    """🔴 GBK 与 UTF-8-BOM 的 CSV 都必须读得进来。

    实测(2026-08-05):
      · **GBK CSV** 抛裸 `UnicodeDecodeError` 堆栈给用户 —— AD-07 判 bug 依据第 1 条。
        而这条路是**我们自己指引的**:对 .sav 用户我们说「在 SPSS 里另存为 CSV」,
        中文 Windows 上默认就产出 GBK/ANSI。
      · **UTF-8-BOM CSV** 更阴:BOM 粘在第一个列名上,报「找不到列『组别』」
        而候选列表里写着 `'\\ufeff组别'` —— 看起来一模一样,用户无从判断。
    """
    import csv as _csv
    import tempfile

    from statkit.verbs.run import _load_table

    rows = [["组别", "收缩压"]] + [["干预组", 120 + i] for i in range(5)] \
        + [["对照组", 130 + i] for i in range(5)]
    for enc in ("gbk", "utf-8-sig", "utf-8"):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "x.csv"
            with open(p, "w", encoding=enc, newline="") as f:
                _csv.writer(f).writerows(rows)
            df = _load_table(p)
            assert list(df.columns) == ["组别", "收缩压"], f"{enc}:列名成了 {list(df.columns)}"
            assert len(df) == 10


def test_multi_sheet_excel_is_refused_not_silently_first_sheet() -> None:
    """🔴 多工作表不许静默只读第一个。

    「每个指标一个 sheet」是很常见的组织方式。默认 `sheet_name=0` 会**静默分析错对象** ——
    用户以为分析的是他要的那个指标,实际是排在最前面的那个,而且没有任何提示。
    """
    import tempfile

    import pandas as pd

    from statkit.verbs.run import RunError, _load_table

    with tempfile.TemporaryDirectory() as d:
        p = Path(d) / "x.xlsx"
        with pd.ExcelWriter(p, engine="openpyxl") as w:
            pd.DataFrame({"组": ["A"] * 3 + ["B"] * 3, "身高": [1, 2, 3, 4, 5, 6]}).to_excel(
                w, sheet_name="身高", index=False)
            pd.DataFrame({"组": ["A"] * 3 + ["B"] * 3, "体重": [1, 2, 3, 4, 5, 6]}).to_excel(
                w, sheet_name="体重", index=False)
        try:
            _load_table(p)
        except RunError as e:
            assert e.payload["reason"] == "multiple_sheets"
            assert set(e.payload["sheets"]) == {"身高", "体重"}
        else:
            raise AssertionError("多 sheet 被静默只读了第一个")


def test_single_sheet_excel_still_works() -> None:
    """单工作表不许被上一条误伤。"""
    import tempfile

    import pandas as pd

    from statkit.verbs.run import _load_table

    with tempfile.TemporaryDirectory() as d:
        p = Path(d) / "x.xlsx"
        pd.DataFrame({"组": ["A"] * 3 + ["B"] * 3, "v": [1, 2, 3, 4, 5, 6]}).to_excel(p, index=False)
        assert len(_load_table(p)) == 6


def test_duplicate_pair_cell_is_blocked_not_silently_first_wins() -> None:
    """🔴 同一 subject × 同一水平出现两条不同取值时,结果会**依赖文件行序**。

    实测(2026-08-06):25 行内容完全相同,只把那条重复行换个位置 ——
      重复行在末尾 → paired_t, p = 1.339e-10
      重复行在前   → wilcoxon, p = 0.02686
    p 差 8 个数量级,**连所选检验都变了**(D-04 ↔ D-05),两次都 ok:true、degraded:null、零提示,
    依据链还各自言之凿凿地写「差值未拒绝正态性」/「差值不服从正态分布」。
    而 Methods 段会写「数据无缺失,未做剔除」—— 主动断言没剔除,事实上丢了一条测量。
    自从 n_before 改用 nunique 之后,这次丢弃在**任何计数里都不可见**。

    断言写成「两种行序都被拦下」而不是只测一次 —— 若哪天闸被摘掉,
    失败信息会直接把「结果随行序而变」这个病灶打印出来。
    """
    import tempfile

    import pandas as pd

    from statkit.verbs.run import RunError, run_analysis

    pre = [52.1, 48.3, 55.0, 50.2, 53.7, 49.9, 51.4, 54.6, 47.8, 52.9, 50.5, 53.1]
    post = [45.2, 44.0, 48.6, 46.1, 47.3, 43.8, 45.9, 49.2, 42.7, 46.5, 44.4, 47.0]
    base: list[dict[str, Any]] = []
    for i, (a, b) in enumerate(zip(pre, post), 1):
        base += [{"id": f"S{i:02d}", "t": "前", "v": a}, {"id": f"S{i:02d}", "t": "后", "v": b}]
    dup = {"id": "S03", "t": "后", "v": 61.9}     # S03 的「后」原本是 48.6

    tail = base + [dup]
    head: list[dict[str, Any]] = []
    for r in base:
        if r["id"] == "S03" and r["t"] == "后":
            head.append(dup)
        head.append(r)

    outs = []
    for rows in (tail, head):
        with tempfile.TemporaryDirectory() as d:
            wd = Path(d)
            p = wd / "x.csv"
            pd.DataFrame(rows).to_csv(p, index=False, encoding="utf-8")
            try:
                res = run_analysis(data_path=p, dv="v", group="t", subject="id",
                                   paired=True, workdir=wd)
            except RunError as e:
                assert e.payload["reason"] == "duplicate_pair_cells", e.payload["reason"]
                # 回执要能让用户定位到那几行(否则「拦了但不告诉你在哪」等于把锅甩回去)
                cell = e.payload["cells"][0]
                assert cell["level"] in ("前", "后")
                assert cell["rows"], "没给行号 —— 用户无从在原表里定位"
                assert abs(cell["value_spread"] - (61.9 - 48.6)) < 1e-9
                assert e.payload["why_zh"] and e.payload["hint_zh"]

                # 🔴 但**绝不能**带出配对键的原值。配对键在临床数据里就是住院号/病案号,
                #    而 run.py 顶部自陈「原始数据行永远不出现在 stdout —— 这既是上下文预算,
                #    也是 PHI 边界」,SKILL/prompt/spec 三处还让模型对用户复述这句话。
                #    首版把 subject 原值 + 逐个测量值写进 payload.cells 与 why_zh(出现两遍),
                #    经 StatRun 回喂模型 → 转述进对话 → 永久落进 MySQL 并发给上游服务商。
                #    断言写成「整个 payload 序列化后找不到那个 ID」——
                #    比逐字段检查稳:将来加字段忘了打码,这条照样红。
                blob = json.dumps(e.payload, ensure_ascii=False)
                assert "S03" not in blob, f"配对键原值泄漏进回执:{blob[:400]}"
                # 逐个测量值同理:它们是行级数据,不是聚合摘要。
                assert "61.9" not in blob and "48.6" not in blob, f"行级测量值泄漏:{blob[:400]}"
                outs.append(None)
                continue
            outs.append((res["method"], round(res["p_exact"], 12)))

    assert outs == [None, None], f"重复配对格未被拦下,且结果依赖行序:{outs[0]} vs {outs[1]}"


def test_identical_duplicate_rows_do_not_trigger_the_gate() -> None:
    """取值完全相同的重复行不拦 —— 取谁都一样,结果确定。

    这道边界是刻意的:合并两份导出常常产生完全相同的重复行,
    见一次拦一次会把这道闸变成噪音,用户很快就学会无视它。
    """
    import tempfile

    import pandas as pd

    from statkit.verbs.run import run_analysis

    pre = [52.1, 48.3, 55.0, 50.2, 53.7, 49.9, 51.4, 54.6, 47.8, 52.9, 50.5, 53.1]
    post = [45.2, 44.0, 48.6, 46.1, 47.3, 43.8, 45.9, 49.2, 42.7, 46.5, 44.4, 47.0]
    rows: list[dict[str, Any]] = []
    for i, (a, b) in enumerate(zip(pre, post), 1):
        rows += [{"id": f"S{i:02d}", "t": "前", "v": a}, {"id": f"S{i:02d}", "t": "后", "v": b}]
    rows.append({"id": "S03", "t": "后", "v": 48.6})          # 与原值完全相同
    rows.append({"id": "S05", "t": "前", "v": None})          # 空值重复也不该拦

    with tempfile.TemporaryDirectory() as d:
        wd = Path(d)
        p = wd / "x.csv"
        pd.DataFrame(rows).to_csv(p, index=False, encoding="utf-8")
        assert run_analysis(data_path=p, dv="v", group="t", subject="id",
                            paired=True, workdir=wd)["ok"]


# ── 交付闸的取证强度(D2 的唯一防线)────────────────────────────────────────
def test_forged_p_values_are_caught_not_laundered_by_percent_conversion() -> None:
    """🔴 伪造的 p 值必须被标出,不能靠 ÷100 蒙混成「有源」。

    实测事故(2026-08-06):`_has_source` 对每个数字试 `s`、`s*100`、`s/100` 三个候选。
    `s/100` 在**源空间**的容差是 `50·10^-frac` —— 比报告精度松 100 倍,
    而 [0.05, 5.05) 正是 Shapiro W / 相关系数 / t / F / SD 的聚居区。
    于是 .001–.050 的三位小数 p 值有 24%~50% 被判「有源」。

    端到端:真 p 是 0.053/0.465/0.717/0.998 全不显著,手写一份声称 p=0.008 的报告,
    **开着 STATKIT_NUMCHECK_ENFORCE=1 也 100% 放行**(0.008 ← 0.822 的 Shapiro W ÷100)。
    交付闸是 D2「交付物数字来自引擎」的唯一取证防线 —— 它形同虚设时,
    那句对外话术就不成立。
    """
    from statkit.verbs.numcheck import _has_source

    # 这些是真实 bundle 里会出现的量:Shapiro W、相关系数、t 统计量
    sources = [0.822, 0.337, 2.062, 0.7174, 0.052736, 0.465076]
    for forged in ("0.008", "0.003", "0.021", "0.007"):
        assert not _has_source(forged, float(forged), set(sources)), (
            f"伪造的 p={forged} 被判为有源 —— 它是某个源 ÷100 蒙中的"
        )


def test_percent_written_report_still_matches_a_ratio_bundle() -> None:
    """×100 方向必须留着:bundle 存 0.421,报告写 42.1% 或(表头带 % 时)裸写 42.1。"""
    from statkit.verbs.numcheck import _has_source

    assert _has_source("42.1", 42.1, {0.421})
    assert _has_source("42.1%", 42.1, {0.421})
    assert _has_source("0.421", 0.421, {0.421})


def test_apa_style_numbers_without_leading_zero_are_parsed() -> None:
    """🔴 APA 写 `p = .029` / `d = .502`(不带前导零)—— 原正则把它切成整数 029。

    后果是双向的:既漏检真伪造,又对真 APA 产物全部误报。
    而 APA 恰恰是本仓两套体系之一。
    """
    from statkit.verbs.numcheck import _NUM

    got = _NUM.findall("独立样本 t 检验(t(38)=2.20, p = .029, d = .502)")
    assert ".029" in got and ".502" in got, f"解析结果:{got}"
    assert "029" not in got and "502" not in got


# ── 效应量:引擎产出必须有卡,正文必须写符号(盘点发现)────────────────────────
def test_every_effect_id_the_engine_can_emit_has_a_card() -> None:
    """🔴 引擎产出的每个效应量 id 都必须在注册表里有卡。

    实测事故(2026-08-06):`effects.py` 返回 `cohens_d_z` 与 `matched_rank_biserial`,
    而 `cards/effects/two_group.yaml` 里只有 cohens_d / hedges_g / rank_biserial ——
    两个 id 一张卡都没有,方法卡的 `effects:` 声明(paired_t 写着 cohens_d、hedges_g)
    与实际产出完全对不上,那张声明形同虚设。

    后果落在交付物上:Results 句写成
      「(t(29)=-8.974,p<0.001,**cohens_d_z**=-1.64,95%CI [-2.18, -1.08])」
    裸英文 id 出现在**用户被明确引导直接粘进论文**的那一句里。
    """
    import inspect
    import re as _re

    from statkit.engines import effects as eff_mod

    reg = load_registry()
    emitted = set(_re.findall(r'EffectResult\(\s*"([a-z0-9_]+)"', inspect.getsource(eff_mod)))
    assert emitted, "没扫到任何 EffectResult —— 正则失效了,这条测试会变成永远绿的规则"
    missing = sorted(emitted - set(reg.effects))
    assert not missing, f"引擎会产出但注册表里没有卡的效应量:{missing}"


def test_method_cards_declare_the_effect_their_engine_actually_emits() -> None:
    """方法卡的 `effects:` 必须与该方法实际产出的 id 一致 —— 否则那张声明是装饰。"""
    import tempfile

    import pandas as pd

    from statkit.verbs.run import run_analysis

    reg = load_registry()
    # 配对路径:实跑一次,拿引擎真实返回的 effect id 与卡片声明比对
    with tempfile.TemporaryDirectory() as d:
        wd = Path(d)
        p = wd / "x.csv"
        pre = [8.52, 9.13, 8.81, 9.44, 8.23, 9.02, 8.75, 9.31, 8.94, 8.61, 9.20, 8.40]
        post = [7.61, 8.55, 8.02, 8.31, 7.88, 8.10, 7.94, 8.72, 8.03, 7.55, 8.44, 7.72]
        rows = []
        for i, (a, b) in enumerate(zip(pre, post)):
            rows += [{"id": f"S{i}", "t": "前", "v": a}, {"id": f"S{i}", "t": "后", "v": b}]
        pd.DataFrame(rows).to_csv(p, index=False, encoding="utf-8")
        out = run_analysis(data_path=p, dv="v", group="t", subject="id", paired=True, workdir=wd)

    got = out["effect"]["name"]
    declared = reg.methods[out["method"]].effects
    assert got in declared, (
        f"{out['method']} 实际产出 {got!r},而方法卡声明的是 {declared} —— 声明与实现脱节"
    )


def test_results_sentence_prints_the_symbol_not_the_bare_id() -> None:
    """中文 Results 句里写符号(d_z),不写引擎的英文 id(cohens_d_z)。"""
    from statkit.report import results_sentence
    from statkit.report.format import get_system

    reg = load_registry()
    bundle = {
        "method": "paired_t", "groups": ["前", "后"],
        "descriptives": {"前": {"n": 12, "mean": 8.9, "sd": 0.4, "median": 8.9, "q1": 8.6, "q3": 9.2},
                         "后": {"n": 12, "mean": 8.1, "sd": 0.4, "median": 8.1, "q1": 7.8, "q3": 8.4}},
        "statistic": -8.974, "df": 11.0, "p_exact": 0.0001,
        "effect": {"name": "cohens_d_z", "value": -1.64, "ci_low": -2.18, "ci_high": -1.08},
        "n": {"by_group": {"前": 12, "后": 12}, "pairs": 12},
        "multiplicity": {"tests_in_session": 1, "alpha_nominal": 0.05, "alpha_bonferroni": 0.05},
    }
    sent = results_sentence(bundle, get_system("cn-core"), reg.methods["paired_t"],
                            reg.effects["cohens_d_z"])
    assert "cohens_d_z" not in sent, f"裸英文 id 进了中文正文:{sent}"
    assert "d_z=" in sent, f"没写符号:{sent}"


def test_methods_paragraph_also_avoids_the_bare_effect_id() -> None:
    """Methods 段同样不许出现裸英文 id —— 这是上一条那个洞的另一半。

    实测:修完 Results 句之后,Methods 仍在写「效应量报告 cohens_d_z」。
    交付物里**任何一处**出现裸 id,用户就会把它粘进论文。
    """
    from statkit.report import methods_paragraph
    from statkit.report.format import get_system

    reg = load_registry()
    bundle = {
        "method": "paired_t", "groups": ["前", "后"],
        "descriptives": {"前": {"n": 12, "mean": 8.9, "sd": 0.4},
                         "后": {"n": 12, "mean": 8.1, "sd": 0.4}},
        "assumptions": [], "decision": {"rule": "D-04", "reason_zh": "配对设计、差值正态",
                                        "evidence_chain_zh": []},
        "statistic": -8.97, "df": 11.0, "p_exact": 0.0001,
        "effect": {"name": "cohens_d_z", "value": -1.64, "ci_method": "nct"},
        "n": {"by_group": {"前": 12, "后": 12}, "pairs": 12, "missing_excluded": 0,
              "unit": "pair", "missing_rule": "listwise"},
        "software": {"statkit": "0.1.0"},
        "multiplicity": {"tests_in_session": 1, "alpha_nominal": 0.05,
                         "alpha_bonferroni": 0.05, "note_zh": ""},
    }
    m = methods_paragraph(bundle, get_system("cn-core"), reg.methods["paired_t"],
                          reg.effects["cohens_d_z"])
    assert "cohens_d_z" not in m, f"裸英文 id 进了 Methods:{m}"
    assert "d_z" in m, f"符号没写出来:{m}"


def test_direction_word_uses_the_same_location_statistic_as_the_test() -> None:
    """🔴 方向词必须与本次检验同源:参数看均值差,非参看中位数差。

    实测事故(2026-08-06,SPT-05 判定 P0):方向词一律用 `mean_difference`,
    而**非参检验的整个前提就是不看均值**。一个极端值就能让方向词与同一句里的中位数打架:
      「主动恢复组 **305.500**(…)、冷水浸泡组 **399.000**(…)。……主动恢复**高于**冷水浸泡」
    (一个 2000 把主动恢复的均值从 305 抬到 446)。这是一句**自相矛盾的交付文本**,
    而中位数正是这张三线表和这个检验用的东西。
    """
    import json as _json
    import tempfile

    import pandas as pd

    from statkit.registry import load_registry
    from statkit.report import results_sentence
    from statkit.report.format import get_system
    from statkit.verbs.run import run_analysis

    # 中位数说 B 更低,均值说 B 更高(极端值落在中位数较低的那组)
    lo = [300, 305, 310, 295, 315, 308, 302, 312, 298, 306, 304, 2000]
    hi = [380, 395, 400, 410, 420, 390, 405, 415, 388, 385, 398, 402]

    with tempfile.TemporaryDirectory() as d:
        wd = Path(d)
        p = wd / "x.csv"
        pd.DataFrame({"组": ["甲"] * 12 + ["乙"] * 12, "v": hi + lo}).to_csv(
            p, index=False, encoding="utf-8")
        out = run_analysis(data_path=p, dv="v", group="组", workdir=wd)
        b = _json.loads((wd / out["bundle_path"]).read_text(encoding="utf-8"))

    reg = load_registry()
    m = reg.methods[b["method"]]
    assert m.nonparametric, f"这份数据应当走非参路径,实得 {b['method']}"
    assert "median_difference" in b["contrast"], "contrast 里缺中位数差"

    sent = results_sentence(b, get_system("cn-core"), m, reg.effects.get(b["effect"]["name"]))

    # 方向词必须与中位数一致。断言判**语义**不判字面 ——
    # 引擎按 contrast 的减数顺序输出,「甲高于乙」与「乙低于甲」都对,写死一种会假红。
    med = {g: b["descriptives"][g]["median"] for g in b["groups"]}
    hi_g = max(med, key=lambda k: med[k])
    lo_g = min(med, key=lambda k: med[k])
    ok = (f"{hi_g}高于{lo_g}" in sent) or (f"{lo_g}低于{hi_g}" in sent)
    assert ok, f"方向词与中位数不符 —— 中位数 {med},句子:{sent}"
    # 反向:按均值算出来的那个方向绝不能出现
    bad = (f"{lo_g}高于{hi_g}" in sent) or (f"{hi_g}低于{lo_g}" in sent)
    assert not bad, f"方向词用了均值(被极端值翻转):{sent}"


def test_parametric_direction_still_uses_the_mean() -> None:
    """参数检验的方向词照旧看均值 —— 修非参那条不许把这条弄反。"""
    import json as _json
    import tempfile

    import pandas as pd

    from statkit.registry import load_registry
    from statkit.report import results_sentence
    from statkit.report.format import get_system
    from statkit.verbs.run import run_analysis

    with tempfile.TemporaryDirectory() as d:
        wd = Path(d)
        p = wd / "x.csv"
        pd.DataFrame({
            "组": ["甲"] * 12 + ["乙"] * 12,
            "v": [5.1, 5.4, 4.9, 5.3, 5.0, 5.2, 5.5, 4.8, 5.6, 5.05, 5.25, 5.35]
                 + [6.2, 6.5, 6.0, 6.4, 6.1, 6.3, 6.6, 5.9, 6.7, 6.15, 6.35, 6.45],
        }).to_csv(p, index=False, encoding="utf-8")
        out = run_analysis(data_path=p, dv="v", group="组", workdir=wd)
        b = _json.loads((wd / out["bundle_path"]).read_text(encoding="utf-8"))

    reg = load_registry()
    m = reg.methods[b["method"]]
    assert not m.nonparametric
    sent = results_sentence(b, get_system("cn-core"), m, reg.effects.get(b["effect"]["name"]))
    mean = {g: b["descriptives"][g]["mean"] for g in b["groups"]}
    hi_g = max(mean, key=lambda k: mean[k])
    lo_g = min(mean, key=lambda k: mean[k])
    ok = (f"{hi_g}高于{lo_g}" in sent) or (f"{lo_g}低于{hi_g}" in sent)
    assert ok, f"参数检验方向词错:{mean} / {sent}"


def test_methods_never_claims_no_cleaning_happened_upstream() -> None:
    """🔴 引擎不许断言「数据无缺失,未做剔除」—— 它无从知晓上游做了什么。

    实测事故(2026-08-06 评判,13 条用例现形):清洗/聚合/归一/单位换算全发生在
    StatRun **之外**的 Bash 里,`bundle.spec` 只记数据文件与列名,而
    `narrative.py` 依据 `missing_excluded == 0` 主动写下「数据无缺失,未做剔除。」
    最恶劣的一例(AG-03):实际 20 行里整组丢了 6 行,Methods 照写这句。
    而这段正是用户直接粘进论文的 Methods —— 审稿人核对 n 时会当场对不上。

    删掉这句不行(缺失处理是六项最低必报项之一)。正确做法是**收窄作用域**到
    引擎真能背书的范围,并把「上游还得交代」作为**给作者的待办**单独给出,
    不混进 Methods 正文(正文是要粘进论文的,不该夹带待办)。
    """
    import tempfile

    import pandas as pd

    from statkit.verbs.report import run_report
    from statkit.verbs.run import run_analysis

    with tempfile.TemporaryDirectory() as d:
        wd = Path(d)
        p = wd / "cleaned.csv"     # 名字就叫 cleaned —— 上游清洗过,引擎并不知道
        pd.DataFrame({
            "g": ["A"] * 10 + ["B"] * 10,
            "v": [5.1, 5.4, 4.9, 5.3, 5.0, 5.2, 5.5, 4.8, 5.6, 5.05,
                  6.2, 6.5, 6.0, 6.4, 6.1, 6.3, 6.6, 5.9, 6.7, 6.15],
        }).to_csv(p, index=False, encoding="utf-8")
        out = run_analysis(data_path=p, dv="v", group="g", workdir=wd)
        r = run_report(bundle_path=wd / out["bundle_path"], system_id="cn-core", workdir=wd)

    m = r["methods_zh"]
    assert "数据无缺失,未做剔除" not in m, f"引擎又在替上游背书:{m}"
    assert "分析所用数据文件" in m, "断言没有限定作用域"

    notes = r.get("authoring_notes_zh") or []
    assert notes, "缺少给作者的上游处理提醒"
    joined = "\n".join(notes)
    assert "合并" in joined and "Methods" in joined
    # 提醒是给用户的待办,不能混进要粘进论文的正文
    assert "⚠️" not in m


def test_missing_count_uses_the_right_unit_word() -> None:
    """配对设计报「对」,独立样本报「例」—— 单位词跟着分析单元走。"""
    import tempfile

    import pandas as pd

    from statkit.verbs.report import run_report
    from statkit.verbs.run import run_analysis

    with tempfile.TemporaryDirectory() as d:
        wd = Path(d)
        p = wd / "x.csv"
        rows = []
        for i in range(12):
            rows.append({"id": f"S{i}", "t": "前", "v": 5.0 + i * 0.13})
            if i < 10:
                rows.append({"id": f"S{i}", "t": "后", "v": 6.0 + i * 0.17 + (0.2 if i % 3 else 0)})
        pd.DataFrame(rows).to_csv(p, index=False, encoding="utf-8")
        out = run_analysis(data_path=p, dv="v", group="t", subject="id", paired=True, workdir=wd)
        r = run_report(bundle_path=wd / out["bundle_path"], system_id="cn-core", workdir=wd)

    assert "2 对因关键变量缺失被剔除" in r["methods_zh"], r["methods_zh"]


# ── 拒绝回执不得成为绕过教程(P0-1 的第一层)──────────────────────────────
def test_multigroup_is_now_supported_end_to_end(tmp_path: Path) -> None:
    """✅ 三组比较**已经做得了**(P1 族①,2026-08-06)。

    ## 这条测试替换了什么

    上一版叫 `test_multigroup_rejection_does_not_teach_the_bypass`,守的是
    「拒绝回执不许含许可式绕过提示」—— 因为当时引擎做不了三组,而旧文案
    「当前可先筛成两组」被 3 条 E2E 用例逐字引用作为降级依据,
    模型随后拆成两两 t 检验出了三份可投稿交付物。

    **那条测试的前提现在不存在了。** 拒绝路径本身仍在(`unsupported_design` 卡片
    与它的反绕过文案由 situations 目录守着,见 test_every_situation_card_is_actually_filled_in),
    但三组数据不再走那条路 —— 它走的是 D-07/D-08/D-09。
    留一条「拒绝文案还对不对」的测试而实际永不触发,就是一条永远绿的规则。

    ⇒ 换成验证**能力本身**:三组数据要真的算出 omnibus + 事后 + 字母标记。
    """
    import numpy as np
    import pandas as pd

    from statkit.verbs.run import run_analysis

    rng = np.random.default_rng(20260806)
    p = tmp_path / "x.csv"
    pd.DataFrame({
        "处理": ["N0"] * 10 + ["N150"] * 10 + ["N300"] * 10,
        "产量": np.r_[rng.normal(5, 1, 10), rng.normal(6, 1, 10), rng.normal(9, 1, 10)].round(2),
    }).to_csv(p, index=False, encoding="utf-8")

    out = run_analysis(data_path=p, dv="产量", group="处理", workdir=tmp_path)
    assert out["ok"], out
    assert out["method"] in ("oneway_anova", "welch_anova", "kruskal_wallis"), out["method"]
    assert out["rule"] in ("D-07", "D-08", "D-09"), out["rule"]

    import json
    b = json.loads((tmp_path / out["bundle_path"]).read_text(encoding="utf-8"))

    # ① omnibus:F 检验必须同时给两个自由度,否则审稿人复算不了
    assert b["n"]["by_group"] == {"N0": 10, "N150": 10, "N300": 10}
    if b["method"] != "kruskal_wallis":
        assert "df2" in b, "F 检验缺分母自由度 —— F(df1,df2) 少一个数就不可复算"

    # ② 事后比较:3 组 = 3 对,每对都要有校正后的 p
    assert len(b["posthoc"]) == 3
    assert {frozenset((x["a"], x["b"])) for x in b["posthoc"]} == {
        frozenset(("N0", "N150")), frozenset(("N0", "N300")), frozenset(("N150", "N300"))}
    for pair in b["posthoc"]:
        assert 0.0 <= pair["p_adj"] <= 1.0
    assert b["posthoc_method"], "没记用了哪种事后 —— Tukey/Games-Howell/Dunn 的前提不同,Methods 要写明"

    # ③ 字母标记:共享字母 = 不显著。这是农学/食品/体育论文的第一交付物。
    cld = b["cld"]
    assert set(cld) == {"N0", "N150", "N300"}
    # 本 fixture 里 N0 与 N150 接近、N300 明显更高 ⇒ 前两者共享字母,N300 不共享
    assert set(cld["N0"].strip()) & set(cld["N150"].strip()), f"N0/N150 应共享字母:{cld}"
    assert not (set(cld["N0"].strip()) & set(cld["N300"].strip())), f"N0/N300 不该共享字母:{cld}"

def test_pairwise_splitting_of_a_multigroup_design_is_detected() -> None:
    """🔴 把三组设计拆成两两子集连跑,必须在第二次就被拦下。

    实测事故(2026-08-06 评判,6 条用例现形):引擎正确拒绝三组比较后,
    模型转头把数据拆成 pair1/pair2/pair3 三个文件连调三次 StatRun,
    出三份可投稿交付物。引擎每次只看**单次调用**,零识别。
    更糟的是 pair1 的 Methods 写着「本会话仅此一次检验,无多重比较问题」——
    它落盘时确实是第一次,而多重比较记账是落盘瞬间冻结的。

    指纹:**同一 dv 上,同一个组标签出现在同一会话的两个不同 bundle 里**。
    正常的多次分析不会这样 —— 换指标是换 dv,重跑是同一组集合(覆盖同一文件)。
    """
    import tempfile

    import pandas as pd

    from statkit.verbs.run import RunError, run_analysis

    a = [5.1, 5.4, 4.9, 5.3, 5.0, 5.2, 5.5, 4.8, 5.6, 5.05]
    b = [6.2, 6.5, 6.0, 6.4, 6.1, 6.3, 6.6, 5.9, 6.7, 6.15]
    c = [7.1, 7.4, 6.9, 7.3, 7.0, 7.2, 7.5, 6.8, 7.6, 7.05]

    with tempfile.TemporaryDirectory() as d:
        wd = Path(d)
        # pair1:静态拉伸 vs 动态拉伸
        p1 = wd / "pair1.csv"
        pd.DataFrame({"组": ["静态拉伸"] * 10 + ["动态拉伸"] * 10, "v": a + b}).to_csv(
            p1, index=False, encoding="utf-8")
        assert run_analysis(data_path=p1, dv="v", group="组", workdir=wd)["ok"]

        # pair2:静态拉伸 vs 无干预 —— 「静态拉伸」两边都有,拆分指纹
        p2 = wd / "pair2.csv"
        pd.DataFrame({"组": ["静态拉伸"] * 10 + ["无干预"] * 10, "v": a + c}).to_csv(
            p2, index=False, encoding="utf-8")
        try:
            run_analysis(data_path=p2, dv="v", group="组", workdir=wd)
        except RunError as e:
            assert e.payload["reason"] == "pairwise_split_detected"
            assert e.payload["shared"] == ["静态拉伸"]
            assert e.payload["severity"] == "advisory"
            assert e.payload["accept_key"] == "independent_study"
            assert "事后" in e.payload["impact_zh"] and "α" in e.payload["impact_zh"]
            # 回执必须给可用替代路径,否则等于把用户推去代做
            assert "ANOVA" in e.payload["hint_zh"] and "TukeyHSD" in e.payload["hint_zh"]
        else:
            raise AssertionError("两两拆分没被拦下 —— 三份「事后比较」交付物会流出去")


def test_different_outcomes_on_the_same_groups_are_not_flagged() -> None:
    """换指标(不同 dv)不是拆分 —— 同一批人测身高再测体重是完全正常的。"""
    import tempfile

    import pandas as pd

    from statkit.verbs.run import run_analysis

    a = [5.1, 5.4, 4.9, 5.3, 5.0, 5.2, 5.5, 4.8, 5.6, 5.05]
    b = [6.2, 6.5, 6.0, 6.4, 6.1, 6.3, 6.6, 5.9, 6.7, 6.15]

    with tempfile.TemporaryDirectory() as d:
        wd = Path(d)
        p = wd / "x.csv"
        pd.DataFrame({"组": ["甲"] * 10 + ["乙"] * 10,
                      "身高": a + b,
                      "体重": [x + 0.7 for x in a] + [x + 0.4 for x in b]}).to_csv(
            p, index=False, encoding="utf-8")
        assert run_analysis(data_path=p, dv="身高", group="组", workdir=wd)["ok"]
        assert run_analysis(data_path=p, dv="体重", group="组", workdir=wd)["ok"]


def test_rerunning_the_same_two_groups_is_not_flagged() -> None:
    """同一组集合重跑(清洗后再来一次)不是拆分,不许误伤。"""
    import tempfile

    import pandas as pd

    from statkit.verbs.run import run_analysis

    with tempfile.TemporaryDirectory() as d:
        wd = Path(d)
        for name, extra in (("v1.csv", 0.0), ("v2.csv", 0.05)):
            p = wd / name
            pd.DataFrame({
                "组": ["甲"] * 10 + ["乙"] * 10,
                "v": [5.1, 5.4, 4.9, 5.3, 5.0, 5.2, 5.5, 4.8, 5.6, 5.05]
                     + [6.2 + extra, 6.5, 6.0, 6.4, 6.1, 6.3, 6.6, 5.9, 6.7, 6.15],
            }).to_csv(p, index=False, encoding="utf-8")
            assert run_analysis(data_path=p, dv="v", group="组", workdir=wd)["ok"]


# ── 隐私三句话由引擎产出(提示词做不到)──────────────────────────────────────
def test_identifier_columns_trigger_the_privacy_notice() -> None:
    """🔴 数据里有个人标识列时,三句话必须由**引擎**回出来。

    实测(2026-08-06):把这三句话写成 skill 规则后复跑同一条用例(AD-05)三次,
    命中 **0/3 → 2/3 → 0/3** —— 光靠提示词产生不了它,而且模型会拿「去标识化是你的责任」
    去顶掉第 ③ 条(后者用户本来就知道,前者他自己查不到)。

    这段内容是**确定性的**(不依赖数据),标识列的识别也是可机械判定的。
    本仓一贯口径:能机械判定的做闸,判不准的做指引 —— 这条属于前者。

    ⚠️ 三句话的措辞逐条核对过:30 天 = sessions.ts 的默认 TTL;
    中国境内 = 隐私政策原文;「Scholay 自己不训练」= 仓库无训练管线(实测)。
    **刻意不笼统说「不会用于训练」** —— 内容确实发给上游服务商,替别人打包票比不说更糟。
    """
    import tempfile

    import pandas as pd

    from statkit.verbs.run import run_analysis

    with tempfile.TemporaryDirectory() as d:
        wd = Path(d)
        p = wd / "his.csv"
        pd.DataFrame({
            "姓名": [f"患者{i}" for i in range(20)],
            "身份证号": [f"3101{i:014d}" for i in range(20)],
            "住院号": [f"ZY{i:06d}" for i in range(20)],
            "镇痛方案": ["收肌管阻滞"] * 10 + ["静脉自控"] * 10,
            "VAS_24h": [38.0, 35.2, 41.1, 36.8, 39.5, 37.2, 40.3, 34.9, 42.0, 38.6,
                        45.5, 47.1, 43.8, 46.2, 44.0, 48.3, 42.9, 45.0, 46.8, 44.7],
        }).to_csv(p, index=False, encoding="utf-8")
        out = run_analysis(data_path=p, dv="VAS_24h", group="镇痛方案", workdir=wd)

    # ① 不许因为有个人信息就拒绝分析(临床病例表不属于人遗信息,拒绝是过度反应)
    assert out["ok"]

    n = out.get("privacy_notice_zh")
    assert n, "有标识列却没回隐私说明"
    for col in ("姓名", "身份证号", "住院号"):
        assert col in n, f"没点名标识列 {col}"
    # ② 三句话缺一不可
    assert "工作目录" in n and "境内" in n, "缺「存在哪」"
    assert "30 天" in n, "缺「存多久」"
    assert "训练" in n, "缺「会不会拿去训练」—— 这一条用户自己查不到,最不能省"
    # ③ 第三句必须**加限定**,不许替上游打包票
    assert "Scholay 自己" in n and "上游" in n
    assert "你的数据不会被用于训练" not in n
    # ④ 不许出现那三句禁语
    for bad in ("GDPR", "HIPAA", "脱敏完就安全"):
        assert bad not in n or "不要理解成" in n, f"出现禁语 {bad}"
    # ⑤ 必须说清去标识化≠安全
    assert "仍然算个人信息" in n


def test_clean_data_gets_no_privacy_noise() -> None:
    """没有标识列就不啰嗦 —— 每次都弹会让用户学会无视它。"""
    import tempfile

    import pandas as pd

    from statkit.verbs.run import run_analysis

    with tempfile.TemporaryDirectory() as d:
        wd = Path(d)
        p = wd / "clean.csv"
        pd.DataFrame({
            "组别": ["甲"] * 10 + ["乙"] * 10,
            "评分": [5.1, 5.4, 4.9, 5.3, 5.0, 5.2, 5.5, 4.8, 5.6, 5.05,
                     6.2, 6.5, 6.0, 6.4, 6.1, 6.3, 6.6, 5.9, 6.7, 6.15],
        }).to_csv(p, index=False, encoding="utf-8")
        out = run_analysis(data_path=p, dv="评分", group="组别", workdir=wd)
    assert "privacy_notice_zh" not in out


# ── bundle 来源闸(2026-08-06 P0)────────────────────────────────────────────────
#
# 🔴 这一族对应的是一次**端到端复现过两次**的事故,不是假想:
#
#     D1 数字锁把 `analysis/` 设成保留区,让模型写不进 bundle。但没有人约束**消费者** ——
#     `report` 对 `bundle_path` 零校验。于是攻击者根本不碰保留区:
#         在会话根 Write 一份手写 JSON → report --bundle cooked.json
#         ⇒ exit 0,产出真三线表 docx +「t(67.31)=4.106,p<0.001」+ ICMJE 披露
#           +「固定种子以保证可复现」。**一次 run 都没跑过。** 真实 p 是 0.4653。
#
# executor 侧 `statReportTool` 有同一道闸(走 confinePath),这里是**纵深**:
# 命令行直跑、以及将来任何新调用方,都过这一关。两处缺一都不该省。
#
# ⚠️ 为什么不用「重算 spec_hash」:那是**无密钥** sha256,模型自己算得出来;
#    而且 report 只把它当文件名词干用,连存不存在都不要求(`bundle.get("spec_hash","result")`)。

def _minimal_bundle() -> dict:
    return {"schema": "statkit/bundle@1", "method": "welch_t", "spec_hash": "sha256:deadbeef"}


def _write(p: Path, obj: dict) -> Path:
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(obj, ensure_ascii=False), encoding="utf-8")
    return p


def test_report_refuses_bundle_outside_reserved_dir(tmp_path: Path) -> None:
    """保留区之外的 bundle 一律拒 —— 名字对不对都一样,**位置**才是判据。

    三个落点各有意思:会话根(复现用的那条)、名字装得像 bundle 的、以及 out/
    (交付区,模型完全可写 —— 把伪造件放这儿最不起眼)。
    """
    from statkit.verbs.report import BundleSourceError, run_report

    for where in ("cooked.json", "cooked.bundle.json", "out/x.bundle.json"):
        b = _write(tmp_path / where, _minimal_bundle())
        with pytest.raises(BundleSourceError):
            run_report(bundle_path=b, system_id="cn-core", workdir=tmp_path)
        # 关键:**一个字节都不许产出**。产了再拦等于没拦
        # (backend 的收割走 ListWorkspaceFiles(out/),看盘上文件,与返回值无关)。
        assert not list((tmp_path / "out").glob("三线表_*")), f"{where}: 拦之前已经产出了文件"


def test_report_refuses_dotdot_escape(tmp_path: Path) -> None:
    """`analysis/../cooked.bundle.json` —— 词法前缀能骗过 startswith,resolve() 骗不过。"""
    from statkit.verbs.report import BundleSourceError, run_report

    (tmp_path / "analysis").mkdir()
    _write(tmp_path / "cooked.bundle.json", _minimal_bundle())
    with pytest.raises(BundleSourceError):
        run_report(bundle_path=tmp_path / "analysis" / ".." / "cooked.bundle.json",
                   system_id="cn-core", workdir=tmp_path)


def test_report_refuses_symlink_escape(tmp_path: Path) -> None:
    """`ln -s .. analysis/esc` 之后连 `..` 都不出现 —— 只有解符号链接才拦得住。"""
    import os

    from statkit.verbs.report import BundleSourceError, run_report

    (tmp_path / "analysis").mkdir()
    _write(tmp_path / "cooked.bundle.json", _minimal_bundle())
    try:
        os.symlink("..", tmp_path / "analysis" / "esc")
    except (OSError, NotImplementedError):
        pytest.skip("文件系统不支持符号链接")
    with pytest.raises(BundleSourceError):
        run_report(bundle_path=tmp_path / "analysis" / "esc" / "cooked.bundle.json",
                   system_id="cn-core", workdir=tmp_path)


def test_report_refuses_wrong_suffix_inside_reserved(tmp_path: Path) -> None:
    """在保留区里,但不是 bundle —— 保留区不等于白名单(quarantine/ 里就有别的文件)。"""
    from statkit.verbs.report import BundleSourceError, run_report

    b = _write(tmp_path / "analysis" / "notes.json", _minimal_bundle())
    with pytest.raises(BundleSourceError):
        run_report(bundle_path=b, system_id="cn-core", workdir=tmp_path)


def test_report_accepts_real_engine_bundle(tmp_path: Path) -> None:
    """反向:真跑一次 run 再 report,必须通 —— 路径闸最常见的翻车形态是把真活儿也拦了。"""
    import pandas as pd

    from statkit.verbs.report import run_report
    from statkit.verbs.run import run_analysis

    p = tmp_path / "d.csv"
    pd.DataFrame({
        "组别": ["甲"] * 12 + ["乙"] * 12,
        "评分": [5.1, 5.4, 4.9, 5.3, 5.0, 5.2, 5.5, 4.8, 5.6, 5.05, 5.25, 5.35,
                 6.2, 6.5, 6.0, 6.4, 6.1, 6.3, 6.6, 5.9, 6.7, 6.15, 6.35, 6.45],
    }).to_csv(p, index=False, encoding="utf-8")
    out = run_analysis(data_path=p, dv="评分", group="组别", workdir=tmp_path)

    # ① StatRun 回的相对路径原样喂回去(模型实际会这么做)
    rep = run_report(bundle_path=tmp_path / out["bundle_path"], system_id="cn-core", workdir=tmp_path)
    assert rep, "正常路径被路径闸误伤了"
    assert list((tmp_path / "out").glob("三线表_*中文核心期刊*.docx"))

    # ② 换体系重跑同一份 bundle(「秒级换期刊」那条卖点)也不能被误伤
    run_report(bundle_path=tmp_path / out["bundle_path"], system_id="apa", workdir=tmp_path)
    assert list((tmp_path / "out").glob("三线表_*APA*.docx"))


def test_report_cli_returns_actionable_reason_not_a_stack(tmp_path: Path) -> None:
    """回执要让模型读懂「换个路径重试没用,得先跑 StatRun」,而不是当成偶发故障重试。"""
    from statkit.verbs.report import cli

    _write(tmp_path / "cooked.json", _minimal_bundle())
    code, out = cli(["--bundle", str(tmp_path / "cooked.json"), "--system", "cn-core",
                     "--workdir", str(tmp_path)])
    assert code == 2
    payload = json.loads(out)
    assert payload["reason"] == "bundle_not_from_engine"
    assert "StatRun" in payload["hint_zh"]
    assert "Traceback" not in out


# ── numcheck 源集不得被模型可控字符串污染(2026-08-06 P0)──────────────────────
#
# 🔴 实测的绕过,成本低到离谱:
#     bundle 里 `spec.data_file` 是模型传给 StatRun 的文件名,而那个文件通常就是模型
#     自己用 pandas 清洗后写出来的。首版 `_bundle_numbers` 对**任意**字符串抽数字
#     (为修 `Python 3.13.5` 被判无源的误报)⇒ 把清洗后的 CSV 存成
#         clean_v4.106_m55.204_g0.98_lo0.48_hi1.47.csv
#     就把打算编造的每一个数字**预先注册成「有源」**,整份伪造报告在 enforce 下放行。
#     组标签(groups / descriptives 的键 / contrast.note_zh)是同一条路。
#
# 修法是分清「哪些字符串是引擎写的」而不是「别抽字符串」(后者会让版本号误报回来)。
# 实测这次改动在真实报告上**零新增假阳性**(改前改后同为 2 findings / 同样 3 个数)。

def _bundle_with(spec_data_file: str, groups: list[str], tmp_path: Path) -> Path:
    from statkit.paths import ANALYSIS_DIR

    d = tmp_path / ANALYSIS_DIR
    d.mkdir(parents=True, exist_ok=True)
    b = {
        "schema": "statkit/bundle@1", "method": "welch_t",
        "groups": groups,
        "statistic": 2.0, "df": 30.0, "p_exact": 0.05,
        "effect": {"name": "hedges_g", "value": 0.5, "ci_low": 0.1, "ci_high": 0.9},
        "n": {"by_group": {g: 10 for g in groups}},
        "contrast": {"minuend": groups[0], "subtrahend": groups[-1],
                     "note_zh": f"按「{groups[0]} − {groups[-1]}」计算"},
        "spec": {"data_file": spec_data_file, "dv": "值", "group": "组"},
        "software": {"statkit": "0.1.0", "python": "3.13.5", "bootstrap_seed": "20260805"},
    }
    (d / "aaa.bundle.json").write_text(json.dumps(b, ensure_ascii=False), encoding="utf-8")
    return d


def test_numcheck_ignores_numbers_hidden_in_model_controlled_filename(tmp_path: Path) -> None:
    """文件名里塞的数字**不算源** —— 否则模型给数据文件起个名就能预注册要编的数字。"""
    from statkit.verbs.numcheck import _bundle_numbers

    d = _bundle_with("clean_v4.106_m55.204_g0.98.csv", ["A", "B"], tmp_path)
    src = _bundle_numbers(d)
    for forged in (4.106, 55.204, 0.98):
        assert forged not in src, f"{forged} 经文件名混进了源集"


def test_numcheck_ignores_numbers_hidden_in_group_labels(tmp_path: Path) -> None:
    """组标签同理:它来自模型可写的数据文件内容,不是引擎产出。"""
    from statkit.verbs.numcheck import _bundle_numbers

    d = _bundle_with("d.csv", ["组4.106", "组55.204"], tmp_path)
    src = _bundle_numbers(d)
    assert 4.106 not in src and 55.204 not in src, "组标签里的数字混进了源集"


def test_numcheck_still_sources_engine_written_strings(tmp_path: Path) -> None:
    """反向:引擎自己写的字符串仍要算源,否则版本号误报会全回来。

    这是把闸收紧时最容易顺手砸掉的东西 —— `software` 里的 `3.13.5` / `20260805`
    确实出现在交付物的 ICMJE 披露段里,判它无源就是假红。
    """
    from statkit.verbs.numcheck import _bundle_numbers

    d = _bundle_with("d.csv", ["A", "B"], tmp_path)
    src = _bundle_numbers(d)
    # 注:`3.13.5` 被 _NUM 抽成 `3.13` 与 `.5`(不是 5)—— 版本号语义不需要理解,
    # 报告里写的是同一串,按同样规则抽取即可对上。这里断言那个**独一无二**的 3.13,
    # 不断言 .5(它与 effect.value=0.5 撞车,不构成判据)。
    assert 3.13 in src, "software 里的版本号不再算源 —— 会把真报告判成伪造"
    assert 20260805.0 in src, "bootstrap_seed 不再算源"


def test_numcheck_still_sources_numeric_leaves_everywhere(tmp_path: Path) -> None:
    """数值叶子全树都收 —— 收紧的只是字符串,别把统计量本身也拦了。"""
    from statkit.verbs.numcheck import _bundle_numbers

    d = _bundle_with("d.csv", ["A", "B"], tmp_path)
    src = _bundle_numbers(d)
    for real in (2.0, 30.0, 0.05, 0.5, 0.1, 0.9, 10.0):
        assert real in src, f"真实统计量 {real} 没进源集"


# ── 方法卡的 effects 声明必须与引擎实际产出一致 ────────────────────────────────
#
# 🔴 这条是被一次**漏网的变异**逼出来的(2026-08-06):
#     给 Welch 分支换上 d_av 标准化的新效应量之后,我为 effects.py 写了三条测试
#     (公式 / 口径字段 / 覆盖率),然后做变异验证 —— 把 tests.py 里的
#     `eff.hedges_g_av(x, y)` 改回旧的 `eff.hedges_g(x, y)`,**107 条全绿**。
#
#     因为那三条测的是效应量函数**本身**,没有一条断言「welch_t 真的调了它」。
#     引擎里放着一个正确的实现、而分流没接过去,是本仓反复出现的形态
#     (StatReport 工具不存在而 skill 让模型调它;信号量写在注释里而代码没有)。
#
# 判据选「卡片的 effects[0] == 引擎产出的 effect.name」,一次覆盖两件事:
#   ① 接线对不对(引擎产出的是不是卡片说的那个);
#   ② 声明漂不漂移(卡片改了而实现没跟上,或反过来)。
# 加第 6 张方法卡时它自动生效,不需要有人记得补一条点测试。

def test_every_method_emits_the_effect_its_card_declares() -> None:
    """逐张方法卡真跑一次,断言产出的 effect.name 就是卡片 `effects[0]`。"""
    import numpy as np

    from statkit.engines import tests as tst
    from statkit.registry import load_registry

    reg = load_registry()
    # 独立样本用的数据:**方差明显不齐 + n 不等**。
    # 等 n 时 pooled 与 d_av 恒等,分辨不出接线有没有换(首版就栽在这里)。
    rng = np.random.default_rng(20260806)
    x_ind = rng.normal(12.0, 4.0, 14)
    y_ind = rng.normal(9.0, 1.2, 26)
    # 配对方法要求等长(diff = x − y)。
    x_par = rng.normal(12.0, 3.0, 20)
    y_par = x_par - rng.normal(1.5, 1.0, 20)

    # 🔴 C1 之后必须**按形状**准备夹具:列联表族吃的是 CountTable,不是数值向量。
    #    上一版写死 `tst.DISPATCH.get(mid)`,分类族落地当天 6 张合法卡片全被判成「没有实现」。
    #    夹具刻意造成:2×2 期望频数达标、有序 3 组(趋势)、配对失配对不为零。
    from statkit.engines import categorical as cat
    from statkit.engines import dispatch as disp

    tbl_2x2 = cat.build_table(["甲"] * 30 + ["乙"] * 30,
                              ["有效"] * 23 + ["无效"] * 7 + ["有效"] * 15 + ["无效"] * 15)
    tbl_rxc = cat.build_table(["低"] * 30 + ["中"] * 30 + ["高"] * 30,
                              ["有效"] * 10 + ["无效"] * 10 + ["部分"] * 10
                              + ["有效"] * 18 + ["无效"] * 6 + ["部分"] * 6
                              + ["有效"] * 22 + ["无效"] * 4 + ["部分"] * 4)
    tbl_trend = cat.build_table(["低"] * 30 + ["中"] * 30 + ["高"] * 30,
                                ["有效"] * 9 + ["无效"] * 21
                                + ["有效"] * 16 + ["无效"] * 14
                                + ["有效"] * 24 + ["无效"] * 6,
                                rows=["低", "中", "高"])
    tbl_paired = cat.build_table(["治疗前"] * 40 + ["治疗后"] * 40,
                                 ["有效"] * 12 + ["无效"] * 28 + ["有效"] * 27 + ["无效"] * 13,
                                 rows=["治疗前", "治疗后"])

    checked = []
    for mid, card in sorted(reg.methods.items()):
        if not card.effects:
            continue
        impl = disp.table_for(card.input_shape).get(mid)
        assert impl is not None, (
            f"方法卡 {mid!r}(input_shape={card.input_shape!r})声明了 effects 却没有实现 —— "
            f"loader 应当在加载期就拦住它(见 run.py 的 check_not_implemented)"
        )
        if card.input_shape == "table":
            if card.units == "paired":
                tbl = tbl_paired
            elif mid == "cochran_armitage":
                tbl = tbl_trend
            elif card.group_levels[1] is None:      # R×C:上限不封顶的那张
                tbl = tbl_rxc
            else:
                tbl = tbl_2x2
            out = impl(_ds_table(tbl), tst.RunCtx(paired=card.units == "paired"))
        # ✅ S2 落地后改成**读卡片**:`card.units` 直接说了这是独立样本还是配对方法。
        #    (上一版靠「试独立形状、抛异常再试配对形状」分流 —— 那时卡片还没有 units 字段。
        #     留这段说明是因为它是「钩子埋下去之后,调用方确实变简单了」的一个具体例证。)
        elif card.units == "paired":
            out = impl(_ds({"前": x_par, "后": y_par}, diff=x_par - y_par), tst.RunCtx(paired=True, diff=x_par - y_par))
        else:
            out = impl(_ds({"甲": x_ind, "乙": y_ind}), tst.RunCtx())
        got = (out.get("effect") or {}).get("name")
        assert got == card.effects[0], (
            f"{mid}:卡片声明默认效应量是 {card.effects[0]!r},引擎实际产出 {got!r} —— "
            f"声明与实现漂移。用户看到的 Methods 段写的是卡片那个名字。"
        )
        checked.append(mid)
    assert len(checked) >= 3, f"只核到 {checked},锚点太少"


def test_welch_effect_declares_unpooled_standardizer() -> None:
    """定点回归:Welch 这一支的效应量必须是不合并方差的那个,且口径如实落进 bundle。

    通用规则(上一条)哪天被放宽了,这条仍然会红 —— 它盯的是出过事的那一格:
    合并 SD + 非中心 t 在「小样本那组方差大」时把 95%CI 的实际覆盖率打到 0.70。
    """
    import numpy as np

    from statkit.engines import tests as tst

    rng = np.random.default_rng(20260806)
    out = tst.welch_t(_ds({"A": rng.normal(12.0, 4.0, 14), "B": rng.normal(9.0, 1.2, 26)}),
                      tst.RunCtx())
    e = out["effect"]
    assert e["name"] == "hedges_g_av", e["name"]
    assert e["standardizer"] == "d_av", e["standardizer"]
    assert e["ci_method"] == "bootstrap", e["ci_method"]

    # 而 Student 那一支仍然用合并 SD —— 它的前提就是等方差,不该被一起改掉。
    st = tst.student_t(_ds({"A": rng.normal(12.0, 2.0, 20), "B": rng.normal(9.0, 2.0, 20)}),
                       tst.RunCtx())
    assert st["effect"]["standardizer"] == "pooled_sd"


# ── 剔除占比闸(2026-08-06 P0)──────────────────────────────────────────────────
#
# 🔴 实测事故:openpyxl 造 60 行 xlsx,分组列按 5 行一块**合并单元格**
#    (中文科研 Excel 的默认排版)→ pandas 读进来只有每块首行有值 →
#    `dropna()` 静默丢掉 48 行 → 引擎基于 12 行跑完 Student t、落 bundle、出可投稿交付物,
#    **零警告**,而所有机械闸(reports_required / 有限性 / numcheck)全绿。
#    Methods 只写「共 48 例因关键变量缺失被剔除」—— 读起来像数据本身有缺失,真相是排版。

def _merged_cell_xlsx(tmp_path: Path, block: int = 5, n: int = 60) -> Path:
    """模拟合并单元格:分组列只有每块首行有值,其余为空。"""
    import pandas as pd

    rng = __import__("numpy").random.default_rng(20260806)
    groups = []
    for i in range(n):
        groups.append(("干预组" if (i // (n // 2)) == 0 else "对照组") if i % block == 0 else None)
    p = tmp_path / "merged.xlsx"
    pd.DataFrame({"组别": groups,
                  "评分": rng.normal(10, 2, n).round(2)}).to_excel(p, index=False)
    return p


def test_merged_cells_do_not_silently_drop_most_of_the_data(tmp_path: Path) -> None:
    """合并单元格 → 丢 80% 行 → 必须拦下,而且要**说清是排版不是缺失**。"""
    from statkit.paths import ANALYSIS_DIR
    from statkit.verbs.run import RunError, run_analysis

    p = _merged_cell_xlsx(tmp_path)
    try:
        run_analysis(data_path=p, dv="评分", group="组别", workdir=tmp_path)
    except RunError as e:
        assert e.payload["reason"] == "excessive_exclusion", e.payload["reason"]
        assert e.payload["severity"] == "advisory", "剔除占比是**归模型决定**的一档"
        assert e.payload["model_decides"] is True
        assert e.payload["accept_key"] == "missing_ok", "回执必须告诉模型该传哪个参数"
        assert e.payload["rate"] > 0.7, e.payload["rate"]
        # 归因必须指向**分组列**,并给出合并单元格的具体修法 ——
        # 只说「缺失过多」会把用户推去猜,而这两种情况的下一步动作完全不同。
        assert e.payload["missing_by_column"]["组别"] > 0
        assert e.payload["worst_column"] == "组别" and e.payload["structural"] is True
        assert "合并单元格" in e.payload["impact_zh"]
        assert "取消合并" in e.payload["hint_zh"]
        assert e.payload["if_proceed_zh"], "advisory 必须回答「坚持继续会怎样」"
    else:
        raise AssertionError("丢了 80% 的行却照常出结果")

    assert not list((tmp_path / ANALYSIS_DIR).glob("*.bundle.json"))


def test_missing_ok_lets_a_confirmed_exclusion_through_and_records_it(tmp_path: Path) -> None:
    """逃生开关必须**留痕**:确认后放行,但 `spec.missing_ok` 落进 bundle 供 Methods 披露。

    「拦不删」的完整形态是「拦住 → 用户确认 → 写进论文」,
    而不是「拦住 → 加个 flag → 无痕通过」——后者只是把闸变成一道手续。
    """
    import json

    from statkit.paths import ANALYSIS_DIR
    from statkit.verbs.run import run_analysis

    p = _merged_cell_xlsx(tmp_path)
    out = run_analysis(data_path=p, dv="评分", group="组别", workdir=tmp_path, missing_ok=True)
    assert out["ok"]
    b = json.loads((tmp_path / out["bundle_path"]).read_text(encoding="utf-8"))
    assert b["spec"]["missing_ok"] is True, "确认动作没留痕 —— Methods 就无从披露"
    assert b["n"]["missing_excluded"] > 0


def test_ordinary_missingness_does_not_trip_the_gate(tmp_path: Path) -> None:
    """反向:10% 左右的真实缺失不该被拦 —— 狼来了比漏报更快毁掉一道闸。"""
    import numpy as np
    import pandas as pd

    from statkit.verbs.run import run_analysis

    rng = np.random.default_rng(7)
    v = list(rng.normal(10, 2, 30).round(2)) + list(rng.normal(12, 2, 30).round(2))
    v[3] = v[17] = v[41] = v[52] = np.nan          # 4/60 ≈ 6.7%
    p = tmp_path / "d.csv"
    pd.DataFrame({"组别": ["甲"] * 30 + ["乙"] * 30, "评分": v}).to_csv(
        p, index=False, encoding="utf-8")
    out = run_analysis(data_path=p, dv="评分", group="组别", workdir=tmp_path)
    assert out["ok"] and out["n"]["missing_excluded"] == 4


# ── CLI 兜底:stdout 只出 JSON,永不甩 Python 栈(2026-08-06 P1)────────────────
#
# 🔴 `run.py` 顶部自称「stdout 只回 JSON 摘要」,`_numeric_or_reject` 的文档串把
#    「用户看到 Python 栈」列为一票否决项(AD-07)—— 而 cli() 此前只捕两种自定义异常。
#    审计实测至少 9 类常见脏输入直穿到 stderr,而 executor 把 stderr 原样回喂模型:
#    模型拿到一段堆栈,既不知道哪一行有问题也不知道下一步做什么,于是白烧轮次猜,
#    或者改用 Bash 自己算 —— 后者正是本卡片存在的理由的反面。

def test_dirty_inputs_never_produce_a_python_traceback(tmp_path: Path) -> None:
    """五类实测踩到的脏输入,每一类都要回结构化 JSON + 可行动 hint。"""
    from statkit.verbs.run import cli

    cases: list[tuple[str, list[str]]] = []

    # ① 带尾注的 CSV(Excel 导出常见):某几行列数与表头不一致
    p1 = tmp_path / "tail.csv"
    p1.write_text("组别,评分\n甲,5.1\n甲,5.4\n乙,6.2\n注:本表数据来自 2024 年,共 3 例\n",
                  encoding="utf-8")
    cases.append(("尾注行", ["--data", str(p1), "--dv", "评分", "--group", "组别"]))

    # ② 单列 txt:定不了分隔符
    p2 = tmp_path / "one.txt"
    p2.write_text("评分\n5.1\n5.4\n6.2\n", encoding="utf-8")
    cases.append(("单列txt", ["--data", str(p2), "--dv", "评分", "--group", "组别"]))

    # ③ 文件不存在(模型把附件标记里的容器绝对路径原样传进来)
    cases.append(("路径不存在",
                  ["--data", "/home/bun/sessions/abc/d.csv", "--dv", "评分", "--group", "组别"]))

    # ④ strip 后列名撞名
    p4 = tmp_path / "dup.csv"
    p4.write_text("组别,组别 ,评分\n甲,x,5.1\n乙,y,6.2\n", encoding="utf-8")
    cases.append(("列名撞名", ["--data", str(p4), "--dv", "评分", "--group", "组别"]))

    # ⑤ 配对但漏 group
    p5 = tmp_path / "pair.csv"
    p5.write_text("id,t,v\nS1,前,5.1\nS1,后,4.2\nS2,前,5.4\nS2,后,4.6\n", encoding="utf-8")
    cases.append(("配对漏group",
                  ["--data", str(p5), "--dv", "v", "--subject", "id", "--paired"]))

    for name, argv in cases:
        code, out = cli([*argv, "--workdir", str(tmp_path)])
        assert code == 2, f"{name}: 退出码应为 2,实得 {code}"
        assert "Traceback" not in out, f"{name}: stdout 里出现了 Python 栈\n{out[:400]}"
        payload = json.loads(out)          # 必须是合法 JSON —— 这就是「stdout 只出 JSON」
        assert payload["ok"] is False, name
        assert payload.get("hint_zh"), f"{name}: 没给可行动的下一步"
        assert payload.get("reason"), name


def test_cli_bottom_catch_keeps_the_error_kind(tmp_path: Path) -> None:
    """兜底**不吞信息**:异常类型如实带出,便于事后归类与补专用回执。"""
    from statkit.verbs.run import cli

    code, out = cli(["--data", str(tmp_path / "nope.csv"), "--dv", "v",
                     "--group", "g", "--workdir", str(tmp_path)])
    payload = json.loads(out)
    assert code == 2
    # 这一类已有专用 hint(容器绝对路径那条),所以 reason 可能是 engine_internal_error
    # 也可能将来被提升成专用 reason —— 判据放在「可读且可行动」上,不锁死 reason 字面量。
    assert payload.get("error_kind") or payload.get("reason")
    assert "文件" in payload["hint_zh"] or "找不到" in payload["hint_zh"]


# ── 配对设计的成句与方向词(2026-08-06 P1)────────────────────────────────────────
#
# 🔴 narrative 此前**没有 paired 分支**,后果是三重的:
#    ① 「据此采用配对 t 检验进行**组间比较**」—— 把受试者内设计描述成两独立样本;
#    ② 「**干预前组** 8.863±0.342(n=15)、**干预后组** 8.075±0.331(n=15)」——
#       造出「干预前组」这种不存在的东西,而且两个时点**各标一次 n**,读者读成 30 例;
#    ③ 同一次 report 产出的 docx 表头写「时点/干预前/干预后」而 md 正文写「两组」——
#       两份交付物自相矛盾。
#    前后自身对照是中文临床/体育论文最大的一族。

def _paired_bundle(tmp_path: Path, pre: list[float], post: list[float]) -> dict:
    import json as _json

    import pandas as pd

    from statkit.verbs.run import run_analysis

    rows = []
    for i, (a, b) in enumerate(zip(pre, post), 1):
        rows += [{"id": f"S{i:02d}", "时点": "干预前", "值": a},
                 {"id": f"S{i:02d}", "时点": "干预后", "值": b}]
    p = tmp_path / "d.csv"
    pd.DataFrame(rows).to_csv(p, index=False, encoding="utf-8")
    out = run_analysis(data_path=p, dv="值", group="时点", subject="id",
                       paired=True, workdir=tmp_path)
    return _json.loads((tmp_path / out["bundle_path"]).read_text(encoding="utf-8"))


def test_paired_design_is_not_described_as_between_groups(tmp_path: Path) -> None:
    from statkit.registry import load_registry
    from statkit.report import get_system, methods_paragraph, results_sentence

    pre = [8.9, 9.1, 8.8, 9.4, 8.2, 9.0, 8.7, 9.3, 8.9, 8.6, 9.2, 8.4]
    post = [7.6, 8.5, 8.0, 8.3, 7.9, 8.1, 7.9, 8.7, 8.0, 7.5, 8.4, 7.7]
    b = _paired_bundle(tmp_path, pre, post)
    reg = load_registry()
    sysspec = get_system("cn-core")
    m = reg.methods[b["method"]]
    eff_card = reg.effects.get((b.get("effect") or {}).get("name"))

    meth = methods_paragraph(b, sysspec, m, eff_card)
    res = results_sentence(b, sysspec, m, eff_card)

    assert "组间比较" not in meth, meth
    assert "前后比较" in meth, meth
    # 不许造出「干预前组」
    assert "干预前组" not in res and "干预后组" not in res, res
    assert "两组" not in res, res
    assert "两个时点" in res, res
    # n 只报一次,单位是「对」
    assert res.count("n=") == 0, f"配对不该在每个时点后标 n:{res}"
    assert f"共 {len(pre)} 对" in res, res


def test_paired_direction_word_uses_median_of_differences(tmp_path: Path) -> None:
    """🔴 方向词必须与三线表的「差值」行同源。

    实测反例:9 对差值 [1,1,1,−9,−18,1,1,−9,−18] ——
      · **差值的中位数** = +1(多数人升了)← 三线表印的是这个
      · 两个中位数之差   = −1            ← 旧实现拿这个定方向
    ⇒ 表说「升」、正文说「降」,符号相反,而两个数都在同一份交付物里。
    """
    from statkit.registry import load_registry
    from statkit.report import get_system, results_sentence

    diffs = [1, 1, 1, -9, -18, 1, 1, -9, -18]
    post = [50.0, 51.0, 52.0, 53.0, 54.0, 55.0, 56.0, 57.0, 58.0]
    pre = [p + d for p, d in zip(post, diffs)]
    b = _paired_bundle(tmp_path, pre, post)

    import numpy as np
    assert b["contrast"]["location_estimator"] == "median_of_differences"
    assert abs(b["contrast"]["median_difference"] - float(np.median(diffs))) < 1e-9

    reg = load_registry()
    res = results_sentence(b, get_system("cn-core"), reg.methods[b["method"]],
                           reg.effects.get((b.get("effect") or {}).get("name")))
    # 差值中位数为正(干预前 > 干预后)⇒ 方向词必须是「干预前高于干预后」
    if "高于" in res or "低于" in res:
        assert "干预前高于干预后" in res, f"方向词与差值行反号:{res}"


def test_wilcoxon_discloses_dropped_zero_difference_pairs(tmp_path: Path) -> None:
    """🔴 Wilcoxon 原法丢弃零差值对 —— 检验的有效 n 必须可见且被披露。

    实测反例(15 对里 10 对前后完全没变):两个时点中位数都是 10.000、差值行 0.000、
    无方向词,却断言 p=0.039 有统计学意义、r=−1.00 且 CI 退化成 [−1.00,−1.00];
    Methods 还写「无缺失值」。审稿人按表里 n=15 复算得不到那个 p(实际只用了 5 对)——
    整张表既不可解释也不可复核。「多数人没变化」在护理/康复/教育的前后测里是常见形态。
    """
    from statkit.registry import load_registry
    from statkit.report import get_system, methods_paragraph

    # 10 对完全不变 + 5 对下降 ⇒ 差值非正态,分流走 Wilcoxon
    pre = [10.0] * 10 + [12.0, 13.0, 14.0, 15.0, 16.0]
    post = [10.0] * 10 + [9.0, 9.5, 10.5, 11.0, 11.5]
    b = _paired_bundle(tmp_path, pre, post)
    assert b["method"] == "wilcoxon", f"期望走 Wilcoxon,实得 {b['method']}"

    # ① 三处计数必须都在,且口径互相对得上
    n = b["n"]
    assert n["pairs"] == 15
    assert n["zero_diffs"] == 10
    assert n["pairs_effective"] == 5
    assert n["pairs"] == n["pairs_effective"] + n["zero_diffs"]

    # ② 必须**披露**,不能只躺在 bundle 里 —— 用户读的是 Methods 段
    reg = load_registry()
    meth = methods_paragraph(b, get_system("cn-core"), reg.methods[b["method"]],
                             reg.effects.get((b.get("effect") or {}).get("name")))
    assert "10 对前后测完全相同" in meth, meth
    assert "5 对" in meth, meth


def test_engine_unit_counts_go_through_n_extra_not_the_top_level(tmp_path: Path) -> None:
    """归属:实现报的单元计数落在 `n.*`,不散在 bundle 顶层。

    `n.pairs` 与 `n.pairs_effective` 是同一类东西,分居两处会让下游(报告/数字锁/审稿人)
    各自去猜该看哪个。而 `n` 是组装方的字段、实现不得直接写 —— 所以要有 `n_extra` 这条通道。
    """
    import json

    pre = [10.0] * 10 + [12.0, 13.0, 14.0, 15.0, 16.0]
    post = [10.0] * 10 + [9.0, 9.5, 10.5, 11.0, 11.5]
    b = _paired_bundle(tmp_path, pre, post)
    assert "n_extra" not in b, "n_extra 是通道不是字段,不该出现在 bundle 里"
    assert "n_effective_pairs" not in b and "n_zero_diffs" not in b, \
        "单元计数散在顶层 —— 应当合并进 n"
    assert json.dumps(b)  # 可序列化(numpy 标量必须已被 _native 转过)


def test_per_group_assumption_does_not_restate_one_groups_statistic(tmp_path: Path) -> None:
    """🔴 逐组列完 W 与 p 之后,不许再追加一个**无主语的全局统计量**。

    实测原文(9 条用例上现形):
      「各组正态性(Shapiro-Wilk)(甲:0.978, p=0.565、乙:0.953, p=0.094):
        **统计量 0.953,p=0.094**,该前提满足。」
    后半句把其中一组的 W 复述成了一个看起来是「全局」的量 —— 那种东西不存在,
    审稿人会直接问「你这个 W 是谁的」。而这段正是用户要粘进论文的 Methods。
    """
    import numpy as np
    import pandas as pd

    from statkit.registry import load_registry
    from statkit.report import get_system, methods_paragraph
    from statkit.verbs.run import run_analysis

    rng = np.random.default_rng(20260806)
    p = tmp_path / "d.csv"
    pd.DataFrame({"组别": ["甲"] * 15 + ["乙"] * 15,
                  "评分": np.r_[rng.normal(10, 2, 15), rng.normal(12, 2, 15)].round(2)}
                 ).to_csv(p, index=False, encoding="utf-8")
    out = run_analysis(data_path=p, dv="评分", group="组别", workdir=tmp_path)

    import json
    b = json.loads((tmp_path / out["bundle_path"]).read_text(encoding="utf-8"))
    reg = load_registry()
    meth = methods_paragraph(b, get_system("cn-core"), reg.methods[b["method"]],
                             reg.effects.get((b.get("effect") or {}).get("name")))

    # 逐组明细必须还在(依据链是卖点,不能为了句子干净把它删了)
    assert "甲:" in meth and "乙:" in meth, meth
    # 但逐组明细后面不许紧跟「统计量 X,p=Y」
    import re
    assert not re.search(r"(甲|乙):[^)）]*[)）]:统计量", meth), \
        f"逐组列完又追加了一个悬空的全局统计量:\n{meth}"

    # 反向:没有分组维度的检验(方差齐性只有一个统计量)仍然要报数值
    assert re.search(r"方差齐性[^:]*:统计量", meth), f"单统计量的检验反而不报数了:\n{meth}"


def test_reproduction_script_actually_runs_on_awkward_inputs(tmp_path: Path) -> None:
    """🔴 复现脚本必须**真的能跑** —— 三类此前 100% 崩的输入。

    interpret/SKILL.md 让模型用「报告附带的 analysis.py 就是答案」回答审稿人的
    「数据和代码能提供吗」。而实测:
      · GBK 中文 CSV      → UnicodeDecodeError(脚本写死 `pd.read_csv(fn)`)
      · .tsv              → KeyError(按逗号切,整行成一列)
      · 数值编码分组 1/2  → 复算 nan,脚本当着审稿人的面打印「复算 nan,报告 -2.97」
    前两条恰恰是**我们主动指引用户走的路**(「在 SPSS 里另存为 CSV」在中文 Windows 上
    默认产出 GBK)。一份主动向审稿人声明「报告的数字复现不出来」的脚本,比不给更糟。

    本测试**真的执行**生成的脚本 —— 断言它 exit 0 且打印通过。
    只断言「脚本里有 encoding=」是不够的:那还是在测字符串,不是测能不能跑。
    """
    import csv
    import subprocess
    import sys

    import numpy as np

    from statkit.verbs.report import run_report
    from statkit.verbs.run import run_analysis

    rng = np.random.default_rng(5)
    a = rng.normal(10, 2, 18).round(2)
    b = rng.normal(12, 2, 18).round(2)

    cases = []
    # ① GBK(中文 Windows 从 Excel/SPSS 另存 CSV 的默认编码)
    p1 = tmp_path / "gbk.csv"
    with open(p1, "w", newline="", encoding="gb18030") as f:
        w = csv.writer(f); w.writerow(["组别", "评分"])
        for v in a: w.writerow(["对照组", v])
        for v in b: w.writerow(["干预组", v])
    cases.append(("GBK", p1))
    # ② 制表符分隔
    p2 = tmp_path / "t.tsv"
    with open(p2, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f, delimiter="\t"); w.writerow(["组别", "评分"])
        for v in a: w.writerow(["对照组", v])
        for v in b: w.writerow(["干预组", v])
    cases.append(("TSV", p2))
    # ③ 数值编码分组(SPSS/EpiData 导出最常见的形态)
    p3 = tmp_path / "code.csv"
    with open(p3, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f); w.writerow(["组别", "评分"])
        for v in a: w.writerow([1, v])
        for v in b: w.writerow([2, v])
    cases.append(("数值编码分组", p3))

    for name, src in cases:
        wd = tmp_path / f"wd_{name}"
        wd.mkdir()
        dst = wd / src.name
        dst.write_bytes(src.read_bytes())
        out = run_analysis(data_path=dst, dv="评分", group="组别", workdir=wd)
        run_report(bundle_path=wd / out["bundle_path"], system_id="cn-core", workdir=wd)

        scripts = list((wd / "out").glob("复现脚本_*.py"))
        assert scripts, f"{name}: 没生成复现脚本"
        # 按脚本自己文档串写明的用法来:「与数据文件放同一目录后直接运行」。
        # 审稿人拿到的就是「一个 .py + 一份数据」,不会保留我们的 out/ 结构。
        local = wd / scripts[0].name
        local.write_text(scripts[0].read_text(encoding="utf-8"), encoding="utf-8")
        r = subprocess.run([sys.executable, local.name], cwd=wd,
                           capture_output=True, text=True, timeout=180)
        assert r.returncode == 0, (
            f"{name}: 复现脚本跑不通(exit {r.returncode})\n"
            f"STDOUT:\n{r.stdout[-800:]}\nSTDERR:\n{r.stderr[-800:]}"
        )
        assert "完全一致" in r.stdout, f"{name}: 脚本没通过自带断言\n{r.stdout[-500:]}"


# ── 断言级校验:p 值断言必须与 bundle 相容(2026-08-06 P1)──────────────────────
#
# 🔴 `STRUCTURAL` 白名单里曾有 0.05 / 0.01 / 0.001。它们看起来「与数据无关」——
#    确实是阈值不是测量值 —— 但正因如此,无条件放行等于让**破坏力最大的那句话恒过闸**:
#        「干预组与对照组在主要结局上差异有统计学意义(P < 0.001)。」
#    全文仅有的数字 token 就是 0.001 与 α=0.05,实测在 --enforce 下 findings: []、ok: true,
#    **开着硬拦也 100% 放行**,而 bundle 里真值是 p=0.4653。
#    数字集合比对对「不等式方向」结构上无感:它看得见 0.001,看不见那个 `<`。

def _report_with_claim(tmp_path: Path, claim: str) -> dict:
    """跑一份**不显著**的真实分析,再往 out/ 放一份带指定断言的 md,回 numcheck 结果。"""
    import csv

    import numpy as np

    from statkit.verbs.numcheck import run_numcheck
    from statkit.verbs.run import run_analysis

    rng = np.random.default_rng(9)
    a = rng.normal(10, 2, 20).round(2)
    b = rng.normal(10.3, 2, 20).round(2)
    p = tmp_path / "d.csv"
    with open(p, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f); w.writerow(["组别", "评分"])
        for v in a: w.writerow(["对照组", v])
        for v in b: w.writerow(["干预组", v])
    out = run_analysis(data_path=p, dv="评分", group="组别", workdir=tmp_path)
    assert out["p_exact"] > 0.05, "fixture 必须不显著,否则测不出方向"

    (tmp_path / "out").mkdir(exist_ok=True)
    (tmp_path / "out" / "r.md").write_text(f"# 结果\n{claim}\n", encoding="utf-8")
    return run_numcheck(workdir=tmp_path, enforce=True)


def test_forged_significance_claim_is_caught_even_though_the_number_is_a_template_constant(
    tmp_path: Path,
) -> None:
    res = _report_with_claim(tmp_path, "两组差异有统计学意义(P < 0.001)。检验水准 α=0.05。")
    assert res["ok"] is False, "伪造的显著性断言在 enforce 下被放行了"
    claims = [c for f in res["findings"] for c in f.get("unsupported_claims", [])]
    assert claims, res["findings"]
    assert "0.001" in claims[0]["claim"]


def test_truthful_claim_passes(tmp_path: Path) -> None:
    """反向:如实写「P > 0.05」必须放行 —— 断言级校验最怕的是误伤诚实的报告。"""
    res = _report_with_claim(tmp_path, "两组差异无统计学意义(P > 0.05)。检验水准 α=0.05。")
    claims = [c for f in res["findings"] for c in f.get("unsupported_claims", [])]
    assert not claims, f"如实报告被误判:{claims}"


def test_engine_generated_reports_have_no_claim_false_positives(tmp_path: Path) -> None:
    """🔴 引擎自己产出的两套体系报告,一条断言违规都不该有。

    转 enforce 的前提是「不误伤自家产物」。这条把它钉死 ——
    否则这道闸一开就先没收我们自己生成的报告(审计里 M-39 记的正是这类自伤)。
    """
    import csv

    import numpy as np

    from statkit.verbs.numcheck import run_numcheck
    from statkit.verbs.report import run_report
    from statkit.verbs.run import run_analysis

    rng = np.random.default_rng(3)
    p = tmp_path / "d.csv"
    with open(p, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f); w.writerow(["组别", "评分"])
        for v in rng.normal(10, 2, 20).round(2): w.writerow(["对照组", v])
        for v in rng.normal(13, 2, 20).round(2): w.writerow(["干预组", v])
    out = run_analysis(data_path=p, dv="评分", group="组别", workdir=tmp_path)
    for sysid in ("cn-core", "apa"):
        run_report(bundle_path=tmp_path / out["bundle_path"], system_id=sysid, workdir=tmp_path)

    res = run_numcheck(workdir=tmp_path, enforce=True)
    claims = [(f["file"], c) for f in res["findings"] for c in f.get("unsupported_claims", [])]
    assert not claims, f"引擎自产报告被断言级校验误伤:{claims}"


def test_icmje_disclosure_does_not_vouch_for_the_author(tmp_path: Path) -> None:
    """🔴 ICMJE 披露句是**唯一一句用户会原样投出去、且内容本身是合规声明**的话。

    原文三处都错:
      ① 只披露 statkit,一个字不提大语言模型 —— 而 LLM 做了问诊定设计、清洗合并数据、写解读
         (实测 308 个真实会话里 1360 次 Bash,直接决定进入分析的是哪份数据);
      ② 结尾写「**作者已核对结果与结论**」—— 工具无从知晓的事实断言,还是以作者口吻写的;
         同一函数的 docstring 上面刚说「Methods 段可以放警告,不放背书」。
      ③ 「所有统计量由其确定性计算产出」会随任何一次 StatReport 照印,
         而实测有 28 个会话走 ExportDocument 出交付物、从没调过 StatReport。

    **写错的合规声明比不写更糟** —— 它可以构成学术不端认定的事实基础,而它是我们替用户写的。
    """
    from statkit.report import icmje_disclosure

    d = icmje_disclosure({"software": {"statkit": "0.1.0", "llm_model": "deepseek-v4-flash"}})

    # ① 不许替作者作证
    assert "作者已核对" not in d, d
    assert "已核对结果与结论" not in d, d
    # ② 必须提到 AI 辅助,并带出模型标识
    assert "大语言模型" in d, d
    assert "deepseek-v4-flash" in d, d
    # ③ 作者责任写成祈使(提醒)而不是陈述(作证)
    assert "作者对全部内容负责" in d, d
    assert "请在投稿前核对" in d, d
    # ④ 期刊 AI 政策的提醒 —— 部分中文核心期刊明令禁止 AI 生成正文,我们此前一处没提
    assert "披露要求" in d or "AI 使用" in d, d
    # ⑤ 工具与版本仍在(SAMPL 硬要求)
    assert "statkit 0.1.0" in d, d


def test_icmje_disclosure_degrades_honestly_without_a_model_name() -> None:
    """模型名拿不到时,AI 那句仍要在 —— 缺一个标识不该让整条披露消失。"""
    from statkit.report import icmje_disclosure

    d = icmje_disclosure({"software": {"statkit": "0.1.0"}})
    assert "大语言模型" in d and "()" not in d, d


def test_llm_model_reaches_the_disclosure_end_to_end(tmp_path: Path) -> None:
    """🔴 模型标识必须**一路走到披露句**,不能只是「加了个字段」。

    ICMJE 要求分析用 AI 写进 Methods(含工具与版本),而交付物此前只披露 statkit ——
    那个**不是 AI** 的部件。透传链有五跳:
        turnLoop 解析 model → runTools → ToolCtx → StatRun `--llm-model` → software.llm_model
    本仓反复出现的形态是「引擎造好了、分流/接线没接过去」(StatReport 工具不存在而 skill 让模型调它;
    信号量写在注释里而代码没有;Welch 换了效应量而 tests.py 还调旧的)。
    所以这条测试从 **CLI 参数**一路断言到**披露句文本**,中间任何一跳断掉都红。
    """
    import csv
    import json as _json

    from statkit.report import icmje_disclosure
    from statkit.verbs.run import cli

    p = tmp_path / "x.csv"
    with open(p, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f); w.writerow(["g", "v"])
        for v in [5.1, 5.4, 4.9, 5.3, 5.0, 5.2, 5.5, 4.8, 5.6, 5.05, 5.25, 5.35]:
            w.writerow(["甲", v])
        for v in [6.2, 6.5, 6.0, 6.4, 6.1, 6.3, 6.6, 5.9, 6.7, 6.15, 6.35, 6.45]:
            w.writerow(["乙", v])

    code, out = cli(["--data", str(p), "--dv", "v", "--group", "g",
                     "--workdir", str(tmp_path), "--llm-model", "deepseek-v4-flash"])
    assert code == 0, out
    b = _json.loads((tmp_path / _json.loads(out)["bundle_path"]).read_text(encoding="utf-8"))
    assert b["software"]["llm_model"] == "deepseek-v4-flash"
    assert "deepseek-v4-flash" in icmje_disclosure(b)

    # 不传时:字段不出现,披露句降级但**不消失**
    code2, out2 = cli(["--data", str(p), "--dv", "v", "--group", "g", "--workdir", str(tmp_path)])
    b2 = _json.loads((tmp_path / _json.loads(out2)["bundle_path"]).read_text(encoding="utf-8"))
    assert "llm_model" not in b2["software"]
    assert "大语言模型" in icmje_disclosure(b2)


# ── 情况目录的完整性(2026-08-06 架构调整:模型决策优先)──────────────────────────
#
# 🔴 产品方向定为「模型决策优先,引擎是辅助」。而**引擎从守门人改成仪表盘之后,
#    它对信息量的要求更高了** —— 此前模型选错了有闸兜着,现在没有。
#
#    盘点当时的实际状态:30 种 reason 里 **8 种的 payload 是空的**
#    (`{"ok":false,"reason":"not_two_levels"}` —— 连有几个水平都不告诉你),只有 1 种带 impact。
#    模型撞上这些只能靠猜,而 E2E 实测它猜错的代价是「拒绝回执被读成纯接口限制」→ 转头绕过去。
#
# 这一族测试守的是:**引擎能吐出的每一种 reason,目录里都必须有一张写全的卡**。
# 没有它,加第 31 种情况的人不会想起来去补文案 —— 而缺文案不会报错,只会让模型继续猜。

def _reasons_in_code() -> set[str]:
    """引擎能吐出的全部 reason。

    三种出现形态都要认(2026-08-06 架构调整后新增后两种):
      · `"reason": "xxx"`      —— 直接组装 payload
      · `sit.payload("xxx"`    —— 从情况目录取文案
      · `adv.check("xxx"`      —— advisory 档,归模型决定
    只认第一种的话,advisory 那 8 张卡会被判成「死条目」—— 而它们恰恰是新架构的核心。
    """
    import re

    # 🔴 路径**从已安装的包推导**,不用相对 cwd 的 glob。
    #    实测(2026-08-06 容器构建):`glob.glob("statkit/verbs/*.py")` 在本机绿
    #    (cwd 恰好是 stat-kit 根),而 Dockerfile 里是 `python3 /tmp/stat-kit/run_tests.py`,
    #    cwd 是 `/` ⇒ glob 命中 0 个文件 ⇒ 扫出来的 reason 集合是**空的**,
    #    于是「目录里有死条目」当场假红,而「代码里有卡漏了」会**假绿**。
    #    后者更危险:护栏在最该生效的环境里静默失效。
    import statkit.verbs as _verbs

    vdir = Path(_verbs.__file__).parent
    out: set[str] = set()
    for f in sorted(vdir.glob("*.py")):
        src = f.read_text(encoding="utf-8")
        out |= set(re.findall(r'"reason":\s*"([a-z_]+)"', src))
        out |= set(re.findall(r'sit\.payload\(\s*"([a-z_]+)"', src))
        out |= set(re.findall(r'adv\.check\(\s*"([a-z_]+)"', src))
    return out


def test_every_reason_the_engine_emits_has_a_catalog_entry() -> None:
    """代码里能吐出的每种 reason,目录里都要有 —— 加新情况时漏写文案会当场红。"""
    from statkit import situations as S

    missing = sorted(_reasons_in_code() - set(S.CATALOG))
    assert not missing, (
        f"这些 reason 在代码里会吐出来,但情况目录里没有卡片:{missing}\n"
        f"补进 statkit/situations.py —— 缺文案不会报错,只会让模型对着一个空 payload 猜。"
    )


def test_catalog_has_no_dead_entries() -> None:
    """反向:目录里的每张卡都要真的能被吐出来 —— 死条目会让「使用说明」变成小说。"""
    from statkit import situations as S

    # bundle_not_from_engine 在 report.py 的 BundleSourceError 分支(不是字面量 "reason"),单独豁免
    exempt = {"bundle_not_from_engine"}
    # `retired=True` 的卡片:能力落地后闸被拆掉,引擎不再产出 —— 但卡片刻意留着,
    # 因为 SKILL / 提示词 / 旧会话还会引用它(见 Situation.retired 的说明)。
    retired = {sid for sid, s in S.CATALOG.items() if s.retired}
    dead = sorted(set(S.CATALOG) - _reasons_in_code() - exempt - retired)
    assert not dead, f"目录里这些卡片对应的 reason 代码里已经不存在了:{dead}"

    # 🔴 反向:`retired` 不许当成万能豁免。退役卡必须在正文里**说清自己已经退役**,
    #    否则它和一张过期的卡在读者眼里完全一样 —— 而读者会照着它去建议用户改用 SPSS。
    for sid in sorted(retired):
        s = S.CATALOG[sid]
        assert "退役" in s.title_zh or "已实现" in s.title_zh, (
            f"{sid} 标了 retired,但标题没说明现状:{s.title_zh!r}"
        )


def test_every_situation_card_is_actually_filled_in() -> None:
    """每张卡的五件事都不许空 —— 「有卡片」和「卡片有用」是两回事。"""
    from statkit import situations as S

    # 阈值按字段分开:title 本来就该短(「缺分组列」4 字已经说清了),
    # 而 impact/next 是模型真正要读的两段,太短基本等于没写。
    MIN = {"title_zh": 4, "meaning_zh": 10, "detect_zh": 6, "impact_zh": 15, "next_zh": 15}

    for sid, s in S.CATALOG.items():
        for field, lo in MIN.items():
            v = getattr(s, field)
            assert v, f"{sid}.{field} 为空"
            # `internal=True` 的卡是**引擎自身故障**(参数缺失、注册表不一致、渲染崩)——
            # 它们的 impact 诚实答案就是「无结果」,不会产出静默的错误结论,
            # 而 impact 这个字段的全部意义恰恰是「写清静默的错误结论」。
            # 对这几张只要求非空:硬凑长度只会写出填充文字,而填充文字比短句更没用。
            if not s.internal:
                assert len(v) >= lo, f"{sid}.{field} 太短({len(v)}<{lo}):{v!r}"

        # advisory 归模型决定 ⇒ 必须回答「坚持继续会怎样」「怎么表达这个决定」「决定要怎么披露」
        if s.severity == "advisory":
            for field in ("if_proceed_zh", "accept_key", "disclose_zh"):
                v = getattr(s, field)
                assert v, (
                    f"{sid} 是 advisory(归模型决定),但 {field} 是空的 —— "
                    f"「模型优先」的完整形态是「引擎给全信息 → 模型决定 → 决定被披露」,"
                    f"缺任一环都会让决定变成静默的。"
                )
            assert not s.internal, f"{sid}:advisory 不该同时是 internal"

    # internal 是逃逸口,数量要可见。超过一半就说明分类出了问题,而不是卡片确实都很技术性。
    n_internal = sum(1 for s in S.CATALOG.values() if s.internal)
    assert n_internal <= len(S.CATALOG) // 2, (
        f"{n_internal}/{len(S.CATALOG)} 张卡被标成 internal —— "
        f"这个标志是给引擎自身故障留的逃逸口,不是用来绕过「把卡写满」的。"
    )


def test_payload_shape_is_uniform_so_the_model_only_learns_it_once() -> None:
    """payload 形状统一 —— 模型只需要学一次。"""
    from statkit import situations as S

    blocking = S.payload("zero_variance", group="甲", value=5.0)
    assert blocking["severity"] == "blocking"
    assert "model_decides" not in blocking
    for k in ("ok", "reason", "title_zh", "why_zh", "impact_zh", "hint_zh"):
        assert k in blocking, k
    assert blocking["group"] == "甲"          # evidence 透传

    adv = S.payload("sentinel_values", hits=[{"group": "甲", "value": 999.0, "count": 2}])
    assert adv["severity"] == "advisory"
    assert adv["model_decides"] is True
    assert adv["accept_key"] == "sentinel_ok"
    assert adv["if_proceed_zh"]
    assert adv["hits"]                        # evidence 透传


# ── 「模型决策优先」的完整链路(2026-08-06 架构调整)────────────────────────────
#
# 产品方向:方法学判断权归模型,引擎是辅助。但**「模型优先」不等于「引擎沉默」** ——
# 完整形态是三段:**引擎给全信息 → 模型决定 → 决定被披露**。
# 缺任一段这个决定就是静默的,而静默的错误决定比引擎替它决定更糟:
# 审稿人拿到一份「共 12 例」的报告,原始数据是 60 例,文里一个字都不提为什么。
#
# 这一族逐段钉住。

def _merged_xlsx(tmp_path: Path) -> Path:
    import numpy as np
    import pandas as pd

    rng = np.random.default_rng(4)
    g = [("干预组" if i < 30 else "对照组") if i % 5 == 0 else None for i in range(60)]
    p = tmp_path / "merged.xlsx"
    pd.DataFrame({"组别": g, "评分": rng.normal(10, 2, 60).round(2)}).to_excel(p, index=False)
    return p


def test_advisory_gives_the_model_everything_it_needs_to_decide(tmp_path: Path) -> None:
    """第一段:引擎给全信息。五件事 + 怎么表达这个决定,一样都不能少。"""
    from statkit.verbs.run import RunError, run_analysis

    try:
        run_analysis(data_path=_merged_xlsx(tmp_path), dv="评分", group="组别", workdir=tmp_path)
    except RunError as e:
        pl = e.payload
        assert pl["severity"] == "advisory" and pl["model_decides"] is True
        # 五件事
        assert pl["title_zh"] and pl["why_zh"] and pl["impact_zh"] and pl["hint_zh"]
        assert pl["if_proceed_zh"], "没说清「坚持继续会怎样」,模型就没法权衡"
        # 怎么表达这个决定 —— 给的是**工具参数名**,不是命令行 flag
        assert pl["accept_key"] == "missing_ok"
        # 实测证据(让模型能自证或反驳,而不是只能信)
        assert pl["worst_column"] == "组别" and pl["structural"] is True
        assert pl["excluded"] == 48 and pl["n_before"] == 60
    else:
        raise AssertionError("advisory 没有把决定权交出来,而是直接放行了")


def test_accepted_advisory_is_recorded_and_disclosed(tmp_path: Path) -> None:
    """第二、三段:模型接受 → 照跑 + 留痕 + **进 Methods 段**。"""
    import json

    from statkit.registry import load_registry
    from statkit.report import get_system, methods_paragraph
    from statkit.verbs.run import run_analysis

    out = run_analysis(data_path=_merged_xlsx(tmp_path), dv="评分", group="组别",
                       workdir=tmp_path, missing_ok=True)
    assert out["ok"], "接受之后应当照常算出结果"

    # ① 回执里带出来 —— 提醒模型「这个决定已经写进 Methods 了」
    assert out["advisories"][0]["id"] == "excessive_exclusion"

    # ② 进 bundle(耐久留痕,事后可复盘)
    b = json.loads((tmp_path / out["bundle_path"]).read_text(encoding="utf-8"))
    a = b["advisories"][0]
    assert a["accepted_via"] == "missing_ok"
    assert a["detail"]["excluded"] == 48

    # ③ 🔴 **进 Methods 段** —— 这一段断了,前两段就白做
    reg = load_registry()
    meth = methods_paragraph(b, get_system("cn-core"), reg.methods[b["method"]],
                             reg.effects.get((b.get("effect") or {}).get("name")))
    assert "48/60" in meth and "剩余 12" in meth, meth

    # ④ 不许重复:advisory 的披露句信息更全,通用缺失句要让位
    assert meth.count("因关键变量缺失被剔除") == 1, f"同一件事说了两遍:\n{meth}"


def test_advisory_is_per_item_not_one_big_force_flag(tmp_path: Path) -> None:
    """接受是**逐项**的 —— 接受 A 不会顺带放行 B。

    刻意不做 `--force` 一把梭:一个开关关掉所有警告,等于把八种性质完全不同的情况
    (缺失编码 / 排版事故 / 读错工作表 / 拆表)压成一个「我知道了」。
    实测教训:`--sentinel-ok` 曾被当成「消除报错的开关」使用,而它本意是「用户确认这是真值」。
    """
    import numpy as np
    import pandas as pd

    from statkit.verbs.run import RunError, run_analysis

    # 同时含:分组标签只差空格(advisory-A) + 999 哨兵值(advisory-B)
    rng = np.random.default_rng(8)
    p = tmp_path / "two.csv"
    pd.DataFrame({
        "组别": ["甲"] * 12 + ["甲 "] * 12,
        "评分": np.r_[rng.normal(10, 2, 11), [999.0], rng.normal(12, 2, 12)].round(2),
    }).to_csv(p, index=False, encoding="utf-8")

    # 只接受 labels_ok → 仍会被 sentinel 拦下(不是被 labels 拦下)
    try:
        run_analysis(data_path=p, dv="评分", group="组别", workdir=tmp_path, labels_ok=True)
    except RunError as e:
        assert e.payload["reason"] == "sentinel_values", (
            f"接受 labels_ok 顺带放行了别的 advisory:{e.payload['reason']}")
    else:
        raise AssertionError("两个 advisory 都被一个开关放行了 —— 逐项留痕失效")


# ══ S7 + S2:契约手术的两条纯防御(2026-08-06)══════════════════════════════════
#
# 这两条是 P1 三族(多组 / 分类 / 信效度)开工前的前置。它们不加能力,
# 只是把两个**在第一张新卡落地当天就会咬人**的洞先堵上。

def test_a_card_without_an_implementation_fails_at_load_time(tmp_path: Path) -> None:
    """🔴 S7:纯 YAML 的方法卡不许骗过加载期。

    实测(2026-08-06):往注册表加一张没有任何实现的 ANOVA 卡 ——
      · `doctor --strict` 输出「6 方法(6 可用)…✅ 全绿」
      · 全部测试 passed
      · 镜像照常构建出来
    然后真实用户第一次命中那条规则,`tst.DISPATCH[method_id]` 是**裸下标** ⇒
    KeyError + 整段 Python traceback 甩给模型。而 run.py 把「用户看到 Python 栈」
    列为一票否决项。

    刺眼的不对称:**前提检验侧**早有完整的 check_not_implemented 校验,
    注释还写着「声明与实现不符是本仓踩过的事故,加载期就该拦住」——
    而**方法侧**在 20 行之外什么都没有。
    """
    import shutil

    from statkit.registry import SchemaError, load_registry

    import statkit

    # 同上:源目录从已安装包推导,不假设 cwd。
    src = Path(statkit.__file__).parent / "cards"
    dst = tmp_path / "cards"
    shutil.copytree(src, dst)
    # ⚠️ id 必须是**真的没有实现**的那个。首版用了 oneway_anova ——
    #    P1 族①落地后它有实现了,这条测试当场变成假绿(加载成功、断言落空)。
    #    换成 two_way_anova(至今未实现),并在下面断言点名它。
    (dst / "methods" / "fake.yaml").write_text(
        "methods:\n"
        "  - id: two_way_anova\n"
        "    name_zh: 双因素方差分析\n"
        "    name_en: Two-way ANOVA\n"
        "    family: multi_group\n"
        '    engine: "lib:scipy.stats.f_oneway"\n'
        "    group_levels: {min: 3, max: null}\n"
        "    golden: [\"R:stats::aov\"]\n",
        encoding="utf-8")

    try:
        load_registry(dst)
    except SchemaError as e:
        assert "two_way_anova" in str(e)
        assert "DISPATCH" in str(e), "回执要说清是「没有实现」而不是别的加载错误"
    else:
        raise AssertionError("纯 YAML 的方法卡骗过了加载期 —— 首次真跑会给用户 Python 栈")


def test_arity_lives_on_the_card_not_in_the_main_flow() -> None:
    """🔴 S2:每张方法卡都要声明自己吃几个水平、是不是配对。

    此前这条约束只活在 `run.py` 的一行硬编码里(`if len(arrays) != 2`),
    而卡片对自己的 arity **一个字都没说**。那一行在第一条正确的 ANOVA 规则落地当天失效:
    新规则不含 `two_groups`,绕过现有 6 条规则那道「第二道闸」,
    而主流程仍只解包前两组、仍以两参调用。
    """
    from statkit.registry import load_registry

    reg = load_registry()
    for mid, m in reg.methods.items():
        lo, hi = m.group_levels
        assert lo >= 1 and (hi is None or hi >= lo), f"{mid}: group_levels 非法 {m.group_levels}"
        assert m.units in ("independent", "paired"), f"{mid}: units 非法 {m.units}"

    # 定点:配对族与独立族的 units 必须分开(它同时是 report 成句的分流依据)
    assert reg.methods["paired_t"].units == "paired"
    assert reg.methods["wilcoxon"].units == "paired"
    assert reg.methods["student_t"].units == "independent"
    assert reg.methods["welch_t"].units == "independent"
    assert reg.methods["mann_whitney"].units == "independent"


def test_group_levels_defaults_to_exactly_two_not_unlimited() -> None:
    """缺省是 (2,2) 而不是「不限」—— 这是**刻意的摩擦**。

    默认放宽等于让新卡在「没人显式想过 arity」的情况下被当成 k 组可用,
    而那正是要防的事。加 ANOVA 卡的人必须写一句 `group_levels: {min: 3, max: null}`。
    """
    from statkit.registry.schema import parse_method

    m = parse_method({"id": "x", "name_zh": "x", "name_en": "x", "family": "f",
                      "engine": "lib:scipy.stats.ttest_ind", "golden": ["r"]})
    assert m.group_levels == (2, 2)
    assert m.units == "independent"
    assert m.accepts_levels(2) and not m.accepts_levels(3) and not m.accepts_levels(1)

    m3 = parse_method({"id": "x", "name_zh": "x", "name_en": "x", "family": "f",
                       "engine": "e", "golden": ["r"], "group_levels": {"min": 3, "max": None}})
    assert m3.accepts_levels(3) and m3.accepts_levels(9) and not m3.accepts_levels(2)


def test_arity_mismatch_is_caught_after_routing_not_silently_truncated(tmp_path: Path) -> None:
    """🔴 卡片声明与实际分组数不符时,当场拒 —— 而不是静默取前两组。

    这是 S2 的**纵深**:它挡的不是用户数据,是**注册表配置缺陷**
    (一张声称吃 3 组的卡被路由到只会两参调用的实现上)。
    实测过的后果:`ok:true / df:22.0`(只用了 24 例)而 `n.by_group` 记着 36 例,
    reports_required 全过、数字锁不报、degraded 为 null。
    """
    import dataclasses

    import pandas as pd

    from statkit.registry import load_registry
    from statkit.verbs.run import RunError, run_analysis

    reg = load_registry()
    # 把 student_t 的卡改成「只吃 3 组以上」—— 模拟规则与卡片 arity 不一致
    reg.methods["student_t"] = dataclasses.replace(
        reg.methods["student_t"], group_levels=(3, None))

    p = tmp_path / "d.csv"
    pd.DataFrame({
        "组别": ["甲"] * 12 + ["乙"] * 12,
        "评分": [5.1, 5.4, 4.9, 5.3, 5.0, 5.2, 5.5, 4.8, 5.6, 5.05, 5.25, 5.35,
                 6.2, 6.5, 6.0, 6.4, 6.1, 6.3, 6.6, 5.9, 6.7, 6.15, 6.35, 6.45],
    }).to_csv(p, index=False, encoding="utf-8")

    try:
        run_analysis(data_path=p, dv="评分", group="组别", workdir=tmp_path, reg=reg)
    except RunError as e:
        assert e.payload["reason"] == "method_arity_mismatch", e.payload["reason"]
        assert e.payload["n_groups"] == 2 and e.payload["group_levels"] == [3, None]
        assert "静默" in e.payload["impact_zh"] or "对不上" in e.payload["impact_zh"]
    else:
        raise AssertionError("卡片 arity 与实际分组数不符,却照常算出了结果")


def test_units_mismatch_is_caught(tmp_path: Path) -> None:
    """配对数据被路由到独立样本方法(或反之)时当场拒 —— 自由度与效应量分母全不同。"""
    import dataclasses

    from statkit.registry import load_registry
    from statkit.verbs.run import RunError, run_analysis

    reg = load_registry()
    reg.methods["paired_t"] = dataclasses.replace(
        reg.methods["paired_t"], units="independent")

    pre = [8.9, 9.1, 8.8, 9.4, 8.2, 9.0, 8.7, 9.3, 8.9, 8.6, 9.2, 8.4]
    post = [7.6, 8.5, 8.0, 8.3, 7.9, 8.1, 7.9, 8.7, 8.0, 7.5, 8.4, 7.7]
    import pandas as pd
    rows = []
    for i, (a, b) in enumerate(zip(pre, post), 1):
        rows += [{"id": f"S{i}", "时点": "前", "值": a}, {"id": f"S{i}", "时点": "后", "值": b}]
    p = tmp_path / "d.csv"
    pd.DataFrame(rows).to_csv(p, index=False, encoding="utf-8")

    try:
        run_analysis(data_path=p, dv="值", group="时点", subject="id",
                     paired=True, workdir=tmp_path, reg=reg)
    except RunError as e:
        assert e.payload["reason"] == "method_units_mismatch", e.payload["reason"]
    else:
        raise AssertionError("配对数据被路由到独立样本方法,却照常算出了结果")


# ══ P1 族①:多组比较 + 事后 + 字母标记(2026-08-06)════════════════════════════
#
# 这一族是**全场唯一竞品都没有的能力**(调研称 CLD 是「GraphPad Prism 留的结构性空白」),
# 也是关掉最严重正确性泄漏通道的那一步:此前引擎拒绝三组比较之后,
# 模型的三条出路(拆成两两 / Bash 跑 scipy / 自造 a/ab/b 字母)全部绕过引擎。

def _three_group_csv(tmp_path: Path, seed: int = 20260806, sds=(1, 1, 1)) -> Path:
    import numpy as np
    import pandas as pd

    rng = np.random.default_rng(seed)
    p = tmp_path / "x.csv"
    pd.DataFrame({
        "处理": ["N0"] * 10 + ["N150"] * 10 + ["N300"] * 10,
        "产量": np.r_[rng.normal(5, sds[0], 10), rng.normal(6, sds[1], 10),
                      rng.normal(9, sds[2], 10)].round(2),
    }).to_csv(p, index=False, encoding="utf-8")
    return p


def test_games_howell_reduces_to_welch_t_at_two_groups() -> None:
    """🔴 **金标**:k=2 时 Games-Howell 与 Welch t 检验精确一致。

    Games-Howell 是自写的(发布版 scikit-posthocs 没有该函数,只在 GitHub master),
    所以它必须有一个**外部**校验点。这条恒等式就是:studentized range 在 k=2 时
    精确退化为 t 分布,于是 GH 的 p 值应当**逐位等于** scipy 的 Welch t。

    它同时钉住两个最容易写错的地方:
      · q 的分母是 se/√2 而不是 se(studentized range 的定义带 √2);
      · k 取**总组数**而不是 2 —— 多重性正是靠 k 进入分布,写死 2 会让 p 系统性偏小且不报错。
    """
    import numpy as np
    from scipy import stats

    from statkit.engines import posthoc as ph

    rng = np.random.default_rng(31)
    a, b = rng.normal(10, 2, 15), rng.normal(12, 5, 21)
    gh = ph.games_howell({"A": a, "B": b}).pairs[0]
    welch = stats.ttest_ind(a, b, equal_var=False)
    assert abs(gh["p_adj"] - float(welch.pvalue)) < 1e-12, (
        f"k=2 时 GH({gh['p_adj']}) 应等于 Welch t({float(welch.pvalue)})")
    assert abs(gh["df"] - float(welch.df)) < 1e-9, "Welch–Satterthwaite 自由度也应一致"


def test_multiplicity_enters_through_k_not_hardcoded_two() -> None:
    """组数越多越保守 —— 多重性靠 k 进入 studentized range,写死 2 就退化成两两 Welch t。"""
    import numpy as np

    from statkit.engines import posthoc as ph

    rng = np.random.default_rng(33)
    g2 = {"A": rng.normal(10, 2, 12), "B": rng.normal(12, 2, 12)}
    g4 = {**g2, "C": rng.normal(11, 2, 12), "D": rng.normal(13, 2, 12)}
    p2 = ph.games_howell(g2).pairs[0]["p_adj"]
    p4 = [x for x in ph.games_howell(g4).pairs if {x["a"], x["b"]} == {"A", "B"}][0]["p_adj"]
    assert p4 > p2, f"4 组下同一对应当更保守:{p4} vs {p2}"


def test_cld_shares_letters_exactly_when_not_significant(tmp_path: Path) -> None:
    """字母标记的正确性判据只有一条:**共享字母 ⇔ 差异不显著**。

    这是 CLD 最容易错的地方(传递性:A~B、B~C 但 A≠C 时字母怎么分配),
    而错了不会报错 —— 只会让三线表的结论悄悄变形。所以逐对交叉验证,不看具体字母是什么。
    """
    import json

    from statkit.verbs.run import run_analysis

    out = run_analysis(data_path=_three_group_csv(tmp_path), dv="产量", group="处理",
                       workdir=tmp_path)
    b = json.loads((tmp_path / out["bundle_path"]).read_text(encoding="utf-8"))
    cld = {k: set(str(v).strip()) for k, v in b["cld"].items()}
    for pair in b["posthoc"]:
        shared = bool(cld[pair["a"]] & cld[pair["b"]])
        not_sig = pair["p_adj"] >= 0.05
        assert shared == not_sig, (
            f"{pair['a']}/{pair['b']}:p_adj={pair['p_adj']:.4f} 但共享字母={shared} —— "
            f"CLD 与事后 p 值不一致,三线表的结论会与正文打架")


def test_multi_group_report_says_each_group_not_two_groups(tmp_path: Path) -> None:
    """多组报告不许写「两组」,F 检验必须给两个自由度,事后与字母标记必须进 Results。"""
    import json

    from statkit.registry import load_registry
    from statkit.report import get_system, methods_paragraph, results_sentence
    from statkit.verbs.run import run_analysis

    out = run_analysis(data_path=_three_group_csv(tmp_path), dv="产量", group="处理",
                       workdir=tmp_path)
    b = json.loads((tmp_path / out["bundle_path"]).read_text(encoding="utf-8"))
    reg = load_registry()
    sysspec = get_system("cn-core")
    m = reg.methods[b["method"]]
    eff_card = reg.effects.get((b.get("effect") or {}).get("name"))
    res = results_sentence(b, sysspec, m, eff_card)
    meth = methods_paragraph(b, sysspec, m, eff_card)

    assert "两组" not in res, f"三组报告写了「两组」:{res}"
    assert "各组" in res, res
    # F 检验要 F(df1, df2)
    if b.get("df2") is not None:
        assert f"{b['df']:.0f}, " in res or ", " in res.split("(")[-1], res
    # 事后与字母标记必须出现在 Results —— 它们是结论本身,不是附录
    assert "事后两两比较" in res, res
    assert "共享同一字母" in res, res
    # Methods 要写明用了哪种事后与校正(SAMPL 必报项)
    assert "两两比较采用" in meth, meth

    # k>2 时不许出现单个方向词:「谁高于谁」不是一句话能说完的,结论在字母标记里
    assert "高于" not in res.split("事后")[0], f"多组报告写了单个方向词:{res}"


def test_multi_group_table_has_a_letter_column_and_a_note(tmp_path: Path) -> None:
    """三线表要多一列字母标记,并且**必须有表注解释它** —— 一列 a/ab/b 不加说明读者看不懂。"""
    import glob
    import json
    import re
    import zipfile

    from statkit.verbs.report import run_report
    from statkit.verbs.run import run_analysis

    out = run_analysis(data_path=_three_group_csv(tmp_path), dv="产量", group="处理",
                       workdir=tmp_path)
    run_report(bundle_path=tmp_path / out["bundle_path"], system_id="cn-core", workdir=tmp_path)

    docx = glob.glob(str(tmp_path / "out" / "三线表_*中文核心期刊*.docx"))[0]
    xml = zipfile.ZipFile(docx).read("word/document.xml").decode()
    rows = [[
        "".join(re.findall(r"<w:t[^>]*>([^<]*)</w:t>", c))
        for c in re.findall(r"<w:tc>.*?</w:tc>", r, re.S)
    ] for r in re.findall(r"<w:tr[ >].*?</w:tr>", xml, re.S)]

    assert len(rows[0]) == 5, f"多组表应有 5 列(多一列字母标记),实得 {rows[0]}"
    assert "字母标记" in rows[0], rows[0]
    b = json.loads((tmp_path / out["bundle_path"]).read_text(encoding="utf-8"))
    letters = {r[0]: r[3] for r in rows[1:] if r[0] in b["cld"]}
    assert letters == {g: str(v).strip() for g, v in b["cld"].items()}, letters

    paras = ["".join(re.findall(r"<w:t[^>]*>([^<]*)</w:t>", p))
             for p in re.findall(r"<w:p[ >].*?</w:p>", xml, re.S)]
    note = next(q for q in paras if q.startswith("注"))
    assert "共享相同字母" in note, note
    assert note.count("注:") == 1, f"表注黏了两个「注:」:{note}"
    assert "各组" in paras[0], f"多组表题应写「各组」:{paras[0]}"


def test_continuous_is_inferred_from_data_not_a_literal(tmp_path: Path) -> None:
    """🔴 S5:`continuous` 必须是**从数据推断**的,不是字面量 True。

    ## 这条测试终于有端到端判据了(2026-08-07)

    上一版是一条**机制断言**,而且它自陈了原因:做完 S5 后跑变异验证,把
    `"continuous"` 改回 `True`,**145 条全绿** —— 因为当时没有任何规则引用
    `not continuous`,分类结局在事实求值之前就被 `binary_outcome` 挡掉了。
    当时的处置是如实钉住机制、写清它还验不了,并留下一句:
    「分类族落地后,这条应当被一条真正的行为测试取代」。

    分类族已落地,那句话现在兑现:同一份数据,`continuous` 为真走 t 检验族、
    为假走卡方族 —— 把它改回字面量 `True`,下面第二段会当场变红。
    """
    import json

    import numpy as np
    import pandas as pd

    from statkit.verbs.run import run_analysis

    # ① 连续:取值个数远大于 2 → 两组族
    p1 = tmp_path / "cont.csv"
    rng = np.random.default_rng(1)
    pd.DataFrame({"组": ["甲"] * 12 + ["乙"] * 12,
                  "值": np.r_[rng.normal(10, 2, 12), rng.normal(12, 2, 12)].round(3)}
                 ).to_csv(p1, index=False, encoding="utf-8")
    out1 = run_analysis(data_path=p1, dv="值", group="组", workdir=tmp_path)
    b = json.loads((tmp_path / out1["bundle_path"]).read_text(encoding="utf-8"))
    assert b["decision"]["rule"].startswith("D-0"), b["decision"]
    assert out1["method"] in {"student_t", "welch_t", "mann_whitney"}, out1["method"]

    # ② 同样两组、同样列名,只把因变量换成两水平 → 分类族。
    #    `continuous` 若变回字面量 True,这一段会路由到 t 检验并在此变红。
    p2 = tmp_path / "cat.csv"
    pd.DataFrame({"组": ["甲"] * 20 + ["乙"] * 20,
                  "值": ["有效"] * 16 + ["无效"] * 4 + ["有效"] * 8 + ["无效"] * 12}
                 ).to_csv(p2, index=False, encoding="utf-8")
    out2 = run_analysis(data_path=p2, dv="值", group="组", workdir=tmp_path)
    assert out2["rule"] in {"D-10", "D-11"}, out2["rule"]
    assert out2["method"] not in {"student_t", "welch_t", "mann_whitney"}, out2["method"]

    # 机制侧仍钉一句(便宜):不许出现写死的 True。
    import inspect

    from statkit.verbs import run as run_mod

    src = inspect.getsource(run_mod.run_analysis)
    assert '"continuous": True' not in src, "continuous 又变回字面量了"


def test_vocabulary_declares_where_each_fact_comes_from() -> None:
    """每条事实都要写清来源:profile(数据画像)/ consult(问诊)/ check(实测)。

    `continuous` 从 consult 改成 profile 是 S5 的核心 —— 它此前被标成「问诊得来」,
    而实现里是个写死的 True,两边都不对。
    """
    from statkit.core.facts import VOCABULARY

    by = {f.name: f for f in VOCABULARY}
    assert by["continuous"].source == "profile", "continuous 现在来自数据画像,不是问诊"
    assert by["multi_group"].source == "profile"
    assert by["balanced"].source == "profile"
    for f in VOCABULARY:
        assert f.source in ("profile", "consult", "check"), f"{f.name}: 来源 {f.source!r} 非法"
        assert f.introduced_by, f"{f.name}: 没写 introduced_by"


def test_tests_do_not_depend_on_the_current_working_directory() -> None:
    """🔴 测试不许假设 cwd —— 否则护栏会在**最该生效的环境里**静默失效。

    实测(2026-08-06 容器构建):两条我刚写的护栏用了相对 cwd 的路径
    (`glob.glob("statkit/verbs/*.py")` 与 `Path("statkit/cards")`)。
    本机绿(cwd 恰好是 stat-kit 根),而 Dockerfile 里是
    `python3 /tmp/stat-kit/run_tests.py`,cwd 是 `/` ⇒

      · `test_catalog_has_no_dead_entries` **假红**(扫不到文件 ⇒ 以为全是死条目);
      · `test_every_reason_the_engine_emits_has_a_catalog_entry` **假绿**
        (reason 集合是空的 ⇒ 差集恒为空 ⇒ 漏写卡片永远抓不到)。

    后者才是真正危险的:构建期闸看起来全绿,而它守的东西一条都没在守。
    正解是从**已安装包的位置**推导路径(`Path(statkit.__file__).parent`),
    这条测试把它钉住 —— 扫源码里有没有相对路径字面量。
    """
    import re

    import statkit.verbs as _verbs

    tdir = Path(__file__).parent
    bad: list[str] = []
    # 🔴 用 **AST** 而不是扫文本。
    #
    #    我在这一轮里为「扫源码的规则」撞了**三次**同一个形态
    #    (statkitPaths.test.ts、artifacts.test.ts,以及本条的前两版):
    #    规则把自己的解释文字判成违规(假红),或者反过来被注释里的字样蒙混(假绿)。
    #    每次的修法都是「再补一条剥注释的正则」—— 而正则永远追不上文本的花样
    #    (行内注释、文档串、嵌套引号、注释里含 `"""`……)。
    #
    #    AST 从根上解决:注释与文档串**对语法树不可见**,不需要剥。
    #    判据也更准 —— 找的是「以 statkit/ 开头的字符串**实参**」,
    #    而不是「源码里出现过这串字符」。
    for f in sorted(tdir.glob("test_*.py")):
        tree = ast.parse(f.read_text(encoding="utf-8"), filename=str(f))
        for node in ast.walk(tree):
            if not isinstance(node, ast.Call):
                continue
            fn = node.func
            name = (fn.attr if isinstance(fn, ast.Attribute)
                    else fn.id if isinstance(fn, ast.Name) else "")
            if name not in ("glob", "iglob", "Path", "open", "read_text", "copytree"):
                continue
            for a in node.args:
                if isinstance(a, ast.Constant) and isinstance(a.value, str) \
                        and a.value.startswith("statkit/"):
                    bad.append(f"{f.name}:{a.lineno}: {name}({a.value!r})")
    assert not bad, (
        "这些地方用了相对 cwd 的路径,换个工作目录就会静默失效:\n  "
        + "\n  ".join(bad)
        + "\n改成从已安装包推导:`Path(statkit.__file__).parent / ...`"
    )
    # 锚点:确认包位置推导本身是可用的(否则本测试也只是一条空规则)
    assert (Path(_verbs.__file__).parent / "run.py").exists()


# ── S4:前提检验的相位与作用对象(2026-08-06,只埋字段)────────────────────────
#
# 审计:「前提检验只有 pre 相位,签名固定。回归族的核心前提 —— 残差正态、异方差、VIF、
# 比例风险 —— **全部是 post-fit**,而主流程里没有任何位置可以放它们。
# 这是所有不足里唯一一条『不做手术就完全做不了』的。」
#
# 现在只埋字段:手术的形状取决于第一个真正用到它的族
# (post 检验不满足要不要**复判换方法**?复判会牵动 spec_hash 的语义)。
# 在没有真实 post-fit 检验之前定这个,是在猜。

def test_check_cards_declare_what_they_check_and_when() -> None:
    """三张既有卡零改动即可(缺省 pre/dv),而配对那张显式标了 on: diff。"""
    from statkit.registry import load_registry

    reg = load_registry()
    for cid, c in reg.checks.items():
        assert c.phase == "pre", f"{cid}: 今天不该有 post_fit 的卡"
        assert c.target in ("dv", "diff", "table", "residuals", "model"), f"{cid}: target={c.target!r}"
    # 配对差值的正态性检的是**差值**,不是原始因变量 ——
    # 这个区别此前只活在实现里(它取 diff 参数),卡片上看不出来。
    assert reg.checks["shapiro_diff"].target == "diff"
    assert reg.checks["shapiro_by_group"].target == "dv"


def test_post_fit_phase_is_refused_loudly_not_silently_ignored() -> None:
    """🔴 字段埋好了但相位没做 —— 写了 `phase: post_fit` 的卡必须**当场拒**。

    静默接受再忽略它,就是又一条「造好没接线」:
    写卡的人以为那个检验在跑,而主流程里根本没有它的位置。
    本仓这个形态已经咬过多次(StatReport 工具不存在而 skill 让模型调它;
    信号量写在注释里而代码没有;Welch 换了效应量而 tests.py 还调旧的)。
    """
    from statkit.registry import SchemaError
    from statkit.registry.schema import parse_check

    base = {"id": "x", "name_zh": "x", "engine": "lib:scipy.stats.shapiro"}
    # pre 正常
    assert parse_check({**base, "phase": "pre"}).phase == "pre"
    # post_fit 当场拒,且回执要说清为什么
    try:
        parse_check({**base, "phase": "post_fit", "target": "residuals"})
    except SchemaError as e:
        assert "尚未实现" in str(e)
        assert "spec_hash" in str(e) or "回归" in str(e), "要说清它为什么还没做,而不是只说不行"
    else:
        raise AssertionError("phase: post_fit 被静默接受了 —— 那张卡永远不会跑,而没人知道")

    # on 的取值域也要守住
    try:
        parse_check({**base, "target": "whatever"})
    except SchemaError as e:
        assert "target 非法" in str(e)
    else:
        raise AssertionError("target 接受了取值域外的值")

    # 老字段名要当场拒,不许静默忽略 —— 否则改名会制造一批「写了不生效」的卡
    try:
        parse_check({**base, "on": "diff"})
    except SchemaError as e:
        assert "已改名为 `target`" in str(e)
    else:
        raise AssertionError("老字段名 `on` 被静默忽略了")


def test_yaml_boolish_keys_are_refused_at_load_time(tmp_path: Path) -> None:
    """🔴 YAML 1.1 把裸词 on/off/yes/no 当布尔 —— 这一类必须在加载期拦住。

    实测(2026-08-06,S4 落地时踩到):卡片里写 `on: diff`,PyYAML 把**键** `on`
    解析成布尔 `True`,字段变成 `{True: "diff"}`;`raw.get("on")` 取到 None,
    默认值静默生效 —— **卡片上白纸黑字写着,而引擎完全没看见**。

    这个坑的形态与 schema.py 里那条「新增字段必须显式取,漏取会静默回落」是同一类,
    而且更阴:那一条至少在代码里能看见,这一条在**卡片和代码都看起来正确**的情况下失效。
    症状是「声明与行为不符」—— 本仓最贵的一类 bug。
    """
    import shutil

    import statkit
    from statkit.registry import SchemaError, load_registry

    dst = tmp_path / "cards"
    shutil.copytree(Path(statkit.__file__).parent / "cards", dst)
    # 裸 on: —— 会被 YAML 解析成布尔键
    (dst / "checks" / "boolish.yaml").write_text(
        "checks:\n"
        "  - id: bad_check\n"
        "    name_zh: 坏卡\n"
        '    engine: "lib:scipy.stats.shapiro"\n'
        "    on: diff\n",
        encoding="utf-8")
    try:
        load_registry(dst)
    except SchemaError as e:
        assert "布尔" in str(e), str(e)
        assert "加引号" in str(e), "回执要直接给修法,不然下一个人还得自己查 YAML 规范"
    else:
        raise AssertionError("裸 `on:` 键被静默接受了 —— 那个字段写了不生效且不报错")


def test_target_field_actually_reaches_the_card() -> None:
    """反向:卡片写的 `target: diff` 必须真的生效(否则上面那条只是挡了个寂寞)。

    字段名从 `on` 改成 `target`(2026-08-07)正是为了不必每次加引号 ——
    YAML 1.1 会把裸 `on` 当布尔键,而 `target` 不在那张布尔词表里。
    """
    from statkit.registry import load_registry

    assert load_registry().checks["shapiro_diff"].target == "diff"


# ── 多组族的两处回归(2026-08-06,设计红队实测抓到)──────────────────────────────
#
# 这两条都是**多组族落地时逃过测试覆盖面**的 bug。共同根因:
# 加新族时我扩了「新族能不能跑」的测试,却没扩「既有的交付保证在新族上还成不成立」。
#   · 复现脚本的测试只跑两组与配对(`test_reproduction_script_actually_runs_on_awkward_inputs`);
#   · 多组端到端的测试**从不调 run_report**(`test_multigroup_is_now_supported_end_to_end`)。
# 两条测试各自都绿,而它们中间那块地没人管。

def test_reproduction_script_feeds_all_groups_not_just_the_first_two(tmp_path: Path) -> None:
    """🔴 多组的复现脚本必须喂**全部**组,并真的跑通。

    实测事故:3 组数据生成的脚本是
        g0 = ...; g1 = ...          ← 只取了前两组
        res = stats.f_oneway(g0, g1)
        assert abs(stat - 34.09) < 1e-8   ← 而报告里是 3 组的 F
    真跑:「AssertionError:复算 10.537,报告 34.093」——
    **一份主动向审稿人声明「报告的数字复现不出来」的脚本**,比不给更糟。
    """
    import subprocess
    import sys

    from statkit.verbs.report import run_report
    from statkit.verbs.run import run_analysis

    out = run_analysis(data_path=_three_group_csv(tmp_path), dv="产量", group="处理",
                       workdir=tmp_path)
    run_report(bundle_path=tmp_path / out["bundle_path"], system_id="cn-core", workdir=tmp_path)

    scripts = list((tmp_path / "out").glob("复现脚本_*.py"))
    if not scripts:
        # welch_anova 是 own: 实现,按设计不生成脚本(几行 scipy 复现不了)——
        # 那是**诚实的**:宁可不给,也不给一个跑不通的。
        assert out["method"] == "welch_anova", f"{out['method']} 应当生成复现脚本却没有"
        return

    src = scripts[0].read_text(encoding="utf-8")
    k = len(_json_bundle(tmp_path, out)["groups"])
    assert src.count("to_numpy(float)") == k, f"脚本只取了部分组:\n{src[:600]}"
    for i in range(k):
        assert f"g{i}" in src, f"缺第 {i} 组"

    local = tmp_path / scripts[0].name
    local.write_text(src, encoding="utf-8")
    r = subprocess.run([sys.executable, local.name], cwd=tmp_path,
                       capture_output=True, text=True, timeout=180)
    assert r.returncode == 0, f"多组复现脚本跑不通:\n{r.stdout[-600:]}\n{r.stderr[-600:]}"
    assert "完全一致" in r.stdout, r.stdout[-400:]


def _json_bundle(tmp_path: Path, out: dict) -> dict:
    import json

    return json.loads((tmp_path / out["bundle_path"]).read_text(encoding="utf-8"))


def test_three_line_borders_cover_every_column(tmp_path: Path) -> None:
    """🔴 三线表的三条线必须覆盖**所有**列 —— 包括多组表多出来的那一列。

    实测事故:`report.py` 上方按数据形状算出 `ncols = 5 if cld else 4`,
    而画边框前又写死 `ncols = 4` 把它盖回去 ⇒ 多组表的**最右列(F 值 / P 值)三条边全空**。
    症状轻(看起来少一条线),但三线表的**全部定义**就是这三条线 —— 期刊排版要求。
    根因是同一个函数里对同一个量算了两次。
    """
    import glob
    import re
    import zipfile

    from statkit.verbs.report import run_report
    from statkit.verbs.run import run_analysis

    out = run_analysis(data_path=_three_group_csv(tmp_path), dv="产量", group="处理",
                       workdir=tmp_path)
    run_report(bundle_path=tmp_path / out["bundle_path"], system_id="cn-core", workdir=tmp_path)
    xml = zipfile.ZipFile(glob.glob(str(tmp_path / "out" / "三线表_*中文核心期刊*.docx"))[0]
                          ).read("word/document.xml").decode()
    rows = re.findall(r"<w:tr[ >].*?</w:tr>", xml, re.S)
    head = re.findall(r"<w:tc>.*?</w:tc>", rows[0], re.S)
    last = re.findall(r"<w:tc>.*?</w:tc>", rows[-1], re.S)
    assert len(head) == 5, f"多组表应 5 列,实得 {len(head)}"
    for i, c in enumerate(head):
        b = re.findall(r"<w:(top|bottom)\b", c)
        assert "top" in b and "bottom" in b, f"表头第 {i} 列缺框线:{b}"
    for i, c in enumerate(last):
        assert "bottom" in re.findall(r"<w:(top|bottom)\b", c), f"末行第 {i} 列缺底线"


# ── C8:advisory 的 accept 通道必须真的存在(2026-08-07)────────────────────────
#
# 🔴 实测发现的三条**断路**:
#     accept_key      卡片                        run_analysis 形参 / CLI / StatRun
#     sheet           multiple_sheets(advisory)   ❌ ❌ ❌
#     accept_method   not_in_allowlist(advisory)  ❌ ❌ ❌
#     accept_method   no_rule_matched(advisory)   ❌ ❌ ❌
#
# 而 StatRun 的 description 明确让模型去 `statkit situations --json` 查目录 ——
# **那份目录正在告诉模型传三个会被静默丢弃的参数**。
# 一张承诺了不存在通道的 advisory 卡,比标成硬拒更糟:模型会照做,然后什么都没发生,
# 而它不知道为什么。
#
# 处置:`sheet` 真接线;两张 `accept_method` 降回 capability(如实说明现状,
# 「要不要真开这个通道」是产品决定 —— 它等于让模型越过实测前提选方法)。

def test_every_advisory_accept_key_is_actually_acceptable() -> None:
    """每个 advisory 的 accept_key 都要能被 `run_analysis` 与 CLI 真的收下。"""
    import inspect
    import re

    from statkit import situations as S
    from statkit.verbs import run as R

    params = set(inspect.signature(R.run_analysis).parameters)
    src = inspect.getsource(R)
    cli_names = (set(re.findall(r'"([a-z-]+)" in flags', src))
                 | set(re.findall(r'opts\.get\("([a-z-]+)"', src)))

    broken: list[str] = []
    for s in S.CATALOG.values():
        if s.severity != "advisory":
            continue
        assert s.accept_key, f"{s.id}: advisory 必须有 accept_key"
        if s.accept_key not in params:
            broken.append(f"{s.id}: run_analysis 没有形参 {s.accept_key!r}")
        # CLI 的 flag 名是形参名把下划线换成连字符
        if s.accept_key.replace("_", "-") not in cli_names:
            broken.append(f"{s.id}: CLI 不解析 --{s.accept_key.replace('_', '-')}")
    assert not broken, (
        "这些 advisory 承诺的接受通道**不存在** —— 模型会照着目录传参数,然后被静默丢弃:\n  "
        + "\n  ".join(broken)
    )


def test_no_card_promises_a_channel_it_does_not_have() -> None:
    """反向:非 advisory 的卡**不许**带 accept_key —— 那同样是承诺一个不存在的动作。"""
    from statkit import situations as S

    bad = [s.id for s in S.CATALOG.values() if s.severity != "advisory" and s.accept_key]
    assert not bad, f"这些卡不是 advisory 却带了 accept_key:{bad}"


def test_sheet_accept_path_actually_selects_the_sheet(tmp_path: Path) -> None:
    """`sheet` 通道的行为测试 —— 光有形参不算接线,要真的选中那张表。"""
    import pandas as pd

    from statkit.verbs.run import RunError, run_analysis

    p = tmp_path / "multi.xlsx"
    with pd.ExcelWriter(p) as w:
        pd.DataFrame({"组": ["甲"] * 12 + ["乙"] * 12,
                      "值": [1.0, 1.2, 0.9, 1.1, 1.05, 1.15, 1.3, 0.95, 1.25, 1.02, 1.18, 1.08,
                             2.0, 2.2, 1.9, 2.1, 2.05, 2.15, 2.3, 1.95, 2.25, 2.02, 2.18, 2.08]}
                     ).to_excel(w, sheet_name="咸味强度", index=False)
        pd.DataFrame({"组": ["甲"] * 12 + ["乙"] * 12,
                      "值": [5.0, 5.2, 4.9, 5.1, 5.05, 5.15, 5.3, 4.95, 5.25, 5.02, 5.18, 5.08,
                             9.0, 9.2, 8.9, 9.1, 9.05, 9.15, 9.3, 8.95, 9.25, 9.02, 9.18, 9.08]}
                     ).to_excel(w, sheet_name="总体喜好度", index=False)

    # ① 不指定 → advisory 拦住,并告诉模型该传什么
    try:
        run_analysis(data_path=p, dv="值", group="组", workdir=tmp_path)
    except RunError as e:
        assert e.payload["reason"] == "multiple_sheets"
        assert e.payload["severity"] == "advisory"
        assert e.payload["accept_key"] == "sheet"
        assert "咸味强度" in e.payload["sheets"] and "总体喜好度" in e.payload["sheets"]
    else:
        raise AssertionError("多工作表没被拦下 —— 会静默分析第一个")

    # ② 指定 → 真的分析那一张(用两张表判然不同的均值来验)
    out = run_analysis(data_path=p, dv="值", group="组", workdir=tmp_path, sheet="总体喜好度")
    import json
    b = json.loads((tmp_path / out["bundle_path"]).read_text(encoding="utf-8"))
    assert b["descriptives"]["甲"]["mean"] > 4.5, "选错了工作表(拿到的是咸味强度那张)"
    assert b["spec"]["read_kwargs"]["sheet_name"] == "总体喜好度", "选了哪张表必须留痕"

    # ③ 名字不存在 → blocking,并把可选清单给出来
    try:
        run_analysis(data_path=p, dv="值", group="组", workdir=tmp_path, sheet="不存在的表")
    except RunError as e:
        assert e.payload["reason"] == "sheet_not_found"
        assert "总体喜好度" in e.payload["sheets"]
    else:
        raise AssertionError("不存在的工作表名被接受了")
