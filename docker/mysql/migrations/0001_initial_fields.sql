-- ============================================================================
-- 初始表结构（字段 + 主键）
-- 此文件包含所有表的字段定义和主键
-- 注意：索引和外键在 0002_initial_indexes.sql 中定义
-- ============================================================================

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
  PRIMARY KEY (`id`)
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
  PRIMARY KEY (`id`)
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
  PRIMARY KEY (`id`)
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
  -- Removed redundant single-column indexes that are covered by composite indexes
  PRIMARY KEY (`id`)
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
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='每日用户统计';

-- 在线用户快照（实时图表数据）
CREATE TABLE IF NOT EXISTS `online_user_snapshots` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `timestamp` DATETIME NOT NULL COMMENT '快照时间（按分钟）',
  `online_count` INT NOT NULL DEFAULT 0 COMMENT '在线用户数（峰值）',
  `guest_count` INT NOT NULL DEFAULT 0 COMMENT '在线访客数（峰值）',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
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
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户对话历史';

-- 对话消息表（支持消息链）
CREATE TABLE IF NOT EXISTS `conversation_messages` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `message_id` VARCHAR(36) NOT NULL COMMENT '消息UUID',
  `conversation_id` BIGINT UNSIGNED NOT NULL,
  `parent_message_id` VARCHAR(36) COMMENT '父消息ID（支持分支）',
  `role` VARCHAR(20) NOT NULL COMMENT 'user, assistant, system',
  `content` MEDIUMTEXT NOT NULL COMMENT '消息内容',
  `search_query` VARCHAR(500) COMMENT '搜索查询（如果是搜索消息）',
  `search_results` JSON COMMENT 'Semantic Scholar搜索结果（旧版，保留向后兼容）',
  `search_results_total` INT NOT NULL DEFAULT 0 COMMENT '搜索结果总数',
  `search_paper_ids` JSON COMMENT '论文ID列表（新版，前端批量获取详情）',
  `follow_up_questions` MEDIUMTEXT COMMENT '延伸思考问题（仅最新一轮assistant消息保存）',
  `token_count` INT DEFAULT 0 COMMENT 'Token计数',
  `model` VARCHAR(50) COMMENT 'AI模型',
  `finish_reason` VARCHAR(20) COMMENT '完成原因',
  `error` BOOLEAN DEFAULT FALSE COMMENT '是否出错',
  `unfinished` BOOLEAN DEFAULT FALSE COMMENT '是否未完成',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
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
  PRIMARY KEY (`id`)
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
  PRIMARY KEY (`id`)
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
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='每日使用配额跟踪';

-- ============================================
-- 订单和支付表
-- ============================================

-- 订单表（支持会员订阅和恩特币充值）
CREATE TABLE IF NOT EXISTS `orders` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `order_no` VARCHAR(64) NOT NULL COMMENT '订单号',
  `order_type` VARCHAR(20) NOT NULL DEFAULT 'subscription' COMMENT '订单类型: subscription(会员订阅), recharge(恩特币充值)',
  `plan_code` VARCHAR(20) COMMENT '订阅计划代码（会员订阅用）',
  `plan_name` VARCHAR(50) COMMENT '下单时的计划名称（会员订阅用）',
  `billing_cycle` VARCHAR(20) COMMENT 'monthly或yearly（会员订阅用）',
  `diamond_amount` BIGINT NOT NULL DEFAULT 0 COMMENT '恩特币数量（充值用）',
  `bonus_amount` BIGINT NOT NULL DEFAULT 0 COMMENT '赠送数量（充值用）',
  `amount` DECIMAL(10,2) NOT NULL COMMENT '订单原价（折扣前）',
  `coupon_id` BIGINT UNSIGNED COMMENT '使用的折扣券ID',
  `discount_amount` DECIMAL(10,2) NOT NULL DEFAULT 0.00 COMMENT '折扣金额',
  `final_amount` DECIMAL(10,2) NOT NULL COMMENT '最终支付金额（折扣后）',
  `status` VARCHAR(20) NOT NULL DEFAULT 'pending' COMMENT 'pending, paid, cancelled, refunded',
  `payment_method` VARCHAR(50) COMMENT '支付方式',
  `payment_time` DATETIME COMMENT '支付完成时间',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='订单表（会员订阅/恩特币充值）';

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
  PRIMARY KEY (`id`)
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
  PRIMARY KEY (`id`)
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
  PRIMARY KEY (`id`)
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
  PRIMARY KEY (`id`)
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
  PRIMARY KEY (`id`)
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
  PRIMARY KEY (`id`)
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
  PRIMARY KEY (`id`)
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
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='隐私政策';

