# Product Mock → Scholay Wiki 组件迁移审计

核验日期：2026-08-12

目标：`frontend-user/src/features/wiki/embeds/`

视觉来源：相邻项目 `scholar-product-mock/frontend-user/src/`

## 结论

本轮按“可独立讲解、可稳定复现的产品表面”盘点，而不是按 React 文件数量或路由数量凑数。机械清单共 257 组：

| 域               | 稳定可见 | 本轮补齐 / 修正 | 沿用既有覆盖 | 明确排除 |
| ---------------- | -------: | --------------: | -----------: | -------: |
| 普通用户桌面     |      109 |              34 |           75 |        8 |
| 移动端与全局跨端 |       44 |              21 |           23 |        4 |
| 管理后台         |       87 |              50 |           37 |        5 |
| 合计             |  **240** |         **105** |      **135** |   **17** |

最终 Wiki 注册表包含 226 个唯一 fixture ID。240 个稳定可见表面全部能解析到至少一个已注册、已挂载的 fixture；mock 源文件路径会由契约测试在本地 sibling 项目中逐条核对。

## 迁移规则

1. 从 mock 选择一个有解释价值的代表状态，按同一视口、同一状态制作静态 `WikiEmbed*.tsx`。mock 是布局、尺寸、间距、色板、圆角、阴影、图表类型和页面 chrome 的视觉真源；不得用 Wiki 通用卡片重新编排。
2. 当前 `scholar` 只负责校正字段含义、业务文案、权限与状态事实。业务契约与 mock 冲突时，应在不改变源视觉结构的前提下替换内容，不能把“事实校正”扩大成视觉重设计。
3. 合理静态化只包括冻结一组真实样例数据、移除 API/store/hook 和禁止写操作。删除交互后仍须保留其静止时可见的控件、信息密度和布局关系；不得改换图表类型、拼接互斥状态、增加源界面没有的说明栏或设备壳。
4. 每个 ID 必须同时进入 `WikiEmbedId`、`WIKI_EMBED_REGISTRY` 和至少一个词条章节；统一 `WikiEmbedFrame` 在井口外显示图注，并用自然宽度的凹进演示井承载组件。井壁的五层内阴影与 canvas 的两层轻投影属于 Wiki 嵌入层级契约，不得退化成满宽平面边框。
5. 内部原子、纯重定向、未接线死代码、浏览器原生 prompt/toast 和只在运行时组合的协调器不单独制造截图；必须在覆盖账本中写明排除理由。

## 权威证据

- 逐组机器可读账本：`frontend-user/src/features/wiki/embeds/mock-surface-coverage.ts`
- ID 白名单：`frontend-user/src/features/wiki/types.ts`
- 组件注册表：`frontend-user/src/features/wiki/embeds/registry.tsx`
- 内容与迁移门禁：`frontend-user/tests/wiki-content.test.ts`
- 设计系统门禁：`frontend-user/tests/design-system-guard.test.ts`
- 页面级视觉验收：`docs/scholay-wiki/audit/screenshots/final-design-qa/`

## 明确排除的范围

17 个排除组仅包括以下类别：普通用户侧的通用页面壳、加载/错误宿主、共享弹窗原子、运行时导览、未接线组件和已冻结的旧版编辑控件；移动侧的预取/骨架/手势引擎与通用 bottom-sheet 原语；后台侧的 redirect、浏览器原生反馈、未接线命令面板、表格/分页/指标卡原子和通用确认宿主。它们没有可到达的独立现行界面，或稳定业务状态已在对应复合 fixture 中展示，因此不会再复制一份脱离语境的 Wiki 图。

## 验收门禁

- 226 个注册 ID 唯一，且全部至少挂载一次。
- 257 个覆盖 key 唯一；240 个可见表面无遗漏，17 个排除项均有理由。
- sibling mock 存在时，账本中的每个源路径必须解析成功。
- 所有 `WikiEmbed*.tsx` 必须通过静态性扫描、TypeScript、ESLint、Prettier 和设计系统测试。
- 嵌入壳必须保留 `w-fit`、井口间距、五层 inset shadow 与 canvas 浮起层；测试会阻止 `box-shadow: none` / `filter: none` 回归。
- 每个新增或改动 fixture 必须保存 mock 源状态和 Wiki 实现的同视口截图，并检查排印、比例、色板、资产、控件与文案。覆盖率、类型检查和 token 合规不能替代视觉保真验收。
- 生产构建和页面级浏览器巡检必须通过后才能提交。
