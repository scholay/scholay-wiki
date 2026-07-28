# Scholay 设计系统「真实渲染取证」审计 — 2026-07-28 首轮

**审计对象**：分支 `design/figma-token-layer` @ `cdd4be881` + **304 个未提交的工作区改动**（`git status --porcelain frontend-user | wc -l`）
**运行环境**：Vite dev server `http://localhost:3001`（进程实测：`frontend-user/node_modules/.bin/vite`）· Chromium via Playwright 1.62 · macOS
**对照真源**：Figma `JIv8fxQthMS37JLGHNOEbB` / `Scholay设计系统` (node `1:38`)
**参照文档**：[design-audit-2026-07.md](./design-audit-2026-07.md)（静态审计）· [figma-design-spec-2026-07.md](./figma-design-spec-2026-07.md) · [design-migration-ledger-2026-07.md](./design-migration-ledger-2026-07.md)

> 🎯 **本文件是本项目第一次真实渲染取证的汇总。**
> 上一份审计（`design-audit-2026-07.md`）在「〇之二 · 局限」里逐字写了：
> 「全部结论来自静态分析 + 编译探针 + 对比度计算，**没有一条来自真实渲染**」，
> 并把「一轮真实渲染取证（Playwright computed-style 对账）」列为**未做项 ⑤**。
> 本文件就是那一项的产物。
>
> 📏 **本文件所有数字都能追溯到某一次 computed / CDP / 像素读数**，每条都给了探针文件名。
> 没有一条结论来自「读代码推断」——静态推断出来的东西写在上一份里，不在这里。
>
> ⚠️ **测的是工作区，不是线上。** dev server 跑的是带 304 个未提交改动的工作树。
> 本文件的任何结论都**不能直接当作 5411 生产环境的现状**。

---

## 〇、方法与局限

### 〇.1 测了什么

四个维度并行取证 + 一轮交叉核对复测（本文件作者）。**四个维度各自选路由，路由集并不一致**——这本身是本轮最大的方法学缺陷，见 §四.7。

| 维度 | 路由数 | 视口 | 采样量 | 主要手段 |
|---|---:|---|---|---|
| 排印 typography | 18 | 1920×1080 | 2549 自带文本元素 / 8602 有盒子元素 | computed style + **CDP `CSS.getPlatformFontsForNode`** + canvas 墨量测量 + `performance.getEntriesByType('resource')` |
| 色彩 / 形状 / 对比度 | 28 | 1920×1080 | 12793 可见元素 / 8050 颜色声明 / 10064 角声明 | computed style + 沿祖先链 alpha 合成 + **截图回灌 canvas 逐像素复核** |
| 布局 / 响应式 | 14 + 3 详情页 | 1920 / 1440 / 1024 / 768 / 390 + 移动 UA | 100+ 次测量 | computed style + `document.styleSheets` 抽 `@media` + UA 双路径 token 全量 diff |
| 纸感 / 焦点 / 表单 | 9~12 | 1920×1080 | 222 按钮 / 4 搜索框 / 每路由最多 34 个 tab stop | 像素直方图 + **失焦↔聚焦像素比对** + 120 帧滚动性能 + `elementFromPoint` 命中测试 |
| **交叉核对（本文件）** | 19 | 1920 / 1440 / 1200 / 1024 / 768 / 390 | 21324 颜色声明 + 11 个专项探针 | 上述全部 + **对照组 / 反证组**设计 |

**交叉核对追加的 11 个探针**（全部在 `scratchpad/render-audit/`，文件名 `xc_*.mjs`）：

| 探针 | 裁决了什么 |
|---|---|
| `xc_contrast.mjs` | 复算四份报告里出现过的全部 20 个对比度数字 |
| `xc_probe1.mjs` | `/search` 空态 vs 有结果态；`--container-page` 消费；`/journals` off-scale h1 |
| `xc_probe2.mjs` | 四个搜索框的焦点语言；TopNav / Footer 跨视口几何 |
| `xc_probe3/4/5/6/9.mjs` | 暗底可聚焦元素（含对照组与反证组）——本轮唯一新增 P0 |
| `xc_probe7/8/11.mjs` | TopNav **裁剪后**墨级碰撞（区分 box 重叠与真实压字） |
| `xc_probe10.mjs` | `oklab()` 解析盲区的量化边界 |

### 〇.2 **没测什么**（读结论前必须先读这一节）

| 未覆盖 | 后果 |
|---|---|
| **需登录的 Prism / claw / peer-review / library / settings / /admin** | 覆盖率在那里是 **0**。具体地：全站 **38 处 `font-serif`**（Noto Serif SC 101 分片自托管的**唯一设计意图路径**）100% 落在这些页面；`--status-*` 全族、`--prism-editor-*` 全族、`--rail-*` / `--panel-*` / `--dialog-*` 布局 token 的目标消费方也全在这里。**本轮对「上一轮改造的重头戏」基本没有直接验证。** |
| `--font-mono` / `--leading-code` | mono 在公开路由只命中 3 个元素（CDP 实测落到系统 Menlo）；`--leading-code`(1.65) 公开路由**零出现**（CodeMirror 只在 Prism 内）。 |
| 浮层交互态 | 只覆盖到登录弹窗（实测 off-scale 0、无新字号档）。顶栏「全部菜单」浮层、下拉、Tooltip、Popover 内的排印/对比度未覆盖。 |
| `/search` 筛选面板内部 | 默认折叠。两套并存的 Checkbox 实现（原生 `input.accent-brand-red` 14×14 vs shadcn `button[role=checkbox]` 16×16）只在无命中测试的一轮里观察到，**标记为 PLAUSIBLE，未确认**。 |
| 真实刘海屏遮挡 | Chromium 不支持模拟 `env(safe-area-inset-*)`，实测恒为 0px。safe-area 结论是**推导**（链路上有无 `env()` 消费点 + 实测 padding 数值 vs iPhone 34px），不是目视验证。同理 headless 无地址栏，`100vh` 的实际危害无法复现，只能靠编译产物中的规则文本证明其存在。 |

### 〇.3 dev server 与生产构建的差异（可能带来的偏差）

