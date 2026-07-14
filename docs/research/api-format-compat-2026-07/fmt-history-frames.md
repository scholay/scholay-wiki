## summary
## 历史与跨模型切换的协议耦合 · 侦察结论

### 1. 会话历史链路(journal → seed_history → convertFlatToAnthropic)

**耐久真源 = backend MySQL 事件日志(不是 Anthropic 消息,而是「中性 wire 帧」)**:
- `agent_turn_events` 表每行 Payload 直接就是发给浏览器的 frame 字节(backend/internal/agentbridge/journal_model.go:50-58)。EvType 白名单:user_message / content_start / content_delta / thinking / tool_use / tool_result / permission_request / message_complete / error(eventlog.go:30-40)。
- 写侧:user_message 在 BeginTurn 时以 `{"type":"user_message","content":"<纯文本>"}` 落库(turncoord.go:52-53);其余帧在 hub 读循环 broadcast 之后 tee 进日志(hub.go:914-927),映射函数 classifyJournalEv(hub.go:1250-1272,注意 `tool_use_complete` 帧也归入 EvToolUse);message_complete 单独在 hub.go:815 append;content_delta/thinking 由 batcher 合并成一行(eventlog_batcher.go:142/155)。
- 读侧折叠 FoldToMessages(eventlog_store.go:202-311)产出 `agent.SessionMessage`(client.go:696-710,{Type, Content(json.RawMessage)}),形状 = daemon 扁平形(每个 content block 一条 typed message):user→`[{type:"text",text}]`、assistant→`[{type:"text"|"thinking",...}]`(连续同类合并)、tool_use→`[{type:"tool_use",id,name,input}]`、tool_result→`[{type:"tool_result",tool_use_id,content,is_error?}]`。解析同时兜 camelCase(toolUseId/toolName)与 Anthropic 标准名(eventlog_store.go:200-201)。

**seed_history 下发**:hub 建连后 seedHistoryFromJournal(hub.go:454-547)把 FoldToMessages 结果(空则回落归档表 / GetSessionMessages)+ title + appendSystemPrompt + addDirs + skills + disallowedTools 打成 `{"type":"seed_history","messages":[...]}` 帧发给 executor;写失败 3 次重试后 fail-closed 拦首条消息。

**executor 侧 FlatMessage 与转换**:`FlatMessage = {type: "user"|"assistant"|"tool_use"|"tool_result", content: block[]}`(agent/src/server/shadowTurn.ts:15-18)。ws.ts:98-128 收 seed_history,仅 meta.messages 为空时调 convertFlatToAnthropic(shadowTurn.ts:38-53)——**关键设计:只保留 text 块,tool_use/tool_result/thinking 全部丢弃**,连续同角色合并;理由是 Anthropic 的 tool_result 强配对约束下,窗口切割/孤儿块会 400,而 assistant 文本已概括工具结果。因此**跨进程重放进 LLM 的历史永远是纯 text 的 user/assistant 交替**。滑窗 windowMessages(turn/window.ts)也依赖此形状:回合起点 = user 且无 tool_result 块。

### 2. P2 会话中途换模型 与 历史块类型全集

pinned_model 真源在 `agent_sessions.pinned_model`(repository.go:66-69,migration 0063);浏览器 set_runtime_config 帧经 hub 权威闸 handleRuntimeConfigFrame(hub.go:346-450):ValidateUserModel → 先落库再转发 `{"type":"set_runtime_config","modelId","contextWindow"}` 给 executor(hub.go:286/447);建连时 sendSessionModel 下发一次(hub.go:230/264-320)。executor 侧 ws.ts:87-96 存入 ws.data.modelOverride/contextWindow;turnLoop.ts:58 `modelOverride || resolveTier(tier)` 每轮生效 → **换模型即刻作用于同一份 in-memory history**。

