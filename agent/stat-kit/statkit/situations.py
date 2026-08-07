"""情况目录 —— 引擎能遇到的**每一种状况**的单一真源。

## 这一层为什么存在(2026-08-06 架构调整:模型决策优先)

产品方向定为**模型决策优先,引擎是辅助**。理由是硬的:模型在快速迭代,把方法学判断
钉死在一张决策表里,等于赌那张表永远比未来的模型强。

但「模型优先」不等于「引擎沉默」。**恰恰相反 —— 引擎从守门人改成仪表盘之后,
它对信息量的要求更高了**:此前模型选错了有闸兜着,现在没有,那么引擎知道的每一件事
都必须完整、准确、可行动地送到模型面前。

盘点当时的实际状态(2026-08-06):**30 种 reason 里 8 种的 payload 是空的**
(`{"ok":false,"reason":"not_two_levels"}` —— 连有几个水平都不告诉你),
只有 1 种带 `impact`。模型撞上这些只能靠猜,而 E2E 实测它猜错的代价是
「拒绝回执被读成纯接口限制」→ 转头绕过去。

⇒ 本模块把每种情况写成一张卡,统一提供五件事,缺一不可:
   ① **是什么**(meaning)② **怎么判定的**(detect,让模型能自证或反驳)
   ③ **不管它会怎样**(impact —— 后果不是报错,而是**静默的错误结论**)
   ④ **下一步做什么**(next)⑤ **如果坚持继续会发生什么**(if_proceed)

## 三档分级(severity)

- **`blocking`** —— **算术上不可能**得到有意义的结果,或输入根本读不进来。
  这一档不是方法学判断,所以不归模型决定:分母为 0 就是分母为 0。
  硬拒,但回执必须说清是数据的哪一处、怎么修。

- **`capability`** —— 引擎**没有实现**这个方法族。同样不归模型决定(DISPATCH 里没有那个函数),
  但性质完全不同:这是**我们的缺口**,不是用户数据的问题。
  回执必须①诚实说没有 ②给可用的替代路径 ③**明确禁止用错方法凑合**
  (E2E 实测:引擎拒绝三组比较后,模型拆成两两 t 检验出三份可投稿交付物)。

- **`advisory`** —— 能算,但结论可疑或需要披露。**这一档归模型决定**。
  引擎给出全部证据与后果,模型选择继续或调整;选择继续时:
    · 必须显式传 `accept` 参数(不是默认放行 —— 决定要留痕)
    · 该决定进 bundle 的 `advisories[]`
    · **由 report 在 Methods 段强制披露**(disclose_zh)
  这是「模型优先」的完整形态:**把拒绝换成披露** —— 模型有最终决定权,
  而它的决定会留在交付物里被审稿人看见,不会静默。

## 谁消费这份目录

- `verbs/*.py` —— 组装拒绝/警告 payload 时从这里取文案(不再各写各的)
- `statkit situations --json` —— 模型可主动查询(工具 description 指过来)
- `report/narrative.py` —— advisory 被接受时按 `disclose_zh` 强制披露
- 文档与 SKILL —— 「使用说明」的内容真源,不再手抄
"""

from __future__ import annotations

from dataclasses import dataclass, asdict
from typing import Any, Literal

Severity = Literal["blocking", "capability", "advisory"]


@dataclass(frozen=True)
class Situation:
    id: str                       # == payload 里的 reason
    severity: Severity
    title_zh: str                 # 一句话标题
    meaning_zh: str               # 这是什么
    detect_zh: str                # 引擎的判据(模型据此自证或反驳)
    impact_zh: str                # 不管它会怎样 —— 重点写**静默的错误结论**,不是报错
    next_zh: str                  # 下一步该做什么
    if_proceed_zh: str = ""       # 坚持继续会发生什么(advisory 必填)
    accept_key: str = ""          # 放行开关(advisory 必填):StatRun 的参数名
    disclose_zh: str = ""         # 放行后 Methods 段必须写的话(advisory 必填)
    # internal:**引擎/调用方自身的故障**,不是用户数据的状况。
    #
    # 这一类的 `impact` 诚实答案就是「无结果」—— 它不会产出一个静默的错误结论,
    # 只会当场失败。而 impact 这个字段的全部意义(见模块头)恰恰是「写清静默的错误结论」。
    # 标出来而不是硬凑字数:护栏要求每张卡写满,而对这几张,「写满」只会写出填充文字。
    # 模型对它们要做的也不是推理,是如实转述并停下。
    internal: bool = False
    # retired:这个 reason **引擎已经不再产出了**(能力落地后闸被拆掉)。
    #
    # 为什么不直接删卡:SKILL.md、系统提示词、旧会话记录、用户那边的截图里都还留着它,
    # 有人查过来时必须查得到「现在是什么情况」,而不是查不到、或者照着一张过期的卡
    # 去建议用户改用 SPSS。卡片内容改写成现状,并由本字段让「死条目」护栏放行 ——
    # 护栏本身仍然有效:**没标 retired 的卡片必须真能被吐出来**,否则使用说明就是小说。
    retired: bool = False

    def to_dict(self) -> dict[str, Any]:
        return {k: v for k, v in asdict(self).items() if v != ""}


