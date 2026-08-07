# 幻影工具链 · 结构性根治方案

> 2026-08-08 · 承接 [ROOTCAUSE.md](ROOTCAUSE.md) 链 B。上一轮落的是**检测器**(`toolRecord.ts` + turnLoop 纠偏),
> 用户判定不够,要求「从代码逻辑层面彻底解决」。本文论证并给出**结构性**方案:
> 冷重播时把历史工具调用还原成真正的 `tool_use` / `tool_result` 块,而不是折成 assistant 正文。
>
> 全程线上只读取证(154.201.87.103,只 SELECT / docker inspect / docker logs),代码结论全部带 file:line。
> **本文只做设计与取证,未改任何源码。**

---

## 〇 一句话结论

**折成文本这件事,当初的两条理由(配对会 400 / 全量回喂太贵)都是真的,但它们要求的是「别回喂 payload」,
不是「别回喂结构」。** 折叠把这两件事混成了一件。

- 配对风险:线上全量 **12,977 次 tool_use,孤儿 1 个(0.008%)**,1728/1729 个有工具的轮是完美的 `TⁿRⁿ` 形状
  —— 而且这 1 个孤儿用一条确定性修复(补一条 `is_error` 占位结果)就能消掉,**上游 400 在结构上变成不可能**。
- 成本:全量回喂 tool_result 正文确实贵到不能做(30 轮窗口 **均值 266KB ≈ 102K token**,最坏 3.6M token)。
  但**结构块里装什么由我们定** —— 把今天那条摘要塞进 `tool_result.content`,字节数与今天几乎一样
  (实测均值 8.6KB vs 今天 6.1KB,+0.9K token/次冷重播),而 assistant 通道里那句「工具调用长这样」的示范**消失了**。

一句话:**同样的字节,换个信封。** 信封换了以后,模型再怎么模仿历史,模仿出来的也是「发起一次真的工具调用」。

⚠️ 顺带修正任务书里的一句表述:「模型模仿不了它看不见的东西」——**它看得见 tool_use 块**(warm 会话每一轮都在看)。
真正起作用的机制不是「看不见」,而是**通道归属**:
折行是写在 **assistant 通道**里的,对模型来说那就是「我自己产出过的东西」,模仿它 = 写散文;
结构块里工具调用在 **tool_use 通道**、结果在 **user/tool 通道**(模型永远写不了的通道),模仿它 = 发起真调用。
**把有害的 few-shot 变成有益的 few-shot**,这才是这套方案的本体。

---

## 一 ① 当初为什么折成文本?(读注释 + git 考古 + 逐条核实)

### 1.1 两次改动,两个不同的理由

| 版本 | commit | 行为 | 自述理由 |
|---|---|---|---|
| 初版 | `a30add8d2`(shadowTurn.ts 引入时) | `blocks.filter(b => b.type === "text")` —— **工具块 100% 丢弃** | 「Anthropic 强约束『每个 tool_result 必须紧跟含对应 tool_use 的 assistant 消息』。**journal 窗口切割 / 并行调用 / 中间夹 assistant 文本**都可能产出无法配对的孤儿 tool_result → 400」 |
| 二版 | `545c75746`(2026-08-02,证据账本 P0) | 工具块折成 assistant **一行文本** | ①「折成 text 块根本不需要配对」→ 拿掉了丢弃;②「刻意**不**把全量 tool_result 折回去:那是每轮重发 ~100K token,成本与注意力稀释不可持续」(`shadowTurn.ts:55-56`) |

原文见 `git show a30add8d2:agent/src/server/shadowTurn.ts`(第 30-37 行)与 `agent/src/server/shadowTurn.ts:43-56`。

**关键观察**:二版核实了「折成 text 不需要配对」——这句是对的,但它回答的是**另一个问题**。
它从来没有回头问「那结构化回喂到底可不可行」,于是初版那条**配对恐惧**被原样继承了下来,
和二版新提出的**成本约束**捆在一起,共同锁死了「必须是文本」这个结论。

### 1.2 逐条核实初版的三个恐惧(线上全量数据)

**(a)「journal 窗口切割会切出孤儿」—— 结构上不可能。**

seed 的窗口是 `hub.go:834` 的 `ReadRecentTurns(ctx, sessionID, 30)`,
而 `eventlog_store.go:257` 的实现是**先按 turn 取 30 个 turn_id、再取这些 turn 的全部事件**:

```go
Order("seq DESC").Limit(limitTurns).Pluck("id", &turnIDs)     // 整轮为单位
Where("turn_id IN ?", turnIDs).Order("id ASC")                // 该轮全部事件
```

⇒ 切点永远落在**轮边界**,一个 `tool_use` 和它的 `tool_result` 同属一轮、要么都在要么都不在。
这条恐惧在当前实现下**为零**。

**(b)「并行调用会打乱配对」—— 实测 1728/1729 完美。**

把每轮的 tool_use/tool_result 事件按 `ev_seq` 拍成 `T`/`R` 串:

```
p           turns          （前 15 名,全部是 TⁿRⁿ 的重复）
TR          251
TRTR        147
TRTRTR       89
TTRR         68
TTTRRR       56
TRTRTRTR     48
TTRRTTRR     36
...
```

对全部 1729 个有工具的轮做形状校验(每段 `T` 的长度必须等于紧随其后 `R` 的长度):
**malformed = 1**,就是 `turn 1231: TRTRTRTRTTTRRRTRTRT` —— 末尾一个 `T` 没有 `R`(轮被中断)。
并行批本身产出的是干净的 `TⁿRⁿ`:`runTools.ts:44` 的 `Promise.all` 返回值与入参**同序**,
且 `runOne` 的所有失败路径都回 `is_error` 的 tool_result(`runTools.ts:139/180`),**从不丢结果**。