**executor 内存 history(Anthropic.MessageParam[])里可能出现的全部块类型**(= 出口翻译器必须覆盖的全集):
1. user·纯文本:`{role:"user", content: string}`(ws.ts:221;预算披露 string 拼接或追加 text 块,turnLoop.ts:83-95)
2. user·工具轮:`content: ToolResultBlockParam[]`,每个 `{type:"tool_result", tool_use_id, content: unknown, is_error}`;content 对 built-in 是 `[{type:"text",text}]`,对 MCP 是**透传上游 res.content**(minicodClient.ts:136,协议上可含非 text 块);全部 tool_result 合并在一条 user 消息(turnLoop.ts:213,SDK 并行调用规则)
3. assistant:`msg.content` **原样入 history**(turnLoop.ts:192)→ text、thinking(含 signature 字段)、tool_use{id,name,input};(Anthropic 协议上还可能有 redacted_thinking,代码未特判、原样保留)
4. seed 回来的历史:只有 text 块(见上)
- **image 块:全链路不存在**。用户消息恒为纯文本 string(ws.ts:165 String(frame.content)),文件走方案 B 推到会话 cwd 让 agent Read;唯一潜在入口是 MCP tool_result 透传。

**若中途切到 OpenAI 格式模型**:同进程活会话的 history 里有 thinking(带 signature)/tool_use/tool_result 三类非 text 块必须翻译(tool_use→assistant.tool_calls、tool_result→role:"tool" 逐 id 拆条、thinking→丢弃或 reasoning_content、tool_result 的块数组 content→字符串化);而**重连/重启后的会话因 seed 只有 text,天然协议中立**。反向陷阱:thinking.signature 是 provider 私有的,即使在两个「Anthropic 兼容」上游之间切换,回放对方的 thinking 块也可能被验签拒绝。

### 3. peerreview serverside 与 prism planner 的消息形状

- ServerSideChatStreaming(ws_serverside.go:64-300):backend 扮演 WS 客户端直连 executor(**绕过 hub → 这些轮不进 journal**,BeginTurn 仅 hub.go:1089 一处调用);发 `set_runtime_config{modelId}`(:155-164,peerreview 按轮切 meta/letter→快模型、review→主模型;prism planner 用 PurposePrismPlanner 绑定)再发 `user_message{content:纯文本 prompt}`(:166-173);**只收集 text 的 content_delta,丢 thinking,丢工具块正文**(:217-247),content_start(tool_use)/status 仅translate成中文进度提示。返回值 = 拼接文本 + usage。**但轮内部会带工具轮**:executor 跑完整 turnLoop(Read 读稿、MCP 检索),该会话 executor 内存 history 含全部 tool 块;多次调用(meta→review→letter)复用同一 sessionID 累积多轮。prism planner(prism/planner.go:92-139)= throwaway 会话单轮:CreateSession→ServerSideChatStreaming(纯文本 prompt→纯文本 reply→parse)→删会话。
- ExtractMemoryServerSide(ws_serverside.go:386-448):新开 WS 发 extract_memory 帧,读 memory_update 返回;transcript 来自 journal fold→归档→GetSessionMessages 三级回落(bridge.go:358-377),最终 flattenTranscript 只取 user/assistant 文本(bridge.go:410-419)。

### 4. 帧协议发射点清单(前端渲染真源)

见 keyFacts 完整 file:line 列表。帧协议本身是**中性的**(非 Anthropic SSE):Anthropic 流事件→中性帧的唯一映射点在 turnLoop.ts:154-176 的 stream 事件循环(content_block_start/delta/stop → content_start/content_delta/thinking/tool_use_complete)。OpenAI 流式若要接入,只需在此循环(或平行的 OpenAI 分支)把 chat.completions chunk(delta.content/delta.reasoning_content/delta.tool_calls[].function.arguments/finish_reason)映射到同一组帧,前端/journal/hub 全部零改动。

### 5. extract_memory / title(fastCompletion)