def _s(*a: Any, **kw: Any) -> Situation:
    return Situation(*a, **kw)


# ══ blocking:算术上不可能 / 输入读不进来 ═══════════════════════════════════════
_BLOCKING = [
    _s("unsupported_file", "blocking", "不支持的文件类型",
       "引擎只读 .csv / .tsv / .txt / .xlsx / .xlsm。",
       "按扩展名判定。",
       "SPSS(.sav)、Stata(.dta)、SAS(.sas7bdat)这类统计软件专有格式**在上传阶段就会被拒**,"
       "不会出现在工作目录里 —— 「用户说传了但你看不到」多半就是这个原因,先 `ls` 再说。",
       "请用户在原软件里另存为 CSV 或 xlsx(SPSS:文件 → 另存为 → 保存类型选 CSV)。"
       "⚠️ 同时提醒:另存会丢失变量标签与 user-missing(9/99/999)的语义。"),

    _s("unknown_encoding", "blocking", "文字编码无法识别",
       "依次按 utf-8-sig / gb18030 / utf-16 解码都失败。",
       "三种编码逐个试读,全部抛 UnicodeDecodeError。",
       "带着乱码跑下去,列名对不上、中文分组标签变成问号 —— 而且不一定报错。",
       "让用户用 Excel 打开后「另存为 → CSV UTF-8(逗号分隔)」,或直接传 .xlsx(不涉及编码)。"),

    _s("missing_column", "blocking", "指定的列不在数据里",
       "你给的 dv / group / subject 列名在表头里找不到。",
       "精确匹配列名(引擎已自动去除首尾空白与 BOM)。",
       "列名看起来一样但实际不同,是中文表最常见的坑:全半角括号、"
       "Excel 里的不可见字符、以及**表头上方还有标题行**导致列名变成 `Unnamed: 0`。",
       "先 `python3 -c \"import pandas as pd; print(pd.read_csv('文件').columns.tolist())\"` "
       "打印真实列名再传。回执里的 `available` 已列出前 40 个。"),

    _s("missing_group", "blocking", "缺分组列",
       "独立样本比较必须指定 --group。",
       "非配对分析且 group 为空。",
       "没有分组就无从比较。若你想做的是配对/前后比较,缺的其实是 `paired` 与 `subject`。",
       "补 group;若是前后测数据,改用 paired=true + subject=<配对标识列>。"),

    _s("missing_subject", "blocking", "配对分析缺配对标识列",
       "paired=true 时必须给 subject(把两次测量对应起来的那一列)。",
       "paired 为真且 subject 为空。",
       "没有配对标识就无法知道哪一行和哪一行是同一个人 —— "
       "此时若按独立样本跑,自由度与检验方法都会变。",
       "补 subject(通常是「编号 / 学号 / 住院号」这类列)。"
       "⚠️ 若数据是**宽表**(前测一列、后测一列),需要先 melt 成长表:"
       "每人两行、一列标时点、一列放数值。"),

    _s("non_numeric_values", "blocking", "因变量列不是纯数值",
       "该列里混进了文本。引擎已把它们分成三类:删失值(<0.01 / ND / 未检出)、"
       "真缺失(未测 / NA / —)、无法归类。",
       "pd.to_numeric 失败的单元格逐个归类。",
       "🔴 **删失与缺失不是一回事**:统一按缺失丢掉会系统性高估均值(低端数据被丢光),"
       "统一替换成某个数则是无中生有 —— 两种都是静默的错误。",
       "按回执给的分类分别处理。删失值的处理(LOD/2、Tobit、生存分析)是**方法学决定**,"
       "必须问用户并写进 Methods,引擎不替他选。"),

    _s("too_few_observations", "blocking", "有效样本过少",
       "某组去除缺失后不足 3 例。",
       "各组非缺失样本数 < 3。",
       "正态性检验至少需要 3 例;少于此时任何前提判定都是没有依据的 —— "
       "硬跑会得到一个看起来正常、实际无依据的 p 值。",
       "确认分组列与因变量列是否选对、缺失是否处理得当。"
       "若该组确实只有这么几例,应在文中如实报告样本量限制,而不是硬跑一个检验。"),

    _s("zero_variance", "blocking", "组内没有变异",
       "某组的全部观测值完全相同,方差为 0。",
       "np.std(ddof=1) == 0。",
       "分母为 0。硬算会得到 t=±inf、p=0、效应量 inf,而且**前提检验会回 NaN 并被误读成"
       "「前提不满足」** —— 最终 Results 会写出「差异有统计学意义(t(1)=-inf, p<0.001)」。",
       "常见原因:① 分组列或因变量列选错了(把编号列当成了测量值);"
       "② 该列是常量或单位换算后被抹平;③ 数据导出时整列被覆盖。"),

    _s("zero_variance_diff", "blocking", "配对差值没有变异",
       "每一对的前后差值完全相同。",
       "差值的 np.std(ddof=1) == 0。",
       "配对检验的统计量以差值的标准差为分母,分母为 0 会算出 t=±inf、p=0,而不会报错。",
       "常见原因:① 两列其实是同一列的副本或按固定量平移;② 数据是模拟/占位数据。"),

    _s("non_finite_values", "blocking", "数据里有无穷值",
       "因变量列出现 inf / -inf。",
       "np.isfinite 检查。",
       "带着它算下去,统计量与效应量都会变成 inf 而**不报错**。",
       "检查该列的生成过程(是否有除以零的比值),修正后重跑。"),

    _s("non_finite_result", "blocking", "计算结果出现 inf / NaN",
       "统计量或效应量算出了非有限值 —— 这说明存在一条引擎没预料到的路径。",
       "落盘前对 statistic / df / p_exact / effect.* 逐项查有限性。",
       "这类值一旦进 bundle,交付物就会印出 `t=-inf`、`p<0.001` 这种不可能的结果,"
       "而且没有任何东西会报错。",
       "多半是某组无变异或样本量过小。若确认数据无误,这属于引擎缺陷,请反馈。",
       internal=True),

    _s("incomplete_bundle", "blocking", "结果缺少必报字段",
       "方法卡声明的 reports_required 有缺项。",
       "逐项 _dig 校验。",
       "缺项意味着这份结果无法被完整报告(六项最低必报项之一缺失),"
       "审稿人会直接问「你的效应量呢」。",
       "属引擎缺陷,请反馈。不要绕过校验 —— 那等于交付一份报不全的结果。",
       internal=True),

    _s("check_not_implemented", "blocking", "前提检验卡声明了不存在的实现",
       "卡片引用了一个 engines/checks.py 里没有的检验。",
       "加载期比对卡片 id 与 DISPATCH。",
       "声明与实现不符会让「卡片说什么就做什么」这句话失效。",
       "属注册表缺陷,请反馈。",
       internal=True),

    _s("method_arity_mismatch", "blocking", "选中的方法吃不下这个分组数",
       "决策表路由到的方法卡声明只支持 N 个水平,而实际分组数不是 N。",
       "分流之后按选中卡片的 group_levels 校验。",
       "🔴 这是**注册表配置缺陷**,不是用户数据的问题。继续算的话引擎只会取前两组,"
       "而 n.by_group 仍记全部组 —— 统计量与样本量对不上,且三道机械闸"
       "(reports_required / 有限性 / numcheck)对「输入被截短」结构上无感。"
       "实测:放宽主流程那行 arity 硬编码并加一条 3 组路由规则,得到 ok:true / df:22.0(24 例)"
       "而 n.by_group 记着 36 例,degraded 为 null。",
       "属注册表配置缺陷(规则与方法卡的 group_levels 不一致),请反馈。",
       internal=True),

    _s("method_units_mismatch", "blocking", "选中的方法与设计不匹配",
       "决策表把配对数据路由到了独立样本方法,或反之。",
       "分流之后比对选中卡片的 units 与本次的 paired。",
       "配对与独立样本的自由度、检验统计量、效应量分母全都不同 —— "
       "算错的方向不会报错,只会给出一个看起来正常的 p 值。",
       "属注册表配置缺陷,请反馈。",
       internal=True),

    _s("sheet_not_found", "blocking", "指定的工作表不存在",
       "调用方给的 sheet 名不在这个 Excel 文件里。",
       "与 openpyxl 读出的 sheet_names 精确比对。",
       "取不到指定的表就无从分析;而**猜一个最像的**会静默分析错对象 —— "
       "那正是 multiple_sheets 那张卡要防的事。",
       "从回执给的清单里挑一个,注意名字里的空格与全半角。"),

    _s("check_target_unavailable", "blocking", "前提检验要的对象不存在",
       "卡片声明这个检验作用在某个对象上(dv / diff / table / residuals / model),而本次分析没有它。",
       "分流前按卡片的 target 解析对象,取不到即拒。",
       "静默跳过一张前提检验 = 依据链里少一条,而 Methods 段照样宣称前提满足 —— "
       "那是「说了一件引擎无从知晓的事」。",
       "属注册表配置缺陷(检验卡的 applies_when 与 target 不自洽),请反馈。",
       internal=True),

    _s("all_methods_disabled", "blocking", "候选方法全被禁用",
       "决策规则命中了,但候选集里的方法全部不可用。",
       "allowed 与 DISPATCH 求交为空。",
       "无法给出任何结果。",
       "属注册表配置问题,请反馈。",
       internal=True),

    _s("bundle_not_from_engine", "blocking", "bundle 不是引擎产出的那一份",
       "StatReport 只接受 analysis/ 下、以 .bundle.json 结尾的文件。",
       "canonical 路径判定(symlink 与 .. 都解掉)。",
       "🔴 这一条**与方法学判断无关,是防伪造**:report 只负责把 StatRun 的结果格式化。"
       "若它接受任意路径,手写一份 JSON 就能让确定性渲染器印出伪造的三线表 —— "
       "而那份交付物在用户和审稿人眼里带着全部「引擎产出」的特征。",
       "先调 StatRun,把它回的 bundle_path **原样**传进来。"),

    _s("usage", "blocking", "命令行参数不完整",
       "缺少必需参数。",
       "argv 解析后必填项为空。",
       "无结果。",
       "按回执里的用法串补齐参数。",
       internal=True),

    _s("bad_json", "blocking", "输入的 JSON 无法解析",
       "传给引擎的 JSON 格式不合法。",
       "json.loads 失败。",
       "无结果。",
       "检查传入内容是否是合法 JSON。",
       internal=True),

    _s("report_failed", "blocking", "报告渲染失败",
       "从 bundle 渲染交付物时出错。",
       "render 过程抛异常。",
       "无交付物产出。若 bundle 本身正常,重跑 report 通常能定位到是哪一步。",
       "查看 error 字段;若 bundle 是旧版结构(方法卡被删/改名),需要重新跑一次 StatRun。",
       internal=True),

    # ── 分类资料族(2026-08-07)──────────────────────────────────────────────
    _s("dv_too_many_levels", "blocking", "结局列是文本且取值过多",
       "因变量整列都是文本,而互不相同的取值超过上限 —— 这不像结局列。",
       "该列无法转成数值,且不同取值个数 > 上限。",
       "最常见的成因是**把姓名 / 备注 / 诊断描述这类列选成了因变量**。"
       "🔴 回执**刻意不回显具体取值**:那些值往往就是姓名或自由文本,"
       "倾泻进上下文既是隐私问题,也帮不上忙 —— 真正该说的是「这一列多半选错了」。",
       "先确认要比较的结局是哪一列。若确实是分类结局但水平很多(如 5 个诊断分型),"
       "考虑合并到有临床意义的几类再跑 —— 水平越多每格例数越少,期望频数几乎必然不达标。"),

    _s("positive_level_unknown", "blocking", "指定的事件水平不在结局取值里",
       "`--positive` 给的水平名与数据里的结局水平对不上。",
       "与列联表的列名精确比对(已去首尾空白)。",
       "率差 / RR / OR 的符号完全由「谁算事件」决定 —— 认错水平会让结论方向反过来,"
       "而那个反号不会有任何东西报错。",
       "从回执的 `levels` 里挑一个原样传入,注意全半角括号与不可见空白。"),

    _s("group_order_mismatch", "blocking", "指定的分组顺序与数据对不上",
       "`--group-order` 列出的水平集合与数据里实际的分组水平不一致(多了、少了或写法不同)。",
       "集合比对(排序后逐个比)。",
       "趋势检验把分组顺序当成**分数**用。顺序错了 χ² 实测差 2 倍以上,"
       "而两个结果都跑得通、都不报错 —— 这是引擎判不出来、只能由你保证的一件事。",
       "从回执的 `actual` 里原样复制水平名,按真实的剂量/程度顺序排好再传。"),

    _s("trend_not_estimable", "blocking", "线性趋势在算术上不可估计",
       "分组分数没有变异,或事件在所有组里的比例完全相同。",
       "加权线性相关的分母为 0。",
       "此时不存在「趋势」可言;硬算会得到 NaN,而 NaN 一旦进 bundle 就会印出"
       "看起来正常的空结果。",
       "核对分组列与结局列是否选对;若确实各组率完全一致,如实报告「未观察到剂量-反应关系」,"
       "并给出各组的率与例数 —— 那本身就是结论。"),

    _s("engine_internal_error", "blocking", "引擎内部错误",
       "读取或准备数据时遇到未预料的情况。",
       "兜底捕获,异常类型如实带出。",
       "无结果。",
       "按回执里针对该异常类型给出的提示处理;认不出来的情况请反馈。",
       internal=True),
]

