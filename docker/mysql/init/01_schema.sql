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
  `enable_github_oauth` BOOLEAN NOT NULL DEFAULT FALSE COMMENT '是否启用 GitHub OAuth 登录',
  `github_client_id` VARCHAR(100) DEFAULT '' COMMENT 'GitHub OAuth Client ID',
  `github_client_secret` VARCHAR(255) DEFAULT '' COMMENT 'GitHub OAuth Client Secret',
  `github_redirect_uri` VARCHAR(255) DEFAULT '' COMMENT 'GitHub OAuth Redirect URI',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='系统配置';

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
INSERT IGNORE INTO `subscription_plans` (`plan_code`, `plan_name`, `price_monthly`, `current_price_monthly`, `price_yearly`, `current_price_yearly`, `yearly_discount_enabled`, `yearly_discount_percent`, `features`, `is_active`, `sort_order`) VALUES
('free', 'FREE', 0.00, 0.00, 0.00, 0.00, 0, 0.00, '{
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
('pro', 'PRO', 88.00, 88.00, 880.00, 880.00, 0, 0.00, '{
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
('max', 'MAX', 199.00, 199.00, 1990.00, 1990.00, 0, 0.00, '{
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
-- 设置字符集以确保中文正确存储
SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT IGNORE INTO `prompt_templates` (`key`, `name`, `template`, `description`, `variables`, `is_active`) VALUES
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
'{"query": {"type": "string", "description": "Search query keyword", "example": "deep learning"}, "papers": {"type": "string", "description": "Formatted paper list with titles, authors, abstracts", "example": "1. Title: ..., Authors: ..."}}',
1),

('advanced_search_mcp_system', '高级搜索MCP工具调用系统提示词',
'你是一位专业的学术研究助手。你可以使用 search_papers 工具来搜索学术论文。

当用户需要搜索新的论文时，使用 search_papers 工具。
否则，基于对话历史和已有的论文信息回答用户的问题。

重要：调用 search_papers 时，请设置 limit 参数为 40，以返回更多相关论文。

请用中文回答，使用 Markdown 格式。',
'用于高级搜索功能中引导AI何时使用MCP工具搜索论文，何时基于已有信息回答',
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

## 延伸思考
在分析的最后，提供3-5个发散性的后续研究问题，格式如下：
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
5. 确保后续问题放在 [FOLLOW_UP_QUESTIONS] 标签内

请用 Markdown 格式输出完整的分析报告。',
'用于高级搜索功能中生成深度、全面的论文分析报告，包含6个分析维度和后续研究问题',
'{"query": {"type": "string", "description": "User search query", "example": "Transformer in NLP"}, "papers": {"type": "string", "description": "Formatted paper list with number, title, authors, abstract, citations", "example": "1. Title: Attention Is All You Need, Authors: Vaswani et al., Year: 2017"}}',
1);

-- 默认系统配置
INSERT IGNORE INTO `system_configs` (`id`, `require_email_verification`) VALUES
(1, TRUE);