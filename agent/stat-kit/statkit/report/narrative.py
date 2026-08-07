"""Methods / Results 段生成 —— **模板插值,不是自由生成**。

## 架构约束落在这里

模型只写骨架与定性语境;**每一个数字都由本模块从 bundle 取值填模板**。
这不是「加个校验」,是架构约束:文字里的数字物理上不经模型手。

## 这一格为什么值钱

调研结论:三家国际大厂(IBM SPSS AI Output Assistant / Minitab AI / JMP Assistant)
在 2025Q4–2026Q1 **同时**押注「把已跑出的结果翻译成人话」而不是「帮你跑」——
三家独立公司、同一时间窗收敛到同一结论,是整份调研里最强的单一需求信号。

而免费玩家(JASP/jamovi)虽然能「表直出 Word」,**只出 APA 英文表、不产 Methods 段**。
仍然空着的三格是:**中文三线表口径 / 目标体系切换 / Methods 统计段** —— 本模块占后两格。

## SAMPL / ICMJE 的硬要求直接编码在这里

- SAMPL 在**每一种分析类型下都重复**要求「Name the statistical package or program used」(共五次)
  ⇒ `software` 段是必出的,不是可选;
- ICMJE 要求分析用 AI 必须写进 Methods(含工具与版本)⇒ 一并生成披露句;
- 「不显著」也要精确 p 值与效应量 CI(APA 7 / SAMPL 共同要求)⇒ 不走「NS」分支。
"""

from __future__ import annotations

from typing import Any

from ..registry import Effect, Method
from .format import SystemSpec, fmt_ci, fmt_df, fmt_effect, fmt_mean_sd, fmt_median_iqr, fmt_p, fmt_stat

# 🔴 呈现口径**全部来自方法卡**(`nonparametric` / `statistic_symbol` / `comparison_noun_zh` /
#    `name_zh` / `name_en`),本模块不认识任何具体方法名。
#    首版这里有一张 `_NAMES: dict[method_id → (中文名, 英文名, 是否非参)]` 硬编码表,
#    且因为 `report/` 当时不在护栏扫描面里而**整族逃过了检查** —— 护栏漏一个目录,
#    那个目录就变成知识回流的后门。补进扫描面后当场红,知识随之搬回卡片。
# 组名末尾若已自带量词,不再补「组」。
# 实测踩到:用户的列值是「对照组」,模板机械拼成「对照组组」—— 这类叠字在中文正文里非常刺眼,
# 而它恰恰出现在**用户要直接粘进论文**的那句话里。用户自己的用词优先,模板只在缺量词时补。
_GROUP_SUFFIXES = ("组", "群", "类", "型", "期", "级", "档", "队")

# CI 算法口径 → Methods 段的中文说法。键与 registry.schema.CI_METHODS 一一对应,
# 由 test_ci_method_zh_covers_registry 钉死 —— 加了口径却忘了这里,
# Methods 会印出英文 id(`其 95% 置信区间以newcombe计算`),而那句要进论文。
_CI_METHOD_ZH: dict[str, str] = {
    "nct": "非中心 t 分布法",
    "normal": "正态近似法",
    "bootstrap": "自助法",
    "newcombe": "Newcombe 法(两个 Wilson 区间合成)",
    "fisher_z": "Fisher z 变换法",
    "none": "",          # 刻意不给区间;调用处走另一条分支,不会用到这个值
}


def _paren(stat_part: str, p_part: str, eff_part: str) -> str:
    """把括号里的「统计量,p,效应量」拼起来 —— **统计量可能不存在**(精确检验)。
    首版用 f"({stat_part},{p_part}...)" 直拼,精确检验会印出「(,P=0.069,RD=…)」
    这种以逗号开头的括号。`eff_part` 自带前导逗号(历史形态),这里不重复加。"""
    head = ",".join(x for x in (stat_part, p_part) if x)
    return head + eff_part


