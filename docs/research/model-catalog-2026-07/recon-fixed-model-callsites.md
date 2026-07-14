## summary
全仓共 13 个内部 AI 能力调用点,分布在 3 条物理路径上,模型来源分属两套并行体系。

【路径一:agent WS serverside(backend 拨 agent WS,per-round 用 set_runtime_config{modelId} 切具体模型)】模型来源 = `agent_config` 单行表 4 槽位(main/haiku/sonnet/opus_model,backend/internal/agentconfig/model.go:33-36),经 backend/internal/agentbridge/ws_serverside.go:155-160 注入。消费者全在 peerreview 与 prism:
1) 审稿「预填写自动识别」= runMetaExtract(backend/internal/peerreview/service.go:1258,调用点 :1326)——上传稿件后自动抽标题/摘要/关键词/学科/稿件类型;prompt 让 agent 在会话 cwd 用 pdftotext 只取前 2 页转文本再输出严格 JSON;模型 = s.fastModel() = agent_config.haiku_model(service.go:152-162)。它走 agent serverside,不走 internal/ai。要求:便宜快 + 会用命令行工具 + JSON 可靠。
2) Cover letter/审稿信起草 runLetterDraft(service.go:1376,调用点 :1424-1428)= fastModel(haiku 槽)。
3) 方法论+审稿人选择 runMethodologyPhase(service.go:572,调用点 :606-610)= s.mainModel() = agent_config.main_model(throwaway 会话,读全文+末尾 JSON,强推理)。
4) 三位审稿人盲评打分(service.go:1687)= mainModel,chatWithRetry 有界 JSON 重试(:1767)。
5) 主审裁决 chief(service.go:1720)= mainModel。
6) prism 写作画像 planner PlanWritingProfile(backend/internal/prism/planner.go:91,调用点 :117-118)——modelID 传 ""(不切),serverside 会话无 initial tier → 落到 executor 默认 tier=main(agent/src/index.ts:41);本质是便宜的一次性选择任务,当前却跑主模型。

【路径二:agent 容器内 out-of-band fastCompletion(executor 直接 client.messages.create,模型 = resolveTier("haiku")‖main,agent/src/turn/completion.ts:14)】槽位由 backend 把 agent_config 推到 agent /api/providers(backend/internal/agent/client.go:948-951):
7) 会话标题生成 generateTitle(agent/src/turn/title.ts:11,触发 agent/src/server/ws.ts:257-269 首轮完成后)——覆盖 smart_search/claw 会话标题,prism 项目名也走同一条(session_title_updated → prism.handleAgentTitle,backend/internal/prism/autoname.go:33;spec.go:159)。计费帧 kind=title_gen 正常计费(agentbridge/ws.go:573-579)。注意:前端 prism 发的 titleSeed 字段在 agent/src 里无消费者(标题输入仍是首轮 user_message content)。
8) 记忆抽取 extract_memory 帧(agent/src/server/ws.ts:124-143 → fastCompletion haiku)——prompt 由 backend 单一真源组装(backend/internal/usermemory/service.go:105 BuildExtractionPrompt,90s 冷却 :21);触发两处:交互 feature 每轮 message_complete 后(agentbridge/hub.go:688-699)、peerreview serverside 轮后(peerreview/service.go:1738-1746 → agentbridge/ws_serverside.go:385)。计费 kind=memory_extract → Feature=memory + SkipQuota(不扣用户日额度)。

