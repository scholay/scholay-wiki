## summary
本任务为纯协议调研(未读仓库代码,故无 file:line 引用;结论均以官方文档为准)。Anthropic 侧依据 platform.claude.com/docs/en/api/messages.md 及官方 SDK 文档;OpenAI 侧依据 developers.openai.com(注意:platform.openai.com 已 301 迁移到 developers.openai.com,直接抓 platform 域名返回 403)。

【1. 请求结构】
■ system 位置:Anthropic 的 system 是『顶层参数』(string 或 text-block 数组,每 block 可带 cache_control/citations);messages 里 role 只有 user/assistant(例外:Opus 4.8 支持 messages 内 role:system 的 mid-conversation system,模型门控)。OpenAI 的 system 提示是 messages 数组里的一条消息,role 全集=developer/system/user/assistant/tool(o系/新模型官方推荐 developer)。Anthropic 首条消息必须是 user;OpenAI 无此限制。
■ tools 定义:Anthropic 平铺 {name, description, input_schema:{type:object,properties,required}, strict?(顶层字段), cache_control?, defer_loading?, input_examples?};OpenAI 嵌套一层 {type:'function', function:{name, description, parameters, strict}}。两家 strict 都要求 additionalProperties:false + required 全列。注意 OpenAI Responses API 是平铺 {type:'function', name,...},与 Chat Completions 形状不同,勿混。
■ tool_choice:Anthropic 对象 {type:'auto'|'any'|'tool'(带name)|'none', disable_parallel_tool_use?};OpenAI 字符串或对象 'auto'|'none'|'required'|{type:'function',function:{name}}(另有 allowed_tools),并行开关是独立顶层参数 parallel_tool_calls:false。映射:any↔required;disable_parallel_tool_use:true ↔ parallel_tool_calls:false(布尔语义相反);具名强制对象形状不同。
■ token 上限:Anthropic max_tokens『必填』(含 thinking tokens;max_tokens:0 可做缓存预热);OpenAI max_tokens 已 deprecated → max_completion_tokens(推理模型只认后者,且 reasoning tokens 计入该额度,官方建议预留≥25K)。
■ 采样:Anthropic temperature 范围 0–1(默认1)、有 top_p/top_k,但 Opus 4.7/4.8、Sonnet 5、Fable 5 发送任一采样参数直接 400;OpenAI temperature 0–2(默认1)、top_p、无 top_k;OpenAI o系推理模型同样拒非默认 temperature/top_p。→ 采样参数是 per-model 白名单问题而非 per-protocol 问题。
■ stop:Anthropic stop_sequences:string[],命中时 stop_reason='stop_sequence' 且响应带 stop_sequence 字段回显命中串;OpenAI stop: string|string[](≤4),命中与自然结束都归 finish_reason='stop',不回显命中串。
■ stream:双方都是 stream:true;OpenAI 要拿流式 usage 必须另设 stream_options:{include_usage:true}(否则 usage 恒缺);Anthropic 流式 usage 内建于事件。
■ 图片:Anthropic content block {type:'image', source:{type:'base64', media_type, data} | {type:'url', url} | {type:'file', file_id(Files API beta)}};OpenAI content part {type:'image_url', image_url:{url(http 或 data:image/png;base64,... data-URI), detail:'low'|'high'|'auto'}}。翻译:base64+media_type ↔ data-URI 前缀互转;Anthropic 无 detail 档位,OpenAI 无独立 media_type 字段。
■ PDF/文件:Anthropic 原生 {type:'document', source:{type:'base64', media_type:'application/pdf'} | url | text(纯文本) | content(自定义块) | file},还支持 citations、title;OpenAI 用 content part {type:'file', file:{file_id 或 filename+file_data(base64 data-URI)}},较新且很多 OpenAI 兼容上游不支持。两家 Files API 的 file_id 互不相通。