-- 服务条款
CREATE TABLE IF NOT EXISTS `terms_of_service` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `content` TEXT NOT NULL,
  `version` VARCHAR(50) NOT NULL,
  `is_active` BOOLEAN NOT NULL DEFAULT TRUE,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
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
  PRIMARY KEY (`id`)
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
  PRIMARY KEY (`id`)
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
  PRIMARY KEY (`id`)
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
  PRIMARY KEY (`id`)
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
  PRIMARY KEY (`id`)
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
  PRIMARY KEY (`id`)
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
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='AI提示词模板';

CREATE TABLE IF NOT EXISTS `paper_analysis` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `paper_id` VARCHAR(100) NOT NULL COMMENT '论文ID（来自Semantic Scholar）',
  `paper_title` VARCHAR(500) COMMENT '论文标题',
  `dimension_hash` VARCHAR(32) NOT NULL COMMENT '维度配置哈希，用于判断缓存是否匹配当前维度配置',
  `analysis_data` TEXT COMMENT 'JSON格式的分析结果 {"dimensionKey": "分析内容", ...}',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='论文AI分析结果缓存（动态维度）';

-- ============================================
-- 论文分析维度表
-- ============================================

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
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='论文分析维度定义表';

-- ============================================
-- AI审稿人系统表（三审制 + 多文件支持）
-- ============================================

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
  PRIMARY KEY (`id`)
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
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='AI审稿文件表';

-- 独立审稿结果表（每个任务3条记录，对应3个审稿人）
CREATE TABLE IF NOT EXISTS `peer_review_results` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `task_id` BIGINT UNSIGNED NOT NULL COMMENT '关联的任务ID',
  `reviewer_index` TINYINT NOT NULL COMMENT '审稿人编号: 1, 2, 3',
  -- 审稿状态
  `status` VARCHAR(20) NOT NULL DEFAULT 'pending' COMMENT '状态: pending, processing, completed, failed',
  `progress` INT NOT NULL DEFAULT 0 COMMENT '进度百分比 0-100',
  `error_message` TEXT COMMENT '错误信息',
  -- 审稿模型信息
  `model_name` VARCHAR(100) DEFAULT '' COMMENT '使用的AI模型名称',
  -- 审稿结果
  `recommendation` VARCHAR(50) COMMENT '推荐意见: Accept, Minor Revision, Major Revision, Reject',
  `confidence_score` DECIMAL(3,2) COMMENT '置信度评分 0-1',
  `review_content` LONGTEXT COMMENT '审稿报告 Markdown',
  -- 评分维度（JSON存储详细评分）
  `dimension_scores` TEXT COMMENT '各维度评分 JSON: {originality, methodology, clarity, significance}',
  -- 步骤详情（JSON存储每步的名称、耗时、结果等）
  `steps_detail` LONGTEXT COMMENT '步骤详情JSON',
  -- 时间戳
  `started_at` DATETIME COMMENT '开始时间',
  `completed_at` DATETIME COMMENT '完成时间',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
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
  PRIMARY KEY (`id`)
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
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='反馈附件表';

-- ============================================
-- LaTeX Writer 文档表
-- ============================================

