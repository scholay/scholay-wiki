-- ============================================================================
-- Scholay学术 V1.0
-- Copyright (c) 2025 成都恩特罐罐文化科技有限公司
-- 统一社会信用代码: 91510100MAEEHRNE26
-- All Rights Reserved.
-- ============================================================================

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
  `last_login_ip` VARCHAR(45) COMMENT '最后登录IP',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `uk_username` (`username`),
  UNIQUE INDEX `uk_email` (`email`),
  UNIQUE INDEX `uk_phone` (`phone`),
  INDEX `idx_status` (`status`),
  INDEX `idx_subscription_plan` (`subscription_plan`),
  INDEX `idx_location` (`location`),
  INDEX `idx_last_login_at` (`last_login_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户表';

-- 用户认证提供者（OAuth、微信等）
CREATE TABLE IF NOT EXISTS `user_auth_providers` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `provider` VARCHAR(20) NOT NULL COMMENT 'email, phone, wechat, google等',
  `provider_user_id` VARCHAR(255) NOT NULL COMMENT '第三方平台用户ID（微信为openID）',
  `provider_union_id` VARCHAR(255) COMMENT '第三方平台联合ID（微信UnionID，用于跨应用识别同一用户）',
  `provider_data` JSON COMMENT '第三方平台额外数据',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_provider_user` (`provider`, `provider_user_id`),
  UNIQUE KEY `uk_provider_union` (`provider`, `provider_union_id`),
  INDEX `idx_user_id` (`user_id`),
  INDEX `idx_union_id` (`provider_union_id`),
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
  `device_type` VARCHAR(20) NOT NULL DEFAULT 'pc' COMMENT '设备类型: pc, mobile',
  `ip` VARCHAR(45),
  `user_agent` VARCHAR(500),
  `last_activity` DATETIME NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `expires_at` DATETIME NOT NULL,
  PRIMARY KEY (`id`),
  INDEX `idx_user_id` (`user_id`),
  INDEX `idx_token` (`token`(64)),  -- Optimized: index only first 64 chars to reduce storage overhead
  INDEX `idx_device_type` (`user_id`, `device_type`),  -- For single sign-on per device type
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
  `follow_up_questions` TEXT COMMENT '延伸思考问题（仅最新一轮assistant消息保存）',
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
  `price_monthly` DECIMAL(10,2) NOT NULL DEFAULT 0.00 COMMENT '月费原价',
  `current_price_monthly` DECIMAL(10,2) NOT NULL DEFAULT 0.00 COMMENT '月费实时价格',
  `price_yearly` DECIMAL(10,2) NOT NULL DEFAULT 0.00 COMMENT '年费原价',
  `current_price_yearly` DECIMAL(10,2) NOT NULL DEFAULT 0.00 COMMENT '年费实时价格',
  `yearly_discount_enabled` TINYINT NOT NULL DEFAULT 0 COMMENT '年费是否使用折扣计算: 1=使用折扣, 0=直接定价',
  `yearly_discount_percent` DECIMAL(5,2) NOT NULL DEFAULT 0.00 COMMENT '年费折扣百分比(0-100)',
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
  `amount` DECIMAL(10,2) NOT NULL COMMENT '订单原价（折扣前）',
  `coupon_id` BIGINT UNSIGNED COMMENT '使用的折扣券ID',
  `discount_amount` DECIMAL(10,2) NOT NULL DEFAULT 0.00 COMMENT '折扣金额',
  `final_amount` DECIMAL(10,2) NOT NULL COMMENT '最终支付金额（折扣后）',
  `status` VARCHAR(20) NOT NULL DEFAULT 'pending' COMMENT 'pending, paid, cancelled, refunded',
  `payment_method` VARCHAR(50) COMMENT '支付方式',
  `payment_time` DATETIME COMMENT '支付完成时间',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `uk_order_no` (`order_no`),
  INDEX `idx_user_id` (`user_id`),
  INDEX `idx_coupon_id` (`coupon_id`),
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
-- 折扣券系统表
-- ============================================

-- 折扣券模板表
CREATE TABLE IF NOT EXISTS `coupon_templates` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `code` VARCHAR(50) NOT NULL COMMENT '折扣券代码',
  `name` VARCHAR(100) NOT NULL COMMENT '折扣券名称',
  `description` TEXT COMMENT '折扣券描述',
  `type` ENUM('percentage', 'fixed', 'price_off') NOT NULL DEFAULT 'percentage' COMMENT '折扣类型',
  `discount_value` DECIMAL(10,2) NOT NULL COMMENT '折扣值',

  -- 使用条件
  `min_purchase_amount` DECIMAL(10,2) DEFAULT 0 COMMENT '最低消费金额',
  `applicable_plans` JSON COMMENT '适用的订阅计划ID列表',
  `applicable_products` JSON COMMENT '适用的产品类型列表',

  -- 发放规则
  `distribution_type` ENUM('manual', 'auto_invite', 'auto_register', 'batch', 'targeted') NOT NULL DEFAULT 'manual' COMMENT '发放类型',

  -- 时间限制
  `valid_days` INT DEFAULT 30 COMMENT '有效天数（从领取时开始计算）',
  `fixed_valid_start` DATETIME COMMENT '固定有效开始时间',
  `fixed_valid_end` DATETIME COMMENT '固定有效结束时间',

  -- 使用限制
  `max_usage_total` INT DEFAULT NULL COMMENT '总使用次数限制',
  `max_usage_per_user` INT DEFAULT 1 COMMENT '每用户使用次数限制',
  `first_purchase_only` BOOLEAN DEFAULT FALSE COMMENT '仅限首次购买',
  `new_user_only` BOOLEAN DEFAULT FALSE COMMENT '仅限新用户',

  -- 状态管理
  `status` ENUM('draft', 'active', 'paused', 'expired') DEFAULT 'draft' COMMENT '状态',
  `priority` INT DEFAULT 0 COMMENT '优先级',

  -- 邀请相关
  `is_invite_coupon` BOOLEAN DEFAULT FALSE COMMENT '是否为邀请折扣券',
  `inviter_benefit` JSON COMMENT '邀请人奖励配置',

  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `created_by` BIGINT UNSIGNED COMMENT '创建人ID',

  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_code` (`code`),
  INDEX `idx_status_type` (`status`, `distribution_type`),
  INDEX `idx_valid_time` (`fixed_valid_start`, `fixed_valid_end`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='折扣券模板表';

-- 用户折扣券表
CREATE TABLE IF NOT EXISTS `user_coupons` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT UNSIGNED NOT NULL COMMENT '用户ID',
  `template_id` BIGINT UNSIGNED NOT NULL COMMENT '折扣券模板ID',
  `coupon_code` VARCHAR(100) COMMENT '折扣券唯一码',

  -- 来源追踪
  `source_type` ENUM('manual', 'invite', 'register', 'batch', 'targeted', 'activity') NOT NULL COMMENT '获取方式',
  `source_id` VARCHAR(100) COMMENT '来源ID',
  `source_detail` JSON COMMENT '来源详情',

  -- 有效期
  `valid_from` DATETIME NOT NULL COMMENT '生效时间',
  `valid_until` DATETIME NOT NULL COMMENT '失效时间',

  -- 使用状态
  `status` ENUM('unused', 'reserved', 'used', 'expired', 'cancelled') DEFAULT 'unused' COMMENT '状态: unused=未使用, reserved=已预留, used=已使用, expired=已过期, cancelled=已取消',
  `used_at` DATETIME COMMENT '使用时间',
  `used_order_id` BIGINT UNSIGNED COMMENT '使用订单ID',

  -- 折扣信息（冗余存储）
  `discount_type` VARCHAR(20) NOT NULL COMMENT '折扣类型',
  `discount_value` DECIMAL(10,2) NOT NULL COMMENT '折扣值',
  `min_purchase_amount` DECIMAL(10,2) DEFAULT 0 COMMENT '最低消费金额',

  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_coupon_code` (`coupon_code`),
  INDEX `idx_user_status` (`user_id`, `status`),
  INDEX `idx_template` (`template_id`),
  INDEX `idx_valid_time` (`valid_from`, `valid_until`),
  INDEX `idx_source` (`source_type`, `source_id`),
  CONSTRAINT `fk_user_coupon_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_user_coupon_template` FOREIGN KEY (`template_id`) REFERENCES `coupon_templates` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户折扣券表';

-- 折扣券使用记录表
CREATE TABLE IF NOT EXISTS `coupon_usage_logs` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_coupon_id` BIGINT UNSIGNED NOT NULL COMMENT '用户折扣券ID',
  `user_id` BIGINT UNSIGNED NOT NULL COMMENT '用户ID',
  `order_id` BIGINT UNSIGNED NOT NULL COMMENT '订单ID',

  `original_amount` DECIMAL(10,2) NOT NULL COMMENT '原始金额',
  `discount_amount` DECIMAL(10,2) NOT NULL COMMENT '折扣金额',
  `final_amount` DECIMAL(10,2) NOT NULL COMMENT '最终金额',

  `status` ENUM('applied', 'confirmed', 'refunded') DEFAULT 'applied' COMMENT '状态',

  `applied_at` DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '应用时间',
  `confirmed_at` DATETIME COMMENT '确认时间',
  `refunded_at` DATETIME COMMENT '退款时间',

  `metadata` JSON COMMENT '额外信息',

  PRIMARY KEY (`id`),
  INDEX `idx_user_coupon` (`user_coupon_id`),
  INDEX `idx_user` (`user_id`),
  INDEX `idx_order` (`order_id`),
  CONSTRAINT `fk_usage_log_user_coupon` FOREIGN KEY (`user_coupon_id`) REFERENCES `user_coupons` (`id`),
  CONSTRAINT `fk_usage_log_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_usage_log_order` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='折扣券使用记录表';

-- 用户邀请表（优化版）
CREATE TABLE IF NOT EXISTS `user_invitations` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT UNSIGNED NOT NULL COMMENT '用户ID',
  `invitation_code` VARCHAR(50) NOT NULL COMMENT '邀请码',
  `invitation_url` VARCHAR(500) COMMENT '邀请链接',

  -- 统计数据
  `total_invites` INT DEFAULT 0 COMMENT '总邀请数',
  `successful_invites` INT DEFAULT 0 COMMENT '成功邀请数（完成注册）',
  `paid_invites` INT DEFAULT 0 COMMENT '付费邀请数（完成首购）',

  -- 状态
  `is_active` BOOLEAN DEFAULT TRUE COMMENT '是否激活',

  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_user_id` (`user_id`),
  UNIQUE KEY `uk_invitation_code` (`invitation_code`),
  INDEX `idx_is_active` (`is_active`),
  CONSTRAINT `fk_invitation_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户邀请信息表';

-- 邀请关系表
CREATE TABLE IF NOT EXISTS `invitation_relationships` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `inviter_id` BIGINT UNSIGNED NOT NULL COMMENT '邀请人用户ID',
  `invitee_id` BIGINT UNSIGNED NOT NULL COMMENT '被邀请人用户ID',
  `invitation_code` VARCHAR(50) COMMENT '使用的邀请码',

  `status` ENUM('pending', 'registered', 'activated', 'rewarded') DEFAULT 'pending' COMMENT '状态',

  `invitee_coupon_id` BIGINT UNSIGNED COMMENT '被邀请人获得的折扣券ID',
  `inviter_reward_id` BIGINT UNSIGNED COMMENT '邀请人奖励ID',

  `registered_at` DATETIME COMMENT '注册时间',
  `activated_at` DATETIME COMMENT '激活时间（首次付费）',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_invitee` (`invitee_id`),
  INDEX `idx_inviter` (`inviter_id`),
  INDEX `idx_invitation_code` (`invitation_code`),
  INDEX `idx_status` (`status`),
  CONSTRAINT `fk_relationship_inviter` FOREIGN KEY (`inviter_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_relationship_invitee` FOREIGN KEY (`invitee_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='邀请关系表';

-- 折扣券批次表
CREATE TABLE IF NOT EXISTS `coupon_batches` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `batch_code` VARCHAR(50) NOT NULL COMMENT '批次号',
  `template_id` BIGINT UNSIGNED NOT NULL COMMENT '折扣券模板ID',
  `name` VARCHAR(100) NOT NULL COMMENT '批次名称',
  `description` TEXT COMMENT '批次描述',

  -- 发放规则
  `target_type` ENUM('all', 'new_users', 'paid_users', 'specific_users', 'user_group') NOT NULL COMMENT '目标用户类型',
  `target_users` JSON COMMENT '特定用户ID列表',
  `target_conditions` JSON COMMENT '用户筛选条件',

  `total_quantity` INT NOT NULL COMMENT '发放总量',
  `distributed_quantity` INT DEFAULT 0 COMMENT '已发放数量',
  `used_quantity` INT DEFAULT 0 COMMENT '已使用数量',

  `status` ENUM('draft', 'processing', 'completed', 'cancelled') DEFAULT 'draft',

  `scheduled_at` DATETIME COMMENT '计划发放时间',
  `started_at` DATETIME COMMENT '开始发放时间',
  `completed_at` DATETIME COMMENT '完成时间',

  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `created_by` BIGINT UNSIGNED COMMENT '创建人ID',

  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_batch_code` (`batch_code`),
  INDEX `idx_template` (`template_id`),
  INDEX `idx_status` (`status`),
  CONSTRAINT `fk_batch_template` FOREIGN KEY (`template_id`) REFERENCES `coupon_templates` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='折扣券批次表';

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

-- 微信支付配置
CREATE TABLE IF NOT EXISTS `wechat_pay_configs` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `mch_id` VARCHAR(32) NOT NULL COMMENT '商户号',
  `app_id` VARCHAR(32) NOT NULL COMMENT '微信App ID',
  `api_v3_key` VARCHAR(64) NOT NULL COMMENT 'APIv3密钥',
  `serial_no` VARCHAR(64) NOT NULL COMMENT '商户API证书序列号',
  `private_key` TEXT NOT NULL COMMENT '商户私钥',
  `notify_url` VARCHAR(255) NOT NULL COMMENT '支付回调URL',
  `is_sandbox` BOOLEAN NOT NULL DEFAULT FALSE COMMENT '是否沙箱环境',
  `is_active` BOOLEAN NOT NULL DEFAULT TRUE,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_is_active` (`is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='微信支付配置';

-- 微信扫码登录配置（原微信OAuth配置）
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
  `enable_turnstile` BOOLEAN NOT NULL DEFAULT FALSE COMMENT '是否启用 Cloudflare Turnstile 人机验证',
  `turnstile_site_key` VARCHAR(100) DEFAULT '' COMMENT 'Turnstile Site Key (公钥)',
  `turnstile_secret_key` VARCHAR(100) DEFAULT '' COMMENT 'Turnstile Secret Key (私钥)',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='系统配置';

-- GitHub OAuth 配置表（独立表）
CREATE TABLE IF NOT EXISTS `github_oauth_config` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `client_id` VARCHAR(100) NOT NULL DEFAULT '' COMMENT 'GitHub OAuth Client ID',
  `client_secret` VARCHAR(255) NOT NULL DEFAULT '' COMMENT 'GitHub OAuth Client Secret',
  `redirect_uri` VARCHAR(255) NOT NULL DEFAULT '' COMMENT 'GitHub OAuth Redirect URI (回调地址)',
  `enabled` BOOLEAN NOT NULL DEFAULT FALSE COMMENT '是否启用 GitHub OAuth 登录',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='GitHub OAuth 配置';

-- 微信公众号自动回复配置
CREATE TABLE IF NOT EXISTS `wechat_official_config` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `app_id` VARCHAR(100) NOT NULL DEFAULT '' COMMENT '微信公众号AppID',
  `app_secret` VARCHAR(255) NOT NULL DEFAULT '' COMMENT '微信公众号AppSecret',
  `token` VARCHAR(100) NOT NULL DEFAULT '' COMMENT '微信公众号Token',
  `encoding_aes_key` VARCHAR(100) NOT NULL DEFAULT '' COMMENT '微信公众号EncodingAESKey',
  `encryption_mode` VARCHAR(20) NOT NULL DEFAULT 'plaintext' COMMENT '消息加密方式: plaintext=明文模式, compatible=兼容模式, secure=安全模式',
  `auto_reply_enabled` BOOLEAN NOT NULL DEFAULT FALSE COMMENT '是否启用自动回复',
  `ai_model_level` VARCHAR(20) NOT NULL DEFAULT 'low' COMMENT 'AI模型等级: low, medium, high',
  `system_prompt` TEXT COMMENT 'AI系统提示词',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='微信公众号自动回复配置';

-- 第三方账号配置
CREATE TABLE IF NOT EXISTS `third_party_accounts` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(100) NOT NULL COMMENT '账号名称/描述',
  `type` VARCHAR(50) NOT NULL COMMENT '账号类型: semantic_scholar, ai_model',
  `config` JSON NOT NULL COMMENT '配置详情',
  `status` TINYINT NOT NULL DEFAULT 1 COMMENT '1=启用, 0=停用',
  `priority` INT NOT NULL DEFAULT 0 COMMENT '优先级，数字越小优先级越高',
  `usage_count` BIGINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '使用次数',
  `last_used_at` DATETIME COMMENT '最后使用时间',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_type_status` (`type`, `status`),
  INDEX `idx_type_priority` (`type`, `status`, `priority`),
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

-- 论文AI分析结果缓存表（动态维度设计）
-- 同一篇论文可以有多条记录，对应不同的维度配置（dimension_hash）
CREATE TABLE IF NOT EXISTS `paper_analysis` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `paper_id` VARCHAR(100) NOT NULL COMMENT '论文ID（来自Semantic Scholar）',
  `paper_title` VARCHAR(500) COMMENT '论文标题',
  `dimension_hash` VARCHAR(32) NOT NULL COMMENT '维度配置哈希，用于判断缓存是否匹配当前维度配置',
  `analysis_data` TEXT COMMENT 'JSON格式的分析结果 {"dimensionKey": "分析内容", ...}',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `uk_paper_dimension` (`paper_id`, `dimension_hash`),
  INDEX `idx_dimension_hash` (`dimension_hash`),
  INDEX `idx_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='论文AI分析结果缓存（动态维度）';

SET foreign_key_checks = 1;

-- ============================================
-- 预置数据（仅在表不存在数据时插入）
-- 使用INSERT IGNORE确保不会覆盖已有数据
-- ============================================

-- 默认管理员账号由后端服务启动时自动初始化（从环境变量读取）
-- 配置环境变量: ADMIN_INITIAL_USERNAME, ADMIN_INITIAL_PASSWORD
-- 详见 backend/internal/admin/service.go InitializeDefaultAdmin()

-- 默认订阅计划
-- 注意：功能次数限制已废弃，现在使用货币系统（经费）进行扣费控制
-- features JSON 中的 limit 字段已废弃，保留用于向后兼容
INSERT IGNORE INTO `subscription_plans` (`plan_code`, `plan_name`, `price_monthly`, `current_price_monthly`, `price_yearly`, `current_price_yearly`, `yearly_discount_enabled`, `yearly_discount_percent`, `features`, `is_active`, `sort_order`) VALUES
('free', 'FREE', 0.00, 0.00, 0.00, 0.00, 0, 0.00, '{
  "normal_search": {"description": "无限制"},
  "advanced_search": {"description": "按经费扣费"},
  "ai_chat": {"description": "按经费扣费"},
  "advanced_search_data": {"enabled": true, "description": "无限制"},
  "ai_history_data": {"enabled": true, "description": "无限制"}
}', 1, 1),
('pro', 'PRO', 88.00, 88.00, 880.00, 880.00, 0, 0.00, '{
  "normal_search": {"description": "无限制"},
  "advanced_search": {"description": "按经费扣费"},
  "ai_chat": {"description": "按经费扣费"},
  "advanced_search_data": {"enabled": true, "description": "无限制"},
  "ai_history_data": {"enabled": true, "description": "无限制"},
  "monthly_gold": {"amount": 2000, "description": "每月赠送2000经费"}
}', 1, 2),
('max', 'MAX', 199.00, 199.00, 1990.00, 1990.00, 0, 0.00, '{
  "normal_search": {"description": "无限制"},
  "advanced_search": {"description": "按经费扣费"},
  "ai_chat": {"description": "按经费扣费"},
  "advanced_search_data": {"enabled": true, "description": "无限制"},
  "ai_history_data": {"enabled": true, "description": "无限制"},
  "monthly_gold": {"amount": 5000, "description": "每月赠送5000经费"},
  "monthly_diamond": {"amount": 6, "description": "每月赠送6恩特币"}
}', 1, 3);

-- 默认提示词模板
-- 设置字符集以确保中文正确存储
SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT IGNORE INTO `prompt_templates` (`key`, `name`, `template`, `description`, `variables`, `is_active`) VALUES
('advanced_search_mcp_system', '高级搜索MCP工具调用系统提示词',
'你是一位专业的学术研究助手,专门帮助用户搜索和分析学术论文。

**核心任务**:
- 这是一个学术论文搜索系统,用户的每个查询都是为了找到相关的学术论文
- 你必须使用 search_papers 工具来搜索论文,即使用户的查询看起来像是在问概念或问题
- 不要直接回答问题或解释概念,而是搜索相关论文

**工具调用规则**:
1. 对于所有用户查询,首先调用 search_papers 工具搜索论文
2. 将用户的查询转换为合适的英文学术搜索关键词(因为Semantic Scholar主要收录英文论文)
3. 设置 limit 参数为 40,返回更多相关论文
4. 可以提取查询中的关键概念作为搜索词,例如:
   - \"大语言模型的算力需求\" → \"large language models computational requirements GPU\"
   - \"向量搜索算法\" → \"vector search algorithms\"
   - \"Transformer架构\" → \"Transformer architecture\"

**搜索策略**:
- 优先使用核心技术术语和英文关键词
- 如果查询包含多个概念,组合关键概念进行搜索
- 确保搜索词足够具体以找到相关论文

请务必调用工具,不要直接回答!',
'引导AI必须使用search_papers工具搜索论文,并将中文查询转换为英文学术关键词',
NULL,
1),

('advanced_search_analysis_system', '高级搜索分析系统提示词',
'你是一位专业的学术研究助手，擅长分析和总结学术论文。',
'用于高级搜索论文分析时定义AI的专业角色',
NULL,
1),

('advanced_search_analysis', '高级搜索深度论文分析提示词',
'用户查询：{{query}}

找到的论文：
{{papers}}

请作为资深学术研究专家，对这些论文进行深入、全面的分析。你的分析应该包括：

## 1. 研究领域概览（200-300字）
- 这些论文所属的主要研究领域和细分方向
- 该领域当前的研究热点和发展趋势
- 这些论文在整个领域中的定位和意义

## 2. 核心研究方法与创新点（按论文分析，每篇100-150字）
- 每篇论文采用的核心研究方法和技术路线
- 相比前人工作的创新之处（方法创新、应用创新、理论创新）
- 技术实现的关键突破点和独特优势
- 实验设计的亮点和数据支撑的充分性

## 3. 研究发现与学术贡献（深度分析）
- 各论文的核心发现和主要结论
- 对现有理论或认知的突破或修正
- 实证数据和实验结果的说服力
- 研究结果的普适性和局限性
- 不同论文之间的相互印证或矛盾之处

## 4. 实际应用价值与影响
- 研究成果的实际应用场景和商业价值
- 对产业发展或社会问题的潜在影响
- 技术转化的可行性和实施难度
- 已产生的实际应用案例（如有）

## 5. 研究脉络与发展演进
- 论文之间的引用关系和研究传承
- 研究思路的演进轨迹和方法论发展
- 从早期到近期研究的进步和突破
- 研究范式的转变和新兴方向

## 6. 批判性思考与研究展望
- 现有研究的局限性和不足之处
- 尚未解决的核心问题和研究空白
- 未来可能的研究方向和突破点
- 跨学科融合的可能性

重要提示：
1. **引用格式（非常重要）**：当提到具体论文的观点、数据或结论时，必须使用以下格式：
   【引用编号：引用的具体内容】

   正确示例：
   - 【引用1：深度学习模型在ImageNet数据集上达到了95%%的准确率】表明该方法效果显著。
   - 研究表明，【引用3：Transformer架构相比CNN减少了40%%的训练时间】。

   错误示例（不要这样做）：
   - 论文1指出深度学习效果很好 [1]  ❌
   - 根据研究[3]，效果提升明显 ❌

   **每个段落至少使用3-5个引用标记**，确保分析有具体的论文支撑。

2. 分析要深入且有洞察力，避免表面化和泛泛而谈
3. 多引用论文中的具体数据、实验结果和关键结论（使用【引用n：内容】格式）
4. 保持客观和批判性思维，指出优点的同时也要指出不足

请用 Markdown 格式输出完整的分析报告。注意：不要包含延伸思考问题，只需要输出以上6个部分的分析。',
'用于高级搜索功能中生成深度、全面的论文分析报告，包含6个分析维度（不含延伸问题）',
'{"query": {"type": "string", "description": "User search query", "example": "Transformer in NLP"}, "papers": {"type": "string", "description": "Formatted paper list with number, title, authors, abstract, citations", "example": "1. Title: Attention Is All You Need, Authors: Vaswani et al., Year: 2017"}}',
1),

('follow_up_questions_system', '延伸问题生成系统提示词',
'你是一位专业的学术研究助手，擅长基于研究分析提出有深度的延伸问题。',
'用于生成延伸思考问题时定义AI的角色',
NULL,
1),

('follow_up_questions', '延伸思考问题生成提示词',
'用户查询：{{query}}

已完成的分析：
{{analysis}}

基于上述分析，请提供3-5个发散性的后续研究问题，格式如下：
[FOLLOW_UP_QUESTIONS]
1. 问题文本1
2. 问题文本2
3. 问题文本3
[/FOLLOW_UP_QUESTIONS]

这些问题应该：
- 基于当前研究的自然延伸
- 具有一定的探索性和前瞻性
- 涵盖不同角度（技术深化、应用拓展、跨领域融合、伦理思考等）
- 能够引发深入讨论
- 每个问题都应该简洁明了，一句话即可

请直接输出问题列表，不要有其他内容。',
'用于基于分析内容生成延伸思考问题，使用low模型独立调用',
'{"query": {"type": "string", "description": "User query", "example": "Transformer架构"}, "analysis": {"type": "string", "description": "Completed analysis content", "example": "## 研究领域概览\\n..."}}',
1);

-- ============================================
-- 论文分析维度表
-- ============================================

-- 分析维度定义表（支持系统默认和用户自定义）
-- user_id = -1 表示系统默认维度，user_id > 0 表示用户自定义维度
CREATE TABLE IF NOT EXISTS `analysis_dimensions` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT NOT NULL DEFAULT -1 COMMENT '用户ID，-1表示系统默认维度，>0表示用户自定义',
  `dimension_key` VARCHAR(50) NOT NULL COMMENT '维度标识符（如 studyType, bigDataFocus）',
  `name` VARCHAR(100) NOT NULL COMMENT '维度名称（显示用）',
  `description` TEXT NOT NULL COMMENT '维度解释/分析指示',
  `sort_order` INT NOT NULL DEFAULT 0 COMMENT '排序顺序',
  `is_active` BOOLEAN NOT NULL DEFAULT TRUE COMMENT '是否启用',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `uk_user_dimension` (`user_id`, `dimension_key`),
  INDEX `idx_user_id` (`user_id`),
  INDEX `idx_dimension_key` (`dimension_key`),
  INDEX `idx_sort_order` (`sort_order`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='论文分析维度定义表';

-- 插入系统默认的8个分析维度（user_id = -1 表示系统级）
INSERT IGNORE INTO `analysis_dimensions` (`user_id`, `dimension_key`, `name`, `description`, `sort_order`) VALUES
(-1, 'studyType', '研究类型', '请判断论文属于以下哪类（可多选，缺乏证据则标注“未提及”）：
- 原创实证研究（定量 / 定性）
- 实验研究（biology/chemistry/psychology/engineering）
- 方法论文 / 模型论文（Method / Model）
- 理论或概念框架论文（Theoretical / Conceptual）
- 文献综述（Narrative Review）
- 系统综述 / 元分析（Systematic Review / Meta-analysis）
- 调查 / 教程 / 技术综述（Survey / Tutorial）
- 案例研究（Case Study）
- 观点 / 评论类文章（Opinion / Commentary）
需要根据摘要中的显性行为判断，如是否出现“we propose”、“we review”、“we analyze experiments”等。
若摘要未提供相关信息，请输出 “未提及”。', 1),
(-1, 'researchObjectives', '研究目的与核心问题', '提取论文试图解决的核心科学问题或实践问题，包括：
- 研究动机
- 想回答的问题
- 想解决的挑战
若摘要存在直接表述（例如 "This study aims to"），请引用关键信息。
若摘要未提供相关信息，请输出 “未提及”。', 2),
(-1, 'researchObject', '研究对象与应用场景', '请识别论文研究作用于哪些对象，包括但不限于：
- 人群 / 组织 / 社会群体
- 技术系统 / 模型 / 算法 / 数据库
- 物理对象 / 生物材料 / 地理区域
- 某种现象或过程
若适用，请描述论文的应用场景（如发展中国家、医疗领域、教育系统等）。
若摘要未提供相关信息，请输出 “未提及”。', 3),
(-1, 'researchMethods', '研究方法/技术路径', '请总结论文的方法论，包括：
- 定量/定性方法
- 实验、模拟、建模、统计分析
- 文献分析策略（若为综述）
- 多案例研究方法
只基于摘要中明确提及的内容，不可推断未出现的方法。
若摘要未提供相关信息，请输出 “未提及”。', 4),
(-1, 'dataMaterialSources', '数据与材料来源', '请说明论文使用的数据类型或材料，包括：
- 真实数据、实验数据、测量数据、调查数据
- 文献样本（用于综述）
- 公共数据集、合成数据
若摘要未提到数据来源，请明确标注“未提及”。', 5),
(-1, 'keyFindingsRresults', '主要发现/关键结果', '总结论文得出的核心发现或结果，例如：
- 理论推论
- 实验结果
- 性能改进
- 对既有文献的总结性洞察
必须基于摘要中真实出现的信息。
若摘要未提供相关信息，请输出 “未提及”。', 6),
(-1, 'innovationContribution', '创新点/贡献', '提取论文相对既有研究的创新性，包括：
- 理论创新
- 方法创新
- 实证贡献
- 整合型贡献（如提出新分类、新框架、新 taxonomy）
若论文未明确指出创新点，请写“未提及”。', 7),
(-1, 'practicalSignificanceApplication', '实际意义/应用价值', '说明研究的潜在影响，包括：
- 理论价值（推动学科发展）
- 实践价值（改善流程/技术/政策）
- 社会/经济/行业意义
- 对未来研究的指引
若摘要仅隐含意义，请根据显性内容谨慎归纳。
若摘要未提供相关信息，请输出 “未提及”。', 8);

-- ============================================
-- AI审稿人系统表（三审制 + 多文件支持）
-- ============================================

-- 审稿任务表（主表）
-- 一个任务包含：主稿件 + 附件（最多5个） + 3个独立审稿结果 + 1个综合结果
CREATE TABLE IF NOT EXISTS `peer_review_tasks` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT UNSIGNED NOT NULL COMMENT '用户ID',
  
  -- 主稿件信息
  `input_type` VARCHAR(20) NOT NULL DEFAULT 'text' COMMENT '主稿件输入类型: text=文本输入, file=文件上传',
  `manuscript_text` LONGTEXT COMMENT '主稿件文本内容（文本输入或从文件提取）',
  `manuscript_file_id` BIGINT UNSIGNED COMMENT '主稿件文件ID（文件上传时）',
  
  -- 任务配置
  `title` VARCHAR(500) COMMENT '稿件标题（从内容中提取或用户指定）',
  `target_venue` VARCHAR(255) COMMENT '目标期刊/会议',
  `model_level` VARCHAR(20) DEFAULT 'mid' COMMENT '模型级别: low, mid, high',
  `content_hash` VARCHAR(64) COMMENT '内容哈希，用于缓存和去重',
  
  -- 任务状态
  `status` VARCHAR(20) NOT NULL DEFAULT 'draft' COMMENT '状态: draft=草稿, pending=等待处理, processing=处理中, completed=已完成, failed=失败',
  `progress` INT NOT NULL DEFAULT 0 COMMENT '总体进度百分比 0-100',
  `progress_stage` VARCHAR(100) COMMENT '当前阶段描述',
  `error_message` TEXT COMMENT '错误信息',
  
  -- 预处理结果（共享给三个审稿人）
  `manuscript_meta` TEXT COMMENT '稿件元信息 JSON（标题、摘要、关键词等）',
  `literature_context` TEXT COMMENT '检索到的相关文献 JSON',
  `literature_summary` TEXT COMMENT '文献总结 JSON',
  
  -- 综合审稿结果（三审汇总）
  `final_recommendation` VARCHAR(50) COMMENT '最终推荐: Accept, Minor Revision, Major Revision, Reject',
  `final_review_content` LONGTEXT COMMENT '综合审稿报告 Markdown',
  `consensus_score` DECIMAL(3,2) COMMENT '三审一致性评分 0-1',
  
  -- 时间戳
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `submitted_at` DATETIME COMMENT '提交审稿时间',
  `started_at` DATETIME COMMENT '开始处理时间',
  `completed_at` DATETIME COMMENT '完成时间',
  
  PRIMARY KEY (`id`),
  INDEX `idx_user_id` (`user_id`),
  INDEX `idx_status` (`status`),
  INDEX `idx_user_status` (`user_id`, `status`),
  INDEX `idx_user_created` (`user_id`, `created_at` DESC),
  INDEX `idx_content_hash` (`content_hash`),
  CONSTRAINT `fk_pr_task_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='AI审稿任务表';

-- 审稿文件表（存储主稿件和附件文件）
CREATE TABLE IF NOT EXISTS `peer_review_files` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `task_id` BIGINT UNSIGNED COMMENT '关联的任务ID（草稿阶段可为空）',
  `user_id` BIGINT UNSIGNED NOT NULL COMMENT '用户ID',
  
  -- 文件类型
  `file_role` VARCHAR(20) NOT NULL DEFAULT 'manuscript' COMMENT '文件角色: manuscript=主稿件, attachment=附件',
  `sort_order` INT NOT NULL DEFAULT 0 COMMENT '排序顺序（附件用）',
  
  -- 文件信息
  `file_name` VARCHAR(255) NOT NULL COMMENT '原始文件名',
  `file_ext` VARCHAR(20) NOT NULL COMMENT '文件扩展名（不含点）',
  `file_size` BIGINT NOT NULL DEFAULT 0 COMMENT '文件大小（字节）',
  `file_path` VARCHAR(500) COMMENT '存储路径',
  `mime_type` VARCHAR(100) COMMENT 'MIME类型',
  
  -- 内容处理
  `process_mode` VARCHAR(20) NOT NULL DEFAULT 'extract' COMMENT '处理模式: extract=提取文本, direct=直接传递给AI',
  `extracted_text` LONGTEXT COMMENT '提取的文本内容（extract模式）',
  `process_status` VARCHAR(20) DEFAULT 'pending' COMMENT '处理状态: pending, processed, failed',
  `process_error` VARCHAR(500) COMMENT '处理错误信息',
  
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  PRIMARY KEY (`id`),
  INDEX `idx_task_id` (`task_id`),
  INDEX `idx_user_id` (`user_id`),
  INDEX `idx_file_role` (`task_id`, `file_role`),
  INDEX `idx_created_at` (`created_at`),
  CONSTRAINT `fk_pr_file_task` FOREIGN KEY (`task_id`) REFERENCES `peer_review_tasks` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_pr_file_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='AI审稿文件表';

-- 添加主稿件文件外键（如果不存在）
SET @fk_exists = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS 
  WHERE CONSTRAINT_SCHEMA = DATABASE() 
  AND TABLE_NAME = 'peer_review_tasks' 
  AND CONSTRAINT_NAME = 'fk_pr_task_manuscript');
SET @sql = IF(@fk_exists = 0, 
  'ALTER TABLE `peer_review_tasks` ADD CONSTRAINT `fk_pr_task_manuscript` FOREIGN KEY (`manuscript_file_id`) REFERENCES `peer_review_files` (`id`) ON DELETE SET NULL',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 独立审稿结果表（每个任务3条记录，对应3个审稿人）
CREATE TABLE IF NOT EXISTS `peer_review_results` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `task_id` BIGINT UNSIGNED NOT NULL COMMENT '关联的任务ID',
  `reviewer_index` TINYINT NOT NULL COMMENT '审稿人编号: 1, 2, 3',
  
  -- 审稿状态
  `status` VARCHAR(20) NOT NULL DEFAULT 'pending' COMMENT '状态: pending, processing, completed, failed',
  `progress` INT NOT NULL DEFAULT 0 COMMENT '进度百分比 0-100',
  `error_message` TEXT COMMENT '错误信息',
  
  -- 审稿结果
  `recommendation` VARCHAR(50) COMMENT '推荐意见: Accept, Minor Revision, Major Revision, Reject',
  `confidence_score` DECIMAL(3,2) COMMENT '置信度评分 0-1',
  `review_content` LONGTEXT COMMENT '审稿报告 Markdown',
  
  -- 评分维度（JSON存储详细评分）
  `dimension_scores` TEXT COMMENT '各维度评分 JSON: {originality, methodology, clarity, significance}',
  
  -- 时间戳
  `started_at` DATETIME COMMENT '开始时间',
  `completed_at` DATETIME COMMENT '完成时间',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_task_reviewer` (`task_id`, `reviewer_index`),
  INDEX `idx_task_id` (`task_id`),
  INDEX `idx_status` (`status`),
  CONSTRAINT `fk_pr_result_task` FOREIGN KEY (`task_id`) REFERENCES `peer_review_tasks` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='AI审稿独立结果表（三审制）';

-- ============================================
-- 反馈系统表
-- ============================================

-- 用户反馈表
CREATE TABLE IF NOT EXISTS `feedbacks` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `email` VARCHAR(255) NOT NULL COMMENT '反馈者邮箱',
  `content` TEXT NOT NULL COMMENT '反馈内容',
  `attachments` TEXT COMMENT '附件列表（JSON格式，已废弃，改用feedback_attachments表）',
  `user_id` BIGINT UNSIGNED COMMENT '用户ID（登录用户，匿名为NULL）',
  `username` VARCHAR(100) COMMENT '用户名（登录用户）',
  `ip` VARCHAR(45) COMMENT '反馈者IP',
  `ip_location` VARCHAR(255) COMMENT 'IP归属地',
  `status` VARCHAR(20) NOT NULL DEFAULT 'pending' COMMENT '状态: pending=待处理, processed=已处理, replied=已回复, closed=已关闭',
  `reply_content` TEXT COMMENT '回复内容',
  `replied_at` DATETIME COMMENT '回复时间',
  `replied_by` VARCHAR(100) COMMENT '回复人',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_email` (`email`),
  INDEX `idx_user_id` (`user_id`),
  INDEX `idx_status` (`status`),
  INDEX `idx_created_at` (`created_at`),
  INDEX `idx_status_created` (`status`, `created_at` DESC),
  CONSTRAINT `fk_feedback_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户反馈表';

-- 反馈附件表
CREATE TABLE IF NOT EXISTS `feedback_attachments` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `upload_key` VARCHAR(36) NOT NULL COMMENT '上传批次key（UUID），用于关联未提交的附件',
  `feedback_id` BIGINT UNSIGNED COMMENT '关联的反馈ID（提交后填充）',
  `original_name` VARCHAR(255) NOT NULL COMMENT '原始文件名',
  `file_data` LONGBLOB NOT NULL COMMENT '文件二进制数据',
  `file_size` BIGINT UNSIGNED NOT NULL COMMENT '文件大小（字节）',
  `file_type` VARCHAR(20) NOT NULL COMMENT '文件类型: image=图片, file=文件',
  `mime_type` VARCHAR(100) NOT NULL COMMENT 'MIME类型',
  `is_used` BOOLEAN NOT NULL DEFAULT FALSE COMMENT '是否已被使用（关联到反馈）',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_upload_key` (`upload_key`),
  INDEX `idx_feedback_id` (`feedback_id`),
  INDEX `idx_is_used` (`is_used`),
  INDEX `idx_created_at` (`created_at`),
  CONSTRAINT `fk_attachment_feedback` FOREIGN KEY (`feedback_id`) REFERENCES `feedbacks` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='反馈附件表';

-- 默认系统配置
INSERT IGNORE INTO `system_configs` (`id`, `require_email_verification`) VALUES
(1, TRUE);

-- ============================================
-- 用户签到系统表
-- ============================================

-- 用户签到记录表
CREATE TABLE IF NOT EXISTS `user_checkins` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT UNSIGNED NOT NULL COMMENT '用户ID',
  `checkin_date` DATE NOT NULL COMMENT '签到日期',
  `consecutive_days` INT NOT NULL DEFAULT 1 COMMENT '连续签到天数',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `uk_user_date` (`user_id`, `checkin_date`),
  INDEX `idx_user_id` (`user_id`),
  INDEX `idx_checkin_date` (`checkin_date`),
  CONSTRAINT `fk_checkin_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户签到记录表';

-- 用户签到统计表
CREATE TABLE IF NOT EXISTS `user_checkin_stats` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT UNSIGNED NOT NULL COMMENT '用户ID',
  `total_checkins` INT NOT NULL DEFAULT 0 COMMENT '总签到天数',
  `current_streak` INT NOT NULL DEFAULT 0 COMMENT '当前连续签到天数',
  `longest_streak` INT NOT NULL DEFAULT 0 COMMENT '最长连续签到天数',
  `last_checkin_date` DATE COMMENT '最后签到日期',
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `uk_user_id` (`user_id`),
  CONSTRAINT `fk_checkin_stats_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户签到统计表';


-- ============================================
-- 货币系统表
-- ============================================

-- 用户钱包表
CREATE TABLE IF NOT EXISTS `wallets` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT UNSIGNED NOT NULL COMMENT '用户ID',
  `gold` BIGINT NOT NULL DEFAULT 0 COMMENT '经费余额',
  `diamond` BIGINT NOT NULL DEFAULT 0 COMMENT '恩特币余额',
  `version` BIGINT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `uk_user_id` (`user_id`),
  CONSTRAINT `fk_wallet_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户钱包表';

-- 货币交易流水表
CREATE TABLE IF NOT EXISTS `currency_transactions` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `transaction_no` VARCHAR(64) NOT NULL COMMENT '交易流水号',
  `user_id` BIGINT UNSIGNED NOT NULL COMMENT '用户ID',
  `currency_type` VARCHAR(20) NOT NULL COMMENT '货币类型: gold=经费, diamond=恩特币',
  `transaction_type` VARCHAR(20) NOT NULL COMMENT '交易类型: recharge=充值, deduct=扣费, refund=退款, gift=赠送, reward=奖励',
  `amount` BIGINT NOT NULL COMMENT '交易金额（正数）',
  `balance_before` BIGINT NOT NULL COMMENT '交易前余额',
  `balance_after` BIGINT NOT NULL COMMENT '交易后余额',
  `status` VARCHAR(20) NOT NULL DEFAULT 'pending' COMMENT '交易状态: pending=待处理, success=成功, failed=失败, cancelled=已取消',
  `biz_type` VARCHAR(50) COMMENT '业务类型（如：peer_review, ai_chat）',
  `biz_id` VARCHAR(100) COMMENT '业务ID',
  `description` VARCHAR(500) COMMENT '交易描述',
  `extra` TEXT COMMENT '扩展信息（JSON）',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `uk_transaction_no` (`transaction_no`),
  INDEX `idx_user_id` (`user_id`),
  INDEX `idx_currency_type` (`currency_type`),
  INDEX `idx_transaction_type` (`transaction_type`),
  INDEX `idx_biz_type` (`biz_type`),
  INDEX `idx_created_at` (`created_at`),
  CONSTRAINT `fk_transaction_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='货币交易流水表';

-- 扣费配置表
CREATE TABLE IF NOT EXISTS `currency_deduct_configs` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `biz_type` VARCHAR(50) NOT NULL COMMENT '业务类型',
  `currency_type` VARCHAR(20) NOT NULL COMMENT '货币类型: gold=经费, diamond=恩特币',
  `amount` BIGINT NOT NULL COMMENT '扣费金额',
  `description` VARCHAR(200) COMMENT '描述',
  `enabled` BOOLEAN NOT NULL DEFAULT TRUE COMMENT '是否启用',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `uk_biz_type` (`biz_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='扣费配置表';

-- 货币系统配置表
CREATE TABLE IF NOT EXISTS `currency_configs` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `config_key` VARCHAR(50) NOT NULL COMMENT '配置键',
  `config_name` VARCHAR(100) NOT NULL COMMENT '配置名称（中文）',
  `currency_type` VARCHAR(20) NOT NULL COMMENT '货币类型: gold=经费, diamond=恩特币',
  `amount` BIGINT NOT NULL DEFAULT 0 COMMENT '金额',
  `description` VARCHAR(500) COMMENT '描述说明',
  `category` VARCHAR(50) COMMENT '分类：reward=奖励, cost=消耗',
  `enabled` BOOLEAN NOT NULL DEFAULT TRUE COMMENT '是否启用',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `uk_config_key` (`config_key`),
  INDEX `idx_category` (`category`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='货币系统配置表';

-- ============================================
-- 货币系统默认配置数据
-- ============================================

-- 扣费配置默认数据
INSERT IGNORE INTO `currency_deduct_configs` (`biz_type`, `currency_type`, `amount`, `description`, `enabled`) VALUES
('paper_analysis', 'gold', 2, '多维度分析', TRUE),
('peer_review', 'gold', 500, 'AI审稿', TRUE),
-- AI对话（按模型级别扣费）
('ai_chat_low', 'gold', 1, 'AI对话-普通模型', TRUE),
('ai_chat_mid', 'gold', 3, 'AI对话-进阶模型', TRUE),
('ai_chat_high', 'gold', 5, 'AI对话-高级模型', TRUE),
-- 智能分析（按模型级别扣费）
('smart_analysis_low', 'gold', 20, '智能分析-普通模型', TRUE),
('smart_analysis_mid', 'gold', 50, '智能分析-进阶模型', TRUE),
('smart_analysis_high', 'gold', 100, '智能分析-高级模型', TRUE);

-- 货币系统配置默认数据
INSERT IGNORE INTO `currency_configs` (`config_key`, `config_name`, `currency_type`, `amount`, `description`, `category`, `enabled`) VALUES
-- 奖励类配置 - 注册
('register_gift_gold', '注册赠送经费', 'gold', 300, '新用户注册时赠送的经费数量', 'reward', TRUE),
-- 奖励类配置 - 签到
('daily_checkin_gold', '每日签到经费', 'gold', 10, '用户每日签到获得的基础经费数量', 'reward', TRUE),
('checkin_3days_gold', '连续签到3天奖励', 'gold', 50, '连续签到3天时第3天获得的经费奖励', 'reward', TRUE),
('checkin_7days_gold', '连续签到7天奖励', 'gold', 150, '连续签到7天时第7天获得的经费奖励', 'reward', TRUE),
('checkin_15days_gold', '连续签到15天奖励', 'gold', 350, '连续签到15天时第15天获得的经费奖励', 'reward', TRUE),
('checkin_after15_gold', '连续签到15天后每日奖励', 'gold', 30, '连续签到超过15天后每天获得的经费奖励', 'reward', TRUE),
-- 奖励类配置 - 邀请
('invite_reward_diamond', '邀请奖励恩特币', 'diamond', 1, '每成功邀请1个新用户获得的恩特币奖励', 'reward', TRUE),
('invite_milestone_diamond', '邀请里程碑奖励恩特币', 'diamond', 10, '每邀请满5个用户额外获得的恩特币奖励（第5、10、15...个时触发）', 'reward', TRUE),
-- 充值配置
('diamond_price', '恩特币单价(分)', 'diamond', 100, '每个恩特币的人民币价格，单位为分。当前100分=1元，即1元购买1个恩特币', 'recharge', TRUE),
-- 兑换配置
('diamond_to_gold_rate', '恩特币兑换经费比例', 'gold', 100, '1个恩特币可兑换的经费数量', 'exchange', TRUE),
-- 会员月度赠送配置
('pro_monthly_gold', 'Pro会员每月赠送经费', 'gold', 5000, 'Pro会员每月1日自动赠送的经费数量', 'membership', TRUE),
('max_monthly_gold', 'Max会员每月赠送经费', 'gold', 10000, 'Max会员每月1日自动赠送的经费数量', 'membership', TRUE),
('max_monthly_diamond', 'Max会员每月赠送恩特币', 'diamond', 6, 'Max会员每月1日自动赠送的恩特币数量', 'membership', TRUE);
