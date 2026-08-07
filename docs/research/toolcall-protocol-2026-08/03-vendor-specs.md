# 03 · 三家厂商 function calling 官方规范对照 + 我们最可能踩的坑

> 调研范围:DeepSeek / 通义千问(DashScope OpenAI 兼容道)/ 智谱 GLM。
> 一手来源 = 各家官方文档 + 模型卡 + 官方 issue;每条实测结论带 file:line 或线上 SQL 输出。
> 线上只读取证:`ssh root@154.201.87.103`,只 SELECT / docker logs。
> 日期:2026-08-07。

---

## 〇 · 一句话结论(先看这个,它推翻了任务书里的强先验)

**不是三家同时出问题。DSML 泄漏 100% 归 DeepSeek,零 Qwen、零 GLM —— 线上账本直接判定。**

```sql
SELECT t.model_main, t.feature_key, COUNT(*) n, MAX(e.created_at) last_at
FROM agent_turn_events e JOIN agent_turns t ON t.id=e.turn_id
WHERE e.payload LIKE '%DSML%' GROUP BY 1,2 ORDER BY n DESC;
```
```
model_main         feature_key    n     last_at
deepseek-v4-pro    prism          64    2026-08-06 03:55:51
deepseek-v4-flash  prism          53    2026-07-25 10:00:42
deepseek-v4-pro    claw           34    2026-08-07 09:15:59   ← 任务书说的「最近 09:15」
deepseek-v4-flash  smart_search   17    2026-07-25 10:02:09
deepseek-v4-flash  claw           16    2026-07-24 14:14:12
```

**同期 Qwen / GLM 命中 0 行。** 但注意基数极不对称,别把这条读成「Qwen/GLM 没问题」:

```
model_main         turns   first_at              last_at
deepseek-v4-flash  1428    2026-07-01 08:19      2026-08-07 22:48
deepseek-v4-pro     797    2026-06-30 12:31      2026-08-07 21:49
(空)                166    2026-06-30 13:49      2026-08-07 22:14
qwen3.7-plus         24 |  glm-4.7-flashx   17 |  qwen3.7-max  15
glm-5.2              13 |  glm-5v-turbo     13 |  qwen3.7-flash 2
```
Qwen+GLM 合计 84 轮 = 全站 3.6%。**统计功效不足以证伪「Qwen/GLM 也会漏」,只能说目前无证据。**
所以本文仍逐家给规范,但优先级要按这个分布排。

**其次:「模型没拿到 tools」这条假设已被证伪。** DeepSeek 在同一批会话里产出了 12034 次
`tool_use` 事件(见 §五 坑 2 的 SQL),tools 参数明确送达且明确生效。真正的机制是:
**DeepSeek 用文本形态(DSML)吐工具调用是它的原生设计,由 DeepSeek 网关侧的解析器负责
转成 `tool_calls`/`tool_use`;这个解析器在压缩形态/退化 token 下会漏解析,漏掉的那一次
工具调用就整段掉进 `content`。** 我们这侧不是「传错了 tools」,而是「对上游解析器失效
这一既定事实,兜底做得不完整」。

---

## 一 · 线上真实配置(所有后续讨论的前提)

```
agent_config (默认 provider,provider_id=0)
  base_url  = https://api.deepseek.com/anthropic     ← Anthropic 协议道!不是 OpenAI 道
  main=deepseek-v4-pro  haiku=deepseek-v4-flash  sonnet/opus=deepseek-v4-pro

agent_providers
  id=1  ??(千问)  https://dashscope.aliyuncs.com/compatible-mode/v1  api_format=openai
  id=2  GLM        https://open.bigmodel.cn/api/paas/v4              api_format=openai

agent_models(enabled=1)
  deepseek-v4-pro / deepseek-v4-flash → provider 0 (anthropic 道)
  qwen3.7-max / qwen3.7-plus          → provider 1 (openai 道)
  glm-5.2 / glm-5v-turbo / glm-4.7-flashx → provider 2 (openai 道)
```

