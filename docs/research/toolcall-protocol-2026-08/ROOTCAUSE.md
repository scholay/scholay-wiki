# 工具调用协议破损 · 根因合成与修复

> 2026-08-07 · 三路取证([01-prod-slice](01-prod-slice.md) 生产切片 / [02-adapter-code](02-adapter-code.md) 代码 / [03-vendor-specs](03-vendor-specs.md) 厂商规范)的合成结论 + 本次落地的修复。
> 代码改动全部在 `agent/`;测试 `bun test` **360 pass / 0 fail**,`bunx tsc --noEmit` 干净(命令与输出见 §六)。

---

## 〇 一句话

**用户看到的一个症状,底下是两条互不相干的因果链**;它们在 2026-08-03 之后开始互相喂食,
其中**只有第二条是我们自己造的**,而任务书里的强先验(「三家同时出问题 ⇒ 我们传 tools / 解析 tool_calls 有共性缺陷」)
指向的那两处 —— 出站传参、入站解析 —— **经实测全部排除**。

| | 链 A · 协议残渣漏进正文 | 链 B · 幻影工具链 |
|---|---|---|
| 起点 | DeepSeek `/anthropic` 网关侧 DSML 解析器漏解析(上游) | 我们把历史工具调用折成正文(`shadowTurn.ts`,2026-08-02 上线) |
| 我们的过错 | **护栏判据是字面量名单,漏闭标签**(症状放大) | **根因就是我们**(模型 few-shot 照抄) |
| 用户看到 | `</\|\|DSML\|\|parameter>` 乱码 / 「协议异常,本轮已终止」 | 一份「我读了、我改了、我导出了」的完整叙事,磁盘上什么都没发生 |
| 指标可见性 | `round_discarded` + `model_protocol_error`(有告警) | `status=complete`、零 error、零 discard ——**任何现有指标都看不见** |
| 线上量级 | C 期 4/569 轮泄漏 + 19/569 轮作废 | C 期 17/569 轮(其中 14 轮零工具零产物) |

用户 1236 那 21 轮:**4 轮轮死(链 A)+ 6 轮幻影(链 B)= 10/21 对用户无效**。原问题只统计到前 4 轮。

---

## 一 完整根因链:从「我们发了什么请求」到「用户看到乱码」

### 1.1 我们发的请求(两条道,tools 参数完全一样)

```
turnLoop.ts:511  client.messages.stream({ model, max_tokens, system, messages, tools: activeTools })
                                   │
                 anthropic/client.ts:35   p.apiFormat === "openai" ?
                     ┌─────────────────────┴─────────────────────┐
              openAIAdapterClient(p)                    new Anthropic({ baseURL })
              千问 id=1 / GLM id=2                      DeepSeek(agent_config,provider_id=0)
              openai/adapter.ts 出口翻译                 base_url = api.deepseek.com/anthropic
              88 轮 / 263 次 tool_use / 破损 0            2272 轮 / 12,034 次 tool_use / 破损 85
```

**分叉点只有这一处**,`tools` 在分叉之前就已经定型(`toAnthropicTools.ts:9-26`),两条道拿到的是同一个对象。
所以「我们给 DeepSeek 传的 tools 有问题」**在结构上讲不通** —— 传的是同一个东西,不同的只是它落到哪个端点。

### 1.2 链 A:残渣如何走到用户屏幕上

