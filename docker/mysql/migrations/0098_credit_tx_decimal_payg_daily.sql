-- ============================================================================
-- 0098: 经费流水小数化 + 按量付费(payg)每日聚合行(owner 拍板 2026-07-30)
--
-- 背景:0094 起经费余额真源是 micro-credit(perm_balance_micro,经费×1e6),payg 每次
-- 扣的是小数经费;而 credit_transactions 的 amount/temp_after/perm_after 是 INT ——
-- 小数会被抹成 0,这曾是「payg 刻意不写流水」的理由。代价是用户开了「用经费继续」后
-- 余额持续下降、流水却查不到,无法对账。
--
-- 两步解决:
--   ① 金额三列 INT → DECIMAL(18,6):精度恰好覆盖 micro-credit(1e-6 经费),存量整数值
--      语义不变(600 → 600.000000),无需数据换算;MODIFY 重放同态。
--   ② payg 消耗按「每用户每天一行」聚合进流水(type='payg_daily'):新列 day_bucket(DATE)
--      + 唯一索引 (user_id, type, day_bucket),Go 侧用 INSERT ... ON DUPLICATE KEY UPDATE
--      当天累加 —— 一天最多一行,不会与 llm_token_usage 等体量膨胀。
--
-- 🔴 关于这条唯一索引与 0014/0091 的「唯一索引重放陷阱」:那个教训是**对已有数据回头加/
-- 重建唯一约束**会撞上后继写入的合法重复。这里不同:day_bucket 是本迁移新增的全 NULL 列,
-- 历史行全部 NULL(MySQL 唯一索引对 NULL 互不冲突,一行都撞不上);此后唯一的写入方
-- (ConsumeForQuota 的日聚合 upsert)以该索引为幂等键(ON DUPLICATE KEY UPDATE),
-- 唯一性由构造保证,不存在「合法重复」。
-- ============================================================================

-- ① 金额三列小数化(重放同态)
ALTER TABLE `credit_transactions`
  MODIFY COLUMN `amount` decimal(18,6) NOT NULL
  COMMENT '带符号:+入账 / -消耗。0098 起 DECIMAL(经费,6 位小数=micro 精度);历史整数值语义不变';
ALTER TABLE `credit_transactions`
  MODIFY COLUMN `temp_after` decimal(18,6) NOT NULL DEFAULT '0.000000'
  COMMENT '该笔后临时经费余额快照(0090 起临时经费退休,恒 0;列保留作历史)';
ALTER TABLE `credit_transactions`
  MODIFY COLUMN `perm_after` decimal(18,6) NOT NULL DEFAULT '0.000000'
  COMMENT '该笔后经费余额快照(0098 起 DECIMAL,= perm_balance_micro / 1e6)';

-- ② payg 每日聚合行:day_bucket 仅 type='payg_daily' 的行填(其余 NULL)
CALL add_column_if_not_exists('credit_transactions', 'day_bucket',
  "DATE NULL DEFAULT NULL COMMENT '按量付费日聚合桶(0098):仅 type=payg_daily 填,一天一行;其余流水恒 NULL'");

CALL add_index_if_not_exists('credit_transactions', 'uk_credit_tx_daily',
  '`user_id`, `type`, `day_bucket`', TRUE);