**(c)「中间夹 assistant 文本」—— 不影响配对**,因为文本块本来就属于那条 assistant 消息;
按「相邻性」而不是「全局 id 表」还原,文本自然并进 tool_use 所在的 assistant 消息(见 §四算法)。

**孤儿总量(全量 journal,2477 轮):**

```
tool_use  总数 12977   id 为空 0
tool_result 总数 12976  id 为空 0
孤儿 tool_use（同轮无结果）   1
孤儿 tool_result（同轮无调用） 0
```

⇒ 初版那条恐惧**在种类上成立、在量级上是 1/12977**,而且是可确定性修复的(§四.3)。

### 1.3 核实二版的成本约束(它是对的,但只约束 payload)

30 轮 seed 窗口内、每个会话的 tool_result **正文**总量(586 个有工具的会话):

| 口径 | 字符 | ≈token(2.6 字符/token) |
|---|---|---|
| 全量回喂 tool_result 正文 | 均值 **266,084** / 最坏 **9,386,411** | **102K** / **3.6M** |
| 今天的折行(~300 字符/次 × 均 20.5 次) | 均值 6,138 | 2.4K |

**二版说得完全对:全量回喂做不了。**(而且「保最近 4 轮全量」这种按轮的折中也没用 ——
实测很多会话的工具全压在最后 2-4 轮,`last4 ≈ full`。预算只能按 token/字符,不能按轮。)

**但这条约束**约束的是 `content` 里装多少字节,**跟这些字节装在 `text` 块还是 `tool_result` 块无关。**

---

## 二 这个折叠现在到底伤了多少(线上量化)

### 2.1 冷重播的发生频率:13.7% 的轮,是下限不是上限

