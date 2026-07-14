## summary
## Agent 容器对 Anthropic Messages 协议的耦合面全景

### 0. 总体结论
耦合面**高度集中且已半解耦**:全容器只有 **2 个 LLM API 调用点**(agent/src/turn/turnLoop.ts:148 的 `client.messages.stream(...)` 与 agent/src/turn/completion.ts:17 的 `client.messages.create(...)`),对前端/后端的 wire frame 已是中性协议(content_start/content_delta/thinking/tool_use_complete/tool_result/message_complete),usage 也已归一化为中性 4 字段(CallUsage)。真正贯穿全身的耦合是**类型层**:`Anthropic.MessageParam[]` 作为会话内 history 的内存真源类型,贯穿 turnLoop/sessions/ws/window/shadowTurn 五个文件。

### 1. SDK 用法与 client 构造(anthropic/client.ts)
- 依赖 `@anthropic-ai/sdk ^0.80.0`(agent/package.json:12),import 于 agent/src/anthropic/client.ts:10。
- client 构造:client.ts:21 `new Anthropic({ baseURL: p.baseUrl, authToken: p.apiKey, apiKey: p.apiKey })` —— authToken → `Authorization: Bearer`,匹配 backend PushConfig 的 `authStrategy:"auth_token"`(backend/internal/agent/client.go:961/974 硬编码 `APIFormat:"anthropic"` + `AuthStrategy:"auth_token"`)。单例缓存按 (id, baseUrl, token) 键(client.ts:13,18),provider 变更时 `invalidateClient()`(client.ts:26;由 http.ts 的 /api/providers 路由触发)。
- provider 配置:agent/src/config/providerStore.ts:23 已有 `apiFormat: string // "anthropic"` 字段,但**全代码库无任何分支读它**——它是被存储/透传的常量(http.ts:116 默认 "anthropic";conformance.ts:28 写死 "anthropic")。即「插座已留、电器未接」。
- 调用点全集(grep 证实,仅 2 处):turnLoop.ts:148(流式,主 loop;被 ws.ts handleUserMessage、server/shadowTurn.ts:108(POST /api/turn shadow 对账)、harness/conformance.ts:79 三个入口共用)+ completion.ts:17(非流式单发;被 turn/title.ts 标题生成与 ws.ts:140 `extract_memory` 记忆抽取共用)。**无 beta/tool_runner/batches/files API 使用**。

### 2. turnLoop.ts 的协议假设
**流式事件消费**(turnLoop.ts:154-176,经 SDK MessageStream):
- `content_block_start`(:155):按 `content_block.type` 分支 text(:157)/ tool_use(:159,取 cb.id、cb.name)/ thinking(:162);
- `content_block_delta`(:165):`text_delta.text`(:167)、`thinking_delta.thinking`(:168)、`input_json_delta.partial_json`(:169,喂给 ToolUseAssembler 按 content_block **index** 累积 —— assembleToolUse.ts:17);
- `content_block_stop`(:170):按 index 关闭 tool_use 组装;
- 不直接消费 message_start/message_delta/message_stop,最终消息靠 `stream.finalMessage()`(:180)拿 SDK 累积好的 `Anthropic.Message`。

**工具循环**:
- 循环条件 `msg.stop_reason !== "tool_use"`(:194);`max_tokens` 截断告警(:195-201);abort 用 SDK 的 `{signal}` 请求选项(:150)。
- 回填:`messages.push({role:"assistant", content: msg.content})` **整块 content 数组含 thinking 块**(:191-192,注释明言"必须 append 全 content 保留 tool_use 块");所有 tool_result 塞进**一条** user 消息(:213,注释:"拆开会把模型训离 parallel call"—— Anthropic 约定)。
- tool_result 块形:runTools.ts:81/:90 `{type:"tool_result", tool_use_id, content, is_error}`,content 是内容块数组(registry.ts ToolResult.content = `[{type:"text",text}]`)。

**usage 读取**(turnLoop.ts:230-239 normUsage):从 `Anthropic.Usage` 读 4 类字段 `input_tokens / output_tokens / cache_read_input_tokens / cache_creation_input_tokens`,归一化为中性 `CallUsage{input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens, model}`(:222-228,即 Go AgentUsage 的 json 形)。completion.ts:27-34 同样读这 4 字段。