🔴 **关键分叉:主力 DeepSeek 走的是 Anthropic 协议道(`@anthropic-ai/sdk` 直连),
根本不经过 `agent/src/openai/adapter.ts`。** 见 `agent/src/anthropic/client.ts:36-38`:

```ts
const client = p.apiFormat === "openai"
  ? openAIAdapterClient(p)                                    // Qwen / GLM
  : new Anthropic({ baseURL: p.baseUrl, authToken: p.apiKey, apiKey: p.apiKey });  // DeepSeek
```

所以**在 adapter.ts 里找 DSML 的根因是找不到的** —— 那条路上一行 DeepSeek 流量都没有。

---

## 二 · 三家官方规范对照表

### 2.1 请求侧(①⑤)

| 维度 | DeepSeek | 通义千问(DashScope 兼容道) | 智谱 GLM |
|---|---|---|---|
| 我们用的 base_url | `api.deepseek.com/**anthropic**` | `dashscope.aliyuncs.com/compatible-mode/v1` | `open.bigmodel.cn/api/paas/v4` |
| 另有的道 | OpenAI 道 `api.deepseek.com/v1`;strict 模式专用 `/beta` | 原生 DashScope 道 | Anthropic 兼容道 `open.bigmodel.cn/api/anthropic` |
| `tools` 结构 | `{type:"function",function:{name,description,parameters}}`,**上限 128 个 function** | 同 OpenAI 标准 | 同 OpenAI 标准 |
| `tool_choice` 文档声明 | OpenAI 道:`none/auto/required/`具名;Anthropic 道:`none/auto/any/tool` 全支持 | `auto`(默认)/`required`/`none`/具名 | 官方原文「**默认 `auto` 且仅支持 `auto`**」 |
| `tool_choice` **实测**(我们自己的探针) | 🔴 Anthropic 道 `{type:"any"}` **200 静默无视**;`{type:"tool"}` 才 400 | 🔴 qwen3.7-* 一律 **400**(思考态) | ⚠️ **per-model**:`glm-4.7-flashx` ✅ 完全生效;`glm-5.2`/`glm-5v-turbo` 🔴 静默无视 |
| `parallel_tool_calls` | 官方 API 参考**未记载**;Anthropic 道明确「parallel tool use 配置被忽略」 | ✅ 有此参数,**默认关**,置 `true` 才允许一响应多工具 | 未见文档 |
| 强制 schema(strict) | ✅ 仅 `/beta` base_url + 每个 function 加 `"strict": true`;要求所有 property 进 `required` 且 `additionalProperties:false` | ❌ | ❌ |
| 流式工具专用开关 | 无 | 无 | 🔴 **`tool_stream`,默认 `false`**;GLM-5.2/5.1/5/4.7 支持 |
| 思考模式 + 工具 | ✅ 自 V3.2 起支持 | ⚠️ **非流式**调 Qwen3 推理模型必须显式 `enable_thinking:false`,否则 400 | ✅ |
| `tool` 消息回填 | `{role:"tool", tool_call_id, content}` | 同 | 同 |

### 2.2 流式分片规范(②)

| 维度 | DeepSeek | 通义千问 | 智谱 GLM |
|---|---|---|---|
| `index` 语义 | 标识第几个 tool_call(OpenAI 标准) | ✅ 同 | ✅ 同 |
| 首片是否带 `id`/`name` | 是(OpenAI 标准);**但 API 参考文档的 streaming `delta` 章节根本没列 `tool_calls` 字段** | ✅ 官方明写:首片含 `id` + `function.name`(+部分 arguments),后续片仅 `arguments` 增量 | ✅ 同,但**只在 `tool_stream:true` 时才真的分片** |
| `arguments` 是否分片 | 是 | 是 | 🔴 **默认不分片** —— 不开 `tool_stream` 时整个 arguments 一个 chunk 甩出来(社区实测:写大文件时长时间静默后一次性到达) |
| `finish_reason` 取值 | `stop` / `length` / `content_filter` / `tool_calls` / **`insufficient_system_resource`** | 文档未穷举(OpenAI 标准子集) | 文档未穷举 |
| `stream_options.include_usage` | ✅ | ✅ | ✅ |
| 互不兼容之处 | Anthropic 道产的是 Anthropic 事件流(`content_block_*`),与另两家的 OpenAI SSE **协议层就不同** | — | `tool_stream` 是**智谱私有参数**,OpenAI SDK 要走 `extra_body` 传 |

