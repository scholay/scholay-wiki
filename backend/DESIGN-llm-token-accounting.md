# 统一 LLM Token 账本 + 强制登录改造(已实现)

> 状态:**已实现**(2026-06-02)。方案经审定后按"上线步骤"全部落地;backend `docker compose build` + 前端 `tsc -b`/`vite build` 均通过。运行时冒烟(起栈跑 6 feature 看账本行)由部署侧验证。
>
> 落地映射(便于回溯):
> - 表:`docker/mysql/migrations/0006_llm_token_usage.sql`(索引内联)。保留期清理:`internal/common/cleanup` 新增 `cleanOldLLMTokenUsage`(365 天)。
> - 中央记录器:`internal/llmusage`(`Usage` 结构 + 异步 `Record` + ctx `WithCall`/`CallFromCtx`)。bootstrap 注入一份 `*llmusage.Service` 给 ai / agentBridge / smartsearch / claw。
> - 项目侧咽喉点:`ai.Service.executeWithRetry`(成功分支 `recordLLMUsage`,`aiAttemptFn` 多返回一个 `*aiUsage`);流式翻译加 `stream_options.include_usage` + 末尾 chunk 解析。入口 `WithCall`:matrix(`BatchAnalyzePapers`)、translate(`StreamTranslatePaper`)、wechat_oa(`GetAIReply*`,user_id=NULL)。
> - agent 侧:WS(smart_search/claw)= `agentbridge.NewDBUsageRecorder` 串进各 spec 的 `OnMessageComplete`;server-side(peerreview)= `Bridge.ServerSideChatStreaming` 内部 `recordServerSideUsage`,peerreview 4 个 flow 入口 `reviewCallCtx*` 打归属。**修复**:`ChatUsage` 的 cache 字段 tag(`cache_read_tokens`/`cache_creation_tokens`)。`peer_review_reports.agent_tokens_*` 经 `chatWithRetry` 回传 usage + `applyAgentTokens` 写入。
> - 强制登录:`/public/translate/paper/stream` 改 `UserAuthMiddleware()` + `tieredRL`;前端 `TranslatePaperButton` 未登录引导登录(不发 401)。

## 调查结论(几个关键事实)

1. **项目侧 LLM 面只有一个客户端** `internal/ai`(只打 OpenAI 兼容 `/v1/chat/completions`)。`internal/proxy` 已删。peerreview/claw/smart_search/latexwriter **不直接调 LLM**,都走 scholar_agent 容器。
2. 项目侧只有 **3 个 LLM feature**:① 论文批量分析(`matrix`,登录)② 论文翻译 SSE(`translate`,**匿名可访问**)③ 公众号 AI 自动回复(`wechat_oa`,微信签名校验)。
3. **token 现在全丢了**:sync 响应的 `Usage{prompt/completion/total}` 被解析但没人读;只有 `third_party_accounts.total_requests`(**请求数,非 token**)在记。streaming(翻译)连 usage 都没请求。
4. **agent 侧**:smart_search/claw 的 `OnMessageComplete` 拿得到 token,但**只打 slog、没落库**;peerreview 的 `ServerSideChatStreaming` 返回了 `ChatUsage` 但**所有调用点都丢弃**(→ `peer_review_reports.agent_tokens_*` 永远 NULL)。另有个 **field-tag bug**:`ChatUsage` 的 cache 字段名和 agent 发的对不上,永远解析成 0。
5. **唯一真·匿名的 LLM 端点**:`POST /api/v1/public/translate/paper/stream`(`OptionalUserAuthMiddleware`)。其余 LLM 端点都已登录/签名校验。

## 方案

### 1. 统一账本表 `llm_token_usage`(新建,不复用 usage_events)
> usage_events 是"用户动作事件",粒度和 token 无关、无 token 列。新建专表。

迁移 `0006_llm_token_usage_fields.sql`(CREATE TABLE IF NOT EXISTS, utf8mb4)+ `0007_..._indexes.sql`(add_index_if_not_exists)。列:
`id` / `user_id`(**NULL=公众号/匿名**)/ `feature`(smart_search/claw/peer_review/matrix/translate/wechat_oa)/ `source`(`project`|`agent`)/ `provider` / `account_id`(third_party 账号,project 侧)/ `model` / `input_tokens` / `output_tokens` / `total_tokens` / `cache_read_tokens` / `cache_creation_tokens` / `request_id`(关联:project 用 RequestID;agent 用 session_id/submission_id)/ `created_at`。
索引:`(user_id,created_at)` `(feature,created_at)` `(created_at)` `(source)`。无外键(同 usage_events)。