```
① DeepSeek 模型在 token 层用 DSML 文本发工具调用(这是它的原生设计,不是故障)
        <｜DSML｜tool_calls><｜DSML｜invoke name="X"><｜DSML｜parameter name="p" string="true">…
   ↓
② api.deepseek.com/anthropic 的垫片负责把 DSML 解析成 Anthropic tool_use 块
   —— 绝大多数时候成功(12,034 次 tool_use 是证据)
   ↓
③ 垫片间歇性漏解析(官方 issue 记录两种退化:ASCII 竖线退化 / 无换行紧凑形态,均无官方修复)
   ⇒ 漏掉的那一次调用**整段掉进 text_delta**,一次真实的工具调用被降级成散文
   ↓
④ 我们的 leakGuard 在 delta 汇合点扫描(turnLoop.ts:551-559,位置正确)
   —— 但判据是一张 10 条的**字面量名单**,十条全部以 `<` 开头
   ⇒ `</｜｜DSML｜｜invoke>` 中间多一个 `/`,indexOf 必不命中
   ⇒ 且 holdback 只扣「是某条字面量前缀」的尾巴:帧以 `<` 结尾时扣住 `<`,
      下一帧来了 `/` 之后 `</` 不再是任何条目的前缀 ⇒ **连同其后整段放行**
   ↓
⑤-a 漏网 → 用户看到 `</｜｜DSML｜｜parameter>…`(每天恰好 1 条,08-04~08-07)
⑤-b 拦住 → turnLoop.ts:759 作废重打(round_discarded),重试额度 1;
     重打**原样重放**同一份请求 ⇒ 再踩即 model_protocol_error,整轮 failed,
     前面真跑过的 8 次 Bash/Read/Edit 在 UI 上一笔勾销
```

第 ⑤-b 步就是「round_discarded 频发」的全部机制:**它不是新 bug,是 leakGuard 自 2026-07-26 上线后正常工作的代价**
(A→B 期泄漏 4.77% → 0%,同时 round_discarded 0 → 1.95%)。

### 1.3 链 B:幻影工具链(我们自己造的,且不在原问题描述里)

```
① 会话闲置 30 分钟被逐出 / 容器重启 / 重连(都很常见)
   ↓
② backend 发 seed_history → server/ws.ts:208 → shadowTurn.convertFlatToAnthropic
   ↓
③ 每个真实 tool_use 块被折成 assistant 的一条**文本**:
      【已调用 Read file_path="scheme_v2.md"】返回 2926 字符          ← 2026-08-02 上线的模板
   ↓
④ 模型看到「工具调用这件事在我的历史里长得就是正文」⇒ few-shot 照做:
   turn 2408 逐字写出该模板(连 `返回 2926 字符` 这个它无从知晓的数字都编了),
   再把整个 Edit 调用当正文写出来,收尾吐出 DSML 闭标签
   ↓
⑤ 该轮 tool_use = 0、artifact = 0、status = complete、无 error、无 round_discarded
   ⇒ 用户读到「我读了文件、我改了、我导出了」,磁盘上什么都没变
   ↓
⑥ 这一轮的正文又进了历史 ⇒ 下一轮样本更多 ⇒ 自我强化
   (用户 1236 会话 seq 12–17 连续 6 轮零工具)
```

**时间线闭合**:fold 提交 `545c757`(2026-08-02 13:47)→ 线上首条 `【已调用` 正文回声 2026-08-03 10:11;
在此之前 173,070 条 `content_delta` 里该串出现 **0 次**。

### 1.4 两条链的交汇

C 期 4 起 DSML 泄漏与 17 起 fold 回声的**交集 = 4/4**(100% 包含)。
机制:链 B 让模型决定「用正文发工具调用」,而 DeepSeek 一旦这么决定,就会把它的原生 DSML 闭合语法一起带出来
—— **链 B 喂给了链 A**。这解释了为什么 B 期归零的泄漏在 C 期死灰复燃,且复燃的 4 起**全部只有闭标签**。

---

## 二 已证实 / 仍存疑(严格分栏)

### 已证实(线上实测,可复跑)

