-- ============================================================================
-- 0015_billing.sql — 会员/收费体系重做(P1 核心表)
--
-- 统一「每日 token 额度」(Free=Q / Pro=3Q / Max=5Q)+「经费」二级货币钱包。
--   billing_config       单行配置(所有动态旋钮:基准Q/倍率/价格/赠送/汇率/重置花费…)
--   user_wallets         每用户钱包:永久经费余额 + 自动重置开关
--   credit_temp_lots     临时经费批次(带失效日,到期清;余额=SUM 未过期批次)
--   credit_transactions  经费流水账本(供「明细查看」)
-- 并扩展 vip_redemption_codes:兑换码除发会员(tier)外,也能发经费(credit)。
--
-- 决策(见 docs/research/membership-billing/design.md):额度=统一 token 池;
-- 充值→永久经费、订阅赠送→临时经费(整月有效到期清);重置只看经费、不设次数。
-- token 额度计数走 Redis(quota:tokens:<uid>:<YYYYMMDD>),不落表。
--
-- 幂等:CREATE TABLE IF NOT EXISTS + add_column_if_not_exists + INSERT IGNORE。never DROP。
-- ============================================================================

-- ── billing_config:单行配置(id=1)──────────────────────────────────────────
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE IF NOT EXISTS `billing_config` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `free_daily_tokens` bigint NOT NULL DEFAULT '200000' COMMENT 'Free 每日 token 基准 Q',
  `pro_multiplier` decimal(6,2) NOT NULL DEFAULT '3.00' COMMENT 'Pro 额度倍率(<=0=不限)',
  `max_multiplier` decimal(6,2) NOT NULL DEFAULT '5.00' COMMENT 'Max 额度倍率(<=0=不限)',
  `pro_price_cents` int NOT NULL DEFAULT '5900' COMMENT 'Pro 月价(分)',
  `pro_original_cents` int NOT NULL DEFAULT '19900' COMMENT 'Pro 原价划线(分)',
  `max_price_cents` int NOT NULL DEFAULT '26900' COMMENT 'Max 月价(分)',
  `max_original_cents` int NOT NULL DEFAULT '99900' COMMENT 'Max 原价划线(分)',
  `pro_grant_credits` int NOT NULL DEFAULT '600' COMMENT 'Pro 开通/续费一次性赠送经费(临时, 整月有效)',
  `max_grant_credits` int NOT NULL DEFAULT '3000' COMMENT 'Max 开通/续费一次性赠送经费(临时)',
  `recharge_rate` decimal(10,4) NOT NULL DEFAULT '1.0000' COMMENT '充值汇率:1 元 = N 经费',
  `min_recharge_cents` int NOT NULL DEFAULT '1000' COMMENT '起充金额(分),默认 ¥10',
  `reset_cost_credits` int NOT NULL DEFAULT '60' COMMENT '每次重置额度消耗的经费',
  `subscription_period_days` int NOT NULL DEFAULT '30' COMMENT '会员/赠送经费有效天数',
  `popular_plan` varchar(8) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pro' COMMENT '前端"最受欢迎"标在哪档: pro|max|none',
  `enabled` tinyint(1) NOT NULL DEFAULT '1' COMMENT '收费体系总开关',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='计费体系单行配置';
/*!40101 SET character_set_client = @saved_cs_client */;

-- ── user_wallets:每用户钱包(永久经费 + 偏好)────────────────────────────────
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE IF NOT EXISTS `user_wallets` (
  `user_id` bigint unsigned NOT NULL COMMENT '用户 id(主键, 一人一行)',
  `perm_balance` int NOT NULL DEFAULT '0' COMMENT '永久经费余额(充值来源, 不过期)',
  `auto_reset_enabled` tinyint(1) NOT NULL DEFAULT '0' COMMENT '额度耗尽时自动消耗经费重置',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户经费钱包';
/*!40101 SET character_set_client = @saved_cs_client */;

-- ── credit_temp_lots:临时经费批次(带失效日)──────────────────────────────────
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE IF NOT EXISTS `credit_temp_lots` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint unsigned NOT NULL,
  `amount_initial` int NOT NULL DEFAULT '0' COMMENT '发放总额',
  `amount_remaining` int NOT NULL DEFAULT '0' COMMENT '剩余(消耗时递减; 过期清扫置 0)',
  `source` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '' COMMENT 'subscription|gift|task',
  `ref` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '' COMMENT '来源单据(订单号/兑换码/任务id)',
  `expires_at` datetime NOT NULL COMMENT '失效时刻(到期后不可用, 清扫置 0)',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_user_expires` (`user_id`,`expires_at`),
  KEY `idx_expires` (`expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='临时经费批次';
/*!40101 SET character_set_client = @saved_cs_client */;

-- ── credit_transactions:经费流水账本 ─────────────────────────────────────────
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE IF NOT EXISTS `credit_transactions` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint unsigned NOT NULL,
  `type` varchar(24) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'grant_subscription|recharge|gift|task|reset_consume|expire|refund|admin_adjust',
  `amount` int NOT NULL COMMENT '带符号:+入账 / -消耗',
  `temp_after` int NOT NULL DEFAULT '0' COMMENT '该笔后临时经费余额快照',
  `perm_after` int NOT NULL DEFAULT '0' COMMENT '该笔后永久经费余额快照',
  `ref_type` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '' COMMENT 'order|code|task|reset|admin',
  `ref_id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `note` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_user_created` (`user_id`,`created_at`),
  KEY `idx_type` (`type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='经费流水账本';
/*!40101 SET character_set_client = @saved_cs_client */;

-- ── vip_redemption_codes 扩展:也能发经费(credit)─────────────────────────────
CALL add_column_if_not_exists('vip_redemption_codes', 'grant_kind', "varchar(12) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'tier' COMMENT 'tier=发会员 | credit=发经费'");
CALL add_column_if_not_exists('vip_redemption_codes', 'grant_credits', "int NOT NULL DEFAULT 0 COMMENT 'grant_kind=credit 时发放的经费数'");
CALL add_column_if_not_exists('vip_redemption_codes', 'credit_kind', "varchar(12) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'temp' COMMENT 'temp=临时 | perm=永久'");
CALL add_column_if_not_exists('vip_redemption_codes', 'credit_validity_days', "int NOT NULL DEFAULT 30 COMMENT 'credit_kind=temp 时有效天数'");

-- ── 种子:billing_config 单行(id=1)───────────────────────────────────────────
INSERT IGNORE INTO `billing_config` (`id`) VALUES (1);
