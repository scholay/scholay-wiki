## summary
## Provider/模型配置与计费面侦察(per-model api_format + 多 provider 评估)

### 1. executor providerStore / apiFormat / activate / client 缓存

**apiFormat 是「存而不读」的死配置**。`agent/src/config/providerStore.ts:23` 定义 `apiFormat: string; // "anthropic"`,头注释(providerStore.ts:5)明说「apiFormat="anthropic" 是协议不变量(非厂商),authStrategy="auth_token" → Bearer」。全 executor 源码中 apiFormat 只有写入点:store 的 update patch(providerStore.ts:92)、HTTP POST/PUT 默认值(agent/src/server/http.ts:116,135)、conformance 常量(agent/src/harness/conformance.ts:28)——**没有任何运行时消费点**。真正的协议由代码写死:`agent/src/anthropic/client.ts:10,21` 恒用 `@anthropic-ai/sdk` 的 `new Anthropic({baseURL, authToken, apiKey})`;`agent/src/turn/turnLoop.ts:149` 用 `client.messages.stream`;`agent/src/turn/completion.ts:17-22` 用 `client.messages.create`。

**activate 全局唯一**:providerStore 内存态 `providers[] + activeId`(单个 string,providerStore.ts:32-33),`activateProvider`(providerStore.ts:100-105)整进程只能有一个 active;`getActive()`(providerStore.ts:69-72)被三处消费:tier 槽位解析 `resolveTier`(agent/src/config/models.ts:9-13)、`anthropicClientFromProvider`(client.ts:16)、`listModels`(models.ts:20)。轻量持久化到 `/home/bun/.executor/providers.json`(providerStore.ts:39-63),真源仍是 backend `agent_config` 表。

**client 缓存是单槽,keyed by (active.id, baseUrl, apiKey)**:client.ts:13 `let cached: { id, baseUrl, token, client } | null`,命中条件 client.ts:18(id+baseUrl+token 三元组全等才复用);provider 任意 CRUD/activate 都 `invalidateClient()`(http.ts:121,141,150)。即:一进程同一时刻只有一个上游 SDK client。

### 2. backend PushConfig 链

`backend/internal/agent/client.go:919-988 PushConfig`:GET /api/providers 列表 → 按名字找 `managedProviderName = "scholay-managed"`(client.go:33)→ 命中 PUT / 未命中 POST → POST /:id/activate。**APIFormat 与 AuthStrategy 是硬编码字面量**:更新路 client.go:961-962、创建路 client.go:974-975 恒为 `"anthropic"` / `"auth_token"`。4 槽位取自 `agentconfig.AgentConfig` 单行表(backend/internal/agentconfig/model.go:29-43:base_url/api_key/4 model 列,单行 = 单上游假设)。

**多 provider 现有能力**:executor 侧 API 本就支持多条(POST /api/providers 可建 N 条,http.ts:108;PUT per-id,http.ts:126)——但 **activate 只能一条**(全局 activeId),且 backend 只管理一条名为 scholay-managed 的 provider,永远 upsert+activate 同一条。推送编排在 `backend/internal/agentconfig/service.go:157-178 pushAndRecord`:effectiveConfig(service.go:79-98)用 modelcatalog.ResolveSlots(main/sonnet/opus=system.main,haiku=system.fast,backend/internal/modelcatalog/service.go:153-160)覆盖 4 槽位后推主 fork,再 best-effort 推 extraClients(executor,AddExtraAgentClient service.go:45-49);executor 周期自愈重推每 60s(backend/cmd/server/bootstrap.go:183-207,GetEffectiveConfig 口径)。push_status/last_pushed_at/push_error 写回单行(仅主 fork,extraClients 不写回)。

### 3. set_runtime_config 帧的 providerId:全链「发了但没人读」

