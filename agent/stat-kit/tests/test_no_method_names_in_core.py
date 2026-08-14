"""🔴 方案 R 的**唯一硬证据**:方法学知识真的住在卡片里,不在代码里。

## 没有这条测试会怎样

注册表会缓慢退化成「代码旁边的一份文档」—— 表面上有 YAML,实际行为由 `core/` 里
悄悄长出来的 `if method_id == "welch_t"` 决定。那种状态比没有注册表更糟:
它让人以为改 YAML 就能改行为,而真正的分支在别处,评审的是一份不生效的文件。

本测试机械保证:**引擎代码里不出现任何具体方法名 / 规则 id**。
要改「什么时候用 Welch」,只能改卡片。

## 白名单为什么很短

只有 `cards/` 目录自己和文档字符串可以出现方法名。`engines/` 允许出现 —— 那里是
自写统计的实现(Duncan / Games-Howell),函数名带方法名是应该的;但它们**不做选择**,
只做计算,选择权在 `assume`。
"""

from __future__ import annotations

import ast
import re
from pathlib import Path

import yaml

PKG = Path(__file__).resolve().parent.parent / "statkit"
# 只查「做决策」的层。engines/ 是纯计算实现,方法名出现在函数名里是正当的。
# 🔴 report 是 2026-08-05 补进来的:此前它不在扫描面里,
#    `report/narrative.py` 的 `_NAMES` 映射(method id → 中英文名 / 是否非参)整族逃过了检查 ——
#    而那正是最该住在卡片里的知识。**护栏漏一个目录 = 那个目录变成知识回流的后门。**
GUARDED_DIRS = ["core", "verbs", "registry", "report"]


def _card_names() -> set[str]:
    names: set[str] = set()
    cards = PKG / "cards"
    for path in cards.rglob("*.yaml"):
        data = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
        for key in ("methods", "checks", "effects", "rules"):
            for item in data.get(key, []) or []:
                if isinstance(item, dict) and "id" in item:
                    names.add(str(item["id"]))
    return names


