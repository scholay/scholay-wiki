# Wiki 内容差距分析：wiki 分支 vs mock2 最新形态（2026-08-17）

> **执行状态（2026-08-17）：已完成。** `scholay-wiki` 已通过 `8c5d25b9`
> 合入产品快照 `8b8e6068`，并完成本文 P0 / P1 / P2、事实修正、术语单源、
> 可生成基线、漂移检测、fixture 复核日期、巨型内容拆分、MCP 与 XMind 同步。
> 收口基线为 151 篇词条、127 个现行页面、32 个兼容跳转、252 个可见表面与
> 238 个 fixture；`test:wiki` 68/68、Wiki 基线和 MCP 快照检查均通过。下文保留为
> 实施前差距与决策记录，其中“当前缺口”类表述均指审计时点。

> 对比对象：
>
> - **Wiki 侧（3002）**：`cursor/wiki-home-heading` @ `21fd8d3b`（与 `scholay-wiki` 同提交）。
>   词条约 130+ 篇、11.7k 行内容、229 个已登记静态演示 fixture。
> - **产品侧（3001）**：相邻的 `mock2` worktree
>   @ `8b8e6068`（已将审计时约 96 项工作区变更收束为产品快照提交）。
>
> 本文回答三个问题：wiki 落后了哪些内容需要**增补**；哪些现有内容需要**修改**；
> 为方便维护可以做哪些**架构微调**。行号引用以本文写作时的工作区为准。

---

## 〇、结论摘要

1. **wiki 不是全面落后，而是"卡在 08-13 的产品 mock 快照上"。** wiki 曾于 08-13
   对齐过一轮 product mock（`44476a62 align embedded surfaces with product mock`），
   所以 PDF Chat、文献图谱、矩阵分析、牛犀犀助手、邀请返利、科研经费等词条**已存在**。
   真正的缺口是 mock2 在 08-14 ~ 08-17 的产品演进（现已收束到 `8b8e6068`）：
   **全站导航改版（六功能 + 侧栏功能树）、我的资源四分（含稿件集）、scholay广场重组、
   搜索入口全面改名、顶栏邀请 Hub、经费不足提醒、彩色犀牛 loader、OAuth 确认层**。
2. **最大的一类修改是"改名"**：`文献搜索→学术搜索`、`期刊搜索(一级)→并入学术搜索二级`、
   `文件夹→我的资源`、`科研能力广场→scholay广场`、`学术情报→scholay 情报`。
   旧名在 wiki 正文中合计出现 **80+ 处**，且新名（`智能搜论文`/`论文库搜索`/`稿件集`/
   `学术prompts` 等）在 wiki 中**全部为 0 次**。
3. **架构上 wiki 已有很好的钩子**（`sourcePaths`、`mock-surface-coverage` 账本、钉死计数的
   守护测试、MCP 导出），缺的是把"基线更新"从手工盘点变成脚本化流程，以及把术语
   （产品名词）单源化。词条正文 1400+ 行的巨型文件也该拆了。

---

## 一、对比口径与时间线

### 1.1 git 拓扑

```
f23d0003 (2026-08-11「优化更新」)          ← 两边共同基线 = wiki 审计基线（coverage.ts）
├── cursor/wiki-home-heading（7 个提交，全部是 wiki feature 本身）
│     75335a0c 08-12  add code-audited Scholay Wiki
│     f75c98f9 08-12  complete mock surface migration
│     44476a62 08-13  align embedded surfaces with product mock   ← 最后一次对齐产品
│     2fad92fa 08-13  refine guidance, navigation, and visuals
│     a5b9ac90 08-13  update homepage heading copy
│     e2ace60a 08-13  reshape navigation, comparisons, and public MCP export
│     21fd8d3b 08-16  swap Scholay wordmark C/H and A/Y colors
└── mock2（25 个提交，工作树已收束到 checkpoint）
      07253475 08-14  Merge main into mock2（带入 main 的后端/SEO/性能改动）
      31af7740 08-14  revive legacy tokens and repair entry wiring
      20627f7a 08-16  land latest product mock and colorful rhino loader   ← wiki 未见
      12b2fe4d 08-16  dock funds reminder and rename search entries        ← wiki 未见
      7c1a1bdd 08-17  add top-nav invite hub with fill/promote/get scenes  ← wiki 未见
      8b8e6068 08-17  checkpoint latest product experience                ← wiki 未见
                含 OAuth 确认层、稿件内容区、犀牛 sit 素材、全局 loading 蒙层、
                vip reset_pass_lots 等
```