- **executor 不解析**:`agent/src/server/ws.ts:87-96` case "set_runtime_config" 只读 `modelId` / `tier` / `contextWindow`,providerId 静默忽略。
- **前端一直在发(恒 null)**:prism `frontend-user/src/features/prism/hooks/usePrismChat.ts:491`、smart-search `features/search/components/smart-search/SmartSearchPanel.tsx:125`、claw `features/claw/pages/ClawPage.tsx:120` 与 `features/claw/api/socket.ts:48-55`、小程序 `miniprogram/pages/claw/claw.ts:524,947,953`;类型声明 `providerId: string | null` 见 prism ws-types.ts:20 / search smart-search.ts:41 / claw types.ts:79。
- **backend hub(P2 权威闸)重组后不带**:`backend/internal/agentbridge/hub.go:358-419 handleRuntimeConfigFrame` 的解析 struct 只有 ModelID/UseDefault/Tier(hub.go:365-369),浏览器带的 providerId 被丢弃;重组帧 `runtimeConfigFrame`(hub.go:284-292)只含 type/modelId/contextWindow。
- **serverside 显式发 nil**:`backend/internal/agentbridge/ws_serverside.go:155-164` `ProviderID *string json:"providerId"` 固定 nil。
- 协议注释也承认此形态:`backend/internal/agent/client.go:593`「实际切换通过 WS {type:"set_runtime_config", providerId:null, modelId:"..."}」。

结论:providerId 是**现成的空接缝**——全部发送方已带该字段,激活它只需 hub 白名单重组(hub.go:365-369 + 284-292)与 executor 解析(ws.ts:87-96)两点各加一个字段,不破任何老客户端。

### 4. modelcatalog:agent_models 现列与扩展点

表结构(`backend/internal/modelcatalog/model.go:61-85`;迁移 `docker/mysql/migrations/0063_model_catalog.sql`):model_id(全库唯一 uk)、display_name、description、**channel(varchar16, default 'agent',语义='agent | project(预留 internal/ai 轨,第一期只用 agent)'——是调用轨道维度,不是上游 provider 维度)**、context_window、max_output、四类单价 price_in/out/cache_r/cache_w(元/1M)、billing_weight(∈[0.05,100])、speed_class、user_selectable、min_tier、enabled、sort_order、notes。**没有 api_format / provider / base_url 列**。

若加 api_format/provider 维度要动:① 新迁移(0066+,幂等 CALL add_column);② model.go struct + `validateModel`(service.go:321-350,channel 兜底同款);③ **repository.go:44-66 UpdateModel 的显式 map 必须同步加列,否则新字段更新被静默丢弃**(map 写法为写零值而存在);④ admin handler(modelcatalog/handler.go)+ admin 前端目录页;⑤ 读侧接缝 `agentbridge.ModelCatalog` interface(backend/internal/agentbridge/bridge.go:100-112)若要 hub 下发 provider/格式需扩方法;⑥ hub 三个下发点 hub.go:331(sendInitialModel)/415(换模型)/447(revalidate 降级)与 runtimeConfigFrame(284);⑦ serverside ws_serverside.go:155-164;⑧ PushConfig 槽位模型(见下)。

**peerreview serverside per-round modelId 与格式的关系**:`backend/internal/peerreview/service.go:157-166 modelFor(purpose)` = `models.Resolve(purpose)`(五个 peerreview.* purpose,modelcatalog/model.go:29-33),经 `ServerSideChatStreaming(..., modelID)`(ws_serverside.go:57-88)按轮在专属 WS 连接上发 set_runtime_config;executor 侧 `modelOverride` 是 per-connection 内存态、优先于 tier(agent/src/server/ws.ts:33、agent/src/turn/types.ts:17、turnLoop.ts:58)。**关键约束:切的只是 model 字符串,请求仍打到全局唯一 active provider 的 baseURL** ——今天 per-round 模型必须能在同一上游端点路由;跨 provider 的 per-round 切换在现架构不可能。

### 5. 计费归一:4 类 token 的来源与 OpenAI usage 映射缺口

**来源(agent 帧)**:executor `turnLoop.ts:230-238 normUsage` 从 Anthropic SDK Usage 映射:`input_tokens`(**不含缓存项**)、`output_tokens`、`cache_read_input_tokens→cache_read_tokens`、`cache_creation_input_tokens→cache_creation_tokens`,并 per-call 盖 model 字符串(turnLoop.ts:189 逐 LLM call push);message_complete 带 `usage=sumUsage(calls)+calls[]`(turnLoop.ts:106);ws.ts:180-194 补 `session_total`(会话累计)与 meta.lastUsage。带外调用(标题/记忆)`completion.ts:28-35` 同款映射经 token_usage 帧(ws.ts:143,272)。

