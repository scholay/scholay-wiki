# 智能助手工具调用交互改造调研(2026-07-31)

> 背景:claw(智能助手)执行任务时会连续调用大量工具,当前每个工具独占一行竖排 chip,
> 长任务十几个工具行刷屏;写文件等"重量"动作只有一个 spinner,过程零可见。
> 本报告 = 现状取证(3 份代码深读)+ 行业对标(ChatGPT/Claude/Cursor/Manus/Perplexity 等 5 份调研)
> + 按实现成本分档的对齐方案。调研由 8 个并行子代理完成,行号以 2026-07-31 工作区为准。

---

## 〇、TL;DR

1. **刷屏根因**:claw 对 `turn.blocks` 顺序平铺,每个工具一行 `ToolCallBlock`、零分组零折叠
   ([MessageTurn.tsx:178-268](../frontend-user/src/features/claw/components/chat/MessageTurn.tsx));
   而**整段折叠容器 `ProcessFold` 已经在 shared 里**,prism 在用,claw 差"一次切片"的距离。
   行业(OpenAI/Anthropic/Perplexity/Manus)在这点上完全收敛:**对话流里永远只占一张持续更新的卡,
   绝不逐调用发消息;运行中膨胀、完成后坍缩成带耗时的一行**。
2. **流式写文件卡**:协议已就绪 —— agent 已把 Write.content 逐 token 以
   `content_delta{toolInput,toolPath}` 广播([turnLoop.ts:367-393](../agent/src/turn/turnLoop.ts)),
   prism 靠它做了文档实时预览;**claw 的 fold 显式丢弃这些帧**
   ([fold.ts:97-101](../frontend-user/src/features/claw/components/chat/fold.ts))。
   接上是纯前端工作。
3. 其余差距按成本分三档(§四):P0 纯前端(分组折叠/流式卡/工具行语义化/失败聚合/完成态摘要),
   P1 agent 单点小改(per-tool status verb / Edit 流式 / toolInput 入 journal),
   P2 完整立项(Bash stdout 流式 / tool_progress 进度协议 / 任务清单)。
   子代理嵌套展示**明确不做**(执行器无 Task 工具,阻塞于 L2 沙箱)。

---

## 一、现状诊断(代码取证)

### 1.1 数据管线(心智模型)

```
agent WS 帧 → useAgentSocket(rAF 批处理) → agent-stream.ts(相邻 delta 合并,含 toolInput)
  → 各 feature fold(claw/smart-search/prism 三份独立实现) → shared Turn[] 模型
  → MessageTurn.tsx → ToolCallBlock(全站唯一工具卡)
历史回放:GET messages → shared/lib/agent-history.ts → 同一 Turn[](实时/回放刻意同构,铁律)
```

工具相关帧只有 4 种:`content_start`(tool_use 开块)/ `content_delta{toolInput,toolPath}`(仅 Write)
/ `tool_use_complete`(完整入参一次性)/ `tool_result`(结果+isError+userMessage)。
从 `status:tool_executing` 到 `tool_result` 之间**协议上零帧**(工具执行期是黑盒)。

### 1.2 六个确凿差距

| # | 差距 | 证据 |
|---|---|---|
| 1 | **零分组零折叠**:10 个工具=10 行 chip 竖排,中间叙述与最终答案视觉权重相同 | MessageTurn.tsx:178-268;ProcessFold 仅 prism+admin 用 |
| 2 | **toolInput 流式明文被扔掉**:claw/search fold 只认 `msg.text`,"构建中/执行中"两态 UI 无区分,只有 spinner | claw fold.ts:97-101;search types.ts:124 显式注释丢弃 |
| 3 | **失败重试零聚合**:agent 重试 3 次=4 行 chip(3 amber+1 绿),无"重试第 N 次"语义 | 每次重试新 toolUseId → 独立 ToolBlock |
| 4 | **工具名对用户裸露英文**:chip 标题只剥 `mcp__minicod__` 前缀,Bash/Read/ExportDocument 直接露;等待胶囊(StreamingIndicator)倒是有中文动词表 —— 同一工具两处两个语言层级 | ToolCallBlock.tsx:78-85 vs StreamingIndicator.tsx:102-119 |
| 5 | **完成后不收纳**:轮结束后所有工具行原样留在历史里,长会话回看噪声大 | 无 completed-collapse 机制 |
| 6 | **声明了但没用的数据**:`parentToolUseId`(协议也不发)、`Turn.usage/model`、`status.tokens`、`error.retryable`、claim_audit 细分字段 | shared/types/chat.ts + fold 各处 |

### 1.3 站内已有的好模式(不用发明,搬运即可)

- **ProcessFold**(shared):「处理过程 · N 步」,流式默认展开、完成默认收起、用户可 override。
  prism 的切片算法(PrismMessageTurn.tsx:49-56)已解决 complete-gated 答案外提的流式抖动坑。
