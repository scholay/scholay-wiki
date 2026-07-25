---
name: slides
description: >-
  为用户创作一份高品质的演示稿(PPT / slide deck / pitch deck)—— 基于 bolt-slides:
  一个 Vite + React 演示引擎,幻灯片是响应式 React 组件(逐张翻页、可 present),保留 Slidev
  风格的悬浮控制条 + 缩略图侧栏 + click-builds + 演讲者模式,但每张都是自适应网页而非固定画布。
  脚手架已预置在你的工作目录,依赖已装好 —— 你只需按用户真实主题「主题化 + 撰写」,
  然后调用 BuildDeck 工具把它编译成一个自包含单文件 HTML 交付给用户。
when_to_use: 用户想做演示稿 / PPT / 幻灯片 / 汇报稿 / pitch deck / slides / 路演稿 / 课件时
user-invocable: false
disable-model-invocation: false
allowed-tools: Read, Write, Edit, Glob, Grep, BuildDeck, TodayDate
---

# Slides —— 用 bolt-slides 创作可交互的演示稿

经典**逐张翻页**的幻灯片(一张张推进、对着讲),但用 **Vite + React** 重建 —— 每张是**响应式网页布局**
而非会裁切的固定画布。保留你喜欢的 Slidev UI(悬浮控制条 + 缩略图侧栏 + click-builds + 演讲者模式),
并叠加真正的网页交互。

两半,分清楚:

- **引擎 + UI 已预置且已加固** —— 工作目录就是一个完整可运行的 app:逐张引擎(`src/deck/`)、
  控制条/侧栏外壳、版式组件(`src/components/`)、共享 CSS。**引擎保持原样,永不重写、永不改动。**
  这一半是用户喜欢的部分,必须看起来/行为完全一致。
- **内容每次从头创作** —— 幻灯片(主题、结构、文案、视觉、配色)针对**本次**需求全新设计。

> **主题面。** 所有颜色、字体、圆角、层次、动效都在 `src/styles/tokens.css` 的 `:root` token 词汇表里。
> 换品牌只改这里的值。

## ⛔ 三条硬规则

1. **别碰引擎** —— `src/deck/`(引擎 + 外壳:`Deck`/`Slide`/`Build`/`Reveal`/`DeckContext`/`icons`/
   `Annotator`/`useInView`)保持原样。**不要**重写或改写引擎/外壳(它已针对沙箱预览做过加固,改动会破坏预览);
   围绕它创作。
2. **用用户的真实输入创作,别把 starter demo 换皮。** `src/App.tsx` 是只用来证明能跑的一次性 demo。
   **删掉它的幻灯片,写一份新的 deck。** 绝不复用它的顺序、文案、占位符或假名字。
3. **能独立站住的要居中。** 每张自问:*它有没有侧边视觉*(`Split` 媒体面板、图片、`BrowserFrame`、
   文字旁的图表)?
   - **无侧边视觉**(纯文字,或一个结构块如 `Comparison`/`Tabs`/`Timeline`/`Accordion`/`StatGrid`)→
     该张**必须居中**:用 `<Slide center>`,或给标题 `textAlign:'center'` + 下方每个块 `marginInline:'auto'`。
   - **有** → 允许左对齐/非对称;视觉平衡文字。
   一个孤零零靠左、飘在空白里的块 = 头号对齐 bug —— 绝不交付。

---

## Step 0 —— 把 deck 扎根在用户的真实输入

用用户真实的主题、品牌、事实(用户把关键内容/数据粘在对话里;当前无文件上传通道)。绝不给真实主题捏造占位公司/logo/引用。
给了**品牌名**就用你已知的该品牌配色/字体/logo;**你没有联网、无法访问链接** —— 给了 URL 但不认识该品牌,就**停下来问**用户要配色/logo,别猜。报告你用了哪些颜色/字体、来自哪里。
不确定"今年是哪年 / 某数据是否可信"时用 TodayDate 核实,别按训练截止猜。

---

## Step 1 —— 工作目录就是这个 app(已预置,不要安装/不要跑 dev)

你的工作目录已经是一个完整的 Vite + React app,依赖已经装好 —— **不需要**也**不要**去
`npm install` / `npm run dev` / 跑任何构建命令(那些在本环境会失败;构建统一交给 **BuildDeck 工具**)。目录结构:

