"""数据集契约 —— 引擎内部传递「一份准备好的数据」的唯一形态。

## 🔴 为什么必须有它(C2,2026-08-07)

此前计算契约是 `groups: dict[str, ndarray]`(S1)。它对**两组/多组连续量**是够的,
但下一族一落地就装不下:

- **列联表**塞进 `groups` ⇒ `describe_groups()` 会对**计数**算 mean/sd 填进 `bundle.descriptives`
  ⇒ 三线表印出「计数的均数±标准差」。数字都在、格式都对、没有任何东西报错。
- **6 题量表**塞进 `groups` ⇒ `n_groups=6` / `multi_group=True` ⇒ 命中 D-07,
  而 ANOVA 卡的 `accepts_levels(6)` 正好为真 ⇒ **三道机械闸全绿地跑完一个方差分析**。

两种都不是「会报错的错」,是「静默产出一份看起来正常的错报告」。
这正是本仓最贵的一类 bug,所以形状必须在**类型层**分开,而不是靠调用方自觉。

⛔ 刻意**不用** `ctx.extra` 这类无类型口袋装它们:那样 shape 断言看不见、
   `_nonfinite` 看不见、护栏看不见 —— 等于把新族排除在全部机械防线之外。

## shape 由什么决定

**纯函数,从「角色参数 + 列画像」推,不由参数名分派。**

判据里最要紧的一条:分类结局最常见的形态恰恰是 `--dv 疗效 --group 组别` ——
与 t 检验的参数**一模一样**。若按参数名选族,等于把「这该做什么检验」的判断
交回给调用方,而那正是 assume.py 立论里 38.4% 选错率的入口。
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal

import numpy as np

Shape = Literal["groups", "table", "items"]


@dataclass(frozen=True)
class ColumnProfile:
    """一列的画像 —— 事实层(core/facts)与 shape 路由的共同依据。"""

    name: str
    dtype: str
    n_valid: int
    n_distinct: int
    is_numeric: bool
    levels: tuple[Any, ...] = ()      # n_distinct 较小时才填,供列联表用

    @property
    def looks_categorical(self) -> bool:
        """取值个数 ≤2 即分类。

        ⚠️ 判据与 `run.py` 的二分类识别**同源**:两处不一致会出现
        「闸放行了、而规则认为它不连续」这种自相矛盾的状态。

        🔴 已知边界(施工时被红队点名,写在这里免得下一个人以为改定义就完事):
        1/2/3 编码的**名义**变量(如 1=甲组 2=乙组 3=丙组 的结局)仍是数值且 3 个取值,
        本判据会判成 continuous。处理这一格的**只有** `--dv-type` 显式覆盖
        与 `coded_categories_suspected` 那张 advisory —— 改这里的定义解决不了。
        """
        return self.n_distinct <= 2


@dataclass(frozen=True)
class CountTable:
    """列联表 —— 记录制而非矩阵。

    🔴 为什么是 `cells: [{row, col, n, expected, pct}]` 而不是 `counts: [[..],[..]]`:

    ① 记录制直接吃 S3 的 `a[].b` 段 —— `reports_required` 可以写
       `table.cells[].n` / `table.cells[].expected`,于是**数字锁**与
       **「有限性检查从 reports_required 派生」**两道闸自动覆盖新族;
    ② 矩阵形态的元素是 `list`,而 `_nonfinite` 的 `isinstance(item, (int, float))`
       会静默跳过它 ⇒ 新族对有限性检查**免疫**(一个 NaN 期望频数可以一路进三线表);
    ③ `pct` **必须以比例存**(0.7667 而不是 76.67):`numcheck._has_source` 的候选
       只有 `(s, s*100)`(÷100 那个方向已于 2026-08-06 刻意删除),
       只存计数的话每一份分类交付物里的 `n(%)` 会**全部判无源**。
    """

    rows: tuple[str, ...]             # 分组水平
    cols: tuple[str, ...]             # 结局水平
    cells: tuple[dict[str, Any], ...]
    total: int
    expected_min: float
    expected_lt5_share: float

    def matrix(self) -> np.ndarray:
        """渲染/计算时用的 R×C 频数矩阵(由 cells 重建,不另存一份免得漂移)。"""
        m = np.zeros((len(self.rows), len(self.cols)), dtype=float)
        ri = {r: i for i, r in enumerate(self.rows)}
        ci = {c: j for j, c in enumerate(self.cols)}
        for cell in self.cells:
            m[ri[cell["row"]], ci[cell["col"]]] = cell["n"]
        return m


@dataclass(frozen=True)
class Dataset:
    """送进计算层的一份数据。`shape` 决定哪个字段有效。"""

    shape: Shape
    groups: dict[str, np.ndarray] = field(default_factory=dict)   # shape=groups
    table: CountTable | None = None                               # shape=table
    items: dict[str, np.ndarray] | None = None                    # shape=items
    diff: np.ndarray | None = None
    unit: Literal["case", "pair", "subject"] = "case"
    n_before: int = 0
    n_used: int = 0
    profile: dict[str, ColumnProfile] = field(default_factory=dict)

    def two(self) -> tuple[np.ndarray, np.ndarray]:
        """两组族的取值助手 —— 顺序即 groups 的插入序(= contrast 的 minuend/subtrahend)。"""
        k = list(self.groups)
        return self.groups[k[0]], self.groups[k[1]]

    @property
    def arity(self) -> int:
        """该 shape 下「有几个单位」——供方法卡的 arity 断言用。

        刻意**按 shape 分派**而不共用一个整数:`groups` 数分组、`items` 数列。
        (`table` 的 arity 是二维的,由分类族自己的断言处理,不挤进这一个数。)
        """
        if self.shape == "items":
            return len(self.items or {})
        return len(self.groups)


def profile_columns(df: Any, cols: list[str]) -> dict[str, ColumnProfile]:
    """给若干列做画像。`df` 是 pandas DataFrame(此处不 import pandas,保持本模块轻)。"""
    out: dict[str, ColumnProfile] = {}
    for c in cols:
        if not c or c not in df.columns:
            continue
        s = df[c].dropna()
        uniq = s.unique()
        out[c] = ColumnProfile(
            name=c,
            dtype=str(df[c].dtype),
            n_valid=int(len(s)),
            n_distinct=int(len(uniq)),
            is_numeric=bool(df[c].dtype.kind in "ifb"),
            levels=tuple(uniq[:20].tolist()) if len(uniq) <= 20 else (),
        )
    return out


def shape_for(*, dv_kind: str, has_items: bool) -> Shape:
    """纯函数:由「角色 + 列画像」推 shape。

    **不由参数名分派** —— 见模块头。判据只有两条,刻意保持到能一眼核对:
      · items/vars 在场          → items
      · 否则看 dv 是连续还是分类 → groups / table
    """
    if has_items:
        return "items"
    return "groups" if dv_kind == "continuous" else "table"