- **prism 流式预览**:`currentStreamingWrite()`(usePrismChat.ts:106-125)是现成的
  「扫 messages 找未闭合 Write + 累计 toolInput + toolPath 校验」算法模板。
- **peer-review 旁白尾巴**:StreamingReviewerView 只显示最近 360 字 + 光标 —— 流式尾巴窗口的现成样式。
- **boltslides「产物即进度」**:busy 期 2.5s 轮询产物提早露出 + 自动打开右侧预览
  (ConversationWorkspace.tsx:170-203,claw 普通对话刻意不轮询,可复用 `revealWhileBusy` 通道)。
- **特化卡外挂机制**:`classifyMinicodToolResult` dispatcher + 「chip + 兄弟卡片」模式
  (论文/期刊/作者/片段卡),按 toolName 接管渲染的三个先例(AskUserQuestion 不渲染 /
  minicod 卡片 / Skill 徽标)。

---

## 二、行业模式提炼(5 份对标调研的交集)

> 详细出处见各产品小节;此处只列已被多家验证、且适用于我们场景的定律。

1. **单卡容器律**(OpenAI 四层收纳/Claude Research/Perplexity):任意多的内部动作,
   对话流里只占一个持续更新的容器。ChatGPT 把几十次搜索收进思考流或侧栏 Activity;
   **没有任何一家采用"每次工具调用一条消息"的时间线平铺** —— 我们现在恰是这个反模式。
2. **运行态≠完成态**:运行中膨胀(展开的活动流),完成后坍缩为带耗时戳的一行
   ("Completed N steps" / "Thought for 2m40s" / 「处理过程 · N 步」)。历史必须干净。
3. **现在进行时文案是最便宜的进度条**:"正在读 xxx.com" 比百分比可信且天然容错。
   行业全部用「一行滚动 narration」而非进度条做长任务进度感。
4. **意图永远外显,结果按风险×信息量分级**(Claude Code):
   `⏺ 工具名(关键参数)` 头部行永不折叠;只读低信息量工具一行摘要;
   Bash 命令全显+输出折叠 `+N lines`;**Write/Edit 的 diff 默认全展开**(改变世界的动作必须给人看)。
5. **结果即交付物的不折叠**(Anthropic 自家 issue 的反面教训):MCP 图表结果被默认折叠是
   最集中的抱怨 —— 我们的论文卡外显是对的,方向要坚持并推广到更多"产物型结果"。
6. **失败降级为协作/自愈,聚合重试**:代码解释器把"错误→自动改→重跑"折叠在一个分析块内;
   Windsurf 把 auto-fix 升格为显式步骤类型。不弹裸错误、不让 N 次重试各占一行。
7. **三级粒度是搜索类标配**(Perplexity 验证):实时逐条滚动(活着的信号)→ 完成态计数聚合条
   (降噪+工作量证明,"检索 206 网页→引用 26 篇"漏斗)→ 点开完整清单(审计)。
   步骤名用**用户心理模型语言**("正在核对当前预测")而非工具名;按意图分组而非按调用次数罗列。
8. **学术场景特有**:Elicit/Consensus/SciSpace 弱化时间线、强化**证据结构**
   (表格/筛选漏斗/质量统计/支撑引文)。学术用户的信任来自可复核证据链,不来自"看它忙碌"。
9. **计划即合同**(Gemini Edit plan/扣子规划模式/TodoWrite):长任务先亮清单,
   进行中置顶自动折叠到只剩当前项(Copilot v1.104 的教科书实现);进度对象需要 sticky 锚位,
   内联清单会被长会话滚走。
10. **写文档动作的空间隐喻**(Canvas/Artifacts):通过"所有权测试"(>15 行、自包含、用户会带走)
    的内容离开对话流进独立面板,流式写入面板,对话流留占位卡;OpenAI 2026-05 又把 Canvas
    收回对话内嵌块 —— 分屏 vs 内嵌两种范式在摇摆,但"产物离流"共识未变。
11. **Perplexity 的商业论据**:动态过程 UI 替代静态等待后查询量 +50%;
    "用户更愿意等待,如果显示中间进度" —— 这是过程可视化的直接营收依据。

---

## 三、对齐方案(按组件落点)

### 3.1 轮内结构重组:ProcessFold 接入 claw(治刷屏的主刀)

把 claw 一轮的 blocks 切成三段渲染:

```
[ThinkingFold]                        ← 现状保留
[处理过程 · N 步  ▾]                   ← ProcessFold:工具 chip + 中间叙述文本降权收纳
   ├ 工具组/工具行(见 3.2/3.4)
   └ 中间叙述("服务有点波动…" 小字号 text-12 淡色)
[特化卡:论文/期刊/作者/片段卡]          ← 外提,不进折叠(定律 5:结果即交付物不折叠)
[最终答案 markdown]                    ← complete-gated 外提(照抄 prism 切片,防流式抖动)
[TurnArtifacts / TurnFigures / 审计标注] ← 现状保留
```