【2. 工具调用】
■ 发起:Anthropic 在 assistant content 数组里给 tool_use block {type:'tool_use', id, name, input:『已解析的 JSON 对象』};并行=同一条 assistant 消息里多个 tool_use block,可与 text/thinking block 按顺序交错。OpenAI 在 choices[0].message.tool_calls 数组给 [{id, type:'function', function:{name, arguments:『JSON 字符串』}}],content 与 tool_calls 可共存但没有块级交错顺序。翻译核心:input(object) ↔ arguments(string),需 JSON.parse/stringify;注意 Anthropic 4.6+ 模型 input 的转义风格可能不同,永远 parse 不做字符串匹配。
■ 结果回传:Anthropic=下一条『user』消息,content 里放 tool_result block {type:'tool_result', tool_use_id, content:string|blocks(可含 image), is_error?:bool},官方要求所有并行调用的 tool_result 打包在『同一条 user 消息』(拆开会退化模型并行行为),且每个 tool_use id 必须有配对 tool_result 否则 400。OpenAI=每个调用『各一条』role:'tool' 消息 {tool_call_id, content:string},必须紧跟对应 assistant(tool_calls)消息之后。1条user多result ↔ N条tool消息,是消息条数级别的结构变换。
■ OpenAI 流式 tool_calls 聚合规则(官方 function-calling 指南):delta.tool_calls[] 每项带 index;首个 delta 携带 id 和 function.name,后续 delta 只带 function.arguments 增量字符串;客户端按 index 建桶、把 arguments 逐段字符串拼接,流结束后整体 JSON.parse。Anthropic 对应物:content_block_start(type:'tool_use',带 id/name,input:{}) → 多个 content_block_delta{type:'input_json_delta', partial_json:字符串增量} → content_block_stop,按 block 的 index 聚合 partial_json 后 parse。两者同构(index+字符串增量),但事件外壳完全不同。

【3. 流式协议】
■ Anthropic SSE 带显式 event: 行,事件序列:message_start(含 message 骨架 + usage.input_tokens 等输入侧计量)→ 每个内容块一组 content_block_start / content_block_delta / content_block_stop(delta 细分 text_delta / input_json_delta / thinking_delta / signature_delta,以 index 定位块)→ message_delta(携带最终 stop_reason/stop_sequence + usage.output_tokens 累计值)→ message_stop;另有 ping、error 事件。
■ OpenAI 是同质 chunk 流:每条 data: 都是 chat.completion.chunk 对象,无 event 类型区分;choices[0].delta 含 role(首个chunk)/content/tool_calls/refusal;finish_reason 在该 choice 的最后一个 chunk;若设 stream_options.include_usage,最后再发一个 choices:[] 的 chunk 单独携带 usage;终止哨兵 data: [DONE]。
■ 结构差异:Anthropic 是『类型化多块 + 两段式 usage(输入在 message_start、输出在 message_delta)』;OpenAI 是『单一 content 字符串 + tool_calls 数组 + 尾部一次性 usage(需显式开启)+ [DONE]』。翻译层必须是有状态状态机,不能逐帧映射。

【4. usage 字段】
■ Anthropic(/v1/messages 官方 schema):input_tokens(『不含』缓存部分)、output_tokens(含 thinking)、cache_creation_input_tokens(写缓存,5m 1.25×/1h 2×)、cache_read_input_tokens(0.1×)、cache_creation:{ephemeral_5m_input_tokens, ephemeral_1h_input_tokens}(按 TTL 明细)、output_tokens_details:{thinking_tokens}、server_tool_use:{web_search_requests,...}、service_tier、inference_geo。总输入 = input_tokens + cache_creation_input_tokens + cache_read_input_tokens。
■ OpenAI:prompt_tokens(『含』cached 部分)、completion_tokens(『含』reasoning tokens)、total_tokens、prompt_tokens_details:{cached_tokens, audio_tokens}、completion_tokens_details:{reasoning_tokens, audio_tokens, accepted/rejected_prediction_tokens}。cached_tokens 是 prompt_tokens 的子集。
■ cache_creation 对应物:OpenAI 传统上『没有』写缓存计量(写免费);官方 prompt-caching 文档显示 2026 起 GPT-5.6+ 引入 1.25× 写费与 cache_write_tokens 字段,但这是新变化且多数兼容上游没有。DeepSeek 用自有字段 prompt_cache_hit_tokens / prompt_cache_miss_tokens(prompt_tokens = hit+miss,同 OpenAI 含缓存口径)。
■ 关键口径陷阱:Anthropic input_tokens 是未缓存净值,OpenAI prompt_tokens 是含缓存总值——计费/配额换算公式完全不同,直接拿字段同名相加会双计或漏计。

