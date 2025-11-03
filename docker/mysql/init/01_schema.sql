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
  `last_login_at` DATETIME,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_email` (`email`),
  INDEX `idx_phone` (`phone`),
  INDEX `idx_username` (`username`),
  INDEX `idx_status` (`status`)
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
  `config` JSON NOT NULL COMMENT 'Configuration details (api_key, base_url, etc.)',
  `status` TINYINT NOT NULL DEFAULT 1 COMMENT '1=active, 0=inactive',
  `usage_count` BIGINT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'Number of times used',
  `last_used_at` DATETIME COMMENT 'Last usage timestamp',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_type_status` (`type`, `status`),
  INDEX `idx_last_used` (`last_used_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Third-party API account configurations';

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
