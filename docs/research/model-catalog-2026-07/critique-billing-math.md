# billing-math — verdict: needs-fixes

## [major] 加权/成本计算放 observer 闭包,与 SkipQuota / UserID=NULL 门冲突 → 这两类行的 cost_micro_yuan 永远是 0,违背方案自身承诺
方案 5.2-2 把「查 catalog → 算 weighted+cost → 写回 u → vip.AddUsage」全部放进 bootstrap 的 observer 闭包(bootstrap.go:389-391 现址)。但 Record 调 observer 有三重门:`s.observer != nil && u.UserID != nil && u.TotalTokens > 0 && !u.SkipQuota`(llmusage/service.go:91-93)。于是:(a) 记忆抽取(SkipQuota=true,agentbridge/ws.go:579-592)、(b) wechat_oa 匿名行(UserID=nil)根本不进 observer → weighted/cost 从未被计算,落库恒 0 —— 与方案 5.2-2 明文的「SkipQuota 语义不变:记账本、**算成本**、不扣额度」直接矛盾,admin 成本看板(4.5)恰好对最需要核账的系统开销调用失明。修正:成本/加权计算不能挂在 observer 上,应给 llmusage.Service 注入独立的 Pricer(在 Record 内、observer 门之前统一算,写进 row),observer 只保留 AddUsage(weighted) 一件事。顺带:catalog 查询 miss 时的 DB 回源发生在 internal/ai 的同步请求路径里(service.go:211 → Record → observer 同步链),30s 缓存命中时无碍,建议 miss 也只走缓存兜底不打 DB。

## [major] 水位 process-local 而 agent session_total 跨 backend 重启存活 → 每次 backend 发版,活跃会话整段历史被当增量重复扣额度;方案在此地基上叠加加权却未加固
tokenWatermarks 是 Bridge 结构体上的进程内 sync.Map(agentbridge/bridge.go:65-71,无任何持久化/回填,grep 全包无 seed 逻辑);而 agent 侧 session_total 来自进程级 session meta 的 cumUsage 累计(agent/src/server/ws.ts:182-184,meta 由 getOrCreateEphemeral 按 sessionId 常驻 agent 进程,sessions.ts:123),**跨 backend 重启不清零**(两容器独立)。backend 重启后 wm=[0,0,0,0],下一个 message_complete 的 delta = 会话开天辟地以来全部累计(accrueTurnUsage 的回退保护只认 cur<wm,bridge.go:161-163,此处不触发),残差全部落成 "(reconciled)" 行再次 AddUsage —— 存量 bug:配额被重复扣一整段;P3 之后这段巨额残差还按 weight=1 计,账本/看板成本同时失真。方案完全未提。修正建议:P3 前置把水位持久化(如 message_complete 后异步写 agent_sessions 一列)或启动/首帧时从 llm_token_usage 按 request_id=sessionID SUM 回填水位。

## [major] 补差行 weight=1 兜底可被系统性利用:中断连接把贵模型整轮转成 weight=1;且方案的『顺手改』只覆盖 len(rows)==0 分支,serverside 残差也无 model
现代码 bridge.go:185-188:残差行 model 默认 "(reconciled)",仅当 `len(rows)==0 && turnUsage.Model!=""` 才填模型 —— **只要本轮有任一条 per-call 明细,残差恒为 "(reconciled)"**。message_complete 是唯一携带 calls 的帧(ws.go:536-550),用户在贵模型(×3)出答案期间主动断开 WS(hub↔agent pipe 随 hub 关闭,message_complete 丢失),重连后下一轮 delta 吞掉上一整轮 → 全部进补差行 → P3 按目录 miss weight=1 扣。这是可重复操作的**降价通道**,直接对冲 min_tier/倍率两套抓手。serverside 同病:chatUsageToAgentUsage 明文 model 留空(ws_serverside.go:301-313),peerreview(绑主模型,最贵)的补差行永远无主。方案 5.2-2 只说 serverside 补差行『顺手改』填会话 model —— 必须升级为 P3 的硬性前置项,并且:accrueTurnUsage 需新增 sessionModel 参数(hub 从 pinned_model 传入、serverside 从注入的 modelID 传入),对 len(rows)>0 的残差分支同样生效;注意跨模型切换时残差归属仍可能错(上轮 A 模型的丢失量记到本轮 B 模型),量级有界可接受但应写明。

