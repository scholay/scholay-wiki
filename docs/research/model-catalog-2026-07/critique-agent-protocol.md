# agent-protocol — verdict: needs-fixes

## [major] 多 tab 在线时模型变更无任何帧广播通道,方案未补
readLoop 的 set_runtime_config 分支只做「落库+转发上游」(backend/internal/agentbridge/hub.go:836-847),既不 echoToOthers 也不 broadcastAgent;executor 侧收到该帧后静默 return、不回任何 ack/事件(agent/src/server/ws.ts:83-89)。即 A tab 换模型后,B tab 的 WS 上不会出现任何帧。方案 4.4-4 只说「会话当前模型从 session detail/context DTO 读」——那是 HTTP fetch 时点值,B tab 不刷新永远陈旧;而方案同时删除了 localStorage 双键(现状下同浏览器多 tab 至少共享 localStorage 真源),净效果是多端一致性比现状更差:B tab 选择器显示旧模型,但发消息实际按 A 的 pin 计费(P3 后倍率徽标与实扣不符)。修正:hub 在校验通过后合成一帧 runtime_config_updated{modelId} 走现成的 broadcastAgent(hub.go:535-548,机制已存在,含 replayBuf),并把当前 effective model 加进 addSubscriber 的迟到补帧,顺带解决 hub 重建(3min grace/agent 重启)后 sendInitialModel 重发时前端无感知的问题。

## [major] 「切回默认/跟随默认」无表达:pinned_model 一旦写入永远无法解除
executor 的 modelOverride 只有赋值分支、无清空分支(agent/src/server/ws.ts:85:仅当 modelId 非空串才赋值,空串被忽略),方案对此的隐式解是「hub 永远下发具体 modelId,override 只被覆盖不需清空」——这对 executor 侧成立,但 backend 侧留下语义塌缩:用户选「默认」只能发默认模型的具体 id → SetPinnedModel 落库 → 此后 admin 改 chat_default.* 绑定对该会话永不生效,「从未选过(跟随默认)」与「显式选了恰好等于默认的模型」不可区分。现状 claw 恰恰有这个表达:选默认 = 清 localStorage 偏好(frontend-user/src/features/claw/api/session.ts:456-462 setClawSessionModel(sid,null) 删除键)+ 重连不重发 → 回落 tier;方案删掉整套 localStorage 旁路后该语义消失,§7.1 的懒清理只覆盖「模型被下架」不覆盖「用户想回默认」。修正:定义 unpin 语义(如 set_runtime_config{modelId:"",useDefault:true} → hub 清 pinned_model 并解析 chat_default 后下发具体 id;hub 反正是翻译咽喉,executor 零改动)。

## [major] P1 迁移只种子绑定表、未种子目录表,Resolve 终极回退未定义,照抄实施可致全 agent 功能停摆
§3.2 的 0063_defaults 只写了 agent_model_bindings「值从现 4 槽位迁移」,§3.1 的 agent_models 无任何种子语句;而 §3.2 的 Resolve 定义为「绑定→目录校验 enabled→返回」,绑定指向的 model_id 不在目录 → 回退 system.main —— 但 system.main 绑定指向的 id 同样不在目录,回退链终点返回什么方案未定义。若实现取严格语义(校验失败返回空),P1 上线瞬间 PushConfig 四槽全空 → executor normalizeModels 落空(agent/src/server/http.ts:284-289)→ resolveTier 返回 null(agent/src/config/models.ts:9-13)→ 每轮 turnLoop 报 no active provider/model(agent/src/turn/turnLoop.ts:59-62),smart_search/claw/prism/peerreview 全停,与「P1 无感、行为等价」的承诺直接冲突。修正:0063_defaults 增加 INSERT IGNORE INTO agent_models (model_id,display_name,...) SELECT main_model/haiku_model FROM agent_config WHERE 非空;并明确 Resolve 的终极回退(如最后兜底读 agent_config.main_model 列——该列方案本就保留)。

## [major] 目录 context_window 与 executor 全局 128k 硬编码脱节:异构上下文模型会撞墙或误报水位
方案 R4 把 context_window 定位为「仅展示/预警」(REPORT §3.1),但 executor 侧有两个消费点都吃单一全局 env EXECUTOR_CONTEXT_WINDOW=128000:① H5 长会话滑窗裁剪触发线(agent/src/server/ws.ts:23,218-228)——目录里一旦配入 64k 级小上下文模型,会话会在滑窗触发前先撞上游 context 墙,复现该注释自述的「报笼统 upstream failed 卡死」;反之 200k 大模型会被提前裁剪浪费能力;② inspection 的 maxTokens/percentage(agent/src/server/http.ts:262-272)→ GetContextEstimate 透传(backend/internal/agentbridge/http_handler.go:185-191)→ ContextMeter 水位条(shared/components/chat/ContextMeter.tsx)——N 模型目录下水位百分比对非 128k 模型全是错的。「模型不限槽位、后台随便配 N 个」正是引入异构上下文的场景,方案缺一条 context_window 下发通道(建议:hub 在 set_runtime_config 帧顺带 contextWindow 字段,executor 存到 ws.data/meta 供 H5 与 inspection 用)。

