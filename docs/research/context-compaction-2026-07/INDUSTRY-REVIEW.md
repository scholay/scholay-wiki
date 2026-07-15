# 上下文压缩:是不是该换业界更成熟的做法?— 给 owner 的决策报告

2026-07-15。承接自研上下文压缩(`agent/src/turn/compact.ts` 滚动摘要 + `window.ts` 硬截断兜底,`server/ws.ts` 触发)。owner 问:这套是自研的,是不是该找业界更成熟的做法?

**一句话结论**:**保留手写为可移植主路径,不引框架、不换库;分三期补齐 4 类成熟模式。** Anthropic 原生 compaction 只能作为「运行时确认上游是官方 Claude」时的门控快路,不能当通用替代——因为 provider-agnostic 是产品硬约束。

---

## 1. 直接回答

### (a) 该不该引框架 / 库(LangChain.js 等)?—— **不该**

- **手写是这个问题域的行业共识,不是「没找到成熟方案」。** 四家主流 coding agent —— Claude Code、OpenAI Codex CLI、OpenCode、Sourcegraph Amp —— 的上下文压缩**全部自研,无一引第三方摘要库**(核实:badlogic 研究 gist + 各家一手源码)。其中 **OpenCode 就是 TS/Effect-TS 栈**(compaction.ts 直接 import `effect`),是与我们 Bun/TS 执行器最接近的同语言同类,依然自研。所以「手写=不成熟」这个前提本身不成立。
  - 修正一处措辞:**Amp 已从「自动递归摘要」转向手动 handoff 抽取**(开新线程 + 目标驱动抽取 prompt),不是「自动 LLM 摘要」;但「自研、无第三方库」这一半对 Amp 仍成立。这反而是一个信号:业界在从「递归自动摘要」往「抽取/handoff」走(多次 compaction 会累积失真),与我们已有的「产物原样保留」设计同向。

- **LangChain.js 功能不弱,但耦合成本不可接受。** 核实:langchain v1 的 `summarizationMiddleware`(接近上限自动摘要 + 保留最近)、`@langchain/core` 的 `trimMessages`、deepagentsjs 的 `findSafeCutoffPoint`(保证 AI tool_calls 与 ToolMessage 不被摘要边界拆开)在 JS/TS 侧都是成熟实现——**功能层面和我们的 compact.ts 高度同构,甚至多了「full history offload 可回捞」**。所以拒绝理由**不能是「它做不到」**,只能落在耦合:`summarizationMiddleware` 是绑在 `createAgent` 这套 Agent 运行时 + `HumanMessage/AIMessage/ToolMessage` 抽象 + `ChatModel` 封装上的中间件,不能对裸消息数组直接调用(官方 reference 明确)。我们的执行器直接用 `@anthropic-ai/sdk` 的 `MessageParam` + 自研 turnLoop + WS 管道 + 权限系统。**引入它 = 迁移整个 agent 框架,不是 drop-in 一个函数**;且 provider-agnostic 上游还得再包一层 LangChain `ChatModel` wrapper。为约 160 行的关注点吞下框架级迁移与体积,违反前端铁律「新依赖体积可控」。

- **我们最吃重的定制,框架天然不覆盖**:学术产物 regex 保留(`stc:/olx:/pmd:` 论文 ID、`/home/bun/sessions/` 会话路径、URL)、按 `@anthropic-ai/sdk` 精确内容块形状切回合、WS 透明通知、out-of-band 计费 `kind=context_compact`。即便引框架,这些层仍要自己写,框架只替得掉最简单的「摘要 + 切边界」——净收益为负。

- **LlamaIndex TS**:摘要能力比其 Python 侧薄,同样绑框架抽象。不建议。

- **llmtrim / Headroom 是另一个品类,替代不了 compact.ts**:它们做的是「对单条消息/工具输出的确定性 token 裁剪」(JSON 最小化、去冗余、无额外 LLM 调用),不是对话历史的滚动摘要。能**补位**(压大 tool_result JSON),但不是「更成熟的摘要方案」。且 Headroom 在 GitHub 呈多个竞争 fork、归属分散、「5.9 万 star」系搜索聚合器串号(**low 置信 / 待核实**),作为硬依赖成熟度风险高。真要用只借「进历史前最小化大 tool_result」这一招,自己实现即可。

> 结论:TS 生态**没有**满足「维护活跃 + 体积可控」的对口 drop-in。唯一功能对口的抽象(LangChain memory / summary-buffer)要么是重框架、要么(Python 的 `ConversationSummaryBufferMemory`)已 deprecated。「保留手写」满足前端铁律「能用成熟三方包就别自研」的**例外条件**。

