# Scholay 设计规范（Pencil MCP 提取）— 2026-08

> **当前规范侧真源**：`/Users/youngp/Downloads/scholay设计源文件/dev.pen`
> **运行时 token 唯一真源（SSOT）**：
> [`frontend-user/src/styles/globals.css`](../frontend-user/src/styles/globals.css)
> **提取方式**：Pencil MCP 直接读取 Pen Desktop 当前打开的 `dev.pen`，本文记录节点属性，
> 不从截图取色。

`dev.pen` 是代码上游的设计证据，但它位于仓库外，不能在构建期被消费。前端、小程序和
导出渲染的实际运行值必须来自 `globals.css` 及其受护栏校验的跨包镜像。两者关系是：

```text
dev.pen（上游设计证据）
  → 本文（可评审的提取快照）
  → frontend-user/src/styles/globals.css（运行时 SSOT）
  → 受 design guard 校验的跨包镜像
```

2026-07 的 Figma 提取文档仅作历史基线，不再决定当前 token：
[`figma-design-spec-2026-07.md`](figma-design-spec-2026-07.md)。

---

## 一、读取范围与证据节点

Pencil MCP `get_app_state` 确认当前画布是上述 `dev.pen`。设计系统根节点为
`rfNKU`（`Scholay设计系统`），文档未定义 Variables（`{}`），因此本次以节点的
fill / stroke / typography / radius / padding 实值为准。

| 节点 | 内容 | 本文用途 |
|---|---|---|
| `rfNKU` | `Scholay设计系统` | 设计系统总画板 |
| `LiGf7` | 四系颜色 | 基色、12 档色阶、表面色 |
| `bM35q` | 中文字体展示 | Noto Serif SC 的字号与字重 |
| `rhCJT` | 英文字体展示 | Playfair Display 的 Pen 原始样张（已被用户字体指令覆盖） |
| `GQBuZ` | Headline / Body 及中文适配 | Google Sans 与 Noto Serif SC 角色映射 |
| `HHUmO` | Button / Label / Progress | 按钮、标签与状态示例 |
| `PrJaE` | Default Card / Search Bar | 卡片与搜索框基础值 |

### 冻结节点（本轮不改）

| 节点 | 内容 | 约束 |
|---|---|---|
| `D5gC67` | Logo 矢量图形 | 不从新主题色反推或重染 |
| `V2IJR` | `SCHOLAY` 字母字标组 | 字体、字距、颜色与形状全部保持 |

Logo 和 Scholay wordmark 是独立品牌资产，不得因 `--brand-*` 颜色迁移而被顺带改色；
品牌组件、SVG、favicon 与字标专用 token 都在本轮之外。`Playfair Display`
只保留给这类冻结的 Scholay / 品牌文字，不再作为普通英文标题字体。

---

## 二、颜色

### 2.1 语义基色

| 角色 | 雅名 | 当前值 | 主要用途 |
|---|---|---:|---|
| Primary | 朱砂 | `#882828` | CTA、主要强调 |
| Secondary | 松青 | `#2F4D29` | AI / 成功向操作、次要强调 |
| Tertiary | 琥珀 | `#B4880E` | 期刊、构建中与第三强调 |
| Neutral | 玄墨 | `#1F1F23` | 正文、轮廓、中性实底 |

> **Neutral 节点存在元数据与实际渲染差异**：卡片上的文字标签写的是 `#141414`，
> 但基色实际 fill 和玄墨色阶节点使用的是 `#1F1F23`。运行时以节点实际 fill
> `#1F1F23` 为准；`#141414` 只记作 Pen 标注待清理，不得生成第二个 neutral token。

### 2.2 原始 12 档色阶

| 色系 | 1–4 | 5–8 | 9–12 |
|---|---|---|---|
| 朱砂 | `#1A0707` · `#330F0F` · `#4D1616` · `#661E1E` | `#882828` · `#802525` · `#992C2C` · `#B23434` | `#CC3B3B` · `#E54343` · `#FF4A4A` · `#FF8080` |
| 松青 | `#101A0E` · `#1F331B` · `#2F4D29` · `#3F6636` | `#4E8044` · `#5E9952` · `#66A658` · `#6DB25F` | `#75BF66` · `#7DCC6D` · `#85D974` · `#95F281` |
| 琥珀 | `#664B00` · `#805E00` · `#997000` · `#B4880E` | `#B28300` · `#CC9600` · `#E5B122` · `#E5BA45` | `#E5C367` · `#E5CD89` · `#E5D6AC` · `#E5DFCE` |
| 玄墨 | `#09090A` · `#1F1F23` · `#2B2B30` · `#383840` | `#505059` · `#686873` · `#757580` · `#9A9AA6` | `#B4B4BF` · `#CECED9` · `#E6E6F2` · `#FFFFFF` |