| # | 结论 | 依据 |
|---|---|---|
| 1 | 破损 **100% 集中在 DeepSeek**。千问 + GLM 88 轮 / 263 次真实 tool_use / 跨 07-26~08-07 完整窗口 / 23 用户 / 35 会话,破损 0 | 全量 `agent_turns × agent_turn_events` GROUP BY;若同分布,88 轮全绿概率 ≈ 0.035 |
| 2 | 切分维度是 **api_format 而非厂商**:出问题的恰恰是**不经过我们任何翻译层**的 anthropic 原生道 | `agent_providers` / `agent_config` / `anthropic/client.ts:35` |
| 3 | **「解析 tool_calls」这一候选根因被排除**:12,976 条 `tool_use` payload 零畸形(input 非 OBJECT 0、toolName 空 0、toolUseId 空 0) | 全量扫描 |
| 4 | **「模型没拿到 tools」被证伪**:同批会话 12,034 次真实 tool_use | 见 03 报告 §五坑 2 |
| 5 | leakGuard 漏闭标签,**已用线上原始字节逐字复现**(tripped=false 原样下发) | 复现脚本 + 线上镜像 md5 与本地工作区一致 |
| 6 | 线上**从未出现 ASCII 竖线形态**:184 条含 DSML 的 delta 里 `%\|\|DSML\|\|%` = 0、`%\|DSML\|%` = 0,全是全角 U+FF5C ×2 | `HEX(JSON_UNQUOTE(...))` = `3C EFBD9C EFBD9C 44534D4C …` |
| 7 | fold 模板被三家模型照抄(deepseek 15 / glm-5.2 1 / qwen3.7-plus 1),首日 2026-08-03 | `content_delta LIKE '%已调用%'` 逐轮列出 |
| 8 | `round_discarded` 的 payload **只有 `type` 一个键,零原因信息**(39 条全部) | `SELECT ev_type, JSON_KEYS(payload) … GROUP BY` |
| 9 | `model_protocol_error` 是全站第二大错误码(26 条,仅次于 overloaded 50) | error code 全量分布 |
| 10 | 熔断后重打**再踩**的相邻对反复出现(`round 9→10`、`round 8→9`),18 条日志中 `passed_chars` 多为 0 | `docker logs scholar_agent | grep 'DSML protocol leak intercepted'` |

### 仍存疑(**不要当结论用**)

| # | 存疑项 | 为什么还不能下结论 |
|---|---|---|
| 1 | **A 期(fold 之前)DeepSeek 为什么会回落到文本模式** | 只观察到「多发生于长工具链中段、prism 最重 4.0%」,**未取得上游侧证据**。要坐实需构造受控请求打 `api.deepseek.com/anthropic` 复现 —— 属外呼/写操作,本次未做 |
| 2 | 千问 / GLM **是否也会漏** | 88 轮的样本量给不出答案。方向明确(p≈0.03)但不足以支撑「切换默认模型」这种决策 |
| 3 | B→C 期 `round_discarded` 从 1.95% 涨到 3.34% **是否由 fold 导致** | 20 vs 19 起,只能算相关 |
| 4 | 换到 DeepSeek 的 **OpenAI 道**能否绕开泄漏 | 两条道的 DSML→结构化解析器是 DeepSeek 侧**两份不同实现**(探针已证它们在 tool_choice 上行为不同),因此「换道」是可实测的、而且便宜 —— 但**没测过**,纯推测 |
| 5 | `adapter.ts:418` `tc.index` 缺失落 0 是否是线上 19 条 `code=upstream` 的成因 | 代码路径确凿,journal 无法归因到具体成因 |
| 6 | `activeTools=[]` 时两条道口径不一致(anthropic 发 `"tools": []`、openai 不带键)是否是文本形工具调用的放大器 | 代码路径确凿,**未取到「泄漏轮 = wind-down 轮」的直接证据** |
| 7 | DeepSeek strict 模式(`/beta` + `"strict": true`)能否从源头降低 DSML 退化概率 | 官方唯一的源头杠杆,但 76 个 MCP 工具的 schema 大概率不满足 `additionalProperties:false` + 全量 required |

---

## 三 对用户先验的三处修正(逐条给反证)

> 任务书要求:「如果证据指向『不是我们的问题』,也要如实说并给出反证。」下面第 1、2 条就是。