### 1.2 两个关键事实

- **wiki 分支的产品面代码 = f23d0003 原样**。`git diff f23d0003..cursor/wiki-home-heading
-- frontend-user/src` 中除 `features/wiki/` 外**零改动**。wiki 的 113 个 embed 演示是
  **静态复刻 fixture**（只有 1 个文件 import 真实产品组件），复刻的对象是 08-13 的 mock
  形态——所以演示图不会因代码合并而"自动过期"，但也**不会自动更新**。
- **mock2 里没有 `features/wiki/`**。wiki 的全部资产只活在 wiki 分支上；mock2 的产品
  演进不会碰 wiki 文件，两边合并没有文件级冲突风险（除 routes/App 装配点）。

---

## 二、mock2 侧发生了什么（供对照的产品事实）

> 详细盘点来自对 mock2 worktree 的代码探查；审计时的工作区改动现已进入 `8b8e6068`。
> 仅列用户可感知项。

### 2.1 信息架构（影响面最大）

| 项           | 基线（= wiki 现口径）                                                              | mock2 最新                                                                                                                                                        |
| ------------ | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 顶栏功能菜单 | 7 项：文献搜索 / 期刊搜索 / 智能助手 / 智能写作 / 智能审稿 / 文件夹 / 科研能力广场 | **6 项**：**学术搜索** / 智能助手 / 智能写作 / 智能审稿 / **我的资源** / **scholay广场**（`src/app/menus.ts`）                                                    |
| 期刊搜索     | 独立一级入口                                                                       | **降为「学术搜索」二级**                                                                                                                                          |
| 左侧栏       | 无一级/二级功能树                                                                  | **AppSidebar 功能树**：一级=六功能，二级如「智能搜论文 / 论文库搜索 / 期刊库搜索 / 数据集搜索 / scholay 情报 / scholay 选刊(comingSoon)」；下半区按功能切历史记录 |
| 搜索命名     | 智能搜索 / 传统（文献）搜索                                                        | **智能搜论文** / **论文库搜索**，URL `?mode=smart\|classic`                                                                                                       |
| 资源         | 文件夹（个人文献集为主）                                                           | **我的资源四分**：文献集 / 期刊集 / **稿件集** / 资源集（`/library?section=papers                                                                                 | journals | manuscripts | folders`） |
| 广场         | 功能广场 / 科研能力广场                                                            | **scholay广场**：`/tools`（Hub）+ `/tools/catalog` 学术工具 + `/tools/datasets` **数据集搜索** + `/tools/news` scholay 情报 + `/tools/prompts` **学术prompts**    |
| 情报         | 学术情报                                                                           | **scholay 情报**（页名改，主入口挂到广场）                                                                                                                        |

### 2.2 新交互面

- **顶栏邀请 Hub 三态**：`填写邀请码` / `推广有好礼` / `获取邀请码`，未填码 5s 轮播
  （`ClaimInviteNavButton` + `ClaimInviteDialog` + `claim-invite.store`）。
- **经费不足 Dock/Dialog**：文案「额度已用完 / 经费不足」，动作含立即恢复、升级会员、
  用经费继续、充值经费（`shared/components/funds-reminder/` + `funds-reminder.store`）。
- **顶栏「限时领取会员」常驻按钮**（`PromoNavButton`）。
- **首页产品带**：`HomeFeatureEntrances`（主推智能助手：「立即培养一只学术Agent…」）、
  `HomeFeatureZones` 六区叙事、可编辑「常用功能」轨、`HomeNoviceTour` 新手引导。
- **全站日夜切换**（`ThemeToggle` + `theme.store`）——注意与主仓「暗色态已移除」的
  历史口径相反，wiki 现有 `useWikiTheme` 是 wiki 页内的局部主题，两者要分开表述。
- **牛犀犀新形态**：彩色跑步 loader（`RhinoRunLoader`）、全站唯一 loading 蒙层
  （`GlobalLoadingOverlay` + `page-loading.store`）、新栖息姿势（sit/portal 素材）、
  Claw 新手引导（`ClawNoviceTour`）。
- **OAuth 确认层**：选第三方后先显示「前往授权」确认面板，可同时填邀请码；
  微信扫码从确认层进入。
