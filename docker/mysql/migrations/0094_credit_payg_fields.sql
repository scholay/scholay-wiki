-- ============================================================================
-- 0094: 经费按量付费(pay-as-you-go)—— 兑换率 + 自动付费开关 + 经费小数化
--
-- 方案 docs/research/credit-payg-2026-07/REPORT.md(owner 拍板 2026-07-29)。
-- 经费从「只能买重置」变成**可直接消耗的额度**:周期额度用完后,按真实成本从经费扣。
--
-- 三件事:
--   ① billing_config.credit_to_points —— 1 经费 = N 算力点(动态配置,默认 5)。
--      配合 recharge_rate=60(¥1 = 60 经费)得到 ¥1 = 300 算力点,
--      比最贵的套餐档(Pro 月付)仍贵 47%,保证「买套餐比直充便宜」。
--   ② user_wallets.credit_autopay_enabled —— 额度耗尽后是否自动用经费续,**默认关**。
--   ③ user_wallets.perm_balance_micro —— 经费余额升格成 micro-credit(经费 × 1e6)。
--
-- 幂等:add_column_if_not_exists + -1 哨兵回填(与 0079 年度字段同款)+ MODIFY 重放同态。
-- 铁律:never DROP;旧 perm_balance 列冻结保留作审计/回滚。
-- ============================================================================

-- ── ① 兑换率 ────────────────────────────────────────────────────────────────
CALL add_column_if_not_exists('billing_config', 'credit_to_points', 'INT NOT NULL DEFAULT 5');

ALTER TABLE `billing_config`
  MODIFY COLUMN `credit_to_points` int NOT NULL DEFAULT '5'
  COMMENT '1 经费可兑换的算力点数(0094)。与 recharge_rate 共同决定按量付费单价;调低会使存量经费购买力下降,属溯及变更';

-- ── ② 自动付费开关(默认关)──────────────────────────────────────────────────
-- 🔴 **新列,绝不复用 auto_reset_enabled**:那列虽已不驱动行为(自动重置 2026-06 下线),
--    但历史上开过的用户残值仍是 1 —— 复用等于让这批人静默变成「自动扣费」。
CALL add_column_if_not_exists('user_wallets', 'credit_autopay_enabled', 'TINYINT(1) NOT NULL DEFAULT 0');

ALTER TABLE `user_wallets`
  MODIFY COLUMN `credit_autopay_enabled` tinyint(1) NOT NULL DEFAULT '0'
  COMMENT '周期额度用完后是否自动用经费续(0094)。默认关,须用户显式开启 —— 不知情扣费是 auto_reset 被下线的原因';

-- ── ③ 经费余额小数化:INT 经费 → BIGINT micro-credit(经费 × 1e6)─────────────
-- 为什么必须小数:额度扣的是微元,1 经费 = credit_to_points × 1000 微元 = 5,000 微元(默认),
-- 而单次 LLM 调用常只花几百微元。整数余额下,向上取整会超收 10 倍、向下取整平台白干。
--
-- 为什么存 micro-credit 而不是直接存微元:经费是**储值(钱)**,余额不能随汇率浮动。
-- 存微元的话,admin 改 credit_to_points 会连带改变用户余额本身的显示数字(600 → 750)。
--
-- 幂等:建列初值 -1 = 未回填哨兵;回填只匹配 -1;回填后把 DEFAULT 改成 0。
-- 重放时列已存在(DEFAULT 已是 0)→ add 无操作,UPDATE 匹配 0 行,MODIFY 同态。
CALL add_column_if_not_exists('user_wallets', 'perm_balance_micro', 'BIGINT NOT NULL DEFAULT -1');

UPDATE `user_wallets`
SET `perm_balance_micro` = `perm_balance` * 1000000
WHERE `perm_balance_micro` = -1;

ALTER TABLE `user_wallets`
  MODIFY COLUMN `perm_balance_micro` bigint NOT NULL DEFAULT '0'
  COMMENT '经费余额,单位 micro-credit = 经费 × 1e6(0094)。真源;perm_balance 已冻结';

ALTER TABLE `user_wallets`
  MODIFY COLUMN `perm_balance` int NOT NULL DEFAULT '0'
  COMMENT '[DEPRECATED 0094] 旧整数经费余额;已升格为 perm_balance_micro(经费×1e6)。列冻结不再读写,仅作审计/回滚';
