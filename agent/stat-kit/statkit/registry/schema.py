"""方法卡 / 前提检验卡 / 效应量卡 / 决策规则 的 schema 与校验。

## 这一层为什么存在(方案 R 的立论)

「什么时候该用 Welch 而不是 Student」这句**方法学知识**,可以住在三个地方:

1. Python 的 `if/elif` 里 —— 加到第 40 个方法时,没有任何一处能整体审视;
2. 提示词里 —— 模型每次自己判,实测选错率 38.4%(JCO CCI 2025-12);
3. **可评审的声明式数据里** ← 本方案选这个。

选 3 的代价是要写这份 schema;买到的是:方法学知识变成**一张能被人逐条评审、
能被机器逐条校验、能生成快照 diff** 的表。加第 21 个方法 = 加一份 YAML,不碰引擎。

## 硬约束(违反即加载失败,不是警告)

- **`gate` 表达式不许出现 `py:` 前缀** —— 那是逃生舱口,一旦开就等于回到形态 1。
  ⚠️ 但**不要把「grep 不到 py: 」当成止损判据**:schema 在这里拒绝它,grep 恒为 0,
  那是一条永远绿的规则。真正的判据是「加一张回归卡时 `core/` 要不要跟着改」(见 §八 止损点 B)。
- **每条规则至少一条 `role: primary` 且 `access ∈ {oa, local_pdf}`** —— 评审 agent 拿不到
  原文就只能输出 unverifiable,机制会空转。2026-08-05 已把 22 条规则的 primary 全换成 OA。
- **`golden` 非空** —— 一条没有金标参考值的方法卡,它算错了没有人会知道。
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal

# ── 出处 ────────────────────────────────────────────────────────────────────
# role 三档,第三档是 2026-08-05 OA 出处改写反查出来的**必需品**:
#   primary    —— 直接论证这条规则的一次文献,必须可及(oa / local_pdf),评审 agent 要能打开核对
#   secondary  —— 教科书。审稿人认它,但 agent 拿不到原文,不能作为唯一依据
#   convention —— 🔴 **有学科惯例、无一次文献**。实测有五条规则落在这一档:
#                 D-08 「非正态优先 Kruskal」、D-14 「N>40」、D-21 「量表≥3 题」、
#                 D-22 「KMO≥0.6」、D-09 「农学默认 Duncan」。
#                 没有这一档,它们就只能在 primary / secondary 之间二选一 —— 无论选哪个都是在撒谎。
#                 以 convention 为**唯一**依据的 default,`report` 必须在 Methods 段披露
#                 「本默认依学科惯例而非文献建议」(由 doctor 强制,见 verbs/doctor.py)。
CitationRole = Literal["primary", "secondary", "convention"]

# access 分档刻意区分 oa 与 free_to_read:
#   oa           出版社开放获取(PMC / DOAJ / 期刊官方免费页)
#   free_to_read 能打开但不是出版社 OA(作者自存档 / 课程站镜像)—— 链接可能哪天就没了
#   print        纸质教科书,agent 取不到
#   local_pdf    仓库内 registry/sources/ 下的本地副本
CitationAccess = Literal["oa", "free_to_read", "print", "local_pdf"]


@dataclass(frozen=True)
class Citation:
    id: str
    role: CitationRole
    access: CitationAccess
    cite: str
    url: str | None = None
    locator: str | None = None
    quote: str | None = None

    def agent_readable(self) -> bool:
        """评审 agent 能不能真的打开它核对。"""
        return self.access in ("oa", "local_pdf", "free_to_read")


# ── 决策规则 ────────────────────────────────────────────────────────────────
@dataclass(frozen=True)
class Rule:
    """一条决策规则:条件 → 候选白名单 → 默认。

    `when` 是**事实表达式**,只能引用 core/facts.py 词表里的派生事实名;
    绝不允许内联 Python(见模块头「硬约束」)。
    """

    id: str  # D-01 … D-22
    when: str  # 事实表达式,如 "two_groups and continuous and not levene_equal"
    allowed: list[str]  # 候选方法白名单 —— 模型只能在这里面挑
    default: str  # 不作声时的选择
    reason: str  # 给用户看的一句话理由(会进 Methods 段的依据链)
    citations: list[Citation] = field(default_factory=list)
    # doctrine:该规则属于哪个学派。同一条件下两派都统计学正确、选哪个是产品立场时用它分流。
    # 例:D-01/D-03 的 pretest-classic(先测 Levene 再分流)vs welch-always(无条件 Welch)。
    doctrine: str | None = None
    # contested:方法学界对这条**本身**有分歧。为 True 时 report 必须把另一派也如实披露。
    contested: bool = False

    def primary_citations(self) -> list[Citation]:
        return [c for c in self.citations if c.role == "primary"]

    def convention_only(self) -> bool:
        """default 是否**仅**由学科惯例支撑(无 primary)。为真则 Methods 段必须披露。"""
        return not self.primary_citations() and any(
            c.role == "convention" for c in self.citations
        )


# ── 方法卡 ──────────────────────────────────────────────────────────────────
@dataclass(frozen=True)
class Method:
    """一张方法卡 = 一个统计方法的完整声明。"""

    id: str
    name_zh: str
    name_en: str
    family: str  # two_group / multi_group / categorical / posthoc / regression …
    # engine:实现落点。`lib:` = 直接库调用;`own:` = 本仓自写(必须在 statkit/engines/ 里)。
    # 🔴 自写的只有 Duncan 与 Games-Howell —— 发布版 scikit-posthocs 0.14.0 没有它们
    #    (只在 GitHub master),2026-08-05 构建期断言实测确认。
    engine: str
    # requires:该方法的前提检验卡 id 列表。引擎按此**实测**前提,不问模型。
    requires: list[str] = field(default_factory=list)
    # effects:效应量卡 id 列表;第一个是默认报告的那个。
    effects: list[str] = field(default_factory=list)
    # reports.required:落 bundle 时必填的字段路径。缺一项 `emit` 拒收(退出码 2)——
    # 这是「六项最低必报项」的机器可读形态,也是数字锁唯一真正的执行点。
    reports_required: list[str] = field(default_factory=list)
    # golden:金标参考值来源(R 包名 + fixture 名)。**非空是硬约束**。
    golden: list[str] = field(default_factory=list)
    citations: list[Citation] = field(default_factory=list)
    # ── 呈现口径(2026-08-05 被 test_no_card_ids_in_engine_code 第三次逼出来)──
    # 首版把这三项写成 report 层的 `if method in ("mann_whitney","wilcoxon")` 分支 ——
    # 那同样是**行为随卡片 id 分叉**。它们是方法学知识不是渲染细节:
    # 「非参检验的是分布位置、要报中位数而不是均数」是统计学结论,不是排版偏好。
    # 正文内联用的短名。`name_zh` 常带限定后缀(如「Welch t 检验(不假定等方差)」),
    # 直接嵌进句子会变成「…(不假定等方差)(Welch's t-test)」这种双括号。
    # 缺省回落到 name_zh —— 只有需要时才在卡片里显式给短名。
    name_short_zh: str = ""
    nonparametric: bool = False
    # 统计量符号(t / U / W / F / χ²)。Results 段写 `U=...` 还是 `t(df)=...` 由它决定。
    statistic_symbol: str = "t"
    # 效应/差异的措辞。非参检验的是**分布位置**,写成「两组均数差异显著」是常见误述,审稿人会抓。
    comparison_noun_zh: str = "差异"
    # mem:内存量级提示(cells 上限)。solve 阶段据此把会超限的方法剔出候选并写明原因。
    mem_cells_max: int | None = None
    notes_zh: str | None = None
    # ── 🔴 S2(2026-08-06):arity 与设计单位搬上卡片 ────────────────────────────
    #
    # 此前「只支持两组」这条约束只活在 `verbs/run.py` 的**一行硬编码**里
    # (`if len(arrays) != 2: raise`),而卡片对自己能吃几组**一个字都没说**。
    #
    # 为什么这是个必须现在埋的钩子:那一行是今天「k>2 数据」与「静默截断」之间**唯一**的东西,
    # 而它在**第一条正确的 ANOVA 规则落地当天就失效** ——
    # 一条方法学正确的规则 `n_groups >= 3 and continuous and not paired → oneway_anova`
    # 不含 `two_groups`,于是绕过了现有 6 条规则那道「第二道闸」,
    # 而 `run.py` 仍然只解包前两组、仍然以两参调用。
    # 实测:放宽那一行并加一条 3 组路由规则 ⇒ `ok:true / df:22.0`(只用了 24 例),
    # 而同一份输出的 `n.by_group` 记着 36 例 —— reports_required 全过、数字锁不报、degraded 为 null。
    # **三道机械闸对「输入被截短」结构上无感。**
    #
    # group_levels:该方法能吃几个水平。`max=None` 表示不限(ANOVA / Kruskal 之类)。
    # units:独立样本 vs 配对 —— 决定 `arrays` 该怎么组装,也是 report 成句的分流依据
    #        (配对写「两个时点」而不是「两组」)。
    group_levels: tuple[int, int | None] = (2, 2)
    units: Literal["independent", "paired"] = "independent"
    # ── 🔴 C1(2026-08-07):这张卡吃哪种输入形态 ────────────────────────────────
    #
    # 是 S2(group_levels/units)的同构推广。为什么必须有它:
    # 分类结局最常见的形态恰恰是 `--dv 疗效 --group 组别` —— **与 t 检验的参数一模一样**。
    # 若不在卡片上声明形态,唯一能分辨的只有「调用方说自己要做什么」,
    # 而那正是 assume.py 立论里 38.4% 选错率的入口。
    #
    # 形态由 `core/dataset.shape_for()` 从**列画像**推出来(纯函数),
    # 这个字段只做**路由后断言**:选中的卡片吃不吃得下这份数据的形态。
    #
    # ⚠️ 本轮 Literal 只落 `groups|table` —— `items` 随信效度族一起加。
    #    刻意不提前落一个没有实现的枚举值(那会让 loader 的断言无从校验)。
    input_shape: Literal["groups", "table"] = "groups"

    def accepts_levels(self, k: int) -> bool:
        lo, hi = self.group_levels
        return k >= lo and (hi is None or k <= hi)


@dataclass(frozen=True)
class Check:
    """一张前提检验卡(正态性 / 方差齐性 / 期望频数 …)。

    ⚠️ **前提检验是三夺权之一**:由引擎实测,不交给模型判断。
    StatQA 实测 LLM 的首要错误类型就是 applicability error
    (「知道该做 t 检验,但没意识到这份数据不满足前提」),而这一类 100% 可机械判定。
    """

    id: str
    name_zh: str
    engine: str
    # 🔴 applies_when:该检验在什么结构下**适用**(事实表达式,与 Rule.when 同一套词表)。
    #    这一项是 2026-08-05 被 `test_no_card_ids_in_engine_code` 逼出来的:
    #    首版把「配对就跑 shapiro_diff、否则跑 shapiro_by_group + levene」硬写在 verbs/run.py 里 ——
    #    那是**行为随卡片 id 分叉**,正是那条护栏存在的理由。护栏当场抓到,知识因此搬回卡片。
    #    (记一笔:护栏第一次抓到的违规来自写护栏的人自己。这比它一直绿更有说服力。)
    applies_when: str = "True"
    # produces:该检验产出哪些**派生事实**(喂给 Rule.when 的表达式)。
    # 例:levene 产出 `levene_equal`;shapiro 产出 `normal_by_group`。
    produces: list[str] = field(default_factory=list)
    alpha: float = 0.05
    citations: list[Citation] = field(default_factory=list)
    notes_zh: str | None = None
    # ── 🔴 S4(2026-08-06):相位与作用对象 ──────────────────────────────────────
    #
    # `target` —— 这个检验**检的是什么**:
    #     dv        原始因变量(按组分)  ← 正态性
    #     diff      配对差值            ← 配对设计的正态性
    #     table     列联表              ← 期望频数(分类资料族)
    #     residuals 拟合残差            ← 回归族的正态性/异方差
    #     model     模型对象整体        ← VIF、比例风险
    #
    # `phase` —— 什么时候跑:
    #     pre       计算之前(现在全部三张卡都是这一档)
    #     post_fit  **拟合之后** —— 回归/生存族的核心前提全在这一档,
    #               因为它们需要模型对象,而模型在 compute 之后才存在。
    #
    # ## 为什么现在只埋字段、不做相位
    #
    # 审计原话:「这是所有不足里唯一一条『不做手术就完全做不了』的」。但**手术的形状
    # 取决于第一个真正用到它的族**:post 检验不满足时要不要**复判换方法**?
    # 复判会牵动 `spec_hash` 的语义(它现在只由输入与方法决定,run.py 有明确纪律
    # 说不能由环境状态决定 —— 那条纪律是踩出来的:自我喂养的环让 Bonferroni 阈值越跑越严)。
    # 在没有真实的 post-fit 检验之前定这个,是在**猜**手术的形状。
    #
    # 而字段现在埋、以后埋,成本差很多:schema 加字段一旦有存量卡片就要考虑版本兼容。
    # 所以:**字段现在加(缺省 pre/dv,三张既有卡零改动),主流程的 post 相位留到回归族**。
    # loader 会拒绝 `phase: post_fit` 的卡片(见下),免得有人以为它已经能用了。
    # 🔴 字段名叫 `target` 而不是 `on`(2026-08-07 改名):
    #    YAML 1.1 把裸词 `on` 解析成布尔 True —— 卡片写 `on: diff` 会静默变成 `{True: "diff"}`。
    #    loader 的 `_reject_boolish_keys` 能拦住它,但那意味着**每张新卡都必须记得加引号**,
    #    而本轮要新增 2 张检验卡、回归族还会更多 —— 一个「每次都要绕」的字段名是在反复付账。
    #    改名比守卫便宜:守卫仍然保留(它还护着 `yes/no/off` 这类**值**)。
    target: Literal["dv", "diff", "table", "residuals", "model"] = "dv"
    phase: Literal["pre", "post_fit"] = "pre"


# CI 算法口径的合法取值。**单一真源** —— 校验、Literal、交付层的中文映射都从这里派生,
# 三处各写一份正是「加了新口径,校验放行、Methods 段却印英文 id」的成因。
CI_METHODS: tuple[str, ...] = ("nct", "normal", "bootstrap", "newcombe", "fisher_z", "none")


@dataclass(frozen=True)
class Effect:
    """一张效应量卡。`ci_method` 必填 —— 正态近似与非中心 t 给出不同区间,Methods 段要写明。"""

    id: str
    name_zh: str
    name_en: str
    engine: str
    # 🔴 `none` 是合法值,而且必须**显式写出来**而不是让字段留空:
    #    Cramér's V / 配对率差 / 趋势 r 这三张卡本轮不给 CI(理由各写在卡片 notes_zh),
    #    而「字段缺省」与「刻意不给」在下游长得一模一样 —— 后者要能被交付层识别出来,
    #    从而**不**在 Methods 段写出「其 95% 置信区间以 计算」这种残句(实测会写成这样)。
    ci_method: Literal["nct", "normal", "bootstrap", "newcombe", "fisher_z", "none"]
    # 正文里写的**符号**(d / g / d_z / r)。缺省回落到 id ——
    # 而回落到 id 正是 2026-08-06 的事故:裸英文 `cohens_d_z` 被印进中文 Results 句,
    # 那句话恰恰是用户被引导直接粘进论文的。
    symbol: str = ""
    notes_zh: str | None = None
    citations: list[Citation] = field(default_factory=list)


class SchemaError(ValueError):
    """卡片不合 schema。**加载期直接抛**,不降级、不警告 —— 一张坏卡静默进候选集,
    比加载失败危险得多(它会在真实用户的分析里选出错误方法)。"""


def _cite(raw: dict[str, Any], where: str) -> Citation:
    for k in ("id", "role", "access", "cite"):
        if k not in raw:
            raise SchemaError(f"{where}: 出处缺字段 {k!r}")
    if raw["role"] not in ("primary", "secondary", "convention"):
        raise SchemaError(f"{where}: role 非法 {raw['role']!r}")
    if raw["access"] not in ("oa", "free_to_read", "print", "local_pdf"):
        raise SchemaError(f"{where}: access 非法 {raw['access']!r}")
    if raw["role"] == "primary" and raw["access"] == "print":
        raise SchemaError(
            f"{where}: primary 不得是纸质({raw['id']}) —— 评审 agent 拿不到原文,"
            f"机制会空转。教科书请降 role: secondary,并另找一条 OA 一次文献做 primary。"
        )
    return Citation(
        id=raw["id"],
        role=raw["role"],
        access=raw["access"],
        cite=raw["cite"],
        url=raw.get("url"),
        locator=raw.get("locator"),
        quote=raw.get("quote"),
    )


def parse_rule(raw: dict[str, Any]) -> Rule:
    where = f"rule {raw.get('id', '?')}"
    for k in ("id", "when", "allowed", "default", "reason"):
        if k not in raw:
            raise SchemaError(f"{where}: 缺字段 {k!r}")
    gate = str(raw["when"])
    if gate.strip().startswith("py:"):
        raise SchemaError(
            f"{where}: `when` 不得使用 `py:` 逃生谓词。条件必须由 core/facts.py 的"
            f"派生事实词表表达 —— 内联 Python 会让方法学知识重新散回代码里。"
        )
    if raw["default"] not in raw["allowed"]:
        raise SchemaError(f"{where}: default {raw['default']!r} 不在 allowed 里")
    return Rule(
        id=raw["id"],
        when=gate,
        allowed=list(raw["allowed"]),
        default=raw["default"],
        reason=raw["reason"],
        citations=[_cite(c, where) for c in raw.get("citations", [])],
        doctrine=raw.get("doctrine"),
        contested=bool(raw.get("contested", False)),
    )


def _levels(raw: Any, where: str) -> tuple[int, int | None]:
    """解析 `group_levels`。接受 `{min: 2, max: 2}` 或 `[2, null]`;缺省 = 恰好两组。

    缺省刻意取 `(2, 2)` 而不是「不限」:今天全部五张卡都是两组族,
    默认放宽等于让新卡在**没人显式想过 arity** 的情况下被当成 k 组可用 —— 那正是要防的事。
    加 ANOVA 卡的人必须写一句 `group_levels: {min: 3, max: null}`,这一步是刻意的摩擦。
    """
    if raw is None:
        return (2, 2)
    if isinstance(raw, dict):
        lo, hi = raw.get("min", 2), raw.get("max", None)
    elif isinstance(raw, (list, tuple)) and len(raw) == 2:
        lo, hi = raw
    else:
        raise SchemaError(f"{where}: group_levels 形如 {{min:2,max:2}} 或 [2,null],实得 {raw!r}")
    if not isinstance(lo, int) or lo < 1:
        raise SchemaError(f"{where}: group_levels.min 必须是 ≥1 的整数,实得 {lo!r}")
    if hi is not None and (not isinstance(hi, int) or hi < lo):
        raise SchemaError(f"{where}: group_levels.max 必须是 null 或 ≥min 的整数,实得 {hi!r}")
    return (int(lo), None if hi is None else int(hi))


def _shape(raw: Any, where: str) -> str:
    """解析 `input_shape`。缺省 groups —— 与 group_levels 缺省 (2,2) 同一个理由:
    默认放宽等于让新卡在「没人显式想过形态」的情况下被当成万能,而那正是要防的事。"""
    if raw is None:
        return "groups"
    if raw not in ("groups", "table"):
        raise SchemaError(
            f"{where}: input_shape 只能是 groups / table,实得 {raw!r}。"
            f"(items 随信效度族一起加 —— 刻意不提前落没有实现的枚举值。)")
    return str(raw)


def _units(raw: Any, where: str) -> str:
    if raw is None:
        return "independent"
    if raw not in ("independent", "paired"):
        raise SchemaError(f"{where}: units 只能是 independent / paired,实得 {raw!r}")
    return str(raw)


def parse_method(raw: dict[str, Any]) -> Method:
    where = f"method {raw.get('id', '?')}"
    for k in ("id", "name_zh", "name_en", "family", "engine"):
        if k not in raw:
            raise SchemaError(f"{where}: 缺字段 {k!r}")
    if not raw.get("golden"):
        raise SchemaError(
            f"{where}: `golden` 不得为空 —— 没有金标参考值的方法卡,算错了没有人会知道。"
        )
    return Method(
        id=raw["id"],
        name_zh=raw["name_zh"],
        name_en=raw["name_en"],
        name_short_zh=str(raw.get("name_short_zh") or raw["name_zh"]),
        family=raw["family"],
        engine=raw["engine"],
        requires=list(raw.get("requires", [])),
        effects=list(raw.get("effects", [])),
        reports_required=list(raw.get("reports_required", [])),
        golden=list(raw["golden"]),
        citations=[_cite(c, where) for c in raw.get("citations", [])],
        nonparametric=bool(raw.get("nonparametric", False)),
        statistic_symbol=str(raw.get("statistic_symbol", "t")),
        comparison_noun_zh=str(raw.get("comparison_noun_zh", "差异")),
        mem_cells_max=raw.get("mem_cells_max"),
        notes_zh=raw.get("notes_zh"),
        # 🔴 新增字段必须在这里**显式取**,否则 YAML 里写了也不生效 ——
        #    dataclass 有默认值,漏取不会报错,只会静默回落(2026-08-06 的 symbol 事故就是这么来的)。
        group_levels=_levels(raw.get("group_levels"), where),
        units=_units(raw.get("units"), where),
        input_shape=_shape(raw.get("input_shape"), where),
    )


def parse_check(raw: dict[str, Any]) -> Check:
    where = f"check {raw.get('id', '?')}"
    for k in ("id", "name_zh", "engine"):
        if k not in raw:
            raise SchemaError(f"{where}: 缺字段 {k!r}")
    gate = str(raw.get("applies_when", "True"))
    if gate.strip().startswith("py:"):
        raise SchemaError(f"{where}: `applies_when` 不得使用 `py:` 逃生谓词")
    target = str(raw.get("target", "dv"))
    if target not in ("dv", "diff", "table", "residuals", "model"):
        raise SchemaError(f"{where}: target 非法 {target!r};可选 dv/diff/table/residuals/model")
    if "on" in raw:
        # 老写法要**当场拒**而不是静默忽略 —— 否则改名会制造一批「写了不生效」的卡。
        raise SchemaError(
            f"{where}: 字段 `on` 已改名为 `target`(2026-08-07)。"
            f"改名的原因:YAML 1.1 把裸词 `on` 当布尔,`on: diff` 会静默变成 `{{True: 'diff'}}`。"
        )
    phase = str(raw.get("phase", "pre"))
    if phase not in ("pre", "post_fit"):
        raise SchemaError(f"{where}: phase 非法 {phase!r};可选 pre/post_fit")
    if phase == "post_fit":
        # 🔴 字段先埋、主流程后做 —— 但**不许**有人写了 post_fit 的卡片然后以为它在跑。
        #    主流程今天是单向的 `读表 → checks → assume → compute → 落盘`,
        #    没有任何位置能放拟合后的检验。静默忽略这张卡 = 又一条「造好没接线」。
        raise SchemaError(
            f"{where}: phase: post_fit 的前提检验**尚未实现**。\n"
            f"主流程目前是单向的(读表 → 前提 → 分流 → 计算 → 落盘),"
            f"拟合之后没有可以放它的位置;字段已经埋好(S4),但相位本身要与回归/生存族一起做 —— "
            f"那时才定得了「post 检验不满足要不要复判换方法」以及它对 spec_hash 语义的影响。"
        )
    return Check(
        id=raw["id"],
        name_zh=raw["name_zh"],
        engine=raw["engine"],
        applies_when=gate,
        produces=list(raw.get("produces", [])),
        alpha=float(raw.get("alpha", 0.05)),
        citations=[_cite(c, where) for c in raw.get("citations", [])],
        notes_zh=raw.get("notes_zh"),
        target=target,  # type: ignore[arg-type]
        phase=phase,    # type: ignore[arg-type]
    )


def parse_effect(raw: dict[str, Any]) -> Effect:
    where = f"effect {raw.get('id', '?')}"
    for k in ("id", "name_zh", "name_en", "engine", "ci_method"):
        if k not in raw:
            raise SchemaError(f"{where}: 缺字段 {k!r}")
    if raw["ci_method"] not in CI_METHODS:
        raise SchemaError(
            f"{where}: ci_method 非法 {raw['ci_method']!r} —— 只能是 {'/'.join(CI_METHODS)}。"
            f"不给区间时写 'none'(要显式,别留空:留空与漏填在下游长得一样)。"
        )
    return Effect(
        id=raw["id"],
        name_zh=raw["name_zh"],
        name_en=raw["name_en"],
        engine=raw["engine"],
        ci_method=raw["ci_method"],
        # 🔴 新增字段必须在这里显式取,否则 YAML 里写了也不生效 ——
        #    dataclass 有默认值,漏取不会报错,只会**静默回落**。
        #    实测(2026-08-06):卡片写了 `symbol: d_z`,这里没取,
        #    Results 句照旧印出裸英文 `cohens_d_z`,而测试是唯一发现它的东西。
        symbol=str(raw.get("symbol", "") or ""),
        notes_zh=raw.get("notes_zh"),
        citations=[_cite(c, where) for c in raw.get("citations", [])],
    )
