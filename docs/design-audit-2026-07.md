# Scholay 设计系统落地审计（查漏补缺）— 2026-07-27 首轮 / 2026-07-28 第二轮复核

**审计对象**：分支 `design/figma-token-layer`（B0→B8b 全部 commit 已落地）
**对照真源**：Figma `JIv8fxQthMS37JLGHNOEbB` / Page 1 / `Scholay设计系统` (node `1:38`)
**参照文档**：[figma-design-spec-2026-07.md](./figma-design-spec-2026-07.md) · [design-migration-ledger-2026-07.md](./design-migration-ledger-2026-07.md)

> 本文件是**审计结论**，不是新的迁移计划。台账（ledger）记录的是「打算怎么改」，
> 本文件记录的是「实际改成了什么样、哪些没兑现」。两者冲突时以本文件的实测为准。
>
> 📖 **本文件按时间叠加，不重写历史**。同一件事在不同章节可能有不同结论 ——
> **越靠后的日期越新**。想知道「现在怎么样」，先读 **§〇之四「第二轮复核 + 修复（2026-07-28）」**，
> 再回头看首轮章节的背景。已知被第二轮推翻/更新的首轮结论都就地打了 ✏️ 标记。
>
> 📏 **所有计数都带口径和日期。** 本文件历史上同一件事出现过多达 6 个不同数字，
> 全部收在文末「附：计数分歧」—— **不要直接引用任何单一数字**。

---

## 〇、落地进度（2026-07-27 首轮收尾）

> 原则：**Figma 明文规定的 + 纯 bug + 机制性的 → 全做；等设计师拍板的 → 全跳过。**
> 验证基线：`design-system-guard` **26/26 绿** · `tsc -b` 0 错 · `npm run build` 通过 ·
> 且故意注入 `text-[13px]` / `rounded-md` / `bg-gray-500` / `text-background` 四类违规，构建**确实被拦下**。

### ✅ 已落地

| 项 | 结果 |
|---|---|
| **护栏接进构建** | `prebuild` → `test:design`，因此 `Dockerfile:23 RUN npm run build` 也会跑。**17 条规则从未执行过 → 现在 26 条每次构建强制执行** |
| **护栏重写** | 修 `hits()` 缺 `/g`（一行只记首个匹配）· 新增 `stripComments()`（旧版会把「解释为什么合法」的注释判成违规，等于惩罚写注释）· hex 放宽到 3/6/8 位 · rgba 补裸黑白 · 旧标度正则补裸 `rounded`/`rounded-full`/`rounded-none` · 删 3 条各豁免 0 处的死 ALLOW · 新增 9 条规则 |
| **死 token 在 CI 显形** | 新规则：`@theme` 注册的 color token 必须有人用，已快照，**只能减不能增** —— 新建 token 不接线会直接 fail。⚠️ **本行原写的「83 个里 38 个死」是个失真数字**，四种口径互不相同，见文末「附：计数分歧」新增的专行 |
| **`--container-max` 回归修复** | 改名 `--container-page`。它曾劫持 Tailwind 内建 `w-max`/`max-w-max`/`min-w-max`（编译实证：同名规则后者胜出），把 `max-content` 变成 1440px 定宽。**并加护栏禁止 `--container-*`/`--spacing-*` 后缀撞保留字** |
| **正文基准 13 → 14px** | `body` 改到 `--text-14`（Figma §2.2 点名要干掉 13）。B6 迁了 2792 处类名却没改 body，隐式继承源头一直停在规范外的奇数档 |
| **字号命名空间封闭** | 补 `--text-*: initial`。编译实证 `text-3xl`/`text-6xl` 现已**编译不出类** |
| **删除过渡期死 token** | 9 个旧字号档 + 4 个旧圆角档（实测类名与 `var()` 引用均为 0）。`rounded-md` 现已编译不出 6px |
| **两处真 bug（字符串拼接丢空格）** | `MarkdownRenderer.tsx:219` / `ToolCallBlock.tsx:277` 拼出 `min-w-0text-14`，导致 `min-w-0`、`overflow-y-auto`、两个底色类、调用方字号全部失效。改用 `cn()` |
| **`rounded-r` 静默失效** | `struct-diff-decorations.ts` 三处 → `rounded-r-4`（`--radius-*: initial` 后它编译不出任何 CSS，Prism diff 块变直角） |
| **`text-background` 全站清零** | **145 → 0**。分流成 `text-on-dark`(85) / `text-on-brand`(121) / `text-foreground`（琥珀实底）。改造前 `--background` 是纯白，它恰好等价于「白字」；改米白后静默变米白前景 |
| **琥珀实底改深色字** | 回归 Figma §4.2 黑字口径：白字 on `#E5A800` = **2.11:1** → 墨黑字 = **7.77:1 AAA** |
| **对比度 token 修正**（全部独立验算，非照抄） | `--ring` 45%→50%（2.75 → 3.14/3.23，原注释「45% 恰好达标」方向反了，且援引的 SC 2.4.11 是错条款，应为 SC 1.4.11）· `--faint-foreground` 4.14 → **4.58**（它承载 676 处 12px 文本，「AA 大字 3:1」豁免不适用）· `--amber-soft-fg` 3.93 → **6.14**（原注释量错了背景）· `--status-warning` 2.99 → **5.21** · `--status-neutral` 3.89 → **4.70** |
| **暗底焦点环** | 实测 `#1F1F23@50%` on 恒暗段 = **1.00:1 完全隐形**。新增 `[data-surface='dark']` 覆写机制，并把零消费的 `--ring-on-dark-emphasis` 从 30%(2.70:1) 提到 45%(4.40:1) 接上用途 |
| **`outline-none` 焦点可见性** | 逐处判定：Radix 惯例保留 + 补注释；裸 input 核查外层 `focus-within` 可供性，缺的补上；可聚焦卡片（JournalPickerStep / TemplateCards 等）删掉 |
| **`ring-background` / `border-background` 误用** | 白卡内画米白圈（台账 R3 逐字点名未修）· 恒暗 banner 上幽灵按钮描边比自己的文字还亮 |
| **裸 `vh` → `dvh`** | 26 → **0**（iOS 地址栏会盖住弹窗底部按钮，付费入口踩过） |
| **inline style 逃逸** | 5 处 `borderRadius: 6` → 12 · 2 处 `boxShadow: rgba(0,0,0,.06)` → `var(--shadow-overlay)` · 4 处图表 tooltip 底色从米白改回白卡（否则与承载它的白卡融成一片） |
| **sonner 收编** | 保留 `richColors` + 覆写它的 12 个 CSS 变量指到 `--status-*`。⚠️ 台账原文写「关掉 richColors 再 hook 变量」，实测**该做法不成立**：关掉后 sonner 不给 toast 加 `data-rich-colors`，那 12 个变量一个都不会被消费，结果是 toast 退化成中性灰 |
| **静态资源** | favicon `#CC2222`（旧品牌红）→ `#882828`，圆角 6→8 · `theme-color` `#ffffff` → `#F6F4EE` · 海报导出底色 → 米白。✏️ **2026-07-28 补**：首轮**漏了 `og-image.png`**（当时仍是 `#FFFFFF` 底 + `#CC2222`），且**没意识到原地改内容对老用户无效** —— 完整处置与铁律见 §〇之四 |
| **文档回写** | `CLAUDE.md` §5 状态表（原表在**教人写会被 CI 拒绝的旧类名**）· 台账补 Q1~Q14 状态标注 + 「本文件是计划不是结果」的警示 |