**三家互不兼容的实质点只有两条**:
1. **协议道不同**(DeepSeek 走 Anthropic 事件流,另两家走 OpenAI SSE)—— 这是我们自己选的,不是厂商强加。
2. **GLM 的 `tool_stream`** 是三家里唯一一个「不显式打开就改变流式语义」的私有开关。

---

## 三 · 各家的特殊 token 到底是什么(③)

### 3.1 DeepSeek — DSML(截图里那个)

DSML 是 **DeepSeek 自己的工具调用标记语言**,是模型在 token 层真正生成的东西。
DeepSeek-V4-Pro 模型卡 `encoding/README.md` 给出的**规范形态(全角单竖线)**:

```
<｜DSML｜tool_calls>
<｜DSML｜invoke name="$TOOL_NAME">
<｜DSML｜parameter name="$PARAM" string="true|false">$VALUE</｜DSML｜parameter>
</｜DSML｜invoke>
</｜DSML｜tool_calls>
```
- `string="true"` → 值按裸字符串传;`string="false"` → 值按 JSON 解析(数字/布尔/数组/对象)。
- 工具结果回填时包在 user 消息的 `<tool_result>` 标签里,多结果按前一条 assistant 的 tool_calls 顺序排。

**旧的 V3/R1 系列**用另一套特殊 token(我们 `leakGuard.ts:15-20` 收的就是这套):
`<｜tool▁calls▁begin｜>` `<｜tool▁call▁begin｜>` `<｜tool▁sep｜>` `<｜tool▁call▁end｜>`
(`▁` 是 U+2581,SentencePiece 的空格符)。**V4 已改用 DSML,这几个 marker 现在基本是死规则。**

**什么情况下漏进 content?** —— DeepSeek 网关侧有个解析器负责把模型吐的 DSML 文本
转成结构化 `tool_calls` / Anthropic `tool_use` 块。官方 issue 报告的两种退化会让它漏:
- **token 退化**:模型吐 ASCII 双竖线 `<||DSML||tool_calls>` 而不是规范的全角 `<｜DSML｜tool_calls>`;
- **紧凑形态**:不带解析器期待的换行,整块压成一行。

命中任一种 → 解析器识别不出 → **整个 DSML 块原样落进 `message.content`**。
sglang 侧同类 bug(V3.2 + `--tool-call-parser deepseekv32`)记录的是另一个变体:
模型直接吐裸 XML `<function_cinvoke name="get_weather">...` 连 DSML 包裹都没有。
两个 issue 都是「流式下间歇性发生」,**均无官方修复回复**。

### 3.2 智谱 GLM — 不是 DSML

GLM 的原生标记完全是另一套,别混:
```
<think>…推理…</think>
<tool_call>function_name<arg_key>param1</arg_key><arg_value>value1</arg_value></tool_call>
```
**截图里的 `</||DSML||parameter>` 与 GLM 无关。**

### 3.3 通义千问 — 无公开的原生 wrapper token

DashScope 兼容道文档只描述 OpenAI 形的 `tool_calls`,没有暴露模型层 wrapper。
(自建 vLLM 部署要指定 `--tool-call-parser qwen3_coder` 之类,但那是开源权重的事,与我们无关。)

---

## 四 ·「工具调用被当成文本返回」的已知问题与官方建议(④)

