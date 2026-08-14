"""确定性格式化 —— 吃「目标体系 + 原始数值」,吐符合该体系的字符串。

## 为什么这一层必须是纯函数

`p=.000` / `p<.05` / `NS` 三种写法**都是模型极容易生成、且在目标体系下明确错误**的输出。
它们不该由提示词去纠正 —— 提示词纠正不了确定性的东西。
所以 bundle 里 `p_exact` 永远是 float 原值,**格式化只发生在这里**。

## 体系冲突是真实的,不是洁癖

同一个数字在不同期刊体系下的正确写法**互相矛盾**:
- **APA 7**:p 值**不写前导零**(`.023`),因为 p 不可能大于 1;
- **中文核心/医学**:普遍**保留前导零**(`0.023`);
- **SAMPL** 明令用 `mean (SD)` 且**禁用 SE**;而经济学回归表的默认恰恰是括号里放标准误;
- 经济学的星号阈值整体宽一档(`*p<0.1`),医学/心理是 `*p<0.05`。

⇒ **不设全局默认**。不选体系就报错,而不是挑一个 —— 挑一个等于在另外两个学科里默认输出错的东西。
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

SystemId = Literal["cn-core", "apa"]


@dataclass(frozen=True)
class SystemSpec:
    id: SystemId
    name_zh: str
    p_leading_zero: bool          # p 值是否保留前导零
    p_decimals: int               # p 的小数位
    p_min_display: float          # 小于此值改写成 "<x"
    stat_decimals: int            # 统计量小数位
    effect_decimals: int          # 效应量小数位
    # ⚠️ 这里**曾经**有一个 `dispersion: Literal["sd","se"]` 字段,2026-08-05 删掉。
    #    它从声明之日起就没有任何代码读过(死旋钮护栏 test_no_system_field_is_a_dead_knob 抓出来的),
    #    两套体系又都填 "sd" —— 它唯一的作用是让人以为「改这里就能换成 SE」,改完没反应。
    #    真要支持 SE,得同时:① 从 SD 与 n 算出 SE ② 换表头文字(x̄±s_x̄ / M (SEM))
    #    ③ 在 Methods 里写明用的是 SE —— 三件事一件都不能省,那时再加字段不迟。
    #    (SAMPL 明令描述统计报 SD 不报 SE,这个约束属于**指导文字**,不是格式旋钮。)
    star_thresholds: tuple[tuple[float, str], ...]

    # ── 三线表的文字 ────────────────────────────────────────────────────────
    # 🔴 2026-08-05 之前这些**硬编码在 verbs/report.py 里**,与 system 参数无关。
    #    后果:选 APA 得到的表,表题写「表 1 两组均数±标准差比较」、表头写「x̄±s」,
    #    而单元格里是 `52.62 (4.99)` —— **表头与数据自相矛盾**,审稿人一眼就看得出;
    #    p 值那格还被 `.replace("p","P")` 无条件改成大写 P,而 APA 要求小写斜体 p。
    #    体系的口径属于**体系包**,不属于代码。放这里才能加第三套体系时不改 report.py。
    table_caption: str            # {desc} 由参数/非参各自的描述统计名替换
    label_group: str
    label_n: str
    label_desc_param: str         # 参数检验的描述统计列头
    label_desc_nonparam: str      # 非参检验的描述统计列头
    caption_desc_param: str       # 表题里的描述统计说法(参数)
    caption_desc_nonparam: str
    desc_template_param: str      # 描述统计的**排版形态**,须与 label_desc_param 一致
    desc_template_nonparam: str
    stat_label_suffix: str        # 统计量列头的后缀:中文「t 值」、APA 直接「t」
    # 配对设计的表**不是**「两组比较」:干预前/干预后是同一批人的两个**时点**,
    # 表头写「组别」、表题写「两组」在配对表里是错的(2026-08-05 实测:配对表照写「两组」)。
    label_timepoint: str          # 配对时该用的行标题(组别 → 时点)
    label_diff: str               # 差值行的标题
    caption_paired: str           # 配对设计的表题模板
    p_symbol: str                 # 中文期刊惯例大写 P,APA 小写 p
    italic_stats: bool            # APA 要求 M/SD/t/p/df 斜体;中文期刊不要求
    # ── S6(2026-08-06):多组表的文字 ──────────────────────────────────────────
    # 字母标记列是农学/食品/体育论文的**结论列** —— 表里那一列 a/ab/b 就是全部结论。
    # 放进体系包而不是硬编码:APA 的表注写法与中文核心不同,加第三套体系时不该再改 report.py。
    label_cld: str = "字母标记"
    caption_multi: str = "表 1  各组{desc}比较"
    note_cld: str = "注:同列中共享相同字母者差异无统计学意义(P>0.05)。"
    # ── 分类资料族(2026-08-07)────────────────────────────────────────────────
    # 分类表与连续表**列结构就不同**:描述统计不是一列(x̄±s),而是每个结局水平一列
    # (「有效 23(76.67)」「无效 7(23.33)」)。文字仍归体系包,理由与上面几条一样 ——
    # 加第三套体系时不该回来改 report.py。
    caption_counts: str = "表 1  两组{desc}比较"
    caption_counts_multi: str = "表 1  各组{desc}比较"
    caption_counts_paired: str = "表 1  干预前后{desc}比较(配对设计)"
    caption_desc_counts: str = "结局构成"          # 表题里的说法(中性:疗效/并发症/阳性率通用)
    count_pct_hint: str = "[例(%)]"                # 缀在表题末尾,告诉读者单元格是什么
    count_template: str = "{n}({pct})"            # 单元格排版形态,须与 hint 一致
    count_pct_decimals: int = 2
    # 配对表的行不是「组」,是**前测水平**;列是后测水平。两者必须分别命名,
    # 否则会写出「组别 = 有效」这种读不懂的表头(实测过同类问题:配对表照写「两组」)。
    label_paired_row: str = "治疗前"
    label_paired_col: str = "治疗后"


SYSTEMS: dict[str, SystemSpec] = {
    # 中文核心 / 学位论文:保留前导零(与 APA 的最大差异),统计量三位小数。
    "cn-core": SystemSpec(
        id="cn-core", name_zh="中文核心期刊 / 学位论文",
        p_leading_zero=True, p_decimals=3, p_min_display=0.001,
        stat_decimals=3, effect_decimals=2,
        star_thresholds=((0.001, "***"), (0.01, "**"), (0.05, "*")),
        table_caption="表 1  两组{desc}比较",
        label_group="组别", label_n="n",
        label_desc_param="x̄±s", label_desc_nonparam="中位数(P25, P75)",
        caption_desc_param="均数±标准差", caption_desc_nonparam="中位数(四分位数)",
        desc_template_param="{m}±{s}", desc_template_nonparam="{med}({q1}, {q3})",
        stat_label_suffix=" 值",   # 「t 值」「Z 值」—— 中文期刊惯例
        label_timepoint="时点", label_diff="差值",
        caption_paired="表 1  干预前后{desc}比较(配对设计)",
        p_symbol="P",              # 中文核心期刊普遍用大写 P
        italic_stats=False,
    ),
    # APA 7:p 不写前导零(p 不可能 >1);SAMPL 同族明令 mean (SD) 且禁 SE。
    "apa": SystemSpec(
        id="apa", name_zh="APA 第 7 版",
        p_leading_zero=False, p_decimals=3, p_min_display=0.001,
        stat_decimals=2, effect_decimals=2,
        star_thresholds=((0.001, "***"), (0.01, "**"), (0.05, "*")),
        label_cld="Groups",
        caption_multi="Table 1  Comparison of {desc} Across Groups",
        note_cld="Note. Means sharing a letter do not differ significantly (p > .05).",
        caption_counts="Table 1  Comparison of Outcome Distribution Between Groups",
        caption_counts_multi="Table 1  Comparison of Outcome Distribution Across Groups",
        caption_counts_paired="Table 1  Pre-Post Comparison of Outcome (Paired Design)",
        caption_desc_counts="Outcome Distribution",
        count_pct_hint="[n (%)]", count_template="{n} ({pct})", count_pct_decimals=1,
        label_paired_row="Pre", label_paired_col="Post",
        table_caption="Table 1  Comparison of {desc} Between Groups",
        label_group="Group", label_n="n",
        label_desc_param="M (SD)", label_desc_nonparam="Mdn [Q1, Q3]",
        caption_desc_param="Means and Standard Deviations",
        caption_desc_nonparam="Medians and Quartiles",
        desc_template_param="{m} ({s})", desc_template_nonparam="{med} [{q1}, {q3}]",
        stat_label_suffix="",      # APA 表头就是裸符号 t / U / W
        label_timepoint="Time", label_diff="Difference",
        caption_paired="Table 1  Pre–Post Comparison of {desc} (Paired Design)",
        p_symbol="p",              # 🔴 APA 是小写斜体 p;此前被 .replace("p","P") 无条件改成 P
        italic_stats=True,
    ),
}


class UnknownSystem(ValueError):
    pass


def get_system(system_id: str) -> SystemSpec:
    try:
        return SYSTEMS[system_id]
    except KeyError:
        raise UnknownSystem(
            f"未知的目标体系 {system_id!r}。可选:{', '.join(SYSTEMS)}。"
            f"**刻意不设默认值** —— p 前导零 / 离散度符号 / 星号阈值在各体系间两两冲突,"
            f"挑一个当默认等于在另外几个学科里默认输出错的东西。"
        ) from None


def fmt_p(p: float, sys: SystemSpec) -> str:
    """格式化 p 值。

    🔴 三条硬规则(全是模型极易写错、且各体系口径不同的地方):
    1. **绝不输出 `p=.000` / `p=0.000`** —— p 永远不会精确等于 0,那是四舍五入的假象。
       小于阈值一律改写成 `p<.001`。
    2. 前导零按体系走:APA 去掉(`.023`),中文核心保留(`0.023`)。
    3. **不输出 `NS`** —— 不显著也要给精确 p 值,这是 APA 7 与 SAMPL 的共同硬要求
       (「不显著」不等于「没有信息」,读者要靠精确 p 做 meta 分析)。
    """
    if not (0.0 <= p <= 1.0):
        raise ValueError(f"p 值超出 [0,1]:{p!r} —— 上游算错了,格式化层不做兜底掩盖")
    if p < sys.p_min_display:
        s = f"{sys.p_min_display:.{sys.p_decimals}f}"
        return "p<" + (s if sys.p_leading_zero else s.lstrip("0"))
    s = f"{p:.{sys.p_decimals}f}"
    return "p=" + (s if sys.p_leading_zero else s.lstrip("0"))


def fmt_stat(v: float, sys: SystemSpec) -> str:
    return f"{v:.{sys.stat_decimals}f}"


def fmt_effect(v: float, sys: SystemSpec) -> str:
    return f"{v:.{sys.effect_decimals}f}"


def fmt_df(df: float | None, sys: SystemSpec) -> str:
    """df 格式化。

    ⚠️ **Welch 的 df 是小数,不得四舍五入成整数** —— 这是 Results 段最常见的呈现错误之一,
    而且整数化之后读者无法看出用的是 Welch 校正。整数 df(Student/配对)照常输出整数。
    """
    if df is None:
        return ""
    return str(int(df)) if float(df).is_integer() else f"{df:.2f}"


def fmt_mean_sd(mean: float, sd: float, sys: SystemSpec) -> str:
    """`x̄±s`(中文)/ `M (SD)`(APA)—— 两个体系的**排版形态本身不同**,不只是小数位。

    🔴 排版形态由体系包的 `desc_template_param` 给出,**不再写 `if sys.id == "cn-core"`**。
    理由不是洁癖:那种写法下,加第三套体系会**静默落进 else 分支**拿到 APA 的形态,
    而表头文字(label_desc_param)却是新体系自己的 —— 于是又一次「表头与数据自相矛盾」,
    正是 2026-08-05 在 APA 的 docx 上刚修掉的那个 bug。
    形态与表头同住体系包,这类矛盾就成了结构上不可能,而不是靠人记得同时改两处。
    """
    d = sys.stat_decimals
    return sys.desc_template_param.format(m=f"{mean:.{d}f}", s=f"{sd:.{d}f}")


def fmt_median_iqr(med: float, q1: float, q3: float, sys: SystemSpec) -> str:
    d = sys.stat_decimals
    return sys.desc_template_nonparam.format(
        med=f"{med:.{d}f}", q1=f"{q1:.{d}f}", q3=f"{q3:.{d}f}")


def fmt_ci(low: float, high: float, sys: SystemSpec, level: float = 0.95,
           decimals: int | None = None) -> str:
    """置信区间。

    `decimals` 缺省用 `effect_decimals`(效应量的口径)。**原始单位的量**(如配对差值)
    要显式传 `stat_decimals` —— 否则会出现 `0.791 95%CI [0.65, 0.93]` 这种
    点估计三位、区间两位的表,同一行里两种精度,论文里会被挑。
    """
    import math

    if not (math.isfinite(low) and math.isfinite(high)):
        # 🔴 如实输出「未能计算」,不用近似值顶替 —— bundle 里 ci_method 写着 nct,
        # 悄悄换成正态近似而读者无从察觉,是另一种编数字。
        return f"{int(level*100)}%CI 未能计算"
    d = sys.effect_decimals if decimals is None else decimals
    return f"{int(level*100)}%CI [{low:.{d}f}, {high:.{d}f}]"


def stars(p: float, sys: SystemSpec) -> str:
    for thr, mark in sys.star_thresholds:
        if p < thr:
            return mark
    return ""