- **检索工作区三件套**：右栏互斥 tab「PDF Chat / 文献图谱 / 矩阵分析」
  （`search-right-panel.store`）；**文献集中栏复用同一套工作区工具**。
- **智能搜周边**：参考文献侧栏（`SmartSearchBibliography`）、多会话 dock、
  回合交接卡「检索到这里，深挖去智能助手」（`SmartSearchClawHandoff`）。
- **稿件集**：阶段徽章「写作中 / 审稿中 / 已决议」，来源标注「来自智能写作 · 可写可审
  可循环」「审稿上传稿 · 只有审稿记录」，详情弹窗 + 稿件内容区。
- **Claw 空态模板扑克牌**：`制作PPT / 科研绘图 / scholay 选刊 / 矩阵分析 / PDF-Chat`
  **五张**（`TemplateCards.tsx`）。
- **智能写作分模式**：`/prism?mode=quick` =「快速写作」、`mode=advanced` =「高级写作」。
- **智能审稿新入口**：`/peer-review/conference`（会议论文，占位回 Hub）、
  `/peer-review/other`（其他，复用期刊 wizard）。
- **期刊枢纽**：真实发现页位于 `/journals/browse`，并继续提供 category / country /
  warning / oa 子页；`/journals` 仍兼容跳转 `/search`，`/journals/select`、
  `/journals/evaluate` 也占位跳 `/search`；**期刊评论面板**（`JournalCommentsPanel`，纯 mock）。

### 2.3 后端能力（f23d0003..mock2，多为 main 合入）

没有全新 `backend/internal` 模块（news/statlab/scidraw/boltslides/featuretool/openaccess/
invite/llmusage 等在基线均已存在）。可写进 wiki 的增量：

- **情报封面缩略图**：`news/thumbnail.go` + 公开路由 `/api/v1/public/news/cover/:file` +
  迁移 `0127_news_cover_thumb_fields.sql`。
- **Apple 登录安全路径**：JWT 不再进 302 URL，改 Redis 90s 一次性 `login_code` +
  `POST /user/apple/exchange`。
- **agent 单轮成本硬顶**：`agentbridge` TurnCostCap，逐帧累加 token 成本超顶停轮。
- **VIP 额度**：超限/重置文案收口；`quota.go` 给 overview 增加 `reset_pass_lots`
  （恢复券分批余量 + 到期明细）——代码已进入 checkpoint，但仍是 **WIP**，写入 Wiki
  前须确认真实交付状态。
- **prism 编译完成站内通知**、**审稿状态实时广播**（`StreamBroker`）。
- **minicod 期刊本地投影兜底**（上游缺数据仍可出页）。
- 偏运维：`APP_ENV` / `SEO_INDEXABLE` 多环境闸门、SSR 链接前沿闭合与 on-miss 准入。

### 2.4 交付形态标注

mock2 默认整站 **MSW 纯前端 mock**（`MOCKING.md`），其中**明确纯 mock**（后端未交付）的：
文献图谱、期刊评论、数据集静态表、学术prompts 静态表、稿件循环（默认）、牛犀犀栖息动画、
FeatureHub 占位卡。wiki 写这些能力时需用状态标注区分「产品演示阶段」与「已交付」。

---

## 三、需要增补的内容

按优先级排列。「落点」指建议编辑/新建的词条 slug。

### P0 —— 信息架构级（不改会让全站词条口径连锁失真）

| #   | 增补什么                                                                                                                                                           | 落点与动作                                                                                                                                  |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **全站导航与功能树**：顶栏六功能、AppSidebar 一级/二级树、二级入口全名录（智能搜论文/论文库搜索/期刊库搜索/数据集搜索/scholay 情报/scholay 选刊…）、下半区历史记录 | 新词条 `site-navigation`（kind: page），或大改 `product-map`；`WIKI_NAV_CATEGORIES` 目录树同步调整                                          |
| 2   | **我的资源四分**：四个 section 的定位与互转（文献集/期刊集/稿件集/资源集）、`?section=` 路由语义                                                                   | 新词条 `my-resources`（overview）；`literature-library` 降级为其中「文献集」一节的深入词条                                                  |
| 3   | **稿件集**：写作↔审稿循环、阶段徽章（写作中/审稿中/已决议）、两类来源（智能写作稿/审稿上传稿）、详情与内容区                                                       | 新词条 `manuscript-collection`；与既有 `manuscript-vs-publication` 互链                                                                     |
| 4   | **scholay广场重组**：Hub + 四子页；其中「数据集搜索」「学术prompts」是全新面（wiki 当前 0 覆盖）                                                                   | 改 `feature-tools` 为广场总述；新增 `datasets-search`、`academic-prompts` 词条（或并入广场词条的两节）                                      |
| 5   | **搜索命名体系**：智能搜论文/论文库搜索、`mode=smart\|classic`、右栏三件套的互斥关系与「浏览器」名片                                                               | 改 `academic-search`、`search-entry-comparison`、`classic-vs-smart-search`、`literature-search-guide`、`smart-literature-search-guide` 一组 |

