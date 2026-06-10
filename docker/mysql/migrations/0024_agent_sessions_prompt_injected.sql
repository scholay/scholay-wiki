-- ============================================================================
-- 0024 · agent_sessions 增加 prompt_injected 标记(WS 升级免拉全量 transcript)
--
-- 背景:InjectPromptOnFirstMsg 的 feature(smart_search / claw / prism)每条 WS
-- 连接都要判断「这个 session 是否已经注入过 system prompt 前缀」。原实现调
-- SessionAlreadyHasUserMessage → GetSessionMessages 把整段会话历史从 agent 容器
-- 拉回来(无 limit,长会话可达 MB 级),只为读一个 bool —— 每次开页/刷新/重连都付
-- 一次随会话长度线性增长的传输+解析成本。
--
-- 本迁移加一个持久化标记:首次注入成功后置 1,后续 WS 升级只做一次主键级点查,
-- 完全跳过 transcript 探测。标记缺失(存量会话/写失败)时 Go 侧自动回落到原探测,
-- 并在探测确认后回填标记 —— 纯优化位,不影响正确性。
--
-- 重置语义:reset(UpdateSessionID)/实体会话 churn(UpsertByOwnerEntity)换新
-- agent_session_id 时由 Go 侧把标记清零;新建行走列默认值 0。
--
-- 幂等:加列用 0000_utils 存储过程。
-- ============================================================================

CALL add_column_if_not_exists('agent_sessions', 'prompt_injected',
  "tinyint(1) NOT NULL DEFAULT 0 COMMENT '该 agent 会话是否已注入过 system prompt 前缀;0=未注入/未知(连接时回落 transcript 探测),1=已注入(跳过探测)'");
