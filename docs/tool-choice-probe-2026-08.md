# `tool_choice` provider 支持度探针 + 决策闸

> **2026-08 证据账本 P0-d** —— 终稿 [§五 P0-d / §七 拍板项 1](agent-evidence-architecture-2026-08.md)。
> 探针源码:`agent/src/harness/toolChoiceProbe.ts`(**非生产代码路径**:不被 `src/index.ts` 引用、
> 不被 `bun test src` 收集、不改任何既有文件;与 `src/harness/conformance.ts` 同级同性质)。
>
> 实测日期 **2026-08-01**,对本机 dev 库 `agent_models ⨝ agent_providers ⨝ agent_config` 导出的
> **全部 12 个 enabled 模型**真发请求。

---

## 〇 · 一句话结论(给拍板)

**闸未通过。线上主力 `deepseek-v4-pro` / `deepseek-v4-flash` 不支持 `tool_choice`,而且是最坏的那种不支持:
HTTP 200、静默无视、照常 `end_turn`。⇒ round-0 强制取证**顺延 P1**,并按**模型**(不是按 provider)
在 admin 模型目录页标注「不支持阶段编排」。**

三个必须写进决策的次级结论:

| # | 结论 | 为什么重要 |
|---|---|---|
| 1 | **支持度是 per-model 属性,不是 per-provider** —— 同一个智谱账号下 `glm-4.7-flashx` 全绿、`glm-5.2` 与 `glm-5v-turbo` 全静默无视 | 「这家支不支持」这个问法本身是错的。标注必须落在 `agent_models` 每一行 |
| 2 | **DeepSeek 的 Anthropic 兼容道与 OpenAI 道行为不同**:OpenAI 道诚实 400(社区已记录),Anthropic 道对 `{type:"any"}` **静默丢弃**、只对 `{type:"tool"}` 才 400 | 照抄社区/文档结论会得出反的答案。我们走的正是 Anthropic 道 |
| 3 | **「关掉思考模式」这条退路:Qwen 通、DeepSeek 不通** | DeepSeek/Qwen 的拒收话术都点名 thinking mode,极易误以为都能这么绕。实测 DeepSeek 关了思考(thinking 块确实消失)后 `tool_choice` **仍被无视** —— 说明那不是思考模式的限制,是**兼容层压根没实现** `{type:"any"}` |