# ══ capability:引擎没有实现(**我们的缺口**,不是用户数据的问题)═══════════════
_CAPABILITY = [
    # ✅ **三组比较已于 2026-08-06 实现**(P1 族①:ANOVA / Welch ANOVA / Kruskal-Wallis
    #    + Tukey HSD / Games-Howell / Dunn + 字母标记)。
    #    这张卡改成「分组数超出全部方法卡的声明范围」—— 它现在只在**更极端**的情况下触发
    #    (例如某天有了只吃 3~5 组的方法而数据有 20 组)。
    #    刻意不删卡:能力面是会变的,而「引擎做不了某个分组数」这件事本身会一直存在。
    _s("unsupported_design", "capability", "没有方法卡吃得下这个分组数",
       "注册表里全部(未禁用的)方法卡都不支持当前的分组数与设计单位组合。",
       "按每张卡的 group_levels 与 units 求并集,取不到任何一张。",
       "🔴 **不要把它拆成两两子集分别跑两组比较** —— 每次比较都用被截短的数据,"
       "合并方差估计与真正的事后检验不同;而且拆 k 组做 C(k,2) 次比较,族错误率会失控"
       "(三组做 3 次两两比较,α 从 .05 实际膨胀到约 .14)。"
       "审稿人看到多行独立的 t 检验会直接打回。",
       "如实告诉用户当前这个设计做不了,并给替代路径(SPSS「分析-一般线性模型」;"
       "R 的 `aov()` / `lme4`)。**做不了就说做不了,这比给一个错的结果有用。**"),

    # ⚠️ `binary_outcome` 曾是本目录里最贵的一张 capability 卡(分类结局硬拒)。
    #    2026-08-07 分类资料族(D-10~D-14)落地后,那道闸退休,这条 reason **不再产生**。
    #    卡片保留在目录里,是因为 SKILL.md / 系统提示词曾长期教模型认它 ——
    #    老会话与老文档里还会提到。内容改写成「已经实现」,让任何读到它的人当场知道现状,
    #    而不是照着一张过期的卡去建议用户改用 SPSS。
    _s("binary_outcome", "capability", "分类结局的比较(**已实现,此卡已退役**)",
       "历史卡片:引擎曾对二分类结局硬拒。现已实现卡方 / Fisher / McNemar / 趋势检验。",
       "该判据已从主流程移除,引擎不会再产出这个 reason。",
       "无。留卡只为让引用过它的旧文档/旧会话能查到现状。",
       "直接跑 StatRun 即可;结局是文本(有效/无效)或 0/1 编码都能识别。"
       "想指定哪个水平算「事件」用 `--positive`;分组有序(低/中/高)用 `--group-order` 走趋势检验。",
       internal=True, retired=True),

    _s("rxc_expected_too_small", "capability", "R×C 表的精确检验尚未实现",
       "多于 2×2 的表期望频数不达标时,理论上该用 Fisher-Freeman-Halton 精确检验。",
       "行或列数 >2 且 expected_ok 为 false。",
       "🔴 引擎**刻意不做**这一档:scipy 的 R×C 精确分支是蒙特卡洛,实测同一张表连跑三次得 "
       "0.0061 / 0.0057 / 0.0056 —— 与交付物承诺的「重跑得到同一个数」直接冲突,"
       "而复现不了的 p 值比没有 p 值更糟。",
       "两条路:① **合并类别**(把例数过少的水平并入相邻水平)后重跑 —— 这是首选,"
       "但合并哪些类是**方法学决定**,要问用户并写进 Methods;"
       "② 仍用 χ² 但在 Methods 里如实披露期望频数不足(引擎会自动披露)。"
       "另有 SPSS 的「精确检验」模块与 R 的 `fisher.test(simulate.p.value=FALSE)` 可作替代路径。"),

    _s("paired_multi_level", "capability", "配对多分类比较尚未实现",
       "配对设计 + 结局多于两个水平,需要 Bowker 对称性检验或 Stuart-Maxwell 边际齐性检验。",
       "paired=true 且结局水平数 >2。",
       "McNemar 只处理 2×2;硬套到多水平表上会只看其中两格,把其余变化全部丢掉。",
       "① 若关心的其实是「有效 vs 其它」,把结局二分后重跑;"
       "② 确需多水平配对检验 → 给替代路径(R 的 `DescTools::StuartMaxwellTest`、"
       "SPSS「交叉表-McNemar-Bowker」),**不要拆成多次 2×2** —— α 会失控。"),

    _s("not_two_levels", "capability", "配对比较需要恰好两个水平",
       "配对分析按 subject × 时点 透视后,时点数不等于 2。",
       "pivot_table 之后的列数 != 2。",
       "多于两个时点需要重复测量方差分析(RM-ANOVA),尚未实现;"
       "少于两个通常意味着**数据是宽表**(前测一列、后测一列),而引擎要长表。",
       "① 数据是宽表 → 先 melt 成长表:每人两行,一列标时点、一列放数值;"
       "② 确实是三个及以上时点 → 当前做不了,给替代路径(SPSS「重复度量」、R 的 `ez::ezANOVA`),"
       "**不要拆成多次两两配对 t** —— 与多组比较同理,α 会失控。"),
]

