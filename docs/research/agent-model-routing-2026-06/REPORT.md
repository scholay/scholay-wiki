# Scholar Agent 模型路由(按任务自动选模型)· 彻底分析

> 2026-06-30 · 多 agent 研究工作流产出(并行调研 编码 agent / 路由服务与论文 / 框架路由器 / 经济性与陷阱,28 个 pattern → Scholar 专属综合)。锚定现实:provider-agnostic 4 槽(main/haiku/sonnet/opus)+ per-feature FeatureSpec + DeepSeek(pro=强/flash=弱)+ tier-aware 日额度 + 清洁室流式 turn-loop + 一会话一模型铁律。

## 0. 一句话结论

**Scholar 现在不该上「按每轮难度自动换模型」的动态路由,但应该把已有的 static 分级用满、再加一层「会话开始时一次决策 + 全程锁定」的轻量分级。** 真正高 ROI 且零风险的动作:(1) 把 per-feature 默认 tier 显式细化到 `agent_config`(smart_search 用 flash、prism/peerreview 用 pro),堵掉「全 feature 一律 tier=main」的钱坑;(2) 加一层基于**已知确定信号**(feature_key / 输入 token 数 / 是否需要工具 / 用户显式 fast-deep 开关 / 剩余日额度)的规则路由,**只在会话首轮决策、之后锁死**。学到的难度分类器(RouteLLM/Hybrid-LLM 风格)与级联升级(FrugalGPT 风格)留作中期实验,且**只能用在非流式、单发的子步骤**(标题/记忆/peerreview 打分),**绝不能进流式 chat turn-loop 中途换模型**——会击穿 KV/prompt 缓存,得不偿失。

## 1. 现状定性:Scholar 有什么、缺什么

### 现在的路由形态 = 「static task-type / per-call-site routing」(行业正经基线,不是缺陷)

| 调用点 | 当前 tier | 性质 |
|---|---|---|
| chat turn-loop(claw / smart_search / prism) | **tier=main**(整段会话) | 一会话一模型,从不中途切 |
| 标题生成、per-user 记忆抽取(out-of-band) | tier=haiku | 单发、便宜、非流式 |
| peerreview 打分轮 | HaikuModel(per-round override) | 短子会话,角色级覆盖 |
| peerreview 方法论 / chief | MainModel | 短子会话,角色级覆盖 |

这正是 CrewAI/AutoGen 的「per-agent static model assignment」+ Portkey 的「task-type routing」,业界公认**最低风险、计费最稳、最该当默认**。任何动态路由必须扣掉自身开销后**净赢**这个基线才值得上。

### 两个真实缺口

1. **「全 feature chat 一律 tier=main」浪费了 task-type 信号。** smart_search(MCP 工具编排+检索综合,flash 大概率够)/ prism(LaTeX 推理,需 pro)/ peerreview(已角色分级)难度画像差异巨大,但 chat 主循环统一吃 main 槽。零风险可补。
2. **task-type 之内无自适应。** claw 里「你好」和多步研究任务都跑 main。这是 static 路由固有短板,也是唯一需要动态路由解决的部分,只值得在最高流量 feature 谨慎试。

**关键判断:Scholar 当前形状(整会话锁 main + 便宜模型只用于 out-of-band 单发)恰好是「KV-cache / 不中途换」铁律下架构正确的形状,不要破坏。** 缺口不在「该不该换中途模型」,而在「会话开始那一次该不该更聪明地选」。

## 2. 主流做法全景(三类)