| 来源 | 现象 | 官方/社区结论 |
|---|---|---|
| HF `deepseek-ai/DeepSeek-V4-Pro` discussion #209 | `message.content` 里出现 `<||DSML||tool_calls><||DSML||invoke...`,应为 `<｜DSML｜tool_calls>` | **无官方回复**。社区 workaround:正则把 ASCII 变体归一化回全角、给紧凑标记补换行,再喂官方 `parse_message_from_completion_text` |
| sglang issue #14695(High priority) | V3.2 流式下间歇吐裸 `<function_cinvoke name="...">` 无 DSML 包裹 | 解析器要求 DSML 包裹 + 正确闭合;**无 maintainer 根因说明** |
| DeepSeek-V3 issue #1376 | V4 拒收 `tool_choice="required"` | 我们探针复现:Anthropic 道更糟,是**静默无视** |
| 智谱 zai-org/GLM-4 #800 / vllm #32436 | GLM-4.7 tool-call parser 正则在空参数场景挂;Claude Code 下 `tool_stream` 不默认开 | 建议显式开 `tool_stream` |
| openclaw #21114 | DashScope + Qwen3 推理模型**非流式**请求全挂 | 必须显式传 `enable_thinking:false` |

**没有任何一家官方文档承认或给出「工具调用泄漏成文本」的处理建议。** 三家都默认
「网关会替你解析好」。这意味着**客户端侧的兜底是必需品,不是可选项** —— 我们已经有
`leakGuard.ts`,方向对,只是名单不全(见 §五)。

---

## 五 · 我们最可能踩的坑(按线上证据强度排序)

### 坑 1 🔴 P0 · `MARKERS` 缺闭标签形态 —— 线上实测确认

`agent/src/turn/leakGuard.ts:10-21` 十条 marker **全部是开标签**,一条 `</` 都没有:
```ts
const MARKERS = ["<｜DSML｜", "<｜｜DSML｜｜", "<|DSML|", "<|｜DSML｜|",
  "<｜tool▁calls▁begin｜", ... ];
```
`firstMarkerIndex` 逐条 `indexOf`,**`</｜｜DSML｜｜parameter>` 与任何一条都不匹配**
(第二个字符 `/` vs `｜`)。线上直接抓到后果 —— turn 2408(2026-08-07 09:15,deepseek-v4-pro,claw):

```
ev 44  content_delta  {"text":" PAF 和 Markov 模型纳入公共卫生决策。\"</"}
ev 45  content_delta  {"text":"｜｜DSML｜｜parameter>\n</｜｜DSML｜｜invoke>\n</｜｜DSML｜｜tool_calls>"}
ev 46  evidence       ...
ev 47  message_complete   ← 该轮判 complete,零 round_discarded、零 error
```
截图里的 `</||DSML||parameter>` 是同一条链路上的 **ASCII 退化变体**,名单里同样没有
(只有 `<|DSML|` 单竖线,没有 `<||DSML||` 双竖线)。**两个维度都漏。**

**修:** 名单要覆盖 `{开,闭} × {全角单,全角双,ASCII 单,ASCII 双} × {DSML, tool▁calls▁begin,…}`。
更稳的做法是不再枚举,改成一条归一化正则:先把 `｜`→`|`、折叠连续 `|`,再匹配
`</?\|+\s*DSML\s*\|+` 与 `</?\|+tool[▁_]calls?[▁_](begin|end)\|+`。

### 坑 2 🔴 P0 · 泄漏的真实伤害不是「难看的字符」,是**一次工具调用被降级成散文**

turn 2408 的 ev 30-44 是一大段通顺中文,读起来像正常回答 —— 但它其实是
`<｜｜DSML｜｜parameter name="new_string" string="true">` 的**参数体**。开标签在网关侧被
吃掉了(或从没进文本流),只有末尾的闭标签漏了出来。

同类完整形态见 turn 881(2026-07-25,deepseek-v4-pro,prism)ev 395-411,连开标签一起漏:
```
ev 395 {"text":"并理顺逻辑。\n\n<｜｜DSML｜｜tool_calls>\n<｜｜DSML｜｜invoke name=\""}
ev 396 {"text":"Edit\">\n<｜｜DSML｜｜parameter name=\"file_path\" string=\"true\">/home/bun/sessions/a6d…"}
ev 404 {"text":"…具有至关重要的理论与实践意义。</｜｜DSML｜｜parameter>\n<｜｜DSML｜｜parameter name=\"new_string\" …"}
ev 411 {"text":"重要的理论与实践意义。</｜｜DSML｜｜parameter>\n</｜｜DSML｜｜invoke>\n</｜｜DSML｜｜tool_calls>"}
```
和 turn 852(smart_search)整段 `mcp__minicod__search_papers` 调用泄漏成正文。