**预算/闸门与协议的耦合**:
- `MAX_TOKENS=64000`(:20)走顶层 `max_tokens` 参数,且注释明言依赖「流式下 DeepSeek 接受大 max_tokens」;
- `MAX_TURN_TOKENS`(:26,默认 5M)单轮硬闸(:117-129)与有界透支 wind-down(:132-145)都按 **raw 口径 = 4 类 usage 全 1x 累加** 计算 —— 对协议的依赖仅在「每次 LLM call 都能拿到 per-call usage」;
- wind-down 机制本身协议无关:去掉全部 tools + 换 system 收尾指令(:139-140),模型只能出文本自然 end_turn;
- budgetDisclosure(:32-38)刻意 append 到 user 消息尾而非 system(:83-94),理由是**保上游隐式前缀缓存**(Anthropic 式 prompt cache 假设,但 OpenAI 也做隐式前缀缓存,该设计可平移)。
- system 是顶层字符串参数(:72-73,:81,:149):dateLine(天粒度,clock.ts,注释"prompt cache 每天最多 miss 一次")+ langLine 静态串(:46-48)+ appendSystemPrompt + skillCtx。**全库无任何 `cache_control` 显式用法**(grep 证实),纯靠上游隐式缓存。

### 3. 会话消息真源格式
- **内存 history 元素 = `Anthropic.MessageParam`**:sessions.ts:69 `SessionMeta.messages: Anthropic.MessageParam[]`;ws.ts:221 user 消息以 `{role:"user", content: string}` 入列;runTurn 返回后 history 含 assistant(text+thinking+tool_use 块)与 user(tool_result 块数组)。耐久真源在 backend journal(中性扁平形),executor 跨重启无状态。
- **seed_history → convertFlatToAnthropic**(shadowTurn.ts:38-53,ws.ts:103 调用):扁平 typed message → Anthropic 形,**只保留 text 块、丢 tool_use/tool_result/thinking**,连续同角色合并。注释(:34-37)明确引用 Anthropic 强约束「每个 tool_result 必须紧跟含对应 tool_use 的 assistant 消息」作为丢块理由。这是「中性 journal 形 → Anthropic 形」的唯一桥。
- **反向桥 sessionFlatMessages**(sessions.ts:159-185):Anthropic 形 → 扁平形(供 GET /api/sessions/:id/messages,http.ts:210-217,主要消费者=记忆抽取):假设 content 是块数组、user 消息可混装 text 与 tool_result 块(:169-176)、assistant 消息按块拆条(:178-182)。
- **window.ts 滑窗**(:14-21 isTurnStart):回合起点判定 = 「role===user 且 content 不含 tool_result 块」——**直接编码了 Anthropic『tool_result 装在 user 角色消息里』的约定**;文件头注释(:5-7)引用两条 Anthropic 结构铁律(首条必须 user;tool_result 紧跟 tool_use)。ws.ts:23-25/:226-238 触发滑窗的信号用 lastUsage(input+output)对比 contextWindow(默认 128000,可由 set_runtime_config{contextWindow} per-model 下发,ws.ts:93-95)。
- **shadowTurn HTTP 契约**:POST /api/turn 直接接受 `messages?: Anthropic.MessageParam[]`(shadowTurn.ts:22)——即 **backend↔agent 的 HTTP wire 上也存在 Anthropic 形 history**(shadow 对账/未来 cutover 入口)。

### 4. 工具定义 / 附件 / system
- 工具 wire 形:types.ts:45-49 `AnthropicTool{name, description, input_schema:{type:"object",...}}`(Anthropic 顶层裸形,非 OpenAI 的 function 包装);buildTools(toAnthropicTools.ts:9-26)合并 MCP + builtin 后 as-cast 成 `Anthropic.ToolUnion[]`(turnLoop.ts:149)。
- MCP 注入:mcpTools.ts:15-23,工具名前缀 `mcp__minicod__`(前端按它渲卡片),:21 合并兜底 `type:"object"`(注释:Anthropic Tool.input_schema 要求);MCP 调用结果 `r.content`(MCP 内容块数组,恰好与 Anthropic tool_result content 块数组同构)原样作为 tool_result content 透传(runTools.ts:63-64,:81)。
- **图片/附件块:LLM 路径上完全不存在**。grep 证实 image/base64 只出现在 workspace 文件预览(workspace.ts)与 math/mermaid 渲染,从不进 messages;文件上传走「物化到 cwd + 文件工具读」路线。多模态块不构成耦合面。
- system prompt:纯字符串顶层参数,无内容块形式、无 cache_control 断点。

