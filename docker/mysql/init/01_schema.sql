-- ============================================
-- Scholar Database Schema
-- 此文件包含所有表结构、索引定义
-- 注意: 仅包含DDL语句，不包含数据
-- ============================================

SET NAMES utf8mb4;
SET CHARACTER SET utf8mb4;
SET foreign_key_checks = 0;

-- ============================================
-- 核心用户和认证表
-- ============================================

-- 管理员用户表
CREATE TABLE IF NOT EXISTS `admin_users` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `username` VARCHAR(50) NOT NULL,
  `password_hash` VARCHAR(255) NOT NULL,
  `email` VARCHAR(100),
  `status` TINYINT NOT NULL DEFAULT 1 COMMENT '1=active, 0=inactive',
  `last_login_at` DATETIME,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `uk_username` (`username`),
  INDEX `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='管理员用户表';

-- 用户表（支持多种认证方式）
CREATE TABLE IF NOT EXISTS `users` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `username` VARCHAR(50),
  `email` VARCHAR(100),
  `phone` VARCHAR(20),
  `password_hash` VARCHAR(255),
  `avatar_url` VARCHAR(255),
  `bio` TEXT COMMENT '用户简介',
  `location` VARCHAR(100) COMMENT '用户位置',
  `website` VARCHAR(255) COMMENT '个人网站',
  `status` TINYINT NOT NULL DEFAULT 1 COMMENT '1=active, 0=inactive, 2=suspended',
  `email_verified` BOOLEAN NOT NULL DEFAULT FALSE,
  `phone_verified` BOOLEAN NOT NULL DEFAULT FALSE,
  `subscription_plan` VARCHAR(20) NOT NULL DEFAULT 'free' COMMENT 'free, pro, max',
  `subscription_expires_at` DATETIME COMMENT '订阅过期时间（免费用户为NULL）',
  `last_login_at` DATETIME,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `uk_username` (`username`),
  UNIQUE INDEX `uk_email` (`email`),
  UNIQUE INDEX `uk_phone` (`phone`),
  INDEX `idx_status` (`status`),
  INDEX `idx_subscription_plan` (`subscription_plan`),
  INDEX `idx_location` (`location`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户表';

-- 用户认证提供者（OAuth、微信等）
CREATE TABLE IF NOT EXISTS `user_auth_providers` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `provider` VARCHAR(20) NOT NULL COMMENT 'email, phone, wechat, google等',
  `provider_user_id` VARCHAR(255) NOT NULL COMMENT '第三方平台用户ID',
  `provider_data` JSON COMMENT '第三方平台额外数据',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_provider_user` (`provider`, `provider_user_id`),
  INDEX `idx_user_id` (`user_id`),
  CONSTRAINT `fk_user_auth_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户认证提供者';

-- ============================================
-- 会话和统计表
-- ============================================

-- 用户会话（在线状态跟踪）
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
  INDEX `idx_token` (`token`(64)),  -- Optimized: index only first 64 chars to reduce storage overhead
  -- Removed redundant single-column indexes that are covered by composite indexes
  INDEX `idx_active_sessions` (`last_activity`, `expires_at`),
  INDEX `idx_user_activity` (`user_id`, `last_activity` DESC),
  FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户会话';

-- 用户统计（每日汇总数据）
CREATE TABLE IF NOT EXISTS `user_statistics` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `date` DATE NOT NULL UNIQUE COMMENT '统计日期',
  `new_users` INT NOT NULL DEFAULT 0 COMMENT '当日新增用户',
  `total_users` INT NOT NULL DEFAULT 0 COMMENT '累计用户总数',
  `peak_online_users` INT NOT NULL DEFAULT 0 COMMENT '当日最高在线用户数',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `uk_date` (`date`),
  INDEX `idx_date` (`date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='每日用户统计';

-- 在线用户快照（实时图表数据）
CREATE TABLE IF NOT EXISTS `online_user_snapshots` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `timestamp` DATETIME NOT NULL COMMENT '快照时间',
  `online_count` INT NOT NULL DEFAULT 0 COMMENT '在线用户数',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_timestamp` (`timestamp`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='在线用户快照';

-- ============================================
-- 对话和消息表
-- ============================================

-- 对话表
CREATE TABLE IF NOT EXISTS `conversations` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `title` VARCHAR(255) NOT NULL COMMENT '对话标题（从首条消息生成）',
  `conversation_type` VARCHAR(20) NOT NULL DEFAULT 'search' COMMENT 'chat或search',
  `model_level` VARCHAR(20) DEFAULT 'low' COMMENT '模型级别: low, mid, high',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_user_id` (`user_id`),
  INDEX `idx_updated_at` (`updated_at`),
  INDEX `idx_conversation_type` (`conversation_type`),
  INDEX `idx_user_type` (`user_id`, `conversation_type`),
  INDEX `idx_user_updated` (`user_id`, `updated_at` DESC),
  INDEX `idx_user_type_updated` (`user_id`, `conversation_type`, `updated_at` DESC),
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户对话历史';