👉 **模型想调 `Edit` 写文件 / 调 `search_papers` 检索 → 这次调用一次都没执行 →
用户看到的是「文件内容/检索意图」的散文版本,以为干完了。** 这正是记忆里
`claw-prod-ux-audit` 记的「幻影交付」的一个**协议层新来源**。
清洗掉 marker 只是治标,轮级裁决必须知道「这一轮丢了一次工具调用」。

对比基数(证伪「工具没跑」):
```sql
SELECT t.model_main, COUNT(DISTINCT t.id) turns,
       SUM(e.ev_type='tool_use') tu, SUM(e.ev_type='round_discarded') rd
FROM agent_turns t LEFT JOIN agent_turn_events e ON e.turn_id=t.id GROUP BY 1;
```
```
deepseek-v4-flash  1428 turns   8597 tool_use    5 rd
deepseek-v4-pro     797 turns   3437 tool_use    5 rd
(空 model_main)     166 turns    679 tool_use   29 rd    ← rd 率 17.5%
qwen3.7-max          15 turns    114 tool_use    0 rd
glm-5.2              13 turns     67 tool_use    0 rd
```
tools 显然送达且生效。**且 GLM 在没传 `tool_stream` 的情况下照样返回 tool_calls** —— 见坑 6。

### 坑 3 🔴 P0 · 跨 delta 的 `</` 会被提前放行

`leakGuard.ts:34-43` 的 `longestMarkerPrefixSuffix` 只保留「是某 marker 前缀」的尾巴。
文本以 `<` 结尾时 `<` 被扣住(它是 `<｜DSML｜` 的前缀),下一帧来了 `/`,
buf 变成 `</…` → 不再是任何 marker 的前缀 → **`<` 连同后面全部放行**。
turn 2408 的 ev44/ev45 切点(`…决策。"</` | `｜｜DSML｜｜parameter>…`)就是这个机制的现场。
补齐闭标签 marker 后此坑自动消失(`</｜` 会成为合法前缀被扣住)。

### 坑 4 🔴 P0 · `round_discarded` 的用户体感 = 「读了文件、改了文件,然后什么都没发生」

`agent/src/turn/turnLoop.ts:708-736` 的裁决:tripped 且**无 tool_use** 且干净字符 <200
且重试未用尽 → 发 `round_discarded` 并 `continue`。`MAX_DSML_RETRIES` 默认 **1**
(`turnLoop.ts:356`)。线上 turn 2447(user 1236,2026-08-07 16:41,deepseek-v4-pro,claw)
的完整轨迹:

```
ev 173-199  Edit ×3(全部 tool_result isError:false,文件真的改了)
ev 204      content_start blockType=text
ev 205      round_discarded          ← 第 1 次 DSML 熔断,撤回在途文本块
ev 206-210  thinking + content_start text   ← 重打
ev 212      error {"code":"model_protocol_error", …}   ← 重打又踩,额度耗尽,整轮判 failed
```
**前面 200 个事件的真实工作(至少 8 次 Bash/Read/Edit)全部保留在磁盘上,但这一轮在
UI 上以「协议异常,本轮已终止」收场。** user 1236 的 21 轮里 4 轮 rd,全部是
`status=failed` + `model_main=''` 的这一类。这就是任务书里那个体感的完整机制。

顺带两个结构问题:
- `MAX_DSML_RETRIES=1` 对一个**非确定性**故障太紧;但加大重试也是错的方向 ——
  正确解是坑 2:识别出「丢了一次 tool_use」,把它降级成一条 `is_error` tool_result 让模型自恢复,
  而不是把整轮扔掉。
- `agent_turns.model_main` 在这些失败轮里是空串(166 轮),而 error payload 里明确写着
  `deepseek-v4-pro`。**归因字段在最需要它的那批轮上是空的**,任何按 model 的统计都会低估。