### ⏭️ 首轮**刻意跳过**（等设计师拍板）

`--status-*` 改指（178 处状态芯片，阻塞于 Q2 色相）· Card 是否带描边（273 处）·
Badge 软底 vs Figma 5 实底 · `--primary` 语义与 Figma Primary 错位 · ~~noise 纸张质感开关~~ ·
按钮 42px 高度统一 · Playfair italic 去留 · 半档间距收口（已加棘轮钉住 1357 不许涨）

> ✏️ **2026-07-28 更正**：noise 已不在此列 —— 第二轮拍板**开启**，
> `index.html:2` 实测为 `<html lang="zh-CN" data-paper="on">`。见下文 §〇之四。

---

## 〇之三、第二批落地（2026-07-27）

主题：**把 token 真正接到第三方与 JS 常量上**（对应根因 RC1「建了 token 没接线」与 RC2「迁移只认类名」）。

| 项 | 结果 |
|---|---|
| **`theme-bridge.ts` 建立** | 台账 §2.14 承诺的产物首次存在。三种模式各自写明适用判据：passthrough（`var()`，能用就别用 resolved）/ resolved（`tokenValue()`，消费方要做色彩运算时）/ 不需要桥接 |
| 🔴 **推翻台账的一条核心断言** | 台账说「html-to-image 离屏克隆丢 CSS 变量，海报必须用字面值 + 不变量测试防漂移」。**该断言是错的** —— `html-to-image@1.11.13` 的 `clone-node.js:169` 走 `getComputedStyle` 再 `setProperty`，而 `getComputedStyle` 返回**计算值**，`var()` 在那一步已被替换成 `rgb()` 字面量。**所以海报直接用 design token 即可，结构上不可能漂移** —— 比「字面值 + 测试防漂」更好：不需要测试去防一个不存在的漂移 |
| **海报去硬编码** | 46 处 hex 清零（含 34 处**两代前**的废弃品牌色 `#CD2323`/`#2A7A2A`/`#DD9D13`）。顺带消掉一份手搓的 Scholay 文字标副本 —— 它的字母配色映射与 Figma **完全不同**（小写 vs 全大写、颜色循环也不一样），改用从 Figma 导出的 `ScholayWordmark` |
| **hex 棘轮 116 → 40** | 并**删除 `share/` 整目录豁免**（它的理由已被证伪）。海报的 3 处 `rounded-[6px]` 也按 B5 既定目标迁到 `rounded-8` |
| **5 份分类色板收口** | 19 个 hex 下线 → `--cat-*`。旧色板里有 6 个蓝调（与「无蓝系 + 降饱和」正相反）+ 已退休的旧品牌绿（会让用户误以为「绿头像有语义」）。逐组合实算 WCAG，修掉 2 处换底后掉出 AA 的前景 |
| **recharts + mermaid 接线** | `PIE_PALETTE` 里 5 个赤裸的 Tailwind 500 档 hex → `chartTheme.series`；mermaid 从 `theme:'neutral'` + **0 个 themeVariables** 改为 `theme:'base'` + 全套映射（此前 AI 回答里所有流程图配色完全在设计系统之外） |
| **RC5 十文件重复消除** | 保留 `shared/` 那份（依赖注入 + 分层正确），删掉 `features/` 那份，21 个消费点切路径。流式态改由 `LiveRecordPanels.tsx` wrapper 注入，**订阅时机逻辑原样保留**（必须等 3 位审稿人都出报告再订阅，否则主审直播被整段错过） |
| **Playfair 补齐字重** | 改造前只自托管 **700 一个静态字重**，13 处 `font-medium`/2 处 `font-normal` 全在跑浏览器合成假粗体 —— **`BrandName` 的三个 tone 渲染出来完全一样**。换成可变字体（wght 400–700 一个文件），比自托管三个静态字重还省（58KB vs 3×20KB） |
| **Noto Serif SC 自托管** | 台账称的「本维度最严重的洞」补上：38 处 `font-serif` 的中文此前全部降级到系统宋体，mac/win/linux 三平台字形不一致，完全在设计系统之外。镜像 Google 的 **101 个 unicode-range 分片**（可变字体 wght 400–900），由 `scripts/sync-noto-serif-sc.mjs` 可复现生成。⚠️ **不自己 pyftsubset 成单文件**：那样约 800KB，任何用到 `font-serif` 的页面都要整包下载；分片 + `unicode-range` 是按页面实际出现的字符按需拉，一个中文页面通常只命中 5~15 片。**CJK 上分片是唯一正解**。代价：仓库 +5.9MB 二进制 |
| **护栏两处补洞** | ① 裸 `vh` 规则漏放 `min()/calc()` 内的 vh，已漏过 `QuickOpenPaperDialog`（命令面板，最容易被 iOS 地址栏顶掉底部）—— **当时护栏是 26/26 全绿，绿灯不等于清零**；② `stripComments()` 之外补了 theme-bridge 豁免 |
| **新增编译期契约测试** | `tests/design-tokens-compiled.test.ts`（25 条）—— 用仓库自己的 `tailwindcss` 真编 `globals.css` 再逐类断言。**它管的是 grep 永远查不到的一类 bug：源码完全合规，是 token 层自己的声明与编译产出对不上。** 本轮四个最贵的问题全属此类（`--container-max` 劫持 `w-max`、裸 `rounded` 编译不出、`rounded-full` 封不住、`duration-*` 无命名空间）。现在锁住：六档字号**绝不附带 line-height**（globals.css 自己警告过的「整套排印当场作废」陷阱）、封闭集合真的封闭、`w-max` 仍是 `max-content`、写进 CLAUDE.md「以下是全部可用」的 token 必须真能编译出类。两套护栏共 **51 条**，都在 `npm run build` 里 |

### ⚠️ 本批引入的用户端可见变化（消重的必然结果，需产品确认）

两份副本的既有分叉在消重后以 **shared 版**为准，用户端会看到三处：
1. `ReviewerDetailPanel` 的「审稿人 X 正在通读稿件…」由 `text-14` 缩到 `text-12`
2. `StatusGrid` 三处卡片圆角 `rounded-12` → `rounded-16`（**更符合分层口诀**：直接坐在页面底的卡片 → 16）
3. 初审格「通过」徽章圆角 `rounded-4` → `rounded-pill`
4. `JournalCover` 底部期刊全名透明度 70% → 85%（被 `--cat-6` 的对比度倒逼，非审美选择）

### 📋 仍未做、且**不依赖设计师**的（下一批）

> **2026-07-28 复核后逐条标状态**（实测口径见 §〇之四）。上一版这张清单没有状态列，
> 读者无法区分「还没开始」与「已经做掉一半」。
> ⚠️ 下表数字均为**剥注释**口径（同 guard 的 `stripComments()`）。裸 `rg` 会把注释里讨论到的类名
> 计成用法 —— 实测 `h-control-*` 裸 `rg` 6 处 / 剥注释 2 处，差 3 倍。

