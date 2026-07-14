# security — verdict: needs-fixes

## [major] 帧闸若沿用「校验后转发原始字节」可被混合帧绕过——必须重构帧下发
现状 hub.go:836-847 对 set_runtime_config 是 tierFromFrame 解析 + writeAgent(mt, data) 原样转发浏览器字节;agent ws.ts:83-88 对同一帧里的 modelId 和 tier **两个字段都吃**(modelId 无条件设 override,turnLoop.ts:58 override 优先于 tier)。方案 4.2-2 只写了「合法:落库+转发;tier 兼容期映射后按 modelId 同路处理」,未明确转发的是什么。若实现成「tier 合法→映射→转发原帧」,攻击帧 {type:set_runtime_config, tier:"main", modelId:"任意上游串"} 会以 tier 路径过闸、把未校验 modelId 带进 agent,目录/min_tier 全绕——正是要堵的洞换了个入口。另外 agent_models.model_id 校验若走 MySQL(utf8mb4 ci collation)则大小写变体串也能过闸,转发用户原始串导致上游收到非 canonical id。修正:闸通过后由 backend 重新 json.Marshal 白名单字段(仅 type + 目录 canonical model_id),绝不转发浏览器原始字节;兼容期 tier 映射走同一重构路径。

## [major] min_tier 懒清理不完备:sendInitialModel 未重校验 pinned_model,会员到期后贵模型永续可用;活连接 modelOverride 残留无任何回收机制
方案 4.2-1 写 effective = row.PinnedModel || Resolve(default),§7-1 懒清理只覆盖「目录下架(enabled=false)」,完全没提 min_tier×EffectiveTier 重校验。vip/service.go:91-105 EffectiveTier 到期即回落 free(无定时任务),若 sendInitialModel 不跑与帧闸同一套 ValidateUserModel,到期用户的 pinned_model=Max 专属模型会在每次重连被 backend 自己下发,专属门槛形同虚设(注:计费不受影响,agent 上报请求 model id、权重照扣,turnLoop.ts:230-237——这是访问控制洞非扣费洞)。且即便重连时校验,残留仍在:agent ws.ts:85 无清空分支(空 modelId 被忽略),backend 无法「清除」override 只能用另一个具体 modelId 覆盖;hub 有常开 tab 就无限存活(hubGracePeriod=3min 只管无人期,hub.go:480),到期/下架对活连接永不生效。修正:① sendInitialModel 复用 ValidateUserModel(含 min_tier),失败→清 pinned + 下发默认 modelId;② 在每条 user_message 前(可挂 PreUserMessage 同一跳,30s 缓存)重校验 pinned_model,失效即在活连接上主动补发 set_runtime_config{默认 modelId} + 清库;③ 目录下架时遍历 bridge.hubs 主动重发(hub 有 writeAgent,成本极低),不要只赌懒清理。

## [major] 兼容期 tier 映射与 ValidateUserModel(user_selectable)的交互未定义,两种自然实现一个拒掉存量客户端、一个开出 pin 非可选模型的旁路
方案 4.2-2 只说 tier「映射后按 modelId 同路处理」。若同路含 user_selectable 校验:system.fast / chat_default 绑定的模型很可能 user_selectable=false(它们是系统档,方案 3.1 默认 user_selectable=0),存量客户端(旧 web chunk、未更新小程序)发 tier 帧会被闸拒——兼容期反而全灭。若映射产物豁免校验:tier 帧就成了把非用户可选模型写进 pinned_model 的旁路(之后 sendInitialModel 会一直重发它),目录过滤口径被打穿。修正:映射产物**只转发、不落 pinned_model**(视为一次性系统默认下发),兼容期结束删分支。另一个存量兼容点:小程序现网每次 WS open 重发 wx.storage 里的 modelId(miniprogram/pages/claw/claw.ts:521-524),闸上线后若该 id 不在目录/被下架,error 帧会被 fold 成错误气泡(services/agent-socket.ts:178-189「其它 error 落进 messages」)——model_not_allowed 需要前端静默降级路径,否则存量小程序每次重连弹错。

## [minor] ws_serverside.go:57 注释「modelID 按 sessionId 持久」不实,改造时按它理解会把空 modelID 当「沿用会话当前模型」
override 实际是 per-WS-connection 状态(agent ws.ts:33 ws.data.modelOverride),而 serverSideChatStreamingVia 每次调用新开一条 WS(ws_serverside.go:119),modelID="" 时不发帧(:155)→ 新连接 override=null、tier=main → 实际跑 resolveTier(main) 主模型,不是「会话当前/默认模型」。prism planner 传空跑主模型正是这个机制(方案自己也在 1.2 表里核对过)。P1 改造 5 个 peerreview 调用点 + planner 时,所有调用点必须显式传 Resolve(purpose) 值、不得依赖「空=沿用上次」;顺手修掉这条注释,避免后人再踩。

## [minor] admin「试连」探测:model_id 不得参与 URL 构造,且建议注意 backend 新增 egress 面
试连目标 = agent_config.base_url(admin 本就可配任意 URL,PushConfig 链路已存在同等 admin 能力,非新增 SSRF 主体)。真正要钉死的是:探测请求里目录 model_id 只能放 JSON body,绝不能拼进 URL path/query(如 GET {base}/models/{model_id} 形式),否则 model_id 里的 ../ 或 ?、# 可改写请求路径——目录 model_id 是 VARCHAR(200) 自由文本,建议同时在 CRUD 层加字符白名单([A-Za-z0-9._:\-/])。另注意 backend 在 scholar-network(可达 mysql/redis/minio),从 backend 直发探测是新增出网点;system-audit-v2 已记录过 backend egress SSRF 项。存疑点:试连未实现,以上是设计约束而非已存在缺陷,故标 minor。

## [minor] /user/models 信息面基本合适;两个收尾细节
只透 billing_weight 不透四类单价的取舍正确(×N 徽标必须有权重;Cursor 同款心智)。model_id 暴露上游真实模型名与现状一致(claw/handler.go:196-217 今天就原样透传 agent model id,非回归)。两个细节:① DTO 明确排除 notes 列(3.1 定义为内部备注,4.1 的字段列表没列它,实现时别顺手 marshal 整个 model struct);② billing_weight 若由「按价格换算」生成是 DECIMAL(8,4) 精度,4 位小数会精确泄露上游价格比例,用户面展示建议量化到 0.25/0.5 粒度(存储保留精度,DTO 出口取整)。

## [minor] 预算反折算(5.2-3)的多端竞态:盖章权重可能错一轮
多 tab 下每个 subscriber 有独立 readLoop goroutine(hub.go:815):tab A 的 user_message 盖章(读会话 effective model 权重)与 tab B 的 set_runtime_config(改 pinned_model)并发,盖章可能用旧模型权重,agent 侧 raw 自配速与实际扣减错位最多一轮;透支带(有界透支,max(15%,20万))本就兜这个量级,方案 10 风险表也认了「错位」。可接受,但实现时 hub 内存里维护 currentModel(写帧与盖章同走 h.mu)可顺手消掉,不必依赖 DB 回读。扣减侧无此问题:observer 按 agent 上报的请求 model id 查权重(turnLoop.ts:149/189/230-237 报的是请求 model 非上游回显),天然跟实际执行一致。