completion.ts:9-36:`client.messages.create`(非流式、无工具、单条 user)。对返回结构的假设:① `msg.content` 是块数组、filter type==="text" 拼接(:23-26,天然容忍 DeepSeek 先吐 thinking 块);② `msg.usage` 有 input_tokens/output_tokens/cache_read_input_tokens/cache_creation_input_tokens(:27-34)。title.ts:11-27 纯包装 fastCompletion。模型取 resolveTier("haiku")||main —— **不感知 per-session pinned_model**,跟随全局活跃 provider 槽位。OpenAI 化需给它一个 completions 分支(choices[0].message.content + usage.prompt/completion_tokens 映射)。

### 6. 判断:「内部真源保持 Anthropic 格式 + 出口翻译」是否覆盖所有路径

**基本成立,且现状比想象更有利**:耐久真源(journal 帧)与前端协议(中性帧)都**已经不是 Anthropic 格式**,真正 Anthropic-shaped 的状态只有两处:① executor 进程内 meta.messages(Anthropic.MessageParam[],ws.ts/sessions.ts);② shadowTurn 的 `messages` 直喂路径(shadowTurn.ts:22)。出口(实际调上游)共 3 个咽喉:turnLoop.ts:148(messages.stream)、completion.ts:17(messages.create)、以及工具定义 buildTools(tools/toAnthropicTools.ts)。provider 配置已有 `apiFormat` 字段贯通(agent/src/config/providerStore.ts:23、server/http.ts:116/135、backend/internal/agent/client.go:71/83/94),目前恒为 "anthropic" 协议不变量——把它升级为 per-model/per-provider 分支开关即可。**未覆盖/需注意的路径**:seed 丢工具块使跨重启历史协议中立(利好);但同进程中途切协议时 in-memory history 的 thinking(signature)/tool_use/tool_result 需完整出口翻译;normUsage/fastCompletion 的 usage 字段名假设;window.ts 的 isTurnStart 假设内部形状不变(保持 Anthropic 内部真源则无影响);MCP tool_result content 透传的非 text 块需字符串化兜底。