| # | 项 | 2026-07-28 状态 |
|---|---|---|
| ① | `max-w-page`(1440) 接线 —— Figma §5 的第一条明文布局规范 | ❌ **仍未做**。消费仍是 **0**（仅有的两处文本命中都在注释里：globals.css 的说明、`peer-review/RecordDetailPage.tsx:129` 自陈「`max-w-[1400px]` 是历史值，Figma §5 是 1440」）；全站 **52 种 `max-w-*` 类名 / 236 处**（首轮报「41 套」是另一种口径，见计数分歧表） |
| ② | 控件高度阶梯接线 | 🟡 **开了个头，但少到能逐条列完**：`h-control-*` 从 0 变成 **2 处** —— `browser/QuickOpenPaperDialog.tsx:83`(`h-control-xl`)、`sidebar/SidebarCollapse.tsx:81`(`h-control-md`)；裸 `h-7/8/9/10/11` 实测 **408 处**。`size-avatar`/`size-icon`/`size-icon-inline` 仍是 **0** |
| ③ | cva 采用率 | ❌ **仍未做**：`shared/ui` 下 25 个 .tsx，导入 `class-variance-authority` 的是 **3 个**（首轮报 3/26，分母差 1 是期间文件数变化） |
| ④ | 剩余死 color token 中非 Q2 阻塞的部分 | 🟢 **推进明显且仍在动**：guard 快照的 37 项里已有 **12 项接线复活**（`amber-soft`/`amber-soft-fg`/`cat-1,3,5,7`/`chart-1,3,5,7`/`chart-axis-fg`/`chart-grid`），同口径实测 **25 → 23**（同一个下午测两次就掉了 2）。**但 guard 的 `KNOWN_DEAD` 快照仍是 37，没跟着收紧** —— 棘轮凭空多出十几格免费额度，**收口做完后必须回去把快照压到实测值** |
| ⑤ | 一轮真实渲染取证（Playwright computed-style 对账） | ❌ **仍未做**：`package.json` 无 playwright 依赖与脚本，`tests/e2e/` 目录不存在。**本文件至今没有一条结论来自真实渲染** |

---

## 〇之四、第二轮复核 + 修复（2026-07-28）

> 性质：**多代理并行的第二轮**——一批代理改渲染层代码，一份代理（本节作者）只改文档。
> 因此本节所有计数都是**并行修复中途的快照**，每条都给了复现命令；
> **数字会继续变，日期戳不等于当前值**。

### 本轮拍板 / 落地

| 项 | 结果 |
|---|---|
| **noise / `data-paper` 开启**（原 Q3） | `index.html:2` 实测 `<html lang="zh-CN" data-paper="on">`。这条**此前是本文件与代码最严重的一处直接互斥**：§四 写「落地度 0% / `data-paper` 全仓从未被设置」，而属性就在 index.html 第 2 行。已改 |
| ~~控件字号 12 → 14~~ **已撤销** | 曾按 Figma §4.1/§4.5 把 `shared/ui` 的 button / input / textarea / select / tabs / dropdown 项基座从 `text-12` 抬到 `text-14`,**2026-07-28 产品评估后全部回退**。原因:Figma 的 `120×42` 是展示级按钮规格,而本产品是高信息密度科研工具,同屏控件远多于设计稿场景,14px 会让工具条/表格行/侧栏成片撑开。「控件字比正文小一档」在本产品是**有意层级**而非倒挂。已在 `button.tsx` 文件头与 `frontend-user/CLAUDE.md` 写死为**刻意偏离**,后续审计不要再当漏改报 |
| **`duration-*` 的文档误导修正 + 根因定位到可修** | `frontend-user/CLAUDE.md` §5 此前把 `duration-fast/base/slow/deliberate` 当**可用 Tailwind 类**教，实测**四个全部编译不出任何 CSS** —— 这是**静默失效**：写了不报错，只是没有过渡。本轮把根因从「Tailwind v4 没有 `--duration-*` 命名空间」**收窄成一行可修的事实**：`duration-*` 工具类读的是 **`--transition-duration-*`**，globals.css 声明的是 `--duration-*`，**差一截前缀**。对照探针：注册 `--duration-probe` → `duration-probe` 编译不出；注册 `--transition-duration-probe` → 正常产出 `.duration-probe { transition-duration: … }`。**修法 = 改注册名**（本节写作时 globals.css 仍是 `--duration-*`，本轮**只改了文档**，token 层未动） |
| **顺带认领一处「已经做对的」** | `shared/components/chat/HtmlRender.tsx:69` 写的是 `duration-[var(--duration-base)]` —— arbitrary 引用 `var()` 是**能正常编译**的，旁边还留了原因注释。这是修好之前的正确写法，已写进 §5 作为范例。（⚠️ 用裸 `rg 'duration-(fast|base|slow|deliberate)'` 会把它误报成「写了失效的具名类」——本轮第一遍就误报过一次，逐行读代码才排除） |
| **`motion.ts` 与 CSS 并未真的共用数值** | 顺带实测出的第二层事实：`shared/lib/motion.ts` 里是**字面秒数**（`0.42` / `0.18` / `0.22`），并不引用 `--duration-*`，其中只有 `0.42` 恰好等于 `--duration-slow`。globals.css 注释里「CSS 侧与 TS 侧必须共用同一组数值」描述的是**目标而非现状** |
| **死 token 四个口径澄清** | 见文末「附：计数分歧」新增专节。要点：guard 的死 token 规则**只 `walk(src)` 收 `.tsx?`、不扫 `globals.css` 自身**，所以被它报死的那一批里，**真正没有任何消费者的只有 2 个**（`--color-disabled` / `--color-placeholder`）；其余都正被 globals.css 消费 —— 尤其 `--status-*` 整族在给 sonner 供色，**toast 配色是真在渲染的**。收紧棘轮时别把它们当死代码删掉 |
| **`CLAUDE.md` §5 全清单逐类编译核对** | 用仓库自己的 `tailwindcss` 实编 `globals.css` 逐类探针，覆盖 §5 声明「可用」的每一族。结论：**除四个 `duration-*` 外全部真能编译得出**；反向也复核了 `text-sm/base/lg/3xl`、`rounded-sm/md/lg`、裸 `rounded`、`rounded-r` 确实编译不出，而 `rounded-full` / `rounded-none` 仍编译得出（static utility，`--radius-*: initial` 封不住）；`w-max` 已恢复成内建 `max-content` |
| **根 `CLAUDE.md` 前端描述纠正** | 根文档的「Frontend Architecture」「Key Dependencies」「Slider CAPTCHA」「Custom Icon System」等节仍在描述**已删除的 CRA 版**（`src/services/api.js` / `AuthContext` / `SearchIcons.js` / `SliderCaptcha.js` / `ICONS_PREVIEW.md` / `SEO_*.md` 全部实测不存在，`src/` 下 `.js` 文件数为 0；React 18→19、RR v6→v7）。已改 |

### 🔴 本轮最容易被重复踩的坑：**改静态资产必须换文件名**

这条单独拎出来，因为它**不是设计问题，是缓存问题，且修错了完全看不出来**。

事实链（全部实测）：

1. `favicon.svg` / `og-image.png` 是**固定文件名**、不带内容 hash 的品牌资产。
2. nginx **两层**都会给 `.png` / `.svg` 打 `Cache-Control: public, max-age=31536000, immutable`：
   - 前端容器内：`frontend-user/nginx.conf` 的 `location ~* \.(jpg|jpeg|png|gif|ico|svg|webp|css|js)$`
   - 边缘反代：`nginx/conf.d/user.conf` 的同类 location，而且它用 `proxy_hide_header Cache-Control`
     **抹掉上游头之后自己重打** —— 所以**只改前端那份会被边缘层原样覆盖回去，两层必须同时改**。
3. `immutable` 的语义是「一年内不要回源校验」。**对已经访问过的老用户，原地改文件内容完全无效** ——
   他们看到的永远是旧品牌红。已抓取过 `og:image` 的社交平台（微信 / Twitter）缓存更久且不受我们 TTL 控制。

