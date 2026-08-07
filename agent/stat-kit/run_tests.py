#!/usr/bin/env python3
"""statkit 自检 runner —— 不依赖 pytest。

## 为什么不装 pytest

agent 镜像的 python 是**运行期**环境:jail 内跑用户数据分析。pytest 及其依赖对运行期是纯负担,
而且每多一个包就多一分「pip 顶掉 Debian numpy」的风险(那正是 Dockerfile 那条构建期断言在防的事)。
但构建期自检又必须能跑 —— 否则「golden 全绿才出镜像」这条闸就没有执行点。

折中:测试用 pytest 的**写法**(`pytest.raises` / `tmp_path` / `pytest.skip` / `test_*` 函数),
由本 runner 提供一个小替身。本机开发想用真 pytest 直接 `pytest tests/` 也能跑,两边同一份测试文件。

## 🔴 替身支持哪些,不是随便定的

2026-08-06 审计发现:两道自称「数字锁执行点」的闸(`reports_required` / `non_finite_result`)
**零行为测试** —— 整块禁用仍 93/93 全绿,而有限性闸唯一的「测试」是
`inspect.getsource(...)` 查子串在不在源码里。

根因有一半在这里:替身此前只有 `pytest.raises`,`fn()` 是**无参**调用 ⇒ 没有 `tmp_path`。
而这些闸要触发就得落一份真文件、跑一次真 `run_analysis`。写行为测试的成本高到
「不如断言源码里有那个字符串」——**工具的形状会塑造测试的形状**。
所以补 `tmp_path` 与 `skip` 不是便利性改进,是拆掉写假测试的那个激励。

## 退出码

0 全过 / 1 有失败。构建期 `RUN python3 run_tests.py` 失败即不出镜像。
"""

from __future__ import annotations

import importlib.util
import inspect
import re
import math as _math
import sys
import tempfile
import traceback
from pathlib import Path

ROOT = Path(__file__).resolve().parent


class _Raises:
    """pytest.raises 的最小替身(支持 match= 与 .value)。"""

    def __init__(self, exc, match=None):
        self.exc, self.match, self.value = exc, match, None

    def __enter__(self):
        return self

    def __exit__(self, t, v, tb):
        if t is None:
            raise AssertionError(f"期望抛 {self.exc.__name__},但没有抛")
        if not issubclass(t, self.exc):
            return False  # 不是期望的异常 → 原样上抛,别吞
        if self.match and not re.search(self.match, str(v)):
            raise AssertionError(f"异常信息不含 {self.match!r}:{v}")
        self.value = v
        return True


class _Skipped(Exception):
    """pytest.skip 的替身载体。runner 把它与失败区别对待 —— 跳过要**吵**,不能算过。"""


def _skip(reason: str = "") -> None:
    raise _Skipped(reason)


class _Approx:
    """`pytest.approx` 的最小替身。

    刻意实现的是 **`==` 两侧都成立**(`__eq__` + `__req__` 由 Python 自动对称调用),
    因为测试里 `a == approx(b)` 与 `approx(b) == a` 两种写法都会出现。
    容差口径与 pytest 一致:相对 1e-6,绝对由 `abs=` 指定(缺省 1e-12)。
    """

    def __init__(self, expected: float, rel: float = 1e-6, abs: float = 1e-12) -> None:
        self.expected, self.rel, self.abs = float(expected), rel, abs

    def __eq__(self, other: object) -> bool:
        try:
            o = float(other)  # type: ignore[arg-type]
        except (TypeError, ValueError):
            return NotImplemented
        return _math.isclose(o, self.expected, rel_tol=self.rel, abs_tol=self.abs)

    def __repr__(self) -> str:
        return f"approx({self.expected!r} ± rel {self.rel}/abs {self.abs})"


def _approx(expected: float, rel: float = 1e-6, abs: float = 1e-12) -> _Approx:
    return _Approx(expected, rel, abs)


def _importorskip(name: str):
    """`pytest.importorskip` 的替身 —— 缺可选依赖时跳过而不是失败。

    ⚠️ 跳过在本 runner 里是**吵闹**的(会逐条列名),理由与 design-guard 那侧一样:
    一条永远绿的测试和一条不存在的测试等价,而「静默跳过」比两者都糟。
    """
    import importlib

    try:
        return importlib.import_module(name)
    except Exception as e:  # noqa: BLE001
        _skip(f"缺少可选依赖 {name}({e})")


def _install_pytest_stub() -> None:
    if "pytest" in sys.modules:
        return
    stub = type(sys)("pytest")
    stub.raises = _Raises  # type: ignore[attr-defined]
    stub.skip = _skip  # type: ignore[attr-defined]
    stub.approx = _approx  # type: ignore[attr-defined]
    stub.importorskip = _importorskip  # type: ignore[attr-defined]
    sys.modules["pytest"] = stub


def main() -> int:
    sys.path.insert(0, str(ROOT))
    _install_pytest_stub()

    files = sorted((ROOT / "tests").glob("test_*.py"))
    if not files:
        print("🔴 一个测试文件都没找到 —— runner 自身失效比测试不过更危险")
        return 1

    passed = failed = skipped = 0
    skipped_names: list[str] = []
    for path in files:
        spec = importlib.util.spec_from_file_location(path.stem, path)
        assert spec and spec.loader
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        print(f"\n{path.name}")
        for name in sorted(dir(mod)):
            if not name.startswith("test_"):
                continue
            fn = getattr(mod, name)
            if not callable(fn):
                continue
            # `tmp_path` fixture 的替身:声明了才给,每条测试一个独立临时目录(与 pytest 同语义)。
            wants_tmp = "tmp_path" in inspect.signature(fn).parameters
            try:
                if wants_tmp:
                    with tempfile.TemporaryDirectory() as d:
                        fn(tmp_path=Path(d))
                else:
                    fn()
            except _Skipped as e:
                skipped += 1
                skipped_names.append(f"{path.name}::{name} — {e}")
                print(f"  ⊘ {name}(跳过:{e})")
            except Exception:  # noqa: BLE001
                failed += 1
                print(f"  ✗ {name}")
                traceback.print_exc()
            else:
                passed += 1
                print(f"  ✓ {name}")

    print(f"\n{passed} passed, {failed} failed, {skipped} skipped")
    # 🔴 跳过要**吵**。本仓库的心法:「一条永远绿的规则和一条不存在的规则等价」——
    #    静默 skip 正是让规则变成前者的最快路径(bun 与 vitest 都把 skip 算成绿,踩过)。
    #    这里不判失败(skip 有正当理由,如文件系统不支持符号链接),但必须逐条列出来。
    if skipped_names:
        print("\n⚠️  本次有规则被跳过 —— 绿灯 ≠ 全部校验通过:")
        for s in skipped_names:
            print(f"     ⊘ {s}")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