## designImplications
- 「内部真源 Anthropic + 出口翻译」总体成立且成本低于预期:journal、前端帧协议、seed_history 三层都已是中性/纯文本格式,Anthropic-shaped 状态只活在 executor 进程内存(meta.messages)与 shadowTurn 直喂路径;per-model api_format 只需在 3 个咽喉(turnLoop.ts:148 流式、completion.ts:17 单发、buildTools 工具定义)加 OpenAI 分支,帧发射逻辑与 Go/前端零改动
- OpenAI 出口翻译器必须覆盖的 in-memory 块全集(中途切模型时同一 history 直接换协议喂):assistant.tool_use→tool_calls[]、user 的 tool_result 块数组→逐 tool_call_id 拆成多条 role:tool 消息(注意本系统把并行 tool_result 合并在一条 user 消息里,turnLoop.ts:213)、thinking→丢弃或映射 reasoning_content(不能原样带过去)、tool_result.content 可能是 MCP 透传的块数组→需字符串化;system 参数→messages[0] role:system;不需要处理 image(全链路不产生)
- 反向陷阱:thinking 块带 provider 私有 signature(turnLoop.ts:192 原样入 history),即使在两个 Anthropic 兼容上游之间切换,回放对方 thinking 也可能验签 400 —— 建议出口统一策略:跨 provider/协议切换后对历史 assistant 消息剥 thinking 块(与 seed 丢块的既有哲学一致)
- 跨重启/重连场景天然安全:convertFlatToAnthropic 只留 text(shadowTurn.ts:43),seed 回来的历史纯文本、协议中立 —— 「切模型后重开会话/重连」不需要任何历史翻译;风险窗口仅限「同进程活会话中途切协议」。最省事的兜底方案:检测到 api_format 变更时对 meta.messages 跑一次与 convertFlatToAnthropic 同款的 text-only 折叠(损失=丢近几轮工具细节,与重连行为一致)
- usage 归一需加 OpenAI 分支:normUsage(turnLoop.ts:230)与 fastCompletion(completion.ts:27)假设 Anthropic 字段名;OpenAI 是 prompt_tokens/completion_tokens(+prompt_tokens_details.cached_tokens),且 prompt_tokens 含缓存部分(backend/internal/ai/service.go:81 已有语义对齐经验可复用);cache_creation 概念缺失留 0;计费链(accrueTurnUsage 水位)只认中性 CallUsage,出口归一即可
- OpenAI 流式→中性帧映射的对位关系(在 turnLoop 事件循环平行实现):delta.content→content_delta、delta.reasoning_content→thinking、delta.tool_calls[].function.arguments 增量→自建 assembler(现有 ToolUseAssembler 按 index 组装 partial_json,OpenAI 按 tool_calls index 组装 arguments,结构同构)、首个 tool_call 出现→content_start(tool_use)+结束时 tool_use_complete、finish_reason:tool_calls→继续工具轮/stop→message_complete;注意 OpenAI 无 content_block_stop 事件,tool_use_complete 需在 finish 或下一块开始时发
- api_format 应挂在 provider 维度而非 model 维度更贴合现状:providerStore 每 provider 一个 apiFormat + anthropic/client.ts 单例缓存按 provider id 失效;但 P2 pinned_model 允许 per-session 模型且 set_runtime_config 只带 modelId(hub.go:286)——若同一 executor 需同时服务两种协议的模型,set_runtime_config/PushConfig 需把 model→provider(→api_format)的解析下放或随帧带 apiFormat,并把 client 工厂从「唯一活跃 provider」改为「按 model 查 provider」;这是改造中最大的结构性动作
- fastCompletion 不感知 pinned_model(恒走全局 haiku 槽位):若全局槽位与会话 pinned 模型分属不同协议,title/memory_extract 与主对话会走不同出口 —— 无正确性问题但要求两条出口都实现;也可顺手把 title/memory 绑定到 modelcatalog purpose(与 prism planner 同款 Resolve 机制)
- peerreview serverside 与 prism planner 因「纯文本进出+每轮重发 set_runtime_config{modelId}」是协议切换最安全的路径;但其会话不进 journal、历史仅存 executor 内存,executor 重启即丢(现状即如此,非本次改造引入);若日后要给 serverside 补 seed,注意它同样只需 text-only
- window.ts(isTurnStart 依赖 Anthropic tool_result 块形状)与 sessionFlatMessages(sessions.ts:157-185)都假设内部真源恒为 Anthropic 形 —— 坚持「内部 Anthropic + 出口翻译」原则则两者零改动;反之若把内部真源改成 OpenAI 形(不推荐),滑窗、fold、seed、shadow 对账全线要动

