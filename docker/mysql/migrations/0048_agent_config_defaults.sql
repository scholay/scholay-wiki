-- ============================================================================
-- 0048: agent_config 单行默认数据 (id=1,空字段,enabled=0)
--
-- 让 admin 后台启动后就能 GET /api/v1/admin/agent/config 拿到空模板,
-- 不需要先 INSERT。所有字段空 + enabled=0 → backend 不会向 agent 推送配置。
-- ============================================================================

INSERT IGNORE INTO `agent_config`
  (`id`, `base_url`, `api_key`, `main_model`, `haiku_model`, `sonnet_model`, `opus_model`, `enabled`)
VALUES
  (1, '', '', '', '', '', '', 0);
