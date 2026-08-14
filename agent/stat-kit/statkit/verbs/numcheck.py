"""`numcheck` —— 交付闸的取证半边:交付物里的数字是否都能在 bundle 里找到源。

## 它守的是 D1 没守住的那一半

D1(保留区)让模型**无法伪造 bundle**。但模型仍可以绕过 `report`,
自己用 python-docx 往 `out/` 写一份带编造数字的 docx —— 那份文件会被 backend 的
`ListWorkspaceFiles(out/)` 原样收割交付给用户(收割是 **on-list 的,与 artifact 帧无关**,
所以「不发帧」是假闸,必须动盘上的文件)。本 verb 就是那条闸的取证部分。

## 🔴 默认 observe,不拦

匹配逻辑是**启发式**的(舍入、百分比换算、中文数词),是全案误拦风险最高的一块,
而误拦的代价很具体:用户辛苦跑出来的报告被无理由扣住。
所以默认只记录不拦截,先在真实会话里采**假阳性率**,再决定何时开硬拦
—— 这是本仓 `citation_audit` 用过的纪律。开硬拦靠 `STATKIT_NUMCHECK_ENFORCE=1`。

## 匹配规则(每一条都对应一类真实的合法差异)

1. **按显示精度舍入匹配**:报告写 `50.191`,bundle 里是 `50.19134...` → 按 3 位舍入相等 ⇒ 有源。
   **禁止反向放水**:bundle 0.048 不匹配报告里的 0.04(那是截断不是舍入,可能是抄错)。
2. **百分比换算,只做单向**:bundle 存比例 `0.421` ↔ 报告写 `42.1%`(或表头带 % 时裸写 `42.1`)。
   🔴 **刻意不做反向的 ÷100**。2026-08-06 实测:`s/100` 这个候选在源空间的容差是
   `50·10^-frac`,比报告精度**松 100 倍** —— .001–.050 区间的三位小数 p 值有 24%~50%
   会因此被判「有源」,而它们蒙中的是 Shapiro W、相关系数、t 统计量这些聚居在 [0.05, 5.05) 的数。
   端到端验证:真 p 是 0.053/0.465/0.717/0.998 全不显著,手写一份声称 `p=0.008` 的报告,
   **开着 STATKIT_NUMCHECK_ENFORCE=1 也 100% 放行**(0.008 ← 0.822 的 Shapiro W ÷100)。
   ×100 方向则相反:容差比报告精度**紧 100 倍**,几乎不可能误认,且它承载的才是真实需求。
   ⇒ 删掉 ÷100 零成本:statkit 全仓没有任何以百分数刻度存放的 bundle 字段。
   (别用「调整 frac」补救 —— 0.008×100=0.8 只剩一位有效数字,信息在换算时就丢了;
    也别往白名单加条目 —— 见下面第 3 条自己写的理由。)
3. **结构性数字白名单**:表号(表 1)、置信水平(95)、显著性水平(0.05)、小数点后位数标注等
   —— 它们来自模板常量而非数据。白名单**刻意极小**且写死,不随新模板增长
   (否则一年后它会变成一条永远绿的规则)。
4. **n 与组 n**:来自 bundle 的 `n` 字段,本就有源,无需特殊处理。
"""

from __future__ import annotations

import json
import math
import os
import re
import zipfile
from pathlib import Path
from typing import Any, Iterable

from ..paths import ANALYSIS_DIR, BUNDLE_SUFFIX, OUT_DIR

# 结构性常量:模板里固定出现、与数据无关的数字。刻意写死且极小。
# ⚠️ 往这里加东西前先问:它真的与数据无关吗?每加一条,闸就松一分;
#    加到十几条时它就等价于「不检查」——那正是 citation_audit 白名单当年的走向。
STRUCTURAL = {
    95.0, 0.95,   # 置信水平
    1.0, 2.0,     # 表号 / 组数这类小整数
    100.0,        # 百分比基数
}

