# Agent 上游双协议兼容(Anthropic Messages + OpenAI Chat Completions)调研报告

> 2026-07-14 · 5 路并行调研(3 路代码侦察 + 2 路外部调研,原文见同目录 fmt-*.md)
> 需求:目录添加模型时可指定该模型的接口格式;agent 现仅支持 Anthropic Messages 协议。
> **状态:调研完成,待 owner 拍板后实施。**

---

## 1. 核心结论(TL;DR)

1. **耦合面远小于直觉**:全容器只有 **2 个 LLM API 调用点**(turnLoop.ts:148 流式主循环、completion.ts:17 标题/记忆单发)。前端帧协议、backend journal、计费 4 类 token 都已是**中性格式**;Anthropic 消息形只活在 executor 进程内存。`apiFormat` 字段全链路早已预留(providerStore/http.ts/PushConfig 硬编码 "anthropic")——**插座已留,电器未接**。
2. **重要旁路**:DeepSeek、Kimi、GLM、Qwen、MiniMax 等国产上游 **2025-26 都已原生提供 Anthropic 兼容端点**(如 `api.deepseek.com/anthropic`、`api.moonshot.ai/anthropic`)。很多「OpenAI 格式模型」根本不需要翻译——只需**多 provider(每模型可配 base_url)**。真正需要 OpenAI 翻译层的只剩少数 OpenAI-only 上游。
3. **推荐路线**:内部真源保持 Anthropic 形 + **出口薄翻译层**(client.ts 工厂按 apiFormat 分叉出一个"鸭子型假 Anthropic client",turnLoop 零改动,约 500-1000 行 + 边界测试);LiteLLM sidecar 留作渠道膨胀后的升级路径;**不推荐**换内核(Vercel AI SDK = 重写)、new-api 承担跨格式(保真未证)、OpenRouter(托管出境)。
4. **格式挂 provider 维度而非 model 维度**:接口格式是端点属性。落到产品上=目录新增「上游 Provider」实体(base_url + api_key + api_format),模型挂到 provider——后台加模型时选 provider 即隐含了格式,与你的诉求一致且更准确。
5. **真正的结构性工程是"多 provider"而不是"格式翻译"**:打破 executor「全局唯一 active provider」、`set_runtime_config` 帧启用 providerId(该字段全部端早已在发、恒 null、agent 忽略中——零成本接缝)、push_status 变 per-provider、记账的 `Provider:"scholay-managed"` 硬编码改随帧真实值、目录唯一键改 (provider, model_id) 复合。

## 2. 现状耦合面(代码侦察结论)

| 层 | 现状 | 双协议改造量 |
|----|------|------------|
| LLM 调用点 | 仅 2 处:`messages.stream`(turnLoop)+ `messages.create`(completion) | 翻译层的全部出口 |
| 流事件消费 | content_block_start/delta/stop + finalMessage;input_json_delta 按 block index 组装 | OpenAI SSE → 合成同语义事件(有状态适配器) |
| 会话真源 | executor 内存 `Anthropic.MessageParam[]`;journal/seed 是**纯文本中性形**(seed 只留 text 块) | 内部真源不动;跨重启天然安全 |
| 前端帧协议 | content_start/delta/thinking/tool_* 中性帧 | 零改动 |
| 计费 | normUsage 归一成中性 4 类(input/output/cache_read/cache_creation),Go 侧全链吃中性形 | 只在 executor 咽喉加 OpenAI 字段映射 |
| 工具 | Anthropic 裸形 input_schema;MCP content 块数组透传 tool_result | 定义转 function 包装;result 扁平化 |
| 多模态 | LLM 路径上**不存在图片块**(附件全部物化到 cwd 走文件工具) | 无需处理 |
| cache_control | 全库未用(纯隐式前缀缓存) | 无剥离负担;前缀稳定纪律两家通用 |

## 3. 协议差异要点与已知坑(自研翻译层必测清单)