### 坑 5 🟡 P1 · `finish_reason` 两个值被静默吞成 `end_turn`

`agent/src/openai/adapter.ts:149-153`:
```ts
if (finish === "tool_calls") return "tool_use";
if (finish === "length")     return "max_tokens";
return "end_turn";               // ← content_filter / insufficient_system_resource 都落这里
```
DeepSeek 官方 API 参考的 finish_reason 枚举含 **`content_filter`** 与
**`insufficient_system_resource`**(上游资源不足)。两者都会被伪装成「模型正常说完了」,
用户拿到半截或空回答且零提示。这是 2026-07 审计 P0-3「干净断流伪装 end_turn」的**同族残余**
——那次只修了 `finish === null` 的分支(adapter.ts:455-458),没修枚举值。
(该路径只覆盖 Qwen/GLM;DeepSeek 走 Anthropic 道不经过这里。)

### 坑 6 🟡 P1 · GLM 没传 `tool_stream` —— 但后果**不是**「拿不到 tool_calls」

`adapter.ts:281-288` 的 body 只有 `model / max_tokens / messages / tools / stream / stream_options`,
没有 `tool_stream`。

⚠️ **这里有一条广泛流传但对我们不成立的说法**:阿里云百炼文档原话是
「调用 GLM 系列模型需在请求中传入 `extra_body={"tool_stream": True}`,**否则模型不会返回
`tool_calls`**」。**我们直连 `open.bigmodel.cn` 的实测证伪了这条**:glm-5.2 13 轮产出 67 次
`tool_use`,glm-4.7-flashx 17 轮产出 40 次。那条是**百炼中转口径**,不能照抄到直连场景。

直连场景下不开 `tool_stream` 的真实代价(智谱官方 + 社区一致):
**`arguments` 不分片,整块一次到达**。对我们就是——写大文件时前端的流式写文件卡
(`FieldStreamer`,`turnLoop.ts:510-513`)在 GLM 上**完全失效**,用户看到长时间静默后内容突然出现。
建议对 GLM provider 补 `tool_stream: true`(仅 GLM-5.2/5.1/5/4.7 支持,老模型要按 model 网关)。

### 坑 7 🟡 P1 · `parallel_tool_calls` 没传,Qwen 默认关

同 `adapter.ts:281-288`。通义千问官方明确 `parallel_tool_calls=true` 才允许一次响应返回
多个工具调用。我们不传 → Qwen 上**每轮最多一个工具**,同样的任务要多跑好几轮
(直接拉长延迟、放大每轮全量重发 history 的 token 成本)。
反向注意:DeepSeek 的 Anthropic 道文档写明 **parallel tool use 配置被忽略**,
而我们探针实测 `deepseek-v4-flash` 的 seed 轮**会自己并行发 2 个 tool_use**
(`docs/tool-choice-probe-2026-08.md:146`)——所以 DeepSeek 侧不需要也不能靠这个参数控制。

### 坑 8 🟡 P1 · 非流式 `create()` 在 DashScope Qwen3 推理模型上必 400