# 🔴 `0.05 / 0.01 / 0.001` 曾在 STRUCTURAL 里,2026-08-06 摘掉。
#
# 它们看起来「与数据无关」(是阈值不是测量值),但正因如此,把它们无条件放行等于
# **让整份报告里破坏力最大的那句话恒过闸**:
#     「干预组与对照组在主要结局上差异有统计学意义(P < 0.001)。」
# 全文仅有的数字 token 就是 0.001 与 α=0.05 两个 —— 实测在 `--enforce` 下
# `findings: []`、`ok: true`,**开着硬拦也 100% 放行**,而 bundle 里的真值是 p=0.4653。
# 同一文件上方的注释自己写着「白名单加到十几条就等价于不检查」,而第一版就把三个 p 阈值放了进去。
#
# 现在改成**条件有源**:阈值只有在与 bundle 的 p_exact **方向一致**时才算有源
# (报告写 `p<0.001` 而实际 p=0.4653 → 判违规)。判定是确定性的,不是启发式 ——
# 这一条可以先于「转 enforce」落地,因为它不会误伤任何一份如实报告。
_P_THRESHOLDS = (0.05, 0.01, 0.001)

# 报告里的 p 值断言:`p<0.001` / `P ≤ .05` / `p = 0.023` 各种写法。
# 只认 p 这一个字母 —— 其它符号(t/F/r)后面跟不等式极少见,且误判代价更高。
_P_CLAIM = re.compile(r"\b[pP]\s*(<|≤|＜|>|≥|＞|=|＝)\s*(0?\.\d+)")

TEXT_EXTS = {".md", ".markdown", ".txt", ".csv", ".html", ".htm", ".svg", ".json"}
DOCX_EXTS = {".docx"}

# 🔴 `\.\d+` 那一支不能少:APA 体系写 `p = .029` / `d = .502`(不带前导零),
#    原正则匹配不到小数点开头的数,会把 `.029` 切成整数 `029` —— 于是既漏检真伪造,
#    又对 11 份真 APA 产物全部误报。而 APA 恰恰是本仓两套体系之一。
_NUM = re.compile(r"[-+]?(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][-+]?\d+)?%?")


def _extract_numbers(text: str) -> list[tuple[str, float]]:
    """抽出文本里的数字 token。返回 (原始串, 数值)。百分号一并处理。"""
    out: list[tuple[str, float]] = []
    for m in _NUM.finditer(text):
        raw = m.group(0)
        try:
            if raw.endswith("%"):
                out.append((raw, float(raw[:-1])))
            else:
                out.append((raw, float(raw)))
        except ValueError:
            continue
    return out


def _docx_text(path: Path) -> str:
    """读 .docx 的可见文本。

    直接解 zip 里的 word/document.xml 并剥标签 —— 不依赖 python-docx,
    因为本 verb 可能在**没有装 python-docx 的环境**里被当作独立取证工具跑
    (而漏检比多花几行解析代码危险)。
    """
    try:
        with zipfile.ZipFile(path) as z:
            xml = z.read("word/document.xml").decode("utf-8", "ignore")
    except Exception:  # noqa: BLE001
        return ""
    # <w:t> 里是可见文本;先把标签间隙补空格,免得相邻数字被粘成一个
    xml = re.sub(r"<[^>]+>", " ", xml)
    return xml


