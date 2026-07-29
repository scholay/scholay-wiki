-- ============================================================================
-- 0092: 临时经费余额 → 重置次数(一次性换算)
--
-- 规则(owner 拍板):N 经费 = 1 次,N 取 billing_config.reset_cost_credits(现网 120);
-- **不足 N 的按 1 次算**(CEIL,不抹零);到期日沿用原批次,生效时刻也沿用
-- (预发放的下一周期批次换算后同样保持「到期才生效」)。
--
-- 幂等的做法:以 ref='temp_lot:<原批次id>' 作判重键,NOT EXISTS 才插。
-- 重放不会重复发次数;新产生的临时批次也不会有(临时经费发放入口已在代码侧全部下线)。
--
-- 🔴 这是**复制不是移动**:credit_temp_lots 原地封存不清零(铁律 never DROP / 不清数据),
--    代码侧已不再读它。因此**回滚代码必须连带回滚本迁移的数据**
--    (DELETE FROM credit_reset_passes WHERE source='migration'),否则用户会同时持有
--    旧临时经费与新重置次数 = 双份可用额度。
--
-- 只换**当前仍有价值**的批次:amount_remaining>0 且 expires_at>NOW()。
-- 已过期的临时经费本来就作废,换出来的次数也是生来过期的,只会污染余量查询。
-- ============================================================================

-- 换算率:取现网配置;配置行缺失或值非法时兜底 120(拍板值)。
SET @reset_rate := (SELECT GREATEST(reset_cost_credits, 1) FROM `billing_config` WHERE `id` = 1);
SET @reset_rate := COALESCE(@reset_rate, 120);

INSERT INTO `credit_reset_passes`
  (`user_id`, `count_initial`, `count_remaining`, `source`, `ref`, `starts_at`, `expires_at`, `created_at`)
SELECT
  l.`user_id`,
  CEIL(l.`amount_remaining` / @reset_rate),
  CEIL(l.`amount_remaining` / @reset_rate),
  'migration',
  CONCAT('temp_lot:', l.`id`),
  COALESCE(l.`starts_at`, l.`created_at`, NOW()), -- 目标列 NOT NULL:旧表历史行可能是 NULL
  l.`expires_at`,
  NOW()
FROM `credit_temp_lots` l
WHERE l.`amount_remaining` > 0
  AND l.`expires_at` > NOW()
  AND NOT EXISTS (
    SELECT 1 FROM `credit_reset_passes` p
    WHERE p.`source` = 'migration' AND p.`ref` = CONCAT('temp_lot:', l.`id`)
  );
