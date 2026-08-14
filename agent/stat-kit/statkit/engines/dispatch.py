"""形状路由(C1)—— 方法 id → 实现函数的**唯一**查表口。

## 为什么需要它

2026-08-06 之前,`run.py` 里写的是裸下标 `tests.DISPATCH[method_id]`,而
`tests.DISPATCH` 里的每个实现签名都是 `(groups, ctx)`:一份 `list[list[float]]`。
这个签名把「引擎能吃什么形状的数据」写死在了一个模块里,后果是:

  · 分类资料族(列联表)**在结构上没有能被调用的入口** —— 调用方只能在外面把
    2×2 表拍扁成两个 0/1 向量再传进来,而那样一来 n、期望频数、每格占比全部丢失,
    交付层想印「例数(%)」三线表时已经无从取数。
  · 信度族(k 个条目 × N 个受试)同理:它天然是一张矩阵,不是「若干组」。

所以形状不能是某一族的私有约定,必须升成**方法卡的一等字段**(`Method.input_shape`)
并在这里集中路由。加一族新形状 = 加一个模块 + 这张表里加一行,`run.py` 不动。

## 🔴 为什么加载期就要查这张表

`load_registry` 会断言 `method.id ∈ resolve 得到的 DISPATCH`。没有这条断言时,
往注册表塞一张**纯 YAML、零实现**的卡:doctor 全绿、测试全绿、镜像照出,
而真实用户第一次命中那条规则拿到的是 `KeyError` 加一整段 Python traceback。
实测确认过一次(2026-08-06 的 ANOVA 卡),不是假想。

## 形状取值刻意受限

`Literal["groups", "table"]` —— `items`(信度族)**还没有实现**,所以不许在卡片里写。
提前把枚举值开出去,等于允许写出一张加载期能过、运行期必崩的卡。
"""

from __future__ import annotations

from typing import Any, Callable

from . import categorical as _cat
from . import tests as _tst

# 形状 → 该形状的实现表。**唯一真源**;新增一族形状只改这里。
_BY_SHAPE: dict[str, dict[str, Callable[..., Any]]] = {
    "groups": _tst.DISPATCH,
    "table": _cat.DISPATCH,
}


def shapes() -> tuple[str, ...]:
    return tuple(_BY_SHAPE)


def table_for(shape: str) -> dict[str, Callable[..., Any]]:
    if shape not in _BY_SHAPE:
        raise KeyError(
            f"未知的 input_shape {shape!r} —— 已注册:{sorted(_BY_SHAPE)}。"
            f"新形状要先在 engines/dispatch.py 登记实现表,再允许卡片写这个值。"
        )
    return _BY_SHAPE[shape]


def implemented(shape: str) -> list[str]:
    return sorted(table_for(shape))


def resolve(method_id: str, shape: str) -> Callable[..., Any]:
    """查实现。**故意不吞 KeyError**:查不到必须是显式失败 ——
    静默回落到另一个形状的同名实现,会让一份列联表被当成数值向量跑 t 检验。"""
    tbl = table_for(shape)
    if method_id not in tbl:
        raise KeyError(
            f"方法 {method_id!r} 在形状 {shape!r} 的实现表里不存在;"
            f"该形状已实现:{sorted(tbl)}"
        )
    return tbl[method_id]