### P1 —— 新交互面（独立可写，篇幅小）

| #   | 增补什么                                                                              | 落点与动作                                                                                |
| --- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| 6   | 顶栏邀请 Hub 三态与轮播规则                                                           | `invitation-rebate-guide` 补一节 +（若有）导航词条互链                                    |
| 7   | 经费不足 Dock/Dialog 的触发条件与四个出口动作                                         | `ai-usage-quota` / `wallet-payg` 各补一节；与 `quota-recovery` 演示互链                   |
| 8   | 顶栏「限时领取会员」常驻按钮                                                          | 改 `promotion-banner` 或 `guides-account.ts` 相应小节（现文只写了弹窗形态）               |
| 9   | 首页产品带（主推卡/六区/常用功能轨/新手引导）                                         | `scholay`（首页词条）或 `getting-started` 补节；`foundations.ts:27` 首页描述同步改        |
| 10  | 全站日夜切换                                                                          | 新小节（建议放导航/界面词条）；**明确区分**站级 `theme.store` 与 wiki 页内 `useWikiTheme` |
| 11  | 牛犀犀：跑步 loader、全站唯一 loading 蒙层、新栖息姿势、Claw 新手引导                 | `user-experience.ts` 牛犀犀助手一节扩写                                                   |
| 12  | OAuth 确认层（前往授权 + 邀请码合填）                                                 | `login-methods-guide` 补节（按演示阶段标注，真实交付后再转 `current`）                    |
| 13  | 检索↔文献集共用工作区（文献集也能开矩阵/图谱/PDF Chat）                               | `matrix-analysis`、`pdf-chat-guide`、`literature-library` 三处互补一句 + 演示             |
| 14  | 智能搜交接卡、参考文献侧栏、多会话 dock                                               | `smart-literature-search-guide` 补节                                                      |
| 15  | `/journals/browse` 期刊发现枢纽、`/journals`/选刊/评价兼容跳转、期刊评论（标注 mock） | `authors-and-journals`、`journal-selection-guide` 补节                                    |
| 16  | prism 快速/高级写作双模式                                                             | `prism-interface-guide`、`prism-writing-workflow` 补节                                    |
| 17  | 审稿「会议论文（占位）」「其他」两类入口                                              | `peer-review-workflow-guide` 补节                                                         |

### P2 —— 后端/机制类

| #   | 增补什么                                 | 落点                                                                             |
| --- | ---------------------------------------- | -------------------------------------------------------------------------------- |
| 18  | 情报封面缩略图管线                       | `content-seo-pipeline` 或 `research-news`                                        |
| 19  | Apple 登录 login_code 交换               | `login-methods-guide`（用户可感知的是"更安全"，细节进 `backend-api-boundaries`） |
| 20  | agent 单轮成本硬顶                       | `agent-backend-services` + `ai-usage-quota`（用户视角：单轮也可能被截停）        |
| 21  | 恢复券分批明细 `reset_pass_lots`         | `ai-usage-quota`（**落地后再写**）                                               |
| 22  | prism 编译通知、审稿实时广播             | `communications-backend` / 对应功能词条各一句                                    |
| 23  | 多环境 SEO 闸门（APP_ENV/SEO_INDEXABLE） | `platform-topology` 或 `content-seo-pipeline`（admin-only 区）                   |

---

## 四、需要修改的内容（现有词条与最新形态冲突）

### 4.1 改名类（机械性大、优先做）

旧名在 wiki 内容中的分布（`rg` 计数，剥注释前的上界）：