### 2.1 编码 Agent
- **Claude Code subagent `model`**:父按 description 选 subagent(task-type),模型静态固定。≈1:1 映射 Scholar 4 槽+per-call-site;`effort` = 单模型强度旋钮。坑:`inherit` 默认是「#1 浪费成本」,要刻意指定。
- **Claude Code orchestrator+workers**:planner 实时判难度委派便宜 worker(最大成本杠杆)。Scholar 单 turn-loop 无 orchestrator 拆分,非速赢。
- **Cursor Auto**:实测主要解决可用性/容灾,**不真正 task-aware**;警世——别信「auto=复杂度感知」。
- **Copilot Auto**:系统健康+复杂度双系统,**只在 cache 边界换模型**;最清晰的复杂度路由范例,但黑盒不可调。
- **Aider `--weak-model` + architect/editor**:`--weak-model`=Scholar haiku 槽精确同构;architect+editor 可映射 prism「强模型出方案+便宜出 patch」。全手动。
- **Cline/Continue Plan↔Act**、**Codex CLI(静态模型+reasoning-effort)**:重要对照——**与其换模型,不如先暴露同 tier 的 effort/max_tokens/工具轮数预算旋钮**(更便宜、保缓存一致)。

**提炼:** 成熟编码 agent 的「路由」本质是**静态 task-type 绑定 + 单模型强度旋钮(effort)**,真 per-query 复杂度路由只有 Cursor/Copilot Auto,且前者不 task-aware、后者避开 cache 边界。→ Scholar 方向应是**用满静态分级 + Codex 式 effort 旋钮,而非每轮换模型**。