-- LaTeX 文档表（存储用户的 LaTeX 文档和文件夹）
CREATE TABLE IF NOT EXISTS `latex_documents` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT UNSIGNED NOT NULL COMMENT '用户ID',
  `title` VARCHAR(255) NOT NULL COMMENT '文档/文件夹标题',
  `content` LONGTEXT COMMENT 'LaTeX 文档内容',
  `parent_id` BIGINT UNSIGNED COMMENT '父文件夹ID（NULL表示根级）',
  `is_folder` BOOLEAN NOT NULL DEFAULT FALSE COMMENT '是否为文件夹',
  `sort_order` INT NOT NULL DEFAULT 0 COMMENT '排序顺序',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='LaTeX文档表';

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
  PRIMARY KEY (`id`)
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
  PRIMARY KEY (`id`)
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
  PRIMARY KEY (`id`)
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
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='货币交易流水表';

-- 会员基金表（每月基金配置）
CREATE TABLE IF NOT EXISTS `membership_funds` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `fund_month` VARCHAR(7) NOT NULL COMMENT '基金月份（格式：YYYY-MM）',
  `fund_name` VARCHAR(100) NOT NULL COMMENT '基金名称（如：星辰基金）',
  `fund_slogan` VARCHAR(200) COMMENT '基金口号/副标题',
  `fund_description` TEXT COMMENT '基金详细介绍',
  `cover_image` VARCHAR(500) COMMENT '基金封面图片URL',
  `theme_color` VARCHAR(20) DEFAULT '#6366f1' COMMENT '主题色（十六进制）',
  `pro_gold_amount` BIGINT NOT NULL DEFAULT 5000 COMMENT 'Pro会员本月赠送经费',
  `max_gold_amount` BIGINT NOT NULL DEFAULT 10000 COMMENT 'Max会员本月赠送经费',
  `max_diamond_amount` BIGINT NOT NULL DEFAULT 6 COMMENT 'Max会员本月赠送恩特币',
  `total_distributed_gold` BIGINT NOT NULL DEFAULT 0 COMMENT '已发放经费总额',
  `total_distributed_diamond` BIGINT NOT NULL DEFAULT 0 COMMENT '已发放恩特币总额',
  `beneficiary_count` INT NOT NULL DEFAULT 0 COMMENT '受益用户数',
  `status` VARCHAR(20) NOT NULL DEFAULT 'active' COMMENT '状态: pending=待生效, active=生效中, completed=已结束',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='会员基金表';

