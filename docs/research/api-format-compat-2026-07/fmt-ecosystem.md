## summary
## 调研结论:业界「双协议/多协议 LLM 接入」方案对比(面向 cc-haha 执行器选型)

### 0. 本地现状(grounding)
执行器对 Anthropic SDK 的绑定是「深但收口良好」:
- SDK 入口单点:`agent/src/anthropic/client.ts:21` — `new Anthropic({ baseURL: p.baseUrl, authToken: p.apiKey, apiKey: p.apiKey })`,注释明言 "provider-agnostic by construction: base_url 指向任何 Anthropic 兼容端点"。依赖 `@anthropic-ai/sdk ^0.80.0`(agent/package.json)。
- 内核消费 Anthropic 流事件语义:`agent/src/turn/turnLoop.ts:148` 用 `client.messages.stream()`,逐事件处理 `content_block_start/delta/stop`、`text_delta`、`thinking_delta`、`input_json_delta`(ToolUseAssembler),`stream.finalMessage()` 收尾;`turnLoop.ts:192` 把**全量 msg.content(含 thinking 块及 signature)push 回历史**;`turnLoop.ts:221` normUsage 把 Anthropic usage 归一成中性形(cache_read_input_tokens→cache_read_tokens)喂给 Go 侧计费。
- 窗口/回放建立在 Anthropic 消息结构不变量上:`agent/src/turn/window.ts`(首条必 user、tool_result 紧跟 tool_use 的配对切割)。
- api_format 配置链**已有雏形但恒为常量**:`agent/src/config/providerStore.ts:23` 有 `apiFormat: string // "anthropic"` 字段,`agent/src/server/http.ts:116` 接收该字段;backend 推送端 `backend/internal/agent/client.go:961,974` 硬编码 `APIFormat: "anthropic"`。即「per-model api_format」改造的管道一半已存在。

### 1. 路线一:外置网关(入站 Anthropic → 出站 OpenAI 上游)