### (b) 该不该用 Anthropic 原生特性?—— **可选门控增强,不能当通用替代**

三个原生特性都已核实一手文档(platform.claude.com,2026-07-15 抓取):

| 特性 | 是什么 | 与 compact.ts 关系 |
|---|---|---|
| **server-side compaction**(`compact_20260112`,beta header `compact-2026-01-12`)| server 端近上限自动滚动摘要、发一个 compaction block、后续请求自动丢弃 block 之前内容 | **compact.ts 的直接官方对应物**——免去客户端 detect/摘要逻辑 |
| **context editing**(`clear_tool_uses_20250919`,beta header `context-management-2025-06-27`)| **丢弃**(非摘要)最老 tool_result,默认保留最近 3 个 tool use,可 `exclude_tools`、`clear_at_least`、`clear_tool_inputs` | 是**补充**,可与 compaction 组合 |
| **memory tool**(`memory_20250818`,已 GA)| 跨会话持久记忆文件,模型主动 view/create/str_replace | **与「对话内压缩」是两回事**,和我们已有的 `user_memory_blocks` 定位重叠 → 对压缩问题**价值低,忽略** |

- **胜负手 = provider-agnostic 约束。** 这三者都是 Anthropic 平台 server-side 特性,只在**官方 Claude API / Bedrock /(Vertex 待核实)上跑受支持 Claude 模型**时生效(compaction 文档列出的支持模型:Fable 5 / Mythos 5 / Opus 4.6-4.8 / Sonnet 4.6-5,**无非 Claude 模型**)。我们上游明确 provider-agnostic,实际路由过 DeepSeek/Qwen/OpenAI 兼容端点 + cometapi 等网关——它们**不实现 `context_management` 参数,会忽略或报错**。所以原生 compaction **不能作为唯一/默认方案**,手写压缩必须保留为可移植兜底。
- **收益数据(Anthropic 自评,佐证方向对但不能外推)**:context editing 单用在 100 轮网页搜索评测让原本会失败的 workflow 完成、token 降 84%;editing +29% / editing+memory +39%(agentic search)。方向是「到近窗口就压缩/清理」,支持我们继续投这套逻辑。
- **业界批评点(直接印证我们已领先)**:清理老 tool_result 若不先把仍需要的信息持久化,等于「没有 write barrier 的垃圾回收」。我们 compact.ts 的「丢弃前用正则原样抽取论文 ID/路径/URL」正是这个 write barrier,**是必须保留的成熟模式**。
- **可做但非必需**:「运行时确认上游是官方 Anthropic + 模型受支持」时走 native `compact_20260112` 快路,失败回落手写。接入成本可控(同一 SDK 的 `client.beta.messages.create({betas, context_management})`),真正障碍只是上游身份。这是 **per-provider 门控优化,不是替代**。
- **更该做的**:把 context editing 的**算法**(丢最老 tool_result / 保留最近 N / 排除某些工具)**借鉴成纯本地 TS 实现**——provider 无关,不依赖任何 Anthropic-only API,任何上游都生效。Claude Code 就把它做成压缩前更廉价的第一档。

### (c) 该不该保留手写?—— **是,作为可移植主路径**

- provider-agnostic 是硬约束,手写是**唯一可移植方案**。
- 现有实现**不是简陋自研**:已实现成熟方案核心五要素(token 阈值触发 / 最近回合保留 / 便宜档摘要 / 产物保留 / 失败回落硬截断)+ 回合边界 tool 配对安全(`isTurnStart`)+ 透明提示 + 单独计费 + 增量「摘要的摘要」(同连接内隐式 memoize / 分层)。**结构安全和增量摘要已达业界水准**。
- **一处已领先业界**:`extractArtifacts` 正则原样保留产物,比「让模型引用原文」更确定,别丢。

---

## 2. 手写实现 vs 成熟模式 · 差距清单

### 已有(不要动)
token 阈值触发 · 最近回合保留 · 便宜档(haiku)摘要 · 失败回落硬截断 · 回合边界切保 tool 配对 · 透明 `system_notification` · out-of-band 计费(`kind=context_compact` / SkipQuota)· 增量「摘要的摘要」· **产物原样保留(领先项)**。

### 缺(按性价比排序)