-- 会员基金发放记录表
CREATE TABLE IF NOT EXISTS `membership_fund_distributions` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `fund_id` BIGINT UNSIGNED NOT NULL COMMENT '基金ID',
  `user_id` BIGINT UNSIGNED NOT NULL COMMENT '用户ID',
  `membership_type` VARCHAR(20) NOT NULL COMMENT '会员类型: pro, max',
  `gold_amount` BIGINT NOT NULL DEFAULT 0 COMMENT '发放经费数量',
  `diamond_amount` BIGINT NOT NULL DEFAULT 0 COMMENT '发放恩特币数量',
  `transaction_no` VARCHAR(64) COMMENT '关联的交易流水号',
  `distributed_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '发放时间',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='会员基金发放记录表';

-- 扣费配置表
CREATE TABLE IF NOT EXISTS `currency_deduct_configs` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `biz_type` VARCHAR(50) NOT NULL COMMENT '业务类型',
  `currency_type` VARCHAR(20) NOT NULL COMMENT '货币类型: gold=经费, diamond=恩特币',
  `amount` BIGINT NOT NULL COMMENT '扣费金额',
  `display_name` VARCHAR(100) COMMENT '显示名称（交易流水标题）',
  `display_remark` VARCHAR(200) COMMENT '显示备注（交易流水描述）',
  `description` VARCHAR(200) COMMENT '后台管理描述',
  `enabled` BOOLEAN NOT NULL DEFAULT TRUE COMMENT '是否启用',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='扣费配置表';

-- 货币系统配置表
CREATE TABLE IF NOT EXISTS `currency_configs` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `config_key` VARCHAR(50) NOT NULL COMMENT '配置键',
  `config_name` VARCHAR(100) NOT NULL COMMENT '配置名称（后台管理用）',
  `currency_type` VARCHAR(20) NOT NULL COMMENT '货币类型: gold=经费, diamond=恩特币',
  `amount` BIGINT NOT NULL DEFAULT 0 COMMENT '金额',
  `display_name` VARCHAR(100) COMMENT '显示名称（交易流水标题）',
  `display_remark` VARCHAR(200) COMMENT '显示备注（交易流水描述）',
  `description` VARCHAR(500) COMMENT '后台管理描述说明',
  `category` VARCHAR(50) COMMENT '分类：reward=奖励, cost=消耗',
  `enabled` BOOLEAN NOT NULL DEFAULT TRUE COMMENT '是否启用',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='货币系统配置表';

-- ============================================
-- 功能使用统计表
-- ============================================

-- 用户访问统计表
CREATE TABLE IF NOT EXISTS `usage_logs` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT UNSIGNED COMMENT '用户ID，未登录时为NULL',
  `session_id` VARCHAR(64) COMMENT '会话ID，用于追踪未登录用户',
  `feature_code` VARCHAR(50) NOT NULL COMMENT '功能代码，如: academic_search, smart_analysis, ai_chat',
  `feature_name` VARCHAR(100) NOT NULL COMMENT '功能名称，如: 学术检索, 智能分析, AI对话',
  `action` VARCHAR(50) NOT NULL COMMENT '操作类型，如: search, submit, view',
  `entry_point` VARCHAR(100) COMMENT '入口位置，如: home_page, search_page, result_page',
  `request_path` VARCHAR(255) COMMENT '请求的API路径',
  `referer_path` VARCHAR(255) COMMENT '来源页面路径',
  `ip_address` VARCHAR(45) COMMENT 'IP地址（支持IPv6）',
  `user_agent` VARCHAR(500) COMMENT '浏览器User-Agent',
  `device_type` VARCHAR(20) COMMENT '设备类型: desktop, mobile, tablet',
  `browser` VARCHAR(50) COMMENT '浏览器名称',
  `os` VARCHAR(50) COMMENT '操作系统',
  `extra_data` JSON COMMENT '额外数据，如搜索关键词等',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='功能使用统计日志';

-- 功能代码配置表（用于展示和统计）
CREATE TABLE IF NOT EXISTS `feature_configs` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `feature_code` VARCHAR(50) NOT NULL COMMENT '功能代码',
  `feature_name` VARCHAR(100) NOT NULL COMMENT '功能名称',
  `feature_group` VARCHAR(50) COMMENT '功能分组，如: search, analysis, ai',
  `description` VARCHAR(255) COMMENT '功能描述',
  `enabled` TINYINT(1) NOT NULL DEFAULT 1 COMMENT '是否启用统计',
  `sort_order` INT NOT NULL DEFAULT 0 COMMENT '排序顺序',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='功能配置表';

-- 使用统计配置表
CREATE TABLE IF NOT EXISTS `usage_log_config` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `retention_days` INT NOT NULL DEFAULT 180 COMMENT '数据保留天数，默认180天(半年)',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='使用统计配置表';

-- ============================================
-- 站内信系统表
-- ============================================

-- 消息模板表（管理员预设常用消息模板）
CREATE TABLE IF NOT EXISTS `message_templates` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `code` VARCHAR(50) NOT NULL COMMENT '模板代码（唯一）',
  `name` VARCHAR(100) NOT NULL COMMENT '模板名称',
  `title` VARCHAR(200) NOT NULL COMMENT '消息标题模板',
  `content` TEXT NOT NULL COMMENT '消息内容模板（Markdown）',
  `category` VARCHAR(50) NOT NULL DEFAULT 'system' COMMENT '分类：system=系统通知, promotion=营销推广, transaction=交易通知',
  `variables` JSON COMMENT '模板变量定义，如 {"username": "用户名", "amount": "金额"}',
  `is_active` BOOLEAN NOT NULL DEFAULT TRUE COMMENT '是否启用',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='站内信消息模板表';

-- 站内信主表（存储消息主体内容）
CREATE TABLE IF NOT EXISTS `messages` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `title` VARCHAR(200) NOT NULL COMMENT '消息标题',
  `content` TEXT NOT NULL COMMENT '消息内容（Markdown）',
  `category` VARCHAR(50) NOT NULL DEFAULT 'system' COMMENT '分类：system=系统通知, promotion=营销推广, transaction=交易通知',
  `send_type` VARCHAR(20) NOT NULL DEFAULT 'all' COMMENT '发送类型：all=全站广播, batch=批量用户, single=单个用户, by_plan=按会员等级',
  `target_plans` JSON COMMENT '目标会员等级（by_plan时使用），如 ["pro", "max"]',
  `target_user_ids` JSON COMMENT '目标用户ID列表（batch/single时使用）',
  `link_url` VARCHAR(500) COMMENT '跳转链接（可选）',
  `link_text` VARCHAR(100) COMMENT '链接文字（可选）',
  `sender_id` BIGINT UNSIGNED COMMENT '发送人ID（管理员）',
  `sender_name` VARCHAR(100) COMMENT '发送人名称',
  `send_at` DATETIME COMMENT '发送时间',
  `expire_at` DATETIME COMMENT '过期时间（可选，过期后不再展示）',
  `status` VARCHAR(20) NOT NULL DEFAULT 'draft' COMMENT '状态：draft=草稿, sent=已发送, cancelled=已取消',
  `recipient_count` INT NOT NULL DEFAULT 0 COMMENT '接收人数',
  `read_count` INT NOT NULL DEFAULT 0 COMMENT '已读人数',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='站内信主表';

-- 用户消息状态表（记录每个用户的消息接收和阅读状态）
CREATE TABLE IF NOT EXISTS `user_messages` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT UNSIGNED NOT NULL COMMENT '用户ID',
  `message_id` BIGINT UNSIGNED NOT NULL COMMENT '消息ID',
  `is_read` BOOLEAN NOT NULL DEFAULT FALSE COMMENT '是否已读',
  `read_at` DATETIME COMMENT '阅读时间',
  `is_deleted` BOOLEAN NOT NULL DEFAULT FALSE COMMENT '是否删除（软删除）',
  `deleted_at` DATETIME COMMENT '删除时间',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户消息状态表';

-- ============================================
-- SEO与广告代码片段配置表
-- ============================================

-- 代码片段配置表（用于用户端前端的SEO、广告、统计等代码注入）
CREATE TABLE IF NOT EXISTS `code_snippets` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(100) NOT NULL COMMENT '配置名称（如：Google Analytics、百度统计、广告代码等）',
  `code_key` VARCHAR(50) NOT NULL COMMENT '唯一标识键（如：google_analytics, baidu_tongji, ad_header等）',
  `category` VARCHAR(30) NOT NULL DEFAULT 'other' COMMENT '分类：seo=SEO相关, analytics=统计分析, ad=广告, social=社交, other=其他',
  `position` VARCHAR(20) NOT NULL DEFAULT 'head' COMMENT '注入位置：head=头部, body_start=body开始, body_end=body结束',
  `code_content` TEXT NOT NULL COMMENT '代码内容（HTML/JS/CSS代码片段）',
  `description` VARCHAR(500) COMMENT '配置说明',
  `is_enabled` BOOLEAN NOT NULL DEFAULT TRUE COMMENT '是否启用',
  `priority` INT NOT NULL DEFAULT 100 COMMENT '优先级（数字越小越先加载）',
  `pages` JSON COMMENT '生效页面（null表示全部页面，数组表示指定页面路径）',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='代码片段配置表（SEO/广告/统计等）';

-- ============================================
-- 批量发放系统表
-- ============================================

-- 批量发放批次表（记录每次批量发放的批次信息）
CREATE TABLE IF NOT EXISTS `currency_batches` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `batch_no` VARCHAR(64) NOT NULL COMMENT '批次号（唯一）',
  `currency_type` VARCHAR(20) NOT NULL COMMENT '货币类型: gold=经费, diamond=恩特币',
  `amount` BIGINT NOT NULL COMMENT '单人发放金额',
  `target_type` VARCHAR(20) NOT NULL COMMENT '目标类型: all=全部用户, members=会员用户, non_members=非会员用户, specific=指定用户',
  `target_user_ids` TEXT COMMENT '指定用户ID列表（JSON数组，target_type=specific时使用）',
  `title` VARCHAR(200) NOT NULL COMMENT '发放标题（站内信标题）',
  `description` VARCHAR(500) COMMENT '发放描述（站内信内容）',
  `remark` VARCHAR(500) COMMENT '管理员备注',
  `total_count` INT NOT NULL DEFAULT 0 COMMENT '应发放人数',
  `success_count` INT NOT NULL DEFAULT 0 COMMENT '成功人数',
  `failed_count` INT NOT NULL DEFAULT 0 COMMENT '失败人数',
  `status` VARCHAR(20) NOT NULL DEFAULT 'pending' COMMENT '状态: pending=待执行, processing=执行中, completed=已完成, failed=失败, cancelled=已取消',
  `created_by` BIGINT UNSIGNED COMMENT '创建人（管理员ID）',
  `created_by_name` VARCHAR(100) COMMENT '创建人名称',
  `executed_at` DATETIME COMMENT '执行时间',
  `completed_at` DATETIME COMMENT '完成时间',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='批量发放批次表';

-- 批量发放明细表（记录每个用户的发放情况）
CREATE TABLE IF NOT EXISTS `currency_batch_distributions` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `batch_id` BIGINT UNSIGNED NOT NULL COMMENT '批次ID',
  `batch_no` VARCHAR(64) NOT NULL COMMENT '批次号',
  `user_id` BIGINT UNSIGNED NOT NULL COMMENT '用户ID',
  `currency_type` VARCHAR(20) NOT NULL COMMENT '货币类型: gold=经费, diamond=恩特币',
  `amount` BIGINT NOT NULL COMMENT '发放金额',
  `transaction_no` VARCHAR(64) COMMENT '交易流水号（发放成功后填充）',
  `status` VARCHAR(20) NOT NULL DEFAULT 'pending' COMMENT '状态: pending=待处理, success=成功, failed=失败',
  `error_msg` VARCHAR(500) COMMENT '错误信息（失败时填充）',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='批量发放明细表';

-- ============================================
-- LaTeX Agent 配置表（管理员配置）
-- ============================================

-- LaTeX Agent 可用模型表（支持多模型配置，直接配置密钥）
CREATE TABLE IF NOT EXISTS `latex_agent_models` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `display_name` VARCHAR(100) NOT NULL COMMENT '显示名称（如：GPT-4o 高级版）',
  `api_format` VARCHAR(50) NOT NULL DEFAULT 'openai' COMMENT 'API接口格式: openai, anthropic, google, azure',
  `model_name` VARCHAR(100) NOT NULL COMMENT '模型标识（如：gpt-4o, claude-3-5-sonnet）',
  `api_endpoint` VARCHAR(500) NOT NULL DEFAULT 'https://api.openai.com/v1' COMMENT 'API端点',
  `api_key` VARCHAR(500) NOT NULL COMMENT 'API密钥（加密存储）',
  `max_context_tokens` INT UNSIGNED DEFAULT 128000 COMMENT '最大上下文Token数',
  `max_output_tokens` INT UNSIGNED DEFAULT 16384 COMMENT '最大输出Token数',
  `temperature` DECIMAL(3,2) DEFAULT 0.7 COMMENT '温度参数',
  `description` VARCHAR(500) DEFAULT NULL COMMENT '模型描述',
  `sort_order` INT DEFAULT 0 COMMENT '排序顺序（越小越靠前）',
  `is_default` BOOLEAN DEFAULT FALSE COMMENT '是否为默认模型',
  `is_enabled` BOOLEAN DEFAULT TRUE COMMENT '是否启用',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='LaTeX Agent可用模型表';

-- LaTeX Agent 全局配置表
CREATE TABLE IF NOT EXISTS `latex_agent_config` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  -- 默认模型
  `default_model_id` INT UNSIGNED DEFAULT 1 COMMENT '默认模型ID',
  -- 上下文配置
  `context_window_messages` INT UNSIGNED DEFAULT 50 COMMENT '对话历史保留消息数',
  `truncation_strategy` VARCHAR(50) DEFAULT 'sliding_window' COMMENT '截断策略: sliding_window, summarize, hybrid',
  -- 生成参数（全局默认，可被模型配置覆盖）
  `top_p` DECIMAL(3,2) DEFAULT 0.9 COMMENT 'Top-P 采样',
  `frequency_penalty` DECIMAL(3,2) DEFAULT 0.0 COMMENT '频率惩罚 0-2',
  `presence_penalty` DECIMAL(3,2) DEFAULT 0.0 COMMENT '存在惩罚 0-2',
  -- Agent 行为配置
  `max_iterations` INT UNSIGNED DEFAULT 10 COMMENT 'Agent最大迭代次数',
  `auto_validate_latex` BOOLEAN DEFAULT TRUE COMMENT '自动验证LaTeX语法',
  `auto_fix_errors` BOOLEAN DEFAULT TRUE COMMENT '自动修复语法错误',
  `enable_tool_calling` BOOLEAN DEFAULT TRUE COMMENT '启用工具调用（Function Calling）',
  -- 多 Agent 配置（新增）
  `enable_multi_agent` BOOLEAN DEFAULT FALSE COMMENT '启用多Agent模式',
  `auto_compact_enabled` BOOLEAN DEFAULT TRUE COMMENT '启用自动上下文压缩',
  `auto_compact_threshold` DECIMAL(3,2) DEFAULT 0.85 COMMENT '自动压缩触发阈值(0-1)',
  `planner_model_id` INT UNSIGNED DEFAULT NULL COMMENT '规划Agent使用的模型ID',
  `validator_model_id` INT UNSIGNED DEFAULT NULL COMMENT '验证Agent使用的模型ID',
  `default_tool_permissions` JSON DEFAULT NULL COMMENT '默认工具权限配置',
  `enabled_tool_categories` JSON DEFAULT NULL COMMENT '启用的工具分类 ["latex","search","bibtex"]',
  -- 系统提示词配置
  `system_prompt_override` TEXT DEFAULT NULL COMMENT '自定义系统提示词（覆盖默认）',
  `system_prompt_append` TEXT DEFAULT NULL COMMENT '追加到系统提示词',
  -- 元数据
  `is_active` BOOLEAN DEFAULT TRUE COMMENT '是否启用',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `updated_by` INT UNSIGNED DEFAULT NULL COMMENT '最后更新的管理员ID',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='LaTeX Agent全局配置表';

-- ============================================
-- LaTeX AI 对话系统表（独立于通用对话系统）
-- ============================================

-- LaTeX 对话表
CREATE TABLE IF NOT EXISTS `latex_conversations` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT UNSIGNED NOT NULL COMMENT '用户ID',
  `document_id` BIGINT UNSIGNED NOT NULL COMMENT 'LaTeX文档ID',
  `title` VARCHAR(255) DEFAULT 'LaTeX 对话' COMMENT '对话标题',
  `model_level` VARCHAR(20) DEFAULT 'mid' COMMENT '模型级别: low, mid, high',
  `message_count` INT UNSIGNED DEFAULT 0 COMMENT '消息数量',
  `total_tokens` INT UNSIGNED DEFAULT 0 COMMENT '总Token数',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='LaTeX AI对话表';

-- LaTeX 对话消息表
CREATE TABLE IF NOT EXISTS `latex_chat_messages` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `conversation_id` BIGINT UNSIGNED NOT NULL COMMENT '对话ID',
  `role` ENUM('user', 'assistant', 'system') NOT NULL COMMENT '消息角色',
  `content` MEDIUMTEXT NOT NULL COMMENT '消息内容',
  `think_content` MEDIUMTEXT COMMENT '思考过程（AI回复）',
  `reply_content` MEDIUMTEXT COMMENT '回复内容（AI回复）',
  `code_content` MEDIUMTEXT COMMENT 'LaTeX代码（AI回复）',
  `token_count` INT UNSIGNED DEFAULT 0 COMMENT 'Token数量',
  `model` VARCHAR(100) COMMENT '使用的模型',
  `is_truncated` BOOLEAN DEFAULT FALSE COMMENT '是否被截断',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='LaTeX AI对话消息表';

-- ============================================
-- Agent 架构升级相关表
-- ============================================

-- Agent 工具权限表
CREATE TABLE IF NOT EXISTS `agent_tool_permissions` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` INT UNSIGNED NOT NULL COMMENT '用户ID',
  `tool_name` VARCHAR(100) NOT NULL COMMENT '工具名称',
  `permission` ENUM('allow', 'ask', 'deny') NOT NULL DEFAULT 'ask' COMMENT '权限级别',
  `scope` ENUM('global', 'session') NOT NULL DEFAULT 'global' COMMENT '作用域',
  `session_id` VARCHAR(100) DEFAULT NULL COMMENT '会话ID（scope=session时使用）',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Agent工具权限表';