**A. LiteLLM proxy** — 成熟度最高的「把 OpenAI 模型伪装成 Anthropic /v1/messages」方案。官方 Unified `/v1/messages` 端点声明支持把 Anthropic 格式请求路由到所有 provider(openai/azure/gemini/deepseek…),Streaming/Cost-tracking/Fallback/负载均衡均标 ✅,thinking 参数(budget_tokens/summary)向下游转发,并有官方教程 "Use Claude Code with Non-Anthropic Models" 与逐参数的 `v1/messages → /responses Parameter Mapping` 文档(OpenAI 模型内部走 Responses API)(https://docs.litellm.ai/docs/anthropic_unified/ 、https://docs.litellm.ai/docs/tutorials/claude_non_anthropic_models 、https://docs.litellm.ai/docs/anthropic_unified/messages_to_responses_mapping)。部署成本:独立 Python 容器 + config.yaml,model_list 天然支持 per-model 路由(与「后台按模型配格式」贴合,但配置真源会分裂到网关)。弱点:cache_control 跨 provider 保真文档未明示;guardrails 仅非流式;体量大、版本迭代快,质量波动需锁版本;多一跳运维/故障面。
**B. one-api / new-api** — one-api 原版基本只做 OpenAI 入站;new-api(社区加强版,Go 单二进制)入站格式扩到 OpenAI/Claude Messages/Gemini,`/v1/messages` 文档确认 streaming/tools/thinking 字段面齐全(https://doc.newapi.pro/en/api/anthropic-chat/),但**「Claude 入站 → OpenAI 格式渠道」的跨格式转换保真度文档未明示,需实测**;历史上 one-api 系对非 OpenAI 模型 function call 转换质量是弱项(new-api 声称改进)。适合已用它做渠道管理的团队顺带承担,不适合作为翻译正确性的信任锚。
**C. OpenRouter「Anthropic skin」** — 托管服务原生提供 Anthropic 兼容端点 `/api/v1/messages`,任意模型;官方文档称 thinking 块/工具/流式/多轮全透传,cache_control 行为随底层模型而异(https://openrouter.ai/docs/api/api-reference/anthropic-messages/create-messages)。零部署成本,但数据出境+第三方计费+延迟,对本项目(国产上游为主)吸引力有限。
**D. claude-code-router(musistudio,34k stars)+ @musistudio/llms** — 入站 Anthropic → transformer 管道 → OpenAI/Gemini/DeepSeek…,内部统一格式 UnifiedChatRequest 为 OpenAI 形;transformer 四方法(transformRequestIn/Out、transformResponseIn/Out)是最完整的开源翻译参考实现(https://github.com/musistudio/claude-code-router 、https://github.com/musistudio/llms)。但定位是**单用户本地代理**(无多租户/鉴权/配额),且有真实翻译 bug 记录:#1397 streaming reasoning transformer 会破坏 reasoning→tool_calls 模型(Qwen3 等)的工具参数 delta,导致工具入参为空/畸形(https://github.com/musistudio/claude-code-router/issues/1397)。价值 = 参考实现,不是生产部署物。
**E. 轻量单文件代理**(y-router CF Worker、a4f-proxy、anthropic-proxy-rs、x5iu/claude-code-adapter Go 版等)— 几百行、审计容易、MIT,恰好只做「Anthropic 入站→OpenAI 出站」;a4f-proxy 等展示了细节坑的处理:tool_choice `any`→OpenAI `required`、本地 tokenizer 兜底 usage、流式 SSE 转换(https://github.com/edxeth/a4f-proxy 、https://github.com/luohy15/y-router)。
**F.(重要旁路)上游原生 Anthropic 兼容端点** — 2025-2026 趋势:DeepSeek(`api.deepseek.com/anthropic`)、Moonshot/Kimi(`api.moonshot.ai/anthropic`)、智谱 GLM(`api.z.ai/api/anthropic`)、MiniMax、Qwen 等都已原生提供 Anthropic Messages 兼容端点(https://github.com/Alorse/cc-compatible-models)。很多「OpenAI 模型」其实**根本不需要翻译**,现有 base_url 机制直接可用。

### 2. 路线二:进程内适配层

**G. Vercel AI SDK(v5/v6)** — provider 抽象最成熟的 TS 库:统一 `reasoning` 参数、`providerOptions.anthropic.cacheControl` 自动翻译到 content block、`stopWhen/prepareStep` 工具循环、Agent 类(https://ai-sdk.dev/providers/ai-sdk-providers/anthropic 、https://ai-sdk.dev/docs/agents/loop-control)。但采用它=**换内核**:消息真源要从 `Anthropic.MessageParam` 换成 AI SDK 的 ModelMessage,turnLoop 的流事件消费、window 切割、jsonl 回放、WS 中性帧全要重写。它解决「从零建多协议 agent」,不解决「给 Anthropic 内核加 OpenAI 出口」。已知它也有 Anthropic thinking+tool 多轮回放 signature 问题的 issue 记录。
**H. token.js / LLM.js / multi-llm-ts 等轻量库** — 统一到 OpenAI 格式,免代理;但维护活跃度一般、对 thinking/cache_control/细粒度流事件覆盖远弱于 AI SDK,同样有换内核成本 → 基本排除(https://github.com/token-js/token.js)。
**I. 自研出口翻译层(Anthropic 内部真源 → OpenAI 出口)** — 在 `client.ts` 层做一个鸭子型「假 Anthropic client」:按 `provider.apiFormat` 分叉,openai 分支把 Anthropic 请求转 ChatCompletions、把 OpenAI SSE 转回 Anthropic 流事件。turnLoop **零改动**。已知坑清单(均有开源参考实现验证):① 流式 tool_calls 聚合:OpenAI `delta.tool_calls[].index` + arguments 字符串分片,并行调用 index 交错,需拼装后再造 `content_block_start/input_json_delta/stop`;ccr #1397 即此处翻车;② usage:OpenAI 流式需 `stream_options.include_usage`(最后一个空 choices chunk),部分兼容上游不发 → 本地 tokenizer 兜底;`prompt_tokens_details.cached_tokens`→`cache_read_input_tokens`;③ reasoning:非标准(DeepSeek `reasoning_content`/OpenRouter `reasoning`/OpenAI o 系不回传),合成的 thinking 块无 signature,**回放方向必须剥离历史 thinking 块**(发 OpenAI 无此字段;发 Anthropic 伪 signature 会 400 "Invalid signature in thinking block" — 该类 bug 在 CLIProxyAPI/opencode/kilocode 等项目反复出现);④ tool_choice 映射 any→required、disable_parallel_tool_use→parallel_tool_calls;⑤ cache_control 剥离(OpenAI 只有自动前缀缓存,无显式断点);⑥ stop_reason 映射 tool_calls→tool_use / length→max_tokens;⑦ system 数组块→system/developer message;⑧ tool_result 的 user 消息→OpenAI tool role 消息(结构不变量变化,影响 window 切割假设)。核心工作量约 500–1000 行 + 边界测试,可抄 y-router/a4f-proxy/@musistudio/llms。

### 3. 方案矩阵

| 方案 | 入站A→出站O成熟度 | 部署/运维 | 流式/工具/usage保真 | prompt cache | thinking透传 | per-model路由 | 内核侵入 | 适用条件 |
|---|---|---|---|---|---|---|---|---|
| F 原生Anthropic端点 | 上游官方维护,最高 | 零 | 上游负责 | 上游实现(多数支持) | 上游实现 | base_url/model 已有 | 零 | 目标模型有 /anthropic 端点(DeepSeek/Kimi/GLM/Qwen/MiniMax) |
| I 自研进程内翻译 | 自己保证,有多份MIT参考 | 零新进程 | 自控,需测试 | 剥离+自动缓存 | 合成thinking块,回放需剥离 | providerStore.apiFormat 天然承载 | 仅 client.ts 层 | 少数 OpenAI-only 模型;想保配置单一真源 |
| A LiteLLM | 文档最全、生态验证最多 | +1 Python 容器 | 官方✅,cache/usage细节需验 | 不明确 | 参数转发 | model_list 原生 | 零(改base_url) | 模型/渠道多、要fallback/成本核算 |
| B new-api | 入站支持,跨格式保真未证 | +1 Go 容器(轻) | 需实测 | 未知 | 字段齐 | 渠道管理UI | 零 | 已在用它管渠道 |
| C OpenRouter skin | 官方托管,高 | 零 | 官方称全透传 | 随底层模型 | 透传 | 模型名即路由 | 零 | 接受托管出境/其计费 |
| D ccr/@musistudio/llms | 参考实现最完整 | 本地单用户代理 | 有已知流转换bug | — | transformer处理 | 场景链路由 | 零 | 只作代码参考 |
| G Vercel AI SDK | 不做「伪装Anthropic」 | 进程内 | 库级成熟 | providerOptions自动翻译 | 统一reasoning参数 | registry | **重写内核** | 新项目/推倒重来 |
| H token.js类 | 弱 | 进程内 | 覆盖不足 | 无 | 弱 | 有 | 换内核 | 排除 |

### 4. lingua franca 的业界经验
- **聚合网关的内部真源几乎清一色是 OpenAI 格式**:LiteLLM 明确 "Call 100+ LLMs using the OpenAI Input/Output Format"(https://docs.litellm.ai/docs/);@musistudio/llms 的 UnifiedChatRequest 是 OpenAI 形;token.js/one-api 同。原因:上游长尾是 OpenAI 兼容,网关的翻译成本最小化方向是向上游看齐。
- **但「客户端/会话真源 = Anthropic,边缘翻译出口」是 Claude Code 生态大规模验证过的反向路径**:ccr(34k stars)、y-router、LiteLLM 专门出 Claude Code 教程、OpenRouter 专门做 Anthropic skin、连上游厂商(DeepSeek/Moonshot/智谱)都反过来实现 Anthropic 兼容端点 —— Anthropic Messages 已成 agent 场景第二事实标准。
- **选边逻辑**:真源应选**表达力更高**的一侧,向低表达力侧降级出口(有损但可控);反之升级方向无中生有(thinking 块、signature、显式 cache 断点、content block 结构在 ChatCompletions 里没有对应物)。对网关产品,长尾在上游 → OpenAI 真源合理;对本执行器,长尾在会话语义(thinking/工具循环/细粒度流) → **Anthropic 真源保持不动是正解**,与 LiteLLM 的选择不矛盾——层不同。

### 5. 初步倾向排序(先不定论)
1. **零改造优先**:盘点目标模型的原生 Anthropic 兼容端点覆盖(DeepSeek/Kimi/GLM/Qwen/MiniMax 均有),能覆盖则现有 base_url 机制直接解决,per-model 只是「多 provider 配置」问题;
2. **进程内自研薄翻译层**(方案 I):对真 OpenAI-only 模型,在 client.ts 按 providerStore.apiFormat 分叉,turnLoop 零改动、配置单一真源、无新故障面;参考 y-router/a4f-proxy/@musistudio/llms transformer;
3. **LiteLLM sidecar**:当模型渠道数量膨胀、需要 fallback/配额/成本核算时,把翻译外包给它(agent base_url 指向 LiteLLM 的 /v1/messages);代价是 Python 容器+一跳故障面+配置真源分裂;
4. 一般不推荐:new-api 承担跨格式(保真未证)、OpenRouter(托管出境)、Vercel AI SDK(重写内核收益不成比例)、token.js 类(能力不足)。
建议 spike:拿 DeepSeek(同时有 /anthropic 原生端点和 OpenAI 端点)做三路 A/B —— 原生 anthropic 端点 vs LiteLLM 转换 vs 自研薄层,以「20 轮工具循环保真 + usage 一致性 + thinking 呈现」为验收。

## designImplications
- 改造切口天然存在:per-model api_format 的最小侵入实现是在 agent/src/anthropic/client.ts 的 makeClient 层按 provider.apiFormat 分叉 —— anthropic 走现有 SDK,openai 走一个鸭子型『假 Anthropic client』适配器;turnLoop 消费的流事件语义(content_block_start/delta/stop + finalMessage + usage 形)即翻译层的输出契约,应写成 conformance 测试锁死(agent/src/harness/conformance.ts 已有雏形,其中 apiFormat 也已入参)
- 配置链改造点明确但需扩模:agent_config 现为单 provider(base_url+apiKey)+四挡模型名(backend/internal/agentconfig/model.go:31-36),per-model api_format 意味着要么升级为 per-model 的 {base_url, api_key, api_format} 三元组(多 provider),要么保单 provider 加 model→format 映射;push 链路(backend/internal/agent/client.go:961,974 的硬编码)与 agent 侧 providerStore/http.ts 字段透传都要同步;建议第一步先把 api_format 字段全链路打通但默认 anthropic(行为不变),再启用 openai 分支
- thinking 块回放是第一优先坑:turnLoop.ts:192 全量回放含 signature 的 thinking 块 —— OpenAI 出口分支必须在请求组装时剥离历史 thinking 块(无对应字段);若未来允许会话中途换 api_format/模型,历史里的 Anthropic 专有块跨格式重放会炸,建议翻译层统一做『出口消毒』而非依赖会话不换模型的假设
- 流式 tool_calls 聚合是第二优先坑:OpenAI delta.tool_calls[].index + arguments 字符串分片(并行调用交错)需先拼装再合成 Anthropic input_json_delta 事件;ccr #1397 证明这里最容易翻车,尤其 reasoning→tool_calls 的模型(Qwen3 等);测试集必须覆盖并行工具调用+reasoning 混排的流
- usage/计费兼容:normUsage(turnLoop.ts:221)已是中性单点,OpenAI 分支只需把 prompt_tokens/completion_tokens/prompt_tokens_details.cached_tokens 映射进同形;但必须显式带 stream_options.include_usage,且对不发流式 usage 的兼容上游做本地 tokenizer 兜底,否则 vip 日额度/agent_usage 审计失真;cache 折扣计费口径也随 OpenAI 自动缓存语义变化
- prompt cache 保真:系统已有『静态前缀保 cache』纪律(langLine 静态串),Anthropic 显式 cache_control 断点在 OpenAI 出口需剥离、退化为 OpenAI 自动前缀缓存 —— 前缀稳定纪律继续有效,但缓存命中率与折扣不可跨格式假设等同
- 优先做『零翻译』盘点:目标国产模型(DeepSeek/Kimi/GLM/Qwen/MiniMax)多已有原生 Anthropic 兼容端点,这些模型 per-model 只需 base_url+model 配置即达成,双协议改造的真实范围可能只剩少数 OpenAI-only 上游 —— 先盘点再决定翻译层规模
- 若走 LiteLLM sidecar 路线:agent base_url 指向 LiteLLM /v1/messages 即可零改代码,但引入 Python 容器、一跳故障面(网关挂=全 agent 挂,需健康检查/降级)、配置真源分裂(agent_config 表 vs litellm config.yaml 需同步机制);适合模型渠道数量膨胀后再升级,不建议作为第一步
- 窗口/上下文管理需 per-model 化:window.ts 的硬截断阈值隐含单一 tokenizer 假设,换 OpenAI 上游即换 tokenizer;且 Anthropic 的 user+tool_result 结构翻译成 OpenAI tool role 消息后,配对不变量的映射要在翻译层内保证,不能让 window 切割逻辑感知两种形
- 建议落地顺序:①全链路打通 api_format 字段(默认 anthropic,零行为变化)→②盘点原生 anthropic 端点覆盖→③用 DeepSeek 做三路 spike(原生 /anthropic vs LiteLLM vs 自研薄层,验收=20 轮工具循环保真+usage 一致+thinking 呈现)→④按 spike 结果决定自研薄层(推荐倾向)或 sidecar;自研层参考 y-router/a4f-proxy/@musistudio/llms transformer,预估核心 500-1000 行+边界测试

## keyFacts
- 本地:执行器 SDK 入口单点 agent/src/anthropic/client.ts:21(new Anthropic({baseURL, authToken}),注释自称 provider-agnostic by construction),依赖 @anthropic-ai/sdk ^0.80.0
- 本地:turnLoop 深度消费 Anthropic 流事件(agent/src/turn/turnLoop.ts:148 messages.stream;:154-180 content_block_start/delta/stop + thinking_delta + input_json_delta;:180 finalMessage),并在 :192 全量回放 msg.content(含 thinking 块及 signature)进历史
- 本地:usage 已有中性归一单点(turnLoop.ts:221 normUsage,cache_read_input_tokens→cache_read_tokens),计费链(Go 侧 vip 额度)只认中性形
- 本地:apiFormat 配置管道已存在但恒为常量 —— agent/src/config/providerStore.ts:23(apiFormat:"anthropic")、agent/src/server/http.ts:116 接收字段、backend/internal/agent/client.go:961,974 硬编码 APIFormat:"anthropic";模型配置为单 provider 四挡(backend/internal/agentconfig/model.go:31-36 base_url+main/haiku/sonnet/opus)
- LiteLLM 的统一 /v1/messages 端点官方支持入站 Anthropic 格式路由到所有 provider(OpenAI 内部走 Responses API,有逐参数映射文档),Streaming/Fallback/Cost-tracking 标✅,thinking 参数转发;guardrails 仅非流式;cache_control 跨 provider 保真未明示(docs.litellm.ai/docs/anthropic_unified/)
- LiteLLM 内部真源是 OpenAI 格式('Call 100+ LLMs using the OpenAI Input/Output Format');claude-code-router 的 @musistudio/llms 内部 UnifiedChatRequest 也是 OpenAI 形 —— 聚合网关几乎清一色选 OpenAI 作 lingua franca,因为上游长尾是 OpenAI 兼容
- claude-code-router(musistudio,34k stars)验证了『客户端保持 Anthropic 原生、边缘 transformer 翻译』路径的可行性,但定位单用户本地代理,且有真实翻译 bug:#1397 streaming reasoning transformer 破坏 reasoning→tool_calls 模型的工具参数 delta(工具入参为空/畸形)
- OpenRouter 官方提供 Anthropic 兼容端点(Anthropic skin,/api/v1/messages),任意模型,声称 thinking/工具/流式/多轮全透传,cache_control 行为随底层模型而异
- one-api 原版基本仅 OpenAI 入站;new-api 入站格式扩到 Claude Messages(/v1/messages 文档含 streaming/tools/thinking),但『Claude 入站→OpenAI 渠道』跨格式转换保真度文档未明示,需实测
- 2025-2026 趋势:DeepSeek(api.deepseek.com/anthropic)、Moonshot/Kimi(api.moonshot.ai/anthropic)、智谱 GLM(api.z.ai/api/anthropic)、MiniMax、Qwen 等上游原生提供 Anthropic Messages 兼容端点 —— 很多目标模型根本不需要格式翻译,现有 base_url 机制直接可用
- Anthropic→OpenAI 翻译已知坑(多个开源代理反复踩):流式 tool_calls 按 index 聚合 arguments 分片;OpenAI 流式 usage 需 stream_options.include_usage 且部分兼容上游不发(需本地 tokenizer 兜底);reasoning 字段非标准(DeepSeek reasoning_content/OpenAI o 系不回传);tool_choice any→required;cache_control 需剥离;stop_reason 映射
- thinking 块 signature 是跨格式回放的高频雷区:代理对 JSON 重序列化/改动即致 Anthropic 400 'Invalid signature in thinking block'(CLIProxyAPI #2172、opencode #6176/#11546 等);OpenAI 出口方向必须剥离历史 thinking 块 —— 而本执行器 turnLoop.ts:192 恰恰全量回放含 signature 的 thinking 块
- Vercel AI SDK(v5/v6)是 provider 抽象最成熟的 TS 库(统一 reasoning 参数、providerOptions.anthropic.cacheControl 自动翻译、stopWhen/prepareStep 工具循环),但采用=更换消息真源与内核,解决『从零建多协议 agent』而非『给 Anthropic 内核加 OpenAI 出口』;token.js/LLM.js 类轻量库能力覆盖不足可排除
- 轻量单文件代理(y-router CF Worker、a4f-proxy、anthropic-proxy-rs、x5iu/claude-code-adapter)提供了『入站 Anthropic→出站 OpenAI』的小型 MIT 参考实现,含 tool_choice 映射、本地 token 计数兜底、SSE 转换等细节处理