本轮的处置（两件事都做了，**缺一件都会留下长尾旧版**）：

- ① 两层 nginx 都新增一条**排在静态正则之前**的 location，把
  `favicon.svg` / `og-image*.png` / `apple-touch-icon*.png` / `manifest.webmanifest` 降到 `max-age=86400`
  （nginx 正则 location 按出现顺序首个命中生效，**写在后面永远轮不到**）
- ② `index.html` 换 URL：`/favicon.svg?v=2`、`og-image-v2.png`（并保留 `og-image.png` 同内容副本，
  让历史分享链接在缓存过期后也能自愈）

实测取色确认内容已换代（PIL 取前 5 大色）：

| 文件 | 本轮修复前 | 本轮修复后 |
|---|---|---|
| `public/og-image.png` | `#FFFFFF` 底 / `#CC2222` / `#111111` / `#444444` / `#888888` —— **两代前的旧色** | `#F6F4EE` / `#882828` / `#1F1F23` / `#686873` / `#6E6E78` |
| `public/og-image-v2.png` | 不存在 | 同上（与 `og-image.png` 内容一致） |
| `public/favicon.svg` | `#CC2222`、圆角 6 | `#882828`、圆角 8 |

> **铁律**：以后再改任何**不带内容 hash 的**静态资产（favicon / og / manifest / apple-touch-icon），
> **必须同时**做「换 URL」和「降 TTL」两件事，并且 TTL 要在**两层 nginx** 上都改。
> 只做其中任何一件，对老用户和已抓取的平台都等于没改 —— 而你本地强刷一下看着是好的。

### 本轮**未**触碰

`--status-*` 改指（仍阻塞 Q2）· Card 描边（Q 新增项）· Badge 实底 vs 软底 · `--primary` 语义错位 ·
按钮 42 高度统一 · Playfair italic · 半档间距 · 上文「📋 仍未做」表里标 ❌ 的 ①③⑤。

> 📏 **半档间距顺带纠一次口径**（2026-07-28 实测，三个数都对，问的问题不同）：
> guard 自己的口径（`0.5|1.5|3.5|5|7|9|11`，注释已剥离）= **1293**，棘轮基线 **1357**，
> 因此**当前未突破、还剩 64 格余量**；只数 `.5` 小数档 = **1401**；不剥注释的裸 `rg` = **1423**。
> 首轮正文里的「1357」「1142」「~750」各是又一种口径。
> **这一维度已经出现过 6 个数字，任何单一数字都不要直接引用。**

---

## 〇之二、审计方法与可信度

| 项 | 说明 |
|---|---|
| 覆盖 | 12 个维度并行全量审计 + 逐维度对抗式验证（25 个 agent，1300+ 次工具调用） |
| 产出 | 157 条原始 finding → 对抗验证推翻 19 条 → **138 条存活 → 归并去重后 61 条独立问题** |
| 计数方式 | 一律 `rg --text`（本仓库 83 个 .tsx 含非 UTF-8 字节，BSD grep 会静默跳过） |
| 编译验证 | 用仓库自带 `tailwindcss@4.3.0` 的 `compile()` API 实编 `globals.css`，逐类探针 |
| 构建基线 | `tsc -b` 0 错 · `npm run build` exit 0 · `design-system-guard.test.ts` 17/17 绿 |

**局限（下一轮必须补）**：
- 全部结论来自静态分析 + 编译探针 + 对比度计算，**没有一条来自真实渲染**
- 没有独立的「纸张质感 / noise」维度、没有「响应式与移动端」维度、没有按 feature 的纵向走查
- 计数受 R12 重复组件污染（peer-review 5 组未消重，`font-serif` 60 处里 42 处是同一份代码被数两遍）

---

## 一、三句话结论

> ⏱️ **本节写于 2026-07-27 首轮开工前，描述的是【当时】的状态。** 三条里已有两条被后续工作改变，
> 就地标注如下。保留原文是为了让「问题原本有多大」可比较，**不要把它当作现状**。

1. **token 层 ≈ 100% 落地，渲染层 ≈ 30% 落地。**
   `globals.css` 1114 行写完了整套规范并用**完成时态**描述自己，但实测 **130+ 个新 token 零消费**
   （`--status-*` 10 个、`--cat-*` 16 个、`--chart-*` 10 个、色阶原语 48 个、§11 布局尺寸 24–28 个、
   ring 族 4 个、motion duration 4 个）。**只读 globals.css 会得出「迁移已完成」的完全错误结论。**

   > ✏️ **2026-07-28**：结论**方向仍成立**，但个别族已接线 —— `--cat-*` 与 `--chart-*` 两族的非 soft 档
   > 已在第二批收口（见 §〇之三），`--status-*` 仍阻塞 Q2，`motion duration` 4 个**仍编译不出**（§〇之四）。
   > 现在的口径化数字见文末「附：计数分歧 → 死 color token」。

2. **防回潮机制是装饰性的。**
   `tests/design-system-guard.test.ts` 自称「构建期硬失败」，实测不在 `package.json` 的 `build`
   （`build: tsc -b && vite build`）、不在 `Dockerfile:23`、不在任何 hook/CI ——
   **17 条规则从未自动执行过一次**。且即使跑起来也拦不住：按行计数漏 853 处、3 位 hex/8 位 hex/
   inline style 全部逃逸、3 条 ALLOW 是死条目。

   > ✏️ **2026-07-28：这条已被修复，不要再引用。** `package.json` 的
   > `prebuild: node scripts/copy-pdf-cmaps.mjs && npm run test:design` 把
   > `design-system-guard.test.ts` + `design-tokens-compiled.test.ts` **挂进了每次 `npm run build`**
   > （含 Docker 构建）。**遗留的是棘轮基线没跟着收紧**（死 token 快照 37 vs 实测 23–25），
   > 那是「护栏太松」而不是「护栏没接」。

3. **最高价值的修复不是逐处替换，而是 4 个 token 值 + 3 行改名。**
   改 `--status-warning` / `--amber-soft-fg` / `--faint-foreground` / `--ring` 四个值，
   把兼容层两行改指 `--status-*`，`--container-max` 改名 —— 就能一次性修掉
   178 处状态芯片、46 处不可读黄字、676 处 4.14:1 文本、全站焦点环 WCAG 不合格、两处被改坏的线上布局。

---

## 二、六个跨维度根因

### RC1 · 建了 token，没接线（合并 30 条）

所有色彩/尺寸/动效 token 族都是同一个模式：**定义写完、推导论证写满、@theme 注册（部分连注册都漏了）、零个消费方**。

| token 族 | 定义处 | 实测消费 | 现实中在用什么 |
|---|---|---:|---|
| `--status-*` (12) | `globals.css:206-217` | 仅 info 6 处 | 品牌红/绿/琥珀直接当状态色 |
| `--cat-1..8` + soft (16) | `globals.css:231-261` | **0** | 5 份硬编码色板，含 6 个蓝调 + 已退休旧品牌色 |
| `--chart-1..8` (10) | `globals.css:265-268` | **0** | `UserMetricsPanel.tsx` 5 个 Tailwind 500 档 hex |
| 色阶原语 `--ink/red/green/amber-1..12` (48) | `globals.css:52-72` | **0** | 语义层抄字面 hex + 注释写 `= ink-5`；**改原语不会移动一个像素** |
| §11 布局尺寸 (28) | `globals.css:388-440` | **0**，其中 9 个连 `@theme` 都没注册 | 13 个裸高度档 + 41 套 max-w 口径 |
| ring / focus 族 (4) | `globals.css:479-481` | **0** | 全局 outline，无任何容器覆盖机制 |
| motion duration (4) | `globals.css` §十五 Motion 段（⚠️ 首轮写的行号 509-512 已失效，globals.css 一直在动，**别引用行号，按小节名找**） | **0**，且**编译不出类**（见 RC3）—— 2026-07-28 复核**仍然如此，本项未修** | 11 处 Tailwind 默认 `duration-150/200/300/500` + 1 处 `duration-[var(--duration-base)]`（正确写法）+ `shared/lib/motion.ts` 的字面秒数（`0.42`/`0.18`/`0.22`，只有 `0.42` 与 `--duration-slow` 数值相同） |