def _fmt_rate(rate: float, n: int, sys: SystemSpec) -> str:
    """率写成「76.67%(23/30)」—— 百分比 + 分数**都要给**。

    只给百分比,读者无法反推例数(审稿人第一个要的就是分子分母);
    只给分数,读者要自己心算。中文期刊的惯例是两个都印,这里照办。
    分子由 rate×n **反算**并四舍五入 —— 它与 bundle 里的 event_n 必然一致
    (rate 就是 event_n/n 算出来的),不引入新的数。
    """
    x = int(round(rate * n))
    return f"{rate * 100:.{sys.count_pct_decimals}f}%({x}/{n})"


def _ci_pct(e: dict[str, Any]) -> str:
    """把 ci_level 写成人话。原先此处**硬编码 95%** —— 而 bundle 里同时带着 ci_level,
    两者一旦不一致(引擎按 0.90 算、Methods 写 95%),交付物就是一句假话,且不会报错。"""
    try:
        lv = float(e.get("ci_level", 0.95))
    except (TypeError, ValueError):
        lv = 0.95
    pct = lv * 100
    return f"{pct:.0f}%" if abs(pct - round(pct)) < 1e-9 else f"{pct:g}%"


def _is_paired(bundle: dict[str, Any]) -> bool:
    """这次分析是不是配对设计。

    判据取 `n.pairs` 而不是 `spec.paired`:前者是引擎按**分析单元**真实记下来的对数,
    后者是调用方声明的意图。两者理论上一致,但报告层只该相信引擎自己算出来的东西。
    """
    return bool((bundle.get("n") or {}).get("pairs"))


def _group_label(name: str, *, paired: bool = False) -> str:
    """把水平名渲染成正文里的称谓。

    🔴 `paired=True` 时**不补量词**。配对设计的两个水平是**时点**(干预前/干预后、术前/术后),
    不是两组人 —— 机械补「组」会造出「干预前组」这种不存在的东西,
    而读者会据此以为有两批受试者。实测事故(2026-08-06):同一次 report 产出的 docx 表头
    正确写「时点/干预前/干预后」,而 md 正文写「干预前组 8.863±0.342(n=15)、
    干预后组 8.075±0.331(n=15)」—— 两个时点各标 (n=15),读者以为 30 例。
    """
    name = name.strip()
    if not name:
        return "该时点" if paired else "该组"
    if paired:
        return name
    return name if name.endswith(_GROUP_SUFFIXES) else f"{name}组"


def _rebuild_evidence_chain(bundle: dict[str, Any], sys: SystemSpec) -> list[str]:
    """从 bundle 的 `assumptions` 结构化字段,按目标体系重建依据链句子。"""
    out: list[str] = []
    for a in bundle.get("assumptions") or []:
        name = a.get("name_zh") or a.get("id") or "前提检验"
        stat = a.get("statistic")
        p = a.get("p_value")
        if stat is None or p is None:
            continue
        verdict = "满足" if a.get("verdict") else "不满足"
        detail = ""
        per = a.get("per_group") or []
        if per:
            detail = "(" + "、".join(
                f"{g}:{fmt_stat(float(w), sys)}, {fmt_p(float(pp), sys)}" for g, w, pp in per
            ) + ")"
        # 🔴 逐组列完之后**不再追加那个顶层统计量**(2026-08-06 修)。
        #
        #    原文形态(9 条用例上现形):
        #      「各组正态性(Shapiro-Wilk)(A:0.978, p=0.565、B:0.953, p=0.094):
        #        **统计量 0.953,p=0.094**,该前提满足。」
        #    —— 逐组已经把两组的 W 与 p 都写出来了,后面又把**其中一组**的数复述一遍,
        #    而且不带主语,读起来像是一个「全局的 Shapiro 统计量」。那种东西不存在,
        #    审稿人会直接质疑「你这个 W 是谁的」。
        #
        #    有 per_group 时,结论句只报判定;没有 per_group(如 Levene、配对差值的 Shapiro,
        #    它们本来就只有一个统计量)才写数值。判据是**这个检验有没有分组维度**,
        #    不是方法名 —— 所以它长在数据形状上,不需要认识具体是哪个检验。
        if per:
            out.append(f"{name}{detail}:该前提{verdict}。")
        else:
            out.append(
                f"{name}:统计量 {fmt_stat(float(stat), sys)},{fmt_p(float(p), sys)},"
                f"该前提{verdict}。"
            )
        if a.get("degraded"):
            out.append(str(a["degraded"]))
    return out