## [minor] 「下架=存量会话降级到默认”与懒清理机制不符:live hub 上的下架模型可无限期继续跑
REPORT §3.1 enabled 注释承诺「存量会话降级到默认」,§7.1 的机制却是 sendInitialModel 时懒清理——只在 hub 重建时生效。live hub 被订阅者保活(addSubscriber 取消 grace 计时器,hub.go:449-453),用户持续在线则 pinned 的下架模型无限期继续用(handleUserMessage 全程不校验模型,hub.go:885-1011)。另一个同族语义漂移:现状 admin 改槽位经 PushConfig→providerStore,live 会话下一轮即用新模型(resolveTier 每轮现读);改成 modelOverride 冻结具体 id 后,live/pinned 会话对 admin 换绑/换模型免疫直到 hub 重建——方案未声明此行为变化。建议在 handleUserMessage 加一次带 30s 缓存的 enabled 校验(成本一次 map 查),或明文接受该窗口。

## [minor] sendInitialModel 写失败无护栏,P3 后从「档位漂移」升级为「预算反折算用错 weight」
现 sendInitialTier 写失败仅 slog.Debug、无重试(hub.go:294-296),对比 seed_history 已做 3 次重试+fail-closed(hub.go:365-395)。丢帧后 executor 回落 tier=main(index.ts:41 默认)→ resolveTier=system.main。现状影响=smart_search 默认档静默升主档;方案 P3 后,hub 按「自认为的会话模型」的 billing_weight 反折算预算盖章(§5.2-3),与 executor 实跑模型错位——扣费本身仍按 agent 上报的真实 model 加权(llm_token_usage.model 来自 usage 帧)不受影响,但自配速与 UI 预期错位。建议初始模型帧比照 seed 做重试,终败时置标记在首条 user_message 前补发。

## [minor] SetPinnedModel 落库失败仍转发的顺序未定义:grace 重建后模型静默回退
现状 SetPinnedTier 失败仅 slog.Debug 且帧照转(hub.go:839-847):DB 写失败时 executor 已切模型、DB 未记,3min grace 后 hub 重建 sendInitialModel 按旧值重发,用户无感知地被切回。方案 4.2 只写「合法:落库+转发」,未定义落库失败分支。P3 后该窗口还叠加计费口径与 UI 徽标不一致。建议:落库失败 → 拒绝该帧并回 error(与 model_not_allowed 同通道),保证 pinned_model 与 executor override 强一致。

## [minor] system.fast 缺配/失效的回退是「静默升主档」,除日志外无可见面
Resolve 回退 system.main 只 slog.Warn(§3.2),PushConfig 会把 haiku 槽填成主模型 → 标题生成+记忆抽取(completion.ts:14 resolveTier('haiku'),自身还有 || resolveTier('main') 双保险)每次跑主模型,方向与现状 fastModel 空值回退一致(方案自称要「消灭该暗坑」),但 push_status 只反映推送成败、不反映回退,admin UI 无 surfacing,成本回归仅 docker logs 可见。建议绑定页对「purpose 处于回退态」做显式标红(数据现成:Resolve 时对比绑定值与实际返回值)。

## [minor] 小程序把 models[0] 当默认模型的假设与新目录 DTO 冲突
miniprogram/pages/claw/claw.ts:925、:942 以 S.models[0] 作「默认」项(现状 /user/claw/models 恒定 main 槽在首位,假设成立);新 /user/models 按 sort_order 排序且默认性由 is_default 字段表达(§4.1),首行不保证是默认 → 小程序「默认」入口可能指向错误模型。方案 §4.4-6 只写「小程序沿用发帧+同一列表」,未列此改造点。同理小程序 friendlyDesc 硬编码映射(claw.ts:933)也需随展示名后端化清理。

## [minor] ws_serverside.go 过期注释声称 override「按 sessionId 持久」,会误导 P2 实现者;另 ContextMeter 透传 raw model id 与展示名体系不一致
① ws_serverside.go:57-59 注释写「走 agent set_runtime_config 覆盖,按 sessionId 持久」并提及 waitForRuntimeTransition——与 executor 现实不符:modelOverride 是 per-WS-connection(ws.ts:33 WSData 字段,index.ts:41 每次 upgrade 重置),连接断即失效,executor 也无 waitForRuntimeTransition(那是旧 fork 的行为)。P2 实现者若信注释「发一次即持久」,重连后模型静默回退。存疑项:该注释可能是 fork 时代遗留,建议改代码注释而非协议。② ContextMeter tooltip 直显 est.Model 原始上游 id(http_handler.go:190 → ContextMeter.tsx:30),方案删 friendlyDesc、展示名后端下发只覆盖选择器,context DTO 未纳入映射,目录化后底部水位条与选择器显示两套名字(纯观感)。③ 顺带核实:shadowTurn(/api/turn)当前 backend 零调用方(grep 无 ShadowTurn 消费点),ShadowTurnRequest 只支持 tier 不支持 modelOverride(shadowTurn.ts:20-29),目录化后属休眠代码,无泄漏风险,cutover 时再补即可。