1. **流式 tool_calls 聚合**(第一优先坑):OpenAI 按 `delta.tool_calls[].index` 分片 arguments 字符串、并行调用交错,必须有状态拼装后再合成 `input_json_delta`;claude-code-router #1397 就在 reasoning→tool_calls 模型(Qwen3 类)上翻车。测试集必须覆盖「并行工具 + reasoning 混排」。
2. **usage 归一**:必须显式 `stream_options:{include_usage:true}`;映射 `uncached_input = prompt_tokens − cached_tokens`、`cache_read = cached_tokens`、`cache_creation = 0`;部分兼容上游流式不吐 usage → 本地 tokenizer 兜底,否则额度/审计失真。
3. **thinking/reasoning**:OpenAI 标准无 thinking 块;DeepSeek `reasoning_content`/OpenRouter `reasoning`/o 系不回传——**非标方言**。历史回放方向必须**剥离 thinking 块**(带 signature 跨 provider 回放会 400 Invalid signature——即使两个 Anthropic 兼容端点之间切换也一样),与 seed 只留 text 的既有哲学一致。
4. **tool_result 结构变换**:Anthropic「1 条 user 消息装 N 个 tool_result 块」↔ OpenAI「assistant.tool_calls + N 条 role:tool 消息」;`is_error` 无对应(编码进文本);MCP 富内容块数组需字符串化。window.ts 的回合切割假设留在内部真源侧,零改动。
5. **参数方言**:同一协议内也分叉(OpenAI 推理模型只认 max_completion_tokens 且拒 temperature;Kimi 要求 reasoning 回传;Qwen 思考模型禁非流式)→ 目录需 per-model capability 配置(reasoning 字段名/参数白名单),不能只有 api_format 二值。
6. **stop_reason 映射**:tool_calls→tool_use、length→max_tokens、stop→end_turn,未知值兜底;OpenAI 上下文超限是 400 错误而非 finish_reason,错误归一也要做。

## 4. 方案对比(详表见 fmt-ecosystem.md)

| 路线 | 改造量 | 保真 | 运维 | 结论 |
|------|--------|------|------|------|
| **F 原生 Anthropic 端点**(上游自带 /anthropic) | 仅多 provider 配置 | 上游官方负责 | 零 | **第一优先**,先盘点覆盖 |
| **I 自研进程内薄翻译层** | client.ts 层 ~500-1000 行,turnLoop 零动 | 自控+conformance 测试锁契约 | 零新进程 | **OpenAI-only 上游的推荐解** |
| A LiteLLM sidecar(/v1/messages 入站) | 零代码(改 base_url) | 文档最全,细节需验 | +1 Python 容器、一跳故障面、配置真源分裂 | 渠道膨胀后的升级路径 |
| D claude-code-router / y-router / a4f-proxy | — | 有已知 bug | 单用户定位 | **只作翻译层参考实现** |
| G Vercel AI SDK | 重写内核(消息真源/滑窗/回放全动) | 库级成熟 | — | 不成比例,排除 |

业界经验:聚合网关内部真源清一色 OpenAI 形(上游长尾在那边),但「会话真源 = Anthropic、边缘出口翻译」是 Claude Code 生态大规模验证过的反向路径(ccr 34k stars、LiteLLM 专门出教程、上游厂商反向做 Anthropic 端点)。**真源选表达力高的一侧,向低侧降级出口**——本系统会话语义(thinking/工具循环/细粒度流)是长尾,Anthropic 真源保持不动是正解。

## 5. 建议实施分期(待拍板)

- **F0 字段贯通(零行为变化)**:目录新增 providers 实体(base_url/api_key/**api_format**/名称)+ agent_models 挂 provider 外键;PushConfig 推 N 条 provider(executor /api/providers 本就支持多条,只需把 activate 语义改为"默认 provider");`set_runtime_config` 帧启用 providerId(hub 权威解析 model→provider 后重组下发);记账 Provider 随帧真实值;全部默认 anthropic,行为等价。
- **F1 盘点 + 接入原生 Anthropic 端点**:把目标模型逐一试连 `/anthropic` 端点,能覆盖的直接多 provider 配置解决(预计覆盖国产主流全部)。
- **F2 Spike 三路对比**(用 DeepSeek,它同时有两种端点):原生 /anthropic vs LiteLLM vs 自研薄层;验收 = 20 轮工具循环保真 + usage 一致性 + thinking 呈现。
- **F3 自研 OpenAI 出口翻译层**(若 spike 确认需要):`agent/src/openai/` 假 Anthropic client(请求组装/流式状态机/usage 归一/历史消毒),conformance 测试(harness/conformance.ts 已有雏形且 apiFormat 已入参)锁死输出契约;目录加 per-model capability 方言配置。

## 6. 风险与显式取舍

- 会话中途换 api_format:历史剥 thinking + tool 块细节降级(与重连行为一致),需在 UI 提示或限制;
- OpenAI 侧无 cache_creation 计费维度、缓存折扣口径不同 → P3 的成本快照按目录单价照算,但「加权 vs 真实成本」比值监控要分 provider 看;
- fastCompletion(标题/记忆)走全局 system.fast 绑定——若与会话模型分属两种协议,两条出口都得就位(顺手把它也 purpose 化);
- 多一格式=多一测试矩阵:conformance 必须进 CI,否则上游方言漂移静默坏工具调用。