# ══ advisory:能算,但结论可疑 —— **这一档归模型决定** ═══════════════════════════
_ADVISORY = [
    _s("sentinel_values", "advisory", "因变量里出现疑似缺失编码",
       "999 / 9999 / 888 这类值是 SPSS、Epidata、流行病学问卷里最常见的缺失编码。",
       "扫因变量是否等于 999/9999/99999/888/8888 及其负值。",
       "🔴 后果不是报错而是**静默换方法**:极端值会打崩正态性检验,"
       "前提分流从参数走到非参数,p 值可以差出几个数量级 —— 两条路都跑得通、都不报错。"
       "实测:一例 999 让方法从配对 t 变成 Wilcoxon,p 从 4.2e-06 变 3.6e-04。",
       "把 `why` 与 `impact` 如实转述给用户并问清这些值是什么。"
       "若是缺失:改成空值后重跑(**不要填 0** —— 0 是个会参与计算的真值,比 999 更隐蔽;"
       "也不要手动删整行,配对分析的 listwise 会自己对齐)。",
       if_proceed_zh="这些值会作为真实测量值参与计算,并可能改变所选的检验方法。",
       accept_key="sentinel_ok",
       disclose_zh="因变量中的 {detail} 经确认为真实测量值,未作缺失处理。"),

    _s("excessive_exclusion", "advisory", "listwise 剔除比例过高",
       "按整例删除处理缺失后,丢掉的行数超过 20%。",
       "(n_before − n_used) / n_before > 0.2,并归因到缺失最多的那一列。",
       "🔴 若缺失集中在**分组列/配对列**,几乎必然是**排版**问题而不是真缺失 —— "
       "一个受试者「没有组别」在语义上就不成立。最常见来源是 Excel 的合并单元格"
       "(或「同一组只在第一行敲一次组名」):pandas 读进来时只有每个合并块的首行有值。"
       "实测:60 行的表因此只剩 12 行,而所有机械检查全绿、Methods 只写「共 48 例因缺失被剔除」。",
       "分组列缺失 → 让用户取消合并单元格并向下填充"
       "(选中该列 → 取消合并 → Ctrl+G 定位空值 → 输入 `=上一格` → Ctrl+Enter),另存后重跑。"
       "因变量缺失 → 确认来源(未测/失访/录入遗漏),并考虑是否需要报告缺失机制。",
       if_proceed_zh="分析将基于剩余样本进行,n 会显著小于原始数据。",
       accept_key="missing_ok",
       disclose_zh="共 {excluded}/{n_before} 例因关键变量缺失被剔除(整例删除),分析基于剩余 {n_used} 例。"),

    _s("multiple_sheets", "advisory", "Excel 里有多个有数据的工作表",
       "这份 xlsx 有不止一个非空工作表。",
       "openpyxl 逐表读首行判非空。",
       "🔴 默认只读第一个会**静默分析错对象** —— 用户以为分析的是他要的那个指标,"
       "实际是排在最前面的那个。实测事故:5 次 read_excel 都没传 sheet_name,"
       "把「咸味强度」当「总体喜好度」全程交付,而整条链路(长表→bundle→三线表→Methods)"
       "**数字全部自洽、可复现**,比模型自己瞎算更危险。",
       "先 `pd.ExcelFile(path).sheet_names` 列出全部工作表,"
       "**在用户可见的文本里说明你选了哪一个、为什么**,再传 `sheet` 参数。",
       if_proceed_zh="将分析你指定的那个工作表(未指定则取第一个)。",
       accept_key="sheet",
       disclose_zh="数据取自工作表「{sheet}」。"),

    _s("ambiguous_group_labels", "advisory", "分组标签只差空白/大小写/全半角",
       "两个组名去掉首尾空白、统一全半角与大小写之后完全相同。",
       "NFKC 规范化 + strip + casefold 后比对。",
       "几乎可以肯定是录入不一致。若照原样分析,三线表会渲染出**两行同名的组**,"
       "读者无从分辨哪行是哪组。",
       "确认这些写法是否指同一组:是 → 统一成一种写法后重跑;否 → 改成能区分的组名。",
       if_proceed_zh="两个标签会被当作两个不同的组,三线表可能出现同名行。",
       accept_key="labels_ok",
       disclose_zh="分组标签 {detail} 经确认为不同的组。"),

    _s("duplicate_pair_cells", "advisory", "同一受试者在同一水平有多条不同取值",
       "配对分析要求每个受试者在每个水平上只有一条测量。",
       "按 (subject, 水平) 分组,取值个数 > 1。",
       "🔴 照原样分析时引擎只取**文件里靠前的那一条**,结果因此**依赖行序** —— "
       "同一份数据重新排序就会得到不同的 p 值、甚至换掉所用的检验方法,而且全程没有提示。"
       "实测:同样 25 行、只把重复行换个位置,p 从 1.3e-10 变成 0.027,检验从配对 t 变成 Wilcoxon。",
       "确认这些格子该取哪个值:① 录入错误 → 删掉错的那条;"
       "② 复测/多次测量 → 按事先定好的规则(取基线/均值/末次)汇总成一条,**并把这条规则写进 Methods**;"
       "③ 其实是两个不同的人 → 把配对标识改成能区分的。"
       "⚠️ 回执只给行号不给配对键的值:配对键常常是住院号/学号这类个人标识,引擎不把它读进对话。",
       if_proceed_zh="引擎将取文件中靠前的那一条,结果依赖行序。",
       accept_key="duplicates_ok",
       disclose_zh="{n_cells} 个重复记录按文件中首次出现的取值纳入分析。"),

    _s("pairwise_split_detected", "advisory", "多组设计正被拆成两两子集",
       "同一个因变量上,本会话此前比较过的组集合与本次有交集但不相同。",
       "扫 analysis/ 下已有 bundle 的 (dv, groups) 组合。",
       "🔴 这与真正的事后多重比较**不是一回事**:①事后检验用全部组的合并方差估计,"
       "拆开后每次只用两组的数据,自由度与标准误都不同;"
       "②三组做 3 次两两比较,α 从 .05 实际膨胀到约 .14,而拆开跑时每份报告都以为自己是独立的一次检验。",
       "如实告诉用户当前做不了多组比较,给替代路径(SPSS 单因素 ANOVA + 事后检验;R 的 aov + TukeyHSD)。"
       "若这两次比较**确实**是两个互相独立的研究问题(不同人群、不同实验),用 `independent_study` 声明。",
       if_proceed_zh="将照常计算,但多重比较记账会把它们算进同一个族,且 Methods 段会披露这次拆分。",
       accept_key="independent_study",
       disclose_zh="⚠️ 本会话对同一因变量做了多次两两比较,族水平错误率未受控;"
                   "这些结果不应作为事后多重比较报告。"),

    # 🔴 档位从 advisory 降回 capability(2026-08-07)。
    #
    # 它此前标着 `advisory` + `accept_key: accept_method`,而 `accept_method` 这个参数
    # **在整条链路上根本不存在**(run_analysis 没有形参、CLI 不解析、StatRun 不透传)。
    # 也就是说:情况目录在告诉模型「传这个参数就能继续」,而那个参数会被静默丢弃 ——
    # 一张**承诺了不存在通道**的 advisory 卡,比标成硬拒更糟:模型会照做,然后什么都没发生。
    #
    # 「要不要真开 accept 通道」是产品决定(它等于让模型可以越过实测前提选方法),
    # 在决定之前,卡片必须如实说明现状。
    _s("not_in_allowlist", "capability", "指定的方法不在引擎按实测前提给出的候选集里",
       "引擎实测前提后按决策表给出候选白名单,你指定的方法不在其中。",
       "requested 不在命中规则的 allowed[] 里。",
       "🔴 **这一条归你决定** —— 引擎给的是建议不是命令。但要知道代价:"
       "候选集是按**实测的前提**定的(如 Levene p<.05 时不建议 Student t),"
       "越过它意味着在一个已知不满足的前提下做推断,审稿人问「你怎么检验的正态性/方差齐性」时,"
       "依据链里会出现矛盾。",
       "两条路:① 采纳候选集里的方法(引擎已按依据给出推荐);"
       "② 确有方法学理由坚持 —— 用 `accept_method` 显式声明,并**在 Methods 里写明理由**。"),

    # 同上:`accept_method` 通道不存在,如实标成 capability。
    _s("no_rule_matched", "capability", "现有决策规则都没命中",
       "当前的事实组合(分组数/配对与否/前提检验结果)不落在任何一条决策规则里。",
       "逐条求值 rules 的 when 表达式,无命中。",
       "说明研究设计的某一项还没问清楚 —— 最常见的是 `paired`(配对与否直接换检验,"
       "而数据表面上看不出来:同样是两列数字)。",
       "回去问用户缺的那一项,**不要猜一个**。"
       "这一步恰恰是全行业都没做的:模型在给定完整场景描述时选得很好,给定原始数据却选错 38.4%,"
       "差的就是「把研究设计问出来」。"),
]

