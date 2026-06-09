-- ============================================================================
-- 0020: 会员续期 / 升级(补差价)+ 经费预发放
--
-- · 续期(同档在期):往后延一个月,新一周期的经费用「预发放」——立即建 lot 但
--   starts_at=当前到期日,到期后自动生效(不靠定时任务)。
-- · 升级(升高一档):按剩余天数补差价(价 + 经费),立即升档、到期日不变。
-- · 不支持降级。
--
-- credit_temp_lots 增加 starts_at(生效日):余额只计 starts_at<=now<expires_at 的 lot。
-- orders 记录本单的履约参数(动作 + 经费生效/失效 + 会员新到期),fulfill 时照此发放。
--
-- 幂等:add_column_if_not_exists + 回填带 IS NULL 守卫。never DROP。
-- ============================================================================

-- ── credit_temp_lots:预发放生效日 ─────────────────────────────────────────────
CALL add_column_if_not_exists('credit_temp_lots', 'starts_at', "datetime DEFAULT NULL COMMENT '生效日(预发放);仅 starts_at<=now 才计入余额。NULL=即时生效'");
-- 存量批次即时生效:starts_at = created_at
UPDATE `credit_temp_lots` SET `starts_at` = `created_at` WHERE `starts_at` IS NULL;

-- ── orders:订阅履约参数(续期/升级用)────────────────────────────────────────
CALL add_column_if_not_exists('orders', 'sub_action', "varchar(16) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'new|renew|upgrade'");
CALL add_column_if_not_exists('orders', 'grant_starts_at', "datetime DEFAULT NULL COMMENT '本单赠送经费生效日(续期=下一周期起)'");
CALL add_column_if_not_exists('orders', 'grant_expires_at', "datetime DEFAULT NULL COMMENT '本单赠送经费失效日'");
CALL add_column_if_not_exists('orders', 'new_expires_at', "datetime DEFAULT NULL COMMENT '履约后会员到期日'");