上表严格按 Pen 节点的水平顺序记录，不自行重排为“更均匀”的亮度曲线。琥珀的语义基色
明确是 `#B4880E`，不再沿用 2026-07 基线中的 `#E5A800`。

### 2.3 表面与组件状态

| 项 | 值 | 说明 |
|---|---:|---|
| 页面 / 展示板表面 | `#F6F4EE` | 偏米色外层底 |
| 卡片 / 输入内层 | `#FFFFFF` | 纯白内容面 |
| Tertiary 按钮轮廓 | `#0D0C0B` | 1px inner stroke，文字同色 |
| Disabled 填充 | `#B4B4BF` | 玄墨 9 |
| Disabled 文字 | `#CECED9` | 玄墨 10 |
| 搜索框边框 | `#1F1F231A` | 玄墨 10% alpha，1px |
| 搜索占位文字 | `#1F1F2340` | 玄墨 25% alpha |
| 卡片操作底 | `#0000001A` | 黑 10% alpha |

#### 无障碍落地差异

上表的搜索框边框与 placeholder 是 Pen 节点的原始证据值，但不直接作为
运行时可读性值：

- 搜索框交互边界继续使用 `--border-control: #1F1F23`，避免 10% alpha 边界在
  白色 / 米白底上无法稳定识别。
- placeholder 使用玄墨 50% 而非 Pen 的 25%；25% 在白底上约为 1.69:1，
  不适合承载「应输入什么」的信息。

这两项是明确的可访问性偏离，不改变 Primary / Secondary / Tertiary / Neutral
的主题基色。

---

## 三、字体与字号

### 3.1 Pen 证据与当前字体决策

用户已明确指定：**非品牌英文统一使用 `Google Sans`，中文统一使用
`Noto Serif SC`**。这一用户级指令覆盖 Pen `rhCJT` 中用于普通英文的
Playfair Display 样张，但不改动冻结品牌节点。

| 角色 | Pen 证据 | 当前运行时决策 |
|---|---|---|
| 非品牌英文 Headline / Body / UI / Display | `GQBuZ` 指定 `Google Sans`；`rhCJT` 有 Playfair 样张 | 统一使用自托管 `Google Sans` |
| 中文展示、正文与中文适配 | `bM35q` / `GQBuZ` 指定 `Noto Serif SC` | 统一使用自托管 `Noto Serif SC` |
| 冻结的 Scholay / 品牌文字 | `V2IJR` 为冻结 wordmark | 保留 `Playfair Display`，只能在品牌专用边界内使用 |
| 中文 glyph 后备 | — | `Noto Serif SC` → `Source Han Serif SC` → `Songti SC` → `SimSun` → system-ui |

#### Google Sans 官方资产与语言分流

2026-08-08 已通过官方 Google Fonts specimen 与 CSS 核验 `Google Sans`。项目
自托管官方 v70 Latin / Latin-ext variable WOFF2，覆盖 wght 400–700，并将
SIL OFL 许可文件与版本化资产一同纳入仓库。生产构建不依赖运行时
Google Fonts CDN。

运行时通过 `unicode-range` 与家族顺序按 glyph 分流：Latin / Latin-ext 命中
Google Sans，CJK 由 Noto Serif SC 承接。两者之间不得插入会抢占
Latin glyph 的替代字体。

### 3.2 字号与字重证据

#### 中文（Noto Serif SC）

| 字号 | 字重 |
|---:|---|
| 24px | 300 / 500 / 700 |
| 28px | 300 / 500 / 700 |
| 32px | 300 / 500 / 700 |

`GQBuZ` 另有 Noto Serif SC `64px / 500` 的“文本”Headline / Display 样张。

#### Pen 英文样张（Playfair Display，普通 UI 已停用）

| 字号 | 字重 |
|---:|---|
| 12px | 400 |
| 14px | 400 / 500 |
| 16px | 500 |
| 18px | 500 |
| 20px | 500 / 700 |
| 24px | 500 / 700 |
| 28px | 500 / 700 |
| 32px | 700 |

`GQBuZ` 的英文 Headline / Body 样张为 Google Sans `64px / 500`。
上表仍保留作为 Pen 提取证据，不再授权 Playfair Display 用于普通英文 UI /
Headline / Display；它只供冻结的 Scholay / 品牌文字使用。

#### 运行时数值阶梯

Pen 实际出现且用于主 UI 的数值档为：

`12 / 14 / 16 / 18 / 20 / 24 / 28 / 32px`