【路径三:project 直连 internal/ai(OpenAI 兼容 /v1/chat/completions,backend/internal/ai/upstream.go:82)】模型来源 = `third_party_accounts` 表 AI 账户 config JSON 的 model_low/model_mid/model_high(backend/internal/thirdparty/model.go:145-170),多账户随机轮换 + 失败换账户重试(ai/service.go:177 executeWithRetry):
9) 论文翻译 StreamTranslatePaperToChinese(ai/service_translate.go:22-41,固定 ModelLevelLow;路由 cmd/server/routes_scholar.go:94)。
10) 矩阵分析 BatchAnalyzePapers → AnalyzePaperAbstract → analyzeWithRetry(ai/handler.go:91、service_analysis.go:145,固定 ModelLevelLow;结果缓存 paper_analysis 表;路由 routes_scholar.go:40)。
11) prism 快通道评议 InlineReview explain/critique/reviewer(backend/internal/prism/inline_review.go:49,经 bootstrap.go:525 注入 ai.Service.ReviewText = service_analysis.go:381-386 ModelLevelLow)。
12) 公众号自动回复 GetAIReply/GetAIReplyWithImage(backend/internal/wechatofficial/service.go:196-285)——档位来自 wechat_official_config.ai_model_level(low/medium/high,model.go:26),service.go:219-229 映射到 ModelLevelLow/Mid/High → 账户的 model_low/mid/high;支持图片多模态;user_id=NULL 记账。

【交互会话的模型路由现状(重构强相关背景)】FeatureSpec.DefaultTier(agentbridge/spec.go:206):smartsearch=haiku(smartsearch/spec.go:145)、claw=main(claw/spec.go:162)、prism=main(prism/spec.go:148);用户显式选档 → agent_sessions.pinned_tier(migration 0052,agentbridge/repository.go:62-64/:167),hub 建连时发 set_runtime_config{tier}(hub.go:277-296),浏览器切档持久化在 hub.go:837-841。executor 侧 tier 与 modelOverride 双通道(agent/src/server/ws.ts:84-87),turn 模型 = modelOverride || resolveTier(tier)(turnLoop.ts:58)。

【已下线,勿据此设计】library 上传 PDF 的 AI 兜底识别已下线(library/handler_upload_resolve.go:259),现在纯 pdfparse+三源在线搜索,零 LLM;旧 backend 侧起名/记忆抽取的 ai.SimpleCompletion 已删除(ai/service_llm.go:69 注释)。所有路径的用量都汇入 llm_token_usage 账本(llmusage/model.go,SourceProject/SourceAgent 区分)。

