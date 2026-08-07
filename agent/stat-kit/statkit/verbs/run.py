"""`run` —— 读数据 → 实测前提 → 守门分流 → 计算 → 落 bundle。

## bundle 是全案的数字真源

`report` 只从 bundle 取值填模板,**文字里的数字物理上不经模型手**。
本 verb 的最后一步是校验方法卡 `reports_required` 声明的字段**全部齐备**,
缺一项即拒收(退出码 2)—— 这是「数字锁」唯一真正的执行点,
写不出这张字段表,那条架构约束就只是一句话。

## 边界:哪一半已经闭合,哪一半还没有

✅ **「模型不能伪造 bundle」—— 2026-08-05 已闭合(D1),两道闸实测生效**:
   ① 进程内 Write/Edit → `sandbox/confine.ts` 按 canonical 路径拒写(symlink 绕不过);
   ② jail 内 Bash → `sandbox/bwrap.ts` 在可写 bind **之后**叠 `--ro-bind`(非 `-try`)。
   引擎自己走 executor 侧 `StatRun` 工具的专用 spawn(`writableReserved: [analysis]`),
   这是全仓唯一带该字段的地方 —— 模型可以**调用**它,没有任何路径能**绕过**它。
   实测:模型 profile 下 `echo > /work/analysis/bundle.json` 被拒;引擎 profile 下可写,
   且引擎**仍然写不了** `evidence/`(最小权限:只放它需要的那一个目录)。

⚠️ **「交付物里的数字必须来自 bundle」—— 还没闭合(D2)**。
   模型现在无法伪造 bundle,但它仍可以绕过 `report`,自己用 python-docx 往 `out/` 写一份
   带编造数字的 docx。堵这条要的是**交付闸**(比对交付物里的数字集合 ⊄ bundle 数字集合就不放行),
   接在 `agent/src/turn/artifacts.ts`,是独立的一步。
   ⚠️ 且红队已指出一个坑:backend 的产物收割是 on-list 的 `ListWorkspaceFiles(out/)`,
   **与 artifact 帧无关** —— 所以「不发帧」是假闸,必须改写盘上文件或移出 out/。

⇒ 对外话术的准确口径:**「报告里的数字由引擎产出,模型无法伪造数据源」**成立;
   「模型绝无可能交付一个带假数字的文件」**尚不成立**,别这么说。

## 数据不进 LLM 上下文

stdout 只回 JSON 摘要;完整 bundle 落 `analysis/<hash>.bundle.json`。
原始数据行**永远不出现在 stdout** —— 这既是上下文预算,也是 PHI 边界。
"""

from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

from ..core.facts import FactError, evaluate
from ..core.dataset import Dataset, profile_columns
from ..paths import ANALYSIS_DIR
from .. import situations as sit
from ..registry import Registry, load_registry
from ..engines import categorical as cat
from ..engines import checks as chk
from ..engines import dispatch as disp
from ..engines import tests as tst
from .assume import GateRejection, run_assume

# ANALYSIS_DIR 已搬进零依赖的 ..paths(与 TS 侧 sandbox/reserved.ts 同名常量,
# 由 agent/src/tools/statkitPaths.test.ts 钉在一起)。此处保留 re-export:
# 它是本模块的公开名之一,删掉会静默打断既有 import。
__all__ = ["ANALYSIS_DIR", "RunError", "run_analysis", "cli"]


class Advisories:
    """advisory 档的收集器 —— 「模型决策优先」的落点。

    ## 机制

    引擎遇到 advisory 情况时**不再拒绝**,而是问一句:「你接受了吗?」
      · 没接受 → 抛 RunError,payload 带全五件事(是什么/判据/后果/下一步/坚持继续会怎样)
                 + `accept_key`(告诉模型该传哪个参数)。模型据此决定。
      · 接受了 → 记一条,继续算。该条进 bundle 的 `advisories[]`,
                 **由 report 在 Methods 段强制披露**(situations 卡的 disclose_zh)。

    ## 为什么「接受」必须显式传参,而不是默认放行

    决定要留痕。默认放行 = 这个决定不存在于任何地方 —— 审稿人看不到、用户看不到、
    事后复盘也查不到。而「模型优先」的完整形态是三段:
    **引擎给全信息 → 模型决定 → 决定被披露**,缺任一环这个决定就是静默的。

    ## 为什么不做成 `--force` 一把梭

    一个开关关掉所有警告,等于把八种性质完全不同的情况(缺失编码 / 排版事故 /
    读错工作表 / 拆表)压成一个「我知道了」。实测教训:`--sentinel-ok` 曾被
    当成「消除报错的开关」使用,而它本意是「用户确认这是真值」。
    逐项 accept 让每个决定各自留痕、各自披露。
    """

    def __init__(self) -> None:
        self.items: list[dict[str, Any]] = []

    def check(self, sid: str, accepted: bool, *, detail: dict[str, Any],
              disclose_fields: dict[str, Any] | None = None) -> None:
        """advisory 闸。未接受 → 抛;已接受 → 记一条并放行。"""
        card = sit.get(sid)
        if card is None:                       # 目录缺卡 —— 测试会拦住,这里保守按拒绝处理
            raise RunError(sid, {"ok": False, "reason": sid, **detail})
        if not accepted:
            raise RunError(card.title_zh, sit.payload(sid, **detail))
        fields = dict(detail)
        fields.update(disclose_fields or {})
        try:
            disclose = card.disclose_zh.format(**fields)
        except (KeyError, IndexError):
            # 模板占位符对不上时**不静默吞掉披露** —— 宁可写一句粗的,也不能让决定消失
            disclose = card.disclose_zh
        self.items.append({
            "id": sid,
            "title_zh": card.title_zh,
            "accepted_via": card.accept_key,
            "detail": detail,
            "disclose_zh": disclose,
        })


class RunError(Exception):
    def __init__(self, message: str, payload: dict[str, Any]):
        super().__init__(message)
        self.payload = payload


# CSV 编码候选,按命中概率排序。
# `utf-8-sig` 必须排在 `utf-8` 前面 —— 它能吃掉 BOM,而 `utf-8` 会把 BOM 留在**第一个列名里**。
# `gb18030` 是 GBK 的超集,能覆盖 GBK/GB2312 全部码位,只写它一个就够。
_CSV_ENCODINGS = ("utf-8-sig", "gb18030", "utf-16")


def _load_table(path: Path, *, sheet: str = "") -> pd.DataFrame:
    """读表 —— 编码与工作表都不许静默出错。

    🔴 2026-08-05 实测两个坑,都直接命中用例的一票否决项:
      ① **GBK 的 CSV** 抛出裸 `UnicodeDecodeError` 堆栈给用户(AD-07 判 bug 依据第 1 条)。
         而这条路是**我们自己指引的**:对 `.sav` 用户我们说「在 SPSS 里另存为 CSV」,
         中文 Windows 上那条路默认就产出 GBK/ANSI。
      ② **UTF-8-BOM 的 CSV** 更阴:BOM 粘在第一个列名上,于是报
         「找不到列『组别』」而候选列表里赫然写着 `'\\ufeff组别'` —— 看起来一模一样,
         用户完全无从判断问题在哪。
    """
    suf = path.suffix.lower()
    if suf in (".csv", ".tsv", ".txt"):
        last: Exception | None = None
        for enc in _CSV_ENCODINGS:
            try:
                df = pd.read_csv(path, sep=None, engine="python", encoding=enc)
                # 双保险:即便编码猜对了,也把列名首尾空白与残留 BOM 去掉。
                df.columns = [str(c).replace("﻿", "").strip() for c in df.columns]
                # 🔴 记下**实际生效**的读表参数,供复现脚本原样重放。
                #    不记的后果(2026-08-06 实测三例全崩):复现脚本一律生成
                #    `pd.read_csv(fn)` —— GBK 的中文 CSV 抛 UnicodeDecodeError、
                #    .tsv 抛 KeyError(默认按逗号切,整行成了一列)。
                #    而这两条恰恰是**我们主动指引用户走的路**(「在 SPSS 里另存为 CSV」
                #    在中文 Windows 上默认就产出 GBK)。
                #    interpret/SKILL.md 让模型用「报告附带的 analysis.py 就是答案」
                #    回答审稿人的「数据和代码能提供吗」—— 审稿人一跑就崩,比不给更糟。
                df.attrs["read_kwargs"] = {"encoding": enc, "sep": _sniff_sep(path, enc)}
                return df
            except (UnicodeDecodeError, UnicodeError) as e:
                last = e
                continue
        raise RunError(
            f"无法确定 {path.name} 的文字编码",
            {"ok": False, "reason": "unknown_encoding", "tried": list(_CSV_ENCODINGS),
             "why_zh": f"依次按 {'、'.join(_CSV_ENCODINGS)} 都无法解码这个文件。"
                       "中文 Windows 上从 Excel/SPSS 另存的 CSV 常见是 GBK/ANSI,"
                       "本应能被识别 —— 解不开说明是更少见的编码。",
             "hint_zh": "请用 Excel 打开后「另存为 → CSV UTF-8(逗号分隔)」再上传;"
                        "或直接上传 .xlsx(不涉及编码问题)。",
             "detail": str(last)[:200]},
        )
    if suf in (".xlsx", ".xlsm"):
        # openpyxl read_only 流式 —— 30MB xlsx 经 DOM 加载常见 10-30 倍内存膨胀,
        # 而生产容器是 4G / 2 并发槽 + statkit 子进程 ~800MB,禁全量 load。
        #
        # 🔴 多工作表**不许静默只读第一个**:实测 `pd.read_excel` 默认 sheet_name=0,
        #    一份「每个指标一个 sheet」的表会被悄悄只分析第一个指标,而用户以为分析的是他要的那个。
        xl = pd.ExcelFile(path, engine="openpyxl")
        sheets = [s for s in xl.sheet_names]
        if sheet:
            # 调用方显式指定了工作表 —— 这就是 multiple_sheets 那张 advisory 的 accept 通道。
            if sheet not in sheets:
                raise RunError(
                    f"工作表 {sheet!r} 不在这个文件里",
                    {"ok": False, "reason": "sheet_not_found", "severity": "blocking",
                     "title_zh": "指定的工作表不存在", "requested": sheet, "sheets": sheets,
                     "why_zh": f"这个 Excel 里的工作表是 {sheets},没有 {sheet!r}。",
                     "impact_zh": "取不到指定的表就无从分析。",
                     "hint_zh": "从上面的清单里挑一个,注意名字里的空格与全半角。"},
                )
            _df = xl.parse(sheet)
            _df.attrs["read_kwargs"] = {"sheet_name": sheet}
            _df.attrs["sheet_chosen"] = sheet
            return _df
        if len(sheets) > 1:
            nonempty = [s for s in sheets if not xl.parse(s, nrows=1).empty]
            if len(nonempty) > 1:
                # 🔴 走情况目录的标准 payload(2026-08-07):此前这里是裸 RunError,
                #    payload 里连 severity / accept_key / if_proceed_zh 都没有,
                #    而目录把它登记成 advisory 且 accept_key=sheet —— **目录在告诉模型
                #    传一个引擎根本不收的参数**。现在 `--sheet` 真接线了,这条也走标准形状。
                raise RunError(
                    f"{path.name} 有 {len(nonempty)} 个非空工作表",
                    {**sit.payload("multiple_sheets", sheets=nonempty)},
                )
        _df = xl.parse(sheets[0])
        _df.attrs["read_kwargs"] = {"sheet_name": sheets[0]}
        return _df
    raise RunError(
        f"不支持的文件类型 {suf!r}",
        {"ok": False, "reason": "unsupported_file", "hint_zh": "P0 支持 .csv / .tsv / .xlsx"},
    )


