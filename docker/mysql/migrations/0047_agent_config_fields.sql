-- ============================================================================
-- 0047: 通用 Agent 服务的模型与端点配置 (单行)
--
-- 用途:
--   docker 容器 scholar_agent (Bun + TS,源在 agent/) 是一个 Claude Code-style 的
--   通用 agent 服务,通过内网 http://scholar_agent:3456 被 backend 调用。
--   原本 agent 的模型 / 端点 / api key 从 .env 读;现在改为从 DB 读,
--   admin 后台维护,backend 启动后 POST 到 agent 的 /api/providers 热更新。
--
-- 单行模式:
--   始终只有 id=1 一行 (参考 wechat_official_config 模式),
--   PUT 接口走 update;不存在多套配置。
--
-- 字段说明:
--   base_url        — Anthropic 协议的上游端点 (如 https://api.deepseek.com/anthropic)
--   api_key         — 上游 Bearer / x-api-key
--   main_model      — 主模型 (大部分对话和工具调用)
--   haiku_model     — 快档模型 (标题生成、历史压缩等小任务)
--   sonnet_model    — 中档模型 (Claude Code 内核显式调 sonnet 槽时用;通常 = main)
--   opus_model      — 重档模型 (深度推理、计划模式等)
--   enabled         — 是否允许 backend 推送配置到 agent (失活时跳过 push)
--
-- 注: Minicod MCP server 的 api key 没进这张表 —— 它在 agent 容器启动时由
-- preinstalled-mcp.json 从 ${MINICOD_API_KEY} env 展开,无法运行时热更,
-- 改值必须重启 agent。运维需要时改 .env 的 AGENT_MINICOD_API_KEY。
--
-- 幂等: CREATE TABLE IF NOT EXISTS,重放安全。
-- ============================================================================

CREATE TABLE IF NOT EXISTS `agent_config` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `base_url` VARCHAR(500) NOT NULL DEFAULT '' COMMENT '上游 Anthropic 协议端点 URL',
  `api_key` VARCHAR(500) NOT NULL DEFAULT '' COMMENT '上游鉴权 token',
  `main_model` VARCHAR(200) NOT NULL DEFAULT '' COMMENT '主模型 ID',
  `haiku_model` VARCHAR(200) NOT NULL DEFAULT '' COMMENT '快档模型 ID (小任务)',
  `sonnet_model` VARCHAR(200) NOT NULL DEFAULT '' COMMENT '中档模型 ID',
  `opus_model` VARCHAR(200) NOT NULL DEFAULT '' COMMENT '重档模型 ID (深度推理)',
  `enabled` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否允许向 agent 推送配置',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='通用 Agent 服务的模型与端点配置 (单行)';