**Go 侧消费**:`agentbridge.AgentUsage`(backend/internal/agentbridge/spec.go:42-48,4 类+Model);extractMessageComplete(ws.go:536-550);hub message_complete case(hub.go:803-844)→ `accrueTurnUsage` 水位去重(bridge.go:199-261:per-session 4 分量单调水位,分量回退=CLI 重启归零,补差行按 sessionModel 计价 bridge.go:234-240)→ `recordAgentTokens`(hooks.go:63-79,**Provider 硬编码 "scholay-managed"**,ws.go:584 同)→ `llmusage.Record`(backend/internal/llmusage/service.go:81-139)。

**Pricer(P3)的字段假设**:① `Record` 的 TotalTokens 兜底 = **四项直加**(service.go:93-95),注释明写依赖 Anthropic 语义「input 不含缓存项,缓存 token 单列上报,故四项相加不重复」;② `PriceUsage(model, in, out, cacheR, cacheW)`(modelcatalog/service.go:201-222)假设 4 类互斥且各有独立单价(含 price_cache_w),weighted = 4 类总量×billing_weight,cost=Σ 类×单价(微元);③ 计价 key 只有 model 字符串(agent_models.model_id 全库唯一),无 provider 维度。

**OpenAI usage 映射缺口**:OpenAI chat/completions 的 `prompt_tokens` **包含** `prompt_tokens_details.cached_tokens`(Responses API 的 input_tokens 同理包含 input_tokens_details.cached_tokens),且**无 cache_creation 对应物**(缓存写不单独计费)。若朴素映射 input=prompt_tokens 且 cache_read=cached_tokens,会在以下每一点双计:llmusage 四项和(service.go:94)、PriceUsage 成本(service.go:219-220)、executor 单轮预算 raw 口径(turnLoop.ts:119-121 MAX_TURN_TOKENS 闸、133-135 wind-down)、session_total 水位。正确映射应为 `input = prompt_tokens − cached_tokens; cache_read = cached_tokens; cache_creation = 0; output = completion_tokens`,并把转换收口在 executor 的 normUsage/fastCompletion 两个咽喉(保持中性 4 类线协议不变,Go 侧 AgentUsage/accrue/Pricer 零改动);price_cache_w 对 OpenAI 模型置 0,price_cache_r 填折扣输入价。

### 6. 上下文水位的 usage 字段假设

- `EXECUTOR_CONTEXT_WINDOW` 全局默认(ws.ts:23);`ws.data.contextWindow` 仅由 set_runtime_config 帧写入(ws.ts:93-95),hub 从目录附带下发(hub.go:284-292 + cat.ContextWindow,bridge.go:108-109,catalog 实现 modelcatalog/service.go:173-178)。
- **H5 滑窗触发信号 = lastUsage.input_tokens + output_tokens**(ws.ts:226-229,meta.lastUsage 只存 input/output/model,ws.ts:193)——假设 input_tokens ≈ 全量上下文。在 Anthropic 4 类互斥语义下,若上游自动缓存(如 DeepSeek anthropic-compat)把大头挪进 cache_read,该信号会**低估**水位、滑窗晚触发;换 OpenAI 格式若按「input=prompt−cached」的计费正确映射,同样低估——「计费互斥」与「水位完整」对 input 字段的语义诉求相互矛盾,需在 executor 侧一次性定准(水位应改用 input+cache_read+cache_creation+output)。
- **inspection 水位端点不认 per-model 窗口**:`agent/src/server/http.ts:262-272` totalTokens=input+output、maxTokens=**全局 env**(HTTP 拿不到 per-WS 的 ws.data.contextWindow,per-model 窗口只影响 H5 裁剪不影响水位 UI)。另发现形态错位:executor 返回扁平 JSON,而 backend `GetSessionContextEstimate`(backend/internal/agent/client.go:764-791)解析 `{contextEstimate:{...}}` 包裹(fork 形态)——executor 路由的 feature 水位会解析成 nil。

### Per-model 格式选择要动的全清单(配置/推送/帧/计费)

