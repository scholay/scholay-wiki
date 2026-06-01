-- ============================================================================
-- 0009: ORCID + Microsoft OAuth 配置表
-- ============================================================================

-- ORCID OAuth 配置表
CREATE TABLE IF NOT EXISTS `orcid_oauth_config` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `client_id` VARCHAR(100) NOT NULL DEFAULT '' COMMENT 'ORCID OAuth Client ID',
  `client_secret` VARCHAR(255) NOT NULL DEFAULT '' COMMENT 'ORCID OAuth Client Secret',
  `redirect_uri` VARCHAR(255) NOT NULL DEFAULT '' COMMENT 'ORCID OAuth Redirect URI',
  `use_sandbox` BOOLEAN NOT NULL DEFAULT FALSE COMMENT '是否使用 ORCID Sandbox 环境',
  `enabled` BOOLEAN NOT NULL DEFAULT FALSE COMMENT '是否启用 ORCID OAuth 登录',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='ORCID OAuth 配置';

-- Microsoft OAuth 配置表
CREATE TABLE IF NOT EXISTS `microsoft_oauth_config` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `client_id` VARCHAR(100) NOT NULL DEFAULT '' COMMENT 'Microsoft App Client ID',
  `client_secret` VARCHAR(255) NOT NULL DEFAULT '' COMMENT 'Microsoft App Client Secret',
  `redirect_uri` VARCHAR(255) NOT NULL DEFAULT '' COMMENT 'Microsoft OAuth Redirect URI',
  `tenant` VARCHAR(100) NOT NULL DEFAULT 'common' COMMENT 'Azure AD Tenant (common/organizations/consumers/tenant-id)',
  `enabled` BOOLEAN NOT NULL DEFAULT FALSE COMMENT '是否启用 Microsoft OAuth 登录',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Microsoft OAuth 配置';