CATALOG: dict[str, Situation] = {s.id: s for s in (*_BLOCKING, *_CAPABILITY, *_ADVISORY)}


def get(sid: str) -> Situation | None:
    return CATALOG.get(sid)


def payload(sid: str, **extra: Any) -> dict[str, Any]:
    """按情况 id 组装标准 payload。

    统一形状,让模型只需要学一次:
        ok / reason / severity / title_zh / why_zh(meaning+detect)/ impact_zh /
        next_zh / if_proceed_zh / accept_key / evidence(调用方给的实测数字)
    """
    s = CATALOG.get(sid)
    if s is None:                       # 目录外的 id(技术性错误)—— 不硬失败,但形状保持一致
        return {"ok": False, "reason": sid, "severity": "blocking", **extra}
    # 🔴 字段名沿用引擎既有的 `why_zh` / `impact_zh` / `hint_zh`,**不另起新名**。
    #    卡片内部叫 next_zh 是为了让「五件事」读起来齐整,但对外必须是模型已经学过的那套 ——
    #    改名对模型是破坏性的(SKILL、既有回执、E2E 用例全按老名字写),
    #    而这次架构调整的目的是让引擎**更好用**,不是让模型重新学一遍接口。
    #    新增的只有 severity / title_zh / if_proceed_zh / accept_key / model_decides,
    #    所以新 payload 是旧形状的**超集**。
    out: dict[str, Any] = {
        "ok": False,
        "reason": s.id,
        "severity": s.severity,
        "title_zh": s.title_zh,
        "why_zh": s.meaning_zh + "\n判据:" + s.detect_zh,
        "impact_zh": s.impact_zh,
        "hint_zh": s.next_zh,
    }
    if s.severity == "advisory":
        out["if_proceed_zh"] = s.if_proceed_zh
        out["accept_key"] = s.accept_key
        out["model_decides"] = True
    out.update(extra)                   # evidence:调用方给的实测数字,覆盖同名键
    return out


def as_json() -> list[dict[str, Any]]:
    """`statkit situations --json` 的内容 —— 模型可主动查询的完整情况目录。"""
    return [s.to_dict() for s in CATALOG.values()]