【5. 推理/思考】
■ Anthropic:一等公民 content block {type:'thinking', thinking, signature} 与 {type:'redacted_thinking', data};流式有 thinking_delta/signature_delta;多轮须把 thinking block『原样回传』同模型(signature 防篡改,改动即 400);Fable 5/Opus 4.8/4.7/Sonnet 5 默认 display:'omitted'(thinking 字段为空串,需 display:'summarized' 才有可读摘要);计费在 output_tokens,明细 usage.output_tokens_details.thinking_tokens。
■ OpenAI(o系/GPT-5,官方):Chat Completions『完全不透出』推理内容——没有 reasoning_content 字段,推理在轮间被丢弃;只在 usage.completion_tokens_details.reasoning_tokens 报数并按输出计费。要拿加密推理项/推理摘要必须用 Responses API(reasoning.encrypted_content 等)。控制参数是 reasoning_effort(none/minimal/low/medium/high/xhigh,视模型)。
■ DeepSeek(api-docs.deepseek.com):message.reasoning_content 与流式 delta.reasoning_content 都透出;请求参数 thinking:{type:'enabled'|'disabled'}(默认 enabled)+ reasoning_effort('high'/'max');usage 有 completion_tokens_details.reasoning_tokens 与 prompt_cache_hit/miss_tokens;回传规则:常规多轮不需要回传 reasoning_content(历史版本回传会报错),仅 beta 的 Chat Prefix Completion(prefix:true)下可作为 CoT 输入。deepseek-reasoner 模型 2026/07/24 弃用,归入 deepseek-v4-flash 的 thinking 模式。
■ Qwen(阿里 DashScope compatible-mode):非标准参数 enable_thinking(OpenAI SDK 需走 extra_body);流式 delta.reasoning_content 透出(thinking 阶段 reasoning_content 非空/content 空,回答阶段反之);混合思考模型『非流式调用必须显式 enable_thinking:false 否则报错』,官方推荐一律流式。
■ GLM(z.ai/GLM-4.7):thinking:{type:'enabled'|'disabled'} 参数;透出 reasoning_content;特色是 interleaved thinking——配 clear_thinking:false 可跨轮保留推理,但要求客户端把历史 reasoning_content 完整回放(增加 prompt tokens);Cerebras 托管版改用 reasoning_effort='none' 禁思考。
■ Kimi(Moonshot kimi-k2-thinking/K2.5):透出 reasoning_content;最强 quirk——多轮工具调用中『必须』把上一条带 tool_calls 的 assistant 消息的 reasoning_content 原样回传,否则直接报错(API 无状态、需客户端保留);这与 OpenAI 官方习惯(client 剥掉未知字段无妨)相反,通用 OpenAI 客户端/LiteLLM 默认 strip 该字段会炸(LiteLLM issue #21672)。
■ 结论:『OpenAI 兼容』生态的 reasoning 透出没有统一标准:字段名大体收敛在非官方的 reasoning_content,但开关参数(enable_thinking vs thinking:{type} vs reasoning_effort)、默认值、回传规则(禁止/可选/必须)各家互斥。

【6. Prompt cache】
■ Anthropic:显式 cache_control:{type:'ephemeral', ttl:'5m'|'1h'} 断点(每请求≤4个),前缀字节级匹配(渲染序 tools→system→messages),最小可缓存前缀 1024–4096 tokens 视模型;写 1.25×(5m)/2×(1h),读 0.1×;usage 三字段可验证;还有顶层 cache_control 自动落点、max_tokens:0 预热。是『付费显式租约』,可控性强。
■ OpenAI:全自动、零代码,前缀≥1024 tokens 即可能命中(按前 256 tokens 前缀 hash 路由机器);读打 5 折(GPT-5.6 前),写免费(GPT-5.6+ 变 1.25× 并新增 cache_write_tokens);存活 5–10 分钟不活跃、上限约 1 小时;prompt_cache_key 参数可辅助路由提升命中;无断点、无 TTL 控制,best-effort 无保证。
■ 计费语义差:Anthropic 命中验证靠 cache_read_input_tokens>0 且三字段拆分计价;OpenAI 靠 prompt_tokens_details.cached_tokens(含在 prompt_tokens 内,折扣价)。翻译 Anthropic→OpenAI 时 cache_control 字段必须『静默剥除』(部分严格上游遇未知字段 400),缓存收益退化为上游自动行为。

【7. stop_reason 映射表】
Anthropic(官方全集:end_turn / max_tokens / stop_sequence / tool_use / pause_turn / refusal;另 4.5+ 有 model_context_window_exceeded)↔ OpenAI finish_reason(stop / length / tool_calls / content_filter / function_call(legacy)):
• end_turn → stop
• tool_use → tool_calls(反向含 legacy function_call)
• max_tokens → length
• stop_sequence → stop(OpenAI 不区分自然结束与命中停止串,且不回显命中串——反向不可逆)
• refusal → content_filter(近似:Anthropic refusal 附 stop_details{category,explanation},OpenAI 只有枚举值;OpenAI 另有 message.refusal 字段用于 structured outputs 拒绝,与 finish_reason 独立)
• pause_turn → 无对应(OpenAI 无服务端工具暂停语义;只能映射 stop 或自定义扩展并由桥接层自动续跑)
• model_context_window_exceeded → 无对应(OpenAI 直接 400 context_length_exceeded 错误而非 finish_reason)
流式位置:Anthropic 的 stop_reason 在 message_delta 事件;OpenAI 的 finish_reason 在最后一个含该 choice 的 chunk。

【翻译时的信息丢失点(Anthropic→OpenAI 无对应)】见 keyFacts 末组与 designImplications。反向(OpenAI→Anthropic)丢失:logprobs、n>1 多候选、presence/frequency_penalty、seed、logit_bias、audio 模态、response_format:json_object(Anthropic 用 output_config.format 对应 json_schema 但无 json_object 松模式)。

## designImplications
- api_format 二值('anthropic'|'openai')不够:reasoning 透出/开关/回传在 OpenAI 兼容生态内互斥(DeepSeek/Qwen/GLM/Kimi 各不相同),建议 per-model 再挂 capability/dialect 配置——至少含:reasoning 字段名与开关参数、reasoning 是否必须回传(Kimi=必须)、非流式是否允许(Qwen 思考模型=否)、是否支持 file/PDF part、是否支持 strict、temperature 范围/是否允许采样参数
- usage 归一化是双协议改造的最大暗坑:建议内部统一为 {uncached_input, cache_read, cache_write, output, reasoning/thinking} 五元组——Anthropic 直接映射(input_tokens 本就是净值),OpenAI 需换算 uncached_input=prompt_tokens-cached_tokens、cache_write 默认0;本仓库 llm_token_usage/vip 日额度与 agent_usage 审计(FeatureSpec.OnMessageComplete)都吃 usage,若翻译层直接同名透传会导致计费口径错乱
- 工具桥接需做三层变换:①input对象↔arguments字符串(parse/stringify+容错);②tool_result 打包变换(Anthropic 1条user多block ↔ OpenAI N条role:tool,且顺序必须紧跟assistant);③流式聚合状态机(OpenAI 按 index 拼 arguments,完整后才能给下游 parse)——不能逐帧无状态映射
- 流式翻译必须是有状态适配器:OpenAI→Anthropic 要合成 message_start/content_block_* 序列并把尾部 usage 回填成 message_delta;别忘了对 OpenAI 上游强制加 stream_options:{include_usage:true},否则 token 审计链路(agent_usage 日志、vip 扣量)拿不到数据
- 信息丢失清单要在设计文档里显式声明并定策略:thinking block+signature(OpenAI 侧只能降级为 reasoning_content 或丢弃,signature 校验机制无法保留)、cache_control(静默剥除)、tool_result 内嵌图片与 is_error(降级为文本描述)、pause_turn(桥接层自动续跑或映射 stop)、stop_sequence 命中回显(丢失)、server tools/citations/document 块(OpenAI 无对应)——上层功能(claw/prism/审稿)若依赖这些块类型需 feature-level 降级方案
- stop_reason 双向映射表建议内置且带兜底默认值:未知值→end_turn/stop;OpenAI 侧 content_length 超限是 400 错误不是 finish_reason,错误翻译层也要归一(context_length_exceeded→model_context_window_exceeded 语义)
- 参数清洗应做成 per-model 白名单+范围钳制而非 if(api_format):Anthropic 新模型拒采样参数、OpenAI 推理模型拒 temperature 且只认 max_completion_tokens——同一协议内也分叉;发送前剥除对方私有字段(cache_control、thinking、metadata / prompt_cache_key、logit_bias 等)避免严格上游 400
- 本仓库落点建议:现有 agent 容器(cc-haha/Claude Agent SDK)原生说 Anthropic Messages 协议,backend(internal/agent+agentbridge)是黑盒转发、WS 帧协议与 jsonl 存储不感知上游协议——per-model api_format 的翻译层应收敛在 agent 容器的 provider 出口单点实现(相当于自建一个 anthropic→openai 出站适配器,或复用 LiteLLM/one-api 类网关),backend 与前端协议零改动;agent_config 表加 api_format+dialect 字段,admin 推送时一并下发
- 多轮历史重放的协议保真:Anthropic 要求 assistant 历史里 thinking/tool_use block 原样回传(signature 校验),OpenAI 要求 assistant.tool_calls+对应 role:tool 成对出现,Kimi 还要求 reasoning_content 保留——会话历史应按『上游原生格式』存储或至少可无损还原,不要在存储层就归一化丢字段(本仓库 jsonl 在 agent 容器内,天然满足,切换某会话的 api_format 时需注意历史不可跨协议直接重放)
- prompt cache 收益预期管理:切到 OpenAI 协议上游后,Anthropic 式显式缓存策略失效,退化为自动前缀缓存(读5折、无TTL控制);系统提示词/工具列表保持字节稳定、易变内容后置的『前缀稳定』纪律对两家同样有效,应保留;可选支持 prompt_cache_key 透传提升 OpenAI 命中率

## keyFacts
- OpenAI 官方文档域名已从 platform.openai.com 301 迁移到 developers.openai.com(直接抓旧域名 403);本调研全部以新域名为准
- system 位置:Anthropic=顶层 system 参数(可多 block+cache_control);OpenAI=messages 内一条 developer/system 消息;Anthropic messages 首条必须 user
- tools:Anthropic input_schema+顶层 strict vs OpenAI function.parameters+function.strict(嵌套一层);两家 strict 都要求 additionalProperties:false+required 全列
- tool_choice:Anthropic any ↔ OpenAI required;disable_parallel_tool_use:true ↔ parallel_tool_calls:false(独立顶层参数,布尔相反);具名强制对象形状不同({type:'tool',name} vs {type:'function',function:{name}})
- max_tokens:Anthropic 必填且含 thinking;OpenAI max_tokens 已弃用→max_completion_tokens(推理模型强制,reasoning tokens 占额度,官方建议预留≥25K)
- temperature:Anthropic 0–1 vs OpenAI 0–2,需 clamp;且 Anthropic Opus4.7+/Sonnet5/Fable5 与 OpenAI o系都拒绝采样参数——参数白名单必须 per-model 而非 per-protocol
- 工具调用值类型:Anthropic tool_use.input 是 JSON 对象;OpenAI function.arguments 是 JSON 字符串——桥接必须 parse/stringify
- 工具结果:Anthropic=1条 user 消息打包全部 tool_result block(可含 image、is_error);OpenAI=每调用1条 role:'tool' 消息(仅文本, tool_call_id)——消息条数级结构变换,且 OpenAI 侧丢图片与 is_error
- OpenAI 流式 tool_calls 聚合:delta.tool_calls 按 index 建桶,首 delta 带 id/name,后续拼接 function.arguments 字符串;Anthropic 对应 content_block_start(tool_use)+input_json_delta.partial_json+content_block_stop
- 流式:Anthropic 五类具名事件(message_start/content_block_start/delta/stop/message_delta/message_stop,usage 分两段);OpenAI 同质 chunk+data:[DONE],usage 需 stream_options.include_usage 且在末尾空 choices chunk
- usage 口径陷阱:Anthropic input_tokens 不含缓存(总输入=input+cache_creation+cache_read);OpenAI prompt_tokens 含 cached_tokens(details 里是子集)——直接同名映射会算错账
- cache_creation(写缓存计量)在 OpenAI 侧基本无对应(写免费);仅 2026 GPT-5.6+ 新增 1.25× 写费+cache_write_tokens;DeepSeek 用 prompt_cache_hit/miss_tokens 自有字段
- Anthropic usage 还有 cache_creation:{ephemeral_5m_input_tokens,ephemeral_1h_input_tokens} 按 TTL 明细、output_tokens_details.thinking_tokens、server_tool_use、service_tier、inference_geo——OpenAI 均无
- 思考:Anthropic thinking block 一等公民(含 signature 防篡改,多轮同模型须原样回传;Fable5/Opus4.8 默认 display:'omitted' 空文本);OpenAI Chat Completions 完全不透出推理内容(无 reasoning_content),只报 completion_tokens_details.reasoning_tokens,加密推理项仅 Responses API 有
- OpenAI 兼容上游 reasoning 方言:DeepSeek delta.reasoning_content+thinking:{type}(常规多轮不回传);Qwen DashScope enable_thinking(extra_body,非流式必须 false 否则报错);GLM thinking:{type}+clear_thinking:false 跨轮保留需回放历史 reasoning_content;Kimi 多轮 tool_calls『必须』回传 assistant 的 reasoning_content 否则报错——三种回传规则互斥,不能一套逻辑通吃
- prompt cache:Anthropic 显式 cache_control(≤4断点,5m/1h TTL,写1.25×/2×读0.1×,最小前缀1024–4096 tokens)vs OpenAI 全自动(≥1024 tokens,读5折写免费,5–10分钟存活,prompt_cache_key 辅助路由,无保证)——翻译时 cache_control 必须静默剥除
- stop_reason 映射:end_turn→stop, tool_use→tool_calls, max_tokens→length, stop_sequence→stop(不可逆,OpenAI 不回显命中串), refusal≈content_filter(丢 stop_details);pause_turn 与 model_context_window_exceeded 在 OpenAI 侧无 finish_reason 对应(后者是 400 错误)
- 图片:Anthropic source.base64(media_type 独立字段)/url/file ↔ OpenAI image_url(data-URI 或 http, 带 detail 档位);PDF:Anthropic 原生 document block(base64/url/text/content+citations)vs OpenAI file content part(file_id 或 file_data,多数兼容上游不支持);两家 file_id 不互通