# 🔴 允许**从字符串里**抽数字的顶层子树 —— 只有这几支是纯引擎产出、模型无法影响内容的。
#
# ## 为什么必须有这张表(2026-08-06 实测的绕过)
#
# 首版对**任意**字符串抽数字(为修 `Python 3.13.5` 被判无源的误报)。而 bundle 里有好几支
# 字符串是**模型完全可控**的:
#   · `spec.data_file` —— 文件名来自模型传给 StatRun 的 `--data`,而那个文件本身
#     通常就是模型自己用 pandas 清洗后写出来的;
#   · `groups` / `descriptives` 的键 / `contrast.minuend|subtrahend|note_zh` ——
#     组标签来自数据文件内容,同样是模型可写的。
#
# 于是有了这条极便宜的绕过:把清洗后的 CSV 存成
#     clean_v4.106_m55.204_g0.98_lo0.48_hi1.47.csv
# 再照常调 StatRun。实测:一份**完全伪造**的报告在 `--enforce` 下 `findings: []` 放行,
# 而此前同一份会被标出 5 处无源。**模型可以在做真分析的同时,把它打算编造的每一个数字
# 预先注册成「有源」,成本是给数据文件起个名字。**
#
# 修法不是「别抽字符串」(那会让版本号误报回来),而是**分清哪些字符串是引擎写的**:
#   · software.*        —— `_software_stamp()` 从实际模块版本读出来,模型碰不到;
#   · multiplicity.*    —— 引擎按会话内 bundle 数算出来的;
#   · decision.*        —— 规则卡的 `reason` + 前提检验的成句,都出自 YAML 与引擎;
#   · assumptions[].*   —— 前提检验的 narrative,引擎成句;
#   · degraded          —— 引擎的降级说明。
# 其余(spec / groups / contrast / descriptives / n)**只取数值叶子**,不碰字符串。
_STRING_SOURCE_SUBTREES = frozenset({
    "software", "multiplicity", "decision", "assumptions", "degraded",
})


def _bundle_numbers(bundle_dir: Path) -> set[float]:
    """收集全部 bundle 里的数值。

    数值叶子:全树都收。
    字符串里的数字:**只收 `_STRING_SOURCE_SUBTREES` 里那几支**(见上方长注释)。
    dict 的**键**一律不收 —— 键是组标签,模型可写。
    """
    vals: set[float] = set()

    def walk(o: Any, *, strings_ok: bool) -> None:
        if isinstance(o, bool):
            return  # bool 是 int 的子类,不能当数值放进来
        if isinstance(o, (int, float)):
            if math.isfinite(float(o)):
                vals.add(float(o))
            return
        if isinstance(o, str):
            if not strings_ok:
                return
            # 版本号 `3.13.5` 会被拆成 3.13 与 5;`1.15.3` 拆成 1.15 与 3。
            # 报告里写的也是同一串,故按同样规则抽取即可对上 —— 不需要理解版本号语义。
            for _, v in _extract_numbers(o):
                if math.isfinite(v):
                    vals.add(v)
            return
        if isinstance(o, dict):
            for v in o.values():
                walk(v, strings_ok=strings_ok)
        elif isinstance(o, (list, tuple)):
            for v in o:
                walk(v, strings_ok=strings_ok)

    for p in sorted(bundle_dir.glob(f"*{BUNDLE_SUFFIX}")):
        try:
            bundle = json.loads(p.read_text(encoding="utf-8"))
        except Exception:  # noqa: BLE001
            continue
        if not isinstance(bundle, dict):
            continue
        # 顶层逐支走:只有白名单里的子树允许从字符串里抽数字。
        for key, sub in bundle.items():
            walk(sub, strings_ok=key in _STRING_SOURCE_SUBTREES)
    return vals


def _has_source(raw: str, value: float, sources: set[float]) -> bool:
    """按显示精度判断该数字是否有源。"""
    if value in STRUCTURAL or -value in STRUCTURAL:
        return True
    # p 阈值的**数值**照旧放行(它确实是模板常量);
    # 但「p<0.001 而实际 p=0.4653」这种**断言**由 _check_p_claims 单独判 —— 见其文档串。
    if value in _P_THRESHOLDS:
        return True
    # 显示精度 = 原始串小数位数
    frac = 0
    if "." in raw:
        frac = len(raw.split(".")[-1].rstrip("%"))
    for s in sources:
        # 只留「bundle 存比例、报告写百分数」这一个方向 —— 反向的 s/100 会把容差放大 100 倍,
        # 使三位小数 p 值几乎恒判有源(见文件头第 2 条的实测数据)。删除理由留在原地,
        # 否则半年后会有人以「兼容性」为由把它加回来。
        for cand in (s, s * 100.0):
            if not math.isfinite(cand):
                continue
            # 🔴 按**叙述的显示精度**舍入 bundle 值再比,不反过来 ——
            #    反过来等于允许「报告写 0.04 而真值 0.048」这类截断/抄错蒙混过关。
            if round(cand, frac) == round(value, frac):
                return True
    return False