```
package.json  vite.config.ts  index.html   src/main.tsx
src/App.tsx                 ← 一次性 demo。删掉它的幻灯片,创作真正的 deck。
src/styles/   tokens.css(只改 :root)· base.css   ← 别改 base.css
src/deck/   Deck Slide Build Reveal DeckContext useInView icons Annotator   ← 引擎 + UI。锁死,已加固。
src/components/  Cover BigNumber Contrast Chat Bento Split StatGrid Section …   ← 幻灯片版式
```

流程:**删掉 `src/App.tsx` 的 starter 幻灯片 → 在 `App.tsx` 里创作真正的 deck →(主题化 tokens、设好 index.html
标题/favicon)→ 调用 `BuildDeck` 工具**。BuildDeck 会把整份 deck 编译成一个自包含单文件 HTML 放进 `./out/`
交付给用户;若编译报错,它会把错误返回给你,你据此修 `src/App.tsx` 再调一次。

---

## Step 2 —— 主题化(只改 `:root` 块)

所有颜色/字体/圆角/层次/动效都在 `src/styles/tokens.css` 的 `:root`。**改值,别改变量名。** 九套现成主题家族可取
(dark product、editorial luxury、Swiss、dark technical、warm minimal、fintech、aurora glass、cinematic、
paper editorial)。一个强调色,克制使用。深/浅:在 base.css 设 `html { color-scheme }` 并相应挑 `--bg`/`--fg`。
字体设 `--font-head`/`--font-body` 及 base.css 顶部的 `@import`。给了品牌就从品牌推导。

**标签标题 + 图标 —— 每次都设,不用等人要求。** 分享出去会显示浏览器标签,所以绝不留 `index.html` 的占位符:
把 `<title>` 设成 deck 的真实标题(如 "Acme — Series A"),把 favicon `<link>` 里的 emoji 换成契合主题的。

---

## Step 3 —— 创作幻灯片(`<Deck>` 的每个子元素是一张)

在 `App.tsx` 里组合。积木:

- **`<Slide>`** — 一张。`center` 用于陈述/CTA;`full` 边到边;`nav="Label"`;`notes="…"`(演讲者叠层可编辑)。
- **`<Cover>`** — 开场页:kicker → 大标题 → 副标题;可选全幅 `image`(自动加主题正确的蒙层)、可选 `foot`。
- **`<BigNumber>`** — 一个巨大的强调数字(传 `<CountUp>`)+ 说明。每份 deck 都该有一个这样的戏剧节拍;至多一个。
- **`<Contrast>`** — before/after、problem→solution:哑面板 vs 强调面板 + 叉/勾要点。经典 pitch 手法。
- **`<Chat>`** — 逐条 click 展开的对话窗(builds)—— 用户气泡在强调色、助手在表面。仅**真有对话/AI 界面**的产品用。
- **`<Globe>`** — 可拖拽旋转的 3D 点阵地球(手写 canvas,零依赖):真实 `[lat,lng]` 上的强调标记、可选
  `label`+`value`、可选 `arcs`。**仅当故事真的是地理性**(按国家的用户/收入、进入市场、全球布局)才用,标记是真实地点。
- **`<Split>`** — 文字 + 边到边媒体(`flip` 交换)。媒体 = `<img>`、色块、`<BrowserFrame>` 或 `<TiltCard><VisualX/></TiltCard>`。
- **`<Bento>`** — 非对称瓦片网格;瓦片吃 `c`/`r` 跨度 + `variant`。
- **`<StatGrid>`** — 响应式证据卡;stat `value` 传 `<CountUp>`。
- **`<Section>`** — 章节分隔:幽灵数字 + 强调辉光。仅 ~12+ 张的长 deck 用。
- **`<Agenda>`** — 编号目录行。正式/长演示用;8 张的 pitch 不需要。
- **`<Steps>`** — 横向编号流程,连接线画入。用它代替"how it works"的项目符号。
- **`<Pricing>`** — 2–4 档卡;`highlight:true` 给一档加冕。仅当定价真是本 deck 的诉求。
- **`<Team>`** — 人物网格。pitch/agency 用;发布/报告/教学跳过。
- **`<Quote>`** — 拉引用页 + 归属(别加引号,强调标记已提供)。
- **`<Comparison>`** — us-vs-them 特性矩阵;一列用强调色高亮。
- **`<Table>`** — 真数据表:大写描线表头、右对齐等宽数字、可选 `highlightCol`/`highlightRow`、`caption` 注来源。
  ≤5 列 / ≤7 行(翻页幻灯片不能滚)。