### 5. completion.ts(单发)与 shadowTurn
- fastCompletion(completion.ts:9-36):`client.messages.create({model, max_tokens, system, messages:[{role:"user",content}]})`,取文本用 `msg.content` 块数组 filter type==="text" 拼接(:23-26)—— 假设响应 content 是块数组(OpenAI 是 choices[0].message.content 字符串);usage 归一化同 4 字段(:27-34)。tier 解析 haiku→main 回落(:14)。
- title.ts:18 注释记录了 provider 行为差异:「DeepSeek 会先产 thinking 吃掉 max_tokens 预算」→ 给 1024。
- shadowTurn(runShadowTurn):构造 TurnInput 后复用 runTurn,自身无新协议假设,但输入契约含 Anthropic.MessageParam[](见 §3)。

### 6. 格式层 vs 语义层分类
**格式层(可机械翻译到 OpenAI Chat Completions)**:client 构造(Bearer 认证两家一致)、`system` 顶层参数→role:"system" 首消息、`max_tokens`→`max_completion_tokens`、工具定义裸形→`{type:"function",function:{...,parameters}}`、`stop_reason`(tool_use/max_tokens/end_turn)→`finish_reason`(tool_calls/length/stop)、流式 text_delta→choices[].delta.content、input_json_delta(按 block index)→tool_calls[].function.arguments delta(按 tool_call index)、assistant 回填(content 块数组→content 字符串+tool_calls 数组)、tool_result 单 user 消息→逐 tool_call_id 的 role:"tool" 消息、abort signal、input_tokens/output_tokens 计费字段(OpenAI prompt_tokens/completion_tokens;流式需 `stream_options:{include_usage:true}`)。
**语义层(OpenAI CC 无对应物,需策略决策)**:① thinking 块——流式 thinking_delta 消费(turnLoop.ts:162,:168)、thinking 帧下发前端、thinking 块回填 history(:192);OpenAI CC 标准无 reasoning 块(DeepSeek 原生 OpenAI 格式有非标 `reasoning_content`);② `tool_result.is_error`(runTools.ts:81)——OpenAI 无此语义位,只能编码进 tool 消息文本;③ `cache_creation_input_tokens`(turnLoop.ts:236)——OpenAI 只有 prompt_tokens_details.cached_tokens(≈cache_read),cache_creation 恒 0,影响 raw 口径预算/计费的等价性;④ tool_result content 块数组(含 MCP 富内容)——OpenAI tool 消息 content 为字符串,需扁平化;⑤ 「所有 tool_result 并入一条 user 消息保 parallel call 训练分布」的约定(:213)在 OpenAI 中对应「一条 assistant.tool_calls + N 条 tool 消息」,结构不同;⑥ window.ts isTurnStart 对「tool_result 在 user 消息里」的结构假设;⑦ 隐式 prompt-prefix-cache 假设(dateLine/langLine/disclosure 的摆位设计)——OpenAI 也有 automatic prefix caching,大体平移但缓存字段观测不同。cache_control 显式断点全库未用,不构成负担。