def _check_p_claims(text: str, p_values: list[float]) -> list[dict[str, Any]]:
    """核对交付物里的 **p 值断言**与 bundle 的 `p_exact` 是否相容。

    ## 为什么光比数字不够

    numcheck 原本只做「文本里的数字能不能在 bundle 里找到源」。而一句
        「两组差异有统计学意义(P < 0.001)」
    全文仅有的数字 token 是 `0.001` —— 一个模板常量。于是**破坏力最大的那句话
    恒过闸**,实测在 `--enforce` 下 `findings: []`,而 bundle 里 p=0.4653。
    数字集合比对对「不等式方向」结构上无感:它看得见 0.001,看不见那个 `<`。

    ## 判据是确定性的,不是启发式

    `p < X` 与 bundle 相容 ⇔ 存在某份 bundle 使 `p_exact < X`。其余同理。
    「存在某份」而不是「所有」:一个会话可以有多份分析,而交付文件对应哪一份,
    这一层不知道(也不该猜)。宁可放过跨 bundle 的张冠李戴,也不误伤正常的多指标报告 ——
    前者由 `spec_hash` 在文件名里的对应关系另行治理。

    ⇒ 因此这一条**可以先于「转 enforce」落地**:它不会误伤任何一份如实报告。
    """
    if not p_values:
        return []                       # 没有 bundle 就没有可判定的事实
    bad: list[dict[str, Any]] = []
    for m in _P_CLAIM.finditer(text):
        op, num = m.group(1), m.group(2)
        try:
            thr = float(num)
        except ValueError:
            continue
        if op in ("<", "≤", "＜"):
            ok = any(p < thr or math.isclose(p, thr, rel_tol=1e-9) for p in p_values)
        elif op in (">", "≥", "＞"):
            ok = any(p > thr or math.isclose(p, thr, rel_tol=1e-9) for p in p_values)
        else:                            # = 
            # 等号按**报告的显示精度**比 —— 与 _has_source 同一口径。
            frac = len(num.split(".")[-1])
            ok = any(round(p, frac) == round(thr, frac) for p in p_values)
        if not ok:
            bad.append({
                "claim": m.group(0).strip(),
                "bundle_p": [round(p, 6) for p in sorted(p_values)][:5],
            })
    return bad