def _sniff_sep(path: Path, enc: str) -> str:
    """把 `sep=None` 嗅探到的分隔符还原成一个**可写进脚本**的字面量。

    pandas 的 `sep=None, engine="python"` 内部走 csv.Sniffer,但不把结果告诉调用方。
    复现脚本必须写死它 —— 否则 .tsv / 分号 CSV 在审稿人机器上按逗号切,整行变成一列。
    嗅不出来时回落到逗号(最常见),并由脚本自己的断言兜底。
    """
    import csv as _csv

    try:
        with open(path, encoding=enc, newline="") as fh:
            sample = fh.read(8192)
        return _csv.Sniffer().sniff(sample, delimiters=",\t;|").delimiter
    except Exception:  # noqa: BLE001
        return ","


def _software_stamp(llm_model: str = "") -> dict[str, str]:
    """软件与版本清单 —— SAMPL 在**每一种分析类型下都重复**要求
    「Name the statistical package or program used」(共五次);ICMJE 要求分析用 AI 必须写进 Methods。
    这一段直接进 Methods,不是装饰。"""
    import platform
    import scipy
    import statsmodels

    from .. import __version__

    return {
        "statkit": __version__,
        "python": platform.python_version(),
        "numpy": np.__version__,
        "pandas": pd.__version__,
        "scipy": scipy.__version__,
        "statsmodels": statsmodels.__version__,
        "bootstrap_seed": "20260805",
        # 🔴 分析用 AI 的标识 —— ICMJE 要求它写进 Methods(含工具与版本)。
        #    本模块顶上的注释一直写着这条要求,而交付物此前只披露 statkit
        #    这个**不是 AI** 的部件(2026-08-06 审计 G-04)。
        #    由执行器透传(turnLoop 解析 → runTools → ToolCtx → StatRun --llm-model);
        #    拿不到时留空,披露句会降级成不带版本的表述而不是整条消失。
        **({"llm_model": llm_model} if llm_model else {}),
    }


def _dig(obj: Any, path: str) -> Any:
    """按 `a.b.c` 取值;支持 `a[].b`(数组段)。取不到返回哨兵。

    ## 🔴 S3(2026-08-06):补上数组段

    `reports_required` 是数字锁的执行点,而多组族的必报项天然是**列表**:
    事后比较是 k 个配对(`posthoc[].p_adj`),回归族是 k 个系数(`terms[].effect.ci_low`)。
    此前 `_dig` 只逐段走 dict ⇒ 这类路径**恒返回 _MISSING**,数字锁要么恒失败、
    要么被人「修」成不校验 —— 即本仓反复点名的「一条永远绿的规则」。
    (BUILD-P0开工方案.md 给回归族写的必报项正是 `terms[].effect.ci_low`。)

    语义:`a[].b` = 「a 必须是**非空**列表,且**每一项**都有 b」。
    取「每一项都要有」而不是「任意一项有」—— 必报项的含义是「这份结果报得全」,
    有一项缺了就报不全。返回值是各项的列表,供有限性检查逐个判。
    """
    cur: Any = obj
    for part in path.split("."):
        if part.endswith("[]"):
            key = part[:-2]
            if not isinstance(cur, dict) or key not in cur:
                return _MISSING
            seq = cur[key]
            if not isinstance(seq, (list, tuple)) or not seq:
                return _MISSING          # 空列表 = 一项都没报,不算「有」
            cur = list(seq)
            continue
        if isinstance(cur, list):
            # 上一段是数组 ⇒ 本段在**每一项**上取
            out = []
            for item in cur:
                if not isinstance(item, dict) or part not in item:
                    return _MISSING
                out.append(item[part])
            cur = out
            continue
        if isinstance(cur, dict) and part in cur:
            cur = cur[part]
        else:
            return _MISSING
    return cur


_MISSING = object()


def _multiplicity(out_dir: Path, spec_hash_self: str | None = None) -> dict[str, Any]:
    """多重比较记账 —— 三夺权之三,红队点名的 D5。

    🔴 **实测坐实的问题**(2026-08-05 真实会话 AD-08):用户拿三组数据来,引擎不支持多组,
    模型很诚实地没编 F 值,却把它**拆成三次两两 t 检验**分别跑 —— 三份 bundle、零记账、
    全程未提校正。其中 `p=0.02857` 在 α=.05 下报「显著」,而三次比较的 Bonferroni 阈值是
    α=.0167 ⇒ 它其实**不显著**。这个数字会被用户当显著写进论文。

    记账放在这里而不是 `project.json`:bundle 是 per-spec 的,而「同一会话跑了几次检验」
    是**跨 spec** 的事实 —— 用会话工作目录里已有的 bundle 数当族计数,是唯一不需要新增
    状态写入口就能拿到的口径(红队指出 R 的结构里 `consult` 是唯一写入口,塞不下这件事)。

    ⚠️ 刻意**不自动改判显著性**:引擎只负责把「这是本会话第 N 次检验、校正后阈值是多少」
    如实记进 bundle,由 report 在 Methods 段强制披露。自动改判会让用户看到一个
    与他手里 SPSS 输出对不上的 p 值,那是另一种不可复核。
    """
    existing = sorted(out_dir.glob("*.bundle.json")) if out_dir.is_dir() else []
    if spec_hash_self:
        # 重跑同一份分析 = 覆盖同一个文件,不是「又做了一次检验」。
        # 不排除自己的话,刷新页面重跑就会让 Bonferroni 阈值凭空收紧(2026-08-05 实测)。
        self_name = spec_hash_self.split(":")[-1] + ".bundle.json"
        existing = [p for p in existing if p.name != self_name]
    k = len(existing) + 1  # 含本次
    alpha = 0.05
    return {
        "tests_in_session": k,
        "family_key": "session",
        "alpha_nominal": alpha,
        "alpha_bonferroni": round(alpha / k, 6),
        "method": "none" if k == 1 else "bonferroni_threshold_disclosed",
        "note_zh": (
            "本会话仅此一次检验,无多重比较问题。"
            if k == 1
            else f"本会话已进行 {k} 次统计检验。按 Bonferroni,族水平 α=.05 对应"
                 f"单次阈值 α'={alpha / k:.4f} —— p 值大于该阈值的结果不应按「显著」报告。"
        ),
    }