## keyFacts
- journal 真源不是 Anthropic 消息而是中性 wire 帧:agent_turn_events.Payload=浏览器帧字节(journal_model.go:50-58);EvType 白名单 user_message/content_start/content_delta/thinking/tool_use/tool_result/permission_request/message_complete/error(eventlog.go:30-40);tee 点 hub.go:815(message_complete)与 hub.go:914-927+classifyJournalEv hub.go:1250-1272(tool_use_complete 帧也归 EvToolUse)
- FoldToMessages(eventlog_store.go:202-311)产出扁平 SessionMessage{Type,Content}:user→[{type:text}]、assistant→[{type:text|thinking}](连续合并)、tool_use→[{type:tool_use,id,name,input}]、tool_result→[{type:tool_result,tool_use_id,content,is_error}];字段名双兜 camelCase 与 Anthropic 标准名(:200-201)
- seed_history 组帧点 hub.go:454-547(seedHistoryFromJournal):messages=journal fold(回落归档/GetSessionMessages)+title+appendSystemPrompt+addDirs+skills+disallowedTools;写失败 fail-closed(hub.go:529-531)
- FlatMessage={type:user|assistant|tool_use|tool_result, content:block[]}(shadowTurn.ts:15-18);convertFlatToAnthropic(shadowTurn.ts:38-53)**只留 text 块、丢 tool_use/tool_result/thinking、同角色合并** → 跨进程重放的历史恒为纯文本 user/assistant 交替;window.ts:5-21 滑窗依赖此形状(回合起点=user 无 tool_result 块)
- executor 内存 history 块类型全集:user=string 纯文本(ws.ts:221)或 tool_result 块数组(turnLoop.ts:213,全部合并一条 user);assistant=msg.content 原样(turnLoop.ts:192)含 text/thinking(带 signature)/tool_use;**image 块全链路不存在**(用户消息恒 String(frame.content) ws.ts:165,文件走 cwd 方案 B);唯一非 text 潜在入口=MCP tool_result content 透传(minicodClient.ts:136)
- P2 换模型链路:agent_sessions.pinned_model(repository.go:66-69)→hub 权威闸 handleRuntimeConfigFrame(hub.go:346-450,ValidateUserModel+先落库)→set_runtime_config{modelId,contextWindow}(hub.go:286/447)→executor ws.data.modelOverride(ws.ts:87-96)→turnLoop.ts:58 每轮生效;同一 in-memory history 直接喂新模型
- 帧发射点清单——turnLoop.ts: 60 error(config)/106 message_complete{usage,calls}/113 error(busy)/125 error(budget)/146 status(thinking)/158 content_start(text)/161 content_start(tool_use,toolName,toolUseId)/163 content_start(thinking)/167 content_delta{text}/168 thinking{text}/173 tool_use_complete{toolName,toolUseId,input}/184 error(upstream)/216 finally 兜底终帧;runTools.ts:80 tool_result{toolUseId,content,isError}/89 errResult;ws.ts:60 connected/73 pong/127 history_seeded/143-144 token_usage(memory_extract)+memory_update/162 error(busy)/195 sink 帧直通/209-215 permission_request/259 error(internal)/272 token_usage(title_gen)/275 session_title_updated
- Anthropic 流→中性帧唯一映射点=turnLoop.ts:154-176(content_block_start/delta/stop 事件循环);上游调用咽喉仅 3 个:turnLoop.ts:148 messages.stream、completion.ts:17 messages.create、buildTools(tools/toAnthropicTools.ts)
- peerreview serverside(ws_serverside.go:64-300)绕过 hub 直连 executor WS → **不进 journal**(BeginTurn 仅 hub.go:1089 一处);发纯文本 user_message,只收 text delta(丢 thinking :237-238),但轮内 executor 跑完整 turnLoop 带工具轮,同 sessionID 多阶段(meta/review/letter)累积内存 history;prism planner(planner.go:92-139)=throwaway 会话单轮纯文本进出
- fastCompletion(completion.ts:9-36)=messages.create 非流式单发;假设 msg.content 为块数组(filter text)+ usage 用 Anthropic 字段名(cache_read_input_tokens 等);模型走 resolveTier(haiku)||main,不感知 pinned_model;title.ts:11-27 是其纯包装
- apiFormat 字段已全链路预留但恒为 anthropic:providerStore.ts:23(注释「协议不变量」)、server/http.ts:116/135、backend client.go:71/83/94、conformance.ts:28;anthropic/client.ts:21 单一 SDK 工厂(baseURL+authToken)
- usage 归一在 normUsage(turnLoop.ts:230-239)与 fastCompletion(completion.ts:27-34):假设 Anthropic 字段名;Go 侧 ChatUsage(ws_serverside.go:365-370)吃的已是中性名 cache_read_tokens/cache_creation_tokens
- 记忆抽取 transcript 三级回落:journal fold→归档→GetSessionMessages(bridge.go:358-377),最终 flattenTranscript 只取 user/assistant 文本(bridge.go:410-419);extract_memory 帧={type,system,user} 纯文本(bridge.go:400-406)