冷重播 = executor 内存 meta 被驱逐后重灌。驱逐条件(`sessions.ts:414/548`):
`lastActiveAt` 超 `IDLE_TTL_MS`(默认 **30 分钟**)**且无活跃 WS 订阅者`;
另有 `MAX_SESSIONS=200` 的 LRU 硬帽(`sessions.ts:415`)——忙时会更早驱逐。
而 WS 订阅者在最后一个前端 tab 离开 **3 分钟**后就被 hub 摘掉(`hub.go:1038` `hubGracePeriod`)。

按「同会话内与上一轮间隔 ≥30 分钟」统计(**必然**已被驱逐的那部分):

```
all_turns 2442    cold_turns 335    13.7%
冷轮之前的历史工具调用数:均值 46.6,最大 351
```

即:**每 7 轮就有 1 轮**,模型开局要先读 **平均 46.6 条**「〔平台记录…〕/【已调用 …】」的 assistant 正文示范。
容器重启会把当时全部在册会话一次性打冷 —— 线上 `scholar_agent` `RestartCount=0`、`StartedAt=2026-08-04`,
本窗口内没吃到这一发,所以 13.7% 是**下限**。

### 2.2 17 起幻影轮:17/17 落在「以冷重播开局的纪元」内

```
id    session   created_at            model            gap_min  hist_tools  tools_this
1971  58d46c0b  2026-08-03 10:11:54   glm-5.2             959        67          7
2036  a02943c1  2026-08-03 15:35:50   deepseek-v4-pro    1052       211          0
2072  a02943c1  2026-08-03 17:45:26   deepseek-v4-pro      33       252          0
2073  a02943c1  2026-08-03 17:48:04   deepseek-v4-pro       2       252          0
2157  58d46c0b  2026-08-04 10:38:34   deepseek-v4-pro      56        75          0
2205  a02943c1  2026-08-04 16:22:48   deepseek-v4-pro    1096       319          0
2207  a02943c1  2026-08-04 16:27:51   deepseek-v4-pro       5       319          0
2269  a02943c1  2026-08-05 14:54:47   deepseek-v4-pro    1310       351          0
2319  6a87eb55  2026-08-06 03:55:06   deepseek-v4-pro     145       126          0
2321  03dc153f  2026-08-06 06:43:45   deepseek-v4-flash   166         9         20
2362  857ba9e6  2026-08-06 16:38:12   deepseek-v4-pro    1141        55          0
2408  f3144700  2026-08-07 09:15:48   deepseek-v4-pro       0        53          0
2409  f3144700  2026-08-07 09:19:38   deepseek-v4-pro       3        53          0
2417  f3144700  2026-08-07 10:17:39   deepseek-v4-pro      58        53          0
2418  f3144700  2026-08-07 10:19:07   deepseek-v4-pro       1        53          0
2419  f3144700  2026-08-07 10:23:16   deepseek-v4-pro       1        53          0
2420  f3144700  2026-08-07 10:25:09   deepseek-v4-pro       4        53          0
```

- 每个「首发」幻影轮的 `gap_min` 都 ≥30(959/1052/33/56/1096/1310/145/166/1141/58),后续小 gap 的是同一纪元内的自我强化。
- 唯一 `gap=0` 的 2408:它前面的 2407 在 `2026-08-07 09:14`,而该会话上一轮是 `2026-08-06 20:44` ——
  **间隔 750 分钟**,2407 才是那次冷重播,2408 继承了同一份被污染的 `meta.messages`。
- `hist_tools` 最小 9、多数在 50-350 —— **示范样本越多,中招越确定**。

### 2.3 折叠还静默打坏了三个诚实性护栏(此前没人记这笔账)

这三处判据全部要求**结构化的工具块**;冷重播后 messages 里一个都没有:

| 护栏 | 位置 | 折叠后的行为 |
|---|---|---|
| 交付宣称 | `verifyClaims.ts:132` `sessionHasOutWrite()` 扫 assistant 的 `tool_use` + 配对的非错 `tool_result` | 恒 `false` ⇒ 用户问「上次那份报告呢」,模型答「已导出」→ 被判**假交付** |
| 通读宣称 | `verifyClaims.ts:175` `everRead` 扫 assistant 的 `tool_use{Read/ReadDocument}` | 恒 `false` ⇒ 上一纪元真读过全文,本纪元一说「已通读」就是**铁证误判** |
| 引用核验语料 | `verifyClaims.ts:78` `buildEvidenceCorpus()` **只收 role==="user"** 的 text/tool_result | 折行全在 assistant ⇒ **一个字都不进语料**,DOI 只能靠账本兜(该文件 line 70 的注释已经承认了这个缺口) |

所以折叠的代价不止「教会模型编造」,还包括「把抓编造的三把尺子在冷会话里同时清零」。
结构化还原**一次性修好这三处**,不需要额外代码。

---

## 三 ② 两条道各自的协议要求(以及 DeepSeek 原生道的特殊性)

### 3.1 最强的一条论据:结构块**不是新东西,是 warm 会话每一轮都在发的东西**

`turnLoop.ts:797` 把模型返回的 **完整 content(含 tool_use 块)** 原样 push 进 `messages`;
`turnLoop.ts:1010` 把本轮全部 `tool_result` 作为**一条 user 消息**push 进去。
⇒ 一个跑到第 10 轮的 warm 会话,第 11 次 LLM call 发出去的就是**结构化的 tool_use/tool_result 序列**。
线上 DeepSeek 上跑了 **2272 轮 / 12,034 次真实 tool_use**,anthropic 原生道对这个形状**已被生产验证**。

**冷重播是全系统里唯一一处不这么发的地方。**结构化还原不是引入新协议,是**把这处特例消掉**。

### 3.2 Anthropic 道(DeepSeek `/anthropic` 直连)

| 约束 | 说明 | 我们怎么满足 |
|---|---|---|
| `messages[0].role === "user"` | 硬约束 | journal 每轮以 `EvUserMessage` 开头 + 按轮切窗 ⇒ 天然成立;仍加一条兜底(丢掉前导的非 user) |
| 每个 `tool_use` 必须被**紧随其后**的 user 消息里的 `tool_result` 应答 | 硬约束,少一个即 400 | 修复遍补 `is_error` 占位(§四.3) |
| `tool_result` 块必须在该 user 消息 content 的**最前面** | 硬约束 | 还原产出的 user 消息**只含** tool_result(与 `turnLoop.ts:1010` 同形);极端合并场景把 tool_result 排前 |
| `tool_result.content` = 字符串或 text/image 块数组 | 硬约束 | 线上 12,976 条**全部**是 `[{type:"text",text}]`(实测 `JSON_TYPE`=ARRAY、`content[0].type`=text、`JSON_LENGTH`≤1),原样可用 |
| 块内**不认识的字段 → 400** | 硬约束 | 🔴 `FoldToMessages`(`eventlog_store.go:489`)会往块里塞 **`user_message`**(485/12,976 条有)——**必须白名单剥掉**。今天折成文本所以从没暴露 |
| `tool_use.input` 必须是 object | 硬约束 | journal 全量 `input` 均为 OBJECT(ROOTCAUSE §二已验),缺省补 `{}`(fold 已做) |
| **DeepSeek 特有**:网关把结构块渲染成 DSML,结果包在 user 侧 `<tool_result>` 里,**多结果按前一条 assistant 的 tool_calls 顺序排** | 见 [03-vendor-specs](03-vendor-specs.md) §3.1 引的模型卡 | 还原时把 results **按 tool_use 顺序**排(不按 journal 到达序) |
| `thinking` 块 | Claude 扩展思考在工具轮要求回放 thinking;DeepSeek 道无此要求 | 保持今天的行为:**不回喂**(fold 已如此,warm 路径则保留 —— 这是既有差异,本方案不动) |

### 3.3 OpenAI 道(千问 / GLM,经 `openai/adapter.ts`)

`toOpenAIMessages`(`adapter.ts:69`)**已经**完整支持结构块,**一行都不用改**:

- assistant 块数组 → `{content: text||null, tool_calls:[{id, type:"function", function:{name, arguments: JSON.stringify(input)}}]}`(`adapter.ts:84-100`)
- user 里的每个 `tool_result` → 独立 `{role:"tool", tool_call_id, content: 字符串化}`,`is_error` 加 `[error] ` 前缀(`adapter.ts:109-117`)

协议要求与 Anthropic 同构:每条 `role:"tool"` 必须紧跟声明了该 `tool_call_id` 的 assistant,
`tool_call_id` 对不上即 400。`arguments` 必须是 **JSON 字符串**(adapter 已 stringify),故 `input` 必须保持 object 形。

**id 形态**:线上 id 是 DeepSeek 网关给的 `call_<24hex>`(32 字符)/ `call_00_<...>`(35 字符)。
跨道跨厂商没有统一的 id 规范,且会话中途可能切模型/failover(`hub.go` 的失败切换)⇒
**还原时重铸 id**(`tu_1..tu_n`,纯 ASCII、短、两侧同时改写)是零成本的抗风险动作,顺带消掉「空 id」这一整类隐患。

---

## 四 ④+ 方案:结构化冷重播(可直接实施)

### 4.0 落点与边界

- **只改 executor 一侧**:`convertFlatToAnthropic`(`shadowTurn.ts:64`,唯一生产调用点是 `ws.ts:208`)。
- **backend 零改动**:`FoldToMessages` 已经把 id / name / input / content / is_error 全部保留(`eventlog_store.go:437-489`)。
- **前端 / journal / 归档零改动**:seed 是执行器内部的请求构造,不产帧、不落库。
- 建议把函数搬到新文件 `agent/src/server/replayHistory.ts` 并从 `shadowTurn.ts` re-export
  —— `/api/turn` 的 shadow 路径今天是 dormant 的,把「每 7 轮就跑一次的生产路径」挂在一个 dormant 文件里会持续误导评审。

### 4.1 三条不可协商的设计规则

> 这三条是本方案的**本体**;实现细节都可以改,这三条不能。

1. **assistant 通道里永远不出现「工具调用发生过」的散文。**
   一次历史工具调用只能以 `tool_use` 块出现;它的结果只能以 `tool_result` 块出现。
   assistant 通道里但凡有一行描述工具调用,就是给模型的照抄模板 —— 这是本次故障的**唯一**根因。
2. **一切降级产物只能落在模型写不了的通道里**(`tool_result.content` / user 消息)。
   降级信息也是内容,内容放错通道就是新的模板(见 §4.4)。
3. **结构与内容分离**:结构永远还原(廉价、协议要求);内容按预算决定装多少(昂贵、可调)。
   今天的折叠把两者绑死了,这就是全部问题。

### 4.2 输出形状(目标)

```
user      [ {text: "帮我查 ADHD 的 fMRI 研究"} ]
assistant [ {text:"我先检索"},                                       ← 原 assistant text 块
            {tool_use, id:"tu_1", name:"mcp__minicod__search_papers",
                       input:{query:"ADHD fMRI", limit:20}} ]        ← 真结构块(input 按预算截断)