🔴 **无论如何都不做「软形态强制」**(吞掉 `end_turn` 再重发)。理由见 [§六](#六--否决:软形态强制)。

---

## 一 · 探针在回答什么

终稿 §二层二的复核结论:`tool_choice` 在 `agent/src` 全目录命中 **0 处** ——
`turnLoop.ts` 的 `client.messages.stream({ model, max_tokens, system, messages, tools })` 不带该字段
(终稿写的 `:324`;因并行改造,2026-08-01 实际在 **`:361-362`**),
`openai/adapter.ts:280` 的 body 里也只有 `tools`、没有 `tool_choice` 通路。

⇒ **每一轮「直接回答」在 API 层都是合法且零成本的采样动作**,这是「配了工具却不用」的 API 层根因。
P1 的阶段编排要用分阶段 `tool_choice` 让 `end_turn` 在取证相**不是可采样的分支**。
本探针只回答前置问题:**线上这些 provider 到底支不支持?**

---

## 二 · 判据:三分不是二分(本探针最重要的设计决定)

| 结论 | 含义 | 危险度 |
|---|---|---|
| `rejected` | 上游 4xx 明确拒收 | ⛔ 不支持,但**诚实** —— 我们能在代码里看见 |
| `ignored` | 上游 200 却当没看见,照常出文本 / `end_turn` | 🔴🔴 不支持,且**假装支持** |
| `honored` | 上游真的被迫产出 `tool_call` | ✅ |

`ignored` 比 `rejected` 危险得多:它会让「evidence 相不可能 `end_turn`」这条不变量
**在代码里存在、在运行时不存在** —— 也就是本仓库被坑过的模式:
**「一条永远绿的规则」和「一条不存在的规则」等价**。
因此报告里 `ignored` 比 `rejected` 更响,且**同样判 FAIL**。

### 2.1 判别力:200 + 有 `tool_call` ≠ 强制生效(踩过一次)

首版探针用「注意力机制是谁提出的?」当问句 —— DeepSeek 在 **`auto` 基线下就已经调了工具**。
于是 `force_any` 同样返回 `tool_call` 这件事**什么都没证明**:无法区分
「强制真的执行了」与「上游静默无视 + 模型碰巧自己想调」。首跑因此报出一个**假的 GATE PASS**。

修法(已固化进探针 + 自检):

- 问句换成**调工具明显荒谬**的那种(`请只回复两个汉字:好的。不要调用任何工具`),让 `auto` 稳定落在零工具;
- 判别力必须来自下面**至少一条**,否则裁决 `INCONCLUSIVE`,**绝不许回落成 PASS**:
  - `auto` 零工具 × `force_any` 出 `tool_call`(对照成立);
  - `force_named` 强制了模型**本来不会选**的 `probe_finish` 并成功(不依赖基线的自证)。

`INCONCLUSIVE` 是刻意存在的第四态。把「没证出来」记成「通过」就是假绿。

### 2.2 另外两个「探针自造的假故障」(已修,记下来防复发)

| 假故障 | 真相 |
|---|---|
| 手搓一条只含 `tool_use` 的 assistant 消息 → DeepSeek 400「`content[].thinking` in the thinking mode must be passed back」 | **不是**生产缺陷。`turnLoop.ts:592` 是 `messages.push({role:"assistant", content: msg.content})`,含 `thinking`+`signature` 逐字回放。改为:先真跑一轮 seed,把上游回包**逐字**当历史 |
| 只回一条 `tool_result` → `deepseek-v4-flash` 400「`tool_use` ids were found without `tool_result` blocks immediately after」 | flash 的 seed 轮**并行发了 2 个 `tool_use`**,每个都必须配一条 `tool_result` |

两条都写进了自检用例。**假故障比没数据更坏**。

---

## 三 · 实测结果(2026-08-01)

12 个模型 × 9 个用例。`auto 基线`列语义是反的:**零工具才是「对照可用」**。

| 模型 | provider | 协议 | auto 基线 | `force_any` | 关思考后 | `force_named` | round2 | 流式 | 裁决 |
|---|---|---|---|---|---|---|---|---|---|
| `deepseek-v4-pro` | 默认(#0) | anthropic | 零工具 ✅ | 🔴 ignored | 🔴 ignored | ⛔ 400 | ✅ | 🔴 ignored | ⛔ **FAIL** |
| `deepseek-v4-flash` | 默认(#0) | anthropic | 零工具 ✅ | 🔴 ignored | 🔴 ignored | ⛔ 400 | ✅ | 🔴 ignored | ⛔ **FAIL** |
| `qwen3.7-max` | dashscope(#6) | openai | 零工具 ✅ | ⛔ 400 | ✅ honored | ⛔ 400 | ⛔ 400 | ⛔ 400 | ⛔ FAIL(思考态) |
| `qwen3.7-plus` | dashscope(#6) | openai | 零工具 ✅ | ⛔ 400 | 未测 | ⛔ 400 | ⛔ 400 | ⛔ 400 | ⛔ FAIL(思考态) |
| `qwen3.7-flash` | dashscope(#6) | openai | 零工具 ✅ | ⛔ 400 | ✅ honored | ⛔ 400 | ⛔ 400 | ⛔ 400 | ⛔ FAIL(思考态) |
| `qwen3.6-flash` | dashscope(#6) | openai | 零工具 ✅ | ⛔ 400 | 未测 | ⛔ 400 | ⛔ 400 | ⛔ 400 | ⛔ FAIL(思考态) |
| `glm-5.2` | glm(#7) | openai | 零工具 ✅ | 🔴 ignored | 🔴 ignored | 🔴 ignored | 🔴 ignored | 🔴 ignored | ⛔ **FAIL** |
| **`glm-4.7-flashx`** | glm(#7) | openai | 零工具 ✅ | ✅ honored×1 | ✅ honored | ✅ `probe_finish` | ✅ `probe_finish` | ✅ honored | ✅ **PASS** |
| `glm-5v-turbo` | glm(#7) | openai | 零工具 ✅ | 🔴 ignored | 🔴 ignored | 🔴 ignored | ✅ | 🔴 ignored | ⛔ **FAIL** |
| `MiniMax-M2.7` | minimax(#8) | openai | 💥 402 | 💥 402 | — | 💥 402 | — | 💥 402 | ⛔ 未测出 |
| `MiniMax-M2.7-highspeed` | minimax(#8) | openai | 💥 402 | 💥 402 | — | 💥 402 | — | 💥 402 | ⛔ 未测出 |
| `MiniMax-M3` | minimax(#8) | openai | 💥 402 | 💥 402 | — | 💥 402 | — | 💥 402 | ⛔ 未测出 |

> **round2 列要小心读。** 只有 `deepseek-v4-pro` 那一格是判别性的:
> `auto_round2` 零工具出文本、`force_round2` 调了 `probe_finish` —— 即**第 2 轮上强制似乎生效了**。
> `deepseek-v4-flash` 与 `glm-5v-turbo` 的 round2 两态都调工具,**没有判别力**,那个 ✅ 只是「没报错」。
> pro 这一格是 **n=1 的单次采样**,不足以据此说「DeepSeek 部分支持」;它唯一的作用是提示:
> 那条链上的行为可能是**不可预测**的,而不是干净的「一律丢弃」——
> 不可预测比一律丢弃更不能拿来建不变量。**闸的判据是 round-0(`force_any`),它是明确的 ignored。**

### 3.1 上游原文(逐字,便于日后比对是否改口)

```
DeepSeek(anthropic 道)· tool_choice:{"type":"tool","name":"probe_finish"}
  HTTP 400  {"error":{"message":"Thinking mode does not support this tool_choice",
             "type":"invalid_request_error","code":"invalid_request_error"}}

DeepSeek(anthropic 道)· tool_choice:{"type":"any"}
  HTTP 200  content:[{thinking…},{type:"text",text:"好的"}]  stop_reason:"end_turn"
  ← 零 tool_use。**没有任何报错、任何字段、任何信号说明强制被丢弃。**

DeepSeek(anthropic 道)· tool_choice:{"type":"any"} + thinking:{"type":"disabled"}
  HTTP 200  content:[{type:"text",text:"好的"}]  stop_reason:"end_turn"
  ← thinking 块确实消失(参数生效了),tool_choice **仍被无视**
  ⇒ 这不是「思考模式的限制」,是兼容层没实现 {type:"any"}

DashScope/Qwen(openai 道)· tool_choice:"required" 或 {"type":"function",…}
  HTTP 400  <400> InternalError.Algo.InvalidParameter:
            The tool_choice parameter does not support being set to required or object in thinking mode
  + enable_thinking:false 后 → HTTP 200 tool_calls:[probe_search] finish_reason:"tool_calls"

智谱 glm-5.2 / glm-5v-turbo(openai 道)· tool_choice:"required"
  HTTP 200  {"choices":[{"finish_reason":"stop","message":{"content":"好的"}}]}
  ← 零 tool_calls,零报错。与文档「默认 auto 且仅支持 auto」一致,但**不报错**。

智谱 glm-4.7-flashx · tool_choice:"required" / {"type":"function",{"name":"probe_finish"}}
  HTTP 200  tool_calls:[probe_search] / [probe_finish]  finish_reason:"tool_calls"
  ← 同一账号、同一端点,与上面两个模型行为相反。

MiniMax ×3
  HTTP 402  {"error":{"type":"insufficient_balance_error","message":"insufficient balance (1008)"}}
```

### 3.2 两个与 `tool_choice` 无关但顺手测出来的运营问题

1. **MiniMax 三个模型上游余额不足(402)**,而它们在 `agent_models` 里 `enabled=1` **且** `user_selectable=1`
   —— 用户在模型选择器里选中即整轮失败。⚠️ 口径:本次读的是**本机 dev 库**的 key;
   若线上共用同一把 key 则是**在产的生产隐患**,请核对线上 `agent_providers#8` 后再决定是否下架。
2. **`deepseek-v4-flash` 的 seed 轮一次并行发 2 个 `tool_use`**(同一个 `probe_search` 重复两发)。
   与 `tool_choice` 无关(`auto` 态就这样),但阶段编排若将来引入禁并行需求,要知道 Anthropic 道的
   `disable_parallel_tool_use` 在这条链上**同样被静默无视**(`force_any_1x` 结果与 `force_any` 一致)。

---

## 四 · 决策闸

> 终稿 §五 P0-d 原文:「若线上主力(deepseek-v4-flash/pro)通过 → smart_search 的 round-0
> `tool_choice` **纳入 P0**;不通过 → 顺延 P1,且在 admin 模型目录页显式标注「不支持阶段编排」。」

### ⛔ 闸未通过 → 执行「不通过」分支

**1. round-0 `tool_choice` 顺延 P1,P0 不做。**
终稿 §五 P0 的四块里,P0-a/b/c 与本闸无关,照常推进;P0-d 到此结束(它本来就是「半天,不上线」)。

**2. admin 模型目录页加 per-model 标注。** 因为支持度是 per-model 的(§〇结论 1),
标注必须落在 `agent_models` 每一行,不能挂在 `agent_providers` 上。建议:

- 新增列 `phase_orchestration`(`unknown` / `supported` / `ignored` / `rejected`),默认 `unknown`;
- 后台列表用文案标注,`ignored` 用**最重**的样式 —— 它是「看起来能用其实不能用」那一档;
- 值由本探针填,**不要在运行时自动探测**(那等于给每轮加一发请求 + 一个会漂移的隐藏状态)。

**3. P1 阶段编排的三条落地约束(由本次实测直接推出):**

| 约束 | 依据 |
|---|---|
| 阶段编排**只能在标注为 `supported` 的模型上启用**,其余模型**不启用**、并且**不假装启用** | §六 |
| 启用与否必须是**用户/运营可见**的能力差异(哪些模型能进研究管线),不是静默降级 | 静默降级 = 又一条永远绿的规则 |
| `tool_choice` 一旦接上,`glm-4.7-flashx` 这类 `supported` 模型要**同时验流式**(生产走 `client.messages.stream`) | 本探针的 `stream_any` 用例专为此设;flashx 流式与非流式一致 ✅ |

**4. 若将来要重开这道闸,重跑触发条件**(任一命中即重跑本探针):
- `agent_models` / `agent_providers` 增删改行;
- DeepSeek 发新版本或修复 [issue #1376](https://github.com/deepseek-ai/DeepSeek-V3/issues/1376);
- 主力模型切换(尤其若切到 `glm-4.7-flashx` 一类已 PASS 的模型 —— 那闸就通了)。

### 4.1 若闸将来通过,改动面(约 15 行,先记在这里)

```
agent/src/openai/adapter.ts
  :256  type StreamParams  ← 加 tool_choice?: unknown
  :280  body 里透传        ← ...(this.params.tool_choice ? { tool_choice: this.params.tool_choice } : {})
agent/src/turn/turnLoop.ts
  :361-362  client.messages.stream({...})  ← 按 phase 传 tool_choice
            (anthropic 道由 @anthropic-ai/sdk 直接透传,无需额外通路)
```

⚠️ 透传本身**不是**开关。开关必须是「该模型标注为 `supported`」——
否则在 `ignored` 模型上传了参数 = 代码里有一条不生效的不变量。

---

## 五 · 已知 provider 兼容性资料(文档侧,与实测对照)

| 上游 | 文档说法 | 实测 | 一致? |
|---|---|---|---|
| **DeepSeek**(OpenAI 道) | 社区 issue:V4 pro/flash 对 `required` 与具名 tool_choice 回 400「Thinking mode does not support this tool_choice」;`auto` 正常;建议干脆不传该参数,代价是约 40% 退化为非结构化输出 | 未测(我们不走这条道) | — |
| **DeepSeek**(**Anthropic 道**,我们用的) | 官方 function-calling 页**完全没提** `tool_choice`;只声明 `base_url (Anthropic): https://api.deepseek.com/anthropic` | 具名 → 400(同上话术);`{type:"any"}` → **200 静默无视**;关思考仍无视 | ❌ **文档无覆盖,只能靠探针** |
| **阿里云百炼 / DashScope**(OpenAI 兼容) | 文档列 `auto` / `none` / `{"type":"function",…}` 三种,**没有 `required`**;并写明「思考模式的模型不支持强制调用某个工具」;`parallel_tool_calls` 默认 `false` | 思考态下 `required` 与具名**都** 400,话术完全对上;`enable_thinking:false` 后 `required` ✅ | ✅ 一致 |
| **智谱 GLM**(OpenAI 兼容) | 对话补全文档原文:「用于控制模型选择调用哪个函数的方式,仅在工具类型为 `function` 时补充。**默认 `auto` 且仅支持 `auto`**」 | `glm-5.2` / `glm-5v-turbo` 确实不生效 —— 但**返 200 不返 400**;`glm-4.7-flashx` **却完全生效** | ⚠️ 文档偏保守且**不是全模型一致** |
| **MiniMax**(OpenAI 兼容) | OpenAPI 规格里**没有** `tool_choice` 字段 | 402 余额不足,未测出 | ❓ 未验证 |
| **Anthropic 官方**(协议规范,我们的内部真源形态) | `tool_choice` 支持 `auto` / `any` / `tool` / `none`;`{type:"any"\|"tool"} + disable_parallel_tool_use:true` ⇒ 恰好一个工具 | 未测(未接官方端点) | — |

**资料来源**
- [DeepSeek-V3 Issue #1376 — V4 rejects tool_choice="required"](https://github.com/deepseek-ai/DeepSeek-V3/issues/1376)
- [DeepSeek API Docs — Function Calling](https://api-docs.deepseek.com/guides/function_calling)
- [阿里云百炼 — OpenAI兼容 Chat Completions](https://www.alibabacloud.com/help/zh/model-studio/qwen-api-via-openai-chat-completions)
- [智谱AI 开放文档 — 对话补全](https://docs.bigmodel.cn/api-reference/%E6%A8%A1%E5%9E%8B-api/%E5%AF%B9%E8%AF%9D%E8%A1%A5%E5%85%A8)
- [MiniMax — Chat Completions (OpenAI compatible)](https://platform.minimax.io/docs/api-reference/text-chat-openai)
- [Claude Docs — How to implement tool use](https://platform.claude.com/docs/en/agents-and-tools/tool-use/implement-tool-use)

> 🔴 **文档不能替代探针。** 本次三条实测结论中,有两条是文档给不出的:
> DeepSeek Anthropic 道的静默无视(文档无覆盖)、GLM 同账号下模型间行为相反(文档只有一句全局话)。

---

## 六 · 否决:软形态强制

**🔴 绝不做「软形态强制」** —— 即:在不支持 `tool_choice` 的模型上,发现模型 `end_turn` 了就
**吞掉这一轮、注入一段「你必须先检索」再重发**,以此模拟强制。

否决理由:

1. **那是最坏的一种 guard。** 它把「结构不可能」降级成「事后检查 + 纠偏注入」——
   正是终稿 §四② 已经把 `verifyClaims` 降级掉的那个量纲错误,不能从后门装回来。
2. **它落在已被证伪饱和的散文通道上。** 终稿 §一伪根因表:用户 467 直接打字「你应该使用查询论文的工具来找」,
   该轮 `tool_use` 仍为 0。用户指令比我们任何注入更靠近生成点、更权威,它都无效。
3. **它制造成本而不制造保证。** 吞轮重发 = 多一整轮 token + 多一次首字延迟,而模型仍可以再次 `end_turn`;
   要么无限循环,要么设个次数上限 —— 上限到了还是放行,于是保证并不存在。
4. **它会让人以为阶段编排已经上线。** 一旦有了「看起来在强制」的东西,
   `evidence` 相「`end_turn` 不是可采样分支」这条不变量就会被当成已生效来引用,
   后续所有依赖它的设计(账本闸、覆盖度闸)都建在沙上。

> **宁可缺失也不假装启用。**
> 「一条永远绿的规则」和「一条不存在的规则」等价 —— 本仓库被这个模式坑过
> (见 CLAUDE.md「设计系统护栏:两个执行点」里跨包镜像整族 skip 的横幅设计:
> 那里的处理方式是**大声打出跳过了哪几条**,而不是让它假装绿)。

**正确姿态**:在 `ignored` / `rejected` 的模型上,阶段编排**就是没有**;
admin 目录页标注出来;要它就换到 `supported` 的模型。这条缺口由终稿 P0-b 的证据账本
+ P0-c 的带外过程可视化承担 —— 它们**不依赖** `tool_choice`(终稿 §五 P0 开篇即写明「可独立上线,不依赖 tool_choice」)。

---

## 七 · 探针用法

### 7.1 三种模式

```bash
cd /Users/youngp/mypro/fuck_副本/scholar/agent

# ① 自检:零网络,验分类器与请求体形状(57 条断言)。改探针后必跑
bun run src/harness/toolChoiceProbe.ts --selftest

# ② 干跑:零网络,打印**将要发出的**请求体(与 --run 共用同一个 buildRequest,
#    保证「打印的就是发出的」)
bun run src/harness/toolChoiceProbe.ts --dry-run
bun run src/harness/toolChoiceProbe.ts --dry-run --models deepseek-v4-flash --cases force_any

# ③ 真跑(**默认不联网,必须显式 --run**)
TOOL_CHOICE_PROBE_FILE=/tmp/targets.json \
  bun run src/harness/toolChoiceProbe.ts --run --md /tmp/tool-choice.md --timeout 90000
```

其它开关:`--models a,b`(逗号分隔)· `--cases force_any,force_named` · `--timeout <ms>`(默认 60000)·
`--md <path>`(不给则报告只打 stdout)· `--help`。

**花钱声明**:每模型至多 9 发、`max_tokens=256`、prompt < 400 token。12 模型满跑 ≈ 100 发 ≈ **不到 0.05 元**。

### 7.2 目标清单(离线可跑)

优先级递减:

| 来源 | 怎么给 |
|---|---|
| `TOOL_CHOICE_PROBE_TARGETS` | 内联 JSON 数组 |
| `TOOL_CHOICE_PROBE_FILE` | JSON 文件路径(**推荐**,见下面的 SQL) |
| 内置快照 | `SNAPSHOT_TARGETS`,2026-08-01 导出。**可能过期** —— 报告会把 `目标来源:snapshot` 打出来 |

密钥:`PROBE_KEY_P<providerId>`(如 `PROBE_KEY_P0` / `PROBE_KEY_P6`),或直接写在目标 JSON 的 `apiKey` 里。
**缺 key 的目标会被显式跳过并列在报告里,绝不静默略过。**

从线上目录现导 `targets.json`(⚠️ `--default-character-set=utf8mb4`,否则中文 provider 名变 `??`):

```bash
docker exec scholar_mysql mysql --default-character-set=utf8mb4 \
  -u scholar_user -pscholar_pass scholar -N -B -e "
SELECT CAST(JSON_ARRAYAGG(JSON_OBJECT(
  'model', m.model_id, 'label', m.display_name,
  'providerId', m.provider_id,
  'providerName', COALESCE(p.name,'scholay-managed'),
  'baseUrl',   COALESCE(p.base_url,   c.base_url),
  'apiFormat', COALESCE(p.api_format, 'anthropic'),
  'apiKey',    COALESCE(p.api_key,    c.api_key))) AS CHAR)
FROM agent_models m
LEFT JOIN agent_providers p ON p.id = m.provider_id AND m.provider_id > 0
JOIN agent_config c ON c.id = 1
WHERE m.enabled = 1 AND m.channel = 'agent';" > /tmp/targets.json
```

> `provider_id = 0` 恒指「默认 provider」= `agent_config` 那一行(migration 0066 的设计),
> 所以必须 `LEFT JOIN` + `COALESCE` 回落,不能只查 `agent_providers`。
> 🔴 该文件含明文 key —— 放临时目录、用完删,别提交。报告与日志里的 key 由 `redact()` 脱敏。

### 7.3 用例矩阵

| case | 问什么 |
|---|---|
| `auto` | 基线①:今天生产的形状(不带 `tool_choice`)。**零工具是判别力的前提** |
| `force_any` | 核心:anthropic `{type:"any"}` / openai `"required"` |
| `force_any_1x` | 同上 + 禁并行(`disable_parallel_tool_use` / `parallel_tool_calls:false`) |
| `force_any_nothink` | 同上 + 关思考(`thinking:{type:"disabled"}` / `enable_thinking:false`)。回答「是彻底没有还是关思考就有」 |
| `force_named` | 强制**模型本不会选**的 `probe_finish` —— 不依赖基线的独立判据;也是 P1 把模型钉到 `ResearchPhase` 的形态 |
| `seed_r1` | round2 的第 1 轮,**只为拿真实历史**,不参与裁决 |
| `auto_round2` | 基线②:带真实 `tool_result` 历史、不强制 |
| `force_round2` | 带真实历史再强制:evidence 相**第 2 轮起**强制还成不成立 |
| `stream_any` | `force_any` 的流式形态 —— **生产走的就是流式**(`turnLoop:361` `client.messages.stream`)。查空 content / 迟到 name / 无 finish_reason 三个已知坑 |

### 7.4 探针刻意不做的事

- **不走生产适配器发请求**:自己拼 HTTP(仅复用 `adapter.ts` 导出的纯函数 `chatCompletionsURL`,
  因为 `/v1` vs `/v4` 的拼路规则是踩过线上 404 的);⇒ 探针不受、也不改生产代码路径。
- **不写任何生产文件、不改配置、不 upsert provider**;只发 POST,只读。
- **不自动重跑 / 不自愈 / 不猜**:400 就记 400 并附上游原文,凑不出前提就整组跳过并写明理由。

---

## 八 · 附:与终稿的接口

| 终稿条目 | 本文交付 |
|---|---|
| §五 P0-d「对 `agent_models` 表每一行跑最小请求」 | ✅ 12 行全跑,§三 |
| §五 P0-d「已知坑:强制并行多工具 / 空 content 导致 `assembleToolUse` 走异常路径」 | 已设 `force_any_1x` 与 `ignored_empty` 两条判据;**本次实测未命中**(所有 ignored 都带正文;flash 的并行只出现在 `auto` 态)。判据保留 |
| §五 P0-d 决策闸 | ⛔ 未通过 → §四 |
| §五 P0-d「绝不做软形态强制」 | §六(写死) |
| §七 拍板项 1 | 已可拍:走「不通过」分支 |
| §六 否决清单 #15 | 本文 §六 是它的落地版 |
