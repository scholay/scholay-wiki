# product-ux — verdict: needs-fixes

## [major] releases_tomorrow 单字段回答不了「什么时候能再用」,且重置豁免滑出会造成一夜额度悬崖
方案 6.3(REPORT.md:314-315)给的超限文案是「等待最早一天的用量明日 00:00 释放」,但滚动窗口下若用量集中在近 1-2 天(最常见的爆额度姿势),最旧一天 used−base=0,明日实际释放为 0,真正恢复可能在 3-5 天后——这与方案自己在 REPORT.md:316 批评 AssistantTurn.tsx:47「明日再来」是「错误承诺」属同一类错误。现有 TokenStatus(backend/internal/vip/quota.go:450-456)扩展成 releases_tomorrow 单字段不够,需要 next_release_at + next_release_amount(扫 7 桶找首个非零释放日)或完整 7 槽释放 schedule,重置弹窗/blocked 卡片文案改为「预计 X 月 X 日恢复」。另外 6.2 的重置语义(base IncrBy 当天桶)意味着重置日在 D+7 滑出窗口时,其豁免一次性失效:用户在豁免掩护下烧掉的量一夜「重新计入」,额度条可从 0% 直接跳到 100%,50%/80% 提醒全部跳过、用户毫无操作却被封——方案只写了「豁免自然失效」没有评估这个 UX 悬崖,至少需要「重置豁免将于 X 日到期」的前置提醒,或把豁免摊薄到剩余窗口天数。

## [major] 50%/80% 阈值提醒在 7 天滚动口径下语义失效,方案只修了去重没修语义
QuotaNotifier.tsx:67-82 的阈值逻辑是为「日额度」设计的:当天过半确实值得提醒。换成 7 天池后,一个健康的匀速用户(日均 1/7)从第 4 天起窗口水位就常驻 50-85%,「额度已消耗过半」(quota-toast.tsx:9-10 文案)会变成每周必弹的常态噪音,狼来了效应直接废掉 80% 预警的价值。方案 6.3 只把 warnDay 去重改成「窗口水位档去重、水位回落后重置」——且「回落后重置」没定义回滞带(rolling 释放每天让 percent 在阈值附近 49↔51 震荡就会反复触发),「同一档一周只提醒一次」在无周期边界的滚动窗口里「一周」也没有锚点。建议改信号本身:按近 3 日耗速外推「预计 N 天后耗尽」,N≤1.5 天才提醒;或阈值上调到 85/95 并定义回滞(如回落到阈值−15pp 才重置)。

## [major] 「新对话选模型存内存 state」是对现有明文产品语义的回退,不止是刷新丢失问题
方案 4.4-4 删除 localStorage 双键改内存 state。但现有代码注释两处明确写着「按产品要求」:session.ts:465-472 与 ClawModelSelector.tsx:31-37——新对话偏好跨刷新保留、且「下次开新对话默认带上」(用户级粘性偏好),历史对话各自记忆。改内存 state 后:(a) 发首条消息前刷新丢选择(可勉强接受);(b) 用户「我开新对话就想用 X」的粘性偏好彻底消失,每次都回落到 admin 配的全局 chat_default——这是明确的语义降级,方案未提及也未论证放弃理由。建议:per-session 记忆服务端化(pinned_model)没问题,但「新对话默认模型」保留一个用户级偏好(单 localStorage 键、载入时对目录校验失效则丢弃;或进服务端 user 偏好),Cursor 本身也是记住上次选择。

## [major] P3 后加权口径与 raw 口径在同一账单 UI 混用,热力图/今日消耗会与额度条自相矛盾
热力图数据源 DailyUsageThisMonth 聚合的是 raw total_tokens(backend/internal/vip/quota.go:479-484),前端 levelOf(tokens, ceiling) 用它对参考线分档(billing-panels.tsx:439-452)。方案 6.3 只说把参考线换成 window_ceiling/7(加权点数口径),日格数值仍是 raw——重度用贵模型(×3)的用户会看到「格子远没到线但额度已用完」,恰好击穿「为什么我额度掉得快」这个最需要解释的问题。同理 TokenStatus.ConsumedToday(raw,quota.go:455)与 Used(P3 后为加权)同在 account-assets-card 展示,两个数字口径不同且无标注。0065 迁移已经有 weighted_tokens 列,热力图与 consumed_today 应一并切加权口径并统一命名(如「点数」),方案缺这两处。