| 差异 | 已知影响 | 是否已规避 |
|---|---|---|
| **工作区 ≠ 已提交 ≠ 线上**（304 个未提交改动） | 本文件所有结论都是工作树快照 | ❌ 无法规避，只能标注 |
| dev 下 CSS 经 JS 注入，`FontFaceSet` 在懒加载 chunk 后被重置 | 首轮探针里 `/search`、`/tools` 的 `document.fonts` 报 0 loaded，同时却有 200 的 woff2 响应——**dev 伪影** | ✅ 已规避：字体结论一律以 **CDP 平台字体 + canvas 墨量**为准，**不采信 `document.fonts.check()`** |
| dev 无 nginx 层 | 无 gzip、无 `Cache-Control: immutable`、无边缘缓存 | ⚠️ `/journals` 的 **380 KB CJK 分片**是 dev 下的实测字节；生产在 HTTP/2 + 长缓存下**首访字节相同、复访为 0**，该数字应读作「首访成本」 |
| Tailwind v4 候选扫描在 dev / build 都跑 | 死类 `.container`（带来幻影断点 1280/1536）与 `.max-h-[min(70vh,640px)]` 在 dev 产物里实测存在 | ⚠️ **未在生产构建产物上复验**。扫描器相同，大概率一致，但这条结论的口径是「dev stylesheet」 |
| React StrictMode / HMR | 注入额外 `<style>`；DOM 副本数可能不同 | ⚠️ dim4 观察到 **MenuDock 在 DOM 里有 3 份副本**，未验证生产是否相同。该事实只影响「必须做命中测试」这一方法学结论，不影响任何几何数字 |
| macOS + Chromium 字体环境 | Google Sans 未安装 → sans 实渲染为 `.SF NS` + `PingFang SC` | ✅ 该结论对**未装 Google Sans 的机器**（绝大多数用户）普适；装了的机器（Google 员工 / 设计师）会渲染出不同字形与 metrics，本轮无法覆盖。**`--leading-sans: 1.25` 的注释自称按 Google Sans 实测，该前提在真实用户机上不成立** |

### 〇.4 全局污染源（后续任何自动化审计都要先处理）

**促销弹窗**（「限时领取会员」）在多数路由加载后 2–3 秒自动弹出，Radix Dialog + `bg-foreground/40` scrim + `backdrop-blur-2`，**劫持焦点形成 4 元素 Tab 死循环**。

- 对 computed 值无影响（scrim 是兄弟节点不是祖先），但**污染像素级采样**与**全部 a11y 自动化**——任何在 `networkidle` 后立刻 Tab 的审计，量到的是弹窗而不是页面。
- 本轮所有测量都在 `Escape` 关闭它之后进行。**建议给测试环境加开关。**

---

## 一、三句话结论

1. **排印与形状层是四轮改造里落地最扎实的部分，色彩层「取值合规但落点没算过」，交互态几何是全新的黑洞。**
   字号八档吻合 8601/8602（off-scale 率 0.012%）、圆角 10064 条角声明零越界、263 对父子圆角嵌套零违规、颜色 token 覆盖 99.93%——**取值层几乎无懈可击**；
   但 194 个文本元素对比度不达标，根因是 **token 的对比度只按页面底 `#F6F4EE` 标注过一次**，而它们大量落在 surface-1/2/3 和恒暗段上；
   而**焦点环的真实几何**（被 `overflow:hidden` 裁掉、在暗底上画 0 个像素）在静态分析里**原理上不可见**。

