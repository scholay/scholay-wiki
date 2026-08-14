# 04 · `out/` 内部组织逻辑如何泄漏到用户面前 —— 取证报告

> 调研日期:2026-08-07
> 取证方式:全仓静态阅读 + **生产库 `agent_turn_events` 实测**(scholar_mysql,878 turns / 346 sessions)
> 铁律:本文每条结论都带 `file:line` 或 SQL 口径。没读过的不写。

---

## 〇、一句话结论

**「不要说 out/」这条规则,全仓只在 `claw` 一个 feature 的 system prompt 里存在;而「请写到 out/」
这条指令,全仓有 40+ 处、跨 5 个层次(system prompt / skill / 工具 description / 工具 tool_result /
引擎 JSON 返回值)反复喂给模型。** 实测生产数据:

| feature | 助手可见正文里出现 `out/` 的轮次 | 分母(有正文的轮) | 泄漏率 |
|---|---|---|---|
| `sci_draw` | 11 | 17 | **64.7%** |
| `stat_lab` | 197 | 559 | **35.2%** |
| `boltslides` | 1 | 4 | 25.0% |
| `claw` | 6 | 80 | **7.5%** |
| `prism` | 0 | 19 | 0% |
| `smart_search` | 0 | 30 | 0% |
| **合计** | **215** | **709** | **30.3%** |

按会话算:**186 / 346 = 53.8% 的会话**里,模型至少说过一次 `out/`。

泄漏率与「该 feature 的 prompt 有没有写禁令」几乎完全负相关:
claw 有【铁律 · 绝不暴露内部路径】→ 7.5%;stat_lab 一个字没写 → 35.2%;
sci_draw 不但没禁令、还在 prompt 里把 `out/<名字>` 当**路径铁律**教了 8 次 → 64.7%。

这不是模型不听话,是**我们在教它这么说**。

---

## 一、问题 1 —— 所有告诉模型「写到 out/」的地方(原文 + 行号)

按「模型看到它的时机」分五层。层次越靠后,离生成时刻越近、影响越大
(本仓已有的判断:`registry.ts:349-350` 明写「失败点带内指令紧贴生成点,比全局 prompt 可靠 ——
flash 对远距离规则失效已被审计证明」)。**而 out/ 恰恰在最近的两层里最密集。**

### L1 · Backend system prompt(每会话首条 user_message 的 in-band 前缀)

真源:`internal/prompts/*.go` const → `agentbridge.NewStaticPicker` 下发
(如 `backend/internal/claw/spec.go:178`、`backend/internal/scidraw/spec.go:133`)。

#### `backend/internal/prompts/claw.go` —— 10 处(唯一同时带禁令的)

```
:114  对比表、数据文件 csv、整理稿等), 就把它**写进 ./out/ 子目录**。凡是写进 ./out/
:116  - 因此: 长篇 / 结构化 / 适合留存的成品 → 写进 ./out/; 同时把关键内容 / 结论也在回复正文里
:120    没有"IDE"、没有"左侧目录"、看不到任何路径。写进 ./out/ 的文件会**自动作为下载/预览卡片**出现在
:122    · 提及任何文件系统路径 / 目录名(不写 "./out/"、不写 "已保存到 xxx.svg"、不写绝对路径、
:126    错误说法(禁止): "文件已保存到 ./out/report.md" / "已同步到根目录" / "在左侧文件面板查看"。
:127  - **【铁律 · 先写后说】** 只有当文件已经真的写进交付区 (./out/), 才允许说「已生成 / 可下载 /
:130  - **多个独立成品就各写各的扁平文件**: 直接放在 ./out/ 根下(如 ./out/综述.md、./out/对比表.csv),
:133    ./out/<名字>/(整目录会作为**一个 zip** 一起下载)。不要为了"打包"把本可独立交付的文件硬塞进
:135  - (可选, 推荐) 想让下载卡片有更友好的标题/说明, 就在 ./out/manifest.json 里写一份清单:
:138  - ./out/ 之外的工作目录文件一律视为**草稿**, 不会交付; 不需要给用户的中间产物别放 ./out/。
```

`claw.go:119-126` 是全仓**唯一**的禁令原文:

```
- **【铁律 · 绝不暴露内部路径】** 用户看到的是聊天界面, **没有**文件管理器、没有"文件面板"、
  没有"IDE"、没有"左侧目录"、看不到任何路径。写进 ./out/ 的文件会**自动作为下载/预览卡片**出现在
  你这条回复正下方 —— 这是唯一的交付方式, 你**不需要、也绝不可以**在正文里:
  · 提及任何文件系统路径 / 目录名(不写 "./out/"、不写 "已保存到 xxx.svg"、不写绝对路径、
    不写 "根目录 / 工作目录 / 当前目录");
  · 提及 "文件面板 / 文件树 / IDE / 左侧 / 同步到 …" 等**你这个运行环境**的内部概念(用户界面里没有这些)。
  正确说法是**只说成果本身**: "已为你生成《锂电池综述》, 可在下方查看或下载" / "对比表已生成, 见下方卡片"。
  错误说法(禁止): "文件已保存到 ./out/report.md" / "已同步到根目录" / "在左侧文件面板查看"。
```

🔴 **注意这段话本身出现了 3 次 `./out/`**。禁令与指令写在同一段,禁令说「不许念」的那个 token,
在它上下文窗口里紧挨着出现了十次。这是提示词工程里最经典的自伤形态
(本仓已在 `agent-skills` 那边踩过一次同类:`ASCII框图复发` 记忆条 —— 「否定式规则没用,须正面模板」)。

#### `backend/internal/prompts/sci_draw.go` —— 8 处,**零禁令**,且把 `out/` 提升成「路径铁律」