## [minor] ModelSelector 塞进 Composer 底栏的信息密度未给移动端折叠策略
Composer 底栏结构是 leftActions | flex-1 | ContextMeter | 36px 发送键(shared/components/chat/Composer.tsx:191-198)。claw 的 leftActions 已有回形针+文献集 2 个 8×8 图标(ChatComposer.tsx:316-355),prism 也有 2 个(PrismChatPanel.tsx:154 起)。方案 4.4-2 要求 trigger 同时呈现「展示名 + speed 徽标 + ×N 倍率 + 锁定态」,在 ~360px 移动视口下装不下(现有 ClawModelSelector 靠 sidebar 宽度 + truncate 才成立,ClawModelSelector.tsx:113)。需明确:trigger 只留短名(truncate)或纯 Cpu 图标,倍率/speed/锁定徽标下沉到下拉项;并规定 display_name 建议长度(后台录入约束)。存疑点:smart-search 的 leftActions 当前仅一个重置键,空间尚可,主要风险在 claw 移动端。

## [minor] quota_exceeded 全链路不感知当前模型,缺「换低倍率模型」引导与逐轮消耗归因
超限文案单源在 vip 包(quota.go:436-443),不知道用户当前用什么模型;前端 blocked 卡片(MessageTurn.tsx:204-215)与重置弹窗(QuotaNotifier.tsx:117-127)的动作只有 重置/升级/兑换。用户选了 ×3 模型爆额度时,最便宜的自救是切 ×0.5 模型,但方案 6.3 的新文案没有这个分支。前端其实知道会话当前模型及其 billing_weight(/user/models + pinned_model),应在 blocked 卡与重置弹窗按「当前模型 weight>1」条件加一个「切换省额度模型后重发」动作(纯前端可做,不用动 vip 包)。另一个缺口:×N 徽标只在选择时刻可见,消耗过程中无归因信号——建议 context/usage DTO 透出本轮加权消耗(hub 已在 OnMessageComplete 拿到 usage 和 weight),否则「额度为什么掉得快”只能靠用户自己回忆选过什么模型。

## [minor] min_tier 锁定与 PricingPage 权益文案零联动;绑定表无 per-tier 维度导致 Free 默认模型无解
membership-plan-card.tsx:28-48 的「标准 AI 模型 / 优先使用更强 AI 模型 / 最强 AI 模型」是硬编码字符串,min_tier 落地后价格页仍无法点名「Pro 解锁哪几个模型」——锁定态跳 /pricing 后用户看不到自己要买的那个模型,升级转化闭环断裂;方案 4.5/6.3 的 P4 文案清扫只覆盖「每日→7天」,没有把模型权益接入 plan-card(可从 /user/models 的 min_tier 聚合渲染)。更结构性的问题:agent_model_bindings 主键只有 purpose(REPORT.md:149-153),chat_default.claw/prism 是全局单值,表达不了「Free 默认便宜模型、Pro 默认强模型」——而现状 claw/prism DefaultTier=main(claw/spec.go:162、prism/spec.go:148),P3 加权后 Free 用户默认就在烧最贵档。产品建议:要么 binding 值支持 per-tier 覆盖(purpose+tier 复合键),要么硬性约定 chat_default 绑定模型必须 weight=1、把强模型全走用户主动选择+min_tier。

## [minor] P3/P4 公告策略自相矛盾,且缺「默认模型 weight=1」这条老用户零体感锚点
REPORT.md:342 建议顺序 P1→P2→P4→P3 并称「只公告一次额度体系升级」,但 P4、P3 分两次发版就是两次用户可感口径变化,「只公告一次」仅在 P3/P4 合并发版时成立——文字与分期表(339-340 行各自标「需公告」)矛盾。产品视角更优解:P4 单独先发,叙事是纯利好(总量不变更灵活 + 6.2 冷启动放水可包装成升级福利);P3 与 P2 选择器同期或紧随其后发,并加一条方案里没有的硬约束:P3 上线时刻所有 chat_default 绑定模型的 billing_weight 必须=1——这样不动任何设置的老用户额度体感零变化,「额度掉得快」只会发生在主动选了带 ×N 徽标的模型之后,申诉面从「全体老用户」收敛为「知情选择者」。若打包 P3+P4 一次发,利好会被利空叙事淹没,且额度突变归因混杂(是 7 天口径还是倍率?)客服无法拆解。