## designImplications
- 改造面天然收口:只需把 2 个调用点(turnLoop.ts:148、completion.ts:17)抽成 LLMDriver 接口(streamTurn → 中性帧序列 + 归一化 Message;complete → {text,usage}),按 provider/model 的 api_format 选 AnthropicDriver 或 OpenAIDriver。EventSink 帧协议与 CallUsage 已中性,driver 之上的 wind-down/闸门/滑窗/计费代码可零改动——前提是 OpenAI driver 保证流式 per-call usage(必须带 stream_options:{include_usage:true})且 cache_creation 恒 0
- 最大结构性难点是 history 真源类型:Anthropic.MessageParam[] 贯穿 sessions/ws/window/shadowTurn 且出现在 HTTP wire(POST /api/turn)。两条路线:A(推荐,改动小)保持 Anthropic 形为内部 IR(它是 OpenAI 的语义超集),OpenAI driver 在边界做单向翻译(assistant 块数组→content+tool_calls;user 内 tool_result 块→N 条 role:tool 消息;thinking 块丢弃);B(彻底)定义自有中性 message IR 替换全部 Anthropic 类型。路线 A 下 window.ts/sessions.ts/seed 桥全部不用动
- per-model(而非 per-provider)api_format 意味着配置模型要动三层:agent providerStore(当前 4 个 tier 槽位共享一个 baseUrl/apiFormat/apiKey → 需变成 per-slot {modelId, baseUrl?, apiKey?, apiFormat});backend agent_config 表 + PushConfig 契约(client.go:961/974 硬编码 anthropic);anthropic/client.ts 的 client 缓存键需加 format 维度。resolveTier(models.ts:9)返回值需从 string 升级为 {model, format, ...} 描述符
- 同一会话中途切协议(set_runtime_config{modelId} 已支持按轮切模型,peerreview 在用)是最危险场景:meta.messages 里已有 Anthropic thinking/tool_use/tool_result 块。翻译器必须完整处理,或在协议切换时机做一次 text-only 折叠(可直接复用 convertFlatToAnthropic 的丢块策略——它已证明文本-only 折叠不损上下文连续性)。若 peerreview 的按轮切模型允许跨 format,这里必须有明确策略,否则应约束『同会话内 format 不可变』
- 语义缺口的落地建议:① thinking——OpenAI driver 对标准上游不发 thinking 帧(前端已兼容无 thinking);对 DeepSeek 原生格式可选映射 reasoning_content→thinking 帧,但 thinking 绝不回填 history(与 seed 桥丢 thinking 的既有决策一致);② is_error——编码进 tool 消息文本前缀(如 [ERROR] ...),模型可读;③ tool_result 富内容块数组——JSON.stringify 或 text 块拼接降级,注意 claw 论文卡片等前端渲染消费的是中性 tool_result 帧(不受影响,只影响喂给模型的形);④ usage——cache_read_tokens←prompt_tokens_details.cached_tokens,cache_creation_tokens=0,并核对 Go 计费链(llmusage/vip)对 4 字段口径的假设(raw 全 1x 时 OpenAI 的 prompt_tokens 已含 cached 部分,注意别与 Anthropic 的『input 不含 cache 命中』口径双计——Anthropic input_tokens 是未命中残量,OpenAI prompt_tokens 是全量,MAX_TURN_TOKENS/预算的 raw 累加两协议下含义不同,需要在 normUsage 处统一口径)
- 流式组装差异:OpenAI tool_calls delta 按 choices[].delta.tool_calls[].index 累积 arguments,恰与 ToolUseAssembler 的 index 累积模式同构——OpenAI driver 可复用 assembler 骨架,只换事件解析;但 OpenAI 没有 content_block_stop,tool_use_complete 帧需在 finish_reason 到达或下一 tool_call index 开始时触发
- 格式层的机械映射清单(直接写进 OpenAI driver):system 串→messages[0] role:system;max_tokens→max_completion_tokens;工具裸形→{type:function,function:{name,description,parameters}}(注意 OpenAI 工具名正则 ^[a-zA-Z0-9_-]{1,64}$,mcp__minicod__* 合规);stop_reason tool_use/max_tokens/end_turn ↔ finish_reason tool_calls/length/stop;abort signal 两家 SDK 均支持;Bearer 认证一致(authStrategy 无需改)
- 缓存与成本:全库无 cache_control,是好消息——双协议下无显式缓存 API 要抹平;既有的缓存摆位纪律(dateLine 天粒度、langLine 静态、disclosure 进 user 消息、wind-down 只翻转一次)对 OpenAI 的 automatic prompt caching 同样有效,可原样保留;但 cache 命中观测字段不同,admin 侧若有 cache 命中率展示需按 format 分支
- shadow 对账与一致性 harness(conformance.ts、POST /api/turn)当前以 Anthropic 形为契约;新增 OpenAI driver 后建议为其复制一条 conformance 探针(项目既有 GREEN 探针文化),验证:流式 tool_calls 组装、并行工具、usage 回传、大 max_tokens 流式接受度——这些正是当年对 DeepSeek anthropic-兼容端点逐一验证过的点
- 工期估计视角:格式层翻译(driver + 消息/工具/流式映射)是主体工作但机械;真正需要设计决策的是 4 件事——history IR 路线(A/B)、thinking 策略、usage 口径统一、同会话跨 format 切换策略。若接受路线 A + 会话内 format 不可变 + thinking 不透传,改造可收敛为『新增一个 driver 文件 + resolveTier 返回描述符 + PushConfig/providerStore per-slot 化』,turnLoop 主体逻辑(预算/滑窗/权限/帧)不动

