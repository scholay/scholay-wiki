"""会话工作目录下的固定子目录名 —— **零依赖叶子模块**。

## 为什么单独一个模块

这两个名字此前散在三处:`verbs/run.py:53` 的 `ANALYSIS_DIR`、`verbs/report.py:28` 的 `OUT_DIR`、
`verbs/numcheck.py:159` 的两个**默认参数字面量**。三份副本、零校验。
而它们不是排版偏好,是**安全边界的一部分**:

- `analysis/` 是引擎独占保留区。TS 侧 `agent/src/sandbox/reserved.ts` 用同一个字符串构造
  confinePath 的拒写判定与 bwrap 的只读覆盖层;这一侧用它判定「bundle 只能从这里读」。
  两侧任一处漂移,`StatReport` 的路径闸就会指向一个不存在的目录 —— 而症状是**静默放行**。
- `out/` 是交付区。numcheck 扫它、report 写它、backend 的 `ListWorkspaceFiles(out/)` 收割它。

⚠️ 改这里的值,必须同步改 `agent/src/sandbox/reserved.ts`。
   `agent/src/tools/statkitPaths.test.ts` 是把两侧钉在一起的跨语言不变量,改一侧会当场红。

## 为什么不从 verbs/run.py 导入

`run.py` 顶部就 `import numpy/pandas`。让 `report`/`numcheck` 为了一个字符串常量把整个科学栈拉起来,
既慢又会在「只想渲染报告」的路径上引入不必要的失败面。叶子模块零依赖,谁都能安全 import。
"""

from __future__ import annotations

#: bundle 目录 —— 引擎独占保留区,模型无任何写入路径(TS 侧 reserved.ts 同名常量)。
ANALYSIS_DIR = "analysis"

#: 交付区 —— 用户可见产物的落点。
OUT_DIR = "out"

#: bundle 文件名后缀。`run` 按 `<spec_hash>.bundle.json` 落盘,
#: `report` 与 `numcheck` 都按这个后缀识别 —— 写死在一处,免得三处各写一遍正则。
BUNDLE_SUFFIX = ".bundle.json"