-- 对话消息表（支持消息链）
CREATE TABLE IF NOT EXISTS `conversation_messages` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `message_id` VARCHAR(36) NOT NULL COMMENT '消息UUID',
  `conversation_id` BIGINT UNSIGNED NOT NULL,
  `parent_message_id` VARCHAR(36) COMMENT '父消息ID（支持分支）',
  `role` VARCHAR(20) NOT NULL COMMENT 'user, assistant, system',
  `content` TEXT NOT NULL COMMENT '消息内容',
  `search_query` VARCHAR(500) COMMENT '搜索查询（如果是搜索消息）',
  `search_results` JSON COMMENT 'Semantic Scholar搜索结果',
  `search_results_total` INT NOT NULL DEFAULT 0 COMMENT '搜索结果总数',
  `token_count` INT DEFAULT 0 COMMENT 'Token计数',
  `model` VARCHAR(50) COMMENT 'AI模型',
  `finish_reason` VARCHAR(20) COMMENT '完成原因',
  `error` BOOLEAN DEFAULT FALSE COMMENT '是否出错',
  `unfinished` BOOLEAN DEFAULT FALSE COMMENT '是否未完成',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `uk_message_id` (`message_id`),
  INDEX `idx_conversation_id` (`conversation_id`),
  INDEX `idx_parent_message_id` (`parent_message_id`),
  INDEX `idx_created_at` (`created_at`),
  INDEX `idx_conversation_created` (`conversation_id`, `created_at`),
  INDEX `idx_message_chain` (`conversation_id`, `parent_message_id`, `created_at`),
  INDEX `idx_parent` (`parent_message_id`, `conversation_id`),
  FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='对话消息';

-- ============================================
-- 订阅和配额表
-- ============================================

