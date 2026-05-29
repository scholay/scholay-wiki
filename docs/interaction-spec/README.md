# Scholay 交互规约 (Interaction Spec)

> 用途：作为**编写测试用例的依据**。每一行 = 一个可被测试覆盖的交互点。
>
> **Ground Truth 约定**：已开发模块以**前端代码实际行为**为准（不是设计图）；未开发 / 刚起步模块以代码现状为准并标注「mock / 未接线 / TODO」。详见 `frontend-user/CLAUDE.md` 与团队记忆约定。
>
> 覆盖范围：**已开发模块 + 路由已存在的页面**（`frontend-user/src/app/router.tsx` 中实际挂载的路由）。纯设计稿、尚无路由的页面（投稿改版 / Landing / Mobile / 付费弹窗等）暂不纳入。

## 文件结构

| 文件 | 内容 | 粒度 |
|---|---|---|
| [00-overview.md](00-overview.md) | **页面/流程级骨架总表** — 每行一个页面/视图与其核心流程 | 粗（页面/流程级） |
| [01-shell.md](01-shell.md) | 全局外壳与导航 (SHELL) | 细（元素级） |
| [02-home.md](02-home.md) | 主页 (HOME) + 详情页 (DETAIL) | 细 |
| [03-search.md](03-search.md) | 搜索工作区 (SRCH) | 细 |
| [04-journals.md](04-journals.md) | 期刊列表 + 详情 (JRNL) | 细 |
| [05-library.md](05-library.md) | 文献集 (LIB) | 细 |
| [06-peer-review.md](06-peer-review.md) | 评审 (REV)（刚起步） | 细 |
| [07-prism-browser.md](07-prism-browser.md) | Prism (PRSM) + 浏览 (BRWS) | 细 |
| [08-tools-claw-auth-settings.md](08-tools-claw-auth-settings.md) | 工具 (TOOL) / Claw (CLAW) / 认证 (AUTH) / 设置 (SET) | 细 |

## 元素级明细表列定义（所有 0X 文件统一）

| 列 | 含义 |
|---|---|
| **用例ID** | `<前缀>-NNN`，全局唯一，测试用例引用此 ID 回链规约 |
| **页面/区域** | 该交互所在页面与具体区域/面板 |
| **元素** | 被交互的 UI 元素（按钮 / 输入框 / tab / 行 / 抽屉…） |
| **触发动作** | 具体动作：点击 / 输入 / hover / 键盘 / 拖拽 |
| **前置条件** | 触发前必须满足的状态（已登录 / 列表非空 / 已选中…），无则 `—` |
| **预期结果** | 代码中实际可观测的行为（跳转 / 状态变更 / 弹层 / Toast / 列表刷新） |
| **边界/异常** | 空态 / 加载 / 错误 / 校验失败 / 禁用 / 配额限制，代码中无则 `—` |
| **数据/接口依赖** | 依赖的 react-query hook / 接口 / store，或 `mock静态` / `纯前端` |
| **状态/备注** | 真实 vs mock vs 未接线 / TODO；必要处标 `file:line` |

## ID 前缀对照

| 前缀 | 模块 | 前缀 | 模块 |
|---|---|---|---|
| `SHELL` | 全局外壳/导航 | `REV` | 评审 |
| `HOME` | 主页 | `BRWS` | 浏览 |
| `DETAIL` | 论文/学者/期刊详情 | `PRSM` | Prism |
| `SRCH` | 搜索 | `TOOL` | 工具 |
| `JRNL` | 期刊 | `CLAW` | Claw |
| `LIB` | 文献集 | `AUTH` | 认证 |
| | | `SET` | 设置 |

## 维护方式

- 代码改动后，对应模块表同步更新；新增交互追加新 ID（**不复用已删除的 ID**）。
- 「状态/备注」列把 `mock静态 / 未接线 / TODO` 当作显式信号——测试用例可据此决定是写真实断言还是占位 skip。
- 该规约从 `frontend-user/src` 真实代码抽取，分支 `docs/interaction-spec`。