**配置**:agent_models 加 provider/api_format 列(迁移 0066+;model.go:61-85;validateModel service.go:321-350;**repository.go:44-66 map 加列**;admin 页)· providerStore.ts:17-27(apiFormat 从死数据变活;activeId 语义拆解)· models.ts:9-13 resolveTier(去 getActive 单点)。
**推送**:client.go:919-988 PushConfig 从「单 scholay-managed+4 槽」改为「同步 N providers」(executor API 已支持多条,仅 activate 单一需改语义)· client.go:961-975 两处硬编码 "anthropic"/"auth_token" 参数化 · agentconfig/service.go:79-98 effectiveConfig 与 model.go 单行表(多上游需新表或列)· bootstrap.go:183-207 executor 周期重推口径。
**帧**:hub.go:365-369 解析白名单 + 284-292 重组帧加 providerId/契约字段 · hub.go:331/415/447 三个下发点 · ws_serverside.go:155-164 per-round 填真 provider · agent ws.ts:87-96 解析 · 前端/小程序发送方已带 providerId:null 无需动。
**执行**:anthropic/client.ts:13-24 单槽缓存 → per-provider map;client 工厂按 api_format 分支(OpenAI 适配器要重写 turnLoop.ts:149 流式事件消费与工具装配,这是最大工作量,不在配置面)· completion.ts:17 带外调用同分支。
**计费**:executor normUsage(turnLoop.ts:230-238)/fastCompletion(completion.ts:28-35)做 OpenAI→4 类归一(input 减 cached,cache_creation=0)· hooks.go:71 与 ws.go:584 的 Provider="scholay-managed" 硬编码改为真实 provider 归属 · PriceUsage 仍按 model 字符串 key(model_id 全库唯一,跨 provider 同名模型需复合键或命名约定)· 预算/水位口径(turnLoop.ts:119,133;ws.ts:226;http.ts:264)与 4 类语义一并定准。

## designImplications
- 最大工作量不在配置面而在 executor 执行面:激活 apiFormat 需要 client 工厂按格式分支 + OpenAI 流式/工具调用/thinking 事件适配层(turnLoop.ts:149 的 messages.stream 事件消费与 assembleToolUse 全按 Anthropic 事件形态写死);建议先把 apiFormat 从死数据变为 client.ts 工厂的分支输入,配置/推送面改动很小
- 打破「全局唯一 active provider」是核心:per-model provider 需要 model→provider 解析(推荐 backend 目录侧解析后随 set_runtime_config 下发 providerId,executor 按帧切换,而非 executor 自持路由表),SDK client 缓存从单槽(client.ts:13)改 per-provider map;resolveTier/listModels 的 getActive 依赖需保留为「默认 provider」语义兜底
- providerId 帧字段是零成本迁移接缝:所有发送方(web 三 feature+小程序+serverside)已带该字段且值恒 null、所有接收方忽略——只需 hub 白名单重组(hub.go:365-369/284-292)与 executor 解析(ws.ts:87-96)各加一字段即可激活,老客户端天然兼容;但必须坚持 hub 权威重组原则(浏览器 providerId 只能作为意图、经目录校验后由 backend 填 canonical 值)
- 推送模型建议从「单行 agent_config + 4 槽位」演进为「providers 表(或 agent_models 挂 provider 外键)+ PushConfig 同步 N 条」:executor /api/providers 已支持多条与 per-id PUT,唯一要改的是 activate 语义(从全局切活改为默认 provider);push_status 单行字段族(agentconfig/model.go:38-40)需变 per-provider 状态,admin 展示同步改
- 计费归一务必收口在 executor 咽喉(normUsage/fastCompletion),保持中性 4 类线协议不变:input=prompt−cached、cache_creation=0、price_cache_w 置 0,则 Go 侧 AgentUsage/accrueTurnUsage/Pricer/vip 加权链零改动;切勿在 Go 侧按 provider 分支重算(会与 executor 单轮预算 raw 口径、session_total 水位口径漂移)
- 记账 Provider 硬编码 scholay-managed(hooks.go:71、ws.go:584)应改为随帧携带真实 provider(CallUsage 加 provider 字段与 model 同路下传),否则多 provider 后 llm_token_usage 的成本归属/单价核对失明;同时评估 agent_models.model_id 全库唯一键在跨 provider 同名模型(如两家都叫 gpt-5.2)下的冲突——需复合唯一(provider, model_id)或强制目录内 id 带前缀
- 上下文水位与预算的字段语义要与计费映射一次性定准:『计费互斥 4 类』与『水位需要全量 prompt』对 input 字段诉求矛盾——建议水位/滑窗触发改用 4 类合计(ws.ts:226 与 http.ts:264 两处),预算 raw 口径(turnLoop.ts:119/133)本就是 4 类合计无需动;顺带修 inspection 端点不认 per-model contextWindow 及 executor/backend 的 contextEstimate 包裹形态错位(client.go:764-791)
- per-round 跨 provider 切换(peerreview 场景)依赖上面全部就位:ws_serverside.go:155-164 的 ProviderID 从 nil 改为按 purpose 绑定的 provider 填值,且 executor 的 modelOverride 需升级为 (provider, model) 二元组;在此之前 per-model api_format 只能约束「同一上游端点内的格式差异」,不能实现真正多厂商并存