user      [ {tool_result, tool_use_id:"tu_1",
             content:[{type:"text", text:
               "[平台·历史记录] 命中 16 条;已入证据账本 E1–E16。"
               "原文已不在上下文中,需要请用 EvidenceGet / Read 读回。"}]} ]
assistant [ {text:"我检索了 16 篇……"} ]
```

与今天唯一的差别:那一行摘要从 **assistant 的 text 块**搬进了 **user 的 tool_result 块**,
并且它前面多了一个真的 `tool_use` 块。字节数几乎不变,通道彻底变了。

### 4.3 算法(四遍,每遍职责单一)

```ts
// agent/src/server/replayHistory.ts
// 冷重播:journal 扁平流 → Anthropic messages。**结构还原**,不是文本折叠。
//
// 🔴 铁律(见 docs/research/toolcall-protocol-2026-08/10-phantom-structural.md §4.1):
//    历史工具调用只能以 tool_use / tool_result 块出现;assistant 通道里永远不写
//    「调用了什么、返回了什么」——那是模型照抄的模板,2026-08-03~08-07 已经炸过一次。

type Blk = Record<string, unknown>;
interface Draft { role: "user" | "assistant"; blocks: Blk[]; kind: "text" | "results" }

export function convertFlatToAnthropic(flat: FlatMessage[], opts: RestoreOptions = {}): Anthropic.MessageParam[] {
  // ── 遍 1:线性还原成草稿。不做任何修复,只保序 + 归通道。
  //    合并规则:同 role 且 kind 相同才并;text 型 user 与 results 型 user 不并成一条,
  //    避免出现「text 在前、tool_result 在后」的非法 user 消息。
  const draft: Draft[] = [];
  for (const m of flat) {
    const blocks = Array.isArray(m.content) ? (m.content as Blk[]) : [];
    for (const b of blocks) {
      if (!b) continue;
      switch (b.type) {
        case "text":
          if (typeof b.text === "string" && b.text) {
            // 🔴 存量污染清洗:上一轮的伪造记录行就在 journal 的 content_delta 里,
            //    原样重播 = 继续喂 few-shot。整行删除(它描述的动作从未发生)。
            const t = stripRecordEcho(b.text);
            if (t) put(draft, m.type === "user" ? "user" : "assistant", "text", { type: "text", text: t });
          }
          break;
        case "tool_use":
          put(draft, "assistant", "text", {
            type: "tool_use",
            id: String(b.id ?? ""),                    // 遍 3 会重铸
            name: String(b.name ?? ""),
            input: (b.input && typeof b.input === "object") ? b.input : {},
          });
          break;
        case "tool_result":
          put(draft, "user", "results", {
            type: "tool_result",
            tool_use_id: String(b.tool_use_id ?? ""),
            is_error: b.is_error === true,
            content: b.content,                        // 遍 4 决定装多少
          });                                          // ⚠️ user_message 等字段在此被白名单挡掉
          break;
        // thinking / artifact / error / research_state:不回喂(与今天一致)
      }
    }
  }

  // ── 遍 2:配对修复。目标是「上游 400 在结构上不可能」,所以它必须是**全函数**:
  //    任何输入都能产出合法结构,不存在「修不了就回落散文」的分支。
  //    a) 某条 assistant 有 tool_use,但后面不是 results 型 user  → 在其后插入一条,补齐全部占位;
  //    b) results 型 user 里有 id 对不上前一条 assistant 的       → 丢弃该块(计数,不narrate);
  //    c) 前一条 assistant 的 tool_use 少了结果                   → 补 is_error 占位(见 §4.4 D1);
  //    d) results 出现在任何 assistant-with-tool_use 之外的位置    → 整条丢弃;
  //    e) 首条不是 user                                           → 丢弃前导 assistant;
  //    f) 结果按 tool_use 顺序重排(DeepSeek 网关按序渲染 <tool_result>)。

  // ── 遍 3:id 重铸。tu_1..tu_n,两侧同时改写。消掉空 id / 跨厂商 id 形态 / 跨会话重复三类隐患。

  // ── 遍 4:预算。见 §4.5。默认策略下每条 tool_result.content 都是摘要,不是原文。

  // ── 自检(便宜且总跑):assertPaired(out) 不通过 → 剥掉出问题的相邻对的**工具块**
  //    (退化成「这一段没有工具」),**绝不**退化成散文。同时 log.error 计数。
  return out;
}
```

`put()` 的合并语义(直接对应 §三的协议约束):

| 前一条 | 新块 | 动作 |
|---|---|---|
| assistant/text | assistant text 或 tool_use | 并入(同一条 assistant 消息可含 `[text, tool_use, tool_use]`) |
| user/results | tool_result | 并入(同一批结果同一条 user 消息 —— 与 `turnLoop.ts:1010` 同形) |
| user/results | user text | **不并**,另起一条 user(避免 tool_result 后面跟 text) |
| 其它 | — | 另起 |

### 4.4 ④ 降级形态(用户点名要求:不能长得像模型自己能产出的东西)

**判据不是「读起来像不像」,是「这段字节落在哪个通道」。**
模型能产出的只有 assistant 通道(text / thinking / tool_use)。
所以降级产物一律塞进 `tool_result.content` 或 user 消息 —— 它照抄的**前提条件不存在**:
要让一段文字出现在 tool_result 里,模型必须先发一个真的 tool_use,而那正是我们要的行为。

| 编号 | 触发 | 降级产物 | 为什么是这个形态 |
|---|---|---|---|
| **D1** | tool_use 有、结果缺(线上 1/12977:轮被中断 / journal 写失败) | 同 id 的 `tool_result{is_error:true, content:[{text:"[平台] 这次调用的结果没有被记录(会话重载或上一轮被中断)。不要据此推断结果;需要就重新调用。"}]}` | 落在 tool 通道;`is_error` 让模型**倾向重做**而不是编造结果;不含任何「命中 N 条」式可编造数字 |
| **D2** | 结果有、调用缺(线上 0) | **整块丢弃** + 计数 | 没有 tool_use 就没有合法容器;凭空造一个 tool_use = 伪造模型动作(与 `turnLoop.ts:275` 预检索刻意不手搓 tool_use 同一条纪律) |
| **D3** | tool_use 缺 name 或不可解析(线上 0) | **整块丢弃** + 计数 | 同上。宁可少一条历史,不可多一行散文 |
| **D4** | 预算耗尽(§4.5) | `tool_result.content` 换成极简摘要;极端下换成 `"[平台] 更早的工具结果已不在上下文中。"` | 仍在 tool 通道。**tool_use 块本身永不因预算被删** —— 结构是廉价的那一半 |
| **D5** | 自检不通过(不应发生) | 剥掉该相邻对的**全部工具块** | 退化成「这一段历史没有工具」,即 2026-08-02 之前的行为。**明确拒绝**「退化成散文」这个选项 |

🔴 **明确否决的降级形态**:
① 任何 `〔平台记录〕…` / `【已调用 …】` 式 assistant 文本 —— 就是当前 bug;
② 「把工具调用摘要塞进 system」 —— system 是模型读得最重的通道,示范效应更强,且破坏跨轮 prompt 前缀缓存;
③ 「合成一个假的 tool_use 让引擎补跑」 —— 伪造模型动作,与预检索那条纪律直接冲突。

### 4.5 ③ token 成本与截断策略

**默认策略 = 结构全还原 + 内容仍是摘要**(即:今天的字节,换个信封):

| 部件 | 内容 | 字符 |
|---|---|---|
| `tool_use.input` | 逐字段截断:string 值 > `INPUT_FIELD_CAP`(建议 300)截断并加 `…[已截断]`;单次调用 input 总量 ≤ `INPUT_CALL_CAP`(建议 600) | ≤600 |
| `tool_use` 信封 | type/id/name | ~90 |
| `tool_result.content` | `summarizeToolOutcome()` + E-id 区间(复用 `compact.ts:121` / `shadowTurn.ts:117`,两处已有) | ~150 |

线上 586 个会话的模拟(30 轮窗口,均 20.5 次调用):

| 口径 | 均值(字符) | 均值 token | 最坏(字符) | 最坏 token |
|---|---|---|---|---|
| 今天的折行 | 6,138 | 2.4K | 75,600 | 29K |
| **本方案(默认)** | **8,602** | **3.3K** | 121,528 | 47K |
| 全量回喂 tool_result 正文(被否决) | 266,084 | 102K | 9,386,411 | 3.6M |

⇒ 均值 **+2.5KB ≈ +0.9K token / 次冷重播**,按 335 次冷轮算,整段观测期的增量在**几十万 token**量级 —— 可忽略。

**超长会话:必须按块预算,不能按字符也不能按轮。**
最坏那个会话(252 次调用)今天的折行就已经 29K token,本方案 47K —— 两者都需要帽子。
故加一层**全局工具面预算** `SEED_TOOL_CHAR_BUDGET`(建议 24,000 字符 ≈ 9K token),**从最老往最新降级**:

```
预算够      → input 按 §4.5 截断 + 结果摘要
预算不够    → input 降到 describeToolCall() 的产物(~120 字符,即今天折行的信息量)
仍不够      → 结果 content 换 D4 的一句话
兜底        → tool_use 块**保留**(结构不删),input = {}
```

按块降级而不是按字符裁,是因为 Anthropic 的结构约束落在**块**上:
裁字符可能裁出非法 JSON / 破坏配对,裁块永远是合法的。这条与 `context-budget.ts:57`
`pruneOldToolResults`「截 tool_result 正文但**保留块结构**」是同一条纪律,已经在 warm 路径上跑了。

**Phase 2(可选,默认关)**:最近若干条 tool_result 在预算内**回填真实正文**(newest-first,单条 ≤4KB)。
收益不是省钱而是准确性 —— `buildEvidenceCorpus`(`verifyClaims.ts:78`)只收 user 通道,
回填后上一纪元的真实 DOI 重新进入引用核验语料,能压掉一批「未核实 DOI」误报。
建议**独立立项**,不要混进本次改动。

---

## 五 ⑤ 与 compact.ts 的关系

### 5.1 压缩之后还能不能还原成结构块?——**能,而且压缩根本不在这条链路上**

- 压缩发生在 **executor 内存**(`ws.ts:maybeReduceContext` → `compact.reduceForWindow`),
  结果只写回 `meta.messages`,**不回写 backend journal**。
- 冷重播的输入是 **backend journal**(`hub.go:834` → `FoldToMessages`),里面存的永远是原始的
  `EvToolUse` / `EvToolResult` 事件。
- ⇒ 一个 warm 纪元里被压缩掉的工具块,在**下一次冷重播时会重新以结构块形式回来**。
  压缩是纪元内的有损降级,不是持久化的信息删除。**它对本方案零阻碍。**

### 5.2 反向影响:结构化 seed 会不会把压缩搞乱?

不会,而且是**修复**:

| 环节 | 折叠(今天) | 结构化(本方案) |
|---|---|---|
| `isTurnStart`(`window.ts:14`) | 冷会话每条 user 都是 `[text]` ⇒ 全是回合起点 | tool_result 型 user 含 `tool_result` 块 ⇒ **不是**起点,与 warm 同口径 ✅ |
| `pruneOldToolResults`(`context-budget.ts:57`) 最廉价那一层 | 冷会话里**无块可裁**,直接空转 | 有块可裁,最便宜的降级层在冷会话里第一次真正生效 ✅ |
| `estimateTokens`(`context-budget.ts:27`) | 只数 text | tool_use.input / tool_result.content 已有分支,自动算上 ✅ |
| 触发时机 | — | 冷会话估算 +3K token ⇒ 压缩可能略早触发。阈值是窗口的百分比,3K 在任何模型上都远不足以改变判定 |
| `renderForSummary`(`compact.ts:130`) | 已支持 tool_use/tool_result 分支 | 无需改动 ✅ |

⚠️ **`window.ts:9` 的注释会过期**(它明写「seed 回来的历史只留 text、丢工具块 ⇒ 每条 user 都是起点」),
本次必须同步改掉 —— 这类「注释描述的是已经不存在的实现」在本仓库有前科。

### 5.3 摘要对本身安全

`compact.summaryPair`(`compact.ts:177`)把摘要放在 **user** 消息里(`【较早对话的摘要】…`),
assistant 侧只有一句固定的「好的,我已了解…」。⇒ 压缩产物天然满足 §4.1 规则 2,**不是模板源**。
(`renderForSummary` 里的 `助手[调用X args]` 也在那条 user 消息内部,风险量级完全不同。)

---

## 六 需要同步做的三处配套(否则改完仍有洞)

### 6.1 存量污染:journal 里已经躺着 17 轮伪造正文

那些正文是 `content_delta` 事件,会被 `FoldToMessages` 折成 assistant text 原样重播 ⇒ **自我强化不会自动停**。
故遍 1 里带 `stripRecordEcho()`:整行删除匹配 `TOOL_RECORD_PREFIX` / `LEGACY_TOOL_RECORD_PREFIX`
(`toolRecord.ts:31/35`)的行。**删而不是替换**:替换成「[平台已移除…]」本身又是一条 assistant 通道里的
工具记录描述。判据复用 `detectPhantomToolNarration` 的正则,**保持单一真源**。

⚠️ 覆盖不全:turn 2417 那种「整段散文式写出 8 步工具链 + grep 行号 + 完整 Python 源码」不匹配任何模板,
`stripRecordEcho` 抓不到。那部分只能靠 §6.3 的检出器。**如实说明,不假装覆盖。**

### 6.2 `turnLoop.ts:217` 的 `toolRecordLine` 必须重写

它今天告诉模型「上下文里形如『〔平台记录·历史工具调用〕…』的行是平台档案」——
改完之后**历史里不再有这种行**,这句话就成了一条**凭空的格式教学**(等于把模板写进 system,比放在
history 里更糟,见 §4.4 否决项 ②)。应改成不含任何模板样例的一句:

> 历史里的工具调用以工具调用记录的形式呈现,不会出现在正文里。要调用工具只能走工具通道(function call);
> 把调用过程、参数或结果写成正文,工具不会被执行,用户会看到一份完全没有发生过的操作记录 —— 这是最严重的一类错误。

### 6.3 检出器 **必须保留**(且它的语义变强了)

`detectPhantomToolNarration` + `!ranTool` 的纠偏(`turnLoop.ts:901`)不能随本次改动删掉:
- 存量会话的正文里还有旧模板(§6.1 抓不全的那部分);
- fold 上线**之前**(A 期)就出现过散文式伪造 —— 那不是我们教的,结构化也治不了(§八.3)。

而且改完之后它的**误报面变成 0**:历史里不再有平台生成的记录行 ⇒ 正文里出现记录行,**只可能**是模型自己写的。
配套改一条测试断言:`convertFlatToAnthropic` 的输出里 `detectPhantomToolNarration(assistantText) === 0`
——这条是**机械护栏**,它一红就说明有人又把工具描述写回了 assistant 通道。

### 6.4 顺手修:`runTools.ts:150` `turnOf()`

```ts
for (const m of input.messages ?? []) if (m.role === "user") n++;   // 把 tool_result 消息也数成了一轮
```
warm 路径今天就在多数(tool_result 是 role:user),冷路径因为折叠反而"碰巧对"。
结构化之后冷热口径统一到"都多数"。**一行改成 `if (isTurnStart(m)) n++`** 即可,
影响面是证据账本里 `turn` 的展示值(账本自己会单调化,不是主键)。

---

## 七 实施清单与验收

### 7.1 改动面

| 文件 | 改动 | 规模 |
|---|---|---|
| `agent/src/server/replayHistory.ts`(新) | 结构化还原 + 修复 + 重铸 + 预算 + 自检 | ~220 行 |
| `agent/src/server/shadowTurn.ts` | 删 `convertFlatToAnthropic`/`foldToolCall`/`extractEvidenceIds`/`renderIds`,改为 re-export | −80 行 |
| `agent/src/turn/toolRecord.ts` | 重写 `toolRecordLine`;`renderToolRecord` 只剩摘要构造用途(或改名 `renderResultDigest` 并挪进 replayHistory) | ~20 行 |
| `agent/src/turn/window.ts` | 注释更正(第 9 行) | 注释 |
| `agent/src/turn/runTools.ts:150` | `turnOf` 用 `isTurnStart` | 1 行 |
| backend / 前端 / journal / 小程序 | **零改动** | — |

### 7.2 测试(全部可离线跑,fixture 用线上原始字节)

必须有的不变量:

1. **协议合法性(核心)**:随机/对抗构造的 flat 流 —— 孤儿 use、孤儿 result、乱序、空 id、
   重复 id、只有 result、以 assistant 开头、tool_result 里带 `user_message` 字段 ——
   输出必须永远满足 `assertPaired()`:首条 user、每个 tool_use 有紧邻配对结果、无未知字段。
   建议直接做**属性测试**(fast-check 或手写 fuzz 200 例)。
2. **通道不变式**:输出里**任何 assistant text 块**都不得包含工具名 + 结果摘要式的句子;
   `detectPhantomToolNarration(assistantTextOf(out)).count === 0`。
3. **`user_message` 字段被剥掉**(485/12,976 条线上数据有它;不剥必 400)。
4. **结果按 tool_use 顺序排**(DeepSeek 网关按序渲染)。
5. **D1 占位**:孤儿 tool_use → `is_error` 占位,且占位文本**不含**任何可编造的数字。
6. **预算**:252 次调用的会话(线上最坏)输出总字符 ≤ `SEED_TOOL_CHAR_BUDGET` + 常数。
7. **两条道各自可翻译**:把输出喂给 `toOpenAIMessages()`,断言每条 `role:"tool"` 的
   `tool_call_id` 都能在紧邻的前一条 assistant 的 `tool_calls` 里找到。
8. **存量清洗**:含旧模板正文的 fixture(turn 2408/2417 原文)过一遍后,记录行消失、其余正文完整。
9. **回合计数**:沿用既有 `shadowTurn.fold.test.ts` 最后那条 —— 起点数不变、role 交替合法。

变异测试(照 ROOTCAUSE §5.2 的纪律,把红的贴进 PR):
- M1 去掉修复遍 → 孤儿用例必须红;
- M2 去掉 `user_message` 白名单 → 字段泄漏用例必须红;
- M3 把摘要写回 assistant text → 通道不变式必须红。

### 7.3 灰度与验收指标

**不要 env 开关。**(本仓铁律:数据完整性不靠 env;而且一个「回落到散文」的开关就是把 bug 留在代码里。)
方案本身是全函数的,自检失败走 D5(剥工具块),不存在需要人肉切换的分叉。

部署后看三个数(全部现有 SQL 可查,见 [01-prod-slice](01-prod-slice.md) §附):

| 指标 | 现状 | 期望 |
|---|---|---|
| 幻影探针(正文含记录行 且 本轮 `tool_use=0`) | 08-05 1 轮 / 08-06 2 轮 / 08-07 6 轮(1.5%→8.3%) | **归零**;非零即说明模型在无模板情况下自发伪造(→ §八.3) |
| 冷重播轮(gap≥30min)的 `tool_use>0` 占比 | 需先取基线 | 应向 warm 轮的水平收敛 |
| `error` 帧里 `code` 含 400 / invalid_request | 当前 0 | **必须保持 0**;出现即结构还原有洞,立刻看 `assertPaired` 的 log.error 计数 |

上线首日盯 `docker logs scholar_agent | grep -E 'seed_restore|assertPaired'`。

---

## 八 这套方案**解决不了**什么(逐条,不留模糊)

1. **链 A 完全不受影响。** DeepSeek `/anthropic` 网关的 DSML 漏解析是上游缺陷,
   本方案一个字节都不碰它。`leakGuard.ts` 仍是唯一防线,`round_discarded` 仍会发生。

2. **存量已污染会话不能完全洗干净。** §6.1 的 `stripRecordEcho` 只删匹配模板的**行**;
   turn 2417 那种整段散文式伪造工具链(含 grep 行号、完整 Python 源码)不匹配任何模板,
   会继续作为 assistant 正文重播。这类会话只能靠 §6.3 的运行时检出器兜。

3. **模型自发的散文式伪造治不了。** fold 上线**之前**(A 期)线上就有 DeepSeek 回落到文本模式的现象
   (ROOTCAUSE §二"仍存疑"#1,未取得上游侧证据)。本方案去掉的是「我们教它」那一份,
   去不掉「它自己会」那一份。**任何声称"彻底解决幻影"的说法都是过头的。**

4. **不还原历史工具结果的原文。** 默认策略下 `tool_result.content` 仍是摘要。
   「上一纪元那次检索到底返回了什么」依然要走 `EvidenceGet` / `Read`。
   Phase 2 的回填是可选项,而且受同一个预算约束 —— 30 轮窗口全量回喂均值 102K token,**永远不会开**。

5. **超过 30 轮的历史仍然丢失。** seed 窗口是 `hub.go:834` 写死的 30;结构化不改变这一点。
   更早的证据只在 `evidence/ledger.jsonl`,而它扛不住 workDir 被 GC(30 天)或换机。

6. **thinking 块仍不回喂。** 对需要工具轮回放 thinking 的模型(Claude 扩展思考)理论上有风险;
   当前三家 provider 都不受影响,但换模型时这是一条要重新验的假设。

7. **artifact / error / research_state entry 仍不回喂**(与今天一致)。
   ⇒ 「上一轮报错了」「上一轮产出了 out/report.docx」这两件事,模型在冷重播后**依然不知道**。
   (`artifact` 那条尤其可惜:`sessionHasOutWrite` 靠 tool_use 恢复了,但产物清单本身仍缺。可另立项。)

8. **不消除孤儿的成因。** 轮被中断 / journal 写失败仍会产生孤儿 tool_use;
   本方案只保证它不再导致 400、也不再变成一句可编造的散文。

9. **跨层契约靠约定,没有编译期保障。** executor 读的是 backend `FoldToMessages` 产出的键名
   (`toolUseId` / `toolName` / `input` / `tool_use_id` / `content` / `is_error`)。
   backend 哪天改键名,executor 会**静默降级**成「没有工具的历史」而不是报错。
   建议加一条两侧同源的形状契约测试(Go 侧产一份 golden JSON,TS 侧读同一份断言),
   否则这就是下一个「一条永远绿的规则」。

10. **不改善 warm 会话。** warm 路径本来就是结构化的;本方案只是把冷路径拉齐。
    如果幻影在 warm 会话里也出现(目前 0 例),说明另有成因。

---

## 九 复跑用的查询(全部只读)

```sql
-- 孤儿率(全量 journal)
CREATE TEMPORARY TABLE tu AS SELECT turn_id, JSON_UNQUOTE(JSON_EXTRACT(payload,'$.toolUseId')) id
  FROM agent_turn_events WHERE ev_type='tool_use';