- 流式中折叠默认**展开**(活着的信号),`turn.complete` 后默认**收起**为一行
  「处理过程 · N 步 · 耗时 Xs」(定律 2);`placeholder.elapsedSeconds` 已有数据源。
- 切片实现照抄 PrismMessageTurn.tsx:49-56,**必须 complete-gated**(prism 注释 30-32 行踩过的坑)。
- 与 prism 的差异要处理:claw 有特化卡 —— 切片时把「minicod 且 kind≠unknown 的工具块」
  的**卡片**外提到折叠之外,chip 本体留折叠内(或卡片紧跟折叠容器下方,保持曝光上报不变)。
- 落点:改 `features/claw/components/chat/MessageTurn.tsx`(渲染层 useMemo 变换,不动 fold);
  admin 的 AdminTranscriptView 有独立 prism 镜像,若共用组件注意核对。

### 3.2 工具行语义化:「意图行」升级(治可读性)

对齐 Claude Code 的「⏺ 工具名(关键参数)」范式:

- **收口一张 shared 映射表**(现状两张:ToolCallBlock 的 prettyToolName/toolIcon +
  StreamingIndicator 的 toolVerb):`工具名 → {中文名, 图标, 进行时动词, 关键参数抽取器}`。
  例:`Bash → 执行命令 · $ npm run build`、`Write → 写入文件 · report.md`、
  `Read → 读取文件 · data.csv`、`ExportDocument → 导出文档 · PDF`、
  `mcp__minicod__search_papers → 检索论文 ·「query」`(现有 MinicodToolMeta 已做,推广到全部工具)。
- 关键参数前置到 chip 标题区(`renderHeaderExtras` 机制现成),用户不展开就知道每步在干什么 ——
  **工具行即叙述**(Claude Code 的节奏定律)。
- 展示文本必须过 `maskToolSource` + `stripContainerPaths`(数据源别名/容器路径铁律)。

### 3.3 流式写文件卡(治"写文件干等 spinner")

**协议已就绪,纯前端**:

1. claw/search 的 WS union 补 `toolPath` 声明(对齐 prism ws-types.ts:34);
2. `fold.ts` 的 content_delta case 把 `toolInput` 增量挂到当前未闭合 ToolBlock
   (`ToolBlock` 加可选 `streamingInput?: string`,shared/types/chat.ts;三份 fold 都要喂,
   正好是推动 fold 收口的契机);
3. `ToolCallBlock` 构建态从纯 spinner 升级:文件名(toolPath basename)+「已写入 N 字」计数
   + 最近 3-5 行滚动尾巴(monospace,照抄 peer-review 旁白尾巴样式);
   `tool_use_complete` 到达即切回常规态。
4. 大文档场景(写报告/综述)可再进一步:复用 boltslides 的右侧预览面板,把流式明文灌进
   `ClawArtifactPreview` 提前渲染(「产物即进度」)—— 这一步做不做看 3.1/3.3 上线后的观感。

限制(可接受):仅 Write.content(Edit 需 P1);刷新/重连丢流式态(journal 不存 toolInput),
`tool_use_complete` 后自动恢复。

### 3.4 失败/重试聚合(治「未成功」刷屏)

- 渲染层(blocks→groups useMemo)把**连续的同名工具块**合并为一个聚合组:
  `检索论文 ×4 · 3 次未成功` + 当前态图标;展开见逐条(保留每条的展开审计能力)。
- 对「失败后同名重试」的序列,聚合行加「已自动重试」语义 —— 把失败从"报警"改叙成
  "自愈过程"(定律 6),配合现有 amber 色(失败不用红的设计拍板保持)。
- 聚合判定建议:相邻 + 同 toolName(可放宽到同族,如全部 minicod 检索工具);
  中间夹叙述文本则断组(叙述是 agent 的转折点信号,值得保留位置)。
- 在渲染层做而非 fold 层做的理由:不动三份 fold、不破坏实时/回放同构铁律、
  历史轮引用稳定(MessageTurn memo)可用 useMemo 保住。

### 3.5 搜索任务的计数聚合条(学术特化,定律 7/8)

claw/smart-search 一轮十几次检索时,在 ProcessFold 标题行(或折叠下沿)给漏斗计数:
「已检索 N 次 · 命中 M 篇 · 展示 K 篇」—— 数据全部可从 blocks 就地统计
(minicod 工具数 + parsePapersFromToolResult 结果数),零协议成本。
完成态的这行计数就是"工作量证明"(Kimi 206→26 漏斗的同款心理学)。

### 3.6 等待态叙述升级(定律 3)