## keyFacts
- LLM API 调用点全集只有 2 处:turnLoop.ts:148 client.messages.stream({model,max_tokens,system,messages,tools}) 与 completion.ts:17 client.messages.create(...);后者服务标题生成(title.ts)与记忆抽取(ws.ts:140 extract_memory 帧)
- client 构造:anthropic/client.ts:21 new Anthropic({baseURL, authToken, apiKey}),Bearer 认证;SDK 版本 @anthropic-ai/sdk ^0.80.0(package.json:12);缓存单例按 (id,baseUrl,token) 键,invalidateClient() 换 provider
- providerStore.ts:23 已有 apiFormat 字段但纯属存储常量,零分支消费;backend client.go:961/974 PushConfig 硬编码 APIFormat:"anthropic";agent http.ts:116 默认 "anthropic" —— 双协议的配置插座已在,协议开关逻辑完全缺失
- 流式事件消费(turnLoop.ts:154-176):content_block_start(text/tool_use/thinking 三型)、content_block_delta(text_delta/thinking_delta/input_json_delta)、content_block_stop;input_json_delta 按 content_block index 由 ToolUseAssembler 累积(assembleToolUse.ts);终态靠 stream.finalMessage() 而非手工消费 message_delta/stop
- 工具循环:stop_reason!=="tool_use" 退出(turnLoop.ts:194);assistant 全 content(含 thinking 块)整体回填 history(:192);所有 tool_result 装进一条 user 消息(:213,Anthropic parallel-call 约定);tool_result 形 {type:"tool_result",tool_use_id,content,is_error}(runTools.ts:81,90)
- usage 4 字段读取并归一化:normUsage(turnLoop.ts:230-239)读 input_tokens/output_tokens/cache_read_input_tokens/cache_creation_input_tokens → 中性 CallUsage;MAX_TURN_TOKENS 硬闸(:117-129)与有界透支 wind-down(:132-145)均按 4 类 raw 全 1x 口径,只依赖 per-call usage 可得,不依赖 Anthropic 字段名
- 预算 wind-down 机制协议无关:越过 hardRemaining 后 activeTools=[] + system 换收尾指令(turnLoop.ts:139-140),让模型纯文本 end_turn;budgetDisclosure 刻意 append 到 user 消息尾而非 system 以保上游隐式前缀缓存(:30-31,:80-94)
- 会话内存真源类型 = Anthropic.MessageParam[](sessions.ts:69),贯穿 ws.ts/window.ts/shadowTurn.ts;耐久真源是 backend journal 的中性扁平形;POST /api/turn(shadowTurn.ts:22)在 HTTP wire 上也接受 Anthropic 形 history
- seed_history 桥 convertFlatToAnthropic(shadowTurn.ts:38-53):只留 text 块、丢 tool_use/tool_result/thinking、连续同角色合并——理由是 Anthropic 的 tool_use/tool_result 配对强约束;反向桥 sessionFlatMessages(sessions.ts:159-185)供记忆抽取,假设 content 块数组结构
- window.ts:14-21 isTurnStart 直接编码 Anthropic 结构约定:回合起点 = user 消息且不含 tool_result 块(因 Anthropic 把 tool_result 放 user 角色);文件头注释(:5-7)引用『首条必须 user、tool_result 紧跟 tool_use』两条铁律;滑窗触发用 lastUsage 对比 contextWindow(ws.ts:226-238,per-model contextWindow 可经 set_runtime_config 下发)
- 工具定义是 Anthropic 裸形 {name,description,input_schema:{type:"object"}}(types.ts:45-49);MCP 工具 mcp__minicod__ 前缀 + 兜底注入 type:"object"(mcpTools.ts:21);MCP 返回的内容块数组直接透传为 tool_result content(与 Anthropic 同构,对 OpenAI 需扁平化成字符串)
- 全库零 cache_control 显式用法、零 image/document 多模态块进 messages(grep 证实;图片只在 workspace 预览与公式渲染)、零 beta 特性;prompt 缓存全靠上游隐式前缀缓存,缓存友好设计(dateLine 天粒度/langLine 静态/disclosure 进 user 消息)是摆位纪律而非 API 特性
- completion.ts 单发假设响应 content 是块数组(filter type==="text" 拼接,:23-26);对 OpenAI 是 choices[0].message.content 字符串——需在 driver 层抹平
- 语义层硬缺口清单:thinking 块(流式消费+前端 thinking 帧+history 回填,OpenAI CC 标准无;DeepSeek OpenAI 格式有非标 reasoning_content)、tool_result.is_error、cache_creation_input_tokens(OpenAI 只有 cached_tokens≈cache_read)、tool_result 富内容块数组、并行工具结果的消息结构(一条 user vs N 条 role:tool)
- 中性化已完成的部分(改造时不用动):对前端/Go hub 的 wire frame(content_start/content_delta/thinking/tool_use_complete/tool_result/message_complete/error/token_usage)、CallUsage 中性 4 字段、EventSink/TurnInput 契约(除 messages 类型)、permission/abort/滑窗/预算/标题/记忆抽取全部在中性层之上
