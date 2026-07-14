-- ============================================================================
-- 0066: 上游 Provider 实体(双协议兼容 F0,方案 docs/research/api-format-compat-2026-07/REPORT.md)
-- ----------------------------------------------------------------------------
-- 设计决策:agent_providers 只放**额外** provider;
--   · agent_models.provider_id = 0 恒指「默认 provider」= agent_config 现行 scholay-managed 链
--     (base_url/api_key/推送自愈/push_status/AgentConfigPage 全部零改动,纯增量扩展);
--   · api_format:'anthropic' | 'openai' —— F0 只落字段与贯通,openai 翻译层 F3 才启用,
--     故 admin 保存校验暂只放行 anthropic(见 modelcatalog service)。
-- executor 侧 upsert 键 = "scholay-p<id>"(默认 provider 仍是 "scholay-managed");额外 provider
-- 永不 activate(activate 语义保留给默认),per-turn 用 set_runtime_config{providerId} 指定。
-- 幂等:CREATE TABLE IF NOT EXISTS / add_column_if_not_exists;never DROP。utf8mb4 全库对齐。
-- ============================================================================

CREATE TABLE IF NOT EXISTS `agent_providers` (
  `id`             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name`           VARCHAR(100) NOT NULL DEFAULT ''          COMMENT '展示名(如 OpenAI 官方 / xx 中转)',
  `base_url`       VARCHAR(500) NOT NULL DEFAULT '',
  `api_key`        VARCHAR(500) NOT NULL DEFAULT '',
  `api_format`     VARCHAR(16)  NOT NULL DEFAULT 'anthropic' COMMENT 'anthropic | openai(F3 启用)',
  `enabled`        TINYINT(1)   NOT NULL DEFAULT 1,
  `push_status`    VARCHAR(16)  NOT NULL DEFAULT 'pending'   COMMENT 'pending/success/failed(per-provider)',
  `push_error`     VARCHAR(1024) NOT NULL DEFAULT '',
  `last_pushed_at` DATETIME     NULL,
  `notes`          VARCHAR(500) NOT NULL DEFAULT '',
  `created_at`     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='额外上游 provider(0=默认,走 agent_config)';

-- 模型挂 provider:0 = 默认 provider(agent_config 链),>0 = agent_providers.id。
CALL add_column_if_not_exists('agent_models', 'provider_id', 'BIGINT UNSIGNED NOT NULL DEFAULT 0');