- StreamingIndicator 文案的信号源现状是前端 toolVerb 硬编码,P0 内先把映射表补全
  (3.2 的同一张表);P1 让 agent 在每个工具开始时发 `status{verb}`(runTools runOne 开头一帧),
  前端消费链路(fold.ts:139-146 → StreamingIndicator 优先级 3)已完备,**只差发送端**。
- `status.elapsed/tokens` 槽位前端也已支持,agent 补发即可让长轮显示「已思考/已执行 N 秒」。

---

## 四、成本分档路线图

### P0 —— 纯前端(帧已在广播;建议一个批次做完,互相成就)

| 项 | 落点 | 备注 |
|---|---|---|
| ProcessFold 接入 + 三段切片 | MessageTurn.tsx | §3.1;admin 镜像核对 |
| 工具语义映射表收口 | shared 新文件 + ToolCallBlock + StreamingIndicator | §3.2 |
| 流式写文件卡 | fold.ts×3 + chat.ts + ToolCallBlock | §3.3;ToolBlock.streamingInput |
| 同名工具/重试聚合组 | MessageTurn useMemo | §3.4 |
| 检索漏斗计数条 | ProcessFold 标题区 | §3.5 |
| 完成态收纳(N 步·耗时) | ProcessFold + placeholder.elapsedSeconds | §3.1 |

### P1 —— agent 单点小改(协议向后兼容,旧前端自动忽略)

- per-tool `status{verb}`:runTools.ts runOne 开头发一帧(等待文案从"猜"变"真")。
- Edit/多字段流式:streamText.ts:10 白名单 + 帧加 `toolField`;claw 场景可先只做
  「Edit 也显示目标文件名+进度」不做内容预览(预览定位需文件基线,claw 没有)。
- toolInput 入 journal(重连不丢流式态):classifyJournalEv 加 case + batcher 独立合并 buffer
  (参照 thinking 模式),顺带修 replayBuf 的 toolInput 不合并放大点(hub.go:1704)。
- Turn.usage/model 展示(fold 补两行赋值,indicator 末尾小字)—— 可选。

### P2 —— 完整立项(单独设计,不塞进本次)

- **Bash stdout 增量流**:动 6 处(ToolCtx.emit → runTools 注入 → readCapped 边读边发 →
  journal/replayBuf 合并 → 前端渲染),外加 stop 中途/续流/背压三个语义问题。
- **tool_progress 结构化进度协议**:无现成信号源,多数工具只能给阶段不能给百分比;
  建议与 agent-plans(统计/综述引擎)立项合并设计 —— 那些长任务才是进度条的真需求方。
- **任务清单(TodoWrite 式)**:执行器无此工具;行业验证的价值是前置承诺+滚动心跳+sticky 锚位,
  同样建议随 agent-plans 一起设计(计划引擎天然产出步骤清单)。
- **明确不做**:子代理嵌套展示(执行器无 Task 工具,backend 显式禁,阻塞 L2 沙箱;
  parentToolUseId 字段留着即可)。

### 移动端注意

桌面的折叠/侧栏在移动端应降级为「可展开 sheet」(OpenAI 移动端同款);
小程序 claw 镜像(miniprogram)有独立渲染,本次改造范围先限 Web,镜像跟进单列。

---

## 五、改造约束(既有铁律,别踩)

1. 失败色 amber 不用红(设计拍板,ToolCallBlock.tsx:31-32;顺带修 :132 过期注释"失败红")。
2. 任何入参/结果/错误展示必须过 `maskToolSource` + `sanitizeOpsText` + `stripContainerPaths`
   (数据源别名铁律有回退事故史)。
3. 实时 fold 与历史回放 fold 必须同构(agent-history.ts 头部事故记录);
   给 ToolBlock 加字段 → 三份实时 fold + agent-history 四处同步喂。
4. 长会话性能:分组变换在渲染层必须 useMemo 且不破坏历史轮引用稳定(MessageTurn memo)。
5. 样式只用 globals.css token;新组件核对消费方清单:claw(桌面+移动)、smart-search、
   prism、boltslides/sci_draw(经 claw)、admin AdminTranscriptView。
6. 新增过程帧若要"刷新后还在",必须进 journal 白名单+batcher 合并策略,否则是
   「刷新即消失的装饰」—— 设计时先决定要不要回放同构。

---

## 附:调研报告原文

8 份子代理报告全文存于会话 scratchpad(`toolux/report_0..7.md`):
前端渲染链路取证 / agent 协议信号盘点 / 五 feature 横向对比 /
ChatGPT / Claude / Cursor·Windsurf·Copilot·Cline / Manus·Devin·扣子·Kimi / Perplexity·Gemini·学术三家。
关键确证来源已内联在 §二(各定律后括号);完整 URL 清单见各原文。