def _bundle_p_values(bundle_dir: Path) -> list[float]:
    """bundle 里**全部**的 p 值:主检验的 `p_exact` + 各前提检验的 p(含逐组)。

    🔴 收全而不是只收 `p_exact` —— 这一条是被自家测试当场抓出来的。
       首版只取主检验的 p,结果**引擎自己产出的报告被判违规**:Methods 段里
       「各组正态性(甲:0.978, p=.042、乙:…):该前提满足。方差齐性…p=.516」
       那几个 p 是前提检验的,拿主检验的 p_exact 去比自然对不上 ⇒ 三处假阳性。
       一道一开就先没收自家产物的闸,永远转不了 enforce(审计 M-39 记的正是这类自伤)。

    ⚠️ 代价如实记:收全之后判据变松 —— 报告写 `p<0.001` 而主检验 p=0.533、
       但某个前提检验的 p 恰好 <0.001 时,这条断言会被放行。
       这是**刻意选的方向**:这道闸的头号障碍是假阳性率(假阳性会让人把闸关掉),
       而它要拦的主要形态(「什么都不显著却写 P<0.001」)在收全之后仍然拦得住。
       更严的做法需要把「这句话在讲哪个检验」也判出来,那是另一个量级的工程。
    """
    out: list[float] = []

    def _add(v: Any) -> None:
        if isinstance(v, bool):
            return
        if isinstance(v, (int, float)) and math.isfinite(float(v)):
            out.append(float(v))

    for p in sorted(bundle_dir.glob(f"*{BUNDLE_SUFFIX}")):
        try:
            b = json.loads(p.read_text(encoding="utf-8"))
        except Exception:  # noqa: BLE001
            continue
        _add(b.get("p_exact"))
        for a in b.get("assumptions") or []:
            if not isinstance(a, dict):
                continue
            _add(a.get("p_value"))
            for row in a.get("per_group") or []:
                if isinstance(row, (list, tuple)) and len(row) >= 3:
                    _add(row[2])
    return out