**连带伤害**：`frontend-user/CLAUDE.md` §5 把这些零消费 token 当作「以下是全部可用」教给开发者 ——
新人写 `bg-status-success` / `h-control-md` / `duration-base` 会成为全站第一个用户，或者**根本编译不出类**。

### RC2 · 批量迁移只认 Tailwind 类名（合并 18 条）

B4/B5/B6 的 codemod 与 guard 用同一套类名正则，因此非类名形态的样式**既没被迁移，也不被护栏发现**：

- **inline style 对象**：5 处 `borderRadius: 6`（`DashboardPage.tsx:300` / `UsageStatsPage.tsx:106` / `AnalyticsPage.tsx:390` / `JournalTrendChart.tsx:148` / `UserMetricsPanel.tsx:201`）、2 处 `boxShadow`、35 处 `fontSize: 9/10/11`、2 处裸 `zIndex`
- **JS 常量数组**：`JournalCover.tsx:11`（8 色里 6 个蓝）、`pick-avatar-color.ts:6`、`SharedReceivePage.tsx:598`（全是旧品牌色）、`figure/compose.ts` + `icon-pack.ts` 191 处
- **CSS-in-template-string**：`shared/components/chat/styles.tsx:57-58` 是一整张注入式样式表，含旧品牌绿 `#2A7A2A`；guard 的「无第二份样式表」规则只 walk `.css` 后缀，完全看不见
- **第三方库自带主题**：`providers.tsx:77` sonner `richColors`、`MermaidDiagram.tsx:25` `theme:'neutral'` 0 个 themeVariables、`LatexEditor.tsx:21` 硬编 fontFamily/lineHeight
- **静态资源**：`public/favicon.svg` 仍 `#CC2222`（旧品牌红）、`index.html:11` `theme-color` 仍 `#ffffff`

### RC3 · 护栏未接线 + 正则本身有缺陷（合并 15 条）

除未接 CI 外，护栏自身五类缺陷：

- `hits()` 无 `/g`，**一行只记首个匹配**（`design-system-guard.test.ts:33`）—— 正是该文件第 158 行自夸「写成测试就没有 grep 盲区」所要避免的问题。hex 规则实测漏计 **853 处**，往已有行追加违规完全免费
- hex 正则 `/#[0-9a-fA-F]{6}\b/` 放行 3 位/8 位；rgba 用黑名单只列了 3 个 Tailwind 灰，放行 `rgba(0,0,0,*)`
- 旧标度正则要求带档位后缀，**放行裸 `rounded`** —— 已造成 `struct-diff-decorations.ts:21,22,24` 三处 `rounded-r` 静默失效
- 三条死 ALLOW（`features/landing/` 整棵子树、`share/`、`prism/Latex`）各豁免 0 处 = 三个目录永久后门
- 棘轮从设立起一格未走：hex `BASELINE=72` 实测恰好 72（零余量）；arbitrary 字号 `BASELINE=46` 中 26 格被 `share/` 占用，留 2 格免费额度 —— **台账 B8 写的验收方法「故意提交 `text-[13px]` 看 CI fail」实测不会 fail**

**编译探针实证**（本次审计独立复现）：

| 探针类 | 编译结果 | 含义 |
|---|---|---|
| `w-max` / `max-w-max` / `min-w-max` | 产出**两条同名规则**，theme 版在后胜出 → `var(--container-max)` = 1440px | 🔴 内建 `max-content` 被劫持 |
| `rounded-r` / 裸 `rounded` | ❌ 编译不出任何规则 | 🔴 三处 Prism diff 块圆角静默失效 |
| `duration-fast/base/slow/deliberate` | ❌ 编译不出任何规则 | 🔴 ✏️ 2026-07-28 把根因收窄了：不是「Tailwind v4 没有 duration 命名空间」，而是**它叫 `--transition-duration-*`**，globals.css 写的是 `--duration-*`。对照探针：`--duration-probe` ❌ / `--transition-duration-probe` ✅。**改注册名即可修** |
| `rounded-full` / `rounded-none` | ✅ 正常产出 | globals.css:626「封闭后编译不出类」的说法**是错的**（static utility 封不住） |
| `text-3xl` / `text-6xl` | ✅ 正常产出（Tailwind 默认 30/60px） | 🔴 `--text-*: initial` 未加，字号命名空间从未封闭 |

### RC4 · 文档用完成时态描述未完成的事，且互相佐证（合并 14 条）

| 文档 | 错误陈述 | 实测 |
|---|---|---|
| `globals.css:153` | 「已收口到 theme-bridge 的 posterPalette + 不变量测试」 | **`theme-bridge.ts` 不存在**，`poster-theme.ts` 不存在，海报 36 处旧色原样 |
| `globals.css:992` / `:472` / `guard:185` | 「45% alpha 恰好达标 ≥3:1，不能靠调淡」 | 实算 **2.75:1**，方向反了（必须调**浓**）；条款号也错（应为 SC 1.4.11） |
| `globals.css:522` | 「`@theme inline` 不会把变量发到 `:root`」 | 编译产物证伪 —— 正是这个泄漏让 body 拿到 13px |
| `globals.css:264` | 「相邻明度差 ≥15%（色盲可分）」 | chart-1→2 差 **0.8pt**，deuteranopia 下对比 1.21 = 同色 |
| `globals.css:391,395` | 「✅ 已对齐」 | 该 token 零消费 |
| `CLAUDE.md` §5 状态表 | 「字重 ❌ 未开始，1030 处待降」 | `font-semibold` 实测 **0**，guard 已把它设为硬失败 —— **文档在教人写会被 CI 拒绝的代码** |
| `ledger:396-414` §2.8 | `--radius-md: 0.75rem /* 12px */`、`rounded-md → 浮层` | 落地改成数值命名，照文档写 `rounded-md` 拿到 **6px**（Figma 点名要干掉的值） |

### RC5 · B0 的前置消重没做，后续批次真实分叉（合并 2 条 + 污染全部计数）

台账 B0③ 承诺消除 7 组重复组件，**只做了 2 组**（ConfirmDialog / DimensionSettingsDialog）。
剩下 peer-review 5 组在 B5/B6 期间**真实分叉**：

- `features/peer-review/components/record/StatusGrid.tsx:67` `rounded-12` vs `shared/components/peer-review-record/StatusGrid.tsx:76` `rounded-16`
- 同两文件 `:172` `rounded-4` vs `:181` `rounded-pill`
- `.../record/ReviewerDetailPanel.tsx:214` `text-14` vs shared 副本 `:213` `text-12`

**同一份审稿记录，用户端与后台圆角/字号不同。** 这正是台账 R12 预言的后果。

### RC6 · `--background: #FFFFFF → #F6F4EE` 的爆炸半径未穷举（合并 5 条）