def _code_strings_and_names(py: Path) -> list[tuple[int, str]]:
    """取出源码里的**字符串字面量与标识符**,跳过注释、docstring 与惰性归属元数据。

    刻意不用正则扫全文:注释里大量讨论方法名(「D-03 走 Welch」这类说明),
    那是**应该存在**的 —— 本仓吃过「裸 grep 把注释计成用法」的亏。

    🔴 **一处刻意的豁免:`Fact(...)` 构造调用的实参。**
    首版没有这条豁免,测试当场把 `core/facts.py` 里的 `introduced_by="D-01 两组比较族"`
    全判成违规 —— 但那恰恰是**本护栏想要的东西**:它是止损点 B 的增长观察口
    (「加一张卡就往词表塞几条事实」同样是把知识搬回代码,只是换了个门)。

    豁免的边界想清楚了才敢开:`Fact` 是 frozen dataclass 的**惰性元数据**,
    id 出现在那里不可能影响控制流;真正危险的是 `if rule_id == "D-01"` 这种
    **行为随卡片 id 分叉**。豁免范围因此收得极窄 —— 只豁免 `Fact(...)` 的实参,
    不豁免整个文件、不豁免 `introduced_by` 这个名字在别处的使用。
    """
    tree = ast.parse(py.read_text(encoding="utf-8"), filename=str(py))
    out: list[tuple[int, str]] = []

    docstrings = set()
    for node in ast.walk(tree):
        if isinstance(node, (ast.Module, ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            d = ast.get_docstring(node, clean=False)
            if d:
                docstrings.add(d)

    # 收集 Fact(...) 调用里的全部字符串实参节点(位置参数与关键字参数都要),这些豁免。
    exempt: set[int] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id == "Fact":
            for arg in list(node.args) + [kw.value for kw in node.keywords]:
                if isinstance(arg, ast.Constant) and isinstance(arg.value, str):
                    exempt.add(id(arg))

    for node in ast.walk(tree):
        if isinstance(node, ast.Constant) and isinstance(node.value, str):
            if node.value in docstrings or id(node) in exempt:
                continue
            out.append((getattr(node, "lineno", 0), node.value))
        elif isinstance(node, ast.Name):
            out.append((getattr(node, "lineno", 0), node.id))
        elif isinstance(node, ast.Attribute):
            out.append((getattr(node, "lineno", 0), node.attr))
    return out


def test_no_card_ids_in_engine_code() -> None:
    names = _card_names()
    assert names, "卡片一张都没读到 —— 测试自身失效了(比不通过更危险)"

    # 规则 id 形如 D-01;方法/检验/效应量 id 形如 welch_t。两类都不许进引擎代码。
    rule_re = re.compile(r"\bD-\d{2}\b")
    offenders: list[str] = []

    for d in GUARDED_DIRS:
        for py in (PKG / d).rglob("*.py"):
            for lineno, text in _code_strings_and_names(py):
                if rule_re.search(text):
                    offenders.append(f"{py.relative_to(PKG)}:{lineno} 出现规则 id → {text!r}")
                for n in names:
                    if rule_re.search(n):
                        continue  # 规则 id 已由上面那条覆盖
                    if text == n:
                        offenders.append(f"{py.relative_to(PKG)}:{lineno} 出现卡片 id → {n!r}")

    assert not offenders, (
        "引擎代码里出现了具体的方法 / 规则名,方案 R 的立论(方法学知识住在卡片里)被破坏:\n  "
        + "\n  ".join(offenders)
        + "\n\n要改「什么时候用哪个方法」,请改 statkit/cards/ 下的 YAML,不要在引擎里加分支。"
    )


def test_guard_itself_still_catches_a_real_violation() -> None:
    """🔴 阳性对照 —— 证明上面那条豁免没有把护栏掏空。

    本仓的教训:「一条永远绿的规则」和「一条不存在的规则」等价。
    上一条测试开了 `Fact(...)` 实参豁免;若豁免写宽了(比如整文件豁免、或按变量名豁免),
    它会静默地对真正的违规也放行,而测试照样绿。所以这里**人造一段违规**喂给同一套扫描逻辑,
    断言它必须被抓到 —— 护栏失效时这条会红。
    """
    import tempfile

    violating = (
        "from statkit.core.facts import Fact\n"
        "# 这是合法的惰性元数据,不该被抓\n"
        'OK = Fact("x", "bool", "desc", "D-01 两组比较族", "consult")\n'
        "\n"
        "def choose(rule_id):\n"
        "    # 这是真违规:引擎行为随卡片 id 分叉\n"
        '    if rule_id == "D-03":\n'
        '        return "welch_t"\n'
        "    return None\n"
    )
    with tempfile.TemporaryDirectory() as d:
        p = Path(d) / "fake_engine.py"
        p.write_text(violating, encoding="utf-8")
        found = _code_strings_and_names(p)
        texts = [t for _, t in found]

    assert "D-03" in texts, "护栏漏掉了真正的违规(if rule_id == 'D-03')—— 豁免写宽了"
    assert "welch_t" in texts, "护栏漏掉了硬编码的方法名返回值"
    assert "D-01 两组比较族" not in texts, "Fact(...) 的归属元数据不该被判成违规"


def test_fact_vocabulary_growth_is_attributed() -> None:
    """每条派生事实必须写明是被哪张卡引入的 —— 止损点 B 的观察口。

    逃生谓词被 schema 禁掉后,压力会转移到事实词表:「加一张卡就往词表塞几条事实」
    同样是把知识搬回代码,只是换了个门。`introduced_by` 让这条增长曲线可见。
    """
    from statkit.core.facts import VOCABULARY

    missing = [f.name for f in VOCABULARY if not f.introduced_by.strip()]
    assert not missing, f"这些事实没写 introduced_by:{missing}"

    sources = {f.source for f in VOCABULARY}
    assert sources <= {"profile", "consult", "check"}, (
        f"事实来源只能是 profile / consult / check,出现了:{sources - {'profile', 'consult', 'check'}}"
    )