`adapter.ts:547-554` 的 body 只有 `model / max_tokens / messages / stream:false`。
DashScope 对 Qwen3 系推理模型的**非流式**请求要求显式 `enable_thinking:false`,否则 400
(openclaw #21114;部分开源 qwen3 更是只支持流式)。
唯一调用点是 `agent/src/turn/completion.ts:17`(会话标题生成等)。
👉 **可证伪预测**:把某个 feature 的标题模型挂到 `qwen3.7-plus`,标题会 100% 生成失败。

### 坑 9 🟢 P2 · 三家的 `tool_choice` 支持度是 **per-model 属性**,我们一处都没用

`grep -rn "tool_choice" agent/src` → 除探针外命中 0 处(`turnLoop.ts:501-503` 的 stream 参数
只有 `model / max_tokens / system / messages / tools`)。这本身是**正确的现状**:
探针结论是主力 deepseek-v4-pro/flash 在 Anthropic 道对 `{type:"any"}` **HTTP 200 + 静默无视**
(最坏形态:看起来生效,实则没有)。若将来要用,必须落到 `agent_models` 每一行标注 ——
同一个智谱账号下 `glm-4.7-flashx` 全绿而 `glm-5.2` 全静默无视,**「这家支不支持」这个问法本身是错的**。

### 坑 10 🟢 P2 · DeepSeek strict mode 没用

DeepSeek 提供 `/beta` base_url + 每 function `"strict": true`,让模型严格遵守 JSON Schema。
代价:所有 property 必须进 `required` 且 `additionalProperties:false`
—— 我们 76 个 MCP 工具的 schema 大概率不满足,改造成本不小。
但值得评估:**strict 模式下模型的输出更贴模板,DSML 退化(紧凑形态/ASCII token)的概率理论上更低。**
这是目前唯一一条「可能从源头减少 §五坑 1/2」的官方杠杆。

### 坑 11 🟢 P2 · tools 数量逼近 DeepSeek 的 128 上限

DeepSeek API 参考写明 `tools` 最多 128 个 function。我们 claw 的
`buildTools`(`agent/src/tools/toAnthropicTools.ts:9-26`)= Minicod MCP(约 76 个)+ 全部 built-in。
**未实测当前实际条数**,但离上限不远。超限的表现在各家都不统一(可能 400,也可能静默截断)。

### 坑 12 🟢 P2 · Anthropic 道丢弃的能力

DeepSeek 官方 Anthropic 兼容页明确列出**不支持/忽略**:beta headers、`cache_control`、
`image`/`document`/`search_result` 内容类型、`top_k`、thinking 的 `budget_tokens`、
parallel tool use 配置、MCP servers、code execution。
其中 **`image` 不支持** 值得单独确认:我们的 P2 图片通道在 OpenAI 道有 data-URI 转换
(`adapter.ts:118-126`),但 Anthropic 道是直接透传 —— **主力 DeepSeek 上传图会怎样,未验证**。

### 坑 13 ⚪ 洁癖 · `toOpenAITools` 被调两次

`adapter.ts:285`:`...(toOpenAITools(t) ? { tools: toOpenAITools(t) } : {})` —— 同一份
tools 序列化两遍。76 个工具的 schema 不算小,每轮白跑一次。

---

## 六 · 建议动作(按 ROI)

| # | 动作 | 覆盖的坑 | 成本 |
|---|---|---|---|
| 1 | `leakGuard.MARKERS` 改归一化正则,覆盖闭标签 + ASCII 双竖线 | 1、3 | 小时级 |
| 2 | tripped 时不再简单 `round_discarded`:解析被降级的 DSML 块,若能还原出 `invoke name=` 则合成 `tool_use`(或至少合成 `is_error` tool_result 让模型自恢复) | 2、4 | 1-2 天 |
| 3 | `agent_turns.model_main` 在失败轮补齐 | 4 归因 | 小时级 |
| 4 | `mapStopReason` 补 `content_filter` / `insufficient_system_resource` 分支 | 5 | 分钟级 |
| 5 | GLM provider 补 `tool_stream:true`;Qwen provider 补 `parallel_tool_calls:true` | 6、7 | 小时级(需 per-model 网关) |
| 6 | `create()` 对 DashScope 补 `enable_thinking:false` | 8 | 分钟级 |
| 7 | 评估 DeepSeek `/beta` + strict(唯一的源头杠杆) | 10、2 | 天级,需 schema 改造 |
| 8 | **旁路验证**:把 DeepSeek 从 Anthropic 道切到 OpenAI 道跑一批,看 DSML 泄漏率是否变化 | 1、2 根因 | 半天 |

第 8 条单独说明:两条道的 DSML→结构化解析器**是 DeepSeek 侧两份不同实现**
(我们探针已证它们在 `tool_choice` 上行为不同:OpenAI 道诚实 400、Anthropic 道静默丢弃,
`docs/tool-choice-probe-2026-08.md:23`)。因此 **「换道能否绕开泄漏」是可实测的,而且便宜。**

---

## 七 · 存疑 / 未验证(不要当结论用)

1. **Qwen / GLM 是否也会泄漏** —— 84 轮的样本量给不出答案。要么加流量,要么专门压测。
2. **换到 OpenAI 道能否降低 DeepSeek 泄漏率** —— 纯推测,见建议 8。
3. **DSML 泄漏的触发条件** —— 官方两个 issue 都说「流式间歇性」,无人给出确定性 repro。
   我们线上 18 次熔断(30 天 `docker logs scholar_agent | grep -c 'DSML protocol leak intercepted'`)
   全部 `passed_chars: 0`,即**每次都发生在文本块的第一个字符**,而不是说到一半突然变。
   这条模式没在任何公开材料里见过,值得作为 repro 线索深挖。
4. **当前 claw 实际下发多少个 tool** —— 未实测,坑 11 的严重性待定。
5. **主力 DeepSeek(Anthropic 道)上传图片会怎样** —— 官方说不支持 `image` content type,未实测。
6. 阿里云百炼「GLM 不传 tool_stream 就不返回 tool_calls」那条 —— 我们证伪了**直连**场景,
   **未验证百炼中转**场景(我们不走百炼调 GLM,暂时不影响)。

---

## 附 · 一手来源

**DeepSeek**
- https://api-docs.deepseek.com/guides/tool_calls/ — Tool Calls 指南(strict/beta、thinking+tools)
- https://api-docs.deepseek.com/api/create-chat-completion — API 参考(128 function 上限、tool_choice 四态、finish_reason 五值、stream_options)
- https://api-docs.deepseek.com/guides/anthropic_api/ — Anthropic 兼容道支持/不支持清单、模型映射
- https://huggingface.co/deepseek-ai/DeepSeek-V4-Pro/blob/main/encoding/README.md — **DSML 规范文法(全角竖线、开/闭标签、string 属性)**
- https://huggingface.co/deepseek-ai/DeepSeek-V4-Pro/discussions/209 — **`<||DSML||>` ASCII 退化 + 紧凑形态导致泄漏(无官方回复)**
- https://github.com/sgl-project/sglang/issues/14695 — V3.2 流式间歇吐裸 XML 无 DSML 包裹
- https://github.com/deepseek-ai/DeepSeek-V3/issues/1376 — V4 拒收 tool_choice="required"

**通义千问 / DashScope**
- https://help.aliyun.com/zh/model-studio/qwen-function-calling — 中文版(tool_choice 四态、流式首片带 id+name、tool_call_id 回填)
- https://www.alibabacloud.com/help/en/model-studio/qwen-function-calling — 英文版(parallel_tool_calls 语义、支持模型清单)
- https://www.alibabacloud.com/help/en/model-studio/compatibility-of-openai-with-dashscope — OpenAI 兼容道总览
- https://github.com/openclaw/openclaw/issues/21114 — 非流式 Qwen3 推理模型必须传 enable_thinking:false

**智谱 GLM**
- https://docs.bigmodel.cn/cn/guide/capabilities/stream-tool — **工具流式输出(tool_stream,支持 GLM-5.2/5.1/5/4.7)**
- https://docs.bigmodel.cn/cn/guide/start/migrate-to-glm-4.6 — tool_stream 默认 false、arguments 增量拼接
- https://docs.bigmodel.cn/api-reference/模型-api/对话补全 — tool_choice「默认 auto 且仅支持 auto」
- https://github.com/zai-org/GLM-4.5/blob/main/resources/glm_4.6_tir_guide.md — **GLM 原生标记 `<tool_call>/<arg_key>/<arg_value>`(≠ DSML)**
- https://github.com/zai-org/GLM-4/issues/800 — Claude Code 下 tool_stream 不默认开
- https://github.com/vllm-project/vllm/issues/32436 — GLM-4.7 tool-call parser 空参数正则 bug

**本仓库**
- `docs/tool-choice-probe-2026-08.md` — 8 模型 × 6 用例 tool_choice 实测矩阵(per-model 结论、Anthropic 道 vs OpenAI 道行为差异)
- `docs/research/api-format-compat-2026-07/` — 双协议方案(真源 Anthropic + 出口薄翻译)