## keyFacts
- peerreview『预填写自动识别』= runMetaExtract:backend/internal/peerreview/service.go:1258(函数)、:1326(LLM 调用,模型=s.fastModel());走 agent WS serverside(feature.ServerSideChatStreaming→set_runtime_config{modelId}),不走 internal/ai;prompt 强制 pdftotext -l 2 只取前 2 页 + 严格 JSON 输出(:1288-1305)
- peerreview fastModel()=agent_config.haiku_model(service.go:152-162);mainModel()=agent_config.main_model(:164-175);meta/letter 切 haiku 后 review 必须显式切回 main(同一会话按轮切模型,:164-165 注释)
- peerreview 各阶段模型:letter 起草 :1424-1428=fastModel;方法论+审稿人选择 :606-610=mainModel(throwaway 会话 :584);3 审稿人打分 :1687=mainModel;chief 裁决 :1720=mainModel;JSON 有界重试封装 chatWithRetry :1767
- serverside 模型注入机制:backend/internal/agentbridge/ws_serverside.go:57/:155-160 —— modelID 非空时先发 set_runtime_config{modelId} 帧再发 user_message;peerreview 发具体 modelId,浏览器发 tier,executor 两者都认(agent/src/server/ws.ts:84-87)
- agent out-of-band 统一走 fastCompletion:agent/src/turn/completion.ts:9-14,model=resolveTier("haiku")||resolveTier("main"),直接 Anthropic SDK client.messages.create;resolveTier 映射 agent/src/config/models.ts:9-13,槽位由 backend 推送(backend/internal/agent/client.go:948-951→/api/providers)
- 会话标题生成:agent/src/turn/title.ts:11 generateTitle,触发 agent/src/server/ws.ts:257-269(首轮完成后);计费帧 token_usage{kind:title_gen} 正常计费扣额度(backend/internal/agentbridge/ws.go:573-579);prism 项目名走同一条(session_title_updated→backend/internal/prism/autoname.go:33 handleAgentTitle,spec.go:159 OnTitleResult);前端发的 titleSeed 在 agent/src 无消费者(疑似死字段)
- 记忆抽取:agent/src/server/ws.ts:124-143 extract_memory 帧→fastCompletion(haiku);prompt 由 backend 组装(backend/internal/usermemory/service.go:105 BuildExtractionPrompt,90s 冷却 :21);触发点①agentbridge/hub.go:688-699(交互轮 message_complete 后)②peerreview/service.go:1738-1746+agentbridge/ws_serverside.go:385(serverside);kind=memory_extract→Feature=memory+SkipQuota 不扣用户额度(ws.go:579)
- prism planner:backend/internal/prism/planner.go:91 PlanWritingProfile,LLM 调用 :117-118 modelID 传 ""(不切模型)→executor 默认 tier=main(agent/src/index.ts:41)——便宜任务跑主模型,降档候选
- prism 快通道评议 InlineReview:backend/internal/prism/inline_review.go:49,经 cmd/server/bootstrap.go:525 注入 ai.Service.ReviewText(ai/service_analysis.go:381-386),固定 ModelLevelLow,project 直连
- 论文翻译:backend/internal/ai/service_translate.go:22-41 固定 ModelLevelLow,SSE 流式;路由 cmd/server/routes_scholar.go:94 POST /translate/paper/stream
- 矩阵分析:backend/internal/ai/handler.go:91 BatchAnalyzePapers(路由 routes_scholar.go:40)→service_analysis.go:57 AnalyzePaperAbstract→:145 ChatCompletionWithTools(ModelLevelLow),结果按 dimensionHash 缓存 paper_analysis 表
- 公众号自动回复:backend/internal/wechatofficial/service.go:196-285,档位来自 wechat_official_config.ai_model_level(low/medium/high,model.go:26),:219-229 映射 thirdparty.ModelLevelLow/Mid/High;user_id=NULL 记账;触发 wechatofficial/handler.go:200/:240(webhook)
- project 直连路径模型真源:third_party_accounts 表 AI 账户 config 的 model_low/model_mid/model_high(backend/internal/thirdparty/model.go:145-170),GetRandomAIModelConfigByLevel 随机轮换(thirdparty/service.go:502)+executeWithRetry 换账户重试(ai/service.go:177)——同一能力跨请求可能换 provider/模型
- agent_config 单行表=agent 侧模型真源:base_url/api_key+main/haiku/sonnet/opus 四槽位(backend/internal/agentconfig/model.go:29-43),admin 改后异步 push,push_status 反映结果
- 交互会话模型路由(方案A)已存在:FeatureSpec.DefaultTier(agentbridge/spec.go:206;smartsearch=haiku spec.go:145、claw=main claw/spec.go:162、prism=main prism/spec.go:148)+用户显式选档持久化 agent_sessions.pinned_tier(migration 0052;agentbridge/repository.go:62-67、SetPinnedTier :167;hub.go:277-296 sendInitialTier、:837-841 持久化)
- executor turn 模型解析:agent/src/turn/turnLoop.ts:58 model=modelOverride||resolveTier(tier);WS 连接默认 tier=main(agent/src/index.ts:41)
- 已下线勿列:library 上传 PDF 的 AI 兜底识别(backend/internal/library/handler_upload_resolve.go:259 注释『AI 兜底识别已下线——防止滥用大模型 token』,现纯 pdfparse 非 LLM);backend 侧 ai.SimpleCompletion 已删(ai/service_llm.go:69)
- 全路径记账汇 llm_token_usage(backend/internal/llmusage/model.go):SourceProject(translate/matrix/wechat_oa/prism-inline)vs SourceAgent(smart_search/claw/peer_review/memory);Feature=memory 带 SkipQuota