| 先验 | 判定 | 反证 |
|---|---|---|
| 「三家(DeepSeek/千问/GLM)**同时**出问题」 | ❌ **只有 DeepSeek** | 千问 + GLM 88 轮 / 263 次真实工具调用 / 覆盖 B 与 C 完整时间窗,DSML 泄漏 0、round_discarded 0、协议错 0 |
| 「说明是我们这侧在**传 tools 或解析 tool_calls** 上的共性缺陷」 | ❌ **方向反了** | 破损全在**不经过我们任何翻译层**的 anthropic 原生路径;经 `openai/adapter.ts` 翻译的那条路 100% 干净。12,976 条 tool_use payload 零畸形。全仓不存在「从文本正则抠工具调用」的兜底代码 —— 残渣不是我们抠剩的,我们一个字节都没抠 |
| 「MARKERS 漏了 **ASCII 双竖线** `<\|\|DSML\|\|`」 | ⚠️ **一半成立** | 线上 184 条含 DSML 的 delta 里 ASCII 竖线形态出现 **0 次**,全是全角 `｜｜`(U+FF5C ×2),名单已覆盖开标签。**真正的漏洞只有闭标签的 `/`** —— 这一半判对了,而且是关键的一半。截图里看着像 ASCII 的是全角字形(这也正是本次给日志加 `marker_hex` 的原因:报字节,别报字形) |

**但用户有一条判得完全正确、而且是解题的钥匙**:「这些 token 出现在文本流里,意味着模型在用**文本形态**发工具调用」。
线上数据给出了它**为什么**会用文本形态 —— C 期是**我们自己教的**(链 B);A 期则只能归因到上游网关(链 A,fold 当时尚未存在)。

---

## 四 本次落的修复

### 4.1 leakGuard:判据从字面量名单 → 形状族(`agent/src/turn/leakGuard.ts`,整文件重写)

核心变化两处,**都对应一个已复现的线上失败**:

1. **检测**:10 条字面量 → 5 个**形状族**正则(`FAMILIES`),按结构描述而非枚举:
   `<` 或 `</` + 竖线族 `[｜|]{0,2}`(U+FF5C 全角 / ASCII)+ token 名 + 收尾竖线/尖括号。
   覆盖:开/闭 × 全角单双 × ASCII 单双 × 竖线整体退化 × DSML/V3·R1 旧特殊 token/GLM 原生标记/工具调用 XML 语法层。
2. **holdback**:「是不是某条字面量的前缀」→ 「从窗口内**最靠前**的 `<`/竖线起,形状上还可能长成 marker 的尾巴」。
   这一条单独就修掉了跨帧切点(`…决策。"</` | `｜｜DSML｜｜parameter>…`)那个漏洞。

文件头写死了「**名单靠人肉穷举必然漏**」这条纪律,并把两个历史漏洞的原文钉在注释里:

> 这两个漏洞的共同性质:名单每条都是「某次线上事故的化石」,而模型/网关吐出的形态是一个**变体族**。
> 只要判据是枚举,下一个变体就一定在名单外,而且**没有任何红灯**会告诉我们漏了 ——
> 泄漏轮 status=complete、零 error、零 round_discarded,只有用户看到乱码。

**误伤面是刻意收窄的**(有测试钉死):F# 的 `x <| f` / `<|>`、Dirac 记号 `<a|b>`、`a < b`、`</div>`、
泛型 `Map<String, List<Integer>>`、以及 log4j 风格的 `<parameter name="threshold" value="INFO"/>` 全部**不熔断**
—— 最后一条是明确取舍:裸开标签 `<parameter name=` 不收,因为真实配置 XML 长这样;
而真泄漏里它前面必有 DSML 竖线或 `<invoke`,由其它分支先命中。

### 4.2 链 B 的根因修复(`agent/src/turn/toolRecord.ts` 新增 + `shadowTurn.ts:142`)

新建 `turn/toolRecord.ts`,把「一次工具调用在**文本里**长什么样」收成唯一真源,三件东西同源:

| 导出 | 作用 |
|---|---|
| `renderToolRecord()` (`toolRecord.ts:38`) | 折行句式:`【已调用 X args】结果` → `〔平台记录·历史工具调用〕X(args) → 结果`。**第一人称动作句 → 第三人称平台档案**,降低被当成「调用工具的写法」的概率 |
| `toolRecordLine` (`toolRecord.ts:44`) | 静态 system 行(并进 `baseSystem`,`turnLoop.ts:217`):明说这类行是平台生成的档案、不是调用工具的写法;调用工具**只能**走工具通道 |
| `detectPhantomToolNarration()` (`toolRecord.ts:64`) | 检出模型照抄。**新旧两种前缀都认** —— 存量 journal 与存量会话上下文里全是旧模板,删掉旧判据等于把探针对存量会话关掉 |

🔴 **刻意不假装 ① 能万无一失**:任何文本渲染都可能被模仿(测试里就断言了新模板被照抄同样会被检出)。
所以配一层确定性检出 —— `turnLoop.ts:901`:

```
本轮可见正文出现记录行  AND  本 turn 一个工具都没执行过(ranTool=false)
        ⇒ 走既有纠偏机制(占 MAX_CORRECTIVE_ROUNDS 共享预算),让模型带着
          「必须走工具通道、工具没返回前不许陈述操作已完成」重做一轮
```

判据是两个确定性事实的合取,不含任何语义判断;生产 17 轮上 **17/17 命中、零误报**。
`ranTool` 这一半刻意保守:只要本 turn 真跑过工具就不干预(宁可漏,不误伤)。

### 4.3 round_discarded 的可观测性(`turnLoop.ts:690` / `:762`)

线上 39 条 `round_discarded` 的 payload 是 `{"type":"round_discarded"}` —— 只有 type、零原因;
归因只能靠「同轮碰巧还有一个 error 帧」去 join,而**作废后重打成功的那 8 轮连 error 帧都没有**,
「这一轮为什么闪了一下重来」在库里永久无解。现在两个发射点各自自证:

```jsonc
// 内容层(协议泄漏)
{"type":"round_discarded","reason":"protocol_leak","attempt":1,
 "markerFamily":"barred_token","marker":"</｜｜DSML｜｜","markerHex":"3c 2f ff5c ff5c 44 53 4d 4c","passedChars":0}
// 传输层(瞬态流错误)
{"type":"round_discarded","reason":"transient_stream_error","attempt":1,"detail":"…"}
```

配套日志:`DSML protocol leak intercepted` 补 `channel / marker_family / marker / marker_hex / has_tool_use / will_retry`;
判死那条补一条 `log.error("protocol leak unrecoverable, turn failed")` 带 family 与 hex
(它是全站第二大错误码,此前日志里没有任何能区分变体族的字段)。

**为什么带 `marker_hex`**:线上 `｜` 是 U+FF5C,在终端/截图里与 ASCII `|` 肉眼无差 ——
上一轮排查正因为信了字形,得出过「名单漏了 ASCII 双竖线」这个错误结论。**报字节,别报字形。**

下游安全性:`round_discarded` 的四份消费方(claw/prism/search fold + `eventlog_store.go:426`)与小程序
都只 `switch (type)`,新增字段是纯增量;backend `hub.go:2109` 原样入 journal。

### 4.4 熔断重打不再是原样重放(`turnLoop.ts:774`)

线上 `round N 熔断 → round N+1 又熔断 → 判死` 的相邻对反复出现:`MAX_DSML_RETRIES=1`,原样重发等于
赌同一个非确定性故障不再发生。现在重打前把 `protocolRetryDirective`(`turnLoop.ts:106`)并进 `system`(只并一次):
明说上一次把工具调用写进了正文、这次只能走工具通道。

**刻意改 `system` 而不是 push 一条 user 消息**:后者会在「上一条就是 user」时形成 user-after-user 非法序列
(DSML 路径上污染的 assistant 消息**不进 history**,所以最后一条确实可能是 user)。