| 优先级 | 缺口 | 现状(已核实代码) | 成熟做法 | 影响 |
|---|---|---|---|---|
| **P0** | **反应式触发 / 触发只信上一轮 usage** | `ws.ts:267` `lastCtx = meta.lastUsage ? … : 0`;`meta.lastUsage` 仅在一轮完成后(`ws.ts:232`)设置。**重连 seed 大历史 / 首轮时 lastUsage 未设 → lastCtx=0 → 压缩不触发,且兜底 `windowMessages` 在同一 `catch` 块内 → 兜底也不跑**。DESIGN.md L35 明写的第二条触发线「history 明显超窗口(切小模型)」未实现 | 发送前对当前 messages 做字符/token 估算作触发信号;并在上游 context-overflow 错误时**有界重试**压缩(对齐 Claude Code `prompt_too_long` 反应式压缩,限 3 次) | **恰好漏掉立项要覆盖的「1M 切 256k、500k 历史首条溢出」场景**——那一刻 lastUsage 为空,直接撞墙报 `upstream failed`,连硬截断都不兜。**这是最大缺口** |
| **P0/P1** | **缺「先剪 tool_result 再摘要」的廉价档** | `renderForSummary`(compact.ts:46-50)只在**喂摘要器的文本**里把 tool_result 截到 240 字;真正发上游的 `wireMessages`(turnLoop.ts:176-182)里老 tool_result **仍是全量 JSON**;一撞阈值直接上 LLM 全摘 | 独立于摘要的**确定性裁剪**:反扫 tool 调用、保护最近 N token 工具输出、更老的就地**替换为占位符**(保 tool 配对,不删块)。OpenCode 保护最近 40k / 可裁超 20k;Claude Code Tier1 保最近约 5 个 | tool_result(论文全文/PDF 解析/大 JSON)是长会话膨胀主因;**常不动一次 LLM 就省大头**。**最高 ROI**。阈值做成可配置(OpenCode issue #16285 提示 40k 硬编码不随窗口 scale) |
| **P1** | **「保留最近」按回合数(25)非 token 预算** | 触发用 token、保留用 `WINDOW_KEEP_TURNS=25` 回合数,**二者错配**;`compact.ts:99` / `window.ts:34` 纯索引切,无 token 核算;25 个含大 tool_result 的回合压缩后仍可能超窗;压缩后不复核「是否真降到窗口下」 | Codex 保留最近约 20k token;LangChain summary-buffer 按 token 长度 flush。改按 token/字符预算(**回合边界对齐**保配对) | 回合内容 token 差几十倍 → 回合数裁法要么浪费、要么仍溢出 → 反复触发压缩(thrash) |
| **P1** | **兜底不保证放得下** | `windowMessages` 保留同样 25 个**未裁剪**回合(含完整 tool_result),可能比压缩尝试的产物还大,仍溢出 → 正是它要防的崩溃 | token 有界的最小保留(如只留最近 N token / 1-2 回合),**确保一定不溢出** | 兜底是「地板」但不是「保证放得下的地板」 |
| **P2** | **无递归/分层摘要** | 老回合渲染 >48k 字符(`SUMMARY_INPUT_CHARS`)时 `rendered.slice(-48k)` **直接丢最老一段**(compact.ts:106);渐进增长靠增量摘要绕过,但单次大跳(切小模型 seed 大历史)硬丢最早正文 | map-reduce 分块摘要(Aider ChatSummary)。注:单次摘要也是主流(Claude Code /compact),map-reduce 是**选项之一非唯一标准** | 早期目标/约束散文丢失;产物 regex 在 cap **之前**跑(L104)→ ID/URL 还在。**可接受的次要缺口,记档** |
| **P2** | **增量摘要 + 失败重试缺** | 摘要失败仅一次性回落硬截断,无退避重试;摘要对每次重算破坏上游 prefix 缓存;摘要对只在活连接内存,不落 journal → 重连按 seed_history 重放,摘要丢失需重算 haiku | 只摘「新滑出段」拼旧摘要;摘要调用加退避重试;摘要对写回 journal 做 checkpoint | 多次压缩累积降准 + 重连重复付费。**优化项非必修** |
| **P2(低成本)** | **产物 regex 有学术漏洞 + 摘要 prompt 自由体** | 未抽 DOI(`10.xxxx/`)与 arXiv ID;路径只认 `/home/bun/sessions/`(uploads/ 等漏);上限 40 静默截断;摘要 prompt 是自由体「150-400 字要点」 | 补 DOI/arXiv/bib key 正则、放宽路径、去静默截断;摘要 prompt 升级为结构化分节(进度/决策/约束/TODO/关键数据),对齐 Codex handoff / Claude Code | DOI/arXiv 是学术引用核心标识,当前完全不保留;补几条正则成本极低收益直接 |

---

## 3. 推荐路线

**一句话**:保留手写为可移植主路径,不引框架不换库;分三期补齐反应式触发、先剪 tool_result、token 预算裁剪、兜底有界这 4 类成熟模式;Anthropic 原生 compaction 仅作「确认官方 Claude 上游」时的门控快路。

**分期**:

- **P0(必补,投入最小、收益最直接)**
  1. 加「发送前字符/token 估算」触发信号 + 上游 context-overflow 有界重试 —— 修复漏掉的第二条触发线,这是立项要覆盖场景(切小模型 seed 溢出)的**正解**。
  2. 兜底改 token 有界最小保留 —— 保证一定放得下。

- **P1(高 ROI)**
  3. 独立的「先剪老 tool_result 再摘要」确定性廉价档(就地替换为占位符、保 tool 配对、provider 无关;阈值可配置)。
  4. 「保留最近」从回合数改 token 预算(回合边界对齐)。

- **P2(打磨,可选)**
  5. 产物 regex 补 DOI/arXiv、放宽路径、去静默截断。
  6. 摘要 prompt 结构化分节。
  7. 增量摘要 + 失败退避重试 + 摘要对落 journal。
  8. 超长单跳 map-reduce 分层摘要。

- **可选增强(非必须)**:运行时确认上游是官方 Anthropic/Bedrock + 模型受支持时,走 native `compact_20260112` 快路,失败回落手写。仅 per-provider 优化。

**不值得引**:LangChain.js / LlamaIndex TS(框架级迁移、体积重、定制不覆盖)· llmtrim/Headroom(品类不对 + 归属存疑)· Anthropic memory tool(跨会话记忆,与 `user_memory_blocks` 重叠,非 Claude 不认)。

---

## 待核实 / 置信标注

- **Headroom 归属、维护活跃度、star 数**:搜索聚合串号,**low 置信**。若真要引这类轻量库,需先快扫一遍 npm 确认「维护活跃 + 体积可控」。
- **Vertex 是否支持 compaction**:未独立复核(Bedrock 已一手确认支持,Claude 模型);非决策关键。
- **native compaction 的确切 supported models 列表**:一手文档与二手 summary 间略有出入(不影响任何结论)。
- **Claude Code 触发水位确切数字**(83.5% / 64-75%):取自二手博客,Anthropic 未公布精确值,**medium 置信**;方向(近上限触发)一手佐证充分。
- **badlogic gist 转述的 justin3go 博客逐字引用**:属实为改写非原文逐字;但四家自研的事实由各家一手源码独立核实,结论不受影响。

## 一手来源

- Anthropic compaction:https://platform.claude.com/docs/en/build-with-claude/compaction · Bedrock 变体:https://docs.aws.amazon.com/bedrock/latest/userguide/claude-messages-compaction.html
- context editing:https://platform.claude.com/docs/en/build-with-claude/context-editing
- memory tool:https://platform.claude.com/docs/en/agents-and-tools/tool-use/memory-tool
- LangChain.js:https://reference.langchain.com/javascript/langchain/index/summarizationMiddleware · https://reference.langchain.com/javascript/langchain-core/messages/trimMessages · https://deepwiki.com/langchain-ai/deepagentsjs/5.4-summarization-middleware
- 四家 agent 压缩对比:gist.github.com/badlogic/cd2ef65b0697c4dbe2d13fbecb0a0a5f · codex.danielvaughan.com/2026/04/14/context-compaction-deep-dive · Amp handoff:ampcode.com/news/handoff
- OpenCode 裁剪:deepwiki.com/sst/opencode/2.4-context-management-and-compaction · issue #16285

## 相关代码

- `agent/src/turn/compact.ts` —— 滚动摘要核心(`renderForSummary` L46-50 · `extractArtifacts` L58-67 · `SUMMARY_INPUT_CHARS` 硬丢 L106-108)
- `agent/src/turn/window.ts` —— 硬截断兜底 + `isTurnStart` 回合边界配对约束
- `agent/src/turn/turnLoop.ts` —— wire payload(L176-182,老 tool_result 全量出上游)
- `agent/src/server/ws.ts` —— 触发点(L267 `lastCtx` · L270 单一 gate · L285 catch 内兜底)· 常量 `WINDOW_TRIGGER_PCT=75` / `WINDOW_KEEP_TURNS=25`
- `docs/research/context-compaction-2026-07/DESIGN.md` —— 原设计(L35 两条触发线,仅实现一条)