## designImplications
- 两套并行模型体系必须先统一或建立映射:agent 侧 4 槽位 tier(agent_config:main/haiku/sonnet/opus)与 project 直连侧 3 档 level(third_party_accounts:model_low/mid/high)。「模型目录」若只做一张表,需要同时喂这两条解析链,否则半个系统仍读旧槽位
- 「能力→模型绑定表」需要 3 种生效机制才能覆盖全部 13 个调用点:(a) serverside per-round modelId(peerreview chatWithRetry/ServerSideChatStreaming 的 model 参数,ws_serverside.go:155);(b) executor 内 fastCompletion 的 tier 解析(completion.ts:14,title_gen+memory_extract 两个能力共用,目前 hardcode haiku——要按能力区分需给 extract_memory/title 帧加 model 字段并改 executor);(c) internal/ai 的 ModelLevel→账户 model_low/mid/high 解析(translate/matrix/wechat_oa/prism-inline)
- 用户选模型绝不能外溢到内部能力:pinned_tier 只经 hub sendInitialTier 影响交互轮,serverside 与 fastCompletion 不读它(现状安全);但 executor ws.ts:84-87 同时认浏览器帧里的 modelId(modelOverride 优先于 tier,turnLoop.ts:58)——重构时必须确认/加固 backend hub 对浏览器 set_runtime_config{modelId} 的过滤(hub.go:850 已有 backend-only 帧闸,modelId 是否在闸内需显式验证),否则用户可绕过目录直选任意模型串
- peerreview 依赖「同一会话内按轮切模型」(meta 用 haiku→review 必须显式切回 main,service.go:164-165):若新设计把模型绑定做成 per-session 固定,会破坏这个共用会话省 token 的设计;绑定粒度必须支持 per-call(能力级),不能只有 per-session
- prism planner(PlanWritingProfile)当前传空 modelID 跑 executor 默认 main——目录化时应显式绑便宜档,这是现成的降本点;同理 smartsearch 交互默认档已是 haiku(spec.go:145),说明「feature 默认档」概念已有落点(FeatureSpec.DefaultTier),新的能力绑定表可扩展该机制而非另起炉灶
- 内部能力对模型的要求分两类,目录需要能力标签而非单纯价格档:①需要 tool-loop 的便宜模型(peerreview meta 抽取要在 agent 会话里跑 pdftotext;方法论轮要读全文)——绑定的便宜模型必须支持工具调用;②纯文本补全(title/memory/inline-review/translate/matrix/letter)——可绑最便宜档甚至独立 provider
- 7 天限额设计需决定内部能力的计费归属:现状 title_gen 正常计费扣用户额度、memory_extract 记账但 SkipQuota、peerreview 整场按次(free=1/天)+30M token 失控上限(PEERREVIEW_REVIEW_TOKEN_CAP)、prism-inline/planner 手动过 vip.CheckDailyQuota——若新限额按「用户所选模型」计,必须把这 13 个固定绑定能力的用量排除或单列,否则系统开销吃掉用户额度(usermemory SkipQuota 的设计动机已明确此坑)
- project 直连路径的「账户随机轮换+账户内 level 取模型」意味着同一能力的实际模型不稳定(跨请求换 provider):若目录要求「能力→确定模型」,需要反转 thirdparty 选择逻辑(先定模型再挑有该模型的账户),这是 internal/ai 的结构性改动
- wechat_oa 是无登录用户(user_id=NULL)+admin 配置档位(wechat_official_config.ai_model_level)的特例:能力绑定表 schema 需容纳「无用户、admin 可调档」的能力,不能假设每条绑定都挂在用户可见的目录项上
- titleSeed 是前端→agent 的死字段(prism 发了但 executor 不读,标题输入实为含系统前缀注入的首轮 user_message)——重构 title_gen 能力绑定时顺手接上或删除,避免新目录延续幻觉字段
- 模型配置推送链路有最终一致性窗口:agent_config 改后异步 push(push_status 反映结果),agent 重启后靠 backend 再推;能力绑定若也走 push 模式需复用该 push_status 观测面,或改为 agent 每次从 backend 拉取