### 4.5 明确**没有**改的(以及为什么)

| 项 | 决定 | 理由 |
|---|---|---|
| `openai/adapter.ts` 的 tools 出站 / tool_calls 入站 | **不改** | 那条道 88 轮零破损,聚合状态机(按 index 建块、arguments 逐片 `+=`、finish_reason 有兜底)对读无误。本次症状与它无关 —— 在这里改动只会引入风险 |
| `turnLoop.ts:762` 缺 `roundEmittedThinking` 守卫(02 报告缺陷 #3) | **不加** | 加了会让「有 thinking 的 DSML 轮」不再重试、直接判死。线上几乎每个 DSML 轮都有 thinking ⇒ 这一改会把 `model_protocol_error` 显著推高。真正的解是让 `round_discarded` 能撤 thinking 块(要动四份 fold),单独立项。**代价是重打后界面可能留两份思考** —— 已知、可接受 |
| 从泄漏文本里反解出工具调用并合成 `tool_use` 执行(03 报告建议 #2) | **不做** | 那是在执行「上游解析器明确拒绝解析」的东西,风险与收益不对称;1-2 天工作量,应单独立项并配权限层复核 |
| `adapter.ts:547-573` 非流式 `create` 丢 tools/tool_calls | **不改** | 当前无调用方传 tools,属潜伏雷;混进本次修复会让改动面失焦。记在 §七 |
| `agent_turns.model_main` 在失败轮为空 | **不改** | backend 侧改动,不在本次范围;但它是**所有按模型统计的系统性低估源**,§七 已记 |

---

## 五 测试:行为断言 + 变异测试

### 5.1 新增/改写的用例

- `agent/src/turn/guards.test.ts` —— 新增 `ProtocolLeakGuard · 生产原文回归` 与 `detectPhantomToolNarration` 两组。
  **fixture 全部是 `agent_turn_events.payload.$.text` 的原样字节**,不是手编样例:
  `turn 2408 ev44/45`(截图那一轮,跨帧切点)、`id=451548`、`id=475341`、`id=491158`、`turn 652`、`turn 881`;
  幻影侧用 `turn 2408 / 2409 / 2417` 的正文原文。
  竖线一律写成 `const F = "｜"` 转义 —— 让「这里到底是哪个码位」在评审时不可能看错。
  含一条**逐字节切帧**用例:把 turn 2408 原文在**每一个**切点切成两帧喂进去,任意切点都必须拦住。
- `agent/src/server/shadowTurn.fold.test.ts` —— 新增「折行不得再是第一人称动作句」,并断言
  **渲染器与检出器同源**(模板一改而检出器没跟上,幻影探针就静默失效,而它没有任何红灯)。
- `agent/src/turn/journalOrdering.test.ts` —— 新增 `round_discarded 归因不变式`(源码级断言,沿用该文件既有纪律:
  发帧点的存在性/顺序本身就是不变式,粗粒度判据比 AST 解析更耐活)。

### 5.2 变异测试(把红的输出贴在这里)

**M1 —— 把判据整体退回「字面量名单 + 字面量前缀 holdback」(= 2026-08-07 之前的线上实现)。**
`42 pass / 7 fail`,红的正是生产原文那几条:

```
(fail) 三条纯闭标签生产原文:全部熔断,且只放行标记之前的真实正文
error: 整帧就是标记,一个字都不该放行
- ""
+ "</parameter>
+ </invoke>
+ </｜｜DSML｜｜tool_calls"

(fail) 逐字节切帧喂入 turn 2408 原文:任意切点都拦得住
error: 切点 1 漏了标记
Expected to not contain: "DSML"
Received: " PAF 和 Markov 模型纳入公共卫生决策。\"</｜｜DSML｜｜parameter>\n</｜｜DSML｜｜invoke>\n</｜｜DSML｜｜tool_calls>"

(fail) turn 2408 跨帧闭标签:干净前缀照发、标记体一个字节都不下发
Expected: " PAF 和 Markov 模型纳入公共卫生决策。""
Received: " PAF 和 Markov 模型纳入公共卫生决策。"</"
```

第二段红色输出**逐字符等于 2026-08-07 09:15 用户截图里的那串乱码** —— 这就是「这次真的能拦住」的证明。

**M2 —— 只把 holdback 退回老口径(要求尾巴以 `<` + 竖线开头,`</` 扣不住),形状族保持不变。**
`46 pass / 3 fail` —— 证明检测与 holdback **两处都必须修**,只改一处仍会漏:

```
(fail) turn 2408 跨帧闭标签
Expected: " PAF 和 Markov 模型纳入公共卫生决策。""
Received: " PAF 和 Markov 模型纳入公共卫生决策。"</"      ← `</` 被放给了用户

(fail) 逐字节切帧喂入 turn 2408 原文
error: 切点 30 漏了标记
Received: " PAF 和 Markov 模型纳入公共卫生决策。\"</｜｜DSML｜｜parameter>\n"
```

两次变异后均已还原(`md5` 与变异前快照一致),全量复跑绿。

---

## 六 复跑命令与结果

```bash
cd /Users/youngp/mypro/fuck_副本/scholar && docker run --rm -v "$PWD":/repo -w /repo/agent \
  --security-opt seccomp=./docker/seccomp/agent-bwrap.json --security-opt apparmor=unconfined \
  --entrypoint sh $(docker inspect scholar_agent --format '{{.Config.Image}}') -c 'bun test'
```
```
 360 pass
 0 fail
 1283 expect() calls
Ran 360 tests across 39 files.
```
同镜像 `bunx tsc --noEmit` 无输出(typecheck OK)。改动前基线是 `343 pass`(同一命令),新增 17 条。

---

## 七 未修 / 下一步(按 ROI)

| # | 项 | 性质 | 备注 |
|---|---|---|---|
| 1 | **部署**。本次改动**未提交、未部署**;链 A 的漏网与链 B 的幻影在生产上仍在发生 | 运维 | 线上 `scholar_agent` 镜像 created 2026-08-02,`leakGuard.ts` / `shadowTurn.ts` 的线上 md5 与修改前的本地工作区一致 —— 即**审的就是跑的**,改的还不是跑的 |
| 2 | 幻影交付的**带外指标**:`content_delta` 含记录行且本轮 `tool_use=0` | 观测 | 本次只做了 turn 内纠偏;要看趋势还需 backend 侧落一个计数(探针 SQL 见 01 报告 §附) |
| 3 | `agent_turns.model_main` 在失败轮为空(166 轮) | 归因 | 任何按 model 的统计都会低估;error payload 里明明写着模型名 |
| 4 | `round_discarded` 撤不掉本轮已发出的 thinking 块 | UI | 要动四份 fold + backend,单独立项(见 §4.5) |
| 5 | 把 DeepSeek 从 anthropic 道切到 OpenAI 道跑一批,看泄漏率变化 | 实验 | 两条道是 DeepSeek 侧两份不同实现,**可实测且便宜**,是验证链 A 归因的最直接手段 |
| 6 | `mapStopReason` 补 `content_filter` / `insufficient_system_resource` 分支 | 分钟级 | 现在被静默吞成 `end_turn`(仅影响 Qwen/GLM 道) |
| 7 | GLM 补 `tool_stream:true`;Qwen 补 `parallel_tool_calls:true` | 小时级 | GLM 不开 → arguments 不分片 → 前端流式写文件卡在 GLM 上完全失效;Qwen 不开 → 每轮最多一个工具 |
| 8 | 非流式 `create()` 补 tools/tool_calls(或直接删掉让所有调用走 stream 缓冲) | 潜伏雷 | 今天不炸,谁哪天给它传 tools 就静默失效 |
| 9 | 评估 DeepSeek `/beta` + strict schema | 天级 | 目前唯一一条「可能从源头减少 DSML 退化」的官方杠杆,需 76 个 MCP 工具 schema 改造 |