CREATE TEMPORARY TABLE tr AS SELECT turn_id, JSON_UNQUOTE(JSON_EXTRACT(payload,'$.toolUseId')) id
  FROM agent_turn_events WHERE ev_type='tool_result';
SELECT COUNT(*) FROM tu LEFT JOIN tr ON tu.turn_id=tr.turn_id AND tu.id=tr.id WHERE tr.id IS NULL;  -- 1

-- 每轮 T/R 交错形状(校验 TⁿRⁿ)
SET SESSION group_concat_max_len = 65535;
SELECT turn_id, GROUP_CONCAT(CASE ev_type WHEN 'tool_use' THEN 'T' ELSE 'R' END ORDER BY ev_seq SEPARATOR '')
FROM agent_turn_events WHERE ev_type IN ('tool_use','tool_result') GROUP BY turn_id;

-- tool_result content 形状(是否都是 [{type:text}])
SELECT JSON_TYPE(JSON_EXTRACT(payload,'$.content')), JSON_UNQUOTE(JSON_EXTRACT(payload,'$.content[0].type')),
       MAX(JSON_LENGTH(JSON_EXTRACT(payload,'$.content'))), COUNT(*)
FROM agent_turn_events WHERE ev_type='tool_result' GROUP BY 1,2;

-- 块里有哪些键(user_message 必须剥)
SELECT JSON_KEYS(payload), COUNT(*) FROM agent_turn_events WHERE ev_type='tool_result' GROUP BY 1;

-- 冷重播频率(gap>=30min)
SELECT COUNT(*) all_turns,
       SUM(prev IS NOT NULL AND TIMESTAMPDIFF(MINUTE,prev,created_at)>=30) cold_turns
FROM (SELECT created_at, LAG(created_at) OVER (PARTITION BY agent_session_id ORDER BY seq) prev
      FROM agent_turns WHERE status<>'blocked') g;

-- 30 轮窗口的成本口径(全量正文 / 结构化模拟)
--   见 §1.3 与 §4.5 的两张表,SQL 用 ROW_NUMBER() OVER (PARTITION BY agent_session_id ORDER BY seq DESC) <= 30
```

线上镜像:`scholar_agent` `RestartCount=0`,`StartedAt=2026-08-04T16:35:07Z`
—— 即上一轮落的 `leakGuard` / `toolRecord` 修复**仍未部署**,线上跑的还是 08-02 那版折叠。
