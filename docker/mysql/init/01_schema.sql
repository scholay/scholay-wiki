-- Scholar Database Schema
-- This file contains all table definitions for the Scholar project

SET NAMES utf8mb4;
SET CHARACTER SET utf8mb4;

-- Admin users table
CREATE TABLE IF NOT EXISTS `admin_users` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `username` VARCHAR(50) NOT NULL UNIQUE,
  `password_hash` VARCHAR(255) NOT NULL,
  `email` VARCHAR(100),
  `status` TINYINT NOT NULL DEFAULT 1 COMMENT '1=active, 0=inactive',
  `last_login_at` DATETIME,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_username` (`username`),
  INDEX `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Admin users table';

-- Users table with extensible authentication design
CREATE TABLE IF NOT EXISTS `users` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `username` VARCHAR(50) UNIQUE,
  `email` VARCHAR(100) UNIQUE,
  `phone` VARCHAR(20) UNIQUE,
  `password_hash` VARCHAR(255),
  `avatar_url` VARCHAR(255),
  `status` TINYINT NOT NULL DEFAULT 1 COMMENT '1=active, 0=inactive, 2=suspended',
  `email_verified` BOOLEAN NOT NULL DEFAULT FALSE,
  `phone_verified` BOOLEAN NOT NULL DEFAULT FALSE,
  `subscription_plan` VARCHAR(20) NOT NULL DEFAULT 'free' COMMENT 'free, pro, max',
  `subscription_expires_at` DATETIME COMMENT 'Subscription expiration date (NULL for free tier)',
  `last_login_at` DATETIME,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_email` (`email`),
  INDEX `idx_phone` (`phone`),
  INDEX `idx_username` (`username`),
  INDEX `idx_status` (`status`),
  INDEX `idx_subscription_plan` (`subscription_plan`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Users table';

-- User authentication providers (for OAuth, WeChat, etc.)
CREATE TABLE IF NOT EXISTS `user_auth_providers` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `provider` VARCHAR(20) NOT NULL COMMENT 'email, phone, wechat, google, etc.',
  `provider_user_id` VARCHAR(255) NOT NULL COMMENT 'ID from the provider',
  `provider_data` JSON COMMENT 'Additional data from provider',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_provider_user` (`provider`, `provider_user_id`),
  INDEX `idx_user_id` (`user_id`),
  CONSTRAINT `fk_user_auth_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='User authentication providers';

-- Note: Email verification codes are now stored in Redis (auto-expiring cache)
-- Removed table: email_verification_codes

-- Privacy policies
CREATE TABLE IF NOT EXISTS `privacy_policies` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `content` TEXT NOT NULL,
  `version` VARCHAR(50) NOT NULL,
  `is_active` BOOLEAN NOT NULL DEFAULT TRUE,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_is_active` (`is_active`),
  INDEX `idx_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Privacy policies';

-- Note: Default admin user and privacy policy are initialized by the application on first startup
-- This ensures that existing data is not overwritten on container restart

-- Email configurations
CREATE TABLE IF NOT EXISTS `email_configs` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `smtp_host` VARCHAR(255) NOT NULL,
  `smtp_port` INT NOT NULL,
  `smtp_user` VARCHAR(255) NOT NULL,
  `smtp_password` VARCHAR(255) NOT NULL,
  `from_email` VARCHAR(255) NOT NULL,
  `from_name` VARCHAR(255) NOT NULL,
  `is_active` BOOLEAN NOT NULL DEFAULT TRUE,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_is_active` (`is_active`),
  INDEX `idx_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Email server configurations';

-- SMS configurations (Aliyun SMS)
CREATE TABLE IF NOT EXISTS `sms_configs` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `access_key_id` VARCHAR(255) NOT NULL COMMENT 'Aliyun Access Key ID',
  `access_secret` VARCHAR(255) NOT NULL COMMENT 'Aliyun Access Secret',
  `sign_name` VARCHAR(100) NOT NULL COMMENT 'SMS signature name',
  `template_code` VARCHAR(50) NOT NULL COMMENT 'SMS template code',
  `template_content` TEXT NOT NULL COMMENT 'SMS template content with variables like ${code}',
  `endpoint` VARCHAR(255) NOT NULL DEFAULT 'dypnsapi.aliyuncs.com' COMMENT 'Aliyun Phone Number Service endpoint',
  `is_active` BOOLEAN NOT NULL DEFAULT TRUE,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_is_active` (`is_active`),
  INDEX `idx_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='SMS service configurations (Aliyun)';

-- Alipay configurations
CREATE TABLE IF NOT EXISTS `alipay_configs` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `app_id` VARCHAR(32) NOT NULL COMMENT 'Alipay App ID',
  `private_key` TEXT NOT NULL COMMENT 'Application private key (PKCS8 format)',
  `alipay_public_key` TEXT NOT NULL COMMENT 'Alipay public key',
  `gateway_url` VARCHAR(255) NOT NULL DEFAULT 'https://openapi.alipay.com/gateway.do' COMMENT 'Alipay gateway URL',
  `notify_url` VARCHAR(255) NOT NULL COMMENT 'Payment callback URL',
  `return_url` VARCHAR(255) COMMENT 'Return URL after payment',
  `is_sandbox` BOOLEAN NOT NULL DEFAULT FALSE COMMENT 'Whether using sandbox environment',
  `is_active` BOOLEAN NOT NULL DEFAULT TRUE COMMENT 'Whether this config is active',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_is_active` (`is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Alipay payment configurations';

-- WeChat OAuth configurations
CREATE TABLE IF NOT EXISTS `wechat_configs` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `app_id` VARCHAR(32) NOT NULL COMMENT 'WeChat App ID',
  `app_secret` VARCHAR(64) NOT NULL COMMENT 'WeChat App Secret',
  `redirect_uri` VARCHAR(255) NOT NULL COMMENT 'OAuth redirect URI',
  `scope` VARCHAR(50) NOT NULL DEFAULT 'snsapi_login' COMMENT 'OAuth scope: snsapi_login for web, snsapi_userinfo for mobile',
  `is_active` BOOLEAN NOT NULL DEFAULT TRUE COMMENT 'Whether this config is active',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_is_active` (`is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='WeChat OAuth configurations';

-- System configurations
CREATE TABLE IF NOT EXISTS `system_configs` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `require_email_verification` BOOLEAN NOT NULL DEFAULT TRUE COMMENT '登录/注册是否需要邮箱验证码',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='System configuration settings';

-- User sessions (for tracking online status)
CREATE TABLE IF NOT EXISTS `user_sessions` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `token` VARCHAR(500) NOT NULL,
  `ip` VARCHAR(45),
  `user_agent` VARCHAR(500),
  `last_activity` DATETIME NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `expires_at` DATETIME NOT NULL,
  PRIMARY KEY (`id`),
  INDEX `idx_user_id` (`user_id`),
  INDEX `idx_token` (`token`),
  INDEX `idx_last_activity` (`last_activity`),
  INDEX `idx_expires_at` (`expires_at`),
  INDEX `idx_active_sessions` (`last_activity`, `expires_at`),
  FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='User sessions for online tracking';

-- User statistics (daily aggregated data)
CREATE TABLE IF NOT EXISTS `user_statistics` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `date` DATE NOT NULL UNIQUE COMMENT 'Statistics date (YYYY-MM-DD)',
  `new_users` INT NOT NULL DEFAULT 0 COMMENT 'New registrations on this day',
  `total_users` INT NOT NULL DEFAULT 0 COMMENT 'Total users up to this day',
  `peak_online_users` INT NOT NULL DEFAULT 0 COMMENT 'Peak online users on this day',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `uk_date` (`date`),
  INDEX `idx_date` (`date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Daily user statistics';

-- Online user snapshots (hourly data for real-time charts)
CREATE TABLE IF NOT EXISTS `online_user_snapshots` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `timestamp` DATETIME NOT NULL COMMENT 'Snapshot timestamp',
  `online_count` INT NOT NULL DEFAULT 0 COMMENT 'Number of online users at this time',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_timestamp` (`timestamp`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Hourly online user count snapshots';

-- Third-party account configurations
CREATE TABLE IF NOT EXISTS `third_party_accounts` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(100) NOT NULL COMMENT 'Account name/description',
  `type` VARCHAR(50) NOT NULL COMMENT 'Account type: semantic_scholar, ai_model',
  `config` JSON NOT NULL COMMENT 'Configuration details (api_key, base_url, model_low, model_mid, model_high for AI models)',
  `status` TINYINT NOT NULL DEFAULT 1 COMMENT '1=active, 0=inactive',
  `usage_count` BIGINT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'Number of times used',
  `last_used_at` DATETIME COMMENT 'Last usage timestamp',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_type_status` (`type`, `status`),
  INDEX `idx_last_used` (`last_used_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Third-party API account configurations';

-- Remove old model_level column if exists (for migration)
-- Use procedure to safely drop column and index if they exist
DELIMITER $$
CREATE PROCEDURE drop_model_level_if_exists()
BEGIN
    DECLARE column_exists INT DEFAULT 0;
    DECLARE index_exists INT DEFAULT 0;

    -- Check if column exists
    SELECT COUNT(*) INTO column_exists
    FROM information_schema.columns
    WHERE table_schema = 'scholar'
    AND table_name = 'third_party_accounts'
    AND column_name = 'model_level';

    IF column_exists > 0 THEN
        ALTER TABLE `third_party_accounts` DROP COLUMN `model_level`;
    END IF;

    -- Check if index exists
    SELECT COUNT(*) INTO index_exists
    FROM information_schema.statistics
    WHERE table_schema = 'scholar'
    AND table_name = 'third_party_accounts'
    AND index_name = 'idx_type_level';

    IF index_exists > 0 THEN
        ALTER TABLE `third_party_accounts` DROP INDEX `idx_type_level`;
    END IF;
END$$
DELIMITER ;

CALL drop_model_level_if_exists();
DROP PROCEDURE drop_model_level_if_exists;


-- Conversations table
CREATE TABLE IF NOT EXISTS `conversations` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT UNSIGNED NOT NULL COMMENT 'User ID',
  `title` VARCHAR(255) NOT NULL COMMENT 'Conversation title (auto-generated from first message)',
  `conversation_type` VARCHAR(20) NOT NULL DEFAULT 'search' COMMENT 'Conversation type: chat or search',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_user_id` (`user_id`),
  INDEX `idx_updated_at` (`updated_at`),
  INDEX `idx_conversation_type` (`conversation_type`),
  INDEX `idx_user_type` (`user_id`, `conversation_type`),
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='User conversation history';

-- Add model_level column to conversations table (for AI chat model persistence)
-- Use stored procedure to handle IF NOT EXISTS for column
DELIMITER //
CREATE PROCEDURE add_model_level_if_not_exists()
BEGIN
  IF NOT EXISTS (
    SELECT * FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'conversations'
    AND COLUMN_NAME = 'model_level'
  ) THEN
    ALTER TABLE `conversations`
    ADD COLUMN `model_level` VARCHAR(20) DEFAULT 'low' COMMENT 'Model level used: low, mid, high';
  END IF;
END//
DELIMITER ;

CALL add_model_level_if_not_exists();
DROP PROCEDURE add_model_level_if_not_exists;

-- Conversation messages table (Enhanced with LibreChat-style message chain support)
CREATE TABLE IF NOT EXISTS `conversation_messages` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `message_id` VARCHAR(36) NOT NULL UNIQUE COMMENT 'UUID for message (for message chain linking)',
  `conversation_id` BIGINT UNSIGNED NOT NULL COMMENT 'Conversation ID',
  `parent_message_id` VARCHAR(36) COMMENT 'Parent message ID for building message chain (enables branching)',
  `role` VARCHAR(20) NOT NULL COMMENT 'Message role: user, assistant, system',
  `content` TEXT NOT NULL COMMENT 'Message content',
  `search_query` VARCHAR(500) COMMENT 'Search query if this is a user search message',
  `search_results` JSON COMMENT 'Semantic Scholar search results',
  `search_results_total` INT NOT NULL DEFAULT 0 COMMENT 'Total count of search results from Semantic Scholar',
  `token_count` INT DEFAULT 0 COMMENT 'Token count for this message (for context window management)',
  `model` VARCHAR(50) COMMENT 'AI model used for assistant messages',
  `finish_reason` VARCHAR(20) COMMENT 'Completion reason: stop, length, content_filter, etc.',
  `error` BOOLEAN DEFAULT FALSE COMMENT 'Whether this message encountered an error',
  `unfinished` BOOLEAN DEFAULT FALSE COMMENT 'Whether this message is incomplete (streaming interrupted)',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_message_id` (`message_id`),
  INDEX `idx_conversation_id` (`conversation_id`),
  INDEX `idx_parent_message_id` (`parent_message_id`),
  INDEX `idx_created_at` (`created_at`),
  INDEX `idx_conversation_created` (`conversation_id`, `created_at`),
  INDEX `idx_message_chain` (`conversation_id`, `parent_message_id`, `created_at`),
  FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Messages within conversations with chain support';

-- Prompt templates table
CREATE TABLE IF NOT EXISTS `prompt_templates` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(100) NOT NULL COMMENT 'Template name',
  `key` VARCHAR(50) NOT NULL UNIQUE COMMENT 'Template key for code reference',
  `template` TEXT NOT NULL COMMENT 'Prompt template with placeholders',
  `description` TEXT COMMENT 'Template description',
  `variables` JSON COMMENT 'Template variables definition',
  `is_active` TINYINT NOT NULL DEFAULT 1 COMMENT '1=active, 0=inactive',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `idx_key` (`key`),
  INDEX `idx_active` (`is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='AI prompt templates';

-- Subscription plans table
CREATE TABLE IF NOT EXISTS `subscription_plans` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `plan_code` VARCHAR(20) NOT NULL UNIQUE COMMENT 'Plan code: free, pro, max',
  `plan_name` VARCHAR(50) NOT NULL COMMENT 'Plan display name',
  `price_monthly` DECIMAL(10,2) NOT NULL DEFAULT 0.00 COMMENT 'Monthly price in CNY/USD',
  `price_yearly` DECIMAL(10,2) NOT NULL DEFAULT 0.00 COMMENT 'Yearly price in CNY/USD',
  `features` JSON NOT NULL COMMENT 'Plan features and quotas',
  `is_active` TINYINT NOT NULL DEFAULT 1 COMMENT '1=active, 0=inactive',
  `sort_order` INT NOT NULL DEFAULT 0 COMMENT 'Display order',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `idx_plan_code` (`plan_code`),
  INDEX `idx_is_active` (`is_active`),
  INDEX `idx_sort_order` (`sort_order`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Subscription plans';

-- User subscriptions table
CREATE TABLE IF NOT EXISTS `user_subscriptions` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `plan_code` VARCHAR(20) NOT NULL COMMENT 'Plan code: free, pro, max',
  `start_date` DATETIME NOT NULL COMMENT 'Subscription start date',
  `end_date` DATETIME COMMENT 'Subscription end date (NULL for lifetime/free)',
  `status` VARCHAR(20) NOT NULL DEFAULT 'active' COMMENT 'active, expired, cancelled',
  `auto_renew` TINYINT NOT NULL DEFAULT 0 COMMENT '1=auto-renew, 0=manual',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_user_id` (`user_id`),
  INDEX `idx_status` (`status`),
  INDEX `idx_end_date` (`end_date`),
  INDEX `idx_user_status` (`user_id`, `status`),
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='User subscription records';

-- Usage quotas table (for tracking user usage)
CREATE TABLE IF NOT EXISTS `usage_quotas` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `quota_date` DATE NOT NULL COMMENT 'Usage date (YYYY-MM-DD)',
  `normal_search_count` INT NOT NULL DEFAULT 0 COMMENT 'Normal search count',
  `advanced_search_low_count` INT NOT NULL DEFAULT 0 COMMENT 'Advanced search (low mode) count',
  `advanced_search_mid_count` INT NOT NULL DEFAULT 0 COMMENT 'Advanced search (mid mode) count',
  `advanced_search_high_count` INT NOT NULL DEFAULT 0 COMMENT 'Advanced search (high mode) count',
  `ai_chat_normal_count` INT NOT NULL DEFAULT 0 COMMENT 'AI chat (normal model) count',
  `ai_chat_mid_count` INT NOT NULL DEFAULT 0 COMMENT 'AI chat (mid model) count',
  `ai_chat_high_count` INT NOT NULL DEFAULT 0 COMMENT 'AI chat (high model) count',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_user_date` (`user_id`, `quota_date`),
  INDEX `idx_user_id` (`user_id`),
  INDEX `idx_quota_date` (`quota_date`),
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Daily usage quota tracking';

-- ============================================
-- Initial Data: Subscription Plans
-- ============================================

INSERT INTO `subscription_plans` (`plan_code`, `plan_name`, `price_monthly`, `price_yearly`, `features`, `is_active`, `sort_order`) VALUES
('free', 'FREE', 0.00, 0.00, '{
  "normal_search": {"limit": -1, "description": "无限制"},
  "advanced_search_low": {"limit": 5, "period": "day", "description": "5/天"},
  "advanced_search_mid": {"limit": 3, "period": "day", "description": "3/天"},
  "advanced_search_high": {"limit": 2, "period": "day", "description": "2/天"},
  "ai_chat_normal": {"limit": -1, "description": "无限制"},
  "ai_chat_mid": {"limit": 50, "period": "day", "description": "50/天"},
  "ai_chat_high": {"limit": 10, "period": "day", "description": "10/天"},
  "advanced_search_data": {"enabled": true, "description": "无限制"},
  "ai_history_data": {"enabled": true, "description": "无限制"}
}', 1, 1),
('pro', 'PRO', 88.00, 880.00, '{
  "normal_search": {"limit": -1, "description": "无限制"},
  "advanced_search_low": {"limit": -1, "description": "无限制"},
  "advanced_search_mid": {"limit": -1, "description": "无限制"},
  "advanced_search_high": {"limit": -1, "description": "无限制"},
  "ai_chat_normal": {"limit": -1, "description": "无限制"},
  "ai_chat_mid": {"limit": -1, "description": "无限制"},
  "ai_chat_high": {"limit": -1, "description": "无限制"},
  "advanced_search_data": {"enabled": true, "description": "无限制"},
  "ai_history_data": {"enabled": true, "description": "无限制"}
}', 1, 2),
('max', 'MAX1', 199.00, 1990.00, '{
  "normal_search": {"limit": -1, "description": "无限制"},
  "advanced_search_low": {"limit": -1, "description": "无限制"},
  "advanced_search_mid": {"limit": -1, "description": "无限制"},
  "advanced_search_high": {"limit": -1, "description": "无限制"},
  "ai_chat_normal": {"limit": -1, "description": "无限制"},
  "ai_chat_mid": {"limit": -1, "description": "无限制"},
  "ai_chat_high": {"limit": -1, "description": "无限制"},
  "advanced_search_data": {"enabled": true, "description": "无限制"},
  "ai_history_data": {"enabled": true, "description": "无限制"}
}', 1, 3)
ON DUPLICATE KEY UPDATE
  `plan_name` = VALUES(`plan_name`),
  `price_monthly` = VALUES(`price_monthly`),
  `price_yearly` = VALUES(`price_yearly`),
  `features` = VALUES(`features`),
  `is_active` = VALUES(`is_active`),
  `sort_order` = VALUES(`sort_order`);

-- ============================================
-- Initial Data: Default Prompt Template
-- ============================================

INSERT INTO `prompt_templates` (`name`, `key`, `template`, `description`, `is_active`) VALUES
('论文分析总结提示词', 'paper_analysis',
'你是一位专业的学术研究助手。用户搜索了关键词：「{{query}}」，系统找到了相关的学术论文。请你对这些论文进行深入分析和总结。

## 论文列表

{{papers}}

## 分析要求

请按照以下结构输出分析报告（使用 Markdown 格式）：

### 1. 研究主题概述
- 简要说明这批论文围绕的核心研究主题
- 指出该领域的研究热点和趋势

### 2. 重点论文解读
- 选择引用量最高或最具代表性的 3-5 篇论文
- 对每篇论文进行简要介绍，包括：
  - 研究目标和方法
  - 主要贡献和创新点
  - 研究结果和结论

### 3. 研究方法分析
- 总结这些论文中常用的研究方法
- 分析方法的优缺点
- 指出方法论上的创新

### 4. 研究发现与结论
- 汇总主要研究发现
- 总结共同的结论和观点
- 指出存在争议或分歧的地方

### 5. 未来研究方向
- 基于现有研究，提出可能的研究方向
- 指出研究空白和待解决的问题
- 给出学习和研究建议

### 6. 推荐阅读
- 推荐 3-5 篇最值得深入阅读的论文
- 说明推荐理由

请确保分析客观、准确、有深度，帮助用户快速了解该研究领域的现状和发展趋势。',
'用于分析搜索到的学术论文并生成结构化综述',
1)
ON DUPLICATE KEY UPDATE
  `name` = VALUES(`name`),
  `template` = VALUES(`template`),
  `description` = VALUES(`description`),
  `is_active` = VALUES(`is_active`);

-- ============================================
-- Orders and Payments
-- ============================================

CREATE TABLE IF NOT EXISTS `orders` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `order_no` VARCHAR(64) NOT NULL UNIQUE COMMENT 'Order number',
  `plan_code` VARCHAR(20) NOT NULL COMMENT 'Subscription plan code',
  `plan_name` VARCHAR(50) NOT NULL COMMENT 'Plan name at the time of order',
  `billing_cycle` VARCHAR(20) NOT NULL COMMENT 'monthly or yearly',
  `amount` DECIMAL(10,2) NOT NULL COMMENT 'Order amount',
  `status` VARCHAR(20) NOT NULL DEFAULT 'pending' COMMENT 'pending, paid, cancelled, refunded',
  `payment_method` VARCHAR(50) COMMENT 'Payment method: alipay, wechat, stripe, etc.',
  `payment_time` DATETIME COMMENT 'Payment completion time',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_order_no` (`order_no`),
  KEY `idx_user_id` (`user_id`),
  KEY `idx_status` (`status`),
  KEY `idx_created_at` (`created_at`),
  CONSTRAINT `fk_orders_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Subscription orders';

CREATE TABLE IF NOT EXISTS `payment_transactions` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `order_id` BIGINT UNSIGNED NOT NULL,
  `transaction_no` VARCHAR(100) COMMENT 'External transaction ID from payment gateway',
  `payment_method` VARCHAR(50) NOT NULL COMMENT 'Payment method',
  `amount` DECIMAL(10,2) NOT NULL,
  `status` VARCHAR(20) NOT NULL DEFAULT 'pending' COMMENT 'pending, success, failed',
  `payment_data` JSON COMMENT 'Additional payment data',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_order_id` (`order_id`),
  KEY `idx_transaction_no` (`transaction_no`),
  CONSTRAINT `fk_payment_order` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Payment transactions';
