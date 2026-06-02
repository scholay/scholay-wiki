-- ============================================================================
-- 0008_vip.sql — 简单版 VIP/会员(兑换码发放 + 按等级限额)
--
-- 等级 free/pro 直接denormalize 到 users(vip_tier / vip_expires_at), 鉴权/限额时一次读到。
-- **不复用** stranded 的 subscription_plans/user_subscriptions/orders/coupon_*(无代码消费, 见 CLAUDE.md);
-- users 上历史遗留的 subscription_plan/subscription_expires_at 列(同样无代码)也不碰 —— 新建独立的
-- vip_tier/vip_expires_at, 由新的 internal/vip 模块独占, 避免与已死的旧订阅字段混淆。
--
-- 幂等: add_column_if_not_exists(0000_utils) + CREATE TABLE IF NOT EXISTS。never DROP。
-- ============================================================================

-- users: 会员等级 + 到期(到期后读取时按 now 判定回退 free)
CALL add_column_if_not_exists('users', 'vip_tier', "varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'free' COMMENT 'free | pro;新 VIP 系统专用, 与已死的 subscription_plan 无关'");
CALL add_column_if_not_exists('users', 'vip_expires_at', "datetime DEFAULT NULL COMMENT 'VIP 到期时间;NULL 或已过期 = 视为 free'");

-- 兑换码:admin 批量生成, 用户一次性兑换 → 给 grant_tier 续 grant_days 天
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE IF NOT EXISTS `vip_redemption_codes` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `code` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '兑换码(唯一, 大写字母+数字)',
  `grant_tier` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pro' COMMENT '兑换后授予的等级',
  `grant_days` int NOT NULL DEFAULT '30' COMMENT '兑换后授予的天数(从兑换时起算, 已是会员则顺延)',
  `valid_until` datetime DEFAULT NULL COMMENT '码本身的有效期(须在此前兑换);NULL=永久有效',
  `redeemed_by_user_id` bigint unsigned DEFAULT NULL COMMENT '兑换者 user_id;NULL=未兑换',
  `redeemed_at` datetime DEFAULT NULL COMMENT '兑换时间',
  `note` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '管理员备注/批次标签',
  `created_by` bigint unsigned DEFAULT NULL COMMENT '生成该码的管理员 user_id',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '生成时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_code` (`code`),
  KEY `idx_redeemed_by` (`redeemed_by_user_id`),
  KEY `idx_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='VIP 兑换码';
/*!40101 SET character_set_client = @saved_cs_client */;
