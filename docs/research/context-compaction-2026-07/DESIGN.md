# 上下文滚动压缩(context compaction)· 设计

2026-07-15。承接「模型切换 / 长会话 → 撞上游 context 窗口」问题。现状只有**硬截断**
(`agent/src/turn/window.ts` windowMessages,丢最老回合),`window.ts` 注释自认「真·摘要压缩是
更大的后续项」。本设计落地摘要压缩。

## 触发的问题

- 长会话上下文只增不减 → 超上游窗口 → 报笼统 upstream failed 卡死。
- 从 1M 窗口模型切到 256k:历史(如 500k)> 新窗口 → 首条消息就溢出。
- 纯硬截断丢掉早期对话(用户最初目标 / 早期检索到的论文),体验差。

## 关键技术前提(决定架构)

> **不能把 500k 历史丢给 256k 窗口的模型去总结 —— 读不下。**

所以不是「溢出时一次性总结」,而是**滚动增量**:压缩量始终 ≤ 便宜档窗口能装下的量,靠对
**被丢弃的老回合**做有界摘要 + 保留最近回合原文。

## 分层架构(与业界一致)

1. **预防层**:水位表跟随模型窗口(已修 550cb55ac)—— 用户先看见压力,多数时候不触发压缩。
2. **优雅降级层 · 滚动摘要压缩(本设计)**:近上限/超窗口时,把最老的若干回合摘要成一个
   「摘要对」(user 摘要 + assistant 确认),最近 KEEP_TURNS 回合保留原文;**关键产物
   (论文 ID stc:/olx:/pmd:、文件路径、URL)从被压缩部分原样保留**(学术场景精度不能丢)。
3. **硬底层 · 截断兜底**:摘要调用失败/超时 → 回落现有 windowMessages 硬截断(宁丢不崩)。
4. **透明层 · 警告**:压缩发生时发 `system_notification{kind:context_compacted}` → 前端一条
   低调 inline 提示(「已将较早 N 轮压缩为摘要,精确细节可能有损」)。

## 决策钉死

| 项 | 决策 | 理由 |
|---|---|---|
| 谁来摘要 | **system.fast 档**(fastCompletion,现成)| 内部开销,不该让用户为昂贵模型的总结买单;快 |
| 触发时机 | 近上限(lastCtx > 窗口×TRIGGER%)**或** history 明显超窗口(切小模型) | 覆盖长会话 + 切模型两种 |
| 摘要输入上限 | 渲染被压缩老回合为文本,cap 到便宜档安全输入(超则丢最老)| 解「读不下」死结 |
| 结构安全 | 摘要对 = user(摘要正文)+ assistant(确认)前置,再接最近回合 | Anthropic:首条 user、role 交替、tool 配对不断 |
| 产物保留 | 正则抽 stc:/olx:/pmd: ID、`/home/bun/...` 路径、http(s) URL,原样附摘要末尾 | 摘要会丢精度,ID/路径不能丢 |
| 计费 | 摘要调用发 `token_usage{kind:context_compact}`,后端 SkipQuota(系统开销,同 memory)| 系统压缩不扣用户额度 |
| 兜底 | 摘要失败 → windowMessages 硬截断 | 可用性优先 |
| 衔接 | 复用 isTurnStart 在回合边界切;窗口值取 ws.data.contextWindow(P2 随模型帧下发)| 与现有一致 |

## 落地文件

- `agent/src/turn/compact.ts`(新):compactMessages(messages, keepTurns, ctxWindow) → 摘要对 + 最近回合。
- `agent/src/server/ws.ts`:裁剪点由 windowMessages 改「compactMessages 优先、失败回落 windowMessages」;
  成功后发 token_usage(计费)+ system_notification(警告)。
- 后端 `recordOutOfBandTokens`:kind=context_compact → SkipQuota。
- 前端:3 家 fold 认 system_notification → 渲染共享 `SystemNotice`(低调 inline chip)。

## 分期

- **P1(本次)**:执行器 compact.ts 核心 + ws.ts 衔接 + 兜底 + token_usage 计费。可验证:长历史+小窗
  → 触发压缩、结构合法、不溢出。
- **P2**:警告 UX(system_notification 帧 + 前端 SystemNotice 3 家渲染)+ 后端 SkipQuota。