2. **本轮唯一的 P0 是四个维度全都漏掉、且被其中一维明确断言「不存在」的：暗底 CTA 的焦点环画了 0 个像素。**
   `/features/prism` 与 `/features/search` 的主 CTA（「立即开始写作」/「立即免费开始」）坐在 `bg-foreground` (#1F1F23) 上，
   `:focus-visible` 匹配、全局 ring 已应用，**失焦↔聚焦像素比对 = 0 / 11968**。
   反证：同一元素把 `outline-color` 换成 `rgba(230,230,242,0.85)`，同一 harness 立刻测到 **848 px (7.086%)**。

3. **真实渲染推翻了 7 条静态阶段的结论，其中 3 条是「文档记录的现实并不存在」。**
   `--placeholder-foreground` 的「刻意偏离」描述的是一个**没在跑的实现**；「裸 vh 已 26→0」在编译产物里**仍有 3 条**；
   「断点只有 640/768/1024」实际是 **5 个**。详见 §三。

---

## 二、只有真实渲染才能发现的（本轮真正的价值）

> 本节**刻意排除**前四轮静态审计已知的项（token 零消费、arbitrary 值计数、兼容层旧色名、`max-w-page` 未接线等）。
> 那些项在本轮只是被「复核了一遍」，不占篇幅——集中列在 §二.5。

### 2.1 交互态几何 —— 静态分析在**原理上**不可达

这一类的共同点是：**CSS 完全正确，是几何/合成把效果吃掉了**。grep 与编译探针永远看不见。

| # | 事实 | 实测证据 |
|---|---|---|
| ① | **暗底焦点环画 0 个像素**（P0，详见 §五） | `/features/prism`「立即开始写作」：`isActive=true` / `focusVisible=true` / `outline: solid 2px rgba(31,31,35,0.5) off:1px`，而 156×48 元素外扩 10px 的裁剪区内 **changedPx = 0 / 11968，maxDelta = 0**。反证组同元素换亮环 → 848 px / 7.086% / maxDelta 176。`xc_probe9.json` |
| ② | **焦点环被祖先 `overflow:hidden` 裁掉大半** | 顶栏功能坞按钮：坞视口 `h-9`=36px、按钮 `h-8`=32px，上下各只剩 2px，而环需 offset 1px + width 2px = 3px。像素比对只变 4.63%，变化列范围 cols[21,88] 而按钮本体占 cols[10,86]——**左侧整条竖环缺失**。把祖先链全部改 `overflow:visible` 后，同区变化从 231px 升到 **548px（7.38%）**。几何法环带可见比例：0.418 / 0.444 / 0.449 / 0.563 / 0.612 / 0.633 / 0.647。`pn_14_clip.json` `pn_17_focusreal.json` |
| ③ | **`transition-colors` 把 `outline-color` 也纳入过渡** | 同一元素 focus 后 t≈0ms 与 t=420ms 两次采样：激活态坞项 `rgb(230,230,242)`（= 它自己的 text 色）→ `rgba(31,31,35,0.5)`；中途捕获到 `rgba(52,52,58,0.584)` 等插值。以 t0 算环对比度 = **1.13:1**，settle 后 3.13:1。t0≠settle 的元素占比 15/16 ~ 33/34。<br>⚠️ 这同时是一个**方法学陷阱**：focus 后立刻读 computed 会伪造出「1.10:1 假 P0」。 |
| ④ | **`--border-control` 只在 focus 态存在** | 4 个搜索框静置态 border 全是 `rgba(31,31,35,0.22)` 或 `0.12`，**没有一个是不透明 `rgb(31,31,35)`**；聚焦后 4/4 变成 `rgb(31,31,35)`。即 Figma §4.5 的招牌「深色 1px 实边」在渲染层**只作为焦点可供性存在**，从不是静置描边。`xc_probe2.json` |
| ⑤ | **同一控件族三套焦点语言并存** | 实测：`/` `/journals` `/tools` = 包裹层 border 变色（input 自身 `outline-none`）；`/search` = border 变色 **+ 额外** `box-shadow: rgba(31,31,35,0.5) 0 0 0 2px`；全站其余控件 = 全局 `outline 2px offset 1px`。登录弹窗 input 则**同时**触发 border 变实色 **和** 全局 outline（双重指示）。`xc_probe2.json` `pn_20_forms.json` |

### 2.2 有效底色 —— 只有渲染树里才有

**根因一句话**：`globals.css` 给每个前景 token 只标注了**一个**对比度数字，而那个数字是按 `--background` (#F6F4EE) 算的；真实渲染里这些前景 **4/5 的落点不在页面底上**。

| token | 注释标称 | 实测落点与比值（`xc_contrast.mjs` 复算，与 dim2 逐条吻合到 3 位小数） | 不达标元素数 |
|---|---|---|---:|
| `--faint-foreground` #6E6E78 | 「4.58 AA」 | #F6F4EE **4.585** ✅ / #FFFFFF 5.043 ✅ / **#F1EFE8 4.383** ❌ / **#EFEDE5 4.302** ❌ / **#E8E5DC 4.003** ❌ / **#F3E9E9 4.236** ❌ / **#1F1F23 3.257** ❌ / **#2B2B30 2.793** ❌ | **157** |
| `--muted-foreground` #686873 | 「5.00」 | #F6F4EE 5.003 ✅ / #FFFFFF 5.503 ✅ / #EFEDE5 4.694 ✅ / **#E8E5DC 4.369** ❌ | **22** |
| `--brand-amber` #E5A800 当**文字色** | （§4.2 已改成黑字口径，但仍有文本用法） | 最好的情况纯白卡也只有 **2.114**；#F6F4EE 1.922 / #FBF3DB 1.907 / #E8E5DC 1.688 / #E5DFCE 1.588 | **12** |
| 合计 | | | **194** |

- **暗段是最严重的**：`--faint-foreground` on `--landing-dark-1` = **3.257:1**，承载 `/features/prism` `/features/search` 暗段里的对比表格正文与卡片说明（12px×17 / 12px-500×4 / 14px×3 / 16px×4）；表头 on `#2B2B30` = **2.793:1**。
  像素级 ground truth（截图回灌 canvas）：bg `#1F1F23` 占 4119px、fg `#6E6E78` 占 41px，**与算术完全一致**。
- **这类问题静态分析原理上算不出来**：需要沿祖先链做 alpha 合成才能知道「这段文字实际坐在哪个底上」，而底色本身可能是 `color-mix()` 的产物（如 `#F3E9E9` = brand-red 10% mix surface-card）。

### 2.3 平台字体与真实字节 —— computed style 会**主动骗人**

| # | 事实 | 实测证据 |
|---|---|---|
| ① | **Figma 的 UI 主力字体全站命中率为 0** | 2443/2549（95.8%）元素的 computed `fontFamily` 首选是 `"Google Sans"`，而 **CDP `CSS.getPlatformFontsForNode` 实测 0 命中**：18/18 路由的 h1/p/button 全部由 `.SF NS`(system-ui) + `PingFang SC` 绘制。canvas 反证：`'Google Sans'`、`'Plus Jakarta Sans'`、`'Inter'` 测 'Handgloves' 宽度**逐位相同 305.72px**（= 同一未知字族兜底），而 `system-ui`=320.41 / `Helvetica`=338。<br>**这不是缺陷**（globals.css 写明专有字体不可自托管），但**任何只读 `getComputedStyle` 的审计都会误判「Figma 字体已生效」**。 |
| ② | **可变字重轴真的在动**（正面确认上一轮修复生效） | Playfair Display：CDP `isCustomFont=true`，canvas 墨量 400=**3040** / 500=**3574** / 600=**3997** / 700=**4461** 单调递增，Times New Roman=2845 可区分 → 上一轮记录的「`BrandName` 三个 tone 渲染出来完全一样」**已被修复且可验证**。 |
| ③ | **Noto Serif SC 101 分片自托管在跑，但走的不是设计意图的那条路** | CDP `isCustomFont=true`（familyName 报 `Noto Serif SC ExtraLight` = 可变字体默认实例内部名，非降级）；墨量 200/300/400 同为 4810（被 `@font-face font-weight:400 900` 钳到 400）→ 500=5199 → 600=5884 → 700=6883 → 800=7409 → 900=**7936**；系统 Songti SC=4697 / serif generic=4697 / PingFang SC=5810 均可区分。<br>**但 18 条公开路由的 `.font-serif` 元素数全部为 0** —— 它出现在渲染里，只是因为它是 `--font-display` 栈里 Playfair 之后的 **CJK 兜底**。 |
| ④ | **「标题用 `font-display` 承载中文」= 每页数百 KB** | `performance.getEntriesByType('resource')` 实测 `/journals`：字体请求 6 个 / 381092 B，其中 noto-serif-sc 分片 5 个 = **380792 B**（单片 66880 / 76332 B 量级，`initiatorType='css'`），只为渲染「期刊搜索」「实时」「期刊列表」十来个字。对照 `/`=300 B、`/search`=300 B、`/tools`=38760 B。`font-display:swap` 故不阻塞渲染。 |

### 2.4 视口相关的破版 —— 且被一行 CSS **系统性掩盖**

| # | 事实 | 实测证据 |
|---|---|---|
| ① | **标准横向溢出探针在本站结构性永远为 false** | `globals.css:1278` 的 `html, body { overflow-x: hidden }` 使 `documentElement.scrollWidth > clientWidth` **70/70 次全部为 false**（移动 UA 另 70 次同样）。而同一时刻 `header.scrollWidth` 在 390 下为 **458**（溢出 68px）。<br>**这正是前四轮审计漏掉下面两条的机制**：元素层持续溢出，文档层永远「干净」——破版被静默裁掉而非暴露。 |
| ② | **TopNav 在 ≤768 真实压字**（P0） | 见 §五.P0-2 与截图。 |
| ③ | **Footer 在 ≤430 被压成「每行一个汉字」并被裁** | 移动 UA 390 与 430（`/help` `/about` `/blog` `/news` `/privacy` 全部一致）：「关于我们」等 5 个链接各 **13px 宽 × 60px 高**（12px 字 / 15px 行高 → 4 字换 4 行），父容器 `h-11` = 45px。本文件复测（桌面 UA @390）：links 13×60、footer h=45、scrollHeight=52。1024 下同一元素是 48×15。 |
| ④ | **UA 双路径共用同一套 token（正面结论）** | `:root` 上 **162 个自定义属性逐个比对，差异 0**；body 14px / 17.5px / `rgb(246,244,238)` / `rgb(31,31,35)` / 同一 noise data-URI，两侧完全一致；`rootFontSize` 双侧 16px（断点 rem 换算无偏移）。**移动端没有第二套隐形标度。** |
| ⑤ | **纸感 noise 是真的在画，且性能近乎零成本** | 240×240 已验证纯色区域：关掉 = **1 种颜色 / std 0.000**，开着 = **100 种颜色 / std 6.261 / 颗粒覆盖 16.92% / 最暗颗粒比底色暗 52.9(255)**，120×120 严格周期。滚动 120 帧 median **8.3ms vs 8.2ms**（p95 10.1 vs 9.8），差异不可归因。`globals.css` 自述的「numOctaves 3→1 已修」**属实**。 |
| ⑥ | **但 `bg-background/95` 匹配不到 `.bg-background` 选择器** | `/pricing` sticky header（1920×72）computed `background-image: none`；同截图内像素统计：顶栏内 distinct=**1** / std=**0.000** / mean lum 243.78，顶栏下方 distinct=**93** / std=**6.202** / mean lum 241.78 —— 纹理断层 + 约 2/255 明度台阶。 |

### 2.5 静态阶段早就知道的（本轮只是复核，不占篇幅）

以下项在 `design-audit-2026-07.md` 或 ledger 里已有记录，本轮渲染只提供了**确认**，**不作为新发现**：

`max-w-page`(1440) 零消费（ledger 项 ①，本文件复测：5 条路由上 `--container-page`=90rem 但 `maxWidth==1440px` 的元素数 **0**、`.max-w-page` 类 **0**）·
`--placeholder-foreground` 零消费 · `text-[30px]` arbitrary 字号 · `leading-none` 65 处 · `leading-display-tight` 用在 14px 上 ·
搜索框 `text-14` 与基座 `text-12` 分裂（已被产品拍板为**刻意偏离**，见 design-audit §〇之四）· macOS 红绿灯 mock 的 3 个裸 hex ·
`/search` 筛选面板内两套 Checkbox 实现（PLAUSIBLE，未确认）。

---

## 三、被真实渲染**推翻**的静态阶段结论（本轮最高价值）

| # | 被推翻的陈述 | 出处 | 实测 | 性质 |
|---|---|---|---|---|
| 1 | 「`--placeholder-foreground` 是刻意偏离，3.23:1」 | `globals.css` 自述 | **该实现根本没在跑。** 7 个真实 placeholder（`/` `/search` `/tools` `/journals/search` `/citation-generator` `/feedback`×2）的 `getComputedStyle(el,'::placeholder').color` **一律是 `rgb(110,110,120)` = `--faint-foreground`**，零处命中 50% alpha 的 token | 🔴 **文档记录了一个不存在的现实** |
| 2 | 「裸 `vh` → `dvh`：26 → **0**」 | design-audit §〇 已落地表 | 编译产物里**仍有 3 条**裸 vh 规则：`.h-screen{height:100vh}`、`.min-h-screen{min-height:100vh}`、`.max-h-[min(70vh,640px)]`（死类）。**桌面首页上实测存在 `div.…min-h-screen…` 计算高度 1080 = 100vh**。源码侧 `h-screen`/`min-h-screen` 共 10 处。<br>**根因**：自述所依据的复现命令 `rg -o '[^d][0-9]+vh' src` 看不见 `h-screen` 这种**类名形态**的 vh | 🔴 **验证方法有盲区，结论被高估** |
| 3 | 「断点只有 640/768/1024」 | 项目自述 | 编译产物实测 **5 个** min-width 断点：640(66 条) / 768(22) / 1024(41) / **1280(5)** / **1536(1)**。1280 的 4 条是真用法（`ToolsCatalogPage.tsx:68`、`LibraryPage.tsx:425,450`、`WizardLayout.tsx:120`）；**1536 与 1280 各有一条来自零元素消费的死类 `.container`**（`document.querySelectorAll('.container').length === 0`）——Tailwind v4 从**注释文本**里扫出 `container` 候选，凭空多带 2 个幻影断点 | 🔴 **自述与产物不符** |
| 4 | 「`--chart-axis-fg` 在米白上约 3.6:1」 | 既有猜测 | **两处都不成立**：算术上它在 #F6F4EE 上是 **4.139**（不是 3.6）；而图表实际根本不落在米白上——落在白卡上，像素 ground truth（#FFFFFF 479px / #757580 8px）实测 **4.553:1，通过**。<br>⚠️ 但余量只有 0.05，是全站最脆的一条线：图表容器一旦从 `bg-surface-card` 改成 `bg-background`，立刻掉到 4.14 不合格 | 🟢 **推翻为「通过」，但标注为脆弱** |
| 5 | 「渐变底白字 2.11:1 不合格」 | 解析式算法的必然误报 | **逐列像素采样推翻**：促销弹窗渐变 = `linear-gradient(… rgb(136,40,40) 0%, rgb(136,40,40) 50%, rgb(229,168,0) 100%)`，Range 取真实字形行盒后逐列采底：x=0 `#882828`(8.82) → x=105 `#A65229`(**5.44**)，**全程 ≥4.5**。文本居中，琥珀端只出现在字形右侧空白区，该区域**实测 0 个白色像素** | 🟢 **凡「取渐变最坏色标」的静态算法都会误判这 4 个元素** |
| 6 | 「暗底焦点环覆写机制**已新增**」（`[data-surface='dark']`） | design-audit §〇 已落地表 | `[data-surface="dark"]` 在 **12 个公开路由的 DOM 里出现 0 次**，`src` 中除 `globals.css` 外出现 **0 次**——**机制建了，没接线**。<br>🔴 **而由此推出的「所以那是死代码不是活缺陷」被本文件推翻**：缺陷是活的，只是不在被测的 9 条路由上。见 §四.2 | 🔴🔴 **推翻的推翻——本轮最高价值的一条** |
| 7 | 「`BrandName` 的三个 tone 渲染出来完全一样」（改造前的问题描述） | design-audit §〇之三 | **修复已生效且可验证**：Playfair 可变字重墨量 400=3040 / 500=3574 / 700=4461 单调递增，Times=2845 可区分 | 🟢 **正面确认** |

### 三.补：本轮**自身**被推翻的两条

| 被推翻的 | 实测 |
|---|---|
| dim4：「公开路由上**不存在**坐在深色底上的可聚焦元素 → `[data-surface=dark]` 是死代码而非活缺陷」 | **falsified**。19 条公开路由普查：`/features/prism` 与 `/features/search` 各有 **2 个** 焦点环合成比 = **1.000:1** 的可聚焦元素。它们在 y≈6122 处（远低于首屏），dim4 的 `elementFromPoint` 命中测试**按视口坐标做**，把所有折叠以下的元素静默丢弃了 |
| dim3：「1024 及以上正常」 | **细化后基本成立**。裁剪后墨级碰撞：390 → 14 处（含 1 处文字压文字，48px）；768 → 8 处（含 1 处文字压文字，34px）；**1024 → 4 处，但文字压文字 = 0**（最严重是坞按钮背景压住「限时领取会员」文字 32px）；**1200 / 1440 → 0**。<br>即：**目视干净的下界是 1024，几何干净的下界是 1200** |

---

## 四、四份取证之间的矛盾与裁决

> 方法：凡两份结果对同一事实给出不同陈述，一律**自己重测**，不采信任何一方的原始说法。

| # | 矛盾 | 裁决 | 依据 |
|---|---|---|---|
| 1 | **`/search` 是骨架还是真数据？**<br>dim3：「未登录只渲染骨架」 · dim2：「`/search?q=…` 能拿到真数据」 | **两边都对，取决于有没有 `?q=`。** 裸 `/search`：bodyText 1688 字符 / `a[href^="/paper/"]` **0** 个 / 56 个可聚焦元素；`/search?q=machine+learning`：bodyText **21607** 字符 / 论文链接 **20** 个 / **216** 个可聚焦元素，**且未登录**。<br>🔴 **后果**：dim1 的排印普查测的是裸 `/search`（空态），所以「`/search` 无 h1」以及全站 2549 个文本元素的分布，**漏掉了产品信息最密集的一屏** | `xc_probe1.json` |
| 2 | **暗底上有没有可聚焦元素？**<br>dim4：「不存在，机制是死代码」 · dim2：「`/features/*` 有 landing-dark 段」 | **dim4 错。** 见 §三.补 与 §五.P0-1。dim4 的结论只在它测的 9 条路由上成立，`/features/prism` `/features/search` 不在其中 | `xc_probe4/5/6/9.json` |
| 3 | **`--faint-foreground` on #FFFFFF 是 5.04 还是 4.98？** | **5.043**，dim2 对。dim2 报的 20 个对比度数字**全部复算吻合到 3 位小数**；dim4 那一个是唯一偏差（-0.063） | `xc_contrast.mjs` |
| 4 | **焦点环到底有没有问题？**<br>dim2：「21/21 tab stop 有可见指示，无可达性缺口」 · dim4：「环被裁，可见比例 0.21–0.65」 | **不矛盾（部分可见 ≠ 不可见），但 dim2 的结论过度泛化。** 环被裁时仍有可见部分，故「有指示」成立；但 dim2 由此得出的「无可达性缺口」只对它测的 `/` 与 `/search` 成立——在 `/features/*` 上缺口是**完全的**（0 像素） | `xc_probe9.json` |
| 5 | **搜索框焦点是 border 变色还是 ring？**<br>dim2：「`/search` 用 focus-within box-shadow ring」 · dim4：「hero 是 border 变色」 | **都对，实测是三套并存**（见 §二.1⑤）。`/search` 是唯一多一层 `box-shadow ring` 的；4/4 的 input 自身都是 `outline-none` + `focusVisible=true` | `xc_probe2.json` |
| 6 | **dim1 内部：文本元素 2549 还是 2559？** | **非错误，是两个分母。** `typo_summary.json` 的 `totals` = `{nodes:2559, app:2549, ext:10}`——字号/字重分布按 app 节点(2549)统计，字间距分布按全部节点(2559)统计。引用时必须带口径 | `typo_summary.json` |
| 7 | **四个维度的路由集互不一致**（18 / 28 / 14 / 9~12 条） | **这是本轮最大的方法学缺陷**，直接导致矛盾 #2（P0 落在覆盖交集之外）。且 `/journals` 无独立路由，实际 finalUrl 是 `/journals/search`（HTTP 200 重定向，非 404）；`/resources/:slug` 传不存在的 slug 会静默回落到列表页。**下一轮必须先固定一份共享路由清单** | `xc_probe1.json` |
| 8 | **dim2 的颜色解析器不认 `oklab()`** | **盲区真实存在但有界。** `color-lib.mjs:parseColor` 只处理 `rgb()/rgba()/color(srgb …)`，对 `oklab(…)` 返回 null；而 Tailwind v4 的 alpha 修饰色（`bg-foreground/40`、`text-on-brand/85`、`bg-background/95`）**全部计算成 `oklab()`**。<br>13 条路由 21324 条颜色声明实测：非 rgb 形态 **96 条 = 0.45%**；把它们全部用 canvas 换算成 8bit 再算对比度，**文字对比度失败 = 0**。<br>→ dim2 的对比度结论**不受影响**；但「99.93% token 覆盖」应读作「**可解析声明**的 99.93%」 | `xc_probe10.json` |

---

## 五、可执行收尾清单

> 排序按**用户可感知的严重度**，不按修复成本。
> 每条标注 **【工程可做】**（判据明确，不需要设计决策）或 **【需设计师拍板】**。

### 🔴 P0 — 可达性硬失败 / 版面不可读

| # | 动作 | 位置 | 判据与证据 |
|---|---|---|---|
| **P0-1** | **给恒暗段接上 `[data-surface="dark"]`**，让暗底焦点环用 `--ring-on-dark-emphasis` | `/features/prism` 与 `/features/search` 的 `bg-foreground` CTA 段（各 1 处，1920×644） | 🟢 **【工程可做】** 机制在 design-audit §〇 就建好了，只差挂属性。<br>**证据**：4 个 CTA 链接 `focusVisible=true`、ring 已应用，像素比对 **0/11968**；反证同元素换 `rgba(230,230,242,0.85)` → **848px / 7.086%**。算术侧：`rgba(31,31,35,0.5)` over `#1F1F23` = `#1f1f23`，对比度**恰好 1.000**。<br>WCAG **1.4.11 / 2.4.11 完全失败**，且落在两个公开营销页的**主 CTA** 上 |
| **P0-2** | **TopNav 在窄屏折叠**（汉堡 / 隐藏功能坞 / 或比照 AppShell 给详情页加的 `max-sm:hidden`） | `src/app/layouts/TopNav.tsx:29-33`（`h-16 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]`，无任何响应式守卫） | 🟢 **【工程可做】**（折叠形态需设计师给样式，但「必须折叠」无争议）<br>**证据**：390 下 `header.scrollWidth`=**458** vs 视口 390；裁剪后墨级碰撞 **14 处**，含文字压文字「文献搜索」×「限时领取会员」**48px**。768 下 header 不再报溢出（768/768）但仍有 **8 处**碰撞，含「期刊搜索」×「限时领取会员」**34px**——截图 `xc_topnav_768.png` 可见 logo 被截成 `SCHOL/`、期刊搜索被促销胶囊压住。<br>**放大器**：`/help` `/about` `/blog` `/news` `/privacy` 等按 UA 分流规则**刻意留在 PC 路径**（保 SEO），且 `shared/lib/device.ts` 的 `BOT_RE` 先于手机判定返回 false → **Googlebot-smartphone 永远落 PC 路径**，移动优先索引看到的就是这个版面 |

### 🟠 P1 — 可读性 / 规范一致性

| # | 动作 | 位置 | 判据与证据 |
|---|---|---|---|
| **P1-1** | **Footer 窄屏换行 / 改栅格**，别把 nowrap 单行硬塞进 `h-11` 定高 | `src/shared/components/Footer.tsx` | 🟢 **【工程可做】** 390/430 下 5 个链接各 **13×60px**，容器 45px，内容溢出被裁；1024 下同一元素 48×15 |
| **P1-2** | **重算并重标 token 对比度：改成「token × 底色」矩阵，而不是单一数字** | `globals.css` 的 `--faint-foreground` / `--muted-foreground` 注释 | 🟢 **【工程可做】**（标注是工程事实）。当前注释「4.58 AA」「5.00」只在 `--background` 上成立，实测 4/5 落点不达标 |
| **P1-3** | **修 194 个不达标文本**：把 surface-1/2/3 与恒暗段上的 `text-faint` 换档 | 20+ 路由 | 🔴 **【需设计师拍板】** 有两条路：① 调 `--faint-foreground` 更深（会影响全部 676+ 处）；② 为深底/软底另立一档 faint。**这是取舍不是 bug**，必须设计师定 |
| **P1-4** | **`--brand-amber` 禁止作为文本色** | `/` `/news` `/features/*` `/tools/*` 共 12 处 | 🔴 **【需设计师拍板】**（换成哪个色是设计决策）。工程侧可先加 guard 规则。实测：最好情况（纯白卡）**2.114:1**，`amber-soft` 上 1.588:1 |
| **P1-5** | **同级标题收敛**：h1 在 18 条公开路由上有 **6 种**「字号/字重/字族」组合 | 全部公开路由 | 🔴 **【需设计师拍板】** 36/500/sans（8 条）· 36/700/Playfair（2 条）· 30/700/Playfair（1 条）· 24/700/Playfair（1 条）· 24/500/sans（3 条）· 14/400 sr-only（1 条）· 无 h1（2 条）。h2/h3 同病：`/journals` 系与详情页是 Playfair 700，其余是 sans 500。**直接违反 Figma「同级字体尽量使用同样字号」** |
| **P1-6** | **移动 bottom sheet 接 safe-area** | `src/shared/components/MobileBottomSheet.tsx:60` | 🟢 **【工程可做】** sheet 根 `padding-bottom = 0px`、`rect.bottom = 844 = innerHeight`；唯一带底部内边距的是内容区 **32px**（另一处 `pb-3` = 12px），而 iPhone X+ 安全区 **34px**。全站只有 2 条 `env(safe-area-inset)` 规则，均不在此链路上；`--safe-bottom` token 消费为 **0** |

### 🟡 P2 — 机制性 / 会持续制造新问题

| # | 动作 | 判据与证据 |
|---|---|---|
| **P2-1** | **封闭 `--leading-*` 命名空间**（补 `--leading-*: initial`，比照 `--text-*` / `--radius-*`） | 🟢 **【工程可做】** 内建 `leading-none` 照常编译并在渲染树上**生效 65 处**，把行高压成 1.0——**不属于项目六档中的任何一档**。`globals.css:952` 只有 `--radius-*: initial` 与 `--text-*: initial` |
| **P2-2** | **重新评估 `html,body{overflow-x:hidden}`**（至少：CI 里改用元素级溢出探针，别再依赖 `documentElement.scrollWidth`） | 🟢 **【工程可做】** 该规则让标准探针 **70/70 恒为 false**，是前四轮漏掉 P0-2 / P1-1 的**直接机制**。规则本身有正当理由（修移动端左右晃荡），**建议保留规则、换探针** |
| **P2-3** | **修 3 条裸 `vh`** + 删死类 | 🟢 **【工程可做】** `.h-screen` / `.min-h-screen` / `.max-h-[min(70vh,640px)]`；源码侧 10 处。顺带：`.container` 死类带进 2 个幻影断点，`document.querySelectorAll('.container').length === 0` |
| **P2-4** | **搜索框族收口**（4 种高度 / 3 种圆角 / 2 种描边 / 2 种底色 / 2 种字号 / 3 套焦点语言） | 🔴 **【需设计师拍板】** 实测 `/`=48/r16/白底/14px · `/search`=36/r8/白底/14px · `/journals`=52/r12/白底/14px · `/tools`=44/r16/**surface-1 底**/12px。Figma §4.5 = 44/r16/白底/`#1F1F23` 实色 1px。**实色描边命中 0/4** |
| **P2-5** | **`transition-colors` 不应过渡 `outline-color`** | 🟢 **【工程可做】** 焦点指示需即时达到 ≥3:1（WCAG 2.4.11 无渐变豁免），实测 t0 对比度 1.10–1.13:1，settle 后才 3.13:1 |
| **P2-6** | **`bg-background/95` 拿不到纸纹** | 🟠 **【需设计师拍板是否要修】** 顶栏内 distinct=1/std=0 vs 下方 distinct=93/std=6.202，视觉上是一条 1920px 硬边 + 2/255 明度台阶。是否可接受要人眼看（见 §六） |
| **P2-7** | **焦点环被 `overflow:hidden` 裁** | 🟢 **【工程可做】** 坞视口 36px 装 32px 按钮，环需 3px 伸展空间。修法：坞视口加高到 h-10、或按钮改 h-7、或改用 inset ring。可见比例 0.21–0.65 |

### 🔵 P3 — 卫生 / 规范同步

`text-[30px]` off-scale（全站唯一 1/8602，且注释援引的是**已作废的 .pen 口径**）🟢 ·
`--placeholder-foreground` 零消费死 token（删或接线）🟢 ·
`--radius-20` 公开路由零渲染（六档实跑五档）🟢 ·
macOS 红绿灯 mock 3 个裸 hex（收进具名 token 或在 guard 里显式豁免）🟢 ·
`leading-display-tight`(1.15，注释自称「≥28px 展示标题」) 被用在 14px / 24px 上 🔴需设计师 ·
登录弹窗 input 双重焦点指示 🔴需设计师 ·
两种主 CTA 填充色（登录弹窗 `brand-green` vs 首页 hero `brand-red`，Figma §4.1 只定义 Primary=#882828）🔴需设计师 ·
按钮 `h=42` 零实例（实测 15 种高/圆角组合，胶囊族落在 20/28/32/36/40 五档）—— **建议按「更新规范」而非「改代码」处理** 🔴需设计师 ·
`/journals` 为渲染十来个中文标题字拉 **380 KB** CJK 分片 🔴需产品/设计权衡 ·
移动壳 `max-w-md`(448px) 是第 8 种宽度口径 🟢

### ✅ 本轮确认「已经做对」的（别再当问题报）

- **UA 双路径 token 零差异**（162/162）——移动端没有第二套隐形标度
- **圆角体系**：10064 条角声明零越界；263 对父子嵌套**零违规**，「内层严格小于外层」口诀在真实渲染里被完整遵守
- **阴影**：只有 `--shadow-overlay` / `--shadow-raised` 两档，与 token 逐字节相同
- **字重护栏**：sans 字族上 `font-weight ≥600` 实测 **0 处**（仅 400/500），700 只出现在 Playfair 上
- **字号档没有夹带 line-height**：`text-12` 在 `leading-sans` 下 15px、在 `leading-paragraph` 下 20.4px——globals.css 自己警告的陷阱**确实没踩**
- **noise**：形态与 Figma 模型吻合，性能零成本，白卡分层像素级成立（`#FFFFFF` 紧贴 `#F6F4EE`，零「白卡压白底」）
- **可变字体**：Playfair 与 Noto Serif SC 的 wght 轴均实测生效
- **`disabled` 态**：用 `opacity .5` 而非 Figma §4.1 的 `#B4B4BF/#CECED9`（≈1.4:1，规范文档自己标为无障碍缺陷）——**刻意且更好的偏离**

---

## 六、截图产物索引

所有产物在
`/private/tmp/claude-501/-Users-youngp-mypro-fuck----scholar/6bfaceec-7f9c-47ea-89f2-4c5e31a3acd3/scratchpad/render-audit/`

> ⚠️ 这是 **session scratchpad，会被清理**。要长期保留请先复制出来。

### 6.1 🔴 **你（人）应该亲自看的 7 张**

分两类：**(A) 机器已判定为缺陷、但修法需要你的审美**；**(B) 机器判定为合格、但结论依赖人眼确认**。

| # | 文件 | 为什么必须你看 |
|---|---|---|
| **1 (A)** | `xc_topnav_768.png` | **P0-2 的一眼证据**。768 宽顶栏：logo 被截成 `SCHOL/`、「期刊搜索」被「限时领取会员」胶囊直接压住。看完你就知道这是必修还是可忍 |
| **2 (A)** | `xc_topnav_390.png` | 同上 390 宽——整条顶栏叠印成一团，**完全不可读不可点**。配合 `layout-break-googlebot-mobile-412_help.png`（Googlebot-smartphone 视角）一起看 |
| **3 (A)** | `xc_ring_dark_focused.png` **与** `xc_ring_dark_ifFixed.png` **对照看** | **P0-1 的一眼证据**。前者是生产现状下「立即开始写作」**已获键盘焦点**的样子（你会发现看不出任何焦点痕迹——这正是 0 像素的含义）；后者是把 ring 换成 `--on-dark@85%` 后同一元素的样子。**两张并排，问题与修法同时成立** |
| **4 (A)** | `layout-footer-mobileUA-390.png` | **P1-1**。Footer 链接被压成竖排「每行一个汉字」并被裁掉底部。是否可忍由你定 |
| **5 (B)** | `pn_SEAM_PROOF.png` | **P2-6**。sticky 顶栏与页面底之间的纸纹断层。机器能量到 std 6.202 → 0.000 的台阶，**但「这条硬边在真实视觉上明不明显」只有人眼能判** |
| **6 (B)** | `pn_NOISE_PROOF_FINAL.png` | noise 开/关对照。机器判定「形态吻合、性能零成本」，**但颗粒强度是纯审美**——16.92% 覆盖、最暗颗粒暗 52.9，是否太脏/太弱要你定 |
| **7 (B)** | `pn_SEARCHBOX_PROOF.png` | **P2-4**。四个搜索框并排。数字上是「4 种高度 3 种圆角」，但**它们是否在真实产品语境里显得不一致**，需要你看一眼再决定收口到哪一档 |

### 6.2 全量索引（按维度）

**交叉核对（本文件新增）**
```
xc_contrast.mjs                  20 个对比度数字复算
xc_probe1..11.mjs / .json        11 个裁决探针(见 §〇.1 表)
xc_topnav_390/768/1024/1440.png  顶栏跨视口(裁剪后墨级碰撞)
xc_ring_dark_focused.png         暗底 CTA 已聚焦(环 0 像素)
xc_ring_dark_ifFixed.png         同元素换亮环(848px 变化)
xc_ringdark__features_prism_xcm0/xcm1.png
```

**排印**
```
typo_probe / typo_analyze / typo_fontforensics / typo_sweep2 / typo_slices .mjs
typo_raw_main.json  typo_raw_detail.json  typo_sweep2.json
typo_fontforensics.json  typo_summary.json
typo_font_specimen.png       ← Playfair/Noto 三 tone 字样对照
typo_font_noto-400/900.png   typo_font_songti.png
typo__journals.png  typo__journal_1.png  typo__help.png
typo__paper_olx_olx:W2809929128.png      typo_state_login.png
```

**色彩 / 形状 / 对比度**
```
color-collect / color-lib / color-detail{,3,4} / color-verify / color-nest
color-pixel{,2} / color-promo / color-focus / color-noise / color-agg  .mjs
color-raw-main.json  color-raw-detail{,3,4}.json  color-raw-verify.json
color-raw-nest.json  color-raw-pixel2.json  color-raw-focus.json  color-raw-final.json
color-shot-d_features_prism.png   ← 暗段 text-faint 3.257:1 的实景
color-shot-d_features_search.png  color-shot-_.png  color-shot-y_journal_1.png
color-shot-paper-results.png      color-shot-journal-results.png
```

**布局 / 响应式**
```
layout_probe / layout_probe5 / layout_probe9 / layout_probe14 .mjs
layout-desktop.json  layout-mobile.json  layout-probe5/9/10.json
layout-topnav-collide2.json  layout-footer.json  layout-detail3.json
layout-shot-home-{1920,1440,1024,768,390}.png
layout-shot-mobileUA-390.png     layout-footer-mobileUA-{390,430}.png
layout-break-desktopUA-{768,1024}_.png
layout-break-googlebot-mobile-412_{,help}.png
layout-detail-{paper,journal,author}-1920.png
layout-shot-mobile-authsheet.png
```

**纸感 / 焦点 / 表单**
```
pn_NOISE_PROOF_FINAL.png   pn_FOCUS_PROOF.png   pn_SEARCHBOX_PROOF.png
pn_SEAM_PROOF.png          pn_FORM_login_dialog.png  pn_FORM_login_focused.png
pn_noise_home_{ON,OFF}_full.png   pn_noise_crop240_{ON,OFF}.png
pn_noise_on3backgrounds.png       pn_seam_pricing.png  pn_detail__tools_skills.png
pn_03_noise_clean.json  pn_08_stats.json  pn_26_perf.json
pn_12_focus2.json  pn_14_clip.json  pn_16_cliptight.json  pn_17_focusreal.json
pn_20_forms.json  pn_21_controls.json  pn_21_btndist.json  pn_22_boxproof.json  pn_25_detail.json
```

---

## 附 A · 方法学陷阱台账（下一轮直接复用）

这一节比任何单条 finding 都更值得留存——**每一条都已经在本轮真实骗过至少一个探针**。

| # | 陷阱 | 后果 | 正确做法 |
|---|---|---|---|
| 1 | **`elementFromPoint` 命中测试按视口坐标做** | 折叠以下的元素被静默丢弃 → dim4 因此断言「不存在暗底可聚焦元素」，漏掉本轮唯一的 P0 | 命中测试前先 `scrollIntoView`，或对折叠以下元素改用几何+祖先可见性判定 |
| 2 | **`transition-colors` 会过渡 `outline-color`** | focus 后立刻读 computed 会拿到从 currentColor 出发的插值，在深底按钮上伪造出「1.10:1 假 P0」 | 等 **≥400ms** 再采样 |
| 3 | **同一组件在 DOM 里有多份副本**（MenuDock 3 份） | 不做命中测试会把隐藏副本的「像素变化 0%」误报成「焦点环完全不可见」 | 先命中测试，再做像素比对；并与陷阱 1 联合使用 |
| 4 | **`html,body{overflow-x:hidden}` 架空标准溢出探针** | `documentElement.scrollWidth > clientWidth` 结构性恒 false，破版不可见/不可滚/不可测 | 用**元素级** `scrollWidth` + **裁剪后**的墨级碰撞检测 |
| 5 | **box 重叠 ≠ 视觉压字** | 未裁剪的 rect 会把 `overflow:hidden` 容器里溢出的内容算成碰撞（本轮首版探针在 1440 上误报 5 处碰撞，实际为 0） | 每个 rect 先与**所有** `overflow!=visible` 祖先求交，再与视口求交；并区分 `text×text` 与 `paint×text` |
| 6 | **Tailwind v4 的 alpha 修饰色计算成 `oklab()`** | 正则解析 `rgb(...)` 的审计会漏掉它们；更糟的是把 `oklab(0.967 …)` 的 0.967 当成 8bit 通道读 → **把浅色误判成深色**（本轮首版探针即因此误报 11 个「暗底可聚焦元素」） | 用 canvas `fillStyle` + `getImageData` 让浏览器自己换算，别写解析器 |
| 7 | **`getComputedStyle` 的 fontFamily 是声明不是现实** | 95.8% 元素声明 Google Sans，实际 0 命中 | 用 **CDP `CSS.getPlatformFontsForNode`**；旁证用 canvas 测宽/墨量 |
| 8 | **dev 下 `document.fonts` 会被懒加载 chunk 重置** | 报 0 loaded 却有 200 的 woff2 响应 | 不采信 `document.fonts.check()`，以 CDP + 网络面板为准 |
| 9 | **`bg-x/95` 匹配不到 `.bg-x` 选择器** | 全局装饰规则（noise）在半透明变体上静默失效 | 写全局装饰规则时用属性选择器或显式列出变体 |
| 10 | **促销弹窗自动弹出并劫持焦点** | 在 `networkidle` 后立刻 Tab，量到的是弹窗（4 元素死循环）而不是页面 | 测量前 `Escape`；建议给测试环境加开关 |
| 11 | **`rg -o '[^d][0-9]+vh'` 看不见 `h-screen`** | 「裸 vh 已清零」的结论被高估 | 类名形态的规则必须同时查**编译产物**，别只查源码 |
| 12 | **渐变底取最坏色标 = 系统性误报** | 4 个白字元素被误判 2.11:1，实测 5.44–8.82 全部通过 | 取真实字形行盒（Range）后**逐列**采背景 |

## 附 B · 计数口径分歧

沿用 `design-audit-2026-07.md` 的规矩：**不要直接引用任何单一数字**。

| 事项 | 数字 | 口径 |
|---|---|---|
| 排印元素总数 | **2549** / **2559** | app 节点 / app+ext(10) 全部节点。字号与字重分布用前者，字间距分布用后者 |
| 元素总数 | **8602** / **2549** / **12793** | 「有盒子」元素 / 「自带文本节点」元素（dim1） / 「可见」元素（dim2，不同路由集） |
| 颜色声明数 | **8050** / **21324** | dim2 的 28 路由采样 / 本文件 13 路由 4 属性全量 |
| 路由数 | **18** / **28** / **14** / **9~12** / **19** | 排印 / 色彩 / 布局 / 表单 / 交叉核对。**互不相同，见 §四.7** |
| 顶栏碰撞数 @390 | **14** / **16** | 裁剪后墨级 / 未修标签的首版探针（后者标签有 bug，几何有效） |
| `font-serif` 处数 | **38** / **60** | 剥重复组件 / 裸 `rg`（peer-review 5 组未消重，同一份代码被数两遍） |

---

*本文件所有实测数据采集于 2026-07-28，工作树 `cdd4be881` + 304 个未提交改动，Vite dev @ localhost:3001。*
*任何数字若与线上表现不一致，以线上重测为准——本轮没有测线上。*
