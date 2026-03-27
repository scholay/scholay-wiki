-- ============================================================================
-- 迭代迁移：LaTeX Agent 配置表新增字段
-- 为已存在的 latex_agent_config 表添加多Agent模式相关字段
-- ============================================================================

CALL add_column_if_not_exists('latex_agent_config', 'enable_multi_agent', "BOOLEAN DEFAULT FALSE COMMENT '启用多Agent模式'");
CALL add_column_if_not_exists('latex_agent_config', 'auto_compact_enabled', "BOOLEAN DEFAULT TRUE COMMENT '启用自动上下文压缩'");
CALL add_column_if_not_exists('latex_agent_config', 'auto_compact_threshold', "DECIMAL(3,2) DEFAULT 0.85 COMMENT '自动压缩触发阈值(0-1)'");
CALL add_column_if_not_exists('latex_agent_config', 'planner_model_id', "INT UNSIGNED DEFAULT NULL COMMENT '规划Agent使用的模型ID'");
CALL add_column_if_not_exists('latex_agent_config', 'validator_model_id', "INT UNSIGNED DEFAULT NULL COMMENT '验证Agent使用的模型ID'");
CALL add_column_if_not_exists('latex_agent_config', 'default_tool_permissions', "JSON DEFAULT NULL COMMENT '默认工具权限配置'");

-- online_user_snapshots 添加访客数字段
CALL add_column_if_not_exists('online_user_snapshots', 'guest_count', "INT NOT NULL DEFAULT 0 COMMENT '在线访客数(峰值)' AFTER `online_count`");