```
:18  用户用自然语言描述一张图,你生成一份**原创的、通用科学画风**的图,写进工作目录的 ./out/ 交付。
:23  out/<名字>.fig.json;系统的确定性渲染器把它排成**分层隔室的论文级细胞图 SVG**(…)
:27  - 严格照 figures 技能的配方 schema;写到 out/<名字>.fig.json(**不是 .svg、不写坐标**)。
:38  …Write 到 out/<名字>.fig.json(JSON 必须合法)。…
:39     B 路径:写 python 脚本到 out/<名字>.py,用 Bash 跑 python3 渲染成 out/<名字>.svg;…
:40     C 路径:按 molecules 技能用 RDKit 从用户给的 SMILES 渲染 out/<名字>.svg。
:63  - **路径铁律(务必照做)**:产物一律写到**相对路径 out/<名字>**下(A 车道用 out/<名字>.fig.json,
      B/C 用 out/<名字>.svg,相对当前会话工作目录)。
:64    **绝不要**写成绝对路径 /out/...(斜杠开头是绝对路径,会越界写入失败)、也不必加 ./ 前缀。
       文件工具的 path 直接给 out/xxx 即可。
```

`sci_draw.go` 的 `# 交付与披露` 一节(:62-67)**只讲路径怎么写,不讲怎么对用户说**。
sci_draw 泄漏率 64.7% 是这段话的直接产物。

#### `backend/internal/prompts/bolt_slides.go` —— 0 处 `out/`,但只有一句半吊子禁令

```
:48  演讲者模式、批注、深链、全屏等完整功能。别贴文件路径/技术细节。
```

「别贴文件路径」挂在 `# 交付后` 一节末尾,没有正确说法示范、没有「用户看不到文件系统」的世界观陈述。
实测仍泄漏 1/4 轮(样本小,`boltslides` 只有 4 个有正文的轮,不做强推断,标 info)。

#### `backend/internal/prompts/stat_lab.go` —— **完全没有交付表达纪律**

全文只有注释里一处 `out/`(`:22`,是给读代码的人看的,不进 prompt):

```
:22  // D1(bundle 目录是引擎独占保留区,模型写不了)与 D2(交付物里的无源数字会被移出 out/)。
```

prompt 正文(`:24-100`)里 `# 语言`(:97-99)只规定语言,`4. **出交付物。**`(:53-54)只说「调引擎的报告功能」。
**没有任何一句告诉模型「用户看不到目录」。** stat_lab 是当前用量最大的 feature(559/709 轮 = 78.8%),
也是泄漏绝对量最大的(197 轮)。

#### `backend/internal/prompts/smart_search.go` —— 0 处(feature 无写面,`spec.go:130` 禁了 ExportDocument)

### L2 · Skills(`--add-dir` 注入,`agent/src/skills/loader.ts:155 loadAddDirContext` 拼进 system 后缀)

`loader.ts:196-205`:每个 addDir 的 `CLAUDE.md` + `.claude/skills/*/SKILL.md` **常驻**;
`guides/*/SKILL.md` 走按需菜单(`:78 buildSkillMenu`),被 `Skill` 工具加载后进上下文。

| 文件:行 | 原文摘要 |
|---|---|
| `agent-skills/sci-draw-skills/charts/SKILL.md:13` | 把成品**矢量 SVG** 存到 `./out/`。 |
| 同上 `:19` | 脚本也可一并留在 `./out/`(便于用户复算)。 |
| 同上 `:26` | `fig.savefig("out/<名字>.svg", bbox_inches="tight")` |
| 同上 `:32` | 写脚本到 `./out/<名字>.py`,用 **Bash** 跑:`python3 out/<名字>.py`。 |
| 同上 `:33` | …直到成功产出 `./out/<名字>.svg`。 |
| 同上 `:53` | 产物在 `./out/`:`.svg`(主交付)+ 可选 `.png` + 可选 `.py` |
| `agent-skills/sci-draw-skills/molecules/SKILL.md:13` | 存成**可编辑 SVG** 到 `./out/`。 |
| 同上 `:21` | 脚本可留在 `./out/` 便于复算。 |
| 同上 `:44` | `open("out/aspirin.svg", "w").write(d.GetDrawingText())` |
| 同上 `:47` | 用 **Bash** 跑 `python3 out/<名字>.py` |
| 同上 `:60` | 产物 `./out/<名字>.svg`(主交付)+ 可选 `.py` |
| `agent-skills/sci-draw-skills/figures/SKILL.md:12` | …写到 `out/<名字>.fig.json`。 |
| 同上 `:16` | ⚠️ **铁律:产物是 `out/<名字>.fig.json`(配方 JSON)…** |
| 同上 `:24` | ## 配方 schema(严格照此,写到 out/<名字>.fig.json) |
| 同上 `:101` | - **路径铁律**:写到相对路径 `out/<名字>.fig.json`,**绝不** `/out/...`。 |
| 同上 `:106` | 2. `Write` 配方到 `out/<名字>.fig.json`。 |
| `agent-skills/claw-add/guides/data-figures/SKILL.md:9` | 把成品写进 `./out/` 交付。 |
| 同上 `:40` | 存进 `./out/`(如 `./out/fig1_对比.pdf`),每个文件是一张独立下载/预览卡片。 |
| 同上 `:43` | 图 → `./out/`;若有多步分析,写一份 `./out/analysis.md`… |
| 同上 `:45` | 可选:`./out/manifest.json` 给产物配友好标题。 |
| `agent-skills/bolt-slides-add/slides/SKILL.md:69` | BuildDeck 会把整份 deck 编译成一个自包含单文件 HTML 放进 `./out/` |
| 同上 `:222` | **一个自包含单文件 HTML** 落 `./out/<name>.html` 交付。 |
| 同上 `:230` | 只写 cwd 内文件;`out/` 由 BuildDeck 产出,别手动往里写。 |
| 同上 `:254` | - [ ] **已调用 `BuildDeck` 且成功**(返回了 `out/…​.html` 的交付确认)。 |

