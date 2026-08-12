# Product Mock → Scholay Wiki 组件迁移审计

核验日期：2026-08-12

目标：`frontend-user/src/features/wiki/embeds/`

视觉来源：相邻项目 `scholar-product-mock/frontend-user/src/`

## 结论

本轮按“可独立讲解、可稳定复现的产品表面”盘点，而不是按 React 文件数量或路由数量凑数。机械清单共 241 组：

| 域               | 稳定可见 | 本轮补齐 / 修正 | 沿用既有覆盖 | 明确排除 |
| ---------------- | -------: | --------------: | -----------: | -------: |
| 普通用户桌面     |       98 |              25 |           73 |        5 |
| 移动端与全局跨端 |       42 |              16 |           26 |        4 |
| 管理后台         |       87 |              50 |           37 |        5 |
| 合计             |  **227** |          **91** |      **136** |   **14** |

最终 Wiki 注册表包含 210 个唯一 fixture ID，共有 254 次文章挂载。227 个稳定可见表面全部能解析到至少一个已注册、已挂载的 fixture；253 个 mock 源文件路径在本地 sibling 项目中逐条存在。

## 迁移规则

1. 从 mock 选择一个有解释价值的代表状态，按现行 Wiki 设计 token 重绘为静态 `WikiEmbed*.tsx`。
2. fixture 必须保留源界面的信息层级、流程名称、字段关系和状态语义；当前 `scholar` 的业务契约优先于过时 mock 文案。
3. fixture 不连接 API、store、hook，不执行写操作，也不伪装成实时数据。价格、额度、指标、奖励和后台统计使用明确的示例口径。
4. 每个 ID 必须同时进入 `WikiEmbedId`、`WIKI_EMBED_REGISTRY` 和至少一个词条章节；图注由统一 `WikiEmbedFrame` 显示。
5. 内部原子、纯重定向、未接线死代码、浏览器原生 prompt/toast 和只在运行时组合的协调器不单独制造截图；必须在覆盖账本中写明排除理由。

## 权威证据

- 逐组机器可读账本：`frontend-user/src/features/wiki/embeds/mock-surface-coverage.ts`
- ID 白名单：`frontend-user/src/features/wiki/types.ts`
- 组件注册表：`frontend-user/src/features/wiki/embeds/registry.tsx`
- 内容与迁移门禁：`frontend-user/tests/wiki-content.test.ts`
- 设计系统门禁：`frontend-user/tests/design-system-guard.test.ts`
- 页面级视觉验收：`design-qa.md`

## 明确排除的范围

14 个排除组仅包括以下类别：普通用户侧的通用页面壳、加载/错误宿主、共享弹窗原子和运行时导览；移动侧的预取/骨架/手势引擎与通用 bottom-sheet 原语；后台侧的 redirect、浏览器原生反馈、未接线命令面板、表格/分页/指标卡原子和通用确认宿主。它们的稳定业务状态已在对应复合 fixture 中展示，因此不会再复制一份脱离语境的 Wiki 图。

## 验收门禁

- 210 个注册 ID 唯一，且全部至少挂载一次。
- 241 个覆盖 key 唯一；227 个可见表面无遗漏，14 个排除项均有理由。
- sibling mock 存在时，账本中的每个源路径必须解析成功。
- 所有 `WikiEmbed*.tsx` 必须通过静态性扫描、TypeScript、ESLint、Prettier 和设计系统测试。
- 生产构建和页面级浏览器巡检必须通过后才能提交。