| 旧名                               | 新名                                         | 出现处数                                                            | 主要文件                                                                 |
| ---------------------------------- | -------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| 文献搜索                           | 学术搜索（一级）；论文库搜索（经典模式二级） | ~22                                                                 | guides-discovery(10)、navigation(4)、guides-account(4)                   |
| 期刊搜索（一级入口语境）           | 学术搜索 › 期刊库搜索                        | ~21                                                                 | guides-discovery(6)、user-experience(3)、discovery(3)、guides-account(3) |
| 文件夹（顶栏入口语境）             | 我的资源                                     | ~33（**需逐处判断**，页内"文件夹"概念仍存在，只有导航入口语境要改） | user-experience(10)、discovery(9)、guides-account(8)                     |
| 个人文献集（作为顶栏入口/总称语境) | 我的资源 › 文献集                            | ~27（同上，词条本体保留）                                           | guides-discovery(10)、guides-workflows(6)                                |
| 科研能力广场                       | scholay广场                                  | 5                                                                   | guides-account                                                           |
| 学术情报                           | scholay 情报                                 | ~9                                                                  | guides-account(3)、user-experience(3)、navigation(2)                     |

新名现状：`智能搜论文`、`论文库搜索`、`scholay广场`、`学术prompts`、`稿件集`、`期刊集`、
`资源集`、`scholay 情报`、`快速写作`、`高级写作`、`会议论文` 在 wiki 中**均为 0 次**。
`wiki-term-links.ts` 的规范术语表（`传统文献搜索` 等词条）与 aliases 也要同步换名。

### 4.2 事实冲突类（逐条）

| #   | 位置                                                             | 现在说什么                                                                     | mock2 实际                                                                           | 改法                                    |
| --- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ | --------------------------------------- |
| 1   | `guides-account.ts:596`（resources-interface-guide）             | 「**文件夹**是…；**科研能力广场**是…；顶栏"资源"分类只放文件夹和科研能力广场」 | 我的资源四分 + scholay广场独立一级                                                   | 整节重写，词条更名                      |
| 2   | `guides-account.ts:520`（academic-intelligence-interface-guide） | 标题「学术情报界面导览」                                                       | 页名 scholay 情报，主入口在广场                                                      | 标题/摘要/入口路径改                    |
| 3   | `foundations.ts` 概览表（:45 起）                                | 入口叫「论文检索」「期刊搜索」「功能广场」                                     | 见 §2.1                                                                              | 表格行改名 + 补稿件集/数据集/prompts 行 |
| 4   | `foundations.ts:27`                                              | 首页 = 搜索框 + 智能/文献切换                                                  | 首页新增产品带、六区、常用功能轨                                                     | 改写并配新演示                          |
| 5   | `research-ai.ts:311/452/454` + fixture `WikiEmbedClawEmptyState` | Claw 模板按「数据分析/科研绘图/演示文稿」口径描述                              | 模板卡为**五张**：制作PPT/科研绘图/scholay 选刊/矩阵分析/PDF-Chat                    | 正文 + fixture + 测试三处同改（见 §5）  |
| 6   | `user-experience.ts:902`                                         | 「旧设计中的评分、**评论**…仍待研究论坛能力」                                  | mock2 已有期刊评论面板（mock）                                                       | 改为"演示阶段"状态表述                  |
| 7   | `guides-discovery.ts:662`                                        | 「（检索与助手）两边不会自动共享…交接时以…为准」                               | 新增交接卡「深挖去智能助手」                                                         | 保留数据不共享的口径，补交接卡入口说明  |
| 8   | `guides-account.ts:202`                                          | 「页面出现"限时领取会员"时，弹窗…」                                            | 顶栏常驻 PromoNavButton                                                              | 补常驻入口                              |
| 9   | `guides-account.ts:307`                                          | 邀请码补录「可能看到一次可以跳过的提醒」                                       | InviteCodePromptDialog + 顶栏三态 Hub + OAuth 确认层合填                             | 扩写为完整邀请入口地图                  |
| 10  | `policies-and-history.ts:229`（汉堡菜单）                        | 「宽屏上平铺的首页、浏览器、功能入口…」                                        | 桌面改为 AppSidebar 功能树后，宽屏收纳逻辑变化                                       | 核对新断点行为后改写                    |
| 11  | `journal-selection-guide`                                        | 选刊现有口径                                                                   | 侧栏「scholay 选刊」comingSoon + `/journals/select` 占位跳 `/search` + Claw 选刊模板 | 状态与入口更新                          |
| 12  | `legacy-redirects` 相关描述（若有）                              | `/journals` → `/journals/search`                                               | 当前 `/journals` → `/search`；真实发现枢纽是 `/journals/browse`                      | 更新                                    |

