-- ============================================================================
-- 0008: Google OAuth 配置表
-- ============================================================================

-- Google OAuth 配置表（独立表，与 github_oauth_config 同模式）
CREATE TABLE IF NOT EXISTS `google_oauth_config` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `client_id` VARCHAR(200) NOT NULL DEFAULT '' COMMENT 'Google OAuth Client ID',
  `client_secret` VARCHAR(255) NOT NULL DEFAULT '' COMMENT 'Google OAuth Client Secret (可选，ID Token 模式不需要)',
  `enabled` BOOLEAN NOT NULL DEFAULT FALSE COMMENT '是否启用 Google OAuth 登录',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Google OAuth 配置';
