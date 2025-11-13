-- ============================================
-- 数据迁移：将GitHub配置从system_configs迁移到github_oauth_config
-- ============================================

-- 迁移现有的GitHub配置数据（如果存在）
INSERT IGNORE INTO `github_oauth_config` (`client_id`, `client_secret`, `redirect_uri`, `enabled`, `created_at`, `updated_at`)
SELECT
  COALESCE(`github_client_id`, '') AS `client_id`,
  COALESCE(`github_client_secret`, '') AS `client_secret`,
  COALESCE(`github_redirect_uri`, '') AS `redirect_uri`,
  COALESCE(`enable_github_oauth`, FALSE) AS `enabled`,
  NOW() AS `created_at`,
  NOW() AS `updated_at`
FROM `system_configs`
WHERE `id` = 1
  AND (`github_client_id` IS NOT NULL OR `github_client_secret` IS NOT NULL OR `github_redirect_uri` IS NOT NULL)
LIMIT 1;

-- 删除system_configs表中的GitHub相关字段
-- 注意：MySQL不支持在ALTER TABLE中使用IF EXISTS，所以我们需要先检查字段是否存在
-- 使用存储过程来安全地删除字段

DELIMITER $$

DROP PROCEDURE IF EXISTS MigrateGithubConfig$$
CREATE PROCEDURE MigrateGithubConfig()
BEGIN
    DECLARE CONTINUE HANDLER FOR SQLEXCEPTION BEGIN END;

    -- 删除 enable_github_oauth 字段
    IF EXISTS (
        SELECT * FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'system_configs'
        AND COLUMN_NAME = 'enable_github_oauth'
    ) THEN
        ALTER TABLE `system_configs` DROP COLUMN `enable_github_oauth`;
    END IF;

    -- 删除 github_client_id 字段
    IF EXISTS (
        SELECT * FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'system_configs'
        AND COLUMN_NAME = 'github_client_id'
    ) THEN
        ALTER TABLE `system_configs` DROP COLUMN `github_client_id`;
    END IF;

    -- 删除 github_client_secret 字段
    IF EXISTS (
        SELECT * FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'system_configs'
        AND COLUMN_NAME = 'github_client_secret'
    ) THEN
        ALTER TABLE `system_configs` DROP COLUMN `github_client_secret`;
    END IF;

    -- 删除 github_redirect_uri 字段
    IF EXISTS (
        SELECT * FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'system_configs'
        AND COLUMN_NAME = 'github_redirect_uri'
    ) THEN
        ALTER TABLE `system_configs` DROP COLUMN `github_redirect_uri`;
    END IF;
END$$

DELIMITER ;

-- 执行迁移存储过程
CALL MigrateGithubConfig();

-- 清理存储过程
DROP PROCEDURE IF EXISTS MigrateGithubConfig;
