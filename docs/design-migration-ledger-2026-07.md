# Scholay 设计系统换真源 · 改造台账 — 2026-07

**真源迁移**: `scholay.pen` ⟶ Figma `JIv8fxQthMS37JLGHNOEbB` / `Scholay设计系统` (node `1:38`)
**规范文档**: [docs/figma-design-spec-2026-07.md](./figma-design-spec-2026-07.md)
**扫描范围**: `frontend-user/src/**/*.{tsx,ts}` + `src/styles/globals.css`
**盘点方式**: 8 个维度并行全量 grep + 抽样 read 定性，逐条 file:line 归类
**生成日期**: 2026-07-26

> ⚠️ **本文件取代 `frontend-user/CLAUDE.md` §5 的 token 表与 `globals.css` 头部注释中所有 `.pen` 口径。**
> 改造落地时这两处必须一并重写，否则「禁令条款仍有效但参考值全错」会持续误导后续开发。

---

## 目录

1. [执行摘要](#一执行摘要)
2. [目标 token 全清单](#二目标-token-全清单)
3. [替换台账](#三替换台账)
4. [高风险项专章](#四高风险项专章)
5. [分批排期](#五分批排期)
6. [遗留决策](#六遗留决策)

---

## 一、执行摘要

### 1.1 总量

| 维度 | 扫描命中 | 覆盖 | 说明 |
|---|---:|---:|---|
| 颜色（hex / rgba / hsl） | 1,467 | 100% | 其中 1,219 为科研绘图 SVG 资产（KEEP） |
| 字号（token 类 + arbitrary + JS） | 2,916 | 100% | 10 档 → 6 档 |
| 圆角 | 1,478 | 100% | 4 档 → 6 档，主圆角 6→16 |
| 字间距 / 行高 / 字重 / 字族 | 2,084 | 100% | tracking 174、leading 370、字重 1,327、字族 210 |
| 尺寸与间距（arbitrary） | 313 | 100% | 另有 ~750 处默认 scale 半档超规 |
| 阴影 / 描边 / focus ring | 325 | 100% | shadow 76 + ring/outline 237 + 硬编码 border 色 12 |
| Figma 未覆盖资产（GAP） | 479 | 100% | 暗色态 / 状态色 / z-index / 动效 / 移动端 / 图表 |
| 原子层一致性 + 系统逃逸 | 4,101 | 100% | 控件高度 561 + 原子层结构 2,126 + 逃逸 1,414 |
| **合计（含跨维度重复计数）** | **13,163** | **100%** | 同一元素可被多维度计入（如 `h-8 rounded-md text-sm`） |

**去重后的真实工作量估算**

| 口径 | 数量 |
|---|---:|
| 需要改渲染行为的独立位置 | **≈ 5,800** class-token 编辑点 |
| 落在多少行代码上 | **≈ 2,900 行** |
| 涉及文件 | **≈ 460 / 524**（`src/` 下 .tsx+.ts 总数 524） |
| 纯 KEEP 无需动 | **≈ 2,050**（1,219 SVG 资产 + 284 rounded-pill + 363 合规字重 + 其余合法例外） |

### 1.2 按 action 分类

| action | 数量 | 占比 | 含义 |
|---|---:|---:|---|
| **MAP** | ≈ 7,150 | 54% | 能直接映射到新规范某个值 |
| **KEEP** | ≈ 2,050 | 16% | 合法例外（SVG 资产 / 第三方主题 / 品牌 logo / 动态计算） |
| **DELETE** | ≈ 480 | 4% | 新规范里不存在该维度（多数 tracking、多数 shadow、过时注释） |
| **GAP** | ≈ 1,000 | 8% | Figma 未覆盖，需基于新色阶自行推导 |
| **NEW_TOKEN** | ≈ 400 | 3% | 需新增 token 承接 |
| 跨维度重复计数 | ≈ 2,080 | 15% | — |

### 1.3 一句话结论

> 这不是「换几个 hex」，而是**四个真源同时切换 + 一次原子层补齐**。
> 视觉冲击最大的三件事按序是：**① 容器圆角 6→16**（541 处）、**② 正文 13→14px 全站上浮**（含 `body` 隐式继承）、**③ 字重 700/600 → 500**（1,030 处）。
> 而**最容易翻车**的不是这三件，是**顺序**：`--radius-lg` 在拆掉 27 处非容器用法之前不能改值，否则通知铃铛会变成圆形。

---

## 二、目标 token 全清单

> 本节是最重要的产出。改造后 `globals.css` 应完全照此重写。
> **依据列**标注 Figma 章节；标 `GAP↯` 的为 Figma 未覆盖、本次自行推导，推导理由在括号内。

### 2.0 前置：清空 Tailwind 默认命名空间

```css
@theme {
  --text-*:   initial;   /* 关掉 text-lg=18 / text-3xl=30 等默认档 */
  --radius-*: initial;   /* 关掉 rounded / rounded-full / rounded-2xl 等逃逸口 */
}
```

**为什么必须做**：现状 `@theme inline` 只「补档」不「封闭」——
- `text-3xl/4xl/5xl` 共 **21 处**一直在静默吃 Tailwind 默认值（30/36/48px），从来不在项目 token 里；
- 裸 `rounded`（45 处，硬编码 0.25rem 不走变量）、`rounded-full`（55 处）、`rounded-2xl/xl`（30 处）共 **130 处（8.8%）**绕过了「圆角只有 4 档」的约束照常生效。

清空后，这 151 处会立刻**编译不出类**（视觉刺眼但无功能损伤），是比 grep 更可靠的定位手段。

---

### 2.1 颜色 — 色阶原语（primitives）

四条 12 档色阶，**只作为 primitive 存在，业务代码禁止直接引用**，只被下面的语义 token 消费。

```css
:root {
  /* Primary 朱砂 */
  --red-1:#1A0707;  --red-2:#330F0F;  --red-3:#4D1616;  --red-4:#661E1E;
  --red-5:#882828;★ --red-6:#802525;  --red-7:#992C2C;  --red-8:#B23434;
  --red-9:#CC3B3B;  --red-10:#E54343; --red-11:#FF4A4A; --red-12:#FF8080;

  /* Secondary 松青 */
  --green-1:#101A0E; --green-2:#1F331B; --green-3:#2F4D29;★ --green-4:#3F6636;
  --green-5:#4E8044; --green-6:#5E9952; --green-7:#66A658;  --green-8:#6DB25F;
  --green-9:#75BF66; --green-10:#7DCC6D;--green-11:#95F281; --green-12:#85D974;

  /* Tertiary 琥珀 */
  --amber-1:#664B00; --amber-2:#805E00; --amber-3:#997000; --amber-4:#B28300;
  --amber-5:#CC9600; --amber-6:#E5A800;★--amber-7:#E5B122; --amber-8:#E5BA45;
  --amber-9:#E5C367; --amber-10:#E5CD89;--amber-11:#E5DFCE;--amber-12:#E5D6AC;

  /* Neutral 玄墨 */
  --ink-1:#09090A;  --ink-2:#1F1F23;★ --ink-3:#2B2B30;  --ink-4:#383840;
  --ink-5:#505059;  --ink-6:#686873;  --ink-7:#757580;  --ink-8:#9A9AA6;
  --ink-9:#B4B4BF;  --ink-10:#CECED9; --ink-11:#E6E6F2; --ink-12:#FFFFFF;
}
```
依据：Figma §1.2 完整色阶（★ = 该色系基准色）

---

### 2.2 颜色 — 语义 token（亮色态）

#### Surface / 背景

| CSS 变量 | 值 | Tailwind 类 | 用途 | 依据 |
|---|---|---|---|---|
| `--background` | `#F6F4EE` | `bg-background` | ★ 页面 / 外层容器米白底 | §1.3（设计稿 10 处），取代纯白 |
| `--surface-card` | `#FFFFFF` | `bg-surface-card` | **内层**卡片 / 输入框 / 搜索框纯白 | §4.4 容器 bg / §4.5 搜索框 bg |
| `--surface-1` | `#EFEDE5` | `bg-surface-1` | 工具栏 / 弱卡片（米白压深 1 档） | GAP↯（米白体系下推导，替代旧 `#FAFAFA`） |
| `--surface-2` | `#E8E5DC` | `bg-surface-2` | hover / 选中 / 页面 chrome | GAP↯（同上，替代旧 `#F5F5F5`） |
| `--surface-3` | `#F1EFE8` | `bg-surface-3` | Prism 编译状态条（窄场景） | GAP↯ |
| `--amber-soft-bg` | `#E5DFCE` | `bg-amber-soft` | 琥珀软底高亮块（提示卡 / 标签胶囊） | 琥珀 amber-11。**收口 `#F1EADA`(6处) + `--prism-badge-bg #F0E8D8`** |
| `--noise-overlay` | `url(data:image/svg+xml;…feTurbulence…)` · 叠色 `rgba(71,59,30,.50)` | `bg-noise`（`:root[data-paper="on"]` 开关） | 纸张质感层 | §1.3 ⚠️ **待验证项**，设计师原话「确认一下 noise 可否落地」 |

> 🔴 **`--background` 必须一拆为二**。现状 `--background:#FFFFFF` 同时承担「页面底」和「卡片底」两个角色（全站 **518 处 `bg-background`**）。Figma §4.4 明确区分外层 `#F6F4EE` / 内层 `#FFFFFF`。一刀切改米白会让所有卡片失去层次——这是颜色改造工作量最大、也最容易做错的一步。
> 🔴 **`#F1EADA` ≠ `#F6F4EE`**。前者是「琥珀软底高亮块」，后者是页面基底。合并会让 SharedReceivePage / MobileToolsHomePage 的 4 处提示卡与页面底色融成一片、彻底看不见。

#### 文字

| CSS 变量 | 值 | Tailwind 类 | 用途 | 依据 |
|---|---|---|---|---|
| `--foreground` | `#1F1F23` | `text-foreground` | ★ 主标题 / 正文加重 / icon 主色 | §1.1 注：设计稿 54 处实际用值（非标称 `#141414`） |
| `--subtle-foreground` | `#505059` | `text-subtle` | 二级文本 / 文件树常态 | ink-5（替代旧 `#444`） |
| `--muted-foreground` | `#686873` | `text-muted-foreground` | 帮助说明 / 描述 / 次要副文 | ink-6（替代旧 `#666`） |
| `--faint-foreground` | `#9A9AA6` | `text-faint` | uppercase 段标 / 计数 | ink-8（替代旧 `#999`） |
| `--placeholder-foreground` | `hsl(var(--foreground) / 0.25)` | `placeholder:text-placeholder` | 输入框 placeholder | §4.5 —— **Figma 用「主文字 25% 透明」建模，非独立灰色**，与旧 `--faint #999` 是不同建模，须拆出 |

#### 边框

用 **alpha 而非实色**是本层的核心决策：新体系同时存在 `#F6F4EE` 页面底与 `#FFFFFF` 卡片底，alpha 描边一个 token 自动适配两种底（米白上 ≈`#DDDBD7`、纯白上 ≈`#E2E2E3`）。

| CSS 变量 | 值 | Tailwind 类 | 用途 | 依据 |
|---|---|---|---|---|
| `--border-hairline` | `rgb(31 31 35 / 0.08)` | `border-border-hairline` | 极弱内分隔（breadcrumb 底 / sidebar header 底 / 卡内分组线） | ink-2 alpha 派生（替代旧 `--border-soft #EEEEEE`，250 处） |
| `--border` | `rgb(31 31 35 / 0.12)` | `border-border` | ★ 标准容器边框（**571 处**，全站最高频） | ink-2 alpha 派生（替代旧 `#E8E8E8`，顺带吸收海报漂移值 `#E9E9E9`） |
| `--border-strong` | `rgb(31 31 35 / 0.22)` | `border-border-strong` | 强调描边（搜索条 / 重点输入 / outlined 按钮） | **合并旧 `--border-strong #D8D8D8`(60) + `--border-button #C8C8C8`(25)**，二者明度差恰好 6%，符合 globals.css 自定的「<6% 合并」原则 |
| `--divider` | `rgb(31 31 35 / 0.14)` | `bg-divider` | Nav/Toolbar 内组间竖线（`h-5 w-px`） | 旧 `--border-separator` 改名——它作为 `border-` 类 **0 使用**，实际 6 处全是 `bg-`/`text-`，挂在 border 族里是误导 |
| `--border-control` | `#1F1F23` | `border-border-control` | **【新语义族】** 可点击控件深色实边 1px（搜索框） | §4.5 `border #1F1F23 / 1px` |
| `--border-control-emphasis` | `#0D0C0B` | `border-border-control-emphasis` | **【新语义族】** Tertiary（幽灵）按钮描边 1px | §4.1 Tertiary 变体 |

> 🔴 **Figma 的「深色细线」不是现有「浅灰分隔」的新值，而是两个不同的 token 族**。Figma 卡片规格（§4.4）**根本没有描边**——分层靠白卡落米白底的明度差。那两处深色 1px 全部出现在**可点击控件**上。
> 如果把 571 处 `border-border` 直接换成 `#1F1F23`，**全站会变成线框图**。这是边框改造最大的单点风险。

#### 品牌色

| CSS 变量 | 值 | 旧值 | Tailwind 类 | 用途 | 依据 |
|---|---|---|---|---|---|
| `--brand-red` | `#882828` | `#CC2222` | `text/bg/border-brand-red` | 朱砂 · CTA / danger / Logo S·a | §1.1 Primary（red-5） |
| `--brand-green` | `#2F4D29` | `#2A7A2A` | `text/bg-brand-green` | 松青 · AI 操作 / Logo ch·y | §1.1 Secondary（green-3） |
| `--brand-amber` | `#E5A800` | `#D4A017` | `text/bg-brand-amber` | 琥珀 · 构建中 / Logo o | §1.1 Tertiary（amber-6） |
| `--brand-blue` | — **退休** | `#1A56DB` | — | 期刊检索 CTA | 四色阶无蓝系。**待决策**（见 §6-Q4） |

> ⚠️ 品牌色已发生**事实漂移**：`SharePoster` / `CollectionSharePoster` 写的是 `#CD2323` / `#DD9D13`，而 token 真源是 `#CC2222` / `#D4A017` —— 两套「品牌红/黄」并存。改造时必须一并修正并收口到 `shared/lib/brand-colors.ts`。

#### 状态色（GAP↯ — Figma §1.4 明确未定义）

设计说明要求「与界面中出现的成功/失败/进行中等状态**区分开**」。
**推导原则**：不另开色相（另开色相会撕裂四色阶体系），改为「**同色阶取不同档位 + 强制软底 chip 形态**」，靠明度差 + 面积/形态差双重区分。「进行中」彻底剥离色相。

| CSS 变量 | 值 | soft 底 | Tailwind 类 | 推导依据 |
|---|---|---|---|---|
| `--status-success` | `#3F6636` | `#E9F0E6` | `text/bg-status-success(-soft)` | green-4（品牌绿是 green-3 深松青用于实心 CTA，状态绿取下一档 + 强制软底） |
| `--status-error` | `#B23434` | `#F7E9E9` | `text/bg-status-error(-soft)` | red-8（品牌红 red-5 是深砖红，状态红更亮更鲜） |
| `--status-warning` | `#B28300` | `#F7EFDC` | `text/bg-status-warning(-soft)` | amber-4（**唯一反向取值**：琥珀亮端做文字色对比度不足，须往暗走） |
| `--status-running` | `#505059` | `#EFEEE9` | `text/bg-status-running(-soft)` | ink-5 + 脉冲动效。**不占色相**——这是对「与品牌色区分」最彻底的解释；现状借用 warning 是语义错配 |
| `--status-neutral` | `#757580` | `#F0EDE4` | `text/bg-status-neutral(-soft)` | ink-7（未开始 / 排队 / 已禁用） |
| `--status-info` | `#2E5AA8` | `#E7ECF5` | `text/bg-status-info(-soft)` | GAP↯ 收口现有 `#0066FF`（6 处 / 2 文件 / 4 种 CSS 属性）；降饱和贴合整体调性，米白底对比度 ≥ 4.5:1 |

#### 分类调色板（GAP↯ — 哈希取色，Figma 无规范）

一次性收口现存**五份**互相重复的独立色板（26 处）：`JournalCover.PALETTE`(8) / `pick-avatar-color.AVATAR_PALETTE`(7) / `SharedReceivePage.AVATAR_COLORS`(4) / `CollectionSharePoster.IDX_COLORS`(1) / `JournalPickerStep.colorForInitial`(6)。

```css
--cat-1:#4D1616; --cat-2:#661E1E;   /* 朱砂深档 */
--cat-3:#1F331B; --cat-4:#2F4D29;   /* 松青深档 */
--cat-5:#664B00; --cat-6:#805E00;   /* 琥珀深档 */
--cat-7:#1F1F23; --cat-8:#383840;   /* 玄墨深档 */
```
**推导依据**：四色阶各取 2 个深档 —— 既足够深以压白字，又互相可分辨，且全部落在 Figma 给定色阶内。现有色板严重偏蓝（JournalCover 8 个里 5 个蓝调），与四色系统直接冲突；`#2A7A2A`/`#CC8800` 是品牌色混进分类色板，会让用户误以为「绿头像有语义」。

#### 图表序列色（GAP↯ — Figma §6 明确列为规范缺口）

```css
--chart-1:#882828; --chart-2:#2F4D29; --chart-3:#E5A800; --chart-4:#B23434;
--chart-5:#5E9952; --chart-6:#E5BA45; --chart-7:#686873; --chart-8:#383840;
--chart-grid:#CECED9;      /* 网格线，与通用 --border 解耦 */
--chart-axis-fg:#757580;   /* 轴标签 */
```
**推导依据**：前 3 档绑品牌三色（与现有 `COLOR_GREEN/RED/AMBER` 的 var() 用法一致），后 5 档取四色阶中间亮度档，深浅交错保证相邻系列明度差 ≥ 15%（色盲可分）。收口 `UserMetricsPanel.PIE_PALETTE` 里 5 个 Tailwind 默认 500 档 hex + `token-usage/palette.ts` 的 6 档品牌色循环。

#### 恒暗段 & 编辑器（非 dark-mode）

| CSS 变量 | 新值 | 旧值 | 说明 |
|---|---|---|---|
| `--landing-dark-1` | `#1F1F23` | `#1A1A1A` | landing 亮暗段交替设计，映射到玄墨阶梯顺手拿到「偏蓝墨黑」 |
| `--landing-dark-2` | `#2B2B30` | `#222222` | 同上 |
| `--landing-dark-divider` | `#383840` | `#2A2A2A` | 同上 |
| `--prism-editor-bg` | `#09090A` | `#111111` | 22 个 `--prism-editor-*` **整体 KEEP**（CodeMirror 必须具体值，且已 100% var() 驱动，是全站样板）；仅 3 个纯灰底换玄墨档 |
| `--prism-editor-gutter-bg` | `#09090A`→更深或保持 | `#0a0a0a` | 同上 |
| `--prism-editor-chrome-bg` | `#2B2B30` | `#1a1a1a` | 同上 |
| `--prism-editor-selection` | `hsl(var(--brand-red)/.25)` | `rgba(204,34,34,.25)` | ⚠️ 内嵌旧品牌红硬编码，必须改 |
| 其余 18 个语法高亮色 | 不变 | — | 代码可读性需求，不受品牌四色阶约束 |

#### 暗色态（GAP↯ — Figma 只给亮色）

玄墨 12 档正好当暗色 surface + text + border 阶梯，与亮色**互为镜像**（亮色从亮端取 surface / 暗端取 text，暗色反过来）。

```css
.dark {
  --background:  #09090A;  /* ink-1  ← 亮色 #F6F4EE 的镜像端点 */
  --surface-card:#1F1F23;  /* ink-2 */
  --surface-1:   #1F1F23;  --surface-2: #2B2B30;  --surface-3: #383840;

  --foreground:  #E6E6F2;  /* ink-11 —— 不用纯白，避免暗底过曝 */
  --subtle-foreground: #CECED9;  /* ink-10 */
  --muted-foreground:  #9A9AA6;  /* ink-8  */
  --faint-foreground:  #686873;  /* ink-6  */

  --border-hairline: #1F1F23;  --border: #2B2B30;
  --divider: #383840;          --border-strong: #505059;
  --border-control: #E6E6F2;   /* 控件边在暗底必须翻亮 */

  --brand-red:   #CC3B3B;  /* red-9   —— 亮色用 red-5，暗色取亮端差 4 档 */
  --brand-green: #75BF66;  /* green-9 */
  --brand-amber: #E5C367;  /* amber-9 */
  --primary-foreground: #09090A;  /* 🔴 品牌色提亮后前景必须翻暗字 */
  --destructive-foreground: #FFFFFF;

  --prism-badge-bg: #664B00;  --prism-badge-fg: #E5CD89;
}
```

> 🔴 **前置决策**：`theme.store.ts` 的 `setTheme` **全站零调用点**（已实测确认，只命中 `stores/theme.store.ts:9` 类型声明与 `:16` 实现），默认 `'light'` 且 persist，`'system'` 分支不可达 —— `.dark` 块是当前跑不到的死代码。选 (A) 补切换入口 + 按上表落地（覆写从 18 扩到 ~30）；选 (B) 直接删 `.dark` + `theme.store`。见 §6-Q6。
> 另：规范文档第 293 行写「16 个 token 覆写」，**实测是 18**（多了 `--surface-3`、`--journal-soft-bg`），规范文档数字有误。

---

### 2.3 字号

```css
@theme {
  --text-*: initial;             /* 必须：让 6 档成为封闭集合 */

  --text-12: 0.75rem;            /* 12px */
  --text-14: 0.875rem;           /* 14px ★ 正文基准 */
  --text-16: 1rem;               /* 16px */
  --text-20: 1.25rem;            /* 20px */
  --text-24: 1.5rem;             /* 24px */
  --text-28: 1.75rem;            /* 28px */

  --text-body:    var(--text-14);   /* 语义别名 */
  --text-caption: var(--text-12);

  --text-display-36: 2.25rem;    /* GAP↯ */
  --text-display-56: 3.5rem;     /* GAP↯ logo，不进正文阶梯 */
}
```

| Tailwind 类 | 值 | 用途 | 吸收的旧档 | 依据 |
|---|---|---|---|---|
| `text-12` | 12px | Badge / 卡片次文 / 表头段标 / 计数 / 时间戳 / 图表刻度 | 8 / 9 / 10 / 11 / 12（**1,727 处**） | §2.2 + §4.2 Badge |
| `text-14` | 14px | ★ 正文 / 按钮 / 输入框 / 卡片主文 / sidebar 主项 / `body` | 13 / 14 / 15（部分） | §2.2 + §4.1 + §4.4 + §4.5 |
| `text-16` | 16px | 区块标题 / 面板列头 / 二级 h2 | 16 / 15（列头 7 处） / 17 | §2.2（设计稿最高频档，19 处） |
| `text-20` | 20px | 页面标题 / 数值强调 / 对话框 h1 | 20 | §2.2 |
| `text-24` | 24px | Hero 副标题 / 详情页 h1 移动端 | 24 | §2.2 |
| `text-28` | 28px | 规范内最大档。Hero 主标题 / 详情页 h1 桌面 | 30（14 处 Tailwind 默认漏网） / 1.7rem | §2.2 |
| `text-display-36` | 36px | GAP↯ 审稿终审决议大字 / landing·help h1 / 详情 hero | 36 | 推导：Figma 六档相邻比值均值 ≈1.19，28×1.19≈33.3，取整到现有实现值 36 以零改动落地 |
| `text-display-56` | 56px | GAP↯ BrandLogo xl | 48 / 56 | 推导：品牌字形非 UI 档位，从字号阶梯剥离 |

**命名结论**：弃用 `xs/sm/base/md/lg/xl`，改数值名。理由：本仓库已被 name≠value 咬过四次（`text-base=13`、`text-md=14`、`text-15`、`text-badge=9` 且零使用），且 Tailwind 默认 `lg/xl/2xl = 18/20/24` 与 Figma 的 `20/24/28` 全部错位——继续用语义名等于把同一个陷阱重埋。

**已确认删除**：`--text-badge`（9px，tsx/ts 中 **0 使用**）、`--text-15`。

---

### 2.4 行高 — 按**字族**绑定，不按字号档

Figma §2.4 给的是三个**与字号无关的恒定比值**。

```css
:root {
  --leading-sans:          1.25;   /* Google Sans      §2.4 实测 12→15.024 / 64→80.127 */
  --leading-display:       1.333;  /* Playfair Display §2.4 实测 12→15.995 / 32→42.655 */
  --leading-serif:         1.437;  /* Noto Serif SC    §2.4 实测 16→22.992 / 32→45.984 */
  --leading-paragraph:     1.7;    /* GAP↯ 长段中文正文 */
  --leading-display-tight: 1.15;   /* GAP↯ ≥28px 展示标题 */
}
@layer base {
  body          { line-height: var(--leading-sans); }
  .font-display { line-height: var(--leading-display); }
  .font-serif   { line-height: var(--leading-serif); }
}
```

| token | 值 | 收编 | 推导依据 |
|---|---|---|---|
| `--leading-sans` | 1.25 | `leading-tight`(25 处，值恰好相等→零视觉变化删除) | §2.4 |
| `--leading-display` | 1.333 | — | §2.4 |
| `--leading-serif` | 1.437 | — | §2.4 |
| `--leading-paragraph` | 1.7 | **234 处**：`leading-relaxed`(191) + `[1.7]`(22) + `[1.6]`(10) + `[1.65]`(6) + `[1.75]`(3) + `[1.85]`(2) | GAP↯ Figma 全是**单行短标签**，没有一个多行段落样本；1.25 套到中文段落会挤成一坨。1.7 是现有 6 个值的众数，且 `--leading-paragraph` 早已定义只是零引用 |
| `--leading-display-tight` | 1.15 | 12 处（`[1.05]`~`[1.25]`） | GAP↯ Playfair 1.333 是从 12-32px 样本推的；hero clamp(36,5vw,64) 用 1.333 会松散失控。字号越大行高比值越应越小是排印常识 |

> 🔴 **实现陷阱**：Tailwind v4 支持 `--text-14--line-height` 配套声明，**一旦定义，`text-14` 会同时输出 font-size 和 line-height，字号档会盖掉字族层行高，整套设计当场作废**。6 个字号 token **只声明 font-size，绝不声明配套 line-height**。

**删除**：`--leading-prose`(1.65) / `--leading-snug-x`(1.4) —— 与 `--leading-paragraph` 一样是零引用死 token。

---

### 2.5 字间距 — 只保留 2 个

Figma §2.5：设计稿中 letterSpacing **几乎全部为 0**，仅 3 处 `0.02em`（12px 上 = 0.24px，肉眼不可辨，按 0 处理）。

```css
--tracking-code:  0.25em;    /* 验证码 / 提取码 / 兑换码 —— 功能性，非装饰 */
--tracking-brand: -0.03em;   /* Scholay wordmark 光学收紧 —— 品牌资产 */
```

| token | 值 | 收编 | 理由 |
|---|---|---|---|
| `--tracking-code` | 0.25em | 8 处（现散在 `widest`(6) / `wider`(1) / `[0.25em]`(1) 三个值） | 逐位输入/核对时必须拉开字距才不会误读 1/l、0/O —— 是表单可用性而非排印风格 |
| `--tracking-brand` | -0.03em | 4 处（app 内 `tracking-tight` × 2、海报 `tracking-[-0.6px]` × 2） | 七字母彩色 logo lockup 必须光学收紧才成为整体标志。同一 wordmark 现有两套字距，取中间值统一 |

**其余 162 处全部 DELETE**（详见 §3.2）。为什么不为 uppercase 段标留 token：
1. Figma 唯一的 uppercase 标签样本（色卡标签 HarmonyOS Sans 16px）letterSpacing 也是 0；
2. 这批段标从 10px 升到 12px，x-height 变大本身就补回了可读性；
3. 实际文本全是 2-6 字符的极短英文（DOI/PDF/SKILL/OA）；
4. **最关键**：58 处 uppercase 段标用了 **11 个不同值**做同一件事。只要留一个「uppercase 专用」token，历史证明它会立刻重新裂变——当前的 13 值局面就是这么来的。

---

### 2.6 字族

```css
--font-sans:  'Google Sans','Google Sans Text','Plus Jakarta Sans',
              system-ui,-apple-system,'Inter','PingFang SC',
              'Hiragino Sans GB','Microsoft YaHei',sans-serif;
--font-serif: 'Noto Serif SC','Source Han Serif SC','Songti SC','SimSun',serif;
--font-display:'Playfair Display','Noto Serif SC','Times New Roman',serif;
--font-mono:  ui-monospace,SFMono-Regular,'JetBrains Mono',Menlo,Consolas,monospace;
```

| token | 状态 | 说明 | 依据 |
|---|---|---|---|
| `--font-sans` | **改** | 按决策 A 以 Google Sans 打头（**不做 @font-face** —— 专有字体不可自托管；纯靠字族名匹配本地已装字体，零 FOUT 零网络代价）。第 3 位 `Plus Jakarta Sans` 是设计意图最接近的 OFL 替身，预留自托管位 | §2.1 + 决策 A |
| `--font-serif` | 🔴 **新增** | **本维度最严重的洞**：60 处 `font-serif` 分布 21 个文件（审稿记录页全套 / Prism 正文 / claw hero / 分享卡 / 文献集分享页），但 globals.css **从未定义 `--font-serif`**，全部落到 Tailwind 内置 `Georgia/Times` —— 无 CJK 字形，中文被浏览器兜底到系统宋体，**mac/win/linux 三平台长得都不一样**，完全不受设计系统控制。需自托管 Noto Serif SC（SIL OFL）字重 300/500/700 | §2.1（13 处使用） |
| `--font-display` | 名不变、**补资产** | `public/fonts/` **只有 `playfair-display-700.woff2`**，而代码在用 `font-semibold`(11) / `font-medium`(4) / `italic`(15) —— 全在跑浏览器合成（faux bold 描边、faux italic 几何斜切），在 Playfair 这种高对比衬线上损伤明显。需补 400/500；italic 建议废弃（Figma 无 italic 样本） | §2.1 / §2.3 |
| `--font-mono` | 不变 | GAP↯ Figma 设计稿 **0 个等宽节点**，但代码 91 处真实需求（LaTeX / BibTeX / DOI / 验证码）。纯系统栈零下载 | GAP↯ |

> ⚠️ **CJK 字体体积**：Noto Serif SC 必须按 `unicode-range` 子集化 + `font-display: swap`，不能整包 preload。建议只子集常用 3500 字 + 拉丁，单字重 ≤ ~200KB，且只在 peer-review / prism / claw / share 路由按需加载。

---

### 2.7 字重

Figma §2.3：**Google Sans 只有 400 / 500**；Noto Serif SC 有 300/500/700；Playfair 有 400/500/700。
→ **无衬线 UI 上的 600 和 700 在新规范里根本不存在。**

| 现状 | 数量 | 处置 | 说明 |
|---|---:|---|---|
| `font-bold` 在 sans 上 | **686** | → `font-medium` (500) | 全站近七成的「加粗」在新规范里不存在 |
| `font-semibold` 全部 | **344** | → `font-medium` (500) | 600 在三个字族里一个都没有 |
| `font-bold` 在 serif/display/mono 上 | 87 | **KEEP** | 700 在这两个衬线字族里是规范内字重 |
| `font-medium` | 179 | **KEEP** | §4.1 按钮 500/14px、§4.4 卡片主文 500/14px |
| `font-normal` | 31 | **KEEP** | §4.2 Badge 400/12px、§4.4 卡片次文 400/12px |

> 🔴 **1,030 处从 700/600 压到 500，占全站字重用法的 78%。这不能当机械替换做。**
> 当前视觉层级严重依赖 700 vs 400 的重量差（sidebar 段标、admin 表头、审稿字段标签、所有卡片标题都是 `font-bold` + `text-faint`）。压到 500 vs 400 后对比度骤降，**必须同时**用字号档（12/14/16/20/24/28）+ 颜色档（foreground/subtle/muted/faint）重建层级。

---

### 2.8 圆角

```css
@theme {
  --radius-*: initial;          /* 必须：堵死 rounded / rounded-full / rounded-2xl 三个逃逸口 */

  --radius-xs:   0.25rem;   /* 4px  */
  --radius-sm:   0.5rem;    /* 8px  */
  --radius-md:   0.75rem;   /* 12px */
  --radius-lg:   1rem;      /* 16px ★ */
  --radius-xl:   1.25rem;   /* 20px */
  --radius-pill: 9999px;
}
```

| Tailwind 类 | 值 | 用途 | 依据 |
|---|---|---|---|
| `rounded-xs` | 4 | 内联 chip / 行内 code / ≤20px 小方块 / checkbox / kbd / 气泡尖角 | §3 最低档。设计稿无实例但设计说明明列；现有 359 处 `rounded-sm` 中 82% 是小尺度元素，4 已被实践验证 |
| `rounded-sm` | 8 | 24~36px 图标按钮 / 导航菜单项 / tab / 表单字段 / 抽屉把手 | §3。选 8 而非 4 的直接证据见下方 |
| `rounded-md` | 12 | 浮层（Popover / DropdownMenu / Tooltip / HoverCard）/ 嵌套子面板 / 表格外框 / 图表 tooltip | §3。现有 12 处 `rounded-xl` 已在这个值上（免费的既有验证） |
| `rounded-lg` | **16** | ★ **主力容器**：顶层卡片 / 页面区块 / Dialog+Sheet / 主搜索框 / Composer | §3（设计稿唯一实测容器圆角，16 处）+ §4.4 卡片 + §4.5 搜索框。现有 18 处 `rounded-2xl` 已落在 16，零风险验证过 |
| `rounded-xl` | 20 | 最外层大区块 / 移动端 bottom sheet 顶角。使用应极克制（目标 <20 处） | §3 最高档。设计稿中 20 只出现在 h8 进度条（实为胶囊），属「设计说明有、设计稿无」 |
| `rounded-pill` | 9999 | 按钮实心变体 / Badge / 进度条 / 头像 / 状态圆点 / 筛选 chip | §4.1(120×42 r40) / §4.2(46×23 r40) / §4.3(h8) —— **唯一与 Figma 完全对齐的现存档位**，284 处不动，还要吸收 55 处 `rounded-full` |

**「`rounded-md`(6px) 迁到 4 还是 8」→ 答案是 8**，三条代码内证：
1. `topnav/UserSection.tsx:26` 注释写死「notif 32×32 **rounded-lg**」且 `:46` 实际就是 8；而并排同一横排的 `sidebar/SidebarHeaderNav.tsx` size-9(36px) 图标钮是 6 —— **同一视觉分组内已存在 6 和 8 两个值，6 是少数派**。
2. `JournalSearchResults.tsx:362` 注释自陈 `.pen 'YpqvW'(rounded-8)`，代码写成 6；`JournalDetailPane.tsx:124` 自陈 `.pen 'L3sjEN'(rounded-10)`，代码写成 8 —— **历史上圆角一路被抹小，6 是实现期的将就值，不是设计意图**。
3. 36px 按钮上 4px 显得方硬，且会与保留 4 的 18px chip 撞档（大小差一倍、圆角一样）。

**分层判定口诀**：直接坐在页面底色上的一块内容 → 16；嵌在另一个 16 里 → 12；是个控件 → 8；是段文字里的装饰 → 4。**内层圆角必须严格小于外层**，否则子元素会「顶角」。

---

### 2.9 间距与尺寸

#### 控件高度阶梯（Figma §4）

```css
--control-h-xs: 1.5rem;    /* 24px */
--control-h-sm: 2rem;      /* 32px */
--control-h-md: 2.25rem;   /* 36px  GAP↯ */
--control-h-lg: 2.625rem;  /* 42px */
--control-h-xl: 2.75rem;   /* 44px */
--size-avatar:  2.5rem;    /* 40px */
--size-icon:        1.5rem;  /* 24px */
--size-icon-inline: 1.25rem; /* 20px */
--h-progress:   0.5rem;    /* 8px  */
```

| 语义 | 现状 px | 用量 | Figma | 目标 | 依据 |
|---|---:|---:|---:|---|---|
| Badge / chip | 18 | 10 | **23** | **24** `h-control-xs` | §4.2 `46×23` + `padding 4/8` + 文字 12px |
| 紧凑控件 | **28** | **147** | — | **合并到 32** | Figma 无 28 档 |
| 默认控件 / 图标钮 | **32** | **112** | **32** ✅ | **32** `h-control-sm` | §4.4 图标钮 32×32 |
| Tab / 工具栏 | **36** | **112** | — | **36** `h-control-md` | GAP↯ 保留（32 会让 tab 条过窄、42 会让工具栏过高） |
| 卡片头像 | 32 | — | **39** | **40** `size-avatar` | §4.4 头像 39×39 |
| 大控件 / 主按钮 | **40** | **71** | **42** | **42** `h-control-lg` | §4.1 按钮统一 120×42。**与现有 `--spacing-tab`(42) 合并，`--spacing-tab` 退休** |
| 搜索 / 输入 | 44 | 28 | **44** ✅ | **44** `h-control-xl` | §4.5 搜索框 312×44。⚠️ Input 原子须从 h-8(32) 上调 |
| 图标 | 12/14/16（主力） | 991 | **24** 画板 | 24 / 20 | §4.6 全部 24×24 · §4.5 内联 20×20/1.5px。**⚠️ 24 是画板还是图形需确认，见 §6-Q7** |
| 容器（dialog/移动） | 48/52/56 | 76 | — | 48 + 56，**删 52** | GAP↯ |

> **现状 8 档（18/20/28/32/36/40/42/44）→ 目标 5 档。天然对齐的只有 32 和 44。**
> **`--spacing-17`(68px) 全项目 0 引用**（注释自陈「预留」），换真源时直接删。`--spacing-15`(60px) 仅 2 处。

#### 内边距 / 间距白名单

```css
--pad-card:     1rem;              /* 16px  §4.4 卡片 padding */
--card-gap:     0.5rem;            /* 8px   §4.4 卡片 gap */
--pad-showcase: 1rem 2.5rem;       /* 16/40 §4.4 外层展示区 */
--pad-dialog:   1.5rem;            /* 24px  GAP↯ */
--pad-menu:     0.25rem;           /* 4px   GAP↯ */
```

**允许的间距集合**：Figma §5 观测值 `{4, 8, 10, 12, 16, 24, 32, 40}` = Tailwind `{1, 2, 2.5, 3, 4, 6, 8, 10}`。

> 🔴 **超规半档 ≈750 处**：`gap-1.5`(6px)**307** / `gap-0.5`(2px)**47** / `gap-3.5`(14px)**40** / `px-5`(20px)**63** / `p-5`(35) / `px-3.5`(35) / `p-3.5`(15) 等。
> **`gap-1.5` 是全站第二高频 gap，且已写进 `shared/ui/{dialog,sheet,dropdown-menu}.tsx` 三个原子的基线** —— 不是散落误用，是当前设计系统的既成事实。**必须先决策**（见 §6-Q8）。
> 注意 `gap-2.5`(10px) **是合规的** —— Figma 按钮/Badge 的 gap 就是 10。

#### 布局与容器

| token | 值 | 用途 | 依据 |
|---|---|---|---|
| `--container-max` | `90rem` (1440) | 整站中心内容最大宽 | §5 原文「中心宽度最高 1440px（加上侧边栏一起）」。**代码里没有任何一处是 1440**，靠 `max-w-7xl/6xl/5xl/4xl` + 7 个 arbitrary 共 **11 套口径**凑 |
| `--container-reading` | `45rem` (720) | 长文阅读区 | GAP↯ 取代码众数 720（5 处，Prism 正文/参考文献已成对一致） |
| `--rail-w-sm/md/lg` | 220 / 300 / 380 | 右侧信息栏 3 档 | GAP↯ 收口现有 8 个值(200~560) |
| `--panel-w-sm/md/lg` | 200 / 280 / 360 | 弹层菜单宽 | GAP↯ 收口现有 14 个值 |
| `--dialog-w-md/lg/xl` | 480 / 720 / 960 | 对话框宽 | GAP↯ |
| `--overlay-max-h` | `85dvh` | 弹窗最大高 | GAP↯ 收口 17 个值。**强制 dvh**：`dialog.tsx` 已因移动 Safari 地址栏改 90dvh，其余 15 处仍是 vh，是同一 bug 未收口 |
| `--overlay-max-h-sheet` | `92dvh` | 底部抽屉 | GAP↯ 取 `MobileBottomSheet` 现值 |
| `--scroll-pane-max-h` | `16.25rem` (260) | 弹层内列表滚动区 | 代码内生共识（5 处已自发一致） |
| `--rule-accent` | `3px` | 强调竖条 / 左侧激活边线 | GAP↯ 代码内生共识（`w-[3px]` 8 处 + `border-l-[3px]` 多处）。Figma 描边只有 1px 与 1.5px |
| `--bubble-max-w` | `80%` | 聊天气泡最大宽 | 代码内生共识（4 文件一致，`Bubbles.tsx:13` 已写明理由） |
| `--safe-bottom` | `max(env(safe-area-inset-bottom), 16px)` | 全面屏 home indicator 让位 | GAP↯ 统一 `MobileBottomNav` 的裸 `env()`（非全面屏返回 0 会贴边）与带兜底写法 |

---

### 2.10 Elevation

Figma §6：**0 个 DROP_SHADOW**，分层靠描边 + 米白底明度差。但逐处核查后，两类场景**物理上无法替代**：

```css
--shadow-overlay: 0 8px 24px -4px rgb(31 31 35 / 0.14),
                  0 2px 6px -2px rgb(31 31 35 / 0.08);
--shadow-raised:  0 1px 2px 0   rgb(31 31 35 / 0.07);
```

| token | 覆盖 | 为什么无法替代 |
|---|---:|---|
| `--shadow-overlay` | **31 处** | 浮层会盖在**任意**背景之上（可能正好是同色卡片），描边无法建立前后关系。收编 `shadow-md`(8)+`lg`(6)+`xl`(1)+`2xl`(2)+`sm`浮层(7)+4 个自定义 8/24 值+失效的 `shadow-elevation-2`(1)+2 处内联 boxShadow |
| `--shadow-raised` | **9 处** | segmented control 活动块（浅滑块在浅槽里，加描边会撑大形状破坏 pill 几何）、Switch thumb、拖拽中元素、PDF 拟物纸张 |
| **DELETE** | **38 处** | 其中 30 处已自带 border，删掉零视觉损失 |

净效果：**78 处阴影 / 12 个不同值 → 40 处 / 2 个 token**。

> 🚨 **`shadow-elevation-2` 是死类**：`SmartSearchPanel.tsx:1108` 的「滚到底部」悬浮圆钮用了它，但 globals.css 全文 grep「elevation」**零命中**，Tailwind v4 对未注册 theme 键不产出任何 CSS —— 当前渲染为空。有人已经想过 elevation token 但没落地。
> 🚨 **`shadow-none` × 4 全是死码**：`shared/ui/input.tsx` 的 className 里没有任何 shadow（复刻时已去掉上游的 `shadow-sm`），这 4 处"防御性重置"重置的是不存在的阴影。

**颜色基准后门（一并清）**：`rgba(15,23,42,*)` = Tailwind slate-900 **7 处**（CLAUDE.md §5 明令禁止默认色板）、裸 `rgba(0,0,0,*)` **15 处**、`#1111111f` 2 处、`rgba(204,34,34,.4)`/`rgba(42,122,42,.22)` 各 1 处（旧品牌色十进制写法）。

---

### 2.11 Focus ring（GAP↯ — Figma 未定义）

```css
--ring: 31 31 35;   /* ink-2，从旧 var(--foreground)=#111 改锚 */

@utility focus-ring {
  outline: none;
  --tw-ring-width: 2px;
  --tw-ring-color: rgb(31 31 35 / 0.45);
  --tw-ring-offset-width: 2px;
  --tw-ring-offset-color: var(--focus-ring-offset, theme(--color-background));
}
--ring-selected: rgb(31 31 35 / 0.12);   /* 非焦点的「选中/激活」环 */
--ring-on-dark:  rgb(255 255 255 / 0.10);
--ring-on-dark-emphasis: rgb(255 255 255 / 0.30);
```

**现状 8+ 种写法 42 处**：`ring-ring` solid(21) / `/30`(12) / `/20`(6) / `/40`(3) + `focus:`(50) vs `focus-visible:`(38) + `ring-offset` 有无(7) + `globals.css:386` 全局 `outline` 兜底（第 9 种）。

**45% alpha 的推导**：底色从 `#FFFFFF` 改 `#F6F4EE` 后对比度整体下降，实测 `#1F1F23@20%` on `#F6F4EE` 约 **1.6:1**，不满足 WCAG 2.2 SC 2.4.11 的焦点指示 ≥3:1；45% + offset-2 可达标。

> 🔴 **根因是架构债不是 token 债**：21 处 solid `ring-ring` 几乎全部集中在 admin 手写的**裸 `<input>`/`<textarea>`**（ModelFormDialog×3、SimpleCrudPage、MessagesPage、MailCenterPage×2、SystemConfigPage、DimensionsPage、AnnouncementsPage、PaymentConfigPage、FeatureToolsPage、WechatOfficialPage、FeedbackPage、ProviderDialogs、ChatSessionMonitor、PeerReviewMonitor…），全都绕开了 `shared/ui/input.tsx`（用 `/30`）。**只发 token 不改架构，admin 会立刻再漂移。**
> ⚠️ **`ring-offset-background` 在改底色时是硬性风险**（7 处）：若维持「页面米白 / 卡片纯白」双底色，落在米白页面上的控件其 offset 会画白圈成伪影。同理 `ring-background` 挖空描边（`LibraryReferencePicker.tsx:341`）在纯白卡内会画米白圈。故 offset 色做成**可被容器覆盖的变量**。

---

### 2.12 z-index（GAP↯ — Figma 未定义）

```css
--z-base: 0;      --z-raised: 10;   --z-sticky: 20;   --z-nav: 30;
--z-scrim: 40;    --z-overlay: 50;  --z-modal: 60;    --z-popover: 70;
--z-tooltip: 80;  --z-toast: 90;    --z-fx: 100;
```

| 档 | 值 | 用途 | 收编现状 |
|---|---:|---|---|
| `--z-raised` | 10 | 卡片内浮元素（渐变遮罩 / 复制按钮 / loading overlay） | `z-10`(20) + `z-[5]`(2) |
| `--z-sticky` | 20 | sticky 表头 / composer 底栏 | `z-20`(7) |
| `--z-nav` | 30 | 页面级 header（TopNav / AdminShell / LandingNav 三处已一致） | `z-30`(9) |
| `--z-scrim` | 40 | 侧栏遮罩 | `z-40`(1) |
| `--z-overlay` | 50 | Dialog / Sheet **遮罩** | 拆自 `z-50` |
| `--z-modal` | 60 | Dialog / Sheet **内容** / 移动 sheet | 拆自 `z-50` + `z-[70/80]` |
| `--z-popover` | 70 | Popover / Dropdown / HoverCard | 拆自 `z-50` |
| `--z-tooltip` | 80 | Tooltip | 拆自 `z-50` |
| `--z-toast` | 90 | sonner | — |
| `--z-fx` | 100 | 一次性特效层（`pointer-events:none`） | `z-[9998]` / `z-[9999]` |

> 🔴 **层级契约当前不自洽**：Dialog 遮罩、Dialog 内容、Tooltip、Popover、Dropdown、HoverCard、Sheet、侧栏抽屉 —— **8 类语义完全不同的浮层全部 `z-50`(20 处)**，谁盖谁纯粹由 portal 挂载顺序（即 React 渲染时机）决定。**Tooltip 挂在 Dialog 内的按钮上时，能不能盖住 Dialog 是运气。**
> 另：`MobileBottomSheet` 用 70/80 **高于** Radix 全家的 50 —— Dialog 打开时移动 sheet 会压在上面，而 Dialog 永远压不住 sheet，这个不对称没有任何地方声明过。而 `MobileSearchFilterSheet` 的 60/61 写在 `absolute inset-0` 局部 stacking context 里，数值 60 实际等价于 1 —— **两套「60/70/80」看起来像一个体系其实是两个**。

---

### 2.13 Motion（GAP↯ — Figma §6 未定义）

TS 侧 `shared/lib/motion.ts` 与 CSS 侧 `@theme` **共用同一组数值**，这是 CSS transition 与 framer-motion 两条动画来源唯一的对齐办法。

```ts
export const MOTION = {
  duration: { instant: 0, fast: 0.16, base: 0.28, slow: 0.42, deliberate: 0.7 },
  ease: {
    out:        'easeOut',                    // cubic-bezier(0,0,.2,1)
    inOut:      'easeInOut',                  // cubic-bezier(.4,0,.2,1)
    emphasized: [0.22, 1, 0.36, 1] as const,  // 强调型页面转场
  },
  spring: {
    sheet:  { type: 'spring', bounce: 0.12, duration: 0.42 },
    snappy: { type: 'spring', stiffness: 460, damping: 38, mass: 0.9 },
  },
  ambient: { glowA: 2.8, glowB: 3.2 },  // repeat:Infinity 装饰呼吸，不进 duration 档位
} as const;
```
```css
@theme {
  --duration-fast: 160ms; --duration-base: 280ms;
  --duration-slow: 420ms; --duration-deliberate: 700ms;
  --ease-out: cubic-bezier(0,0,.2,1);
  --ease-in-out: cubic-bezier(.4,0,.2,1);
  --ease-emphasized: cubic-bezier(.22,1,.36,1);
}
```

**duration 聚类依据**：现状 18 个 framer 值，每簇内相邻值差 ≤ 0.04s（肉眼不可分辨）——
`0.15~0.22 → fast` / `0.26~0.35 → base` / `0.4~0.5 → slow` / `0.6~0.85 → deliberate`。
CSS 侧 `duration-150/200/300/500` 一并映射进来（现状 CSS 与 framer 完全脱节：150/200/300/500ms vs 160/280/420/700ms，同一次交互一半走 CSS 一半走 framer 会明显不同步）。

**ease 是全站最健康的维度**：只有 3 条且分工清晰（`easeOut` 17 / `easeInOut` 9 / `[0.22,1,0.36,1]` 3），不需增删。

**KEEP**：`toast duration 2500/6000/8000ms`（通知停留时长，非动效时长，归到 700ms 会破坏功能）；`ambient 2.8/3.2`（`repeat:Infinity` 装饰呼吸，成对错相是明确设计意图）。

---

### 2.14 第三方主题适配层

新建 `src/shared/lib/theme-bridge.ts` —— **全项目唯一允许把 design token 变成具体 CSS 值的地方**。

```
theme-bridge.ts
├─ tokenValue(name)      getComputedStyle 解析 + 模块级缓存 + MutationObserver 监听 .dark 失效
├─ passthrough 模式      直接返回 `var(--x)` —— 浏览器会解析变量的消费方
│   └─ cmTheme           CodeMirror（现 LatexEditor/LatexDiffEditor 主题对象迁入，行为不变）
└─ resolved 模式         返回解析后字面值 —— 消费方拿到值后自己写进属性/克隆节点
    ├─ mermaidTheme      themeVariables（mermaid 把值写进 SVG presentation 属性）
    ├─ chartTheme        recharts grid/axis/tooltip/series[8] + CHART_FONT + CHART_TOOLTIP_STYLE
    └─ posterPalette     html-to-image 海报（离屏克隆丢变量，必须字面值）
```

| 库 | 现状 | 处置 |
|---|---|---|
| **CodeMirror** | ✅ 21 处 `var(--prism-editor-*)`，**全站样板** | 迁入 `cmTheme`，行为不变。顺手把 `LatexEditor.tsx:21` 硬编的 `fontFamily`/`lineHeight`(1.65) 改 `var()` |
| **recharts** | 🟡 91 处 `var(--color-*)` 已 token 化；但 `PIE_PALETTE` 混入 5 个 Tailwind 默认 500 档 hex，34 处 `fontSize` 裸数字(9/10/11/12)，5 处重复 tooltip style，2 处 `boxShadow` | 抽 `chartTheme`；fontSize 全归 12；`borderRadius:6→12`；**删 boxShadow**（两处 tooltip 已有 `border: 1px solid var(--color-border)`，靠描边 + 白底 on 米白页面底分层，正是 Figma 机制） |
| **mermaid** | ❌ 只有 `theme:'neutral'`，**0 个 themeVariables** | 补 `mermaidTheme`。⚠️ `MermaidDiagram.tsx:39` 的模块级 svg 缓存需在主题切换时 `clear()` |
| **katex** | ✅ 零颜色硬编码，公式继承 `currentColor` | 不动 |
| **html-to-image 海报** | 🔴 71 处硬编码 hex，且 `#CD2323` ≠ token `#CC2222` **已漂移** | 抽 `posterPalette`；`toPng backgroundColor:'#ffffff'` 必须改 `#F6F4EE`（否则导出图边缘出白边） |
| **sonner** | ❌ `richColors` 打开自带调色板（绿 #3d9a50 / 红 #d33），**全站唯一设计系统管不到的颜色源** | 关掉 `richColors`，用 sonner 的 `--success-bg`/`--error-text` 等 CSS 变量 hook 指到 `--status-*` |

**三条铁律**：
1. 组件不得再出现第二个 `getComputedStyle(...).getPropertyValue`，全部经 `tokenValue`。
2. 每个 `resolved` 导出必须在 `tests/` 加不变量测试：断言 `posterPalette.brandRed === tokenValue('--brand-red')` —— 改 token 忘了改海报会在 CI 直接 fail（现状是静默漂移，`#CD2323` vs `#CC2222` 已经漂了）。
3. `passthrough` 天然跟随暗色；`resolved` 必须在主题切换时重新解析。

---

## 三、替换台账

> 每组给出**代表性 file:line**（全量 13,163 条无法逐条列出，此处按「值 / 模式」聚合，每条注明总数与风险）。

### 3.1 MAP — 能直接映射（≈ 7,150 处）

#### 字号（2,821 处）

| 现状 | 数量 | 目标 | 代表位置 | risk |
|---|---:|---|---|---|
| `text-xs` (11px) | 922 | `text-12` | `topnav/AllMenusOverlay.tsx:108` · `shared/ui/button.tsx:25` | 🔴 high |
| `text-2xs` (10px) | 776 | `text-12` | `admin/components/DataTable.tsx:200` · `shared/ui/badge.tsx:10` | 🔴 high |
| `text-sm` (12px) | 684 | `text-12`（值不变）**例外 9 处 shared/ui 基座 → `text-14`** | `shared/ui/{button,input,tabs,dropdown-menu}.tsx` | 🟡 med |
| `text-base` (13px) | 171 + **body 全局** | `text-14` / `text-body` | `styles/globals.css:381` ★ 真正冲击面 | 🔴 high |
| `text-md` (14px) | 79 | `text-14` | `sidebar/SidebarItem.tsx:57` | 🟢 none |
| `text-lg` (16px) | 69 | `text-16` | `settings/pages/SecurityPage.tsx:114` | 🟢 none |
| `text-xl` (20px) | 43 | `text-20` | `shared/components/BrandLogo.tsx:16` | 🟢 none |
| `text-2xl` (24px) | 38 | `text-24` | `browser/components/JournalDetailPane.tsx:170` | 🟢 none |
| `text-3xl` (30px，Tailwind 默认漏网) | 14 | `text-28` | `help/components/HelpLayout.tsx:114` | 🟢 low |
| `text-15` | 9 | **7 处列头→`text-16`；2 处 line-clamp 标题→`text-14`** | `search/components/SearcherColumn.tsx:203` / `library/.../LibraryPaperRow.tsx:215` | 🟡 med |
| `text-[10px]` | 11 | `text-12` | `library/.../MetaRow.tsx:58/63/68/73` | 🔴 high |
| `text-[9px]` | 9 | `text-12` | `topnav/AllMenusOverlay.tsx:157` | 🔴 high |
| `text-[8px]` | 1 | `text-12` | `chat/LibraryReferencePicker.tsx:341` | 🔴 high |
| `text-[11/12/15/17/30px]` | 11 | 按语境 | `MobilePaperRow.tsx:84`(15→14) · `SharedReceivePage.tsx:436`(17→16) | 🟢 low |
| recharts `fontSize:9/10/11/12` | 34 | `CHART_FONT = 12` | `admin/components/UserMetricsPanel.tsx:251` | 🟡 med |
| CodeMirror `fontSize:'12px'` | 1 | `var(--text-12)` | `prism/components/LatexEditor.tsx:20` | 🟢 none |

#### 圆角（1,185 处）

| 现状 | 数量 | 目标 | 代表位置 | risk |
|---|---:|---|---|---|
| `rounded-md`(6) **带边框容器** | 363 | `rounded-lg`(16) 顶层 / `rounded-md`(12) 内层 | `settings/.../account-assets-card.tsx:63` · `admin/components/StatCard.tsx:27` | 🔴 high |
| `rounded-sm`(4) **内联 chip** | 116 | `rounded-xs`(4，值不变仅改名) | `PaperResultCard/DefaultCard.tsx:95` | 🟢 low |
| `rounded-lg`(8) **容器** | 98 | `rounded-lg`(16，token 值改) | `shared/ui/dialog.tsx:60`（覆盖 52 个 DialogContent） | 🔴 high |
| `rounded-sm`(4) **裸底块** | 90 | `rounded-xs` | `chat/MarkdownRenderer.tsx:112` | 🟢 low |
| `rounded-md`(6) **菜单项/tab** | 83 | `rounded-sm`(8) | `topnav/RailLinks.tsx:44` | 🟡 med |
| `rounded-sm`(4) **小图标位** | 82 | ≤20px→`rounded-xs`；24~36px→`rounded-sm`(8) | `AllMenusOverlay.tsx:149/212` | 🟡 med |
| `rounded-sm`(4) **带边框容器** | 64 | `rounded-sm`(8)；**主搜索框→`rounded-lg`(16)** | `SearchAutocomplete.tsx:194/195/192/262` | 🔴 high |
| `rounded-full` | 55 | `rounded-pill` | `shared/ui/scroll-area.tsx:38` | 🟢 none |
| `rounded-md`(6) **图标按钮** | 53 | `rounded-sm`(8) | `sidebar/SidebarHeaderNav.tsx:63/91/121` | 🟡 med |
| `rounded`（裸，硬编码 .25rem） | 45 | `rounded-xs` | `prism/components/LatexDiffEditor.tsx:145` | 🟢 low |
| `rounded-md`(6) **裸 input** | 35 | `rounded-sm`(8)，**先收口到 `<Input>`** | `admin/components/ModelFormDialog.tsx:317` | 🟢 low |
| `rounded-lg`(8) **非容器** | 27 | `rounded-sm`(8) —— **必须先拆再改 token 值** | `topnav/UserSection.tsx:46` · `chat/Composer.tsx:250/268` | 🔴 high |
| `rounded-2xl`(16) | 18 | `rounded-lg`(16，仅改名) | `chat/Composer.tsx:202` | 🟢 low |
| `rounded-xl`(12) | 12 | `rounded-md`(12，仅改名) | `claw/.../TemplateCards.tsx:153` | 🟢 low |
| shared/ui 基座 10 处 | 10 | Button→`pill`；Input→8；浮层→12；Skeleton→4；AIOverlay→16 | `shared/ui/button.tsx:7`（覆盖 306 个 `<Button>`） | 🔴 high |
| `rounded-[6/2/1px]` · `rounded-t-[14px]` | 12 | 分别归档 | `share/SharePoster.tsx:59` · `mobile/pages/FeedPage.tsx:108` | 🟢 none |
| recharts `borderRadius:6` | 5 | `var(--radius-md)`=12 | `admin/pages/AnalyticsPage.tsx:390` | 🟢 low |

#### 字重（1,030 处）

| 现状 | 数量 | 目标 | 代表位置 | risk |
|---|---:|---|---|---|
| `font-bold` on sans | 686 | `font-medium` | `admin/components/DataTable.tsx:200` · `sidebar/SidebarSection.tsx:52` | 🔴 high |
| `font-semibold` 全部 | 344 | `font-medium` | `shared/ui/dialog.tsx:118` · `shared/ui/sheet.tsx:77` · `PageHeader.tsx:39` | 🔴 high |

#### 行高（290 处）

| 现状 | 数量 | 目标 | risk |
|---|---:|---|---|
| `leading-relaxed`(1.625) | 191 | `leading-paragraph`(1.7) | 🟡 med |
| `leading-[1.7]` | 22 | `leading-paragraph`（值相等，零视觉变化） | 🟢 none |
| `leading-[1.6/1.65/1.75/1.85]` | 21 | `leading-paragraph` | 🟢 low |
| `font-display`(Playfair) | 56 | 名不变，**补 400/500 字重资产** | 🟡 med |

#### 颜色（86 处 UI 侧 + 71 海报）

| 现状 | 数量 | 目标 | 代表位置 | risk |
|---|---:|---|---|---|
| 海报中性色 `#E9E9E9/#666/#999/#111/#F5F5F5/#FAFAFA/#D8D8D8` | 32 | 对应新 token | `share/SharePoster.tsx:57/91/93/107/119/152/159` | 🟡 med |
| 海报品牌三色 `#CD2323/#2A7A2A/#DD9D13/#111111` | 36 | `#882828/#2F4D29/#E5A800/#1F1F23` | `share/SharePoster.tsx:40-44` · `CollectionSharePoster.tsx:29` | 🟡 med |
| `#F1EADA` 暖米黄软底 | 6 | `--amber-soft-bg #E5DFCE` | `tools/pages/mobile/MobileToolsHomePage.tsx:76` · `library/pages/SharedReceivePage.tsx:224/316` | 🔴 **high** |
| Prism 暗色面板 `#111/#0a0a0a/#e6e6e6/#555` | 5 | 已有的 `var(--prism-editor-*)`（纯漏改） | `prism/components/PrismPreview.tsx:85/87` | 🟢 low |
| `#FAFAF7` / `#E5E5E5` / `#E9F7EC` / `#7C9E82` | 4 | `surface-1` / `border` / `brand-green/10` / 松青中亮档 | `landing/.../PrismEditorMock.tsx:54` · `peer-review/.../StepIndicator.tsx:47` | 🟢 low |
| chat 序号 chip `#2A7A2A` + `rgba(42,122,42,.12)` | 2 | `hsl(var(--brand-green)/.12)` | `chat/styles.tsx:57` | 🟢 low |
| `toPng backgroundColor:'#ffffff'` | 1 | `#F6F4EE` | `share/ShareSheet.tsx:355` | 🟡 med |

#### 阴影 / ring（39 处 MAP）

| 现状 | 数量 | 目标 | risk |
|---|---:|---|---|
| `shadow-md` Radix 浮层 | 8 | `shadow-overlay` | 🟢 none |
| `shadow-sm` 浮层 | 7 | `shadow-overlay` | 🟢 low |
| `shadow-lg` Radix 浮层 | 6 | `shadow-overlay` | 🟢 none |
| `shadow-sm` 控件抬升(segmented/switch) | 6 | `shadow-raised` | 🟡 med |
| `ring-foreground/10 · /30 · /5` | 7 | `--ring-selected` | 🟡 med |
| `shadow-2xl` 移动 sheet | 2 | `shadow-overlay` | 🟢 low |
| 自定义 8/24 浮层值 | 4 | `shadow-overlay` | 🟢 none |
| `shadow-elevation-2`（**失效死类**） | 1 | `shadow-overlay` | 🟢 low |
| 内联 `boxShadow` recharts | 2 | `var(--shadow-overlay)` | 🟢 none |
| `border-[1.5px]` | 3 | `border-2` | 🟢 low |

#### 尺寸 / 原子层（≈1,700 处）

| 现状 | 数量 | 目标 | risk |
|---|---:|---|---|
| `h-7`(28) | 147 | `h-control-sm`(32) | 🟡 med |
| `h-8`(32) | 112 | `h-control-sm`(32，值不变) | 🟢 low |
| `h-10`(40) | 71 | `h-control-lg`(42) | 🟡 med |
| `h-11`/`h-[44px]` | 28 | `h-control-xl`(44) | 🟢 low |
| `h-[18px]` Badge | 10 | `h-control-xs`(24) + `text-12` | 🟡 med |
| `h-tab`(42) | 5 | `h-control-lg`(42)，`--spacing-tab` 退休 | 🟢 none |
| `px-[18px]` 等 18px 簇 | 17 | `p-4`/`px-4`/`gap-4`(16) | 🟢 low |
| `h-12.5`（**Tailwind 不存在的档**） | 1 | `h-12` | 🟢 none |
| 裸 `<button>` | 458 | `<Button>`（按语义分流） | 🔴 high |
| 裸 `<input>` | 90 | `<Input>` | 🟡 med |

---

### 3.2 DELETE — 新规范里不存在（≈ 480 处）

#### 字间距（162 处，13 个值）

| 值 | 数量 | 代表位置 | 说明 |
|---|---:|---|---|
| `tracking-[0.12em]` | 37 | `admin/components/DataTable.tsx:200` · `shared/ui/dropdown-menu.tsx:150` | 32 处是**中文**文本加正字间距 —— 汉字等宽方块字，加 letter-spacing 只破坏字面框节奏 |
| `tracking-wider`(.05em) | 31 | `peer-review/.../ChiefVerdictPanel.tsx:158` | ⚠️ features/ 与 shared/ 两份逐行重复实现，须同步 |
| `tracking-wide`(.025em) | 15 | `library/.../PdfUploadDecide.tsx:207` | §4.2 Badge 规格明确无 letterSpacing |
| `tracking-widest`(.1em) | 14 | `auth/components/AuthDialog.tsx:117` | — |
| `tracking-tight`(-.025em) | 14 | `shared/ui/dialog.tsx:118` · `shared/ui/sheet.tsx:77` | 改这两处一次性影响全站所有弹层标题 |
| `tracking-[0.16em]` | 14 | `tools/components/ToolsSidebar.tsx:215` | 最典型的 uppercase 段标写法 |
| `tracking-[0.18em]` | 9 | `sidebar/SidebarSection.tsx:56` | 改一处统一全站 sidebar 段标 |
| `tracking-[0.15/0.08/0.2em]` | 17 | `landing/components/EyebrowChip.tsx:27` | — |
| `tracking-[0.25/0.06/0.1/0.04/0.14/0.22em]` | 11 | `landing/components/SectionHeader.tsx:31` | 全是复制粘贴漂移 |

#### 行高（62 处）

| 值 | 数量 | 说明 |
|---|---:|---|
| `leading-snug`(1.375) | 35 | 删后自动拿到字族默认 1.25，双行标题更紧凑成组。⚠️ line-clamp 可视高度会收缩 |
| `leading-tight`(1.25) | 25 | **值恰好等于新 sans 默认 → 零视觉变化**，唯一「零风险纯清理」批。⚠️ 例外 6 处挂在 `font-serif`/`font-display` 上会变松 |
| `leading-[1.4]` | 2 | 与 `leading-snug` 用途重合 |

#### 阴影（38 处）

| 值 | 数量 | 代表位置 | 说明 |
|---|---:|---|---|
| `shadow-sm` 装饰 | 14 | `chat/Bubbles.tsx:78` · `chat/Composer.tsx:202` | 逐处核查：全部已有 border 或实心底色 |
| `shadow-[0_4px_16px_rgba(0,0,0,.04)]` | 9 | `help/pages/HelpCenterPage.tsx:104` | **每处都已有 `hover:border-foreground/40`**，阴影纯冗余 |
| `rgba(15,23,42,*)` slate-900 后门 | 7 | `landing/.../SearchMatrixMock.tsx:30` | 违反「禁默认色板」 |
| `rgba(0,0,0,.06)` hover | 2 | `peer-review/pages/SubmissionLandingPage.tsx:21/36` | 已有 `hover:border-brand-red` |
| `shadow-md` 静态面板 | 1 | `prism/.../PrismWorkspaceV2.tsx:594` | 已有 `border-border-strong` |
| `rgba(204,34,34,.4)` / `rgba(42,122,42,.22)` | 2 | `FavoriteBurst.tsx:130` · `StageFlyLayer.tsx:76` | 旧品牌色十进制写法，已过期 |
| `shadow-none`（**死码**） | 4 | `settings/.../billing-panels.tsx:117` | Input 本就无 shadow |
| `drop-shadow-lg` | 1 | `mobile/components/PaperFeedCard.tsx:77` | filter 类，纯装饰 |
| 海报 `#1111111f` | 2 | `share/SharePoster.tsx:59` | 已有描边，删后分层不丢 |

#### 过时的 `.pen` 注释（67 处）

零渲染风险，但是**过时文档**：每一处都写着「`.pen` `frameId` 用的是 #XXX」，而 `.pen` 已作废。留着会让后续开发照旧值改代码。

| 代表位置 | 内容 |
|---|---|
| `peer-review/.../StepIndicator.tsx:12` | 记录整套旧状态色 `#E5E5E5/#FFF5F5/#CC2222/#AAAAAA` |
| `shared/components/UserMenuContent.tsx:41` | `12 圆角 / 1px #EEEEEE 边 / shadow 0/8/24 #00000014` |
| `sidebar/SidebarItem.tsx:25` | `h-32 + 13/700 #111` / `h-30 + 13/normal #444` |
| `prism/components/PrismPreview.tsx:84` | `.pen prism-editor: bg=#111 / gutter=#0a0a0a` |
| `journals/.../JournalSearchResults.tsx:362` | `.pen 'YpqvW'(rounded-8 border)` |
| `browser/.../JournalDetailPane.tsx:124` | `.pen 'L3sjEN'(rounded-10)` |
| `globals.css:27-37` | 「全部值来自 scholay.pen」「修改 token 需同步更新 .pen 设计稿」 |
| `frontend-user/CLAUDE.md §5` | **整张 token 表**（颜色/圆角/字号值全部过时） |

#### 死 token（4 个）

| token | 位置 | 证据 |
|---|---|---|
| `--text-badge`(9px) | `globals.css:291` | tsx/ts **0 使用** |
| `--spacing-17`(68px) | `globals.css:310` | 全项目 **0 引用**，注释自陈「预留」 |
| `--leading-prose`(1.65) | `globals.css:300` | `leading-prose` 类 **0 引用** |
| `--leading-snug-x`(1.4) | `globals.css:301` | `leading-snug-x` 类 **0 引用** |

---

### 3.3 NEW_TOKEN — 需新增 token 承接（≈ 400 处）

| 新增 | 承接 | 位置 | risk |
|---|---:|---|---|
| `--font-serif`（Noto Serif SC 自托管） | **60 处** `font-serif` 现落到 Georgia/Times | `peer-review-record/*`(42) · `prism/*`(6) · `claw/*`(2) · `share/*`(3) | 🔴 high |
| `shared/ui/card.tsx` | **253 处**手拼卡片容器（7 种组合） | `landing/.../SearchMatrixMock.tsx:29` · `claw/.../TemplateCards.tsx:153` | 🔴 high |
| `shared/ui/select.tsx`（Radix） | **38 处**裸 `<select>`（13 个在 admin） | `admin/pages/FeatureToolsPage.tsx:210` | 🟡 med |
| `shared/ui/textarea.tsx` | **33 处**裸 `<textarea>`（抽样 5 处得 5 套类串） | `peer-review/.../LetterEditorStep.tsx:64` | 🟡 med |
| cva 迁移（21 个原子） | **cva 采用率 2/23** —— 仅 button、badge | `shared/ui/{input,tabs,switch,checkbox,dialog,dropdown-menu}.tsx` | 🔴 high |
| `--tracking-code` / `--tracking-brand` | 8 + 4 处 | `auth/components/LoginForm.tsx:160` · `BrandLogo.tsx:43` | 🟢 low |
| `--container-max`/`--container-reading` | 12 处 arbitrary + 41 处 `max-w-4xl~7xl`（**11 套口径**） | `peer-review/pages/RecordDetailPage.tsx:123` | 🟢 low |
| `--panel-w-*` / `--dialog-w-*` | 31 处（**14 个不同值**） | `library/.../RowActionsMenu.tsx:169` | 🟢 low |
| `--rule-accent`(3px) | 22 处 | `peer-review/.../ReviewerDetailPanel.tsx:267` | 🟢 low |
| `--shadow-overlay` / `--shadow-raised` | 40 处 | 见 §2.10 | 🟡 med |
| `--radius-xl`/`--radius-2xl`(登记既有 12/16) | 27 处 | `chat/Composer.tsx:202` | 🟢 none |
| `theme-bridge.ts` | mermaid + chartTheme + posterPalette | 见 §2.14 | 🟡 med |

---

### 3.4 GAP — Figma 未覆盖，自行推导（≈ 1,000 处）

| 场景 | 数量 | 推导结论 | risk |
|---|---:|---|---|
| **暗色态** 18 个覆写 + 7 个缺口 | 25 | 玄墨 12 档亮暗镜像（§2.2） | 🔴 high |
| **状态色** Badge 3 变体 + 47 处手搓状态芯片 | 50 | 同色阶不同档 + 强制软底；「进行中」剥离色相（§2.2） | 🔴 high |
| **z-index** 全部 | 68 | 11 档语义层（§2.12） | 🔴 high |
| **focus ring** 8 种写法 | 49 | 单一 `focus-ring` @utility，45% alpha（§2.11） | 🔴 high |
| **移动端** 30 处 10/11px + 14 处 arbitrary | 44 | **不另开字号档**，统一上浮 12；固定 line-clamp 改容器驱动 | 🔴 high |
| **动效** duration 18 值 + spring 4 | 29 | 4 档 duration + 3 ease + 2 spring（§2.13） | 🟢 low |
| **图表配色** PIE_PALETTE + palette.ts | 16 | `--chart-1..8`（§2.2） | 🟡 med |
| **分类调色板** 五份重复 | 26 | `--cat-1..8`（§2.2） | 🟡 med |
| **科研绘图** compose.ts 泄漏 Tailwind 灰阶 | 49 | 独立 `SCI_FIGURE_PALETTE`，中性灰推导到玄墨；**背景保持纯白**（期刊投稿不能带米白底） | 🟡 med |
| **弹层限高** 17 个值 | 35 | `--overlay-max-h` 85dvh / sheet 92dvh；**强制 dvh** | 🟡 med |
| **半档间距** gap-1.5 等 | ~750 | **待决策**（§6-Q8） | 🔴 high |
| **display 字号** 32~64px | 7 | `--text-display-36/56` | 🟡 med |
| **font-mono** | 91 | 维持现值，标记为前端自持 | 🟢 none |
| **恒暗段 ring-white/*** | 5 | `--ring-on-dark` 2 档 | 🟢 low |

---

### 3.5 KEEP — 合法例外（≈ 2,050 处）

| 场景 | 数量 | 理由 | needsCentralizing |
|---|---:|---|---|
| bioicons CC0 图标包 SVG hex | 1,028 | 自动生成的第三方 CC0 素材，会导出成独立可下载科研配图，脱离页面 CSS 上下文 | ❌ |
| `rounded-pill` | 284 | **唯一与 Figma 完全对齐的档位** | ❌ |
| 手绘科研图标包配色 | 142 | 导出为独立 SVG 必须字面值 | ✅ 抽 `SCI_FIGURE_PALETTE`（`#2f8f4e` 重复 17 处） |
| `font-bold` on serif/display/mono | 87 | §2.3 这两个衬线字族规范内有 700 | ❌ |
| 分享海报硬编码 hex | 71 | html-to-image 离屏克隆丢 CSS 变量 | ✅ 抽 `posterPalette` + CI 不变量测试 |
| `leading-none` | 61 | 单行 + 固定高度容器，行盒必须等于字号 | ❌ |
| 动态计算 `style={{}}` | 59 | virtual 偏移 / 进度条 % / resizable / 测量定位 / hash 色 | ❌ |
| `--prism-editor-*` | 22 | CodeMirror 主题必须具体值，**已 100% var() 驱动，全站样板** | ✅ 下沉到 `[data-scope="prism-editor"]` |
| 分享海报字号簇 | 26 | 固定 390px 导出画布，构图参数非 UI 档位 | ✅ 抽 `poster-scale` 常量 |
| 第三方 Provider logo 官方色 | 20 | 外部公司注册商标色，受各家 brand guidelines 约束 | ❌ 已集中单文件 |
| CSS 动态值 `env()` / `dvh` / `calc()` | 16 | 设备能力查询，无法 token 化 | ✅ 统一带 fallback 写法 |
| `!important` | 15 | 11 处注入微信跨域 iframe + 4 处 reduced-motion 兜底 | ✅ iframe CSS 串应由 token 生成 |
| macOS 红绿灯装饰点 | 6 | Apple 系统确切取值，改色会失去「应用窗口」识别 | ✅ 提 `MacWindowChrome` |
| 装饰光晕 `size-[34~38rem]` | 5 | 超出 Tailwind 默认档（max size-96=24rem），已集中一数组 | ❌ |
| `mermaid fontFamily:'inherit'` / katex | 2 | 自动继承，无需适配 | ❌ |

---

## 四、高风险项专章

### 4.1 🔴 R1 — 13px → 14px 导致的容器溢出（**最高优先级**）

判定式：`溢出 = 字号 × 有效 line-height > 容器高`。有 `leading-none` 时 line box = 字号本身；无 leading 类时继承 body 的 1.5。

#### 清单 A — 真会撑破，**必须同 PR 改容器**（14 处，已逐条实测确认）

条件：`h-4`(16px) + 10~11px 文字 + **无 `leading-none`**。现在 `10×1.5=15` 刚好塞进 16；改 12 后 `12×1.5=18` → **溢出 2px**。

| 文件 | 行 | 片段 |
|---|---:|---|
| `features/library/components/paper-row/MetaRow.tsx` | 58 | `h-4 px-1.5 rounded-sm bg-brand-amber/10 text-[10px]` JCR 分区 |
| `features/library/components/paper-row/MetaRow.tsx` | 63 | `h-4 … bg-surface-2 border text-[10px]` IF |
| `features/library/components/paper-row/MetaRow.tsx` | 68 | `h-4 … bg-brand-red/8 text-[10px]` 中科院 |
| `features/library/components/paper-row/MetaRow.tsx` | 73 | `h-4 … bg-foreground text-[10px]` CCF |
| `shared/components/NotificationBell.tsx` | 50 | `h-4 min-w-4 … text-2xs` 未读红点 |
| `shared/components/NotificationBell.tsx` | 114 | `h-4 min-w-4 … text-2xs` |
| `shared/components/SourceBadge.tsx` | 35 | `sm: 'h-4 px-1 text-2xs'` |
| `features/search/components/StagingTabs.tsx` | 96 | `min-w-4 h-4 px-1 rounded-pill text-2xs` |
| `features/search/components/EmptyMatrixPreview.tsx` | 230 | `h-4 min-w-4 … text-2xs` |
| `shared/components/ComingSoonView.tsx` | 77 | `px-1.5 h-4 rounded-pill bg-brand-amber text-2xs` |
| `shared/components/chat/LibraryReferencePicker.tsx` | 361 | `h-4 shrink-0 … text-2xs` |
| `features/library/components/paper-row/LibraryPaperRow.tsx` | 378 | `h-4 px-1.5 … text-2xs` |
| `features/settings/components/billing-panels.tsx` | 487 | `flex h-4 items-center text-2xs` |
| `features/admin/pages/AnalyticsPage.tsx` | 443 | `text-2xs px-1.5 h-4` |

**修法**：容器抬到 `h-5`(20px) 或按 Figma §4.2 抬到 `h-control-xs`(24px)。

#### 清单 B — 零余量贴边，**影响面最大**

`shared/ui/badge.tsx:10` 基座是 `h-[18px] text-2xs`（无 leading）。现在 `10×1.5=15` 装 18 有余；改 12 后 `12×1.5=18` **正好等于 18**，任何 descender / 中文都贴死上下边。

**影响 64 个 `<Badge>` 调用点**，外加 5 处复刻同款 `h-[18px]` chip：
`PaperResultCard/DefaultCard.tsx:95` · `chat/MinicodJournalCards.tsx:32` · `chat/MinicodAuthorCards.tsx:21/53` · `admin/components/SidebarBadges.tsx:25`

**修法**：按 §4.2 抬到 `h-[23px]` 或 `h-6`，同时字号 10→12。
另：`chat/LibraryReferencePicker.tsx:341` 的 `text-[8px]` + `size-4`(16px) 圆形计数，8→12 是 +50%，须抬到 `size-5`(20px)。

#### 清单 C — 不会破但观感变胀

`h-5`~`h-15` 全部安全（`14×1.5=21 ≤ 28`），但按钮内边距被吃掉：`h-7` 按钮里 21px 行盒上下各剩 3.5px。
Figma 按钮规格是 h42 + padding 12/16，现行 `shared/ui/button.tsx:25-27` 的 `sm=h-7 / default=h-8 / lg=h-10` 建议整体上抬一档到 `h-8 / h-9 / h-11`。

**用量**：h-6:78 / h-7:147 / h-8:112 / h-9:112 / h-10:71 / h-11:26 / h-12:40 / h-13:10 / h-14:31 / h-15:2 / h-tab:5。
→ **真正需要动的只有清单 A 的 14 处 + 清单 B 的 badge 基座**，比预想的少得多。

#### 验证方法

1. **构建期**：`npm run build`（docker 比本地严格）+ `tsc -b`。
2. **自动化**：写一个 Playwright/Vitest+jsdom 断言脚本，对清单 A/B 的 19 个组件渲染后断言 `scrollHeight <= clientHeight`。
3. **人工**：全量视觉回归，重点看 h-4 徽章、按钮内边距、移动端一屏卡片数、line-clamp 标题行数。
4. **密度实测基线**（`LibraryPaperRow`，900px 视口）：现状 10.2 行 → 标题降 14 后 9.9 行（-3.6%）/ 标题抬 16 后 9.3 行（**-7% 最坏**）。

#### ⚠️ 一条反直觉结论

**密度损失完全不在表格和侧边栏。** admin `DataTable.tsx:250` 的 td 是 `h-10` 固定、th 是 `h-9`；`SidebarItem.tsx:57-59` 是 h-10/h-8/h-7 固定；`h-tab`(42) 固定 —— **行高度写死，一屏行数一行不少，只是留白变窄**。所以「14px 后表格一屏少几行」这个担心不成立。真正掉密度的是**内容驱动区**（论文卡片、聊天流）。

#### ⚠️ 聊天正文需单独拍板

`shared/components/chat/MarkdownRenderer.tsx:219` 默认 `text-sm`(12) + `leading-[1.7]` = 20.4px/行，智能搜索 / 智能助手 / 审稿报告 / 情报详情**全走它**。按机械映射 `text-sm→12` 它不变；但按 Figma「正文=14」该升到 14 → 23.8px/行，**纵向 +16.7%**，长会话滚动距离直接多出六分之一。
**建议：聊天 prose 保持 12，并在 token 注释里写明这是有意偏离**（它是密度敏感的长文流，不是 Figma 建模过的卡片主文）。

---

### 4.2 🔴 R2 — `rounded-lg` 语义双载（顺序错了当场翻车）

`rounded-lg` 同时是「容器 8」(98 处) 和「32~36px 图标按钮 8」(27 处)。

**如果直接把 `--radius-lg` 从 8 提到 16**：
- `topnav/UserSection.tsx:46` 通知铃铛（32×32）→ radius = 高度一半 = **准圆形**
- `chat/Composer.tsx:250/268` 发送键（size-9）→ 同上
- `topnav/MenuCarousel.tsx:306` 选中态 tab → 同上

**必须先把这 27 处改写成新的 `rounded-sm`(8)，再动 `--radius-lg` 的值。顺序反了就是线上事故。**

**验证**：改完后 grep `rounded-lg` 确认剩余全部是容器语义；截图对比 topnav / composer / 移动端 tab。

---

### 4.3 🔴 R3 — `--background` 一拆为二（工作量最大）

**518 处 `bg-background`** 必须逐处判断是「外层页面底」还是「内层卡片底」。一刀切改米白 → 所有卡片失去层次。

**分流启发式**：
- 有 `border` + `p-4` 以上 padding + 是 `<section>`/顶层 div → **内层白卡** `bg-surface-card`
- 是路由页面根容器 / Shell / 全屏面板 → **外层米白** `bg-background`
- Dialog / Sheet / Popover 内容 → **内层白卡**（浮层需要与 backdrop 分离）

**连带点**（类名 grep 查不到）：
- `share/ShareSheet.tsx:355` `toPng({ backgroundColor:'#ffffff' })` → 必须改 `#F6F4EE`，否则导出图边缘出白边
- `ring-offset-background`（7 处）→ 落在米白页面上的控件 offset 会画白圈成伪影
- `ring-background` 挖空描边（`LibraryReferencePicker.tsx:341`）→ 在纯白卡内会画米白圈
- `figure/compose.ts:170` `fill="#ffffff"` → **保持纯白**（科研图导出到期刊投稿，不能带米白底）

---

### 4.4 🔴 R4 — `#F1EADA` ≠ `#F6F4EE`（米白改造最容易踩的坑）

`#F1EADA` 长得很像新页面米白，但**角色完全不同**：它是「琥珀软底高亮块」（提示卡 / 标签胶囊），`#F6F4EE` 是页面基底。

**若图省事合并**，以下 6 处高亮块会与页面底色融成一片、彻底看不见：
`tools/pages/mobile/MobileToolsHomePage.tsx:76` · `tools/pages/mobile/MobilePcOnlyPage.tsx:94` · `library/pages/SharedReceivePage.tsx:224/316` · `share/SharePoster.tsx:77` · `share/CollectionSharePoster.tsx:65`

**正确做法**：映射到 `--amber-soft-bg #E5DFCE`（琥珀 amber-11，在米白底上仍有可见对比）。
顺带：`--prism-badge-bg #F0E8D8` 与 `#F1EADA` 视觉差 <2% 却是两个独立值，一并收口。

---

### 4.5 🔴 R5 — 字重 1,030 处压到 500（层级塌陷）

`font-bold`(686) + `font-semibold`(344) → `font-medium`。合并后 `font-medium` 一档承载 **1,209 处**，与 `font-normal`(31) 形成**仅存的两级对比**。

**危险点**：当前 sidebar 段标、admin 表头、审稿字段标签、所有卡片标题都是 `font-bold` + `text-faint` —— 靠 700 vs 400 撑层级。压到 500 vs 400 后对比度骤降。

**必须与字号 + 颜色同批上线**，否则中间态层级全塌。
**验证**：先只改 `shared/ui/` + `shared/components/` 原子层，截图全站看整体效果，确认层级仍可读再推 features。

---

### 4.6 🔴 R6 — z-50 拆档（拆错会有可见回归）

20 处 `z-50` 承载 8 类语义。拆档原则：**遮罩 < 内容**；**信息型浮层（popover/tooltip）> 容器型（modal）**，否则 Dialog 内的下拉会被裁。

**验证清单**（每一条都是当前靠运气工作的）：
- Dialog 内的 `<DropdownMenu>` 能否正常展开且不被裁
- Dialog 内按钮的 Tooltip 能否盖住 Dialog
- 移动 sheet 打开时 Dialog 能否盖住它（当前**不能**，是隐形契约）
- `SearchAutocomplete` 下拉是否仍在 TopNav 之上

---

### 4.7 🔴 R7 — 品牌色改深后状态反馈失效

6 处用品牌色染 ring（`ring-brand-amber/20 · /35` · `ring-brand-green/35` · `ring-brand-red/40`）。
换色阶后：`brand-red #CC2222→#882828`、`brand-green #2A7A2A→#2F4D29` **明显加深降饱和**，`brand-amber #D4A017→#E5A800` 提亮 —— 20%~40% alpha 的环在米白底上会变得**几乎不可见**。

同理受影响：47 处 `bg-brand-*/8~20` 手搓状态芯片、`Step4Rail.tsx:46` 的 `bg-[#E9F7EC]`、`quota-toast` 的 `bg-[#0066FF]/10`。

**验证**：对每个状态芯片计算新底色下的对比度，要求文字 ≥4.5:1、边界 ≥3:1。

---

### 4.8 🔴 R8 — cva 采用率 2/23 + 缺 Card 原子

**91% 的原子绕开了 cva**（CLAUDE.md §2 把 cva 列为必用包）。后果：Input/Tabs/Switch/Checkbox 没有 size 维度可扩展，业务侧只能靠 className 覆盖 —— `MobileAuthSheet.tsx:64` / `MobileAuthPage.tsx:70` 用 `[&_input]:h-12 [&_input]:rounded-xl [&_input]:text-base` 后代选择器强改。**换真源时这类覆盖既搜不到也算不清影响面。**

**缺 Card 原子 → 253 处手拼卡片**。Figma §4.4 给了完整规格（radius 16 / bg #FFFFFF / padding 16 / gap 8），没有 Card 原子就得改 253 个点。

**裸 `<button>` 458 : `<Button>` 306** —— 60% 的按钮绕过原子，是「改 Button 原子改不动全站」的根本原因。

---

### 4.9 🔴 R9 — 半档间距 ~750 处（需先决策）

`gap-1.5`(6px) **307 处已写进 `shared/ui/{dialog,sheet,dropdown-menu}.tsx` 三个原子的基线**，是既成事实而非散落误用。叠加 13→14px 上浮，若同时 6→8，全站纵向密度会明显变松。**在得到设计师答复前不要动这 307 处。**

---

### 4.10 🔴 R10 — 移动端 30 处字号上浮

`features/mobile` 全部字号 58 处，其中 **30 处（52%）**用 11px/10px。移动端信息密度本就最紧张，10→12 是 +20% 行高，直接冲击三处固定裁剪：
- `PaperFeedCard` 的 `line-clamp-[8]`
- `NewsCard` 的 `line-clamp-[6]`
- `VerticalSwipeFeed` 相关的 `line-clamp-[12]`

以及 `MobileBottomNav` 的 tab 文字 10→12 会让 h-16 底栏变挤。

**推导方案**：**不另开移动端字号档**（另开等于承认规范失败）。
(a) 30 处统一上浮 `text-12`；(b) 三处固定 line-clamp 改 `flex-1 + overflow-hidden` 由容器决定行数；(c) `MobileBottomNav` 改图标 + 更小 gap 而非缩字号。

---

### 4.11 🔴 R11 — 海报组件是 token 体系的完整影子副本

`SharePoster.tsx` + `CollectionSharePoster.tsx` 里有：71 个 hex、26 个字号、4 个圆角、4 处 tracking、2 处 shadow —— **一整套平行设计系统**，且**已发生漂移**（`#CD2323` ≠ token `#CC2222`）。

**新色阶上线后海报会成为唯一停留在旧品牌色的孤岛，而用户会把它分享出去。**

**修法**：抽 `shared/components/share/poster-theme.ts` 单一常量 + `tests/` 不变量测试（断言 `posterPalette.brandRed === tokenValue('--brand-red')`）。

---

### 4.12 🔴 R12 — 重复组件（改一份漏一份）

| 组 | 位置 A | 位置 B |
|---|---|---|
| ChiefVerdictPanel | `features/peer-review/components/record/` | `shared/components/peer-review-record/` |
| EditorialCheckPanel | 同上 | 同上 |
| ReviewerDetailPanel | 同上（`w-[3px]` 8 处里 4 处是复制品） | 同上 |
| StatusGrid | 同上（ring 在 160/266/305 对 169/275/314） | 同上 |
| MethodologyPhaseCard | 同上 | 同上 |
| ConfirmDialog | `features/admin/components/` | `shared/components/` |
| DimensionSettingsDialog | `features/search/components/` | `features/search/components/dimension-settings/` |

这 7 组在本次台账里贡献了 tracking 22 处、`leading-relaxed` 36 处、`font-serif` 42 处、ring 6 处、grid-cols 2 处。
**建议在开工前先消重（B0 批），能省一半改动量**，且避免视觉分叉。

---

### 4.13 ⚠️ 工具链陷阱（会静默漏改）

**macOS 自带 BSD grep 把两个文件当二进制跳过**（`file` 命令报 `data`，含非 UTF-8 字节）：
- `features/prism/components/StructEditor.tsx`（含 7 处 `font-bold`、3 处圆角）
- `features/admin/pages/OAuthConfigPage.tsx`（含 3 处 `rounded-md`、1 处 `rounded-sm`、多处 `font-bold`）

**且 BSD grep 的 `-o` 每行只输出首个匹配**，「一行两个类名」的场景计数偏低。

**→ codemod 必须用 `rg --text` 或 Node/Python AST 脚本，禁用系统 grep。**

---

## 五、分批排期

分批原则：**改动独立性优先，风险递增**。每批必须能独立构建 + 独立视觉验证 + 独立回滚。

---

### B0 · 前置清理（**零视觉变化**，为后续批次铺路）

| 项 | 内容 |
|---|---|
| **改什么** | ① `@theme` 加 `--text-*: initial` + `--radius-*: initial` 堵死逃逸口<br>② 删 4 个死 token（`--text-badge` / `--spacing-17` / `--leading-prose` / `--leading-snug-x`）<br>③ 消除 7 组重复组件（peer-review 5 组 + ConfirmDialog + DimensionSettingsDialog）<br>④ 修 `h-12.5`（Tailwind 不存在的档）<br>⑤ 建 `theme-bridge.ts` 骨架 + `poster-theme.ts` + CI 不变量测试<br>⑥ 重写 `globals.css` 头注释 + `CLAUDE.md §5` 的真源口径（保留禁令，只换表） |
| **文件数** | ≈ 25 |
| **怎么验证** | 加 `initial` 后 130 处逃逸类**编译不出**（圆角归零、字号 fallback），全站截图定位这 151 处 —— **这是比 grep 更可靠的定位手段**。修完后视觉应与改前完全一致 |
| **回滚成本** | **极低** —— 单 commit revert |

---

### B1 · 等值改名（**零视觉变化**，验证新 token 管线）

| 项 | 内容 |
|---|---|
| **改什么** | 圆角：`rounded-full`→`pill`(55) · `2xl`→`lg`(18) · `xl`→`md`(12) · `rounded-sm`→`xs`(≈295) · 裸`rounded`→`xs`(45) · `rounded-r/t-/tl-` 方向类(12)<br>字号：`text-md`→`14`(79) · `text-lg`→`16`(69) · `text-xl`→`20`(43) · `text-2xl`→`24`(38) · `text-[12px]`(4)<br>行高：`leading-[1.7]`→`leading-paragraph`(22) · `leading-tight` 删除(19 处 sans，值恰好相等)<br>CodeMirror：`LatexEditor.tsx:20-21` 的 `fontSize`/`fontFamily`/`lineHeight` 改 `var()` |
| **文件数** | ≈ 240 |
| **怎么验证** | **像素级 diff 应为零**。跑 `tsc -b` + `vite build` + 全站截图对比。任何非零 diff 都是 bug |
| **回滚成本** | **低** —— 纯机械替换，可逐类回滚 |

---

### B2 · 删除批（视觉变化小且方向可控）

| 项 | 内容 |
|---|---|
| **改什么** | tracking DELETE **162 处**（先做 `shared/ui` + `shared/components` 的 6 处原子层，看全站效果再推 features）<br>leading DELETE **62 处**（`leading-snug` 35 + `leading-[1.4]` 2 + `leading-tight` 剩余 6 处衬线补 `leading-display-tight`）<br>shadow DELETE **38 处**<br>`.pen` 过时注释重写 **67 处** |
| **文件数** | ≈ 150 |
| **怎么验证** | tracking 删除后段标变紧凑（预期且符合 Figma）；`leading-snug` 删除后 line-clamp 可视高度收缩，检查 76 处 clamp 是否仍正确断行（已验证全站 **0 处**把 clamp 行数与容器高硬绑，不会截断错行）；shadow 删除后重点看 help/landing 卡片 hover（11 处已有 border 变色兜底） |
| **回滚成本** | **低** |

---

### B3 · 原子层补齐（**结构性，为后续批次提供收口点**）

| 项 | 内容 |
|---|---|
| **改什么** | 新建 `shared/ui/card.tsx`（Card/Header/Content/Footer）、`select.tsx`（Radix）、`textarea.tsx`<br>21 个原子迁 cva，导出 `xxxVariants`<br>Button size 档改 `xs\|sm\|md\|lg` + 独立 `shape='icon'`；统一「中档」命名为 `md`（现有 `default`/`md`/`base` 三套）<br>Tabs 加 `variant('underline'\|'segment'\|'pill')`，收编 6 套重复实现<br>裸 `<button>` 458 → `<Button>`（按语义分流：纯文字链接 / 整行可点区域保留裸元素）<br>裸 `<input>` 90 / `<select>` 38 / `<textarea>` 33 → 原子<br>`dialog-chrome.tsx:213/223/229` 3 套手拼 button variant → `buttonVariants()` |
| **文件数** | ≈ 180 |
| **怎么验证** | 每个原子迁移后跑该原子的全部消费方截图；重点看 admin（38 处 select、13 个文件的裸 input） |
| **回滚成本** | **中** —— 结构改动，但每个原子可独立回滚 |

---

### B4 · 颜色真源切换

| 项 | 内容 |
|---|---|
| **改什么** | 四色阶 primitives + 语义 token 全量写入 `globals.css`<br>**`--background` 拆二**（518 处逐处判断 ← 本批工作量核心）<br>品牌三色改值；`--foreground` 改 `#1F1F23`<br>border 5 档 → 4 容器档 + 2 控件族（alpha 化）<br>海报 71 hex → `posterPalette`；`toPng backgroundColor` 改米白<br>图表 `PIE_PALETTE` + `palette.ts` → `--chart-1..8`；删 2 处 tooltip boxShadow<br>五份分类色板 → `--cat-1..8`<br>`#F1EADA` + `--prism-badge-bg` → `--amber-soft-bg`<br>`--landing-dark-*` / `--prism-editor-*` 3 个灰底改玄墨档<br>sonner 关 `richColors` |
| **文件数** | ≈ 200 |
| **怎么验证** | ① 对比度自动化：所有 `text-*` on `bg-*` 组合断言 ≥4.5:1；② 逐路由截图，重点看卡片层次是否还在；③ 海报导出实测（生成 PNG 肉眼比对）；④ 科研图导出实测（背景必须仍是纯白） |
| **回滚成本** | **中高** —— `--background` 拆二是逐处人工判断，回滚需整批 revert |

---

### B5 · 圆角切值

| 项 | 内容 |
|---|---|
| **改什么** | ① **先**拆 `rounded-lg` 双载：27 处非容器 → `rounded-sm`（**顺序不可颠倒，见 R2**）<br>② 切值：`--radius-sm` 4→8 · `--radius-md` 6→12 · `--radius-lg` 8→16<br>③ 人工二分 `rounded-md` 的 363 处容器拆 16/12（脚本预标注：有 `<section>` 或 p-4 以上 padding → 16）<br>④ 83 处菜单项拆 8 / 胶囊<br>⑤ **最后**动 `shared/ui/button.tsx:7` 改胶囊（影响 306 处 `<Button>`，**单独 PR、单独回归**；ghost/link/icon 变体不胶囊化，否则与头像撞形）<br>⑥ 主搜索框 5 处（`SearchAutocomplete.tsx:192/194/195/262` + `AutocompleteSections.tsx:39`）**必须同批**改 16 —— 这是唯一有「跨元素形状契约」的地方，漏一处展开时上下半边圆角就对不上 |
| **文件数** | ≈ 300 |
| **怎么验证** | 每个子步骤独立截图；重点看 topnav 图标钮、composer 发送键、移动端 tab、搜索框展开态、骨架屏 vs 真实卡片形状一致性（`MobileAssetsCard.tsx:40` vs `:54`） |
| **回滚成本** | **中** —— 但 ①→②→⑤ 有严格顺序，中途回滚需回到批次起点 |

---

### B6 · 字号 + 字重（🔴 **最大风险批**）

| 项 | 内容 |
|---|---|
| **改什么** | ① `text-2xs`(776) + `text-xs`(923) → `text-12`，**与清单 A 的 14 处容器高度、清单 B 的 badge 基座同 PR**<br>② `text-base`(171) → `text-14` + `globals.css:381` body font-size<br>③ 行高绑字族（`--leading-sans` 挂 body 等），`leading-relaxed`(191) → `leading-paragraph`<br>④ 字重 1,030 处 700/600 → 500，**先 `shared/ui` + `shared/components` 原子层，再 features**<br>⑤ 按钮三档高度上抬（`h-7/8/10` → `h-8/9/11`）<br>⑥ 移动端 30 处 + 3 处固定 line-clamp 改容器驱动<br>⑦ 补 `--font-serif`（Noto Serif SC 子集化自托管）+ Playfair 400/500 |
| **文件数** | ≈ 400 |
| **怎么验证** | ① 清单 A/B 的 19 个组件写 `scrollHeight <= clientHeight` 断言脚本；② 全量视觉回归，重点：h-4 徽章、按钮内边距、移动端一屏卡片数、line-clamp 行数、聊天流滚动距离；③ 密度基线对比（LibraryPaperRow 900px 视口应 ≥9.3 行）；④ 字体加载：确认 Noto Serif SC 子集 ≤200KB 且 `font-display:swap` 无 FOUT |
| **回滚成本** | 🔴 **高** —— 改动面最大、且字号/字重/行高/容器四者耦合，无法部分回滚 |

---

### B7 · GAP 补齐（可与 B4~B6 并行）

| 项 | 内容 |
|---|---|
| **改什么** | z-index 11 档拆分（68 处）<br>focus-ring 统一（49 处，含 `focus:` → `focus-visible:`）<br>状态色 `--status-*` 落地 + Badge 3 变体 + **47 处手搓状态芯片迁移到 `<Badge>`**（加 `variant="running"`）<br>motion token（TS + CSS 双侧，29 处）<br>elevation 2 档落地（40 处）<br>暗色态 18→30 个覆写（**取决于 Q6 决策**）<br>`mermaidTheme` / `chartTheme` 落地 |
| **文件数** | ≈ 120 |
| **怎么验证** | z-index：R6 的 4 条契约清单逐条手测；focus-ring：键盘 Tab 走查全站，确认鼠标点击不出环；状态色：对比度断言；motion：CSS 与 framer 混用处（如 sheet 进出场）确认同步 |
| **回滚成本** | **低~中** —— 各子项彼此独立，可单独回滚 |

---

### B8 · CI 护栏（收尾，防止回潮）

| 项 | 内容 |
|---|---|
| **改什么** | ESLint / 自定义脚本禁止：<br>① Tailwind 默认色板**类名 + 已知 rgb 三元组 + 官方 hex 值表**（现状类名层 0 命中很干净，但 `rgba(15,23,42)` 7 处 + hex 形态 12 处从后门溜进来）<br>② arbitrary `text-[Npx]` / `rounded-[Npx]` / `tracking-[...]`（除注释豁免）<br>③ 静态 `style={{}}` 魔法数字（保留动态计算白名单）<br>④ `focus:ring`（强制 `focus-visible:`）<br>⑤ `theme-bridge` 不变量测试进 CI |
| **文件数** | ≈ 5 |
| **怎么验证** | 故意提交一个 `text-[13px]` 看 CI 是否 fail |
| **回滚成本** | **极低** |

---

### 排期总览

```
B0 前置清理      ─┐ 零视觉，铺路
B1 等值改名      ─┤ 零视觉，验证管线
B2 删除批        ─┘ 小变化，方向可控
B3 原子层补齐    ─── 结构性，提供收口点
B4 颜色真源      ─┐
B5 圆角切值      ─┤ 三大观感变化
B6 字号+字重     ─┘ ← 最大风险，必须最后
B7 GAP 补齐      ─── 可与 B4~B6 并行
B8 CI 护栏       ─── 收尾
```

**关键顺序约束**：
- B0 的 `initial` 必须在 B1 之前（否则改名后旧类静默 fallback）
- B3 必须在 B5/B6 之前（Card/Button/Input 原子是圆角与字号的收口点）
- B5 内部 `拆 rounded-lg 双载` → `切 --radius-lg` → `Button 改胶囊` 顺序不可颠倒
- B6 的容器高度改动必须与字号改动**同 PR**

---

## 六、遗留决策

以下问题**必须由用户或设计师拍板**，否则相应批次无法开工。

### Q1 · 🔴 Google Sans 授权（阻断 B6）

Figma 设计稿中 Google Sans 承担 Headline/Body 主力（27 处），但它是 Google 品牌专有字体，**不在 Google Fonts 公开库，不允许第三方产品使用或自托管**。

同时设计说明文字写「正文/次级文字等字体使用**原生系统字体**(苹方/MS雅黑)」—— 与设计稿实际大量使用 Google Sans **自相矛盾**（规范文档 §2.1 已标注）。

**本报告按决策 A 处理**（Google Sans 打头 + 系统栈兜底，不做 @font-face），但需设计师最终裁定：以设计稿为准还是以说明文字为准？若最终要自托管开源替身，选 Plus Jakarta Sans（设计稿本身出现过）还是保持 Inter？

---

### Q2 · 🔴 状态色具体值（阻断 B7）

设计说明明确要求「与成功/失败/进行中等状态区分开」，但 **Figma §1.4 未给出任何状态色定义**。

本报告推导方案：**不另开色相，同色阶取不同档 + 强制软底 chip 形态区分**，「进行中」用中性玄墨 + 脉冲动效彻底剥离色相。

**需确认**：设计师本意是这样，还是要另开蓝/紫等新色相？（后者与「四色阶 + 整体降饱和」的立意冲突。）

---

### Q3 · 🔴 noise 纸张质感能否落地（影响 B4）

设计师原话：「**确认一下 Figma 中的 noise 效果可否落地**」—— 这是**待验证项，不是既定规范**。

Figma 的 NOISE 是 2024 后新增原生效果，Web 端需用 SVG `feTurbulence` 或平铺 PNG 噪点图重建。
**需决策**：做成可开关（本报告方案，`:root[data-paper="on"]`）还是默认开启？性能预算多少？

---

### Q4 · 🟡 `--brand-blue` 的去留（影响 B4）

Figma 四色阶**完全没有蓝系**，但代码里有 `--brand-blue #1A56DB`（期刊检索 CTA，用于「论文红 / 期刊蓝」区分）+ `--brand-blue-soft-bg`，以及体系外的 `#1E5FA8`（分享者头像）、`#0066FF`（充值语义）。

**需决策**：
(a) 退休 `--brand-blue`，期刊/论文区分改靠图标而非色相；
(b) 保留为「体系外功能色」并补齐规范。

---

### Q5 · 🟡 图标库是否换（影响 B3/B6，工作量差异极大）

Figma §4.6 的 15 个图标命名风格为 **Hugeicons**（`arrow-data-transfer-horizontal-round` 等），现行代码用 `lucide-react`。

**与 Q7 是同一个决策，建议打包问。**

---

### Q6 · 🔴 暗色态存废（阻断 B7 的三分之一）

`theme.store.ts` 的 `setTheme` **全站零调用点**（实测确认），默认 `'light'` 且 persist，`'system'` 分支不可达 —— `.dark` 块是当前完全跑不到的死代码。

**需决策**：
- **(A)** 补主题切换入口 + 按 §2.2 玄墨镜像阶梯重推。成本：覆写从 18 扩到 ~30（补品牌 3 色 + prism-badge 2 + primary/destructive-foreground 2 + border 族）
- **(B)** 直接删 `.dark` 块 + `theme.store.ts`，省掉整条推导线

在「快速落地」的设计前提下，**(B) 是更诚实的选项**。

---

### Q7 · 🔴 图标 24px 是画板还是可见图形（影响 B6 的按钮/行高重算）

Figma §4.6 说 15 个图标 component 全是 `24×24` **画板**。代码主力是 `size-3.5`(14px, 426 处) / `size-4`(16px, 285 处) / `size-3`(12px, 280 处)，24px(`size-6`) 只有 30 处。

- 若 24 是**画板**、可见图形约 20 → 代码只需从 14/16 上调一档
- 若 24 是**图形本身** → 全站图标放大 50%，按钮/行高全部重算

**这个问题必须先答，否则 B6 的按钮内边距计算全部作废。**

---

### Q8 · 🔴 6px 间距档是去是留（阻断 ~750 处）

Figma §5 观测集合 `{4,8,10,12,16,24,32,40}` **没有 6px**，但 `gap-1.5`(6px) **307 处**已写进 `shared/ui/{dialog,sheet,dropdown-menu}.tsx` 三个原子的基线 —— 是当前设计系统的**既成事实**。

叠加 13→14px 上浮，若同时 6→8，全站纵向密度会明显变松。

**需决策**：Figma 是否补一档 6px？（同理需确认 `gap-0.5`(2px) 47 处 / `gap-3.5`(14px) 40 处 / `px-5`(20px) 63 处。）

---

### Q9 · 🟡 按钮 42 vs 搜索框 44（影响 B3 控件阶梯）

Figma 自身不自洽：§4.1 按钮 `120×42`，§4.5 搜索框 `312×44` —— 相差 2px 却是同类控件高度。

**需确认**能否统一到 44，否则 42/44 双档会永久留在 token 里。

---

### Q10 · 🟡 tab / 工具栏控件高度（36px 无处可落）

Figma 控件阶梯只有 `23 / 32 / 42|44`，**没有 36**。但代码 112 处 `h-9`（Tabs 基座 + 工具栏 + 次级图标钮）无处可归 —— 归 32 会让 tab 条过窄，归 42 会让工具栏过高。

本报告推导保留 `--control-h-md: 36px`，**需设计师确认或补规范**。

---

### Q11 · 🟡 Disabled 按钮无障碍缺陷（Figma 规范本身的 bug）

Figma §4.1 Disabled 变体：`#CECED9` 文字 on `#B4B4BF` 背景，对比度约 **1.4:1** —— 远低于 WCAG AA 正常文字 4.5:1，也低于大字号的 3:1。

**必须向设计师反馈**，否则新按钮 disabled 态不可读。

---

### Q12 · 🟡 聊天正文字号是否偏离规范

`chat/MarkdownRenderer.tsx:219` 是全站 AI 对话正文真源（智能搜索 / 智能助手 / 审稿报告 / 情报详情全走它）。按 Figma「正文=14」应升到 14，但会让长会话滚动距离 **+16.7%**。

本报告建议**保持 12 并在 token 注释里写明这是有意偏离**。需确认。

---

### Q13 · 🟢 Playfair italic 去留

代码 15 处在用 `font-display italic`，Figma **0 个 italic 样本**，且 `public/fonts/` 只有 700 一个字重（italic 全在跑浏览器几何斜切）。

**需决策**：废弃 italic，还是补 italic 字体文件？

---

### Q14 · 🟢 移动端规范（Figma 只有 1920 桌面画板）

规范缺口表把「响应式断点 / 移动端」列为 🔴 高。本报告推导「移动端不另开字号档，统一上浮 12」，需确认。

---

## 附：本报告的验证证据

以下数字均为改造前在 `frontend-user/src/` 实测复现（非引用）：

```
text-2xs   776    text-xs    923    text-sm    684    text-base  171    text-md     79
rounded-md 544    rounded-sm 359    rounded-lg 125    rounded-pill 284
tracking-[   91   shadow-*    75
bg-background 518  <button> 458  <Button> 306  <select> 38  <textarea> 33
h-4 + 10/11px 无 leading-none = 14 处（清单 A，逐条列出）
setTheme 调用点 = 0（只有 theme.store.ts 自身 :9 声明 + :16 实现）
class-variance-authority 导入 = 2 个文件（shared/ui/button.tsx, badge.tsx），shared/ui 共 23 个文件
自建 .css/.scss 文件 = 0（src/ 下唯一 styles/globals.css）
```

复现命令（**必须用 `rg --text` 或加 `-a`，BSD grep 会静默跳过 2 个含非 UTF-8 字节的文件**）：
```bash
cd frontend-user/src
grep -rao "text-2xs" --include='*.tsx' --include='*.ts' . | wc -l
grep -rn 'h-4 ' --include='*.tsx' . | grep -E 'text-2xs|text-\[10px\]' | grep -v 'leading-none'
```