### 4.3 基线数字类

`coverage.ts` 的 `WIKI_AUDIT_BASELINE`（commit f23d0003 / 120 路由 / 128 迁移 / 57 模块 /
243 mock 表面 / 229 fixture …）整套要在同步后重盘。已知会变的：迁移 +1（0127）；
新增路由约 9 条（/tools 的 catalog/datasets/news/prompts、/journals 的 select/evaluate、
/peer-review 的 conference/other 等），另有 /tools index 改指向；期刊发现枢纽实际在
`/journals/browse`，`/journals` 本身仍是兼容跳转，净数
以重盘脚本为准；mock 表面数（新表面：侧栏树、邀请 Hub、经费 Dock、稿件集、
OAuth 确认层、主题切换…）。

---

## 五、同步后会红的守护测试（这是设计使然，当施工清单用）

`npm run test:wiki` 中钉死现状的断言，合入 mock2 / 更新内容后会依次暴露：

| 测试（tests/wiki-content.test.ts）                   | 会红原因                                                                                                                              |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `:623 Claw 新对话只展示当前已经开放的三类模板`       | 模板变五张                                                                                                                            |
| `:1075 迁移与功能广场数据计数和当前基线一致`         | 迁移 128→129                                                                                                                          |
| `:1091 每个非 Wiki 路由的懒加载页面都有词条直接引用` | `/tools/datasets` 等新路由无词条引用；另注意 mock2 把 RR `lazy:` 换成了自定义 `lazyRoute()`，**该测试的路由扫描方式需先核对是否兼容** |
| `:928 读者目录与 XMind 的 15 个主栏目一致`           | 若导航词条重组，`scholay-wiki.xmind` 也要同步改                                                                                       |
| `:1023 覆盖全部 57 个后端一级业务模块`               | 模块数未变，预计不红；重盘时顺手确认                                                                                                  |
| `wiki-theme.test.tsx`                                | 站级 theme.store 合入后与 wiki 局部主题可能相互作用                                                                                   |

---

## 六、架构微调建议（为方便维护）

现有机制已经很完整（`sourcePaths` 逐词条声明事实来源、`mock-surface-coverage.ts` 逐表面
账本、40+ 条内容契约测试、MCP 导出 `--check`）。问题不在缺机制，而在**基线更新是纯手工**：
这次 5 天的产品演进就产生了 80+ 处改名 + 20+ 处事实漂移，靠人肉 rg 不可持续。建议按
成本从低到高做以下微调：

### 6.1 术语单源化（成本最低，收益最直接）

新建 `content/terms.ts`：每个产品名词一条 `{ canonical, deprecated: string[], articleSlug }`。
`wiki-term-links.ts` 从它派生；再加一条 guard 测试：**词条正文禁止出现 deprecated 名单中
的旧名**（白名单机制允许历史词条引用）。这样下次「文献搜索→学术搜索」级别的改名 =
改一行表 + 按测试红名单机械替换，而不是全库 rg 逐处人判。

### 6.2 基线快照脚本化

`WIKI_AUDIT_BASELINE` 的 9 个数字目前是手抄的。建议加 `scripts/generate-wiki-baseline.ts`
（对齐既有 `generate:wiki-mcp` 的模式）：扫描路由文件、`docker/mysql/migrations/`、
`backend/internal/` 一级目录、`agent/` skills 后**生成**基线对象，测试对照生成物；
升基线 = 跑一次脚本 + review diff。数字永远可复现，"迁移 128 还是 129"不再靠记忆。

### 6.3 漂移检测器（利用现成的 sourcePaths）

新脚本 `npm run wiki:drift -- <old-baseline>..<new-target>`：

```
git diff --name-only <range>
  ∩ （所有词条 sourcePaths ∪ mock-surface-coverage 的 mockSourcePaths）
  → 按词条/fixture 分组输出「需要复核」清单
```

数据结构零改动（两处路径声明都已存在），产出即本文 §三/§四 的机械版。每次产品分支
合入前跑一次，wiki 维护从"全库重审"变成"看命中清单"。

### 6.4 fixture 复核分级