def methods_paragraph(bundle: dict[str, Any], sys: SystemSpec, method: Method,
                      eff_card: Effect | None = None) -> str:
    """Methods 统计段。逐项对齐 SAMPL 的最低必报项。

    `method` 是本次分析所用的**方法卡**;称呼、统计量符号、参数/非参口径全从它读。
    """
    zh, en = method.name_short_zh or method.name_zh, method.name_en
    dec = bundle.get("decision", {})
    sw = bundle.get("software", {})
    parts: list[str] = []

    # ① 前提检验与分流依据 —— 「分流依据一起交付」这个卖点的落点。
    #    审稿人问的是依据链不是结论(小木虫一手原声:"How did you test normality?")。
    #
    # 🔴 依据链在**这里按目标体系重建**,不用 bundle 里烤好的 `evidence_chain_zh`。
    #    首版直接拼那个字段,结果两件事同时坏掉:
    #      ① 里面的 p 值是 run 时用裸 f-string 拼的,印出了 `p=0.000`(正是 format 层要防的);
    #      ② 换目标体系时它**不会跟着重排**(APA 要去前导零)—— 而「换体系=重跑 report」是卖点。
    #    结论:凡是要按体系呈现的东西,都不能在 run 时定型。bundle 存结构化数值,呈现全在 report。
    chain = _rebuild_evidence_chain(bundle, sys)
    if chain:
        parts.append("统计分析前先检验分析前提:" + "".join(chain))

    # ② 选定的检验 + 为什么
    reason = str(dec.get("reason_zh", "")).rstrip("。;;, ")
    # 🔴 配对设计不是「组间」比较,是同一批对象的前后比较。
    #    写成组间会让审稿人以为设计是两独立样本 —— 而那正是要靠 Methods 说清楚的东西。
    _cmp = "进行前后比较" if _is_paired(bundle) else "进行组间比较"
    parts.append(f"据此采用{zh}({en}){_cmp},理由:{reason}。")

    # ③ 缺失处理(六项最低必报项之一,最常被漏)
    #
    # 🔴 措辞必须**限定作用域**。2026-08-06 评判实测:13 条用例上现形 ——
    #    清洗/聚合/归一/单位换算全发生在 StatRun **之外**的 Bash 里,引擎只看得见
    #    最终喂给它的那个文件,却主动断言「数据无缺失,未做剔除」。
    #    最恶劣的一例(AG-03):实际 20 行里整组丢了 6 行,Methods 照写这句。
    #    引擎无从知晓上游做过什么 —— 它能诚实说的只有「**我读到的这个文件**里没有缺失」。
    #    删掉这句不行(缺失处理是六项最低必报项之一,漏报会被审稿人问);
    #    正确做法是把断言收窄到引擎真能背书的范围,并把「上游还得交代」单独提醒作者。
    # 🔴 Wilcoxon 丢弃的零差值对必须披露(2026-08-06 补)。
    #    实测:15 对里 10 对前后完全没变 ⇒ 检验实际只用了 5 对,而表里报 n=15。
    #    审稿人照表复算得不到那个 p 值,而报告还主动写「无缺失值」——
    #    整张表既不可解释也不可复核。这一句是让它重新可复核的最小成本。
    _nz = (bundle.get("n") or {}).get("zero_diffs")
    if _nz:
        _ne = (bundle.get("n") or {}).get("pairs_effective")
        parts.append(
            f"其中 {_nz} 对前后测完全相同,按 Wilcoxon 符号秩检验的原法不参与秩计算,"
            f"故实际参与检验的为 {_ne} 对。"
        )

    n = bundle.get("n", {})
    _unit = "对" if n.get("unit") == "pair" else "例"
    # 🔴 advisory 的披露句比这句**信息更全**(带原始例数与剩余例数),两句都出会重复。
    #    实测:「共 48 例因关键变量缺失被剔除」紧接着「共 48/60 例…分析基于剩余 12 例」——
    #    同一件事说两遍,是让 Methods 读起来像机器生成的典型形态,而这段要进论文。
    #    有 advisory 时让位给它(下面 ④b 会输出),没有才出这句通用的。
    _covered = {str(a.get("id")) for a in (bundle.get("advisories") or [])}
    if n.get("missing_excluded") and "excessive_exclusion" not in _covered:
        parts.append(
            f"分析所用数据文件中,共 {n['missing_excluded']} {_unit}因关键变量缺失被剔除"
            f"(按{'整例删除' if n.get('missing_rule') == 'listwise' else n.get('missing_rule')}处理)。"
        )
    else:
        parts.append("分析所用数据文件中无缺失值。")

    # ④ 效应量与 CI 的算法口径 —— ci_method 必须写明,正态近似与非中心 t 给出不同区间
    e = bundle.get("effect") or {}
    if e:
        method_zh = _CI_METHOD_ZH.get(e.get("ci_method", ""), e.get("ci_method", ""))
        # 🔴 Methods 里写卡片的**中文名 + 符号**,不写引擎的英文 id。
        #    Results 句那半边已经修了(写 symbol),这里是同一个洞的另一半:
        #    实测修完 Results 之后,Methods 仍在写「效应量报告 cohens_d_z」。
        #    交付物里任何一处出现裸 id,用户就会把它粘进论文。
        _n = eff_card.name_zh if eff_card else e.get("name")
        _s = eff_card.symbol if eff_card and eff_card.symbol else None
        # 名字里已经含符号(如「Cohen's d_z(配对设计)」)时不再追加 —— 否则会写成
        # 「效应量报告Cohen's d_z(配对设计)(d_z)」这种双括号。这句要进论文,不能将就。
        _tail = f"({_s})" if _s and _s not in str(_n) else ""
        # 🔴 `ci_method: none` = **刻意不给区间**(Cramér's V / 配对率差 / 趋势 r)。
        #    此处若照旧套模板,会写出「其 95% 置信区间以none计算」——
        #    一句会被原样粘进论文的胡话。不给区间就把那半句去掉,并说明「本次未给出」,
        #    让读者知道是缺失而不是忘了看。
        if e.get("ci_method") == "none":
            parts.append(f"效应量报告 {_n}{_tail}(本次未给出其置信区间)。")
        else:
            parts.append(f"效应量报告 {_n}{_tail},其 {_ci_pct(e)} 置信区间以{method_zh}计算。")

    # ④b 🔴 模型接受过的 advisory —— **强制披露**(2026-08-06 架构调整:模型决策优先)
    #
    #    引擎不再替模型做方法学判断,但那些判断**必须被看见**。
    #    「模型优先」的完整形态是三段:引擎给全信息 → 模型决定 → 决定被披露。
    #    只做前两段的话,模型的决定就是静默的 —— 那比引擎替它决定更糟:
    #    审稿人拿到一份「共 12 例」的报告,而原始数据是 60 例,文里一个字都不提为什么。
    #
    #    刻意放在软件版本**之前**、紧跟缺失处理:这些是关于**这份数据怎么被对待**的事实,
    #    属于 Methods 的数据段,不是脚注。
    for a in bundle.get("advisories") or []:
        d = str(a.get("disclose_zh") or "").strip()
        if d:
            parts.append(d)

    # ④c 事后比较的口径(多组族)—— 用了哪种事后、哪种校正,是 SAMPL 的必报项:
    #     Tukey / Games-Howell / Dunn 的适用前提不同(等方差 / 不等方差 / 非参),
    #     不写明审稿人无从判断这次选择对不对。
    if bundle.get("posthoc"):
        _pm = {"tukey_hsd": "Tukey HSD(控制族错误率)",
               "games_howell": "Games-Howell(不假定等方差,控制族错误率)",
               "dunn_holm": "Dunn 检验并作 Holm 校正",
               "dunn_bonferroni": "Dunn 检验并作 Bonferroni 校正"}
        _m = str(bundle.get("posthoc_method") or "")
        parts.append(f"组间两两比较采用{_pm.get(_m, _m)};"
                     f"表中以字母标记呈现,共享同一字母者差异无统计学意义。")

    # ⑤ 软件与版本(SAMPL 在每种分析下都重复要求;这里出一次,report 每族复用)
    parts.append(
        "统计分析使用 statkit "
        + str(sw.get("statkit", "?"))
        + "(Python "
        + str(sw.get("python", "?"))
        + ";scipy "
        + str(sw.get("scipy", "?"))
        + ")完成"
        + (f",随机过程固定种子 {sw['bootstrap_seed']} 以保证可复现" if sw.get("bootstrap_seed") else "")
        + "。"
    )

    # ⑤b 多重比较记账(D5)—— 同一会话跑了多次检验时**必须披露**,否则用户会把
    #     未校正的 p 当显著写进论文(实测 AD-08:三次两两比较,p=.0286 在 Bonferroni 阈值
    #     α'=.0167 之下其实不显著)。
    mult = bundle.get("multiplicity") or {}
    if mult.get("tests_in_session", 1) > 1:
        parts.append(str(mult.get("note_zh", "")))

    # ⑥ 学派分歧 / 惯例依据的如实披露 —— 不替用户悄悄选边
    if dec.get("contested_zh"):
        cites = "; ".join(p.get("cite", "") for p in dec.get("positions", []) if p.get("cite"))
        parts.append(
            "说明:该前提检验策略在方法学上存在不同主张,本文采用"
            + ("先检验后分流" if dec.get("doctrine") == "pretest-classic" else str(dec.get("doctrine")))
            + "的口径" + (f";相关讨论见 {cites}" if cites else "") + "。"
        )
    if dec.get("disclosure_required_zh"):
        parts.append(dec["disclosure_required_zh"])

    return "".join(parts)