## [major] 预算反折算除以 billing_weight 无下限保护(weight=0 除零/无穷预算);计价查目录若过滤 enabled,懒清理窗口内在跑会话按 weight=1 少扣
两个方案未覆盖的口径洞:(1) agent_models.billing_weight DECIMAL(8,4) 无 CHECK(方案 3.1),且『按价格自动换算』对 price=0 的免费/促销模型算出 weight=0;5.2-3 的盖章反折算 `RemainingBudget()/weight`(现盖章点 hub.go:995-999 + agent 消费点 turnLoop.ts:132-144)遇 0 即除零或折算出无穷 raw 预算 → agent 永不收尾;扣减侧 raw×0=0 则该模型完全免费且不受 7 天窗任何约束。必须 clamp(如扣减侧 weight≥0 但盖章侧 weight<某 ε 时视为 unlimited 或取 ε)。(2) 方案 7.1 是懒清理:目录停用模型后,已连接会话的 modelOverride 在 agent ws.data 里继续生效直到重连;若 P3 的计价查询走 List(onlyEnabled) 类缓存(4.1 未区分),停用瞬间起所有在跑会话变成目录 miss → weight=1 少扣。计价路径必须用『含停用行』的 Get(modelID),enabled 只约束选择器与 hub 闸。反折算数学本身核过无误:agent 侧 rawSpent 为 4 类全额合计(turnLoop.ts:119-121,133-136)、后端扣减为同口径 raw×weight,除以同一 weight 后两侧一致;负余量除法保号也成立。

## [minor] 『按价格一键换算』公式 (price_in+price_out)/2 忽略真实 token 结构,可能反转模型贵贱排序
方案 3.1:weight = (price_in+price_out)/2 ÷ 基准价。真实负载中 input+cache 占 ~90%+、output 占比小但单价通常是 input 的 4-5×,简单算术平均系统性高估高 output 价模型。反例:模型 A(in=1,out=5) avg=3,模型 B(in=2,out=2) avg=2 → A 权重是 B 的 1.5×;但按 90/10 mix 真实每 token 成本 A=1.4 < B=2.0,排序反转 —— 『一键换算』会把实际更便宜的模型标成更贵。weight 可手调不算 blocker,但换算按钮是 admin 的默认动作,建议改成按典型 mix 的混合价(如 0.8×in + 0.2×out,或带 cache 假设的 blended cost/1M),锚点同样进 billing_config。

## [minor] 盖章用的『会话 effective model』需每条 user_message 现读,多端并发换模型有一轮内的口径漂移(有界,自愈)
5.2-3 说『会话模型 hub 恰好知道』但未定读取时点。现状 sendInitialTier 只在建连时读一次 DB(hub.go:280-299),若照此模式把 model 缓存在连接期,另一 tab 中途 set_runtime_config 换模型后(readLoop hub.go:836-847 落库+转发),本 tab 后续 user_message 会按旧 weight 反折算 → agent 按错误 raw 预算配速(贵→便宜时提前收尾,便宜→贵时超扣一轮,透支带兜底)。偏差有界单轮、下条消息自愈,但方案应明确:盖章时每条 user_message 现读 pinned_model(或 hub 内存态随 set_runtime_config 帧同步更新),不要沿用建连快照。存疑级:取决于实现选择,方案文本未锁死。

## [minor] 5.1 单系数取舍技术上自洽、可接受,但 cache-heavy 功能的『额度消耗 vs 真实成本』偏离应在运营侧有意识管理
核实:现状 raw 口径本就把 cache_read 按 1x 全额计入(llmusage/service.go:77-83 四类合计,注释明言『如需把 cache_read 降权在此乘系数』;agent 侧 pacing 同口径 turnLoop.ts:119-121),单系数 weighted=raw×w 是现状的严格保序延伸,不会让 prism/审稿相对今天多扣或少扣。且盖章反折算数学上只有标量 weight 才闭合(4 类分计则 remaining 无法映射回 agent 的 raw 自配速),故 5.1 站得住。残留失真是产品级:cache_read 真实成本 ≈0.1×input,90% 缓存读的功能在 ×3 模型下额度燃烧与平台成本可偏离一个数量级以上 —— 用户会感知『审稿/写作烧额度特别快』。cost_micro_yuan 快照(3.4)反正逐行四类精算,建议 admin 看板加一列 weighted/cost 比值监控,失真过大时用该模型的 billing_weight 手调兜底(方案已留此旋钮,无需改架构)。