🔴 **额外一族:stat_lab 的 skill 教模型用容器绝对路径思考**

`agent-skills/stat-lab-skills/workbench/SKILL.md:16-22`:

```
## 第零步:你的工作目录是 `/work`

🔴 **上传的文件就在当前目录下,直接用文件名读,不要 `cd`。**

附件信息里给的 `path` 是**容器侧绝对路径**(形如 `/home/bun/sessions/<会话id>/<文件名>`),
但你的 Bash 跑在沙箱里,那个目录被挂载成了 `/work` —— `cd /home/bun/sessions/...` 一定报
「No such file or directory」。实测每次分析都会因此浪费一轮。
```

这段话在**工程上是对的**(它解决了一个真实的浪费轮次问题),但它把 `/work`、
`/home/bun/sessions/<会话id>` 两个纯内部概念做成了模型的**世界观基础**。同文件 `:46`
「`ls` 看工作目录里到底有什么」、`:48`「你能读的只有工作目录里实际存在的文件」进一步固化。
实测:`工作目录` 出现在 28 轮可见正文里,`/work` 2 轮,`/home/bun` 1 轮(SQL 见 §五)。

### L3 · 工具 description(每轮随 tools 数组进上下文,永远在场)

| 文件:行 | 原文 |
|---|---|
| `agent/src/tools/registry.ts:198` | `"Write (create or overwrite) a UTF-8 text file within the session working directory. **To deliver a file to the user, write it under ./out/ .**"` |
| `registry.ts:694` | `"The output is written under ./out/ (the user-delivery directory) and its relative path is returned."` |
| `registry.ts:834` | `"It compiles the Vite/React deck and writes a single inlined .html into ./out/ (the user's download/preview area) —"` |
| `registry.ts:1562` | `"Input: { bundle (path under analysis/, from StatRun's bundle_path), system (...) }."` ← 另一个内部目录名 `analysis/` |

Write 是**所有 feature 全程在场**的工具。也就是说,即使 stat_lab 的 system prompt 一个字没写 `out/`,
`registry.ts:198` 也在每一轮告诉它「要交给用户就写 ./out/」。

### L4 · 工具运行时返回值(tool_result,离生成时刻最近)

这一层是**实测的头号元凶**。

| 位置 | 返回给模型的原文 |
|---|---|
| `registry.ts:210` | `ok("wrote " + String(input.file_path))` → `wrote out/综述.md` |
| `registry.ts:776` | `` ok(`exported ${outRel} (${st.size} bytes) — delivered to the user's download area.`) `` |
| `registry.ts:898` | `` ok(`Deck built and delivered: ${outRel} (${st.size} bytes). …`) `` |
| `registry.ts:357` | Bash 沙箱闸失败时:`"…你仍可用 Read/Write/Edit/ReadDocument 完成不依赖 shell 的部分,并把已完成内容写入 out/ 供用户下载。"` |
| `registry.ts:513` | ExportDocument 闸失败时:`"…请先确认完整内容已用 Write 落盘为 out/<名称>.md,…"` |
| `agent/src/evidence/render.ts:335` | `CITATION_CONTRACT`:`"…导出文档 / 生成演示稿 / **写入 out/ 交付文件时**,平台会在交付边界把句柄机械展开…"` |
| `agent/stat-kit/statkit/verbs/report.py:566-567` + `:515` | `"table_docx": str(docx_path.relative_to(workdir))` / `"results_md": …` / `extra["analysis_py"] = …` |

**`statkit` 的 report verb 是 stat_lab 35.2% 泄漏率的直接来源。** 生产库实测的一条真实 tool_result:

```json
{
  "ok": true,
  "system": "cn-core",
  "system_name_zh": "中文核心期刊 / 学位论文",
  "table_docx": "out/table1_cn-core_7227ab2adcf1.docx",
  "results_md":  "out/results_cn-core_7227ab2adcf1.md",
  "analysis_py": "out/analysis_7227ab2adcf1.py",
  "methods_zh":  "统计分析前先检验分析前提:…"
}
```
> 口径:`SELECT payload FROM agent_turn_events WHERE ev_type='tool_result' AND CAST(payload AS CHAR) LIKE '%out/%' ORDER BY id DESC LIMIT 1`(scholar_mysql)

模型拿到这份 JSON,**没有任何其它名字可用**。它唯一能称呼这三个文件的方式就是照抄这三个字符串。
下一段就是它真的照抄的样子。

### L5 · 死代码里的一处(记录在案,当前无影响)

`agent/src/turn/deliveryGate.ts:182`:enforce 档位会往 `out/` 写一份
`⚠️交付闸拦截说明.md`;`:224-229` 的 `noticeForModel` 文本含 `out/xxx` 路径,
但该字段 `:169-171` 自陈**从写出来那天起就没有消费者**。当前默认 observe 档
(`:80 STATKIT_NUMCHECK_ENFORCE`),故这条路径不影响生产。标 info。

### 计数

| 层 | 处数 |
|---|---|
| L1 backend system prompt | 18(claw 10 + sci_draw 8) |
| L2 skills | 24(sci-draw 16 + claw-add 4 + bolt-slides 4)+ stat-lab 的 `/work` `/home/bun/sessions` 一族 3 |
| L3 工具 description | 4 |
| L4 tool_result / 引擎返回 | 7 个产出点 |
| L5 死代码 | 1 |
| **合计** | **≈ 57 处,分布在 12 个文件、3 种语言(Go / TypeScript / Python)** |

而**说「不要念」的地方只有 1.5 处**:`claw.go:119-126`(完整)+ `bolt_slides.go:48`(一句)。
另有一处**同族但不同目标**的优秀先例:`prism/edit.go:224`(见 §四)。

---