## keyFacts
- executor 的 ProviderConfig.apiFormat(agent/src/config/providerStore.ts:23)是存而不读的死配置:全源码无运行时消费点,协议由 @anthropic-ai/sdk 硬编码(agent/src/anthropic/client.ts:21、turn/turnLoop.ts:149、turn/completion.ts:17)
- provider activate 全局唯一:providerStore.ts:32-33 单 activeId,getActive() 三消费点(models.ts:10 resolveTier / client.ts:16 / models.ts:20);SDK client 单槽缓存 keyed by (active.id, baseUrl, apiKey)(client.ts:13,18),任意 provider 变更 invalidateClient(http.ts:121,141,150)
- backend PushConfig(internal/agent/client.go:919-988)只管理一条 name=scholay-managed 的 provider,APIFormat/AuthStrategy 在 client.go:961-962/974-975 硬编码 "anthropic"/"auth_token";executor API 本就支持多条 provider(POST /api/providers)但 activate 单一、backend 从不建第二条
- set_runtime_config 的 providerId 是全链空接缝:前端/小程序恒发 providerId:null(usePrismChat.ts:491、SmartSearchPanel.tsx:125、ClawPage.tsx:120、claw/api/socket.ts:50、miniprogram claw.ts:524/947/953),backend hub 重组帧不带(hub.go:365-369 解析白名单无此字段,284-292 重组只含 type/modelId/contextWindow),serverside 显式 nil(ws_serverside.go:158-160),executor ws.ts:87-96 不解析
- agent_models 无 provider/api_format 列(model.go:61-85,迁移 0063);channel 列语义='agent|project 调用轨道'(预留 internal/ai 轨)而非上游 provider;加列必须同步改 repository.go:44-66 的显式 Updates map 否则静默丢字段;model_id 有全库唯一键(跨 provider 同名模型需复合键)
- peerreview per-round 模型:service.go:157-166 modelFor(purpose)→ServerSideChatStreaming 的 modelID→per-connection set_runtime_config(executor modelOverride 优先于 tier,ws.ts:33、types.ts:17);但请求仍打全局唯一 active provider 的 baseURL,跨 provider per-round 切换现架构不可能
- 计费 4 类 token 源头是 executor normUsage(turnLoop.ts:230-238)按 Anthropic 语义映射(input 不含缓存,cache_read/creation 单列),llmusage.Record 四项直加(service.go:93-95 注释明写依赖互斥性),PriceUsage 假设 4 类各有独立单价含 cache_w(modelcatalog/service.go:201-222),计价 key 仅 model 字符串
- OpenAI usage 映射缺口:prompt_tokens 包含 cached_tokens、无 cache_creation 概念——朴素映射会在 llmusage 四项和、PriceUsage、executor 单轮预算(turnLoop.ts:119/133)、session_total 水位四处双计;正确映射 input=prompt−cached、cache_read=cached、cache_creation=0,转换应收口在 executor normUsage/fastCompletion 保持中性线协议
- 水位假设:H5 滑窗触发信号=lastUsage.input+output(ws.ts:226),缓存活跃时低估上下文;inspection 端点(http.ts:262-272)maxTokens 用全局 env 不认 per-model contextWindow(HTTP 拿不到 per-WS 态);且 executor inspection 返回扁平 JSON 而 backend GetSessionContextEstimate(client.go:764-791)解析 {contextEstimate:{...}} 包裹——executor 路由 feature 的水位会解析成 nil
- agent 侧记账 Provider 硬编码 "scholay-managed"(hooks.go:71、ws.go:584),多 provider 后成本归属失明;accrueTurnUsage 水位是 per-session 4 分量原始计数(bridge.go:199-261),补差行按单一 sessionModel 计价(234-240),per-round 多模型已是近似、多 provider 会加剧补差行计价含糊