-- 订阅计划表
CREATE TABLE IF NOT EXISTS `subscription_plans` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `plan_code` VARCHAR(20) NOT NULL COMMENT '计划代码: free, pro, max',
  `plan_name` VARCHAR(50) NOT NULL COMMENT '计划名称',
  `price_monthly` DECIMAL(10,2) NOT NULL DEFAULT 0.00 COMMENT '月费',
  `price_yearly` DECIMAL(10,2) NOT NULL DEFAULT 0.00 COMMENT '年费',
  `features` JSON NOT NULL COMMENT '计划功能和配额',
  `is_active` TINYINT NOT NULL DEFAULT 1 COMMENT '1=启用, 0=停用',
  `sort_order` INT NOT NULL DEFAULT 0 COMMENT '显示顺序',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `uk_plan_code` (`plan_code`),
  INDEX `idx_is_active` (`is_active`),
  INDEX `idx_sort_order` (`sort_order`),
  INDEX `idx_active_type` (`is_active`, `plan_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='订阅计划';

-- 用户订阅表
CREATE TABLE IF NOT EXISTS `user_subscriptions` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `plan_code` VARCHAR(20) NOT NULL COMMENT '计划代码',
  `start_date` DATETIME NOT NULL COMMENT '开始日期',
  `end_date` DATETIME COMMENT '结束日期',
  `status` VARCHAR(20) NOT NULL DEFAULT 'active' COMMENT 'active, expired, cancelled',
  `auto_renew` TINYINT NOT NULL DEFAULT 0 COMMENT '1=自动续费',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_user_id` (`user_id`),
  INDEX `idx_status` (`status`),
  INDEX `idx_end_date` (`end_date`),
  INDEX `idx_user_status` (`user_id`, `status`),
  INDEX `idx_user_active` (`user_id`, `status`, `end_date`),
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户订阅记录';

-- 使用配额表
CREATE TABLE IF NOT EXISTS `usage_quotas` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `quota_date` DATE NOT NULL COMMENT '使用日期',
  `normal_search_count` INT NOT NULL DEFAULT 0 COMMENT '普通搜索次数',
  `advanced_search_low_count` INT NOT NULL DEFAULT 0 COMMENT '高级搜索(低)次数',
  `advanced_search_mid_count` INT NOT NULL DEFAULT 0 COMMENT '高级搜索(中)次数',
  `advanced_search_high_count` INT NOT NULL DEFAULT 0 COMMENT '高级搜索(高)次数',
  `ai_chat_normal_count` INT NOT NULL DEFAULT 0 COMMENT 'AI对话(普通)次数',
  `ai_chat_mid_count` INT NOT NULL DEFAULT 0 COMMENT 'AI对话(中)次数',
  `ai_chat_high_count` INT NOT NULL DEFAULT 0 COMMENT 'AI对话(高)次数',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_user_date` (`user_id`, `quota_date`),
  INDEX `idx_user_id` (`user_id`),
  INDEX `idx_quota_date` (`quota_date`),
  INDEX `idx_user_date_desc` (`user_id`, `quota_date` DESC),
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='每日使用配额跟踪';

-- ============================================
-- 订单和支付表
-- ============================================

-- 订单表
CREATE TABLE IF NOT EXISTS `orders` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `order_no` VARCHAR(64) NOT NULL COMMENT '订单号',
  `plan_code` VARCHAR(20) NOT NULL COMMENT '订阅计划代码',
  `plan_name` VARCHAR(50) NOT NULL COMMENT '下单时的计划名称',
  `billing_cycle` VARCHAR(20) NOT NULL COMMENT 'monthly或yearly',
  `amount` DECIMAL(10,2) NOT NULL COMMENT '订单金额',
  `status` VARCHAR(20) NOT NULL DEFAULT 'pending' COMMENT 'pending, paid, cancelled, refunded',
  `payment_method` VARCHAR(50) COMMENT '支付方式',
  `payment_time` DATETIME COMMENT '支付完成时间',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `uk_order_no` (`order_no`),
  INDEX `idx_user_id` (`user_id`),
  INDEX `idx_status` (`status`),
  INDEX `idx_created_at` (`created_at`),
  INDEX `idx_user_created` (`user_id`, `created_at` DESC),
  INDEX `idx_status_created` (`status`, `created_at` DESC),
  CONSTRAINT `fk_orders_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='订阅订单';

-- 支付交易表
CREATE TABLE IF NOT EXISTS `payment_transactions` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `order_id` BIGINT UNSIGNED NOT NULL,
  `transaction_no` VARCHAR(100) COMMENT '外部交易号',
  `payment_method` VARCHAR(50) NOT NULL COMMENT '支付方式',
  `amount` DECIMAL(10,2) NOT NULL,
  `status` VARCHAR(20) NOT NULL DEFAULT 'pending' COMMENT 'pending, success, failed',
  `payment_data` JSON COMMENT '支付额外数据',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_order_id` (`order_id`),
  INDEX `idx_transaction_no` (`transaction_no`),
  CONSTRAINT `fk_payment_order` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='支付交易记录';

-- ============================================
-- 系统配置表
-- ============================================

-- 隐私政策
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='隐私政策';

-- 服务条款
CREATE TABLE IF NOT EXISTS `terms_of_service` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `content` TEXT NOT NULL,
  `version` VARCHAR(50) NOT NULL,
  `is_active` BOOLEAN NOT NULL DEFAULT TRUE,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_is_active` (`is_active`),
  INDEX `idx_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='服务条款';

-- 邮件配置
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='邮件服务器配置';

-- 短信配置（阿里云）
CREATE TABLE IF NOT EXISTS `sms_configs` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `access_key_id` VARCHAR(255) NOT NULL COMMENT '阿里云Access Key ID',
  `access_secret` VARCHAR(255) NOT NULL COMMENT '阿里云Access Secret',
  `sign_name` VARCHAR(100) NOT NULL COMMENT '短信签名',
  `template_code` VARCHAR(50) NOT NULL COMMENT '短信模板代码',
  `template_content` TEXT NOT NULL COMMENT '短信模板内容',
  `endpoint` VARCHAR(255) NOT NULL DEFAULT 'dypnsapi.aliyuncs.com',
  `is_active` BOOLEAN NOT NULL DEFAULT TRUE,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_is_active` (`is_active`),
  INDEX `idx_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='短信服务配置';

-- 支付宝配置
CREATE TABLE IF NOT EXISTS `alipay_configs` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `app_id` VARCHAR(32) NOT NULL COMMENT '支付宝App ID',
  `private_key` TEXT NOT NULL COMMENT '应用私钥',
  `alipay_public_key` TEXT NOT NULL COMMENT '支付宝公钥',
  `gateway_url` VARCHAR(255) NOT NULL DEFAULT 'https://openapi.alipay.com/gateway.do',
  `notify_url` VARCHAR(255) NOT NULL COMMENT '支付回调URL',
  `return_url` VARCHAR(255) COMMENT '支付后返回URL',
  `is_sandbox` BOOLEAN NOT NULL DEFAULT FALSE COMMENT '是否沙箱环境',
  `is_active` BOOLEAN NOT NULL DEFAULT TRUE,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_is_active` (`is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='支付宝配置';

-- 微信OAuth配置
CREATE TABLE IF NOT EXISTS `wechat_configs` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `app_id` VARCHAR(32) NOT NULL COMMENT '微信App ID',
  `app_secret` VARCHAR(64) NOT NULL COMMENT '微信App Secret',
  `redirect_uri` VARCHAR(255) NOT NULL COMMENT 'OAuth重定向URI',
  `scope` VARCHAR(50) NOT NULL DEFAULT 'snsapi_login',
  `is_active` BOOLEAN NOT NULL DEFAULT TRUE,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_is_active` (`is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='微信OAuth配置';

-- 系统配置
CREATE TABLE IF NOT EXISTS `system_configs` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `require_email_verification` BOOLEAN NOT NULL DEFAULT TRUE COMMENT '是否需要邮箱验证',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='系统配置';

-- 第三方账号配置
CREATE TABLE IF NOT EXISTS `third_party_accounts` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(100) NOT NULL COMMENT '账号名称/描述',
  `type` VARCHAR(50) NOT NULL COMMENT '账号类型: semantic_scholar, ai_model',
  `config` JSON NOT NULL COMMENT '配置详情',
  `status` TINYINT NOT NULL DEFAULT 1 COMMENT '1=启用, 0=停用',
  `usage_count` BIGINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '使用次数',
  `last_used_at` DATETIME COMMENT '最后使用时间',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_type_status` (`type`, `status`),
  INDEX `idx_last_used` (`last_used_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='第三方API账号配置';

-- 提示词模板
CREATE TABLE IF NOT EXISTS `prompt_templates` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(100) NOT NULL COMMENT '模板名称',
  `key` VARCHAR(50) NOT NULL COMMENT '模板键值',
  `template` TEXT NOT NULL COMMENT '提示词模板',
  `description` TEXT COMMENT '模板描述',
  `variables` JSON COMMENT '模板变量定义',
  `is_active` TINYINT NOT NULL DEFAULT 1 COMMENT '1=启用, 0=停用',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `uk_key` (`key`),
  INDEX `idx_active` (`is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='AI提示词模板';

SET foreign_key_checks = 1;

-- ============================================
-- 预置数据（仅在表不存在数据时插入）
-- 使用INSERT IGNORE确保不会覆盖已有数据
-- ============================================

-- 默认管理员账号由后端服务启动时自动初始化（从环境变量读取）
-- 配置环境变量: ADMIN_INITIAL_USERNAME, ADMIN_INITIAL_PASSWORD
-- 详见 backend/internal/admin/service.go InitializeDefaultAdmin()

-- 默认订阅计划
INSERT IGNORE INTO `subscription_plans` (`plan_code`, `plan_name`, `price_monthly`, `price_yearly`, `features`, `is_active`, `sort_order`) VALUES
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
('max', 'MAX', 199.00, 1990.00, '{
  "normal_search": {"limit": -1, "description": "无限制"},
  "advanced_search_low": {"limit": -1, "description": "无限制"},
  "advanced_search_mid": {"limit": -1, "description": "无限制"},
  "advanced_search_high": {"limit": -1, "description": "无限制"},
  "ai_chat_normal": {"limit": -1, "description": "无限制"},
  "ai_chat_mid": {"limit": -1, "description": "无限制"},
  "ai_chat_high": {"limit": -1, "description": "无限制"},
  "advanced_search_data": {"enabled": true, "description": "无限制"},
  "ai_history_data": {"enabled": true, "description": "无限制"}
}', 1, 3);

-- 默认提示词模板
INSERT IGNORE INTO `prompt_templates` (`key`, `name`, `template`, `description`, `is_active`) VALUES
('paper_analysis', '论文分析总结提示词',
'你是一位专业的学术研究助手。用户搜索了关键词：「{{query}}」,系统找到了相关的学术论文。请你对这些论文进行深入分析和总结。

## 论文列表

{{papers}}

## 分析要求

请按照以下结构输出分析报告(使用 Markdown 格式):

### 1. 研究主题概述
- 简要说明这批论文围绕的核心研究主题
- 指出该领域的研究热点和趋势

### 2. 重点论文解读
- 选择引用量最高或最具代表性的 3-5 篇论文
- 对每篇论文进行简要介绍,包括:
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
- 基于现有研究,提出可能的研究方向
- 指出研究空白和待解决的问题
- 给出学习和研究建议

### 6. 推荐阅读
- 推荐 3-5 篇最值得深入阅读的论文
- 说明推荐理由

请确保分析客观、准确、有深度,帮助用户快速了解该研究领域的现状和发展趋势。',
'用于分析搜索到的学术论文并生成结构化综述',
1);

-- 默认系统配置
INSERT IGNORE INTO `system_configs` (`id`, `require_email_verification`) VALUES
(1, TRUE);