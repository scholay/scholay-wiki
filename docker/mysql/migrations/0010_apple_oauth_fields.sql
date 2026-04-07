-- ============================================================================
-- 0010: Apple Sign In 配置表
-- ============================================================================

CREATE TABLE IF NOT EXISTS `apple_oauth_config` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `service_id` VARCHAR(100) NOT NULL DEFAULT '' COMMENT 'Apple Service ID (com.example.app)',
  `team_id` VARCHAR(20) NOT NULL DEFAULT '' COMMENT 'Apple Developer Team ID',
  `key_id` VARCHAR(20) NOT NULL DEFAULT '' COMMENT 'Sign In with Apple Key ID',
  `private_key` TEXT NOT NULL COMMENT 'Apple Private Key (.p8 内容)',
  `redirect_uri` VARCHAR(255) NOT NULL DEFAULT '' COMMENT 'Apple OAuth Redirect URI',
  `enabled` BOOLEAN NOT NULL DEFAULT FALSE COMMENT '是否启用 Apple 登录',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Apple Sign In 配置';