对应 Tailwind 数值类为 `text-12/14/16/18/20/24/28/32`。正文基准仍是 14px；
18px 和 32px 是本次 Pen 证据新增的正式主 UI 档。旧 36/56px 已迁出主 UI 阶梯；
64px 仅作为独立 Headline / Display 展示档，不混入正文阶梯。

### 3.3 组件文字细节

| 场景 | 字体 | 字号 / 字重 | 其他 |
|---|---|---|---|
| Button | Google Sans | 14 / 500 | 居中 |
| Badge / Label | Google Sans | 12 / 400 | 胶囊 |
| 区块标题 | Google Sans | 16 / 500 | “Default Card” / “Search Bar” |
| Card 次文 | Google Sans | 12 / 400 | line-height 1.333，letter-spacing 0.24px |
| Card 主文 | Google Sans | 14 / 500 | line-height 1.4286，letter-spacing 0.28px |
| Search placeholder | Google Sans | 14 / 400 | line-height 1.4286，letter-spacing 0.28px |

### 3.4 页面侧边栏

`O8kYu` 页面中的功能侧边栏与文件夹侧边栏共同定义以下语义层级。业务页面不得
按自己的数据类型重新发明字号；差异只由导航密度决定：

| 语义角色 | 字号 / 字重 | 几何与间距 |
|---|---:|---|
| 分组标题 | 12 / 500 | 高 28px，左右 16px，上 8px、下 4px |
| 双行主标题 | 14 / 500 | 单行截断 |
| 双行副标题 | 12 / 400 | 弱化色，与主标题间隔 1px |
| 双行导航 | — | 高 42px，左右 16px，内容间距 12px |
| 双行图标底板 | — | 28×28px，圆角 8px；图标 14px |
| 普通单行导航 | 14 / 400 | 高 32px，左右 16px；选中时 500 |
| 紧凑树 / 筛选项 | 12 / 400 | 高 28px；选中时 500 |
| 计数 / 时间 | 12 / 400 | 弱化色，数字使用 tabular nums |
| 用户主 / 副信息 | 14 / 500；12 / 400 | 底栏高 56px，头像 32px，主副间隔 1px |

普通主导航不得降为紧凑树的 12px；树、筛选器也不得为了“全站统一”机械放大到
14px。选中项使用语义表面色与 500 字重；文件夹侧栏按图稿使用左右 16px 内缩、
8px 圆角的浅朱砂底。导航侧栏与文章目录、审稿快览、工具详情等内容型 rail 是两类
组件，后者不继承导航选中样式。

---

## 四、基础组件值

### 4.1 Button

- 宽 120px，胶囊圆角 40px，padding `12px 16px`。
- 标签 Google Sans `14px / 500`。
- Primary：`#882828` 实底 + 白字。
- Secondary：`#09090A` 实底 + 白字。
- Tertiary：无填充 + `#0D0C0B` 1px inner stroke + 同色文字。
- Disabled：`#B4B4BF` 实底 + `#CECED9` 文字。

### 4.2 Badge / Label

- 胶囊圆角 40px，padding `4px 8px`。
- Google Sans `12px / 400`。
- 颜色从朱砂 / 松青 / 琥珀 / 玄墨语义 token 取值，并按对比度选黑字或白字。

### 4.3 Default Card

- 容器内底 `#FFFFFF`，圆角 16px。
- 样张卡片高 71px，padding 16px。
- 操作圆形底 `#0000001A`。
- 文本排印见 §3.3。

### 4.4 Search Bar

- 底色 `#FFFFFF`，圆角 16px。
- `#1F1F231A` 1px 边框。
- padding `12px 16px`，图标与文字 gap 12px。
- placeholder `#1F1F2340`，Google Sans `14px / 400`，line-height 1.4286，
  letter-spacing 0.28px。

`HHUmO` 还提供了四色 progress 外观示例，但本次读取不把示例线长当成全局业务尺寸
token；只继承对应的语义颜色。

---

## 五、工程同步规则

1. 修改主题时先用 Pencil MCP 读取 `dev.pen`，不从截图拾色。
2. 同步更新本文与 `frontend-user/src/styles/globals.css`；运行时值只以
   `globals.css` 为 SSOT。
3. 小程序、PPTX / agent 渲染等必须通过全仓 design guard 与运行时 SSOT 对齐，
   不手工发明第二套色值。
4. 业务组件只消费语义 token，不直接引用 12 档原始色阶。
5. 需要偏离 Pen 时，必须在实现与文档同时写明产品理由，不得把旧 Figma 值当作当前依据。
6. `D5gC67` Logo 与 `V2IJR` Scholay wordmark 保持冻结，除非用户单独开启品牌资产改造。
7. 非品牌英文必须命中 Google Sans，中文必须命中 Noto Serif SC；
   Playfair Display 不得重新进入普通 `font-display` / Headline / Body。