- **`<Tabs>`** / **`<Accordion>`** / **`<Timeline>`** / **`<CodeWindow>`** / **`<BrowserFrame>`** /
  **`<SpotlightCard>`** / **Charts**(`<BarChart>`/`<LineChart>`/`<DonutChart>`,单序列示意,入视自动画入)。
- **科研要素**(做学术 deck 用,详见 Step 7.5):**`<Math>`/`<MathBlock>`**(LaTeX 公式)、**`<Cite>`/`<References>`**(引用+参考文献)、
  **`<Figure>`**(编号图注)、**SciCharts** `<ErrorBarChart>`/`<ScatterChart>`/`<LineChartXY>`(误差棒/真实坐标/多序列的科研数据图)。
- **原子**(CSS 类):`.display .headline .lead .subhead .kicker .figure .accent-text .rule`。全 `clamp()` 流体。

### ⚠️ 按故事选版式 —— 不是炫技

starter demo 用了每种版式**因为它是组件演示**。真 deck 不能这样。每个特殊版式都有**准入条件**,内容不满足就不出现
(`Chat`=真有对话产品、`BigNumber`=一个真实可引用的数字且至多一个、`Pricing`=定价是诉求、`Section`=~12+ 张、
`Globe`=真地理、`Contrast`=真有 before/after、`Agenda`=正式/长演示)。主力是 `<Slide>`/`<Cover>`/`<Split>`/
`<Bento>`/`<StatGrid>` 和原子;特殊版式每种**至多一次**。一句话说不清某版式为何服务*这份* deck,就删掉。

**像网页那样排,别像 slideware**:全幅、分层;`Bento`/`Split` 优先于一排等宽卡;超大字配一个强调词;
相邻两张不同形;一张一个想法;开场 Cover,收尾 CTA。

> **居中(硬规则 3):** 左对齐/非对称需要**侧边视觉**。纯文字段落靠左 = 读起来偏心 —— 那些要居中。
> `Comparison`/`Tabs`/`Timeline`/`Accordion` 靠内建 max-width 自居中,但上方 kicker/headline 要你手动居中。

### 交互:click-builds(招牌)
用 **`<Build at={n}>`** 分节奏揭示 —— 推进(→/空格/Next)到第 n 步才动画进入。用于:铺垫后的点睛、流程的每一步、
逐项出现。用 **`<Reveal>`** 做进入即入场(无需点击)。

```tsx
<Slide center nav="The shift" notes="停顿,再逐条揭示。">
  <h2 className="headline" style={{ marginInline: 'auto' }}>三件事变了。</h2>
  <Build at={1}><p className="lead" style={{ marginInline: 'auto' }}>数据变大了。</p></Build>
  <Build at={2}><p className="lead" style={{ marginInline: 'auto' }}>工具变快了。</p></Build>
  <Build at={3}><p className="lead" style={{ marginInline: 'auto' }}>现在人人能发布。</p></Build>
</Slide>
```

---

## Step 4 —— 响应式,非固定(不裁切)

每张是**满视口响应式布局**,重排到屏幕、不会缩放裁切:用 `clamp()`/`%`/`vw`/`rem`/`max-width` 容器,别写死像素宽;
别手写固定列数(`repeat(3,1fr)` 在手机裁切)—— 用 `.cols` 或 `repeat(auto-fit,minmax(min(240px,100%),1fr))`;
一张一个想法,填满约一屏 + 有意的留白;**翻页幻灯片不能滚,溢出即截断**,检查窄视口不溢出。

## Step 5 —— 视觉与配图