## 二、问题 2 —— `leakGuard.ts` 拦什么?为什么拦不住「保存到 out/report.docx」

### 它拦的是协议 marker,不是路径

`agent/src/turn/leakGuard.ts:10-21` 的 `MARKERS` 是完整清单,共 10 条,**全部是 DSML/tool-call 协议标记**:

```ts
const MARKERS = [
  "<｜DSML｜", "<｜｜DSML｜｜", "<|DSML|", "<|｜DSML｜|",
  "<｜tool▁calls▁begin｜", "<｜tool▁call▁begin｜", "<｜tool_calls_begin｜",
  "<|tool▁calls▁begin|", "<|tool▁call▁begin|", "<|tool_calls_begin|",
];
```

文件头 `:1-8` 写清了它的出身:2026-07 审计 P0-5,deepseek 把 `<｜｜DSML｜｜tool_calls>`
原文吐进用户可见正文(7 会话、6/7 在末轮 = 终稿损坏)。机制是**熔断**:
`:51 feed()` 命中即 `tripped = true`,该 content 块余下文本**全部吞掉**;
`:80 stripProtocolMarkers` 对 history 做一刀切消毒。

### 为什么它在结构上不可能拦 `out/`

三条,任一条独立成立:

1. **判据是字面 `indexOf` 全匹配**(`:24-31 firstMarkerIndex`)。`out/report.docx` 不在 MARKERS 里,
   加进去也不行 —— 见第 2 条。
2. **命中即熔断整块**(`:55-61`:命中后 `return clean`,其后 `feed()` 恒返 `""`)。
   把 `out/` 加进 MARKERS 的后果是:模型一说 `out/report.docx`,该条回复**从那个字起被整段截断**,
   用户看到半句话。这个代价对协议 marker 可接受(marker 后面本来就是协议载荷,不是给人看的),
   对路径完全不可接受(路径后面是正经的交付说明)。leakGuard 是**熔断器,不是改写器**,
   它的语义就是「这后面的东西没有一个字该给人看」。
3. **误伤面不同**。`:7-8` 自陈误伤面 =「正文真的在讨论这些特殊 token(极小众)」。
   而 `out/` 是英文常见词根(`checkout/`、`layout/`、`about/`)+ 代码块里的合法路径
   (实测有一条 claw 正文是 ```` ```bash\nmkdir -p out && echo '# 测试报告' > out/report.md``` ````
   —— 用户要求跑命令时,命令回显里的路径是合法的)。

### 全仓「轮末纠偏 guard」只有三条,没有一条管路径

`agent/src/turn/turnLoop.ts:744-880` 是唯一集成点(`:745` 注释自称「唯一集成点」),
共享预算 `MAX_CORRECTIVE_ROUNDS=2`(`:350`):

| guard | 判据 | 行号 |
|---|---|---|
| ① max_tokens 恢复 | 撞顶截断 | `:760-776` |
| ② 语言纠偏 | `cjkRatio(stripForLangGuard(finalText)) < 0.1` 且期望 zh | `:841-857` |
| ③ 字符画 | `hasBoxArt(finalText)` | `:868-879` |

`agent/src/turn/lang.ts` 全文 201 行,提供 `detectLang` / `langDirective` / `cjkRatio` /
`hasBoxArt` / `stripForLangGuard` —— **全是语言与渲染纪律,零路径逻辑**。

`agent/src/turn/verifyClaims.ts` 有一个最接近的判据:`:109-116 DELIVERY_POS` 正则
识别「已生成/可下载」宣称,`:135 sessionHasOutWrite` 检查 `/(^|\/)out\//.test(fp)`。
但它 `:9-10` 自陈**已降级为纯观测**:「findings 只进日志与 message_complete.claim_audit,
turnLoop 不再据此注入纠偏轮」;`:235-239` 明写原 `buildCorrectiveDirective` 已删除。
它只判「有没有真的交付」,不判「说了不该说的名字」。

### 策略层同样零覆盖

`agent/src/policy/researchTurn.ts`(89 行)全文是**取证轮路由**(chat/evidence 二分),
`:35-38 WRITE_CAPABLE_TOOLS` 只用工具名判「这个 feature 有没有写面」,不看正文。
`agent/src/policy/featurePolicy.ts`(25 行)只做 denylist / allowBash / MCP 白名单。
两者都不碰模型输出文本。

### backend 转发层也不改写

`backend/internal/agentbridge/ws.go:691-693`:`frameType` 对 `content_delta` 做**廉价分流**
以避免完整解析;唯一的净化函数是 `:878-883 sanitizeAgentErrorFrame`,**只处理 error 终帧**。
`content_delta` 原样广播 + 原样入 `agent_turn_events`。

**结论:从模型 token 到用户屏幕,agent 侧与 backend 侧对 `out/` 零处理。**

---

## 三、问题 3 —— 有没有机制把正文路径改写成用户可理解的说法?

**有一个,但它只覆盖 1.4% 的真实泄漏,是典型的「一条几乎永远绿的规则」。**

### `frontend-user/src/shared/lib/strip-container-paths.ts`

文件头自陈定位(`:1-11`):

```
 * 出口清洗(claw 成果交付「双保险」之一)—— 把助手正文里泄漏的**容器内部路径**收敛掉。
 * 主机制是「提示词铁律(禁念路径)+ 帧驱动的就近产物卡」;用户能不能看到成果**已不依赖正文**。
 * 本函数只兜住模型顽固 bias 的漏网之鱼…
 * **刻意极度保守**:只处理**无歧义**的容器内部路径 —— 显式 `./out/` 交付目录前缀、以及容器绝对
 * 根(/home、/workspace…)。不碰裸 `out/`(可能是 checkout/ layout/ 的一部分)、不碰普通 prose、
 * 不碰 URL。宁可漏清洗,不可误伤正文。仅 claw 使用(prism 的文件树/路径是合法用户概念,不清洗)。
```