def results_sentence(bundle: dict[str, Any], sys: SystemSpec, method: Method,
                     eff_card: Effect | None = None) -> str:
    """Results 成句。**所有数字从 bundle 取值填模板**,模型不参与。

    `eff_card` 给出效应量的呈现符号(d / g / d_z / r)。不传时回落到引擎返回的 id ——
    那正是 2026-08-06 的事故形态(裸英文 `cohens_d_z` 进中文正文),故调用方应当传。
    """
    zh, nonparam = method.name_zh, method.nonparametric
    n = bundle.get("n", {})
    desc = bundle.get("descriptives", {})
    groups = bundle.get("groups", [])
    e = bundle.get("effect") or {}

    # 描述统计:参数检验报 x̄±s,非参报中位数(四分位)—— 非参报均数是常见误配。
    paired = _is_paired(bundle)
    # ── C1/C5:分类资料报的是**率**,不是均数 ──────────────────────────────────
    #    判据取方法卡的 input_shape,不取 bundle 里恰好有没有 "mean" 这个键。
    is_counts = method.input_shape == "table"
    chunks: list[str] = []
    if is_counts:
        _tbl = bundle.get("table") or {}
        _ev = (bundle.get("outcome") or {}).get("event_level", "")
        if _tbl.get("kind") == "paired":
            # 配对表的行不是「两组」,是同一批人的两个时点 —— 描述统计要报
            # **前后各自的事件率**,而不是把前测水平当成组去逐行报率。
            _rates = bundle.get("rates") or {}
            _tot = int(_tbl.get("total") or 0)
            _b, _a = _rates.get("before"), _rates.get("after")
            if _b is not None and _a is not None:
                chunks.append(
                    f"治疗前{_ev}率 {_fmt_rate(_b, _tot, sys)}、"
                    f"治疗后{_ev}率 {_fmt_rate(_a, _tot, sys)}"
                )
        else:
            for g in (_tbl.get("rows") or groups):
                d = desc.get(str(g), {})
                if not d:
                    continue
                if d.get("rate") is not None:
                    chunks.append(f"{_group_label(str(g))}{_ev}率 "
                                  f"{_fmt_rate(d['rate'], int(d['n']), sys)}")
                else:
                    # 多水平结局没有单一「率」可报 —— 如实报构成,不硬凑一个率。
                    _parts = "、".join(f"{k} {v} 例" for k, v in (d.get("counts") or {}).items())
                    chunks.append(f"{_group_label(str(g))}共 {d['n']} 例({_parts})")
    else:
        for g in groups:
            d = desc.get(g, {})
            if not d:
                continue
            label = _group_label(str(g), paired=paired)
            val = (
                fmt_median_iqr(d["median"], d["q1"], d["q3"], sys)
                if nonparam
                else fmt_mean_sd(d["mean"], d["sd"], sys)
            )
            # 🔴 配对设计**不在每个时点后面标 n** —— 两个时点是同一批人,各标一次
            #    会让读者把 n 加起来(实测:两个 (n=15) 被读成 30 例)。
            #    对数统一在句尾报一次,单位写「对」。
            chunks.append(f"{label} {val}" if paired else f"{label} {val}(n={d['n']})")
    desc_part = "、".join(chunks)
    if paired and not is_counts:
        desc_part += f"(共 {bundle['n']['pairs']} 对)"
    elif is_counts and (bundle.get("table") or {}).get("kind") == "paired":
        desc_part += f"(共 {bundle['n']['pairs']} 对)"

    stat_sym = method.statistic_symbol
    df_part = ""
    if bundle.get("df") is not None:
        # F 检验要写成 F(df1, df2) —— 少一个数审稿人就复算不了。
        # 判据是 bundle 里有没有 df2,不认方法名(多组族里 Kruskal 只有一个 df)。
        if bundle.get("df2") is not None:
            df_part = f"({fmt_df(bundle['df'], sys)}, {fmt_df(bundle['df2'], sys)})"
        else:
            df_part = f"({fmt_df(bundle['df'], sys)})"
    # 🔴 C5:精确检验(Fisher / McNemar)**没有检验统计量**,方法卡的 statistic_symbol 是 null。
    #    裸下标 `bundle['statistic']` 会当场 KeyError;而 `.get(..., 0)` 更糟 ——
    #    Results 句会印出一个编造的「χ²=0.000」。判据取卡片怎么声明,不取 bundle 里有没有键。
    _has_stat = bool(stat_sym) and "statistic" in method.reports_required
    stat_part = f"{stat_sym}{df_part}={fmt_stat(bundle['statistic'], sys)}" if _has_stat else ""
    p_part = fmt_p(bundle["p_exact"], sys)

    eff_part = ""
    if e:
        # 🔴 写卡片声明的**符号**,不写引擎返回的 id。
        #    实测(2026-08-06):Results 句原样印出「cohens_d_z=-1.64」——
        #    裸英文 id 出现在用户要粘进中文论文的那句话里。符号住在效应量卡上(symbol),
        #    与「统计量符号住在方法卡上」同一口径。
        _sym = (eff_card.symbol or e["name"]) if eff_card else e["name"]
        eff_part = f",{_sym}={fmt_effect(e['value'], sys)}"
        # 🔴 `ci_method: "none"` = **刻意不给区间**(Cramér's V / 配对率差)。
        #    此时 ci_low/ci_high 是 **null**,而 fmt_ci 收的是 float —— 直接传会抛
        #    「must be real number, not NoneType」,整份报告在最后一步失败(实测)。
        #    也不能塞 NaN 走 fmt_ci 的「未能计算」分支:那句话是给**算失败**用的,
        #    而这里是设计上就不给 —— 两者对读者的含义完全不同,不该共用一句话。
        _lo, _hi = e.get("ci_low"), e.get("ci_high")
        if e.get("ci_method") != "none" and _lo is not None and _hi is not None:
            eff_part += "," + fmt_ci(float(_lo), float(_hi), sys, level=float(e.get("ci_level", 0.95)))

    # 措辞由卡片的 `comparison_noun_zh` 决定:非参检验的是**分布位置**不是「均数差」,
    # 写成「两组均数差异显著」是常见误述,审稿人会抓 —— 但这是**方法学结论**,故住在卡片里。
    verb = method.comparison_noun_zh

    # 方向必须写成**词**,不能只靠效应量的符号 —— 符号由分组名的排序决定(见 run.py 的
    # contrast 记录),读者看到 d=-4.19 无从判断哪一组更高。写成「A 高于 B」才可核对。
    # 主语:配对是「两个时点」,两组是「两组」,三组及以上是「各组」。
    # S6:按 `len(groups)` 成句,不再写死 —— 多组报告里写「两组差异有统计学意义」
    # 是直接的事实错误,而它此前会照印(实测三组数据得到那句话)。
    _k = len(groups)
    _subj = "两个时点" if paired else ("两组" if _k == 2 else "各组")
    # k>2 时**不写方向词**:三组里「谁高于谁」不是一句话能说完的,
    # 而结论恰恰在字母标记里(共享字母 = 不显著)。硬写一个前两组之差是误导。
    ctr = (bundle.get("contrast") or {}) if _k == 2 else {}
    direction = ""
    # 🔴 方向词必须取**与本次检验同源**的位置统计量:参数检验看均值差,非参看中位数差。
    #    实测事故(2026-08-06):一律用均值差 ⇒ 非参报告里出现
    #    「主动恢复组 305.500、冷水浸泡组 399.000。……主动恢复**高于**冷水浸泡」——
    #    同一句话里方向词与中位数互相打架,而中位数正是这张表和这个检验用的东西。
    if is_counts:
        # 分类资料比的是**率**:方向取率差,与同一句里报出的两个率同源。
        md = ctr.get("rate_difference")
    else:
        md = ctr.get("median_difference") if nonparam else ctr.get("mean_difference")
        if md is None:                   # 老 bundle 没有中位数差时回落,但绝不用均值给非参定向
            md = None if nonparam else ctr.get("mean_difference")
    if ctr.get("minuend") and md is not None and md != 0:
        direction = f",{ctr['minuend']}{'高于' if md > 0 else '低于'}{ctr['subtrahend']}"

    # 🔴 显著性判据必须用**本次分析实际适用的阈值**,不能硬写 0.05。
    #    实测事故(2026-08-05 盘点):Methods 段已经按 D5 披露「本会话已进行 3 次检验,
    #    α'=0.0167,大于该阈值的结果不应按显著报告」,而这一句仍拿 0.05 判 ——
    #    于是同一份交付物里,Methods 说不该算显著、Results 说「差异有统计学意义」,
    #    **正面矛盾**。用户会照抄 Results 那句,D5 那段披露等于白做。
    mult = bundle.get("multiplicity") or {}
    alpha = mult.get("alpha_bonferroni") or mult.get("alpha_nominal") or 0.05
    k = mult.get("tests_in_session", 1)
    p = bundle["p_exact"]
    if p < alpha:
        sig = "有统计学意义"
    elif k > 1 and p < (mult.get("alpha_nominal") or 0.05):
        # 名义显著但过不了校正阈值 —— 这正是 D5 要拦的那一格,必须说清楚而不是含糊带过。
        sig = (f"未达多重比较校正后的显著性水平(本会话共 {k} 次检验,"
               f"Bonferroni 校正阈值 α'={alpha:.4f})")
        return (f"{desc_part}。{zh}结果显示{_subj}{verb}{sig}"
                f"({_paren(stat_part, p_part, eff_part)})。")
    else:
        sig = "无统计学意义"
    main = (f"{desc_part}。{zh}结果显示{_subj}{verb}{sig}{direction}"
            f"({_paren(stat_part, p_part, eff_part)})。")
    return main + _posthoc_sentence(bundle, sys)