B4b 的 commit message 自称「227 个改动文件逐一比对，零越界」，但判定只覆盖了 `bg-background` 一种类名形态：

- **145 处 `text-background`** —— 迁移前恰好等价于纯白所以合法，现在静默变**米白前景**。
  `NotificationBell.tsx:50`（红底计数徽标 = 米白字）vs `MobileSearchOverlay.tsx:245`（同一元素用 `text-on-brand` = 纯白）—— 同一个红底徽标两种白
- **4 处 inline `var(--color-background)`** —— 图表 tooltip 从白变米白，与承载它的白卡融成一片；
  而第 5 个图表 `JournalTrendChart.tsx:147` 没设该属性，吃 recharts 默认纯白 → 同一产品两种 tooltip 底色
- **`ring-background` 挖空描边** —— `LibraryReferencePicker.tsx:341` 在纯白 Dialog 内画米白圈（台账 R3 逐字点名过这一行，未修）

---

## 三、可执行收尾清单

### 🔴 P0 — 一行/几行改动，用户立刻可见（半天内可全部完成）

| # | 动作 | 位置 | 为什么排第一 |
|---|---|---|---|
| 0 | **把 guard 接进 build**：`"build": "vitest run tests/design-system-guard.test.ts && tsc -b && vite build"` | `package.json:10` | 不接线，下面所有修复会回潮。唯一的机制性前置 |
| 1 | 补回两处字符串尾部空格 | `chat/MarkdownRenderer.tsx:219`、`chat/ToolCallBlock.tsx:277` | **真 bug**：拼出 `min-w-0text-14` / `overflow-y-autobg-warning-soft`，导致 `min-w-0`、`overflow-y-auto`、两个底色类、调用方字号**全部失效**。是 commit `5c24c54a3`「修复批量迁移损坏」漏掉的两处；影响智能搜索/助手/审稿三条链路 |
| 2 | `--container-max` 改名 `--container-page` | `globals.css:414,796` + `MenuDock.tsx:280`、`SpreadsheetPreview.tsx:63` | Tailwind v4 用 token 后缀直接生成类名，`--container-max` **劫持内建 `w-max`/`max-w-max`/`min-w-max`**（编译验证：同名规则后者胜出）。改造前无此 token → **迁移引入的回归**，两处线上被压成 1440px 定宽 |
| 3 | `--ring: 0.45 → 0.50` + 改掉三处错误注释 | `globals.css:477,472,992` + `guard:185` | 实测 2.75:1，WCAG 不合格；三处文档互相引用同一个未验算的数字形成「已审计」假象 |
| 4 | 四个 token 值修正：`--status-warning #B28300→#805E00`、`--amber-soft-fg #806A2E→#664B00`、`--faint-foreground #757580→#6E6E78` | `globals.css:210,94,107` | **单点撬动最大**：改值让后续 46+13+676 处替换全部达标；不改值先改类名会把不可读问题从品牌色搬到状态色 |
| 5 | 兼容层两行改指：`--color-danger-soft` / `--color-warning-soft` → `--status-error-soft` / `--status-warning-soft` | `globals.css:894-895` | **一行改动让 178 处状态芯片同时正确**，无需逐处改（前提：Q2 拍板） |
| 6 | 4 处图表 tooltip `var(--color-background)` → `var(--color-surface-card)`，`JournalTrendChart.tsx:147` 补齐 | `UserMetricsPanel.tsx:200` 等 | RC6 遗漏，tooltip 与白卡融成一片 |
| 7 | 5 处 `borderRadius: 6 → 12`，删 2 处 `boxShadow` | `DashboardPage.tsx:300,303` 等 | Figma 点名干掉 6 + 0 个 DROP_SHADOW；同屏浮层两种圆角 |
| 8 | 3 处 `rounded-r → rounded-r-4` | `struct-diff-decorations.ts:21,22,24` | `--radius-*: initial` 后**已静默编译不出类**，Prism diff 块变直角 |
| 9 | favicon `#CC2222→#882828`；`theme-color #ffffff→#F6F4EE` | `public/favicon.svg`、`index.html:11` | 标签页是唯一的品牌露出；PWA 顶部出现可见色带接缝 |
| 10 | 关掉 sonner `richColors` | `app/providers.tsx:77` | 全站最高频状态色场景，完全在设计系统之外 |
| 11 | `toPng backgroundColor '#ffffff' → '#F6F4EE'` | `share/ShareSheet.tsx:355` | 台账逐字点名，导出图边缘出白边 |

### 🟠 P1 — 中等成本，用户可见（1–2 周）

1. **无障碍批**（做完 P0#4 后是纯类名替换）：46 处 `text-brand-amber`→`text-status-warning`、23 处琥珀实底改深色前景（`text-on-brand`→`text-foreground`，实算 7.77:1 AAA，正好回到 Figma §4.2 的黑字口径）、13 处 `text-prism-badge-fg`、676 处 `text-faint`（token 已修则零改动）、**13 处 `outline-none` 删除**（`JournalPickerStep.tsx:207` 等，硬关掉全站唯一焦点环，WCAG 2.4.7 键盘焦点完全不可见）
2. **145 处 `text-background` 分流** → `text-on-brand` / `text-on-dark`，并加护栏「`text-background` 一律禁」
3. **海报子系统**（唯一会被转发到站外的资产）：建 `poster-theme.ts` 常量 + 不变量测试，替换 36 处旧品牌色 + 4 处 `rounded-[6px]`；然后把 guard 的 `share/` ALLOW 从「整目录」收窄为「只允许引用 posterPalette」
4. **5 份分类色板 → `--cat-1..8`**：期刊封面/学者头像现在是一片高饱和蓝紫（与「降饱和 + 无蓝系」正相反）；`#2A7A2A` 出现在头像色板会被误读为状态标记
5. **字体资产**：补 Playfair 400/500（当前 `BrandName.tsx:27-29` 三个 tone 渲染完全相同）；裁掉 landing 15 处作用在**纯中文**上的 `italic`（CJK 无斜体，浏览器几何斜切宋体，48px 首屏大标题）；Noto Serif SC 二选一（补子集 or 改语义 + 写偏离说明）
6. **移动端 dvh / safe-area**：29 处裸 `vh` → `dvh`（`subscribe-dialog.tsx:202` 付费入口底部按钮会被 iOS 地址栏盖住）；`MobileBottomNav.tsx:54` 裸 `env()` → `--safe-bottom`
7. **搜索框收口**：6 种实现 5 种高度（36/38/44/48/52），接 `--border-control`（Figma §4.5 唯一明确要求的深色 1px 实边，实测零采用）

### 🟡 P2 — 机制性修复（低成本高杠杆，可与 P1 并行）

- **guard 正则修复**：`hits()` 加 `/g` 并重设全部 BASELINE；hex 放宽到 3/6/8 位；rgba 改白名单制；旧标度正则补裸 `rounded`/逻辑方向类；字号补 `6xl~9xl`；补 arbitrary 宽高 / 半档 / inline-style / `font-bold` on sans / `zIndex:` 五条棘轮
- **删三条死 ALLOW**；`share/` 补进 arbitrary 字号规则的 ALLOW 并把 BASELINE 46→18
- **封闭剩余命名空间**：`--text-*: initial`（前提已满足，`text-3xl/5xl` 实测已归零）、`--shadow-*` / `--leading-*`；删掉 `--radius-sm/md/lg/xl` 8 行死定义（`rounded-md` 至今仍编译成 6px）
- **`CLAUDE.md` §5 状态表重写**（字号 ✅ / 圆角 ✅ / 字重 ✅ / 间距 🟡挂起于 Q8），并把兼容层旧色名（520 处调用点）补进「可用 token」表或标注为待删
- **台账回写**：§2.8 圆角命名（现在会主动误导）、Q1~Q14 加状态标记、§五 的 ✅ 勾
- **`twMerge` 补齐方向类 classGroup**（`utils.ts:26` 只登记了 `rounded` 主组，14 处 `rounded-t-16` 对 `cn()` 不可见）