-- 对话摘要表（用于上下文压缩）
CREATE TABLE IF NOT EXISTS `conversation_summaries` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `conversation_id` BIGINT UNSIGNED NOT NULL COMMENT '对话ID',
  `summary` TEXT NOT NULL COMMENT '摘要内容',
  `token_count_before` INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '压缩前Token数',
  `token_count_after` INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '压缩后Token数',
  `messages_summarized` INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '被摘要的消息数量',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='对话摘要表';

-- ============================================
-- 热门内容统计表
-- ============================================

-- 热门搜索关键词统计表
CREATE TABLE IF NOT EXISTS `hot_search_keywords` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `keyword` VARCHAR(500) NOT NULL COMMENT '搜索关键词（标准化后）',
  `keyword_hash` CHAR(32) NOT NULL COMMENT '关键词MD5哈希（用于唯一索引）',
  `search_count` INT UNSIGNED NOT NULL DEFAULT 1 COMMENT '搜索次数',
  `first_searched_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '首次搜索时间',
  `last_searched_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '最近搜索时间',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='热门搜索关键词统计';

-- 热门论文统计表
CREATE TABLE IF NOT EXISTS `hot_papers` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `paper_id` VARCHAR(64) NOT NULL COMMENT 'Semantic Scholar Paper ID',
  `doi` VARCHAR(255) DEFAULT NULL COMMENT 'DOI号',
  `title` TEXT COMMENT '论文标题',
  `abstract` TEXT COMMENT '论文摘要',
  `authors` TEXT COMMENT '作者列表（JSON）',
  `year` INT DEFAULT NULL COMMENT '发表年份',
  `venue` VARCHAR(500) DEFAULT NULL COMMENT '发表会议/期刊',
  `view_count` INT UNSIGNED NOT NULL DEFAULT 1 COMMENT '查看次数',
  `first_viewed_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '首次查看时间',
  `last_viewed_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '最近查看时间',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='热门论文统计';

SET foreign_key_checks = 1;