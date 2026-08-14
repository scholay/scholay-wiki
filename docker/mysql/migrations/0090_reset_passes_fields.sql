-- ============================================================================
-- 0090: 「重置次数」资源建表 + 三组配置列弃用标记
--
-- 计费模型三项变更(owner 拍板 2026-07-29):
--   A. 订阅周期改真·自然月/自然年(carbon AddMonthsNoOverflow/AddYearsNoOverflow),
--      subscription_period_days / subscription_year_days 两个「天数」旋钮退休;
--   B. 订阅赠送经费整个取消,pro/max × 月/年 四个 grant 列退休;
--   C. 临时经费(credit_temp_lots)退休,只保留永久经费;临时余额一次性换算成
--      **重置次数**(见 0092),重置从「扣 120 经费」改成「扣 1 次」。
--
-- 为什么另起一张表而不是复用 credit_temp_lots:
--   两者单位不同(经费 vs 次数)。就地把 amount_remaining 的语义改成「次数」,列名会与值
--   长期不符 —— 本仓库被这个模式坑过多次(free_window_tokens 存微元、TokenStatus 存成本)。
--   新表让「每个批次一个到期日」的语义原样保留,旧表原地封存作审计与回滚兜底。
--
-- 幂等:CREATE TABLE IF NOT EXISTS + MODIFY COLUMN(重放同态)。铁律:never DROP,不清数据。
-- ============================================================================

-- ── 重置次数批次(替代临时经费批次)────────────────────────────────────────
-- 一行 = 一批次数,共享一个到期日;余量 = SUM(已生效未过期批次 count_remaining)。
-- 消耗策略与旧临时经费一致:**最近到期的先用**,避免快过期的次数白白作废。
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE IF NOT EXISTS `credit_reset_passes` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint unsigned NOT NULL,
  `count_initial` int NOT NULL DEFAULT '0' COMMENT '发放次数',
  `count_remaining` int NOT NULL DEFAULT '0' COMMENT '剩余次数(消耗时递减; 过期清扫置 0)',
  `source` varchar(32) NOT NULL DEFAULT '' COMMENT '来源: migration(临时经费换算) / admin / gift',
  `ref` varchar(64) NOT NULL DEFAULT '' COMMENT '来源引用; migration 时为 temp_lot:<原批次id>,兼作幂等键',
  `starts_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '生效时刻(<=now 即生效;预发放可填未来)',
  `expires_at` datetime NOT NULL COMMENT '失效时刻(到期即作废)',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='重置次数批次(0090; 取代临时经费)';
/*!40101 SET character_set_client = @saved_cs_client */;

-- starts_at 收敛成 NOT NULL(重放同态;CREATE TABLE IF NOT EXISTS 对已建表不生效,故显式 MODIFY)。
-- 为什么不能留 NULL:SQL 三值逻辑下 `starts_at <= now` 对 NULL 求值为 NULL = 该行被过滤掉,
-- 也就是「NULL 永不生效」——与「NULL=即时生效」的直觉正相反,是会静默吞掉用户次数的那类坑;
-- 而 Go 侧 CreditResetPass.StartsAt 是非指针 time.Time,扫到 NULL 会直接报错。两边一起收敛成 NOT NULL。
UPDATE `credit_reset_passes` SET `starts_at` = `created_at` WHERE `starts_at` IS NULL;
ALTER TABLE `credit_reset_passes`
  MODIFY COLUMN `starts_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '生效时刻(<=now 即生效;预发放可填未来)';

-- ── A: 周期天数旋钮退休(列保留,仅改注释)──────────────────────────────────
ALTER TABLE `billing_config`
  MODIFY COLUMN `subscription_period_days` int NOT NULL DEFAULT '30'
  COMMENT '[DEPRECATED 0090] 月度周期改真·自然月(+1 month),不再按天数算;列保留仅作回滚兜底';

ALTER TABLE `billing_config`
  MODIFY COLUMN `subscription_year_days` int NOT NULL DEFAULT '365'
  COMMENT '[DEPRECATED 0090] 年度周期改真·自然年(+1 year),不再按天数算;列保留仅作回滚兜底';

-- ── B: 赠送经费旋钮退休(列保留,仅改注释)──────────────────────────────────
ALTER TABLE `billing_config`
  MODIFY COLUMN `pro_grant_credits` int NOT NULL DEFAULT '600'
  COMMENT '[DEPRECATED 0090] 订阅不再赠送经费;列保留仅作历史/回滚';
ALTER TABLE `billing_config`
  MODIFY COLUMN `max_grant_credits` int NOT NULL DEFAULT '3000'
  COMMENT '[DEPRECATED 0090] 订阅不再赠送经费;列保留仅作历史/回滚';
ALTER TABLE `billing_config`
  MODIFY COLUMN `pro_year_grant_credits` int NOT NULL DEFAULT '-1'
  COMMENT '[DEPRECATED 0090] 订阅不再赠送经费;列保留仅作历史/回滚';
ALTER TABLE `billing_config`
  MODIFY COLUMN `max_year_grant_credits` int NOT NULL DEFAULT '-1'
  COMMENT '[DEPRECATED 0090] 订阅不再赠送经费;列保留仅作历史/回滚';

-- ── C: reset_cost_credits 变为「历史换算率」──────────────────────────────
-- 重置改扣次数后它不再参与运行时判定,但 0092 的换算要用它(N 经费 = 1 次),故保留取值。
ALTER TABLE `billing_config`
  MODIFY COLUMN `reset_cost_credits` int NOT NULL DEFAULT '60'
  COMMENT '[DEPRECATED 0090] 重置改扣「重置次数」,此列不再参与运行时;仅 0092 用作临时经费→次数的换算率';