### 2.2 路由服务与论文
- **RouteLLM**(LMSYS ICLR'25,https://arxiv.org/abs/2406.18665):query 文本预测 cheap≈strong + cost 阈值;MT-Bench 95% 质量@14% 强模型。**需域内训练数据(Scholar 没有);单轮 QA 基准;难度不分化时收益消失**。
- **FrugalGPT**(TMLR'24):级联,便宜→打分→升级(反应式)。**最适合 peerreview 打分轮**(可验证)。每次升级付双份+串行延迟;**对流式 chat 致命**。
- **Hybrid-LLM**(MSFT/UBC ICLR'24):DeBERTa 难度分类器 + 可调质量阈值;**明说 NOT task-aware** → 要叠加 Scholar 的 task 信号。
- **AutoMix**(NeurIPS'24):cheap 自验证 + meta-router,**几乎不需训练数据**;最佳 = smart_search(检索综合可验「是否引用了找到的论文」)。自验证对开放生成不可靠。
- **OpenRouter Auto(NotDiamond 驱动)**:学到的分类器 + operator `cost_quality_tradeoff` 0-10 旋钮 + **首轮决策后整会话锁定(stickiness)**。**对 Scholar 约束最可直接照搬的产品模式**:per-feature 0-10 旋钮 + 首轮决策锁定 + feature_key 免费信号。要自重实现(不能用第三方黑盒)。
- **Martian/Unify**:可复用的是 **labeling 方法**(用 pro/LLM-judge 给 flash 在真实 turn 打分,攒数据集)。

**提炼:** 学术路由器分**预测式**(RouteLLM/Hybrid-LLM,前置分类、需训练数据)与**反应式级联**(FrugalGPT/AutoMix,无需前置但每升级付双份+加延迟);**两者基准都是单轮短答 QA,没有一个在 agentic 工具循环验证过**。最可落地产品形态 = OpenRouter「旋钮+首轮决策+锁定」。

### 2.3 框架
- **LangChain RouterChain / LlamaIndex RouterQueryEngine**:LLM/Pydantic-as-router 按 description 选目标。Scholar 已按 call-site 分 feature,**再加 router LLM 是负收益**;若加应优先结构化输出(tool-call)而非解析 JSON 串。
- **Aurelio semantic-router(embedding kNN,无 LLM,~100ms)**:per-turn tier 选择的最便宜选项(seed「寒暄」→haiku),不加额外 DeepSeek turn、不动计费;但需引入 embedding 依赖。
- **Haystack ConditionalRouter / Vercel Gateway**:**确定性规则路由**(token 数/是否要工具/feature_key/显式开关→选 tier),**零新依赖、最该先做**;Vercel 的 provider-order 映射 agentconfig 多上游 failover(是 where 不是 which tier)。
- **CrewAI/AutoGen per-agent 静态绑定**:正是 Scholar 已做的、正确基线。

**提炼:** 框架的「路由」绝大多数是按 task-type/capability 选**目标/后端**,不是按成本选 tier;这层 Scholar 已由 call-site 完成。唯一新增价值 = **确定性规则路由(先做,零依赖)** + **嵌入语义门(下一步,需依赖)**。

## 3. 路由信号对比

| 信号 | 决策时机 | 额外成本 | 收益上限 | 主要风险 | Scholar 适配 |
|---|---|---|---|---|---|
| 任务类型 / call-site(静态) | 开发期 | **0** | 中 | 类内不自适应 | ★★★★★ 现有基线,**应用满** |
| 显式分级 / 用户选 | 用户/会话 | 0 推理 | 中 | 用户常选错 | ★★★★★ 速赢:per-conversation「快/深」开关 |
| 预算/额度感知降级 | 会话开始 | 0(读额度) | 中 | 中途降级=隐性掉质量+KV 失效 | ★★★★ 接近额度时**新会话**降 flash,透明告知 |
| 确定性规则(token/是否要工具) | 首轮 | <1ms | 中低 | 规则脆 | ★★★★ **第一层、零依赖、先做** |
| 嵌入语义门(kNN) | 首轮 | ~一次 embed | 中 | 需语料+阈值;新依赖 | ★★★ per-turn 门下一步 |
| 学到的复杂度分类器(upfront) | 首轮 | <100ms(**绝不用 frontier LLM**) | 高(双峰难度时) | 需训练数据;OOD 误路由;85% 非普适 | ★★★ 中期;**首轮决策+锁定**;v1 先启发式/嵌入 |
| 级联升级(反应式) | 答后 | 便宜一发+升级双跳 | 高(可验证任务) | 流式致命;可能反抬 per-user token | ★★ **仅非流式单发子步骤**,chat 禁用 |

## 4. 给 Scholar 的分级建议

### Tier A — 立即可做、低风险、高 ROI
- **A1. per-feature 默认 tier 显式化进 `agent_config`**,堵「全 chat 一律 main」钱坑。改:`agent_config` 加 per-feature 默认 tier(或各 `spec.tier` 显式声明),turn-loop 读它而非硬编码 main。分:smart_search→flash(先 A/B)、prism/peerreview-chief→pro、peerreview 打分→haiku。
- **A2. 「便宜 out-of-band 单发→haiku」铺到更多内部调用**(摘要/分类/未来引用格式化)。最干净的成本胜利,无质量风险。
- **A3. per-conversation「快速/深度」显式开关**(用户驱动透明升级)→ flash/pro;建 session 时 pin 进 `agent_sessions`;按 feature/额度给默认。**是任何学到 router 之前的 v0。**
- **A4. 第一层确定性规则路由(零依赖),只在首轮、决策后锁定。** turn-loop 建 session 时插纯函数 `pickTier(signals)→slot`(信号:feature_key/首条 token 数/是否要工具/A3 开关/剩余额度),写进 session 全程锁定,不每轮重算。
- **A5. 额度感知软降级(只在会话开始)。** 接近日额度时**新会话**默认降 flash 而非硬拦;绝不中途降级;UI 明示「已切快速模式」。

### Tier B — 中期、需评估
- **B1. 首轮复杂度分类器**(RouteLLM/Hybrid-LLM 风格),仅最高流量 feature(smart_search/claw),首轮决策+锁定+额度 guard。v1 先**轻量启发式/嵌入门**(不要一上来训矩阵分解,Scholar 无偏好数据);攒数据用 pro/LLM-judge 给 flash 打分挖 agent_usage;加 admin 0-10 质量旋钮。**硬门槛:先在真实流量 A/B 净赢静态基线才上线触及额度经济。**
- **B2. peerreview 打分轮级联升级**(可验证任务):加便宜 verifier(score JSON schema 合法+评审一致),只对不确定论文升级 MainModel。只这里——输出可验证、独立短子会话、不破坏主线流式。
- **B3. prism architect/editor 双模型拆分(可选)**:强 tier 出方案 + 便宜 tier 出 patch。代价:每轮翻倍请求/延迟。

### Tier C — 暂不建议 / 陷阱
- **C1. 流式 chat turn-loop 内 per-turn 换模型**:KV/prompt 缓存 model+provider 特定,中途换=全量重算+全价+tokenizer 截断+指令漂移;实测中途切劣于全程任一模型。**直接否决「每轮挑最优模型」朴素设计。**
- **C2. 流式 chat 里的级联升级**:流式 UI 下无法干净「flash 答→判→pro 重跑」;双跳+KV 重建+翻倍 token 打爆额度经济。
- **C3. 用 frontier LLM 当路由分类器**:每轮前加一次完整 LLM 往返,defeats the purpose。分类器必须 <100ms(规则/嵌入/BERT)。
- **C4. 直接照搬 NotDiamond/Cursor/Copilot 黑盒 auto-router**:清洁室+DeepSeek 决定不能直接用;要照搬**模式(旋钮+stickiness+cache 边界)**,不是服务。

## 5. 关键铁律 / 反模式

1. **【铁律】绝不在一段会话中途换模型。** KV/prompt 缓存 model+provider 特定 → 中途换=全量重处理+全价+tokenizer 不匹配+context 截断+指令漂移;实测劣于全程任一模型。任何 router 必须 session 开始决策一次并锁定(stickiness)。现有「整会话锁 main + 便宜模型只用 out-of-band 单发」已是正确形状,**不要破坏**。peerreview per-round override 可接受是因为每评审是独立短子会话,非同线程 swap。
2. **【反模式】路由步别比它省的还贵。** 分类器 <100ms(规则<1ms/嵌入~5ms/BERT 50-100ms),**绝不用 frontier LLM 当 router**;级联「便宜一发」在流式/多轮会变双跳付双份——只用非流式单发子步骤。
3. **【铁律】不与计费语义同阶段动 executor / 换模型。** 触及 Free/Pro/Max 日额度前,必须先在真实 agent_usage A/B 净赢静态基线。RouteLLM 的 85% 降本是基准特定非普适,**难度不分化时收益归零**——自家流量重算经济账。
4. **【反模式】静默掉质量是隐性税**(成本立刻进账单,质量代价几天后以流失出现)。上 router 前:(a) 路由决策(tier+信号)记进 agent_usage slog;(b) 每 feature 建 50-500 例固定 eval 集,LLM-as-judge 做 CI gate;(c) 用曲线指标(APGR)而非单阈值;(d) 保守起步(10-30% 便宜份额),每次放宽一格盯质量。
5. **【优先级】先用满静态分级 + 暴露 effort/预算旋钮,再考虑学到的 router。** 成熟编码 agent 主流不是每轮换模型,而是静态绑定 + 单模型强度旋钮。Scholar 已变 max_tokens 64k——做 per-feature effort/工具轮数预算(smart_search 低 vs prism 高),契合额度经济、保缓存一致、无需任何分类器。
6. **【铁律】中途换模型会废掉 DeepSeek prompt-cache 与规划中独立 agent-Redis 的收益**——这两项基础设施价值正建立在「一会话一模型」之上。

## 落地总览(改哪)
- `agent_config`:加 per-feature 默认 tier 字段 + per-feature `cost_quality` 0-10 旋钮(B)+ per-feature effort/预算字段。
- `spec.tier` / FeatureSpec:显式声明各 feature 默认 tier,turn-loop 读它而非硬编码 main。
- turn-loop:建 session 时插纯函数 `pickTier(signals)`(A4 规则 / B1 分类器),写 `agent_sessions` 并**全程锁定**;路由决策记 agent_usage slog。
- 前端:per-conversation「快/深」开关(A3)+ 额度软降级提示(A5)。
- 新 router 步:只在会话首轮、决策一次、锁定;eval gate(LLM-as-judge per-feature 固定集)守门后才放宽便宜份额。