正则(`:15-17`):

```ts
const REL_OUT = /`?\.\/out\/([^\s`)）]+)`?/g;                       // 必须带 ./ 前缀
const ABS_CONTAINER = /`?\/(?:home|workspace|app|root|srv|mnt|data)\/[^\s`)）]+`?/g;
```

调用点(5 处,`grep -rn stripContainerPaths frontend-user/src`):

- `features/claw/components/chat/MessageTurn.tsx:291, 321`
- `features/prism/components/chat/PrismMessageTurn.tsx:113, 128`
- `shared/components/chat/ToolCallBlock.tsx:230`(工具结果折叠)
- `shared/components/chat/tool-semantics.ts:76`(Bash chip 摘要)

覆盖面上是好的:`stat_lab` / `sci_draw` / `boltslides` 都复用 `features/claw` 的会话 UI
(`features/claw/hooks/` 下有 `useStatLabConversation.ts` / `useSciDrawConversation.ts` /
`useBoltslidesConversation.ts`,共用 `MessageTurn.tsx`),所以清洗器**是在跑的**。

### 🔴 但它匹配不到实际泄漏

生产实测(SQL 口径见 §五):

```
含 "./out/" 的 content_delta 片段:      5
只含裸 "out/" 的 content_delta 片段:  362
合计含 out/ 的片段:                    367
```

**98.6% 的泄漏是裸 `out/`,清洗器按设计就不碰。**

而且 `sci_draw.go:64` 正在**主动教模型不要写 `./`**:

> **绝不要**写成绝对路径 `/out/...`(斜杠开头是绝对路径,会越界写入失败)、**也不必加 ./ 前缀**。
> 文件工具的 path 直接给 `out/xxx` 即可。

statkit 的 `relative_to(workdir)`(`report.py:566`)产出的也是裸 `out/...`。
也就是说:**我们的 prompt 与引擎,系统性地生产了清洗器唯一不认的那种形态。**
这是清洗器写出来时无法预见的漂移(它的注释写于 claw 单 feature 时代),
但结果是它现在等价于一条不存在的规则 —— 与 CLAUDE.md 里「跨包镜像整族 skip」是同一个模式。

### 其它候选,全部不适用

| 机制 | 文件 | 为什么不管这事 |
|---|---|---|
| `maskToolSource` | `shared/lib/mask-tool-source.ts:1-11` | 只把 `source: "openalex"` 这类**数据源 enum** 换成品牌名(Graph/Discovery/Medicine),不碰路径 |
| `tool-semantics.ts` | `shared/components/chat/tool-semantics.ts:14-27` | 有「工具名 → 中文语义」唯一映射表(`Write→写入文件` `ExportDocument→导出文档`),但只作用于**工具 chip 标题**,不作用于模型正文 |
| `friendly-tool-error.ts` | `shared/lib/friendly-tool-error.ts` | 错误文案友好化 |
| `sanitizeAgentErrorFrame` | `backend/internal/agentbridge/ws.go:878` | 只净化 error 帧 |

**明确回答:除 `stripContainerPaths` 这一条(实测覆盖 1.4%)外,没有任何机制把模型正文里的
`out/` 改写成用户可理解的说法。用户看到的就是模型写的原字。**

---

## 四、问题 4 —— 内部路径的「对用户的名字」,仓库里的先例

四条先例,质量从高到低。**最好的那条已经在仓里跑,只是没推广。**

### 先例 A(最好)· prism:【用内容化表述】—— 连文件名都不念

`backend/internal/prism/edit.go:224`:

```
- 改完用 1-2 句中文简短说明你做了什么(会显示在对话里给用户看)。【用内容化表述】——
  说「补充了方法部分的实验设置」「新增了 3 条参考文献」,不要念 document.md / references.bib /
  cwd / 路径 等内部文件名(用户看到的是所见即所得的编辑器,没有这些文件的概念)。
```

`:225` 补齐边界:「导出 Word / PDF 是用户点工具栏按钮的事,你不自己导出、不新建交付文件、
不宣称「已生成可下载文件」。」

关键在于它**没有给 `document.md` 起一个对用户的名字 —— 它压根不让这个概念出现在对话里**,
改说「做了什么」而不是「改了哪个文件」。配套的架构决策把这条纪律变得**便宜**:
- prism 交付走 DB 真源 + 工具栏导出按钮,`spec.go:42-46` 明写禁用 `ExportDocument`
  (理由:它「强制写 ./out/ 并对用户宣告『已交付下载区』」,而 prism 无产物收割);
- `spec.go:110-115` 把诚实性核验的 `delivery` 维度**关掉**(「prism 交付走项目文件,
  executor 的 `./out/` 判据会误报」)。

**实测 prism 泄漏率 0/19。** 这不是运气 —— 是「模型没有理由提路径」+「明说了不要提」的合力。

### 先例 B · `evidence/` 与 `analysis/`:引擎保留区,对用户**根本不存在**

`agent/src/sandbox/reserved.ts:38`:`RESERVED_DIRS = [EVIDENCE_DIR, ANALYSIS_DIR]`。
两道物理闸(`:9-13`:confine.ts canonical 拒写 + bwrap `--ro-bind` 覆盖)保证模型写不进去。

用户侧的对应处理是**彻底屏蔽**,`agent/src/turn/artifacts.ts:231-235`:

```
// 🔴 引擎保留区(evidence/)**永远不是交付物来源**。2026-08-02 真实会话实测:
//    evidence/INDEX.md 被当成 stray 反复复制成 out/INDEX-3.md、INDEX-4.md……每轮一份,
//    既污染用户交付面,又让用户看到本该只属于引擎的账本内部文件。
```

