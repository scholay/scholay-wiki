-- 0007_iterative_fields.sql
-- 迭代字段迁移：恩特学术（Discourse）DiscourseConnect SSO 登录支持

CREATE TABLE IF NOT EXISTS `discourse_sso_config` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `site_url` VARCHAR(255) NOT NULL DEFAULT '' COMMENT '恩特学术站点地址 (Discourse)',
  `sso_secret` VARCHAR(255) NOT NULL DEFAULT '' COMMENT 'DiscourseConnect Provider Secret',
  `redirect_uri` VARCHAR(255) NOT NULL DEFAULT '' COMMENT '回调地址',
  `enabled` BOOLEAN NOT NULL DEFAULT FALSE COMMENT '是否启用',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
