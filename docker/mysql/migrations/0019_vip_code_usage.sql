-- ============================================================================
-- 0019: 兑换码「多次兑换 + 有效期(天)」
--
-- 兑换码从「单次」升级为:
--   · max_uses   可兑换总次数上限(1..100,默认 1;=1 即旧单次行为)
--   · used_count 已兑换次数
--   · 有效期改为「窗口天数」:发码时 valid_until = now + valid_days(默认 7,最长 30)
-- 每用户对同一码只可兑换一次(vip_code_redemptions 唯一键),防一人薅满 N 次。
--
-- 幂等:add_column_if_not_exists(0000_utils) + CREATE TABLE IF NOT EXISTS + INSERT IGNORE。
-- never DROP。
-- ============================================================================

-- ── vip_redemption_codes:次数上限 + 已用次数 + 管理员停用 ─────────────────────
CALL add_column_if_not_exists('vip_redemption_codes', 'max_uses', "int NOT NULL DEFAULT 1 COMMENT '可兑换总次数上限(1..100)'");
CALL add_column_if_not_exists('vip_redemption_codes', 'used_count', "int NOT NULL DEFAULT 0 COMMENT '已兑换次数'");
CALL add_column_if_not_exists('vip_redemption_codes', 'revoked_at', "datetime DEFAULT NULL COMMENT '管理员停用时间;NULL=有效, 非空=已停用不可再兑'");

-- ── 兑换流水:每用户每码一次(唯一键兜并发)──────────────────────────────────
CREATE TABLE IF NOT EXISTS `vip_code_redemptions` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `code_id` bigint unsigned NOT NULL COMMENT '兑换码 vip_redemption_codes.id',
  `user_id` bigint unsigned NOT NULL COMMENT '兑换者 user_id',
  `redeemed_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '兑换时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_code_user` (`code_id`,`user_id`),
  KEY `idx_user` (`user_id`),
  KEY `idx_code` (`code_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='兑换码兑换流水(每用户每码一次)';

-- ── 存量回填:旧单次模型已兑换的码 → used_count=1 + 补一条流水(均幂等)─────────
UPDATE `vip_redemption_codes` SET `used_count` = 1 WHERE `redeemed_at` IS NOT NULL AND `used_count` = 0;
INSERT IGNORE INTO `vip_code_redemptions` (`code_id`, `user_id`, `redeemed_at`)
  SELECT `id`, `redeemed_by_user_id`, `redeemed_at`
  FROM `vip_redemption_codes`
  WHERE `redeemed_at` IS NOT NULL AND `redeemed_by_user_id` IS NOT NULL;