也就是说,**保留区的「对用户的名字」= 没有名字,不出现**。
但注意漏了一半:模型正文里说 `bundle` / `analysis/` 没人管 —— 实测 60 轮说 `bundle`、
5 轮说 `analysis/`、31 轮说 `StatRun`/`StatReport` 工具名(§五)。

### 先例 C · `out/manifest.json`:给产物起「对用户的标题」的既有通道

`backend/internal/claw/artifact.go:46-49`:

```go
// artifactManifestName 是 agent 可选写入 ./out 的清单文件: agent 用它显式声明每个交付物的
// title/description (相当于 deliver_artifact(path,title,description) 的元信息), 后端据此给
// 产物卡片更友好的标题。清单本身不作为可下载产物列出。缺失/格式坏 → 退化成只用文件名。
const artifactManifestName = "manifest.json"
```

prompt 侧 `claw.go:135-137` 教了写法。这是仓里**唯一已经存在的「文件 → 用户可读名字」映射通道**:

```json
{"artifacts":[{"file":"review.md","title":"锂电池固态电解质综述","description":"近三年对比"}]}
```

问题:① 它是 optional(`claw.go:135` 写「可选, 推荐」),② 只有 claw 教过,
sci_draw / stat_lab / boltslides 的 prompt 与 skill 里一个字没提,③ 它给的是**卡片标题**,
不改变模型在正文里怎么称呼它。

### 先例 D · 工具 chip 的中文语义表

`frontend-user/src/shared/components/chat/tool-semantics.ts:14-27` 是「工具名 → 用户语义」的唯一映射表:
`Bash→执行命令`、`Write→写入文件`、`ExportDocument→导出文档`、`Skill→技能`。
`:59-63 basenameOf` + `:65 fileParam` 已经在做「只显示 basename,不显示路径」——
这正是产物卡侧的正确口径。但它只管 chip,不管正文。

### 业界口径(仅作对照,标 info —— 本次未做外部检索,以下是本仓文档里的既有陈述)

`backend/internal/claw/artifact.go:6-8` 自陈本仓的范式来源:

```
// 成品即作为可下载产物到达用户。这是 OpenAI Code-Interpreter 式"已知输出目录"范式,
// 由 agent 自己决定什么写进 ./out (agent-native), 后端只忠实地把该目录的文件呈现出去。
```

「已知输出目录」是**后端与 agent 之间的契约**,不是用户词汇 —— 这一点在 `claw.go:119-126`
里被正确识别了(「用户看到的是聊天界面…看不到任何路径」),但只在 claw 一处落地。

**仓内可用的现成命名词汇**(散落各处,可作为统一术语的候选):
- `claw.go:125`「可在下方查看或下载」「见下方卡片」
- `bolt_slides.go:47`「可在右侧结果面板预览并翻页」
- `registry.ts:694`「the user-delivery directory」/ `:834`「the user's download/preview area」
- `registry.ts:776`「delivered to the user's download area」
- `frontend-user/src/features/claw/api/artifacts.ts:2`「成果交付 (artifacts)」

⚠️ 注意这些说法**互相不一致**:claw 说「下方卡片」,boltslides 说「右侧结果面板」。
如果 UI 布局在两个 feature 里不同,两句都对;如果相同,就有一句在骗用户。本次未做 UI 布局取证,标 low。

---

## 五、问题 5 —— 生产实测证据

`docker ps` 实测:`scholar_agent`(Up 18 minutes, healthy)、`scholar_backend`、`scholar_mysql` **均在运行**。

⚠️ `docker exec scholar_agent ls /home/bun/sessions` 返回 **0 条** —— 会话工作目录当前是空的
(与 `statlab-full-audit-2026-08-06` 记忆条记载的「dev 缺 sessions 挂载致 bundle 已灭」一致)。
**所以证据不取自磁盘,取自 backend 的 journal 表**(`agent_turns` / `agent_turn_events`,
migration 记载见 `docs` 的 `agent-session-durability-journal-2026-07`)。

### 口径

```sql
-- 分母:有可见正文的轮
SELECT COUNT(DISTINCT turn_id), COUNT(DISTINCT agent_session_id)
FROM agent_turn_events
WHERE ev_type='content_delta' AND JSON_EXTRACT(payload,'$.text') IS NOT NULL;
-- → 709 turns / 346 sessions

-- 分子:可见正文里出现 out/
SELECT COUNT(DISTINCT turn_id), COUNT(DISTINCT agent_session_id)
FROM agent_turn_events
WHERE ev_type='content_delta'
  AND JSON_UNQUOTE(JSON_EXTRACT(payload,'$.text')) LIKE '%out/%';
-- → 215 turns / 186 sessions
```

注:`content_delta` 是**用户可见的助手正文流**(`thinking` 是另一个 ev_type,103140 条,已排除);
带 `toolPath`/`toolInput` 键的 content_delta 是流式写文件卡,已被 `$.text IS NOT NULL` 排除。

### 逐字证据(全部来自生产库,已用 `--default-character-set=utf8mb4` 正确解码)

**① stat_lab · turn=878 · 2026-08-06 —— 教科书级的三重泄漏**

> ## 三、交付文件
>
> - **三线表 Word**:`out/table1_cn-core_7227ab2adcf1.docx`(上下粗线、表头细线、无竖线,可直接插入论文)
> - **Methods/Results 文字**:`out/results_cn-core_7227ab2adcf1.md`(可整段粘贴)
> - **可复现脚本**:`out/analysis_7227ab2adcf1.py`(固定随机种子,审稿人可原样重跑核对)

同一条回复后段还有:

> **4. 换期刊体系零成本。** 若以后改投英文期刊,把同一个 bundle 用 `StatReport` 重跑成 APA 7 格式即可

—— 一条回复里同时泄漏了**目录名 `out/`**、**内部哈希文件名 `7227ab2adcf1`**、
**引擎术语 `bundle`**、**工具名 `StatReport`**。这四样用户一个都不该看见。