def _posthoc_sentence(bundle: dict[str, Any], sys: SystemSpec) -> str:
    """事后比较 + 字母标记的成句(S6 / P1 族①)。

    🔴 **字母标记是多组报告的结论本身**,不是补充说明。
    农学 / 食品 / 体育论文的三线表里那一列 a/ab/b 就是全部结论 ——
    调研称它是「GraphPad Prism 留的结构性空白」,全场竞品都不给。
    所以它必须出现在 Results 段里,而不是只躺在 bundle 中。

    措辞纪律:**只陈述哪些对之间差异显著**,不替读者下「A 最好」这类结论 ——
    哪个方向算「好」是领域判断,不是统计结论。
    """
    post = bundle.get("posthoc") or []
    cld = bundle.get("cld") or {}
    if not post:
        return ""
    alpha = (bundle.get("multiplicity") or {}).get("alpha_nominal") or 0.05
    sig = [p for p in post if isinstance(p.get("p_adj"), (int, float)) and p["p_adj"] < alpha]

    method = str(bundle.get("posthoc_method") or "事后检验")
    _名 = {"tukey_hsd": "Tukey HSD", "games_howell": "Games-Howell",
           "dunn_holm": "Dunn(Holm 校正)", "dunn_bonferroni": "Dunn(Bonferroni 校正)"}
    out = f"事后两两比较采用 {_名.get(method, method)}:"
    if not sig:
        out += "各组间差异均无统计学意义。"
    else:
        pairs = "、".join(f"{p['a']} vs {p['b']}({fmt_p(float(p['p_adj']), sys)})" for p in sig)
        out += f"{pairs} 差异有统计学意义,其余各对差异无统计学意义。"
    if cld:
        letters = "、".join(f"{g}:{str(v).strip()}" for g, v in cld.items())
        out += f"表中字母标记为{letters};**共享同一字母者差异无统计学意义**。"
    return out