def run_numcheck(*, workdir: Path, out_dir: str = OUT_DIR,
                 analysis_dir: str = ANALYSIS_DIR,
                 enforce: bool | None = None) -> dict[str, Any]:
    bundles = workdir / analysis_dir
    outp = workdir / out_dir
    sources = _bundle_numbers(bundles) if bundles.is_dir() else set()
    p_values = _bundle_p_values(bundles) if bundles.is_dir() else []

    # ── 🔴 没有真源 = 没有可判定的事实,直接跳过(2026-08-06 补)────────────────
    #
    # 本 verb 被执行器**对所有 feature 每一轮**调用(挂在 turnLoop 收尾的 emitArtifacts 上),
    # 而 statkit 装在全局 dist-packages ⇒ claw / prism / boltslides / sci_draw 的会话里
    # 探针照样跑得通,只是没有 bundle。此时 `sources` 是空集,于是 out/ 里的**每一个数字**
    # 都被判无源 —— 实测:一份综述里的 `2024 / 12 / 48 / 1260`,连页码 `45-67`
    # 都被切成 45 与 **-67** 全部标红;scidraw 的 SVG 路径坐标一个不剩。
    #
    # 两个后果都致命:
    #   ① observe 模式的**立论**是「先采真实会话的假阳性率,再决定开不开硬拦」,
    #      而样本里非 stat_lab 会话的 FP 率恒为 100% ⇒ 这个数据永远得不出可用结论;
    #   ② `STATKIT_NUMCHECK_ENFORCE` 是**进程级**单开关,一旦按设计打开,
    #      claw 的综述、prism 的稿件、scidraw 的每一张图会被整体移进 quarantine,
    #      用户看到交付物凭空消失。
    #
    # 判据放在这里(而不是让调用方传 featureKey):**没有 bundle 就没有「该有的来源」**,
    # 这是本 verb 自己就能判定的事实,不需要外面告诉它这是哪个 feature。
    if not sources:
        return {
            "ok": True, "mode": "enforce" if (
                enforce if enforce is not None
                else os.environ.get("STATKIT_NUMCHECK_ENFORCE") == "1"
            ) else "observe",
            "sources_count": 0, "scanned": [], "findings": [],
            "skipped_reason": "no_bundle",
            "limitations_zh": [
                "本会话没有任何分析结果(analysis/ 下无 bundle),因此没有可比对的数字来源 —— "
                "本次**未做校验**,不是「校验通过」。",
            ],
        }

    findings: list[dict[str, Any]] = []
    scanned: list[str] = []
    if outp.is_dir():
        for f in sorted(outp.rglob("*")):
            if not f.is_file():
                continue
            ext = f.suffix.lower()
            if ext in TEXT_EXTS:
                text = f.read_text(encoding="utf-8", errors="ignore")
            elif ext in DOCX_EXTS:
                text = _docx_text(f)
            else:
                continue  # 二进制产物(png/pdf)本 verb 不覆盖 —— 如实记在 limitations
            scanned.append(str(f.relative_to(workdir)))
            unsourced = [
                {"raw": raw, "value": val}
                for raw, val in _extract_numbers(text)
                if not _has_source(raw, val, sources)
            ]
            bad_claims = _check_p_claims(text, p_values)
            if unsourced or bad_claims:
                findings.append({
                    "file": str(f.relative_to(workdir)),
                    "unsourced": unsourced[:20],
                    "unsourced_total": len(unsourced),
                    # 断言级违规与「无源数字」分开列:两者的性质与修法不同 ——
                    # 前者是**说了一件与分析结果相反的事**,后者可能只是抄错精度。
                    "unsupported_claims": bad_claims[:10],
                    "unsupported_claims_total": len(bad_claims),
                })

    # 档位优先级:调用方显式传入 > 环境变量。
    #
    # 🔴 为什么要有显式参数(2026-08-06):执行器侧的探针以前靠 env 传这个开关,
    #    而那是它 `env: {...process.env}` 全量透传的**唯一**借口 —— 全仓最危险的一处 spawn,
    #    为一个从未在任何 compose/.env 里设过的变量,把 MINICOD_API_KEY / EXECUTOR_AUTH_TOKEN
    #    一起递了出去。改成 CLI flag 之后:① 执行器读自己的 env(它本就有权),
    #    转成 `--enforce` 传进来;② 探针得以进 bwrap jail(bwrap 是 --clearenv + setenv 白名单,
    #    env 传不进去,而 flag 传得进去);③ 档位出现在 argv 里 = 日志里能看见这次到底是哪一档。
    if enforce is None:
        enforce = os.environ.get("STATKIT_NUMCHECK_ENFORCE") == "1"
    return {
        "ok": not findings or not enforce,
        "mode": "enforce" if enforce else "observe",
        "sources_count": len(sources),
        "scanned": scanned,
        "findings": findings,
        # 如实声明覆盖边界 —— 一条只覆盖一半却不说的闸,比没有闸更危险。
        "limitations_zh": [
            "只扫文本类与 .docx 产物;png/pdf/xlsx 内的数字不覆盖(图片里的数字尤其扫不到)。",
            "断言级校验目前只覆盖 **p 值不等式/等式**(p<X / p=X),"
            "且判据是「与 bundle 里**任一** p 值相容」(主检验 + 各前提检验)—— "
            "为压住假阳性而刻意放松,不判断这句话在讲哪个检验。"
            "「显著/不显著」「A 高于 B」「CLD 字母标记」这类**非数字结论**仍不在覆盖面内 —— "
            "本闸拦不住它们,不要据此认为交付物里的每句话都被核对过。",
            "匹配是启发式(舍入/百分比换算),默认 observe 只记录不拦截;"
            "开硬拦需 STATKIT_NUMCHECK_ENFORCE=1,且应在采到假阳性率之后再开。",
        ],
    }


def cli(argv: list[str]) -> tuple[int, str]:
    opts: dict[str, str] = {}
    flags: set[str] = set()
    i = 0
    while i < len(argv):
        if argv[i].startswith("--") and i + 1 < len(argv) and not argv[i + 1].startswith("--"):
            opts[argv[i][2:]], i = argv[i + 1], i + 2
        elif argv[i].startswith("--"):
            flags.add(argv[i][2:]); i += 1
        else:
            i += 1
    # `--enforce` 不传时留 None → 回落到 env(命令行手跑仍按老习惯生效)。
    res = run_numcheck(workdir=Path(opts.get("workdir", ".")),
                       enforce=True if "enforce" in flags else None)
    # 退出码:0 = 放行(observe 模式恒 0);2 = enforce 且有无源数字。
    return (0 if res["ok"] else 2), json.dumps(res, ensure_ascii=False, indent=2)