229 个静态 fixture 不可能每轮全量重画。给 `mock-surface-coverage.ts` 的条目加
`verifiedAt: "2026-08-13"` 一个字段即可：漂移检测器命中 `mockSourcePaths` 的条目自动
判为「过期待复核」，其余保持绿。复核优先级跟 §三 的 P0/P1 走（导航、搜索、资源
三族先做）。

### 6.5 巨型内容文件拆分

`user-experience.ts` 1505 行 / `administration.ts` 1465 行 / `navigation.ts` 1319 行。
建议**每词条一文件**：`content/user-experience/<slug>.ts` + 目录内 index 聚合导出，
现有 `content/index.ts` 的聚合接口不变。收益：多人/多 agent 并行编辑不再互相冲突、
review diff 按词条隔离、单文件 ≤300 行的仓库约定也能守住。纯搬运，无逻辑改动。

### 6.6 交付状态标注约定

mock2 常态是"产品形态先行、后端后到"（§2.4 列了 7 个纯 mock 面）。`WikiArticleStatus`
已有 `experimental/planned`，建议明确约定并写进 `docs/scholay-wiki/content-model.md`：

- 纯 mock 面 → `status: "experimental"` + 正文首段固定句式「该能力处于产品演示阶段」；
- 后端已交付 → `current`；
- 判定依据写进 sourcePaths（指向 mock 文件即 experimental 的信号）。

避免 wiki 把演示写成已交付（期刊评论这次就踩在这条线上，见 §4.2#6）。

### 6.7 同步策略（关于分支）

wiki 分支产品代码停在 f23d0003，已落后两代。建议本轮：**把 mock2 合入 wiki 分支**
（或以 mock2 为基重建 wiki 分支）再动笔改内容，理由：

1. fixture 复刻需要对着**跑起来的最新界面**做，本地起的就是合并后的树；
2. `:1091` 路由测试、`sourcePaths` 存在性校验（`:241`）只有在同一棵树上才能对最新
   代码生效，不合并就是对着旧代码验证"没漂移"，全绿也是假绿；
3. 两边文件集几乎不相交（wiki 全部在 `features/wiki/`，mock2 不含 wiki），
   预计冲突点只有 `router.tsx`/装配文件与 `package.json`。

合并后第一件事跑 `npm run test:wiki`，用红名单（§五）驱动内容修订顺序。

---

## 七、建议执行顺序

1. **合流**：mock2 → wiki 分支（§6.7），跑 `test:wiki` 拿到真实红名单。
2. **机械改名**：先落 §6.1 terms.ts + 旧名 guard，再按红名单机械替换 §4.1 的 80+ 处。
3. **P0 增补**：§三 #1–#5（导航词条、我的资源、稿件集、广场、搜索命名）。
4. **事实修正**：§4.2 逐条（多数是既有词条内一两段的改写）。
5. **P1/P2 增补**：按表推进；纯 mock 面一律 experimental 标注（§6.6）。
6. **基线重盘**：落 §6.2 脚本 → 重新生成 `WIKI_AUDIT_BASELINE` / `WIKI_MOCK_SURFACE_BASELINE`；
   fixture 按 §6.4 分级复核；`npm run generate:wiki-mcp` 重新导出。
7. **收尾**：`scholay-wiki.xmind` 目录同步（§五 :928）、`docs/scholay-wiki/README.md`
   与 `content-model.md` 补记新约定。

---

## 附：本文事实来源

- wiki 侧：本工作区 `frontend-user/src/features/wiki/`（内容、类型、coverage、测试）逐文件核对。
- mock2 侧：对相邻 `mock2` worktree 的两轮代码探查
  （前端产品面 + 后端模块；审计时改动现已进入 `8b8e6068`），关键结论（菜单六项、模板五张、四分资源、
  邀请三态、经费 Dock 文案等）已回源到具体文件（`src/app/menus.ts`、
  `features/claw/components/chat/TemplateCards.tsx`、`features/library/resource-model.ts`、
  `app/layouts/topnav/ClaimInviteNavButton.tsx`、`shared/components/funds-reminder/` 等）。
- 原工作区条目（OAuth 确认层、稿件内容区、`reset_pass_lots`、全局 loading 蒙层、
  犀牛 sit 素材）已进入 mock2 的 `8b8e6068`；写入 Wiki 时仍须按真实交付能力区分
  `experimental` 与 `current`，不能只用“已经提交”替代产品状态判断。