### 🟢 P3 — 结构性债务（成本高，用户弱可见；建议按 feature 纵向立项）

- **B0 补课：peer-review 5 组消重**（应最先做 —— 它在持续制造分叉，且污染所有计数）
- **Card 原子推广或删除**（零 import，273 处手拼卡片；且 238 处带描边，与 globals.css 宣示的「分层靠明度差」矛盾 —— 需拍板）
- **兼容层 520–533 处 sed**（8 组机械替换，逐组一个 PR）
- **控件高度阶梯接线**（`h-control-*` 零采用，Button 28/32/40 无一档是 Figma 的 42）
- **cva 采用率 3/26**（承诺 21）
- **半档 1142 处**（阻塞于 Q8，先设棘轮钉死数字）
- **死 token 清理**：给 `@theme` 注册的每个 color token 加「至少 1 个消费点」的断言，让死 token 在 CI 显形

---

## 四、需要设计师拍板才能推进的项

> ~~台账 §6 的 Q1~Q14 **无一条标注状态**，其中 8 条已被代码单方面决定却没回写。~~
> ✏️ **2026-07-28：这条已修复。** 台账 §6 现在既有汇总状态表、也在每个 `### Qn` 标题下就地
> 标了状态，并区分了三种含义：🔴 真的在等设计师 / ⚫ 已被代码单方面决定只差追认 / ✅ 已决且已落地。
>
> 下表只列**仍在阻塞收尾**的。⚠️ 表内 `globals.css:NNN` 之类的行号是首轮写的，
> globals.css 一直在变，**按小节名找、别按行号找**。

| 项 | 阻塞什么 | 现状 | 需要的答复 |
|---|---|---|---|
| **Q2 状态色具体值** 🔴 | P0#5 + P1#1，178 处状态芯片 + 46 处不可读黄字 | `globals.css:196-203` 白纸黑字「🟡 临时值，待设计师确认」；台账明写「阻断 B7」。Figma §1.4 未定义状态色。且现有临时值 warning 2.99 / neutral 3.89 **本身不达 AA** | 同色阶取档还是另开色相？这是设计师原文四条要求里唯一被完全架空的一条 |
| **Q8 半档间距** 🔴 | 整个间距维度，1142 处 | 无结论，且 **B0~B8 排期表根本没有间距批次** —— 既无决策也无工期 | 补 6px 档，还是收口到 4/8？ |
| **卡片描边** 🔴 | Card 原子能否推广 | `globals.css:130-133` 宣示「Figma 卡片根本没有描边，分层靠白卡落米白底的明度差」，但 `card.tsx:22` 的 default 变体自己就带描边，专为此准备的 plain 变体零采用 | 分层机制走哪条？影响 273 处 |
| **`--primary` = 松青绿 vs Figma Primary = 朱砂** 🟠 | 23 个主 CTA + Button 变体命名体系 | `globals.css:578` `--primary: var(--brand-green)`，`--destructive: var(--brand-red)` —— Figma 的 Primary 色在代码里承担 destructive，三个变体名与 Figma 全部错位，且无偏离说明 | 设计师 review 时第一眼就会撞上 |
| **Badge：软底族 vs Figma 5 实底变体** 🟠 | Badge 原子 + 47 处手搓芯片收口 | Figma §4.2 = 5 个实底 + 白/黑字、h23、400 字重；代码 = 7 个软底 + h-[18px] + 500 字重 | 采纳实底还是记录偏离？ |
| ~~**纸张质感 noise**~~ ✅ | ~~Figma 四条要求之一~~ | ✅ **2026-07-28 已开启，本项出表**。`index.html:2` 实测 `<html lang="zh-CN" data-paper="on">`，globals.css 的 `:root[data-paper='on'] body, .bg-background` 规则现在真在生效。（`paper-grain` 工具类仍是 0 调用点，但它只是「给单个 surface 额外补噪点」的可选口，不影响全局质感是否开启） | 已由代码拍板，只需设计师追认视觉强度 |
| **Q9 输入框/搜索框高度** 🟡 | 控件高度阶梯接线 | Figma §4.5 = 44；代码 32/36/38/44/48/52 六种。✏️ 2026-07-28：`h-control-xl`(44) 已有 **1 个**消费者（`browser/QuickOpenPaperDialog.tsx:83`），`h-control-lg`(42) 仍是 **0** | 统一到 44 还是保留密度档？ |
| **Q13 `font-display italic`** 🟡 | landing 首屏 15 处 | B6 列入清单未做；15 处全部作用在**纯中文**上 | 裁掉 / 限定拉丁 / 补 italic 字面 |
| **Q11 Disabled 规格** 🟢 | 只需追认 | Figma 规格实测 1.32:1（规范自身缺陷）。代码用 `disabled:opacity-50` 绕过（做法正确）但没留痕，`--disabled-foreground` 是死 token | 追认 opacity 方案 |
| **Q12 聊天正文 12px** 🟢 | 只需补注释 | 决策已定「保持 12」，但要求的「在 token 注释里写明」没做 —— 下一轮审计会当漏改改成 14 | 追认 |
| **Q1 Google Sans 授权** 🟢 | 只需追认 | 标「阻断 B6」，B6 已合并但 Q1 无结论。事实上已由代码决定（走系统字体栈，**27 处 Figma 字形从未在生产渲染过**） | 追认 + 写进 CLAUDE.md |

---

## 五、被对抗验证推翻的判断（避免下一轮重复报告）

| 曾被报为缺陷 | 为什么不成立 |
|---|---|
| 状态色未落地是「漏做」 | 是**已声明的挂起决策** —— `globals.css:196-203` 明写「临时值，待设计师确认」，台账明写「阻断 B7」。定性应为「阻塞于 Q2」而非「漏做」 |
| Dialog 在 <640px 圆角为 0 | `sm:rounded-16` 是 shadcn 上游的满宽弹窗惯例；Figma 未覆盖响应式断点，不存在被违反的条款 |
| `--radius-20` 零使用是缺陷 | `globals.css:556` 原文「应极克制」是用法指引，零使用符合意图 |
| 科研绘图 `SCI_FIGURE_PALETTE` 谎报完成 | 台账 856 行的 ✅ 在 §3.5 KEEP 表的 `needsCentralizing` 列，不是完成标记 |
| Disabled 按钮「没记录修正决定」 | 规范文档 §4.1 与台账 Q11 都白纸黑字记录了 |
| `WorkspaceShell` 零消费 | 该文件创建于迁移之前，不是本次迁移的缺陷 |
| `MobileBottomSheet` z-index 越权 | 同文件 `:25` 有明确的属性注释说明理由 |
| guard 对尺寸维度零覆盖 | 台账 B8 的交付清单原文只有五项，不含尺寸 —— 属「再加规则」的建议而非未兑现 |

---

## 六、下一轮审计必须补的