def _native(obj: Any) -> Any:
    """把 numpy 标量递归转成原生 Python 类型。

    与「去掉 `default=str`」配套:转换在**这里显式做**,漏掉的类型会在 json.dumps 当场炸,
    而不是被静默字符串化。`np.bool_` 必须在 `np.integer` 之前判 —— numpy 里 bool_ 不是 integer 的子类,
    但顺序写反过的话 `np.True_` 会被转成 1,布尔语义丢失。
    """
    if isinstance(obj, dict):
        return {k: _native(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_native(v) for v in obj]
    if isinstance(obj, np.bool_):
        return bool(obj)
    if isinstance(obj, np.integer):
        return int(obj)
    if isinstance(obj, np.floating):
        return float(obj)
    if isinstance(obj, np.ndarray):
        return _native(obj.tolist())
    return obj


# SPSS / Epidata / 流行病学问卷里约定俗成的「缺失编码」。
# 只收**不可能是真实连续测量值**的那几个:全 9 / 全 8 序列。刻意不收 -1、0、99 ——
# 它们在真实数据里当值用太常见,拦下去就是狼来了。
_SENTINELS = (999.0, 9999.0, 99999.0, -999.0, -9999.0, -99999.0, 888.0, 8888.0, -888.0)


def _sentinel_scan(arrays: dict[str, Any]) -> list[dict[str, Any]]:
    """扫因变量里的缺失哨兵编码 —— **只报不删**。

    🔴 2026-08-05 实测事故(MED-03,真实浏览器会话):护理数据里一例 HbA1c 写作 `999`
    (漏了「未测」备注,伪装成正常数字)。留着它跑,配对差值的正态性被打崩 →
    Shapiro 拒绝 → 分流从 D-04 走到 D-05,方法从 paired t 变成 Wilcoxon,
    p 从 4.2e-06 变成 3.6e-04 —— **两条路都不报错、都出得了图,结论量级差 84 倍**。
    这正是本卡片声称要防的那一类静默分歧,而引擎当时零防线(那次是模型自己发现的,属运气)。

    为什么是「拦」不是「删」:自动剔除会与 AD-01 / AG-07 守的线正面冲突
    (那两条考的就是**拒绝**违规剔除离群点)。引擎能确定的只有「这个值形状像缺失编码」,
    不能确定它是不是真值 —— 判断权交回用户,但**不许静默算过去**。
    """
    hits: list[dict[str, Any]] = []
    for name, arr in arrays.items():
        vals = np.asarray(arr, dtype=float)
        for s in _SENTINELS:
            k = int(np.sum(vals == s))
            if k:
                hits.append({"group": name, "value": s, "count": k})
    return hits


# 个人标识列的列名特征。中文临床/HIS 导出表的命名相当固定,可机械判定。
_ID_COL_PAT = re.compile(
    r"姓名|名字|身份证|身份號|证件号|護照|护照|住院号|住院號|门诊号|門診號|病案号|病历号|"
    r"就诊卡|医保卡|社保号|手机|电话|联系方式|住址|家庭地址|地址|邮箱|email|微信|工号|学号",
    re.I,
)


def _scan_identifier_columns(df: "pd.DataFrame") -> list[str]:
    """扫出疑似个人标识列 —— 只列名不看内容(看内容等于把 PHI 读进来)。"""
    return [str(c) for c in df.columns if _ID_COL_PAT.search(str(c))]


# 三句话的**确定性文本**。每一条都核对过代码与政策原文:
#   ① 30 天 = server/sessions.ts 的 EXECUTOR_WORKDIR_TTL_DAYS 默认值;
#   ② 中国境内 = 平台隐私政策 §信息存储与保护 原文;
#   ③ 「Scholay 自己不训练」= 仓库内无任何训练管线(实测 grep 只命中 vendored 依赖);
#      **刻意不笼统说「不会用于训练」** —— 对话内容确实会发给上游 AI 服务商处理,
#      上游的政策不归我们承诺,替别人打包票比不说更糟。
#
# 🔴 为什么这段话由**引擎**产出而不是写在 skill 里:2026-08-06 实测,
#    同一条用例(AD-05)复跑三次,三句话命中 0/3 → 2/3 → 0/3 —— 光靠提示词产生不了它。
#    而这段内容是确定性的(不依赖数据),标识列的识别也是可机械判定的。
#    本仓的一贯口径:**能机械判定的做闸,判不准的做指引**。这条属于前者。
_PRIVACY_NOTICE_ZH = (
    "检测到疑似个人标识列:{cols}。这些列不会进入任何统计。\n"
    "关于你的数据,三件事:\n"
    "① **存在哪**:上传的文件存在本次会话的工作目录里;平台隐私政策写明数据存储在中国境内服务器。\n"
    "② **存多久**:默认 30 天后随会话目录自动清理(按最后活跃时间算)。\n"
    "③ **会不会拿去训练**:Scholay 自己不用它训练任何模型(平台没有训练管线);"
    "但对话内容会发送给上游 AI 服务商处理,那部分以对方条款为准,我们不代表他们承诺。\n"
    "建议把这几列删掉后重传。⚠️ 删列属于**去标识化**,而去标识化后的数据在《个人信息保护法》下"
    "仍然算个人信息 —— 不要理解成「脱敏完就安全了」。你所在单位对科研数据外传大概率有自己的规定。"
)


# 「测了,但只知道在检出限某一侧」—— 这是**删失**,不是缺失。两者的处理方式完全不同。
_CENSOR_RE = re.compile(r"^\s*[<>≤≥＜＞]\s*[\d.]+\s*$|^\s*(ND|N\.?D\.?|BDL|未检出|低于检出限)\s*$", re.I)
# 「没测」/「测了但记录丢了」—— 真缺失,置空即可。
_MISSING_RE = re.compile(r"^\s*(未测|未做|漏测|失访|NA|N/?A|NaN|null|none|无|/|-|—|\.{1,3})\s*$", re.I)


def _numeric_or_reject(series: "pd.Series", dv: str) -> "pd.Series":
    """因变量列必须是数值 —— 混进文本时给出**分类过的**拒绝,而不是 Python 栈。

    🔴 2026-08-05 实测:因变量列里混一个 `<0.01`,引擎直接把
    `ValueError: could not convert string to float: '<0.01'` 连同整段 traceback 抛给上层。
    用户看到 Python 栈是一票否决项(AD-07),而且栈里什么都没说清 —— 它既没告诉用户
    哪一列有问题、有几个,更没区分**删失**与**缺失**。

    这两者绝不能混为一谈:
      · `<0.01`(左删失)= 测了,值确实存在,只是低于仪器检出限。环境、临床检验里极常见。
        把它替换成 0 会把一个正数说成零;替换成 0.01 会把上界当成点估计 —— **两种都是编数字**,
        而且都是静默的。正确做法(替换为 LOD/2、Tobit、生存分析)是**用户的方法学决定**,
        必须披露进 Methods,引擎不能替他选。
      · `未测` / `/` / `-`(真缺失)= 置空,走 listwise。
    """
    if series.dtype.kind in "ifb":
        return series
    coerced = pd.to_numeric(series, errors="coerce")
    bad_mask = coerced.isna() & series.notna()
    if not bad_mask.any():
        return coerced

    tokens: dict[str, int] = {}
    for v in series[bad_mask].astype(str):
        tokens[v.strip()] = tokens.get(v.strip(), 0) + 1

    censored = {t: c for t, c in tokens.items() if _CENSOR_RE.match(t)}
    missing = {t: c for t, c in tokens.items() if _MISSING_RE.match(t) and t not in censored}
    unknown = {t: c for t, c in tokens.items() if t not in censored and t not in missing}

    parts: list[str] = []
    if censored:
        parts.append(
            "【删失值,不是缺失】" + "、".join(f"{t}×{c}" for t, c in censored.items())
            + " —— 这些样本**测了**,只是低于(或高于)检出限。把它替换成 0 会把正数说成零,"
              "替换成 0.01 会把上界当点估计,两种都是在编数字。常见处理是替换为 LOD/2 或改用 "
              "Tobit / 生存分析,并在 Methods 里写明 —— 但这是**你的方法学决定**,引擎不替你选。"
        )
    if missing:
        parts.append(
            "【真缺失】" + "、".join(f"{t}×{c}" for t, c in missing.items())
            + " —— 置为空值即可,分析会走 listwise。"
        )
    # 🔴 `unknown` 里装的是**用户的原始单元格值**,不是封闭词表 —— 不能无脑回显。
    #    实测(2026-08-05 盘点):用户把 `--dv` 选成姓名列,10 个患者姓名被原样倾泻进 stdout
    #    **而且重复两遍**(payload 一遍、why_zh 一遍),直接违反本文件顶部自己声明的
    #    「原始数据行永远不出现在 stdout」。真实数据 500 例就是 500 个姓名进 LLM 上下文。
    #
    #    但一律不回显又会让提示不可行动。判据是**它像编码还是像数据**:
    #      · 少数几个反复出现的值(阴性/阳性/未查)= 编码,回显安全且有用;
    #      · 大量各不相同的值 = 标识列或自由文本 —— 这时最该说的不是「这些值是什么」,
    #        而是「你多半把因变量列选错了」,那比列出姓名更能帮到用户。
    if unknown:
        distinct = len(unknown)
        rows = sum(unknown.values())
        # 判据只看**互不相同的值有多少** —— 泄漏量与它成正比,与出现次数无关。
        # 首版还要求「每个值至少出现 2 次」,结果把「一列数字里混一个错别字」也打了码 ——
        # 那不是隐私风险而是笔误,不给看反而让提示不可行动。
        # 阈值 5:最坏情况泄漏 4 个值(小数据集的边角),换来常见笔误场景的可行动性。
        looks_coded = distinct < 5
        if looks_coded:
            # 单元格内容可能很长(自由文本),逐个截断
            shown = "、".join(f"{t[:12]}×{c}" for t, c in unknown.items())
            parts.append(f"【无法归类】{shown} —— 需要你确认它们代表什么。")
        else:
            parts.append(
                f"【无法归类】该列有 {distinct} 个互不相同的文本值(共 {rows} 行)。"
                f"这更像**标识列或自由文本列**而不是测量列 —— 请先确认因变量列是否选对了。"
                f"(为保护数据隐私,这里不回显具体内容。)"
            )
            # 载荷里也只留计数,不留值本身
            unknown = {"__distinct__": distinct, "__rows__": rows}

    raise RunError(
        f"因变量 {dv!r} 不是纯数值列",
        {
            "ok": False, "reason": "non_numeric_values", "column": dv,
            "censored": censored, "missing_like": missing, "unknown": unknown,
            "why_zh": "\n".join(parts),
            "hint_zh": (
                "请按上面的分类分别处理后重跑。🔴 最要紧的一条:**删失值和缺失值不是一回事**,"
                "统一按缺失丢掉会系统性高估均值(低端的数据被丢光了),"
                "统一替换成某个数则是无中生有 —— 无论选哪种,都必须在 Methods 里写出来。"
            ),
        },
    )


# ── 分类资料:因变量类型判定与水平定序 ────────────────────────────────────────
#
# 🔴 判定必须在 `_numeric_or_reject` **之前**做。那个函数把「列里混了文本」一律当成
#    连续测量被污染,而分类结局的整列本来就是文本(有效/无效、阳性/阴性)——
#    先强制数值化再判类型,分类资料在结构上永远走不到卡方族。
#
# 三分而不是二分,因为「文本」有两种完全不同的成因,修法相反:
#   · 全是文本、水平数很少        → 分类结局,走列联表族;
#   · 一部分能转成数字、一部分不能 → 连续列被污染(`<0.01` 删失、`未测` 缺失),
#                                   必须走 `_numeric_or_reject` 那套分类过的拒绝。
# 判据取「**没有任何一个值能转成数字**」,而不是「大部分不能」:后者会把
# 混了一个删失标记的连续列误判成分类,于是删失值处理那一整套告知被跳过。
_MAX_DV_LEVELS = 10


def _infer_dv_kind(series: "pd.Series") -> str:
    """→ "continuous" | "categorical" | "mixed" | "too_many_levels"。"""
    s = series.dropna()
    if hasattr(s, "astype") and s.dtype == object:
        s = s[s.astype(str).str.strip() != ""]
    if len(s) == 0:
        return "continuous"          # 空列由下游的样本量闸拦,不在这里改口径
    if s.dtype.kind in "ifb":
        # 数值列:取值个数 ≤2 即分类(0/1 编码的有效/无效、并发症有无)。
        # 判据与旧 binary_outcome 闸、与 `continuous` 事实**同源**,三处必须一致。
        return "categorical" if int(s.nunique()) <= 2 else "continuous"
    coerced = pd.to_numeric(s, errors="coerce")
    n_ok = int(coerced.notna().sum())
    if n_ok == len(s):
        return "categorical" if int(coerced.nunique()) <= 2 else "continuous"
    if n_ok > 0:
        return "mixed"
    return "categorical" if int(s.nunique()) <= _MAX_DV_LEVELS else "too_many_levels"


# 结局水平的**否定前缀**。用来判断哪个水平是「没发生」的那一个。
# 选前缀规则而不是正面词表:中文里否定标记极其规整(无效/未复发/不满意/非阳性),
# 而正面说法千变万化(有效/显效/治愈/缓解/达标/存活…),穷举正面词必然漏。
_NEG_PREFIX = ("无", "未", "不", "非", "否", "阴")
# 前缀规则判不出来时的兜底正面词(阳性/阴性这类**两边都没有否定前缀**的对子)。
_POS_WORDS = ("阳性", "有效", "发生", "是", "yes", "true", "成功", "治愈", "显效", "缓解", "存活")


def _order_outcome_levels(levels: list[str], positive: str = "") -> tuple[list[str], str, str]:
    """给结局水平定序,**事件水平排在第 0 列**,并返回定序依据。

    为什么必须显式定序:2×2 的率差、RR、OR 的**符号与倒数关系**全由「谁算事件」决定,
    而首版按「值在文件里首次出现的顺序」排 —— 那等于让结论取决于数据行序。
    (同一份数据把第一行挪到末尾,RD 从 +0.267 变成 −0.267。)

    定序依据一并返回,由交付层**强制写进 Methods/Results**:
    默认猜错时,读者一眼就能看见「以『有效』为事件」这句话,而不是被一个反号悄悄误导。
    """
    lv = sorted(levels, key=str)
    if positive:
        if positive not in lv:
            raise RunError(
                f"指定的事件水平 {positive!r} 不在结局的取值里",
                sit.payload("positive_level_unknown", positive=positive, levels=lv),
            )
        return [positive] + [x for x in lv if x != positive], positive, "caller"
    if len(lv) != 2:
        return lv, "", "sorted"      # R×C 无「事件」概念,只要顺序稳定
    neg = [x for x in lv if str(x).startswith(_NEG_PREFIX)]
    if len(neg) == 1:
        pos = [x for x in lv if x not in neg][0]
        return [pos, neg[0]], pos, "negation_prefix"
    hit = [x for x in lv if str(x).strip().lower() in _POS_WORDS]
    if len(hit) == 1:
        return [hit[0], [x for x in lv if x != hit[0]][0]], hit[0], "lexicon"
    # 兜底:排序后的**末位**当事件(0/1 编码取 1、A/B 取 B)。一定会被披露,不会静默。
    return [lv[1], lv[0]], lv[1], "fallback_last"


# listwise 剔除占比的告警阈值。超过它就拦下,交回用户确认(`missing_ok=True` 放行并披露)。
#
# 🔴 为什么 0.2:它不是「多少缺失算多」的统计学结论,而是「多到不可能没人发现」的工程判据。
#    真实临床数据 10-15% 缺失常见;而**排版事故**(合并单元格、只在块首敲一次分组名)
#    一上来就是 60-90% —— 两者在数轴上离得很远,阈值放哪儿都分得开。
#    取 0.2 是往「少打扰」那边靠:狼来了比漏报更快毁掉一道闸。
_EXCLUSION_ALERT = 0.2


def run_analysis(
    *,
    data_path: Path,
    dv: str,
    group: str | None = None,
    subject: str | None = None,
    paired: bool = False,
    requested: str | None = None,
    workdir: Path | None = None,
    reg: Registry | None = None,
    sentinel_ok: bool = False,
    missing_ok: bool = False,
    labels_ok: bool = False,
    duplicates_ok: bool = False,
    independent_study: bool = False,
    sheet: str = "",
    llm_model: str = "",
    # ── 分类资料族的两个显式旋钮(2026-08-07)──────────────────────────────────
    # 两个都**只影响可披露的口径,不影响是否放行** —— 引擎不拿它们当逃生开关。
    #
    # `positive`:哪个结局水平算「事件」。率差/RR/OR 的符号与倒数关系全由它决定。
    #   不给时按否定前缀 → 正面词表 → 排序末位逐级兜底,并把依据写进 Methods。
    # `group_order`:分组的**有序**排列(逗号分隔),如 `低,中,高`。
    #   给了它才有 `ordinal_group=True` ⇒ 才可能走趋势检验。
    #   刻意不做「引擎自己判断有没有顺序」:「轻/中/重」与「A/B/C」在数据里长得一模一样,
    #   而顺序错了 χ² 实测差 2 倍以上,两个结果都跑得通、都不报错。
    positive: str = "",
    group_order: str = "",
) -> dict[str, Any]:
    reg = reg or load_registry()
    df = _load_table(data_path, sheet=sheet)
    adv = Advisories()
    _profile = profile_columns(df, [c for c in (dv, group, subject) if c])
    _read_kwargs = dict(getattr(df, "attrs", {}).get("read_kwargs") or {})
    _group_dtype = str(df[group].dtype) if group and group in df.columns else ""

    for col in filter(None, [dv, group, subject]):
        if col not in df.columns:
            raise RunError(
                f"列 {col!r} 不在数据里",
                {"ok": False, "reason": "missing_column", "column": col,
                 "available": list(df.columns)[:40]},
            )

    # 个人标识列:**不拒绝分析**(临床病例表不属于人遗信息,拒绝是过度反应),
    # 只把三句话作为确定性文本回给模型,由它转述给用户。
    _id_cols = _scan_identifier_columns(df)

    # ── 因变量类型分流(C1 形状路由的入口)────────────────────────────────────
    df = df.copy()
    _dv_kind = _infer_dv_kind(df[dv])
    if _dv_kind == "too_many_levels":
        # 全是文本、水平又多 —— 几乎必然是把姓名/备注这类列选成了因变量。
        # **不回显具体取值**(PHI 边界),只说个数与该怎么办。
        raise RunError(
            f"因变量 {dv!r} 是文本列且取值过多",
            sit.payload("dv_too_many_levels", column=dv,
                        n_distinct=int(df[dv].dropna().nunique()), max_levels=_MAX_DV_LEVELS),
        )
    is_table = _dv_kind in ("categorical",)
    if not is_table:
        # 连续路径:因变量必须是数值。混文本时给分类过的拒绝(删失 ≠ 缺失),
        # 不许把 Python 栈甩给用户。("mixed" 也走这里 —— 那正是它要处理的形态。)
        df[dv] = _numeric_or_reject(df[dv], dv)
    else:
        # 分类路径:统一成去空白的字符串,并把空串当缺失。
        # 🔴 不做大小写/全半角归一化 —— 那会把「Yes」与「yes」悄悄合并成一个水平,
        #    而合不合并是用户的判断。此处只做与数值路径同款的「首尾空白」处理,
        #    真有幽灵水平由下方的标签闸拦下来交回用户(与分组标签同一套口径)。
        _sv = df[dv].astype("string").str.strip()
        df[dv] = _sv.mask(_sv == "", pd.NA)

    # ── 组装分组 ────────────────────────────────────────────────────────────
    #
    # 🔴 `n_before` 与 `n_used` **必须同单位**。2026-08-05 实测事故:
    #    原先一律 `n_before = len(df)`(长表行数),而配对分支的 `n_used = len(wide)`(**配对数**)——
    #    两者相减是拿行数减对数,得到一个没有意义的数。MED-03 实测:72 行长表 − 34 对 = 38,
    #    于是 Methods 段原样印出「共 38 条记录因关键变量缺失被剔除」,
    #    而真相是 36 个受试者里 2 个不完整。**这句话会进论文**,审稿人一算就对不上。
    #    配对设计的分析单元是**受试者**,不是行 —— 计数单位必须跟着分析单元走。
    n_unit = "case"
    # 分类路径的产物(连续路径全程为 None / "",不进 bundle)。
    _table: Any = None
    _event, _event_basis = "", ""
    _o_levels: list[str] = []
    if paired:
        if not subject:
            raise RunError("配对设计需要 --subject 指定配对标识列",
                           {"ok": False, "reason": "missing_subject"})
        n_before = int(df[subject].nunique())  # 单位 = 受试者
        n_unit = "pair"
        # ── 重复配对格闸:同一 subject × 同一水平出现多条不同取值 ────────────────
        #
        # 🔴 2026-08-06 实测:`pivot_table(aggfunc="first")` 静默只取文件里**靠前的那一行**,
        #    于是分析结果依赖行序。同样 25 行、内容完全相同,只把那条重复行换个位置:
        #      重复行在末尾 → paired_t,  p = 1.339e-10
        #      重复行在前   → wilcoxon,  p = 0.02686
        #    p 差 8 个数量级,**连所选检验都变了**(D-04 ↔ D-05),两次都 ok:true、degraded:null、
        #    零提示,依据链还各自言之凿凿地写「差值未拒绝正态性」/「差值不服从正态分布」。
        #    而 Methods 段会写「数据无缺失,未做剔除」—— 主动断言没剔除,事实上丢了一条测量。
        #    (且自从 n_before 改用 nunique 之后,这次丢弃在**任何计数里都不可见**。)
        #
        # 仍是「拦不删」:引擎能确定「这个格子有两个不同的值」,不能确定该取哪个 ——
        # 取哪条会改变结论,那是用户的决定。故**不给 --xxx-ok 逃生开关**。
        # 🔴 **回执一律不带 subject 原值,也不带逐个测量值**(2026-08-06 修)。
        #
        # 配对临床数据最自然的配对键就是**住院号 / 病案号**(本文件 _ID_COL_PAT 自己把它们
        # 列为个人标识)。首版把 subject 原值 + 逐个测量值同时写进 `payload.cells` 与 `why_zh`
        # (同一批 ID 出现两遍),经 StatRun 原样回喂模型 → 被转述进对话 →
        # 落进 MySQL 的 agent_turns/turn_events **永久留存**,并随每轮发给上游 LLM 服务商。
        # 而 run.py:32-33 自陈「原始数据行永远不出现在 stdout —— 这既是上下文预算,也是 PHI 边界」,
        # SKILL.md / prompts / spec.go 三处还在让模型对用户复述「行级数据不进上下文」。
        #
        # 定位信息改用**行号**:它同样能让用户找到那几行(Excel 里直接跳),但不是个人标识。
        # 同一份打码口径 `_numeric_or_reject` 的 unknown 分支早就有了(distinct≥5 不回显),
        # 这里只是把它推广过来 —— 一处想明白的判断,应该长在所有同类出口上。
        _cells = df[[subject, group]][df[dv].notna()]
        _dupmask = _cells.duplicated(keep=False)
        if bool(_dupmask.any()):
            _amb: list[dict[str, Any]] = []
            for (_s, _g), _idx in _cells[_dupmask].groupby([subject, group]).groups.items():
                # 分类结局没有「取值跨度」可言(有效 − 无效 不是一个数),
                # 但「同一格里出现了两个不同的水平」这件事本身完全一样地致命 ——
                # 判据换成**不同取值的个数**,两条路径共用同一个闸。
                _raw = list(df.loc[_idx, dv])
                if is_table:
                    _vals_s = sorted({str(v) for v in _raw})
                    _spread: float | None = None
                else:
                    _vals_f = sorted({float(v) for v in _raw})
                    _vals_s = [str(v) for v in _vals_f]
                    _spread = round(float(max(_vals_f) - min(_vals_f)), 6)
                if len(_vals_s) > 1:   # 取值一致时取谁都一样,不打扰用户
                    # rows:数据行号(1-based,+1 让它对上 Excel 里的行 —— 表头占第 1 行)。
                    _amb.append({"level": str(_g), "n_rows": int(len(_idx)),
                                 "rows": [int(i) + 2 for i in _idx][:10],
                                 "n_distinct_values": len(_vals_s),
                                 **({"value_spread": _spread} if _spread is not None else {})})
            if _amb:
                _amb.sort(key=lambda h: (h["level"], h["rows"][0] if h["rows"] else 0))
                _n_sub = len({(str(s), str(g)) for (s, g) in
                              _cells[_dupmask].groupby([subject, group]).groups})
                _desc = (f"{len(_amb)} 个「受试者 × 水平」格子里各有多条取值不一致的记录"
                         f"(涉及 {_n_sub} 个 {subject!r});"
                         + "、".join(f"「{h['level']}」第 {h['rows'][:3]} 行" for h in _amb[:3]))
                # advisory:归模型决定。未接受 → 抛(payload 带全五件事 + accept_key);
                # 接受 → 记一条,继续算,并由 report 强制披露「按首次出现的取值纳入」。
                adv.check("duplicate_pair_cells", duplicates_ok,
                          detail={"columns": {"subject": subject, "group": group, "dv": dv},
                                  "cells": _amb[:20], "n_cells": len(_amb), "desc": _desc})

        # `aggfunc="first"` 对文本列同样成立(pivot_table 不会因为值是 object 就丢列),
        # 而重复格已由上面的闸拦过 —— 走到这里的「first」是无歧义的。
        wide = df.pivot_table(index=subject, columns=group, values=dv, aggfunc="first")
        wide = wide.dropna()
        if wide.shape[1] != 2:
            # 此前这里的 payload 是 `{"ok":false,"reason":"not_two_levels"}` —— **连有几个水平都不说**。
            # E2E 实测:模型连吃三次这条拒绝,靠自己猜出「需要长表」,而回执里一个字没提。
            raise RunError(
                f"配对比较需要恰好两个水平,实得 {wide.shape[1]} 个",
                sit.payload("not_two_levels", n_levels=int(wide.shape[1]),
                            levels=[str(c) for c in wide.columns][:8]),
            )
        levels = [str(c) for c in wide.columns]
        if is_table:
            # 配对分类:两列都是**结局水平**,配对表是「前测水平 × 后测水平」——
            # 行列取同一套水平、同一个顺序,对角线才是「两次一致」的那两格。
            # 🔴 与独立样本的 group×outcome 表**不是同一种表**,这一点必须落进 bundle
            #    (`table.kind`),否则交付层会把它当成两组率的比较去写「两组有效率分别为…」,
            #    而 McNemar 比的根本不是两组、是同一批人的两次。
            _o_levels = sorted({str(v) for v in pd.concat([wide.iloc[:, 0], wide.iloc[:, 1]]).dropna()})
            _o_levels, _event, _event_basis = _order_outcome_levels(_o_levels, positive)
            _paired_before, _paired_after = levels[0], levels[1]
            _table = cat.build_table([str(v) for v in wide.iloc[:, 0]],
                                     [str(v) for v in wide.iloc[:, 1]],
                                     rows=_o_levels, cols=_o_levels)
            # `arrays` 在分类路径上只当**计数底座**用(样本量、组名、剔除比例这些闸都靠它),
            # 装的是水平在 `_o_levels` 里的下标。任何**数值语义**的闸(方差为 0、哨兵编码、
            # 无穷值)都会在下面被显式跳过 —— 对编码跑那些判断是无意义的。
            _code = {lv: i for i, lv in enumerate(_o_levels)}
            arrays = {levels[0]: np.array([_code[str(v)] for v in wide.iloc[:, 0]], float),
                      levels[1]: np.array([_code[str(v)] for v in wide.iloc[:, 1]], float)}
        else:
            arrays = {levels[0]: wide.iloc[:, 0].to_numpy(float),
                      levels[1]: wide.iloc[:, 1].to_numpy(float)}
        n_used = len(wide)
    else:
        n_before = len(df)  # 单位 = 行(独立样本设计里一行就是一例)
        if not group:
            raise RunError("独立样本比较需要 --group 指定分组列",
                           {"ok": False, "reason": "missing_group"})
        sub = df[[dv, group]].dropna()
        if is_table:
            _g_vals = [str(v) for v in sub[group]]
            _d_vals = [str(v) for v in sub[dv]]
            _rows = sorted(set(_g_vals))
            if group_order:
                _want = [t.strip() for t in group_order.split(",") if t.strip()]
                if sorted(_want) != _rows:
                    raise RunError(
                        "指定的分组顺序与数据里的分组水平对不上",
                        sit.payload("group_order_mismatch", given=_want, actual=_rows),
                    )
                _rows = _want
            _o_levels, _event, _event_basis = _order_outcome_levels(sorted(set(_d_vals)), positive)
            _table = cat.build_table(_g_vals, _d_vals, rows=_rows, cols=_o_levels)
            _code = {lv: i for i, lv in enumerate(_o_levels)}
            arrays = {str(k): np.array([_code[str(v)] for v in g[dv]], float)
                      for k, g in sub.groupby(group)}
            # 分组顺序跟着 `_rows` 走(默认字典序;给了 group_order 就跟它)——
            # `arrays` 的插入序决定三线表的行序与 `groups[]`,必须与列联表同序。
            arrays = {k: arrays[k] for k in _rows if k in arrays}
        else:
            arrays = {str(k): g[dv].to_numpy(float) for k, g in sub.groupby(group)}
        n_used = len(sub)

    # ── 剔除占比闸:listwise 丢掉多少行,必须有人知道 ────────────────────────────
    #
    # 🔴 2026-08-06 实测:openpyxl 造 60 行 xlsx,分组列按 5 行一块**合并单元格**
    #    (中文科研 Excel 的默认排版)→ pandas 读出来只有每块首行有值 →
    #    `dropna()` 静默丢掉 48 行 → 引擎基于 12 行跑完 Student t、落 bundle、
    #    出三线表与 Results 段,**零警告**,所有机械闸(reports_required / 有限性 / numcheck)全绿。
    #    Methods 只写「共 48 例因关键变量缺失被剔除」—— 读起来像数据本身有缺失,
    #    而真相是排版。用户拿一个基于 12 例(实为 60 例)的 p 值去投稿。
    #
    # 判据刻意做**归因**而不是只报一个比例:缺失落在**分组列/配对列**上,几乎必然是排版事故
    # (一个受试者「没有组别」在语义上就不成立);落在因变量上才是真缺失。
    # 两者的下一步动作完全不同,所以回执必须说清是哪一种 —— 只说「缺失过多」会把用户推去猜。
    #
    # 逃生开关 `missing_ok`:真实数据确有 25% 缺失时用户要走得下去。但它**不是**无痕放行 ——
    # 见下方 spec 落盘与 Methods 披露。「拦不删」的完整形态是:拦住 → 用户确认 → **写进论文**。
    if n_before > 0:
        _excluded = n_before - n_used
        _rate = _excluded / n_before
        if _rate > _EXCLUSION_ALERT:
            # 归因:各关键列各自缺了多少(占原始行数)。取原始 df,不取已 dropna 的子集。
            _by_col = {c: int(df[c].isna().sum()) for c in filter(None, [dv, group, subject])}
            _worst = max(_by_col, key=lambda c: _by_col[c])
            _structural = _worst in filter(None, [group, subject])
            adv.check("excessive_exclusion", missing_ok,
                      detail={"n_before": int(n_before), "n_used": int(n_used),
                              "excluded": int(_excluded), "rate": round(_rate, 4),
                              "unit": n_unit, "missing_by_column": _by_col,
                              "worst_column": _worst, "structural": bool(_structural)})

    keys_preview = [str(k) for k in list(arrays)[:8]]
    # 「引擎当前能力面」的早退 —— **不是** arity 校验(那个在分流之后按选中卡片做)。
    #
    # ✅ P1 族①落地后,判据从写死的 `!= 2` 换成**问注册表**:
    #    有没有任何一张(未被禁用的)方法卡吃得下这个分组数。
    #    这一步是 S2 的兑现点:能力面从主流程的硬编码变成卡片的聚合结果 ——
    #    加第四族时不需要再回来改这一行。
    _fits = [mid for mid, m in reg.methods.items()
             if mid not in reg.disabled and m.accepts_levels(len(arrays))
             and (m.units == "paired") == bool(paired)]
    if not _fits:
        raise RunError(
            f"引擎当前只实现了两组比较,而分组变量有 {len(arrays)} 个水平",
            sit.payload("unsupported_design", n_groups=len(arrays), groups=keys_preview),
        )

    # ── 幽灵组闸:只差空白/大小写/全半角的两个组名 ────────────────────────────
    #
    # 🔴 2026-08-05 实测:分组列写成「对照组」与「对照组 」(尾随空格)时,
    #    引擎当成两个不同的组照常分析,三线表渲染出**两行都叫「对照组」**——
    #    读者无从分辨哪行是哪组,而真实原因只是录入时多打了一个空格。
    #    (三组以上会被下面的 `unsupported_design` 拦住,恰好两组时**完全静默**。)
    #    这类脏法在真实数据里极常见:调研里 AD-01 的分组列就有
    #    「干预组 / 对照组 / 对照 / control」四种写法。
    #
    #    仍然是**拦不删**:引擎能确定「这两个标签只差不可见字符」,
    #    但不能确定它们该不该合并(也可能真是两个组,只是命名随意)。判断权交回用户。
    import unicodedata as _ud

    def _norm_label(t: str) -> str:
        return _ud.normalize("NFKC", str(t)).strip().casefold()

    _by_norm: dict[str, list[str]] = {}
    for raw in arrays:
        _by_norm.setdefault(_norm_label(raw), []).append(str(raw))
    _dupes = {k: v for k, v in _by_norm.items() if len(v) > 1}
    if _dupes:
        pairs = "；".join(
            "、".join(repr(x) for x in v) + f"(规范化后都是 {k!r})" for k, v in _dupes.items()
        )
        adv.check("ambiguous_group_labels", labels_ok,
                  detail={"duplicates": {k: v for k, v in _dupes.items()}, "pairs": pairs},
                  disclose_fields={"detail": pairs})

    # ── 两两拆分闸:同一会话里把多组设计拆成两组子集 ──────────────────────────
    #
    # 🔴 2026-08-06 评判实测,6 条用例现形(SPT-10 / MED-05 / PSY-06 / SPT-02 …):
    #    引擎正确拒绝了三组比较,模型转头把数据拆成 pair1/pair2/pair3 三个文件,
    #    连调三次 StatRun,出三份可投稿交付物。引擎每次只看**单次调用**,
    #    对「同一 dv、组标签互相重叠、同一会话」零识别。
    #    更糟的是 pair1 的 Methods 写着「本会话仅此一次检验,无多重比较问题」——
    #    它落盘时确实是第一次,而多重比较记账是**落盘瞬间冻结**的。
    #
    # 指纹很干净:**同一个组标签出现在同一会话的两个不同 bundle 里**。
    #    pair1={静态拉伸, A}、pair2={静态拉伸, B} —— 静态拉伸 两边都有。
    #    正常的多次分析不会这样:换指标是换 dv,重跑是同一组集合(会覆盖同一个文件)。
    #
    # 这里选择**拒绝**而不是「记账后放行」:三次两两 t 检验与真正的事后检验
    # 在合并方差估计上就不同,不是加一句校正说明能补的;而且实测证明,
    # 只要路还通着,模型就会走 —— 它在 thinking 里写下「这会被审稿人打回」然后照走。
    _out_dir_probe = (workdir or Path.cwd()) / ANALYSIS_DIR
    if _out_dir_probe.is_dir():
        _cur = set(keys_preview)
        for _bp in sorted(_out_dir_probe.glob("*.bundle.json")):
            try:
                _prev = json.loads(_bp.read_text(encoding="utf-8"))
            except Exception:
                continue
            if (_prev.get("spec") or {}).get("dv") != dv:
                continue
            _pg = set(str(g) for g in (_prev.get("groups") or []))
            if not _pg or _pg == _cur:
                continue          # 同一组集合 = 重跑,不是拆分
            _shared = _pg & _cur
            if _shared:
                adv.check("pairwise_split_detected", independent_study,
                          detail={"current_groups": sorted(_cur),
                                  "previous_groups": sorted(_pg), "shared": sorted(_shared)})

    # ── 二分类结局闸(**已退休**,2026-08-07)────────────────────────────────
    #
    # 曾经这里有一道硬拒:「因变量只有 ≤2 个取值 ⇒ 这是分类结局,引擎不支持」。
    # 它是 2026-08-05 的正确处置 —— 当时白名单里一个卡方都没有,而把 0/1 结局
    # 当连续量跑 Welch t、报 Hedges' g、还对它做 Shapiro 正态性检验,是**编造**。
    #
    # 现在分类资料族(D-10~D-14)落地,同一份数据由 `_infer_dv_kind` 判成 categorical、
    # 走列联表形状,那道拒绝就该消失。留着它的话,新族的规则一条都命中不了 ——
    # 而这一族恰恰是需求矩阵里排第二位的结局类型(有效率 / 并发症率 / 阳性率)。
    #
    # 🔴 留下这段碑文而不是直接删掉:`binary_outcome` 这个 reason 仍在情况卡目录里,
    #    SKILL.md 与系统提示词都还教模型认它。哪天有人想「加回一道保险」时,
    #    该先读这段 —— 加回去 = 把整族重新堵死。

    # ── 退化数据闸:在任何检验之前拦住 ────────────────────────────────────────
    #
    # 🔴 2026-08-05 实测(盘点 agent 发现后复现):A 组整列常数(方差为 0)时,
    #    引擎照样产出 `ok: true` 的 bundle,里面装着
    #      statistic = -inf · p_exact = 0.0 · effect = -Infinity · CI = NaN
    #    而且两条前提判定**都是编造的**:
    #      · Shapiro 对常数列回 W=1.000, p=1.000 → 依据链写「各组均未拒绝正态性假设」;
    #      · Levene 回 F=nan, p=nan,而 `nan >= 0.05` 是 False ⇒ 被静默读成
    #        「未达 0.05 水平 → 方差不齐」——**一个从未有效发生过的判定**。
    #    最终 Results 句会写成「差异有统计学意义(t(1)=-inf, p<0.001)」。
    #
    #    根因是退化数据本就不该进检验。在**这里**拦比在下游逐个补 NaN 判断可靠得多:
    #    下游有 Shapiro / Levene / 三个效应量 / CI 求根共六七处会各自产生 NaN,
    #    补漏一处就留一个洞;而「组内没有变异」在源头是一句话就能判定的事实。
    for name, arr in arrays.items():
        a = np.asarray(arr, float)
        a = a[~np.isnan(a)]
        # 🔴 分类路径**跳过后两条**(无穷值 / 组内零方差),但**保留样本量下限**。
        #    理由不是「分类不重要」,而是那两条的判据在这里没有意义甚至有害:
        #    `arrays` 装的是水平下标,inf 不可能出现;而「组内所有取值相同」
        #    在分类资料里是**完全合法且常见**的结果 —— 对照组零并发症正是最需要
        #    Fisher 精确检验的那一格,拿零方差把它拒掉等于把这一族最有价值的场景堵死。
        if is_table:
            if len(a) < 3:
                raise RunError(
                    f"{name} 组有效样本仅 {len(a)} 例",
                    {"ok": False, "reason": "too_few_observations", "group": name, "n": int(len(a)),
                     "why_zh": f"{name} 组去除缺失后只剩 {len(a)} 例,率的比较没有意义。",
                     "hint_zh": "请确认分组列与结局列是否选对、缺失是否处理得当。"},
                )
            continue
        if len(a) < 3:
            raise RunError(
                f"{name} 组有效样本仅 {len(a)} 例,无法做前提检验",
                {"ok": False, "reason": "too_few_observations", "group": name, "n": int(len(a)),
                 "why_zh": f"{name} 组去除缺失后只剩 {len(a)} 例。正态性检验至少需要 3 例,"
                           f"少于此时任何前提判定都是没有依据的。",
                 "hint_zh": "请确认分组列与因变量列是否选对、缺失是否处理得当;"
                            "若该组确实只有这么几例,应当在文中如实报告样本量限制,而不是硬跑一个检验。"},
            )
        if not np.all(np.isfinite(a)):
            raise RunError(
                f"{name} 组含有无穷值",
                {"ok": False, "reason": "non_finite_values", "group": name,
                 "why_zh": "数据里出现 inf / -inf。这通常来自除零或数据导出错误,"
                           "带着它算下去,统计量与效应量都会变成 inf 而不报错。",
                 "hint_zh": "请检查该列的生成过程(是否有除以零的比值),修正后重跑。"},
            )
        if float(np.std(a, ddof=1)) == 0.0:
            raise RunError(
                f"{name} 组所有取值都相同({a[0]:g}),组内没有变异",
                {"ok": False, "reason": "zero_variance", "group": name, "value": float(a[0]),
                 "why_zh": f"{name} 组的 {len(a)} 个观测全部等于 {a[0]:g},组内方差为 0。"
                           "这种数据算不出有意义的检验统计量 —— 硬算会得到 t=±inf、p=0、"
                           "效应量 inf,而且前提检验会回 NaN 并被误读成「前提不满足」。",
                 "hint_zh": "常见原因:① 分组列或因变量列选错了(比如把编号列当成了测量值);"
                            "② 该列是常量或单位换算后被抹平;③ 数据导出时整列被覆盖。"
                            "请先确认这一列确实是要比较的测量结果。"},
            )

    # 配对设计还要单独查**差值**:两组各自都有变异,差值却可能恒定
    # (例如每个受试者都恰好降了 1.0)。这条是上面那道有限性闸抓出来的 ——
    # 主闸只查了各组,漏了这条路,而配对 t 的分母正是差值的标准差。
    if paired and not is_table:
        _k = list(arrays)
        dd = np.asarray(arrays[_k[0]], float) - np.asarray(arrays[_k[1]], float)
        dd = dd[~np.isnan(dd)]
        if len(dd) >= 2 and float(np.std(dd, ddof=1)) == 0.0:
            raise RunError(
                f"每一对的差值都相同({dd[0]:g}),差值没有变异",
                {"ok": False, "reason": "zero_variance_diff", "value": float(dd[0]),
                 "why_zh": f"{len(dd)} 对观测的前后差值全部等于 {dd[0]:g}。配对检验的统计量以"
                           "差值的标准差为分母,分母为 0 会算出 t=±inf、p=0,而不会报错。",
                 "hint_zh": "常见原因:① 两列其实是同一列的副本或按固定量平移;"
                            "② 数据是模拟/占位数据。请核对原始记录。"},
            )

    # ── 缺失哨兵编码:拦住,交回用户判断(见 _sentinel_scan 的事故记录)──────────
    # 分类路径不扫:`arrays` 装的是水平下标(0/1/2…),999 这类值不可能出现,
    # 扫了只会是一条永远静默的规则。分类结局若真用 9 表示缺失,它会成为一个
    # 独立水平出现在列联表里 —— 那比一条空转的哨兵闸显眼得多。
    hits = [] if is_table else _sentinel_scan(arrays)
    if hits:
        desc = "、".join(f"{h['group']} 组有 {h['count']} 个 {h['value']:g}" for h in hits)
        adv.check("sentinel_values", sentinel_ok,
                  detail={"hits": hits, "column": dv, "desc": desc},
                  disclose_fields={"detail": desc})

    keys = list(arrays)
    x, y = arrays[keys[0]], arrays[keys[1]]

    # ── 实测前提(三夺权之一:不问模型)────────────────────────────────────
    # 🔴 「跑哪些检验」由**卡片的 `applies_when`** 决定,不在这里写 if/else。
    #    首版把「配对跑 A、否则跑 B+C」硬编码在本函数里,被 test_no_card_ids_in_engine_code
    #    当场抓到 —— 那是行为随卡片 id 分叉,正是方案 R 要根除的形态。
    # 🔴 S5:事实来自**数据画像**,不再有字面量。
    #    `continuous` 曾经硬编码为 True —— 于是含 `not continuous` 的规则永不命中,
    #    而分类结局(0/1)被当连续变量跑完 t 检验、报 Hedges' g、还做正态性检验。
    #    (那条路今天由 binary_outcome 闸拦着,但闸是「诚实拒绝」;
    #     规则要能表达「这是分类资料 → 走卡方族」,`continuous` 就必须是真的推断值。)
    _ns = [len(v) for v in arrays.values()]
    structural: dict[str, Any] = {
        "n_groups": len(arrays),
        "two_groups": len(arrays) == 2,
        "multi_group": len(arrays) >= 3,
        # 🔴 `continuous` 与形状路由**同一个判据**(`_infer_dv_kind`),不再各算各的。
        #    两处各写一份就会出现「路由按分类走、而规则认为它连续」这种自相矛盾的状态,
        #    表现为一条规则都命中不了、回 no_rule_matched,而事实表里看不出哪里错。
        "continuous": not is_table,
        "paired": paired,
        "min_group_n": int(min(_ns)),
        "balanced": len(set(_ns)) == 1,
        # ── 分类资料族(D-10~D-14)────────────────────────────────────────────
        # `binary_dv`:结局恰好两个水平。连续路径上恒 False —— 它只描述结局的水平数,
        #   连续量谈不上「两个水平」(而 `not continuous` 已经把那一族的规则挡在外面)。
        "binary_dv": bool(is_table and len(_o_levels) == 2),
        # `ordinal_group`:引擎**判不出来**,只认调用方显式给的 group_order。
        #   详见签名处的说明:顺序错了 χ² 会差好几倍,而两个结果都跑得通、都不报错。
        "ordinal_group": bool(group_order),
    }
    diff = (x - y) if (paired and not is_table) else None

    check_results: list[chk.CheckResult] = []
    facts: dict[str, Any] = dict(structural)
    for cid, card in reg.checks.items():
        try:
            if not evaluate(card.applies_when, structural, where=f"check {cid}.applies_when"):
                continue
        except FactError:
            continue  # 该检验在当前信息量下无法判定是否适用 → 跳过,不猜
        impl = chk.DISPATCH.get(cid)
        if impl is None:
            raise RunError(
                f"前提检验卡 {cid!r} 没有对应实现",
                {"ok": False, "reason": "check_not_implemented", "check": cid,
                 "hint_zh": "卡片声明了一个 engines/checks.py 里不存在的检验 —— "
                            "声明与实现不符是本仓踩过的事故,加载期就该拦住。"},
            )
        # 🔴 C3:按卡片的 `target` **解析好对象再传进去**,并且**绝不静默跳过**。
        #    静默跳过一张前提检验 = 依据链里少一条,而 Methods 段照样宣称前提满足 ——
        #    那是「说了一件引擎无从知晓的事」,本仓最贵的一类。
        _targets: dict[str, Any] = {"dv": arrays if not is_table else None,
                                    "diff": diff, "table": _table}
        if card.target not in _targets or _targets[card.target] is None:
            raise RunError(
                f"前提检验 {cid!r} 要的对象({card.target})在本次分析里不存在",
                sit.payload("check_target_unavailable", check=cid, target=card.target,
                            available=[k for k, v in _targets.items() if v is not None]),
            )
        res = impl(_targets[card.target], chk.CheckCtx(alpha=card.alpha, paired=bool(paired)))
        check_results.append(res)
        facts.update(res.produces)

    # 未被任何适用检验产出的事实,补中性值让规则可判定
    # (例:配对设计下 levene_equal 不适用 —— 但规则表达式里可能引用它)。
    # ⚠️ 中性值一律取 True = 「前提没被证伪」。`expected_ok` 同理:配对路径不跑期望频数
    #    (McNemar 只看失配对格,不用 χ² 近似),而 D-12 的表达式不引用它 —— 这里补齐只是
    #    让**任何**规则表达式都能求值,不至于因为一个未求出的名字而整表判不了。
    for fact_name in ("normal_by_group", "levene_equal", "diff_normal", "expected_ok"):
        facts.setdefault(fact_name, True)

    # ── 分类资料族的两个能力缺口:在分流**之前**显式说出来 ──────────────────────
    #
    # 🔴 没有这两条时,它们会落进 `no_rule_matched` —— 那句话是「没有规则匹配当前情形」,
    #    对用户完全无从行动:他不知道是数据的问题、还是引擎做不了、还是该换个方法。
    #    capability 档的整个意义就是**说清这是我们的缺口并给替代路径**;
    #    而一张没有产出点的 capability 卡等于一句没人兑现的承诺
    #    (`test_catalog_has_no_dead_entries` 当场把这两张抓了出来)。
    if is_table:
        if paired and len(_o_levels) > 2:
            raise RunError(
                f"配对设计的结局有 {len(_o_levels)} 个水平,超出 McNemar 的 2×2",
                sit.payload("paired_multi_level", n_levels=len(_o_levels), levels=list(_o_levels)),
            )
        if not facts.get("expected_ok", True) and (len(_table.rows) > 2 or len(_table.cols) > 2):
            raise RunError(
                "R×C 表的期望频数不达标,而 R×C 精确检验尚未实现",
                sit.payload("rxc_expected_too_small",
                            shape=[len(_table.rows), len(_table.cols)],
                            expected_min=round(float(_table.expected_min), 4),
                            expected_lt5_share=round(float(_table.expected_lt5_share), 4)),
            )

    # ── 守门(GateRejection 原样上抛,由 CLI 转成退出码 2)────────────────
    decision = run_assume(facts, requested=requested, reg=reg)
    method_id = decision["chosen"]

    # ── 🔴 S2:按**选中的卡片**校验 arity 与设计单位 ────────────────────────────
    #
    # 此前「只支持两组」只活在主流程的一行硬编码里,而卡片对自己能吃几组一个字都没说。
    # 那一行在**第一条正确的 ANOVA 规则落地当天**就失效:新规则不含 `two_groups`,
    # 绕过现有 6 条规则那道「第二道闸」,而主流程仍只解包前两组、仍以两参调用 ⇒
    # 实测得到 `ok:true / df:22.0`(只用了 24 例)而 `n.by_group` 记着 36 例,
    # reports_required 全过、数字锁不报、degraded 为 null —— **三道机械闸对「输入被截短」结构上无感**。
    #
    # 放在分流之后:这是**纵深**,不是主闸。它挡的不是用户数据,是**卡片与实现不匹配**——
    # 一张声称吃 3 组的卡被路由到只会两参调用的实现上。这种情况下继续算 = 静默截断。
    _card = reg.methods[method_id]
    if not _card.accepts_levels(len(arrays)):
        lo, hi = _card.group_levels
        raise RunError(
            f"方法 {method_id!r} 声明只吃 {lo}~{hi or '∞'} 个水平,实得 {len(arrays)} 个",
            {"ok": False, "reason": "method_arity_mismatch", "severity": "blocking",
             "method": method_id, "n_groups": len(arrays), "group_levels": [lo, hi],
             "title_zh": "选中的方法吃不下这个分组数",
             "why_zh": f"决策表把这份数据路由到了 {method_id},但那张卡声明只支持 "
                       f"{lo}~{hi or '不限'} 个水平,而实际有 {len(arrays)} 个。",
             "impact_zh": "继续算的话引擎只会取前两组,而 n.by_group 仍记全部组 —— "
                          "**统计量与样本量对不上,且没有任何机械闸会发现**。",
             "hint_zh": "属注册表配置缺陷(规则与方法卡的 arity 不一致),请反馈。"},
        )
    if (_card.units == "paired") != bool(paired):
        raise RunError(
            f"方法 {method_id!r} 的设计单位是 {_card.units},与本次分析的 paired={paired} 不符",
            {"ok": False, "reason": "method_units_mismatch", "severity": "blocking",
             "method": method_id, "card_units": _card.units, "paired": bool(paired),
             "title_zh": "选中的方法与设计不匹配",
             "why_zh": f"{method_id} 是 {_card.units} 设计的方法,而本次是 "
                       f"{'配对' if paired else '独立样本'}分析。",
             "impact_zh": "配对与独立样本的自由度、检验统计量、效应量分母全都不同;"
                          "算错的方向不会报错,只会给出一个看起来正常的 p 值。",
             "hint_zh": "属注册表配置缺陷(规则把配对数据路由到了独立样本方法,或反之),请反馈。"},
        )

    # ── 计算 ────────────────────────────────────────────────────────────────
    # S1:实现拿到**完整的 groups 映射**,不再是两个位置参数。
    # 两组族自己从里面取前两个(ctx.two);多组族拿全量。
    # C2:计算层拿到的是 `Dataset`(带 shape),不是裸 dict —— 见 core/dataset.py 的模块头。
    # C1:形状由**卡片**决定,实现表由 engines/dispatch.py 按形状查 ——
    #     `tst.DISPATCH[...]` 那种裸下标已经退休(它把「引擎只吃数值向量」写死在主流程里)。
    _data = Dataset(shape=_card.input_shape, groups=arrays, table=_table, diff=diff,
                    unit=n_unit, n_before=int(n_before), n_used=int(n_used),
                    profile=_profile)
    try:
        result = disp.resolve(method_id, _card.input_shape)(
            _data, tst.RunCtx(paired=bool(paired), diff=diff, method_id=method_id))
    except cat.TrendNotEstimable as e:
        raise RunError(str(e), sit.payload("trend_not_estimable", method=method_id)) from e

    # `n_extra`:实现报上来的**分析单元计数**(如 Wilcoxon 被原法丢弃的零差值对)。
    # 由组装方合并进 `n`,而不是让实现直接写 `n` —— 那是本模块的字段,
    # 而字典字面量的覆盖是静默的(2026-08-05 实测:非参 bundle 的组描述统计因此整个消失)。
    # 通道是**方法无关**的:组装方不需要认识具体是哪个方法报了什么。
    _n_extra = result.pop("n_extra", None) or {}

    bundle: dict[str, Any] = {
        "schema": "statkit/bundle@1",
        "method": method_id,
        "rule": decision["rule"],
        "n": {
            "by_group": {k: int(len(v)) for k, v in arrays.items()},
            "pairs": int(len(x)) if paired else None,
            "missing_excluded": int(n_before - n_used),
            # 计数单位:配对设计数**受试者/对**,独立样本数**例(行)**。
            # 不写明单位,Methods 段就只能笼统说「记录」,而两者数目不同(见上方事故记录)。
            "unit": n_unit,
            "missing_rule": "listwise",
            **{str(k): v for k, v in _n_extra.items()},
        },
        "groups": keys,
        # 🔴 对比方向必须显式记录。实测事故(2026-08-05 盘点):谁减谁由 `groupby` 的
        #    **字典序**决定,也就是由组名的 Unicode 顺序决定 —— 同一份数据把
        #    「治疗组/对照组」换成「A组/B组」,t 从 +9.37 变成 -9.37,效应量同步变号。
        #    而 bundle 里没有任何字段说明方向,Results 句也不提 ⇒ 读者拿到 d=-4.19
        #    无法判断是治疗组更高还是更低,论文里那个符号是个**随机的方向断言**。
        #    记下来之后,符号仍由排序决定(那没关系),但**方向变成可读、可核对的**。
        # 🔴 `contrast` 只对**两组**有意义(它是 minuend/subtrahend 的二元结构)。
        #    k>2 时不产出:多组的「谁和谁差多少」由 `posthoc[]` 逐对给出,
        #    而硬塞一个「前两组之差」会让方向词写出「N0 低于 N150」——
        #    那句话在三组报告里既不完整也不是结论(结论在字母标记里)。
        **({"contrast": {
            "minuend": keys[0],
            "subtrahend": keys[1],
            "mean_difference": float(np.mean(np.asarray(x, float)) - np.mean(np.asarray(y, float))),
            # 🔴 中位数差必须一起记。2026-08-06 实测事故:方向词只看 mean_difference,
            #    而**非参检验的整个前提就是不看均值** —— 一个极端值就能让方向词与同一句里的
            #    中位数打架。落盘原文:「主动恢复组 305.500、冷水浸泡组 399.000。……
            #    主动恢复**高于**冷水浸泡」(2000 那个值把均值从 305 抬到 446)。
            #    方向必须与**检验和表格用的是同一个位置统计量**:参数看均值,非参看中位数。
            #
            # 🔴 配对设计要的是**差值的中位数**,不是两个中位数之差(2026-08-06 补)。
            #    两者是不同的量:median(x−y) ≠ median(x) − median(y)。
            #    实测:9 对差值 [1,1,1,−9,−18,1,1,−9,−18] —— 差值中位数 = **+1**(多数人升了),
            #    而两组中位数之差 = **−1**。三线表的「差值」行印的是前者、Results 的方向词
            #    取的是后者 ⇒ 同一份交付物里表说「升」正文说「降」,**符号相反**。
            #    (这与 2026-08-06 修的 SPT-05 是同一颗雷,当时只补了独立样本那半边。)
            "median_difference": float(
                np.median(np.asarray(x, float) - np.asarray(y, float)) if paired
                else np.median(np.asarray(x, float)) - np.median(np.asarray(y, float))),
            # 口径必须可知:同一个字段名在两种设计下算的是不同的量,不写明就没人能核对。
            "location_estimator": "median_of_differences" if paired else "difference_of_medians",
            "note_zh": f"统计量与效应量的符号按「{keys[0]} − {keys[1]}」计算。",
        }} if (len(arrays) == 2 and not is_table) else {}),
        # ── 分类资料:方向与口径的显式记录(与连续路径的 `contrast` 同一职责)────────
        #
        # 🔴 率差 / RR / OR 的**符号与倒数关系**全由「谁算事件」决定,而首版按
        #    「值在文件里首次出现的顺序」定列序 —— 那等于让结论取决于数据行序:
        #    同一份数据把第一行挪到末尾,RD 从 +0.267 变成 −0.267,且没有任何字段说明。
        #    现在定序有明确依据(caller / negation_prefix / lexicon / fallback_last),
        #    并由交付层**强制写进 Methods**:默认猜错时读者一眼看得见,而不是被反号误导。
        **({"outcome": {
            "levels": list(_o_levels),
            "event_level": _event,
            "event_basis": _event_basis,
            "note_zh": (f"以「{_event}」为事件计算率与效应量。"
                        if _event else "结局有多个水平,不设单一事件水平。"),
        }} if is_table else {}),
        # 🔴 分类表也要 `contrast` —— 与连续路径同一个理由,而且更尖锐:
        #    率差 −0.27 印在 Results 里,读者**无法判断是哪一组更高**。
        #    连续路径为这件事修过一次(「读者拿到 d=-4.19 无从判断方向」),
        #    这一族若不记,等于把同一颗雷重新埋一遍。
        #    `location_estimator` 写明这里比的是**率**不是均数 —— 同名字段在两族算不同的量。
        **({"contrast": {
            "minuend": _table.rows[0],
            "subtrahend": _table.rows[1],
            "rate_difference": float((result.get("effect") or {}).get("value", float("nan"))),
            "location_estimator": "difference_of_rates",
            "note_zh": f"率差的符号按「{_table.rows[0]} − {_table.rows[1]}」计算。",
        }} if (is_table and len(_table.rows) == 2 and not paired) else {}),
        # `describe_groups` 算的是均数/标准差/中位数 —— 对分类结局全部无意义
        # (「有效」的均值是什么?)。分类资料的描述统计是**例数与率**,
        # 形态不同但位置相同:两条路径都填 `descriptives`,交付层与数字锁不必分叉。
        "descriptives": cat.describe_table(_table, _event) if is_table
        else tst.describe_groups(arrays),
        "assumptions": [c.to_dict() for c in check_results],
        "decision": {
            "rule": decision["rule"],
            "allowed": decision["allowed"],
            "chosen": method_id,
            "reason_zh": decision["reason_zh"],
            "doctrine": decision.get("doctrine"),
            "evidence_chain_zh": [c.narrative_zh for c in check_results],
        },
        # 🔴 分析规格本身必须进 bundle。2026-08-05 之前**没有** ——
        #    `spec_hash` 自称「这份分析规格的指纹」,而规格(哪个文件、哪两列、配不配对)
        #    一个字都没记。后果:① 拿到 bundle 的审稿人无从知道分析的是哪两列;
        #    ② 承诺给用户的可复现脚本 analysis.py 根本没有信息可以生成
        #    (skill 里白纸黑字写着「报告附带的 analysis.py 就是答案」,而它从来不存在)。
        #    只记**文件名与列名**,不记任何数据行 —— PHI 边界与 stdout 一致。
        "spec": {
            "data_file": data_path.name,
            "dv": dv,
            "group": group,
            "subject": subject,
            "paired": bool(paired),
            "requested": requested,
            "sentinel_ok": bool(sentinel_ok),
            # 🔴 用户确认过「这个剔除比例是真实的」才会为 True。它必须进 bundle:
            #    report 据此在 Methods 段**强制披露**剔除量 —— 逃生开关的完整形态是
            #    「拦住 → 用户确认 → 写进论文」,而不是「拦住 → 加个 flag → 无痕通过」。
            "missing_ok": bool(missing_ok),
            # 读表参数与组标签的原始类型 —— 复现脚本据此生成能真跑通的读取与筛选代码。
            # `group_dtype`:1=对照 2=干预 是 SPSS/EpiData 导出最常见的编码形态,
            # 而 groups 落 bundle 时一律 str() 化 ⇒ 脚本写 `sub[g] == '1'` 匹配不到整数 1,
            # 复算得 nan,然后当着审稿人的面打印「复算 nan,报告 -2.97」。
            "read_kwargs": dict(_read_kwargs),
            "group_dtype": _group_dtype,
        },
        "software": _software_stamp(llm_model),
        **result,
    }
    # 🔴 模型接受过的 advisory 全部进 bundle —— **决定必须留痕**。
    #    report 据此在 Methods 段强制披露(situations 卡的 disclose_zh),
    #    审稿人因此看得见「这份分析里哪些判断是分析者做的、依据是什么」。
    #    「模型优先」的完整形态是三段:引擎给全信息 → 模型决定 → 决定被披露;
    #    只做前两段的话,模型的决定就是静默的 —— 那比引擎替它决定更糟。
    if adv.items:
        bundle["advisories"] = adv.items

    if decision.get("contested_zh"):
        bundle["decision"]["contested_zh"] = decision["contested_zh"]
        bundle["decision"]["positions"] = decision.get("positions", [])
    if decision.get("disclosure_required_zh"):
        bundle["decision"]["disclosure_required_zh"] = decision["disclosure_required_zh"]
    degraded = [c.degraded for c in check_results if c.degraded]
    if degraded:
        bundle["degraded"] = degraded

    # ── 🔴 数字锁执行点之零:有限性 ────────────────────────────────────────
    #    上面的退化数据闸已经堵住了已知来源,这一道是**纵深防御**:
    #    只要有一个 inf/NaN 走到这里,就说明存在一条我没预料到的路径 —— 当场拒收,
    #    而不是让 `t=-inf, p<0.001` 印进论文。数字锁校验「字段齐不齐」,
    #    这一道校验「字段是不是数」;两者缺一不可 —— 齐备的 NaN 照样能通过前者。
    # 🔴 S3:检查路径从**字面量清单**改成从 `reports_required` 派生。
    #
    #    旧实现是六条写死的路径。它的洞在加新族的当天兑现:多组族的必报项是
    #    `posthoc[].p_adj` / `cld`,回归族是 `terms[].effect.ci_low` —— 一条都不在那个清单里,
    #    于是「有限性网」对新族**结构上无感**:一个 NaN 的事后 p 值可以一路走进三线表。
    #
    #    改成派生之后,加必报项 = 自动被有限性检查覆盖,两道锁合并成一道。
    #    (审计里多条修法建立在「加进 reports_required 数字锁就会强制它」上,
    #     而在这之前那个前提只对「键存在」成立、对「值是不是数」不成立。)
    _required_paths = list(reg.methods[method_id].reports_required)
    _nonfinite: list[str] = []
    for path in _required_paths:
        v = _dig(bundle, path)
        if v is _MISSING:
            continue                      # 缺项由下面的数字锁报,不在这里重复
        for item in (v if isinstance(v, list) else [v]):
            if isinstance(item, bool):
                continue
            if isinstance(item, (int, float)) and not np.isfinite(float(item)):
                _nonfinite.append(path)
                break
    if _nonfinite:
        raise RunError(
            f"计算结果里出现非有限值:{_nonfinite}",
            {"ok": False, "reason": "non_finite_result", "fields": _nonfinite,
             "why_zh": "统计量或效应量算出了 inf / NaN。这类值一旦落进 bundle,"
                       "交付物里就会印出 `t=-inf`、`p<0.001` 这种不可能的结果,"
                       "而且没有任何东西会报错。",
             "hint_zh": "多半是某一组组内无变异、或样本量过小。请核对数据后重跑;"
                        "若确认数据无误,这属于引擎缺陷,请反馈。"},
        )

    # ── 🔴 数字锁执行点:reports_required 逐项校验 ──────────────────────────
    required = reg.methods[method_id].reports_required
    missing = [p for p in required if _dig(bundle, p) is _MISSING]
    if missing:
        raise RunError(
            f"bundle 缺少方法卡声明的必报字段:{missing}",
            {"ok": False, "reason": "incomplete_bundle", "method": method_id,
             "missing": missing,
             "hint_zh": "这是「六项最低必报项」的机器可读形态,缺项即拒收 —— 不允许产出一份"
                        "无法完整报告的结果。若确实无法计算某项,应改方法卡而不是绕过校验。"},
        )

    # 🔴 **刻意不传 `default=str`**。它看起来是「兜底」,实际是「静默损坏」:
    #    numpy 标量(scipy 到处返回)序列化不了 → 被转成字符串 → `numpy.bool_(False)` 变成 "False",
    #    而 `bool("False")` 是 True ⇒ Methods 段把「方差不齐」印成「该前提满足」(2026-08-05 实测踩到)。
    #    去掉它之后,任何 numpy 泄漏都会当场抛 TypeError,而不是流进用户的论文。
    #
    # 🔴 **顺序不能颠倒**:先算 spec_hash(此时 bundle 里**没有** multiplicity),再据此记账。
    #    2026-08-05 实测事故:原先 multiplicity 先塞进 bundle 再一起哈希 ⇒ 自我喂养的环 ——
    #    完全相同的输入,每跑一次哈希都不同 → 落一个新文件 → 下一次数到的 bundle 又多一个
    #    → 检验次数 1、2、3 单调涨,Bonferroni 阈值 0.05 → 0.025 → 0.0167 越跑越严。
    #    用户只是刷新页面重跑了一次同样的分析,Methods 段就会写「本会话已进行 3 次统计检验」。
    #    spec_hash 的语义是「这份分析规格的指纹」,它必须只由**输入与方法**决定,
    #    不能由「跑过几次」决定 —— 后者是环境状态,不是规格。
    # 🔴 `allow_nan=False`(2026-08-07 加):Python 的 json 默认把 NaN/Infinity 写成
    #    **字面量** `NaN` / `Infinity` —— 那不是合法 JSON。前端 `JSON.parse` 会在
    #    交付的最后一步当场抛,而那是整条链上信息量最低的位置(用户只看到「报告生成失败」)。
    #    有限性闸只扫 `reports_required` 列出的字段;这条兜住其余所有字段
    #    (分类族的 `effect.ci_low`、`table.cells[].pct` 都在闸的视野之外)。
    #    宁可在**写盘前**炸,也不要产出一份读不进去的交付物。
    payload = json.dumps(_native(bundle), ensure_ascii=False, sort_keys=True, allow_nan=False)
    bundle["spec_hash"] = "sha256:" + hashlib.sha256(payload.encode()).hexdigest()[:16]

    out_dir = (workdir or Path.cwd()) / ANALYSIS_DIR
    out_dir.mkdir(parents=True, exist_ok=True)
    # 记账时排除「自己」——重跑同一份分析是覆盖,不是第二次检验。
    bundle["multiplicity"] = _multiplicity(out_dir, spec_hash_self=bundle["spec_hash"])
    out_path = out_dir / f"{bundle['spec_hash'].split(':')[1]}.bundle.json"
    out_path.write_text(
        json.dumps(_native(bundle), ensure_ascii=False, indent=2, allow_nan=False),
        encoding="utf-8",
    )

    # stdout 只回摘要:原始数据行永远不出现在这里(上下文预算 + PHI 边界)。
    return {
        "ok": True,
        "bundle_path": str(out_path.relative_to(workdir or Path.cwd())),
        "spec_hash": bundle["spec_hash"],
        "method": method_id,
        "rule": decision["rule"],
        "reason_zh": decision["reason_zh"],
        "evidence_chain_zh": bundle["decision"]["evidence_chain_zh"],
        "statistic": bundle.get("statistic"),
        "df": bundle.get("df"),
        "p_exact": bundle.get("p_exact"),
        "effect": bundle.get("effect"),
        "n": bundle["n"],
        "degraded": bundle.get("degraded"),
        # 模型接受过的 advisory —— 回执里带出来,提醒它这些决定已经写进 Methods 了。
        **({"advisories": [{"id": a["id"], "disclose_zh": a["disclose_zh"]} for a in adv.items]}
           if adv.items else {}),
        # 有标识列才带这一项 —— 没有就不啰嗦。
        **({"privacy_notice_zh": _PRIVACY_NOTICE_ZH.format(cols="、".join(_id_cols[:8]))}
           if _id_cols else {}),
    }


# 按异常类型给**可行动**的下一步。判据是实测踩到的那几类,不是穷举 ——
# 认不出来的走通用兜底,那也比一段 traceback 强。
_CLI_HINTS = {
    "ParserError": "这份 CSV 的某些行列数与表头不一致 —— 最常见的来源是表尾的备注行、"
                   "或表头上方还有标题行。请删掉非表格内容后另存重传,或改传 .xlsx。",
    "EmptyDataError": "文件是空的,或者只有表头没有数据行。",
    "Error": "无法确定这份文件的分隔符(逗号 / 制表符 / 分号)。"
             "请在 Excel 里另存为「CSV UTF-8(逗号分隔)」,或直接传 .xlsx。",
    "FileNotFoundError": "找不到这个文件。注意:附件信息里给的是**容器侧绝对路径**,"
                         "而分析跑在沙箱里 —— 请**直接用文件名**(先 `ls` 看工作目录里有什么),"
                         "不要用那个绝对路径。",
    "KeyError": "列名对不上。请先用 pandas 打印 `df.columns.tolist()` 核对实际列名"
                "(常见原因:列名带首尾空格、全半角括号不同、Excel 里有隐藏字符)。"
                "配对分析还需要同时给 group(时点列)与 subject(配对标识列)。",
    "ValueError": "列名可能重复,或该列不是一维数据。请检查表里有没有两列同名"
                  "(去掉首尾空格后相同也算),以及有没有合并单元格残留的空列。",
}


def cli(argv: list[str]) -> tuple[int, str]:
    """`python3 -m statkit run --data f.csv --dv 值 --group 组 [--paired --subject id] [--requested m]`"""
    opts: dict[str, str] = {}
    flags: set[str] = set()
    i = 0
    while i < len(argv):
        a = argv[i]
        if a.startswith("--") and i + 1 < len(argv) and not argv[i + 1].startswith("--"):
            opts[a[2:]], i = argv[i + 1], i + 2
        elif a.startswith("--"):
            flags.add(a[2:]); i += 1
        else:
            i += 1
    if "data" not in opts or "dv" not in opts:
        return 2, json.dumps(
            {"ok": False, "reason": "usage",
             "hint_zh": "用法:run --data <file> --dv <列> --group <列> "
                        "[--paired --subject <列>] "
                        "[--sheet <名>] [--sentinel-ok] [--missing-ok] [--labels-ok] [--duplicates-ok] "
                        "[--independent-study]  # advisory 档的显式接受,逐项留痕并披露\n"
                        "分类结局另有两个口径旋钮(不放行任何东西,只决定怎么算怎么写):"
                        "[--positive <结局水平>] 哪个水平算「事件」(率差/RR/OR 的符号由它定);"
                        "[--group-order 低,中,高] 声明分组有序 —— 有它才可能走趋势检验"},
            ensure_ascii=False)
    try:
        out = run_analysis(
            data_path=Path(opts["data"]),
            dv=opts["dv"],
            group=opts.get("group"),
            subject=opts.get("subject"),
            paired="paired" in flags,
            requested=opts.get("requested"),
            workdir=Path(opts.get("workdir", ".")),
            sentinel_ok="sentinel-ok" in flags,
            missing_ok="missing-ok" in flags,
            labels_ok="labels-ok" in flags,
            duplicates_ok="duplicates-ok" in flags,
            independent_study="independent-study" in flags,
            sheet=opts.get("sheet", ""),
            llm_model=opts.get("llm-model", ""),
            positive=opts.get("positive", ""),
            group_order=opts.get("group-order", ""),
        )
        # 🔴 **不要**加 `default=str`。这里是模型实际读到的那份输出 ——
        #    default=str 会把 numpy.bool_(False) 悄悄变成字符串 "False"(真值!),
        #    Methods 段就会写出「该前提满足」而实际不满足。同一个坑已在 bundle 那侧
        #    炸过一次(2026-08-05)。宁可 TypeError 当场炸掉,也不要一份类型被污染的输出:
        #    炸掉是一条堆栈,污染是一篇发出去的论文。类型统一由 `_native()` 负责。
        return 0, json.dumps(_native(out), ensure_ascii=False, indent=2)
    except GateRejection as e:
        return 2, json.dumps(e.payload, ensure_ascii=False, indent=2)
    except RunError as e:
        return 2, json.dumps(e.payload, ensure_ascii=False, indent=2)
    except Exception as e:  # noqa: BLE001
        # 🔴 兜底 —— 没有它,任何未预料的异常都会**裸着 traceback 走 stderr**,
        #    而 executor 把 stderr 原样塞进 tool result 回喂模型。
        #
        #    本模块顶部自称「stdout 只回 JSON 摘要」,`_numeric_or_reject` 的文档串还把
        #    「用户看到 Python 栈」列为一票否决项(AD-07)—— 而 cli() 只捕两种自定义异常。
        #    审计实测至少 9 类常见脏输入走这条路:带尾注的 CSV(pandas ParserError)、
        #    单列 .txt(csv.Error 定不了分隔符)、--paired 但漏 --group(KeyError: '[nan] not in index')、
        #    strip 后列名撞名(ValueError: Grouper not 1-dimensional)、
        #    传了附件标记里的容器绝对路径(FileNotFoundError)……
        #    模型拿到一段堆栈,既不知道哪一行有问题、也不知道下一步做什么,
        #    于是要么白烧轮次猜,要么改用 Bash 自己算 —— 后者正是本卡片要防的那件事。
        #
        # ⚠️ 兜底**不吞信息**:异常类型与消息如实回,只是包成结构化 JSON 并给一句可行动指引。
        #    这与「宁可 TypeError 当场炸掉也不要类型被污染」不冲突 —— 那条说的是**不许静默降级**,
        #    这里没有降级,只是把炸的形态从「栈」换成「模型读得懂的拒绝」。
        _kind = type(e).__name__
        _hint = _CLI_HINTS.get(_kind) or (
            "请核对数据文件与列名:① 表头是不是在第一行(上方有标题/说明行会让列名变成垃圾);"
            "② 文件是不是 .csv/.tsv/.xlsx;③ 列名有没有多余空格或重名。"
        )
        return 2, json.dumps(
            {"ok": False, "reason": "engine_internal_error", "error_kind": _kind,
             "error": str(e)[:400],
             "why_zh": f"引擎在读取或准备数据时遇到未预料的情况({_kind})。",
             "hint_zh": _hint},
            ensure_ascii=False, indent=2)