def icmje_disclosure(bundle: dict[str, Any]) -> str:
    """ICMJE 合规披露句 —— 竞品普遍没做的一格。

    ⚠️ 措辞刻意只描述**工具与用法**,不含任何「已经过审核」的背书:
    Methods 段可以放警告,**不放背书** —— 「经自动化方法学核对」会被读者理解成
    「本次分析经过核对」,而实际含义只是「这张方法卡的引文被核对过一次」,与本次数据无关。

    ## 🔴 2026-08-06 重写,原因是它**本身就是一句写错了的合规声明**

    原文只披露 statkit,一个字不提大语言模型,结尾还写「**作者已核对结果与结论**」。三处都错:

    1. **LLM 零披露**。而 LLM 实际做了问诊定研究设计、用 pandas 清洗合并
       (实测 308 个真实会话里 1360 次 Bash —— 直接决定进入分析的是哪份数据)、写解读。
       本模块自己的注释就写着「ICMJE 要求分析用 AI 必须写进 Methods(含工具与版本)」,
       然后只写了那个**不是 AI** 的部件。
    2. **「作者已核对结果与结论」是工具无从知晓的事实断言**,而且是以作者口吻写的。
       同一个 docstring 上面刚说「不放背书」,它却塞进一句更硬的、关于作者行为的陈述。
    3. 「所有统计量由其确定性计算产出」会随**任何一次** StatReport 照印 —— 而实测有 28 个会话
       走 ExportDocument 出了交付物却从没调过 StatReport,那些数字不是 statkit 产出的。

    **这是唯一一句用户会原样投出去、且内容本身是合规声明的话。写错的合规声明比不写更糟 ——
    它可以构成学术不端认定的事实基础,而它是我们替用户写的。**

    现在拆成三句:工具 / AI / 作者责任。第三句改成**祈使**(「请核对」)而不是**陈述**
    (「已核对」)—— 前者是提醒,后者是替别人作证。
    """
    sw = bundle.get("software", {})
    model = str(sw.get("llm_model") or "").strip()
    ai_part = (
        "研究设计问诊、数据整理与结果解读借助大语言模型"
        + (f"({model})" if model else "")
        + "辅助完成。"
    )
    return (
        "数据分析借助 Scholay 数据分析工具(statkit "
        + str(sw.get("statkit", "?"))
        + ")完成:该工具按预设决策表实测分析前提并据此选择统计检验,"
        + "本文件中的统计量、p 值与效应量均由其确定性计算产出。"
        + ai_part
        + "作者对全部内容负责,请在投稿前核对结果与结论,"
        + "并按目标期刊对 AI 使用的披露要求补充说明。"
    )
