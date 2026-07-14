-- ============================================================================
-- 0067: Provider 方言(双协议遗留项)—— reasoning 回传开关
-- ----------------------------------------------------------------------------
-- reasoning_replay:openai 格式 provider 的工具轮是否把 reasoning_content 回传给上游。
--   · Kimi(Moonshot)系推理模型**要求**回传,否则工具轮退化;
--   · DeepSeek 明确要求**不要**回传(回传 400)—— 故默认 0,按上游文档勾选。
-- (max_completion_tokens 方言无需配置:adapter 对 400 报文自动换参重试一次,零配置。)
-- ============================================================================

CALL add_column_if_not_exists('agent_providers', 'reasoning_replay', 'TINYINT(1) NOT NULL DEFAULT 0');