1. ~~**纸张质感 / noise 专项**~~ —— 首轮 12 个维度**没有一个覆盖它**。✅ 2026-07-28 已开启（`data-paper="on"`），
   下一轮要补的不再是「开不开」而是：**开启后的实际观感与性能** —— noise 叠在 `body` 与所有 `.bg-background` 上，
   需要一次真实渲染取证（不同 DPR / 移动端 / 长滚动页的 paint 开销），以及在深色恒暗段上是否需要单独关掉
2. **一轮真实渲染取证** —— 建议 Playwright 抓主要路由的 computed style（font-size / border-radius / background-color / outline 的**实际值分布**），与 token 表逐项对账。这能一次性验证 RC1 的真实爆炸面
3. **响应式与移动端独立维度** —— 断点是否只有 640/768/1024、UA 双向分流的两条渲染路径是否共用同一套 token、移动端专属组件有没有第二套隐形标度
4. **1440px 实测渲染宽度表** —— 本轮只查了 token 消费，没查「在 1920 屏上各主要路由的中心内容实测宽度」
5. **暗色态移除的残留** —— `theme.store.ts` 是否删干净、老用户 localStorage 旧值会不会卡半暗态、**恒暗段（landing 暗段 / Prism chrome）是否自成一套 token**（已知线索：深色面上焦点环实测 **1.00:1**，完全隐形）
6. **按 feature 纵向走查** Prism / claw / peer-review 三个重业务模块
7. **表单控件族**（checkbox/radio/switch/slider/select 的尺寸、焦点态、禁用态）—— Figma 只给了搜索框，本轮几乎没覆盖
8. **全量编译对账** —— 把 `globals.css` 编译一遍列出所有实际产出的工具类，与「封闭集合」承诺逐项比对

---

## 附：计数分歧（不要直接引用任何单一数字）

| 对象 | 各维度报数 | 建议采信 |
|---|---|---|
| 手拼卡片 | 143 / 152 / 174 / 273 | **39 处逐字节相同**（可机械替换）+ 98 行同行 `rounded-16`+`bg-surface-card`；273 是「含描边」宽口径 |
| 过渡兼容层调用点 | 520 / 533 | 520（颜色类）+ 13（间距类） |
| 半档间距 | 1142 / ~750 / 1357 / **1293 / 1401 / 1423** | 已出现 6 个数。2026-07-28 实测三种口径：guard 口径（`0.5\|1.5\|3.5\|5\|7\|9\|11`，剥注释）**1293**（棘轮基线 1357，**未突破**）· 只数 `.5` 档 **1401** · 不剥注释裸 `rg` **1423**。~750 是改造前估算 |
| arbitrary 字号 | 44 行 / 45 处 / 51（含 clamp） | **51** —— guard 读数系统性失真 16% |
| `.pen` 遗留注释 | 145 / 211 / 233 / 248 | 反引号形式 145，含全部提及 211+。**注意 CLAUDE.md 描述的是单引号形式，实测 0 处** |
| `font-serif` | 60 | 其中 **42 处是 peer-review 重复组件被数了两遍**（RC5） |
| **死 color token** | 38 / 37 / 25 / 2（分母 83） | **四个数字含义完全不同，不存在「哪个对」**，见下方专节 |
| 控件高度裸档 | 437（首轮）/ 448（2026-07-28） | 同一条 `rg` 口径，差值来自期间新写的代码 —— **计数会随时间涨，引用必须带日期** |
| `max-w-*` 口径数 | 41 套（首轮）/ **52 种 · 256 处**（2026-07-28） | 首轮的「41 套」未说明是「不同类名种数」还是「文件数」；2026-07-28 口径明确为 `rg --text -o '\bmax-w-…' \| sort -u \| wc -l` |

### 死 color token —— 四个数字的确切含义

同一件事被报成四个数，是因为**每个数问的问题不一样**。引用前先确认你要问哪一个：

| 数字 | 它回答的问题 | 出处 / 复现 |
|---:|---|---|
| **38** | 无 —— **这是本文件 2026-07-27 版正文里写的数**，与同日落地的 guard 快照对不上，属笔误或写作时点差 | 已在上文 §〇 划掉 |
| **37** | 「guard 的 `KNOWN_DEAD` 白名单里冻结了多少条？」= **棘轮的上限**，不是当前值 | `tests/design-system-guard.test.ts` 的 `KNOWN_DEAD` 数组条目数 |
| **25 → 23** | 「按 guard 的判定逻辑，**此刻**有多少个 `--color-*` 在 `src/**/*.tsx?` 里没有任何消费者？」**这个数在动** —— 2026-07-28 同一个下午测两次分别是 25 和 23 | 与 37 的差 = 首轮之后被接线的项（`amber-soft`/`amber-soft-fg`/`cat-1,3,5,7`/`chart-1,3,5,7`/`chart-axis-fg`/`chart-grid`…）。**guard 没跟着收紧快照 → 凭空多出十几格免费额度** |
| **2** | 「有多少个 `--color-*` 是**真的没有任何消费者**（连 globals.css 自身都不引用）？」答案：只有 `disabled` 和 `placeholder` | 同上实测，把 `globals.css` 也纳入被扫范围 |
| **83** | 分母：`globals.css` 里注册的 `--color-*` 去重总数 | `rg -c '^\s*--color-[a-z0-9-]+:'` |

> 🔴 **25 与 2 的差（23 个）是本轮发现的一处口径陷阱，不是债**：
> guard 的死 token 规则只 `walk(SRC)` 收 `.tsx?` 文件，**globals.css 自身不在被扫范围内**。
> 而 `--status-*` 整族正被 globals.css 的 sonner 变量桥接块（`--success-bg: var(--status-success-soft)` 等）
> 消费着 —— **toast 配色是真在渲染的**。同理 `--divider` / `--on-dark-muted` / shadcn 别名族。
> 所以「guard 报它死」= **「没有 tsx 直接用它」**，不等于「它没在渲染」。
> 下次要收紧棘轮时，请先按这个口径分类，别把 sonner 的配色当死代码删掉。

复现（在 `frontend-user/` 下，Node 脚本，逻辑与 guard 同款含 `stripComments`）：
照抄 `tests/design-system-guard.test.ts` 的 `walk` + `stripComments` + 第 200–240 行的 `dead` 计算，
把 `KNOWN_DEAD` 比对换成直接打印 `dead.length` 与 `dead.join(', ')`，
再跑一遍把 `globals.css` 也拼进被扫文本，得到第二个数。

### 📏 计数的两条通用纪律（本轮又踩了一遍才补上）

1. **必须剥注释。** 本仓库的注释里大量出现被讨论的类名（「最近的 token 是 `h-control-xs`，
   但我需要 18px，故保留精确像素」这类**合规的 arbitrary 说明**）。裸 `rg` 会把它们计成用法 ——
   实测 `h-control-*` 裸 `rg` 报 6 处、剥注释后只有 **2 处**，差 3 倍。
   本轮还因此**误报过一次 bug**：`rg 'duration-(fast|base|slow|deliberate)'` 命中了
   `duration-[var(--duration-base)]`（这是**正确写法**），逐行读代码才排除。
2. **数字必须带日期 + 口径，且要预期它会动。** 2026-07-28 是多代理并行修复，
   同一个下午实测就变过：`h-control-*` 裸 `rg` 1 → 6（剥注释后是 2）、
   死 color token 25 → 23、兼容层旧色名 487 → 488（剥注释 482）、裸 `h-7/8/9/10/11` 448 → 449（剥注释 408）。
   **任何「XX 处」的断言，不写口径和时点就等于没写。**

> **下一轮审计前必须先做 RC5 的消重**，否则所有按计数验收的结论都会带 30–40% 虚数。