视觉贴合主题。数据/SaaS → `.vframe` mock(`VisualDashboard` 是*示例*,按真数据造贴题的)。
**图片必须内联为 data URI**(单文件交付,不能引用外链/本地图片路径,否则预览/下载都裂图)—— 用 SVG(矢量、体积小、
可 token 上色)优先;确需位图就用**小尺寸**压缩过的 data URI(见交付约束的体积上限)。图上不放文字;
可图片版式:`<Cover image>`/`<Section image>`/`<Quote image>` 全幅背景、`<Bento>` 瓦片 `img`、`<Split media>`、`<BrowserFrame>`。

## Step 6 —— 动效(克制)

`Build`/`Reveal`/`CountUp`/图表(入视画入)/`TiltCard`+`SpotlightCard`(光标交互)/`Marquee`/`Tabs`。
环境背景与切页转场自动。**一两个动效念头/张**,绝不马戏团。全部尊重 `prefers-reduced-motion`。

## Step 7 —— 结构与文案

按 deck 类型选弧线,结构随内容。开场 Cover,收尾 CTA。~8–16 张。
标题短、陈述、具体(句式大小写);正文 1–3 句;kicker 1–3 词;一张一想法。用用户真实数字,绝不给真实品牌编数字。
零 lorem、零占位名。有用处加 `notes`。

**弧线选型(含学术):** pitch / 发布 / 品牌 用商业弧线(问题→方案→证据→CTA);**科研汇报**(组会 / 开题 / 答辩 / journal club / 课程讲义)
用**学术弧线:背景与问题 → 相关工作 → 方法 → 结果 → 结论/讨论 → 参考文献**。学术 deck **默认不用** `Pricing`/`Team`/`Globe`/`Chat`
(那是路演件);主力用 `Cover`/`Split`/`StatGrid`/`Table`/`Figure`/`Steps` + 下面的科研要素。

---

## Step 7.5 —— 科研要素(公式 / 引用 / 图注 / 数据图)· 做科研 deck 必读

做学术汇报时**优先用这些组件**,别用纯文本硬凑公式、别用没有坐标轴/误差棒的玩具图充当数据图。

### 数学公式(`Math` / `MathBlock`)
LaTeX 经 KaTeX 渲染成 MathML(浏览器原生、自包含,单文件下载后离线也显示)。方法推导、损失函数、定理、统计量都用它:
```tsx
<p className="lead">当 <Math tex="\\alpha \\to 0" /> 时,估计量 <Math tex="\\hat\\theta" /> 收敛。</p>
<MathBlock tex="\\hat\\beta=(X^\\top X)^{-1}X^\\top y" />
```
反斜杠在 TSX 字符串里要写 `\\`(如 `\\pi`、`\\sum_{i=1}^n`)。语法错不炸 deck(原样标出),但请自查。

### 引用 + 参考文献(`Cite` / `References`)
正文挂上标引用、末页排规范文献列表;**编号由你显式给、前后对齐**:
```tsx
<p>信号在 5 天内衰减<Cite n={1} />,与既往报道一致<Cite n={[2,3]} />。</p>
// 末页(用 <Slide> 包一层,title="参考文献"):
<References items={[
  'Smith J, Lee K. Nature. 2020;580:112-119.',
  'Chen R, et al. Cell. 2021;184:1-14.',
]} />
```

### 图注(`Figure`)
任何图/表/图片都用它包一层「图 N. 说明(来源)」,符合学术惯例(投稿图必须有编号图注):
```tsx
<Figure n={1} caption="不同剂量下的存活率(均值±SEM,n=30)" source="本研究">
  <ErrorBarChart ylabel="存活率 %" data={[{label:'对照',value:62,error:5},{label:'给药',value:81,error:4}]} />
</Figure>
```