**② stat_lab · turn=876 —— 用户原话痛点的原文复现**

> 分析完成,交付物都在 `out/` 目录下,可直接粘贴论文

**③ stat_lab · turn=809 —— 内部目录结构直接讲给用户听**

> 我这边**没有收到数据文件** —— 工作目录里只有空的分析目录

(用户刚上传完文件,得到的回复是一句关于「分析目录」的内部状态描述。)

**④ sci_draw · turn=120 / 121 / 116**

> 图已生成并保存至 `out/animal-cell.svg`(约 27KB)。下面是这张图的概览:
> 文件已生成:`out/animal-cell-detailed.svg`(27 KB,444 行)。下面…
> 图已生成 → `./out/mechanical-experiment-flow.svg`

**⑤ claw · turn=36 —— 模型把内部契约当成知识讲给用户**

> 已写入 `./out/report.md`,一句话内容为:
> > Scholay 学术平台交付产物测试 —— 一切正常,文件已成功写入 ./out/ 目录并可供下载。
>
> **简思:** `./out/` 是交付通道,写入即交付;

**⑥ boltslides · turn=113**

> 演示稿已成功编译!🎉
> 生成文件:**`out/deck.html`**(约 337…

**⑦ claw · turn=94 / 98 —— 注意这两条是「离正确只差一步」的形态**

> 已在 `out/` 目录下生成了 `battery.md` 文件,一篇约 230…
> 已写好,`note.md` 已写入 `out/` 目录,可在下方卡片…

turn=98 后半句「可在下方卡片」是 `claw.go:125` 教的正确说法 —— 模型**同时**执行了正确说法
和被禁止的路径陈述。这印证 `lang.ts:9-10` 的既有判断:「prompt 正面模板对 flash 已被审计证明无效,
机械检测是唯一可靠防线」。

### 泄漏不止 `out/` —— 整个内部词汇表都在漏

```sql
SELECT '工作目录', COUNT(DISTINCT turn_id) FROM agent_turn_events
 WHERE ev_type='content_delta' AND JSON_UNQUOTE(JSON_EXTRACT(payload,'$.text')) LIKE '%工作目录%'
UNION ALL SELECT '/work',      … LIKE '%/work%'
UNION ALL SELECT '/home/bun',  … LIKE '%/home/bun%'
UNION ALL SELECT 'analysis/',  … LIKE '%analysis/%'
UNION ALL SELECT 'bundle',     … LIKE '%bundle%'
UNION ALL SELECT 'StatRun/StatReport', … LIKE '%StatReport%' OR … LIKE '%StatRun%';
```

| 内部词 | 泄漏轮次 | 来源 |
|---|---|---|
| `bundle` | **60** | `statkit` 返回值键名 + `stat_lab.go` prompt 未禁 + `registry.ts:1562` description |
| `StatRun` / `StatReport` | **31** | 工具名,`workbench/SKILL.md:243` 直接把调用式写给模型 |
| `工作目录` | **28** | `claw.go:109/138`、`workbench/SKILL.md:16/39/46/48`、`sci_draw.go:63/77` |
| `analysis/` | 5 | `registry.ts:1562`、`StatReport` 拒绝回执 `registry.ts:1594/1607` |
| `/work` | 2 | `workbench/SKILL.md:16,21` |
| `/home/bun` | 1 | `workbench/SKILL.md:20` |

**这说明问题不是「out/ 这个名字取得不好」,而是「模型与我们共享一套内部词汇,而这套词汇没有对外的翻译层」。**
只把 `out/` 改名(例如改成 `deliverables/`)只会把 215 轮的泄漏原样搬到新名字上。

---

## 六、机制小结:这条泄漏链的每一环

```
┌─ L1 system prompt ──────────────┐  claw.go ×10 / sci_draw.go ×8;禁令只有 claw 有,
│  「写进 ./out/」                 │  且禁令段自己出现 3 次 ./out/
└──────────┬──────────────────────┘
           │
┌─ L2 skills(--add-dir 常驻)─────┐  sci-draw ×16 / bolt-slides ×4 / claw-add ×4
│  「产物 ./out/<名字>.svg」       │  + stat-lab 教 /work 与 /home/bun/sessions
└──────────┬──────────────────────┘  loader.ts:196-205 拼进 system 后缀
           │
┌─ L3 tool description(每轮在场)┐  registry.ts:198 Write —— 全 feature 都吃到
│  「To deliver… write under ./out/」│  :694 ExportDocument / :834 BuildDeck / :1562 analysis/
└──────────┬──────────────────────┘
           │
┌─ L4 tool_result(离生成最近)───┐  registry.ts:210/776/898 + statkit report.py:566-567
│  {"table_docx":"out/table1_….docx"}│  ← 模型除了照抄没有别的名字可用
└──────────┬──────────────────────┘
           │
      ┌────▼────┐
      │  模型   │  215/709 轮(30.3%)在正文里念出来
      └────┬────┘
           │
┌─ agent 出口 ───────────────────┐  leakGuard.ts:只认 10 条 DSML marker,零路径逻辑
│  turnLoop.ts:744-880 三条 guard │  ①max_tokens ②语言 ③字符画 —— 没有第四条
└──────────┬──────────────────────┘  verifyClaims 已降级纯观测(:9-10)
           │
┌─ backend 转发 ─────────────────┐  ws.go:691 content_delta 走廉价分流
│  原样广播 + 原样入 journal      │  :878 sanitize 只管 error 帧
└──────────┬──────────────────────┘
           │
┌─ 前端渲染 ─────────────────────┐  stripContainerPaths 只认 `./out/`
│  MessageTurn.tsx:291/321        │  实测命中 5/367 = 1.4%
└──────────┬──────────────────────┘
           │
        用户屏幕
```

**六个环节,五个是放大器,唯一的收敛器覆盖 1.4%。**

---

## 七、给方案设计的取证结论(不是方案本身)

以下是从证据里能直接推出的约束,供后续架构方案参考。

1. **改名不解决问题。** 内部词汇泄漏是 6 个词、300+ 轮的面,`out/` 只是其中最大的一块。
   改成 `deliverables/` 只会让 215 轮说新名字。

2. **纯 prompt 路线已被本次数据证伪。** claw 有全仓最详尽的禁令(`claw.go:119-126`,含正确说法示范
   与错误说法枚举),仍有 7.5% 泄漏,且 turn=98 显示模型会**同时**说正确说法与路径。
   本仓已有的判断在此再次成立:`lang.ts:9-10`「prompt 正面模板对 flash 已被审计证明无效,
   机械检测是唯一可靠防线」;`researchTurn.ts:6-7` 否决清单 #5「禁止把判定交给模型自评」。
   但 prompt 仍然必要 —— **只是不能是唯一防线**,且必须先把 L3/L4 的「教它这么说」拆掉。

3. **最高杠杆点在 L4(tool_result)。** stat_lab 197 轮泄漏的直接输入是
   `report.py:566-567` 那三个键。模型不是从 system prompt 里记住 `out/table1_cn-core_7227ab2adcf1.docx`
   这个字符串的 —— 它是 3 秒前刚从工具结果里读到的。**给工具返回值换一套面向用户的表示,
   一处改动覆盖 197/215 = 91.6% 的泄漏轮。** 这也符合本仓的既有心法
   (记忆条 `agent-evidence-architecture`:「让正确的路更便宜而非罚更重」)。

4. **`stripContainerPaths` 需要扩到裸 `out/`,但不能只做这个。** 它的保守设计有真实理由
   (`checkout/` `layout/` 误伤),扩正则要配一套锚定(如只在「反引号包裹 + 已知交付扩展名」时命中)。
   而且它是**渲染层**清洗 —— journal 里存的仍是原文,后台会话监控、导出、小程序镜像各自会再暴露一次。
   ⚠️ 已知它至少要在 3 处镜像同步(见 CLAUDE.md「跨包镜像」一节),单边修等于没修。

5. **prism 的做法是唯一被数据验证为 0 泄漏的形态**,值得作为目标态:
   ① 架构上让模型**没有理由**提文件(交付走别的通道,`spec.go:42-46` 禁掉会写 `out/` 的工具);
   ② prompt 明确要求【用内容化表述】(`edit.go:224`);
   ③ 关掉会误报的核验维度(`spec.go:110-115`)。三条缺一不可 —— 只做②就是 claw 的 7.5%。

6. **两个已存在但没用起来的资产**:
   - `out/manifest.json` 的 `title`/`description` 通道(`claw/artifact.go:46-49`)——
     现成的「文件 → 用户可读名字」映射,只在 claw prompt 里教过,且是 optional;
   - `tool-semantics.ts:59-65` 的 `basenameOf`/`fileParam` —— 产物 chip 侧已经在做
     「只显示文件名不显示路径」,口径正确,只是没延伸到正文。

7. **一个未取证的开口**(标 low,后续需查):`claw.go:125` 说「下方卡片」、
   `bolt_slides.go:47` 说「右侧结果面板」。若两个 feature 的产物 UI 位置实际相同,
   其中一句是在骗用户;若不同,则「用什么词描述产物在哪」本身需要一张 per-feature 的表。

---

## 附录 · 本次取证读过的文件清单

**Agent(TypeScript)**
`agent/src/turn/leakGuard.ts`(全 87 行)· `agent/src/turn/lang.ts`(全 201 行)·
`agent/src/turn/verifyClaims.ts`(全 239 行)· `agent/src/turn/deliveryGate.ts`(全 231 行)·
`agent/src/turn/artifacts.ts`(:170-260)· `agent/src/turn/turnLoop.ts`(guard 段 grep)·
`agent/src/policy/researchTurn.ts`(全 89 行)· `agent/src/policy/featurePolicy.ts`(全 25 行)·
`agent/src/skills/loader.ts`(全 230 行)· `agent/src/sandbox/reserved.ts`(全文)·
`agent/src/tools/registry.ts`(:115-214, :330-374, :505-520, :670-903, :1515-1634)·
`agent/src/evidence/render.ts`(:330-340)

**Agent(Python)**
`agent/stat-kit/statkit/verbs/report.py`(:486-570)+ 容器内 `/usr/local/lib/python3.13/dist-packages/statkit/verbs/report.py` 核对

**Skills(Markdown)**
`agent-skills/sci-draw-skills/{charts,molecules,figures}/SKILL.md` ·
`agent-skills/claw-add/guides/data-figures/SKILL.md` ·
`agent-skills/bolt-slides-add/slides/SKILL.md` ·
`agent-skills/stat-lab-skills/workbench/SKILL.md`(:1-60, :236-285)

**Backend(Go)**
`backend/internal/prompts/{claw,sci_draw,bolt_slides,stat_lab,smart_search}.go` ·
`backend/internal/prism/edit.go`(:190-230)· `backend/internal/prism/spec.go`(:36-50, :105-115)·
`backend/internal/claw/artifact.go`(:1-60)· `backend/internal/agentbridge/ws.go`(:685-700, :878-883)

**Frontend(TS/TSX)**
`frontend-user/src/shared/lib/strip-container-paths.ts`(全文)·
`frontend-user/src/shared/lib/mask-tool-source.ts`(:1-60)·
`frontend-user/src/shared/components/chat/tool-semantics.ts`(:1-120)·
`frontend-user/src/features/claw/components/preview/artifact-format.ts`(全文)

**生产数据**
`scholar_mysql` / `agent_turns`(878 行)· `agent_turn_events`(约 148k 行,13 种 ev_type)