### 2. 中央记录器 `internal/llmusage`(异步,仿 usagestat)
`Recorder.Record(Usage{...})` → `safego.Go` 异步落库,失败只 Warn、绝不阻塞请求。bootstrap 注入一个实例给 ai.Service / wechatofficial / agentbridge / peerreview。

### 3. 两个咽喉点(record 内置,调用方无法漏)
- **项目侧 = `ai.Service.executeWithRetry`**:100% 的项目 LLM 调用都过这里。在它成功分支(`RecordAPIUsage` 之后)读 `response.Usage` 记一行。feature + user_id 走 `context.Context`(`llmusage.WithCall(ctx, feature, userID)`),不用改每个签名。streaming(翻译)加 `stream_options.include_usage` + 解析末尾 usage chunk。
- **agent 侧**:① WS(smart_search/claw)= 已有的 `OnMessageComplete` 钩子,加一个 `NewDBUsageRecorder` 落库(各改 1 行);② server-side(peerreview)= **把 record 放进 `ServerSideChatStreaming` 内部**(而不是返回给 5 个调用点各自记、各自漏),顺带 set `rep.AgentTokensIn/Out` 修掉 NULL 列。先修 ChatUsage field-tag bug。

### 4. 强制登录(就一个端点)
`POST /public/translate/paper/stream` 从 `OptionalUserAuthMiddleware` → `UserAuthMiddleware()`(+ tieredRL)。改完翻译必登录,user_id 必有、可归属。**前端**:翻译入口带 Authorization + 401 引导登录。其余端点不动。

### 5. 公众号例外
webhook 保持公开(微信调、签名校验,非任意匿名)。其 LLM 用量经 `wechat_oa` 自动流过项目侧咽喉点,**记一行 user_id=NULL、feature='wechat_oa'** —— 账本统一、又honor"无用户",以后可按 `WHERE user_id IS NULL AND feature='wechat_oa'` 单独算公众号成本。

### 6. 封装(让"忘记记账"不可能)
项目侧:`executeWithRetry` 是唯一记账点 + 私有化底层 transport,新调用方只能走 `ChatCompletionWithTools`/`StreamChatCompletionWithLevel`(都走咽喉)。agent 侧:record 放进 `ServerSideChatStreaming` 内部 + 要求每个有 LLM 的 FeatureSpec 必配 OnMessageComplete recorder。

## 上线步骤(迁移优先、可增量)
1. 迁移建表(idempotent)→ schema-sync。2. 加 `internal/llmusage` 包 + bootstrap 注入。3. 修 ChatUsage field-tag bug(独立)。4. agent WS 两个 spec 各改 1 行落库。5. 项目侧 executeWithRetry 记账 + streaming usage。6. peerreview record 内置 + 修 NULL 列。7. 翻译改强制登录 + 前端。8. `docker compose build backend` + 前端 tsc/vite。9. 冒烟:6 个 feature 各跑一次,`GROUP BY feature,source` 确认都写行、user_id nullability 对。10.(后续)admin token 用量看板 + token 配额替代消息数配额。

## 待你拍板
1. 专表 `llm_token_usage`(推荐)vs 复用 usage_events。
2. 公众号:**记 user_id=NULL 单独统计**(推荐,成本可对账)vs 完全不记。(你说过"单独统计即可")
3. cost 成本列:v1 先不做(无价格表),读时按 model+token 算 / 以后补列(推荐 defer)。
4. 翻译强制登录 = 匿名用户失去匿名翻译(产品面变化)—— 确认可接受(你原话就是要这个)。
5. 每次 retry(账号轮换/分析 JSON 重试/审稿 chatWithRetry)各记一行(=真实可计费次数,推荐)vs 合并。
6. 账本保留期 TTL(仿 usagestat 365 天?)。
7. streaming 翻译的 token 依赖上游 provider 支持 include_usage;部分 provider 可能不吐 → 该行 token=0(接受部分/标记)。