### 科研数据图(`SciCharts`:误差棒 / 真实坐标 / 多序列 / 图例)
`Charts.tsx` 的 `BarChart/LineChart/DonutChart` 是**单序列示意图**(无坐标刻度/误差棒/图例),别用来呈现实验数据。
呈现真实数据用 **SciCharts**(带坐标轴、色盲友好多色、入视画入):
- **`<ErrorBarChart>`** — 均值±误差(SEM/SD),科研最高频。`data={[{label,value,error?}]}`。
- **`<ScatterChart>`** — 真实 x/y 散点,多序列 + 图例。`series={[{name,points:[{x,y}]}]}`。
- **`<LineChartXY>`** — 真实 x 坐标折线(剂量-反应 / 生长曲线 / 时间序列,**非均匀采样也对**),多序列 + 图例。
- **铁律:只呈现用户给的真实数据,绝不发明数字。** 数据不足就问用户要(粘贴到对话)。
- 需要**论文级统计图**(KM 生存曲线 / 森林图 / ROC / 箱线图)时:不在 deck 里硬画 —— 引导用户去「**科研绘图**」用 matplotlib 车道出 SVG,再作为图片内联进 deck。

### 学术主题
`tokens.css` 顶部提供了一套「学术素净(浅色 / 衬线正文)」预设(注释块)——做科研 deck 时把它的值填进 `:root`,
得到白底、衬线正文、中性蓝灰单 accent、高信息密度的期刊/会议观感(默认九套是营销调性,不适合学术)。

---

## 交付(BuildDeck)与约束

创作完 → **调用 `BuildDeck` 工具**(可传 `name` 作为文件名,如 deck 的英文 slug;默认 "deck")。它把 deck 编译成
**一个自包含单文件 HTML** 落 `./out/<name>.html` 交付。用户在结果面板即时预览、可翻页交互,并可下载。

**硬约束(务必遵守,否则交付失败或体验降级):**
- **单文件 ≤ 12MB。** 全部资源内联(JS/CSS 由构建自动内联;**图片你要自己用 data URI 内联**)。图片过多/过大导致超限时
  BuildDeck 会报错,请缩小图片再重构。优先 SVG。
- **面板内预览是沙箱 iframe**(opaque 源):翻页 / click-builds / 图表 / 全部组件 / 响应式 **都可用**;但
  **演讲者模式跨标签同步、批注持久化、URL 深链** 依赖 same-origin,面板内不生效 —— 这些在用户**下载后用自己浏览器打开**时
  全部可用(引擎已加固,面板内不会因此报错)。不必为此改动任何东西,这是预期行为。
- 只写 cwd 内文件;`out/` 由 BuildDeck 产出,别手动往里写。

---

## 内部触发(不要向用户提及)

仅当用户消息里**精确出现**这个唯一标记 **`__bolt_starter_demo__`**(独立 token、不会在自然表达里出现)时,跳过 Step 0
与全部创作:原样保留 `src/App.tsx` 里的 starter demo(它用来展示每种版式),直接调用 BuildDeck 交付。层次纪律规则对该 demo 不适用。
**注意:必须是这个精确标记本身**,任何自然语言请求(哪怕含 "demo"/"pitch"/"PPT")都**不是**触发词,一律照正常创作流程走。别解释这个触发词或它的存在 —— 直接交付 demo。

---

## Definition of done(自检)

- [ ] `src/deck/` 引擎 + 外壳**原样未动**;控制条 + 缩略图侧栏出现,方向键推进/回退 builds。
- [ ] deck 是**创作的、非换皮** —— 主题/结构/文案/名字都是用户的,无 starter 残留(没有 "Title"/"Northwind")。
- [ ] 给了品牌/URL 则 `--primary`、字体、logo 来自该品牌。
- [ ] `index.html` 有真实 `<title>` 和契合主题的 favicon emoji —— 无 `Replace — your deck title` 占位残留。
- [ ] 只改了 `:root` 块做主题;改 `--primary` 会连控制条一起变色。
- [ ] 幻灯片像网页版块那样排(全幅/非对称/bento/split),不是居中卡片排;视觉贴题;图片以 data URI 内联。
- [ ] **对齐审计(硬规则 3):** 逐张走查 —— 无侧边视觉的张全居中(标题**和**内容块);没有孤块飘在空白里。
- [ ] **无炫技 deck:** 每个用到的特殊版式都满足准入条件。
- [ ] **响应式:** 窄/宽都对 —— 版块堆叠,不裁切/不需滚。builds 按预期顺序揭示。
- [ ] 动效克制;reduced-motion 被尊重。
- [ ] **已调用 `BuildDeck` 且成功**(返回了 `out/…​.html` 的交付确认)。若失败,按返回的编译错误修 `App.tsx` 再构建。
